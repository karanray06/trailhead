"""
Tests for the TabPFN weather forecast endpoint and model.

These are real tests — they validate the API contract, model output shapes,
and edge cases. Run with: pytest predict/tests/ -v
"""

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

# Add predict to path so we can import the app
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestDataLoader:
    """Test the data loading and feature engineering pipeline."""

    def test_load_sample_csv(self):
        from app.data_loader import load_weather_csv

        df = load_weather_csv()
        assert len(df) > 50, "Should load at least 50 rows of sample data"
        assert "temp_max_c" in df.columns
        assert "good_outdoor_day" in df.columns
        assert "day_of_year" in df.columns  # engineered feature
        assert "temp_range" in df.columns   # engineered feature

    def test_get_training_data_shapes(self):
        from app.data_loader import get_training_data, load_weather_csv

        df = load_weather_csv()
        X, y = get_training_data(df)
        assert X.ndim == 2, "X should be 2D"
        assert y.ndim == 1, "y should be 1D"
        assert X.shape[0] == y.shape[0], "X and y should have same number of rows"
        assert X.shape[1] == 9, "Should have 9 features"

    def test_build_forecast_features(self):
        from app.data_loader import build_forecast_features, load_weather_csv

        df = load_weather_csv()
        features, dates = build_forecast_features(df, date.today(), days_ahead=7)
        assert features.shape == (7, 9), "Should produce 7 days × 9 features"
        assert len(dates) == 7
        assert dates[0] == date.today()
        assert dates[-1] == date.today() + timedelta(days=6)

    def test_compute_frost_dates(self):
        from app.data_loader import compute_frost_dates, load_weather_csv

        df = load_weather_csv()
        result = compute_frost_dates(df, 2024)
        assert "last_spring_frost" in result
        assert "first_fall_frost" in result
        assert "growing_season_days" in result
        assert "frost_free_now" in result
        # Spring frost should be before fall frost
        if result["last_spring_frost"] and result["first_fall_frost"]:
            assert result["last_spring_frost"] < result["first_fall_frost"]
            assert result["growing_season_days"] > 0

    def test_detect_anomalies(self):
        from app.data_loader import (
            build_forecast_features,
            detect_anomalies,
            load_weather_csv,
        )

        df = load_weather_csv()
        features, dates = build_forecast_features(df, date.today(), days_ahead=7)
        anomalies = detect_anomalies(df, features, dates)
        assert len(anomalies) == 7, "Should have one anomaly entry per forecast day"
        for a in anomalies:
            assert "is_anomaly" in a
            assert "description" in a


class TestWeatherPredictor:
    """Test the TabPFN/sklearn model wrapper."""

    def test_model_loads(self):
        from app.tabpfn_model import WeatherPredictor

        predictor = WeatherPredictor()
        assert predictor.data_rows > 50
        assert predictor.model_name in ("TabPFN", "RandomForest (fallback)")

    def test_forecast_returns_valid_response(self):
        from app.tabpfn_model import WeatherPredictor

        predictor = WeatherPredictor()
        result = predictor.forecast(40.71, -74.01, days_ahead=7)
        assert len(result.days) == 7
        for day in result.days:
            assert 0 <= day.good_outdoor_probability <= 1
            assert 0 <= day.confidence <= 1
            assert day.predicted_temp_max_c > day.predicted_temp_min_c
        assert result.best_day is not None
        assert result.best_day.good_outdoor_probability >= max(
            d.good_outdoor_probability for d in result.days
        ) - 0.001  # floating point tolerance

    def test_forecast_custom_date(self):
        from app.tabpfn_model import WeatherPredictor

        predictor = WeatherPredictor()
        target = date(2024, 6, 15)  # mid-summer
        result = predictor.forecast(40.71, -74.01, target_date=target, days_ahead=3)
        assert len(result.days) == 3
        assert result.days[0].date == target

    def test_frost_dates_response(self):
        from app.tabpfn_model import WeatherPredictor

        predictor = WeatherPredictor()
        result = predictor.get_frost_dates(40.71, -74.01, year=2024)
        assert result.year == 2024
        assert result.location == "(40.71, -74.01)"


class TestSchemas:
    """Test Pydantic schema validation."""

    def test_forecast_request_defaults(self):
        from app.schemas import ForecastRequest

        req = ForecastRequest(latitude=40.71, longitude=-74.01)
        assert req.days_ahead == 7
        assert req.target_date is None

    def test_forecast_request_validation(self):
        from app.schemas import ForecastRequest

        # Latitude out of range
        with pytest.raises(Exception):
            ForecastRequest(latitude=100, longitude=0)

        # Days ahead out of range
        with pytest.raises(Exception):
            ForecastRequest(latitude=40, longitude=-74, days_ahead=30)

    def test_day_forecast_bounds(self):
        from app.schemas import DayForecast

        # Probability out of bounds
        with pytest.raises(Exception):
            DayForecast(
                date=date.today(),
                good_outdoor_probability=1.5,
                predicted_temp_max_c=20,
                predicted_temp_min_c=10,
                predicted_precipitation_mm=0,
                confidence=0.8,
            )
