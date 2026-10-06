"""
Data loader for the TabPFN weather prediction service.

Loads CSV weather data and prepares feature matrices for TabPFN.
"""

import os
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd


# Feature columns used by the model
FEATURE_COLS = [
    "temp_max_c",
    "temp_min_c",
    "precipitation_mm",
    "humidity_pct",
    "wind_speed_kmh",
    "daylight_hours",
    "day_of_year",      # cyclical seasonal signal
    "month",
    "temp_range",       # max - min (engineered feature)
]

TARGET_COL = "good_outdoor_day"

# Default data path
DEFAULT_CSV = Path(__file__).parent.parent.parent / "data" / "weather_sample.csv"


def load_weather_csv(csv_path: Optional[str] = None) -> pd.DataFrame:
    """
    Load and preprocess weather CSV data.

    Args:
        csv_path: Path to the CSV file. Falls back to env var WEATHER_CSV_PATH,
                  then to the sample data.

    Returns:
        Preprocessed DataFrame with engineered features.
    """
    path = csv_path or os.getenv("WEATHER_CSV_PATH") or str(DEFAULT_CSV)
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(
            f"Weather CSV not found at {path}. "
            f"Run 'python data/fetch_openmeteo.py' to generate real data, "
            f"or check that weather_sample.csv exists."
        )

    df = pd.read_csv(path, comment="#")

    # Parse dates
    df["date"] = pd.to_datetime(df["date"])

    # Engineer features
    df["day_of_year"] = df["date"].dt.dayofyear
    df["month"] = df["date"].dt.month
    df["temp_range"] = df["temp_max_c"] - df["temp_min_c"]

    # Drop rows with missing critical values
    df = df.dropna(subset=["temp_max_c", "temp_min_c", TARGET_COL])

    # Fill other NaN values with reasonable defaults
    df["precipitation_mm"] = df["precipitation_mm"].fillna(0)
    df["humidity_pct"] = df["humidity_pct"].fillna(50)
    df["wind_speed_kmh"] = df["wind_speed_kmh"].fillna(10)
    df["daylight_hours"] = df["daylight_hours"].fillna(12)

    return df


