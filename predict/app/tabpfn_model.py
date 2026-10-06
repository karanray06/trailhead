"""
TabPFN-based weather prediction model for Trailhead.

Uses TabPFN (Prior Labs) — a tabular foundation model that works great
on small datasets without hyperparameter tuning. Perfect for our use case:
a few hundred rows of historical weather data → 7-day outdoor forecast.

TabPFN key features:
- Zero-shot learning on tabular data (no training loop needed)
- Works well with small datasets (100-10,000 rows)
- Provides calibrated probability estimates
- Fast inference (single forward pass)
"""

import logging
from datetime import date, datetime
from typing import Optional

import numpy as np

from .data_loader import (
    FEATURE_COLS,
    build_forecast_features,
    compute_frost_dates,
    detect_anomalies,
    get_training_data,
    load_weather_csv,
)
from .schemas import (
    DayForecast,
    ForecastResponse,
    FrostDatesResponse,
)

logger = logging.getLogger(__name__)

# Try to import TabPFN — fall back to sklearn if not available (for development)
try:
    from tabpfn import TabPFNClassifier

    TABPFN_AVAILABLE = True
    logger.info("TabPFN loaded successfully")
except ImportError:
    logger.warning(
        "TabPFN not available, falling back to sklearn RandomForestClassifier. "
        "Install TabPFN for production: pip install tabpfn"
    )
    from sklearn.ensemble import RandomForestClassifier

    TABPFN_AVAILABLE = False


class WeatherPredictor:
    """
    Wraps TabPFN for weather-based outdoor day prediction.

    Loads historical weather data, fits TabPFN, and provides:
    - 7-day outdoor probability forecast
    - Anomaly detection (cold snaps, frost risk, heat waves)
    - Frost date computation for garden planning
    """

    def __init__(self, csv_path: Optional[str] = None):
        self.df = load_weather_csv(csv_path)
        self.X_train, self.y_train = get_training_data(self.df)
        self.model = self._create_model()
        self._fit()

        logger.info(
            f"WeatherPredictor initialized: {len(self.df)} rows, "
            f"model={'TabPFN' if TABPFN_AVAILABLE else 'RandomForest (fallback)'}"
        )

    def _create_model(self):
        """Create the prediction model."""
        if TABPFN_AVAILABLE:
            return TabPFNClassifier(
                device="cpu",
                N_ensemble_configurations=16,
            )
        else:
            return RandomForestClassifier(
                n_estimators=100,
                random_state=42,
                max_depth=8,
            )

    def _fit(self):
        """Fit the model on training data."""
        logger.info(f"Fitting model on {len(self.X_train)} samples...")
        self.model.fit(self.X_train, self.y_train)
        logger.info("Model fitted successfully")

    def forecast(
        self,
        latitude: float,
        longitude: float,
        target_date: Optional[date] = None,
        days_ahead: int = 7,
    ) -> ForecastResponse:
        """
        Generate a multi-day outdoor forecast.

        Args:
            latitude: Location latitude
            longitude: Location longitude
            target_date: Start date (default: today)
            days_ahead: Number of days to forecast

        Returns:
            ForecastResponse with daily predictions, best day, and frost risk
        """
        if target_date is None:
            target_date = date.today()

        # Build feature vectors for forecast dates
        forecast_features, forecast_dates = build_forecast_features(
            self.df, target_date, days_ahead
        )

        # Get predictions and probabilities
        predictions = self.model.predict(forecast_features)
        probabilities = self.model.predict_proba(forecast_features)

        # Detect anomalies
        anomalies = detect_anomalies(self.df, forecast_features, forecast_dates)

        # Build response
        days = []
        frost_risk_dates = []

        for i, (fdate, features, prob, anomaly) in enumerate(
            zip(forecast_dates, forecast_features, probabilities, anomalies)
        ):
            # prob shape depends on classifier — get probability of class 1 (good day)
            good_prob = float(prob[1]) if len(prob) > 1 else float(prob[0])

            # Calculate confidence based on how decisive the prediction is
            confidence = abs(good_prob - 0.5) * 2  # 0.5 → 0, 1.0 → 1.0

            day_forecast = DayForecast(
                date=fdate,
                good_outdoor_probability=round(good_prob, 3),
                predicted_temp_max_c=round(float(features[0]), 1),
                predicted_temp_min_c=round(float(features[1]), 1),
                predicted_precipitation_mm=round(float(features[2]), 1),
                is_anomaly=anomaly["is_anomaly"],
                anomaly_description=anomaly["description"],
                confidence=round(confidence, 3),
            )
            days.append(day_forecast)

            # Track frost risk
            if features[1] <= 0:  # temp_min_c
                frost_risk_dates.append(fdate)

        # Find best day
        best_day = max(days, key=lambda d: d.good_outdoor_probability) if days else None

        return ForecastResponse(
            location=f"({latitude:.2f}, {longitude:.2f})",
            latitude=latitude,
            longitude=longitude,
            generated_at=datetime.utcnow().isoformat() + "Z",
            days=days,
            best_day=best_day,
            frost_risk_days=frost_risk_dates,
        )

    def get_frost_dates(
        self,
        latitude: float,
        longitude: float,
        year: Optional[int] = None,
    ) -> FrostDatesResponse:
        """
        Compute frost dates for garden planning.

        Args:
            latitude: Location latitude
            longitude: Location longitude
            year: Year to compute for (default: current)

        Returns:
            FrostDatesResponse with spring/fall frost dates and growing season
        """
        if year is None:
            year = date.today().year

        frost_data = compute_frost_dates(self.df, year)

        return FrostDatesResponse(
            location=f"({latitude:.2f}, {longitude:.2f})",
            year=year,
            last_spring_frost=frost_data["last_spring_frost"],
            first_fall_frost=frost_data["first_fall_frost"],
            growing_season_days=frost_data["growing_season_days"],
            frost_free_now=frost_data["frost_free_now"],
        )

    @property
    def data_rows(self) -> int:
        """Number of training data rows."""
        return len(self.df)

    @property
    def model_name(self) -> str:
        """Name of the model in use."""
        return "TabPFN" if TABPFN_AVAILABLE else "RandomForest (fallback)"
