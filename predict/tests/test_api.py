"""
Tests for the FastAPI prediction service endpoints.

Run with: pytest predict/tests/ -v
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.main import app


@pytest.fixture
def client():
    """Create a test client with model loaded."""
    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["data_rows"] > 0
        assert "model" in data

    def test_health_response_schema(self, client):
        response = client.get("/health")
        data = response.json()
        assert "version" in data
        assert data["version"] == "0.1.0"


class TestForecastEndpoint:
    def test_forecast_basic(self, client):
        response = client.post(
            "/predict/forecast",
            json={"latitude": 40.71, "longitude": -74.01},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["days"]) == 7  # default days_ahead
        assert data["best_day"] is not None
        assert "frost_risk_days" in data
        assert data["model_info"] == "TabPFN v2 (Prior Labs)"

    def test_forecast_custom_days(self, client):
        response = client.post(
            "/predict/forecast",
            json={"latitude": 51.51, "longitude": -0.13, "days_ahead": 3},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["days"]) == 3

    def test_forecast_with_date(self, client):
        response = client.post(
            "/predict/forecast",
            json={
                "latitude": 40.71,
                "longitude": -74.01,
                "target_date": "2024-07-15",
                "days_ahead": 5,
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["days"][0]["date"] == "2024-07-15"

    def test_forecast_probabilities_in_range(self, client):
        response = client.post(
            "/predict/forecast",
            json={"latitude": 40.71, "longitude": -74.01, "days_ahead": 7},
        )
        data = response.json()
        for day in data["days"]:
            assert 0 <= day["good_outdoor_probability"] <= 1
            assert 0 <= day["confidence"] <= 1

    def test_forecast_invalid_latitude(self, client):
        response = client.post(
            "/predict/forecast",
            json={"latitude": 200, "longitude": -74.01},
        )
        assert response.status_code == 422  # validation error

    def test_forecast_invalid_days(self, client):
        response = client.post(
            "/predict/forecast",
            json={"latitude": 40, "longitude": -74, "days_ahead": 30},
        )
        assert response.status_code == 422


class TestFrostDatesEndpoint:
    def test_frost_dates_basic(self, client):
        response = client.post(
            "/predict/frost-dates",
            json={"latitude": 40.71, "longitude": -74.01},
        )
        assert response.status_code == 200
        data = response.json()
        assert "last_spring_frost" in data
        assert "first_fall_frost" in data
        assert "growing_season_days" in data
        assert "frost_free_now" in data

    def test_frost_dates_with_year(self, client):
        response = client.post(
            "/predict/frost-dates",
            json={"latitude": 40.71, "longitude": -74.01, "year": 2024},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["year"] == 2024

    def test_frost_dates_spring_before_fall(self, client):
        response = client.post(
            "/predict/frost-dates",
            json={"latitude": 40.71, "longitude": -74.01, "year": 2024},
        )
        data = response.json()
        if data["last_spring_frost"] and data["first_fall_frost"]:
            assert data["last_spring_frost"] < data["first_fall_frost"]
            assert data["growing_season_days"] > 0