def get_training_data(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Extract feature matrix X and target vector y from the DataFrame.

    Returns:
        Tuple of (X, y) numpy arrays.
    """
    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df[TARGET_COL].values.astype(np.int64)
    return X, y


def build_forecast_features(
    df: pd.DataFrame,
    target_date: date,
    days_ahead: int = 7,
) -> tuple[np.ndarray, list[date]]:
    """
    Build feature vectors for future dates based on historical averages for
    the same calendar period, plus trend information.

    For each target date, we look at what weather looked like on the same
    day-of-year in previous years and use those statistics as features.

    Returns:
        Tuple of (feature_matrix, list_of_dates)
    """
    forecast_dates = [target_date + timedelta(days=i) for i in range(days_ahead)]
    features_list = []

    for fdate in forecast_dates:
        doy = fdate.timetuple().tm_yday

        # Get historical data for a window around this day-of-year (±7 days)
        window = df[
            (df["day_of_year"] >= doy - 7) & (df["day_of_year"] <= doy + 7)
        ]

        if len(window) == 0:
            # Fallback to monthly averages
            window = df[df["month"] == fdate.month]

        if len(window) == 0:
            # Fallback to overall averages
            window = df

        features = np.array([
            window["temp_max_c"].mean(),
            window["temp_min_c"].mean(),
            window["precipitation_mm"].mean(),
            window["humidity_pct"].mean(),
            window["wind_speed_kmh"].mean(),
            window["daylight_hours"].mean(),
            float(doy),
            float(fdate.month),
            window["temp_range"].mean(),
        ], dtype=np.float32)

        features_list.append(features)

    return np.array(features_list), forecast_dates


def compute_frost_dates(df: pd.DataFrame, year: Optional[int] = None) -> dict:
    """
    Compute estimated frost dates from historical data.

    Frost = day where temp_min_c <= 0°C.

    Returns dict with last_spring_frost, first_fall_frost, growing_season_days.
    """
    if year is None:
        year = date.today().year

    # Look at all historical years for the pattern
    df_copy = df.copy()
    df_copy["year"] = df_copy["date"].dt.year
    df_copy["is_frost"] = df_copy["temp_min_c"] <= 0

    # Average frost dates across years
    spring_frost_doys = []
    fall_frost_doys = []

    for yr in df_copy["year"].unique():
        year_data = df_copy[df_copy["year"] == yr]

        # Spring: last frost day before July (doy < 182)
        spring_frosts = year_data[(year_data["is_frost"]) & (year_data["day_of_year"] < 182)]
        if len(spring_frosts) > 0:
            spring_frost_doys.append(spring_frosts["day_of_year"].max())

        # Fall: first frost day after July (doy >= 182)
        fall_frosts = year_data[(year_data["is_frost"]) & (year_data["day_of_year"] >= 182)]
        if len(fall_frosts) > 0:
            fall_frost_doys.append(fall_frosts["day_of_year"].min())

    result = {
        "last_spring_frost": None,
        "first_fall_frost": None,
        "growing_season_days": None,
        "frost_free_now": True,
    }

    if spring_frost_doys:
        avg_spring_doy = int(np.mean(spring_frost_doys))
        result["last_spring_frost"] = (
            datetime(year, 1, 1) + timedelta(days=avg_spring_doy - 1)
        ).date()

    if fall_frost_doys:
        avg_fall_doy = int(np.mean(fall_frost_doys))
        result["first_fall_frost"] = (
            datetime(year, 1, 1) + timedelta(days=avg_fall_doy - 1)
        ).date()

    if result["last_spring_frost"] and result["first_fall_frost"]:
        result["growing_season_days"] = (
            result["first_fall_frost"] - result["last_spring_frost"]
        ).days

        today = date.today()
        result["frost_free_now"] = (
            result["last_spring_frost"] <= today <= result["first_fall_frost"]
        )

    return result


def detect_anomalies(
    df: pd.DataFrame,
    forecast_features: np.ndarray,
    forecast_dates: list[date],
) -> list[dict]:
    """
    Detect weather anomalies in forecast data by comparing to historical
    statistics for the same period.

    Returns a list of anomaly descriptions for each forecast date.
    """
    anomalies = []

    for i, (features, fdate) in enumerate(zip(forecast_features, forecast_dates)):
        doy = fdate.timetuple().tm_yday
        anomaly = {"is_anomaly": False, "description": None}

        # Get historical stats for this day-of-year window
        window = df[
            (df["day_of_year"] >= doy - 14) & (df["day_of_year"] <= doy + 14)
        ]
        if len(window) < 5:
            anomalies.append(anomaly)
            continue

        temp_max_mean = window["temp_max_c"].mean()
        temp_max_std = window["temp_max_c"].std()
        temp_min_mean = window["temp_min_c"].mean()
        temp_min_std = window["temp_min_c"].std()
        precip_mean = window["precipitation_mm"].mean()
        precip_std = window["precipitation_mm"].std()

        predicted_temp_max = features[0]
        predicted_temp_min = features[1]
        predicted_precip = features[2]

        descriptions = []

        # Cold snap: temp much below normal
        if temp_max_std > 0 and predicted_temp_max < temp_max_mean - 2 * temp_max_std:
            descriptions.append(
                f"Unusual cold: {predicted_temp_max:.0f}°C vs typical {temp_max_mean:.0f}°C"
            )

        # Heat wave: temp much above normal
        if temp_max_std > 0 and predicted_temp_max > temp_max_mean + 2 * temp_max_std:
            descriptions.append(
                f"Unusual heat: {predicted_temp_max:.0f}°C vs typical {temp_max_mean:.0f}°C"
            )

        # Frost risk
        if predicted_temp_min <= 0 and temp_min_mean > 2:
            descriptions.append(
                f"Frost risk: {predicted_temp_min:.0f}°C min — protect tender plants"
            )

        # Heavy rain
        if precip_std > 0 and predicted_precip > precip_mean + 2 * precip_std:
            descriptions.append(
                f"Heavy rain expected: {predicted_precip:.0f}mm vs typical {precip_mean:.0f}mm"
            )

        if descriptions:
            anomaly["is_anomaly"] = True
            anomaly["description"] = "; ".join(descriptions)

        anomalies.append(anomaly)

    return anomalies
