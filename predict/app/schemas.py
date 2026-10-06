"""
Pydantic schemas for the TabPFN weather prediction service.
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    """Request body for the /predict/forecast endpoint."""

    latitude: float = Field(..., ge=-90, le=90, description="Location latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Location longitude")
    target_date: Optional[date] = Field(
        None,
        description="Date to forecast for (default: today). Format: YYYY-MM-DD",
    )
    days_ahead: int = Field(
        7,
        ge=1,
        le=14,
        description="Number of days to forecast (default: 7)",
    )


class DayForecast(BaseModel):
    """Prediction for a single day."""

    date: date
    good_outdoor_probability: float = Field(
        ..., ge=0, le=1,
        description="Probability that this is a good day for outdoor activity (0-1)",
    )
    predicted_temp_max_c: float = Field(..., description="Predicted high temperature (°C)")
    predicted_temp_min_c: float = Field(..., description="Predicted low temperature (°C)")
    predicted_precipitation_mm: float = Field(..., description="Predicted rainfall (mm)")
    is_anomaly: bool = Field(
        False,
        description="True if this day has unusual weather (cold snap, frost risk, heat wave)",
    )
    anomaly_description: Optional[str] = Field(
        None,
        description="Human-readable description of the anomaly, if any",
    )
    confidence: float = Field(
        ..., ge=0, le=1,
        description="Model confidence in the prediction (0-1)",
    )


class ForecastResponse(BaseModel):
    """Response from the /predict/forecast endpoint."""

    location: str = Field(..., description="Location description")
    latitude: float
    longitude: float
    generated_at: str = Field(..., description="ISO timestamp of when this forecast was generated")
    days: list[DayForecast] = Field(..., description="Forecast for each requested day")
    best_day: Optional[DayForecast] = Field(
        None,
        description="The single best day for outdoor activity in the forecast window",
    )
    frost_risk_days: list[date] = Field(
        default_factory=list,
        description="Dates with predicted frost risk (min temp near or below 0°C)",
    )
    model_info: str = Field(
        "TabPFN v2 (Prior Labs)",
        description="Model used for predictions",
    )


class FrostDatesRequest(BaseModel):
    """Request body for the /predict/frost-dates endpoint."""

    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    year: Optional[int] = Field(None, description="Year to compute frost dates for (default: current)")


class FrostDatesResponse(BaseModel):
    """Response from the /predict/frost-dates endpoint."""

    location: str
    year: int
    last_spring_frost: Optional[date] = Field(
        None,
        description="Estimated last frost date in spring",
    )
    first_fall_frost: Optional[date] = Field(
        None,
        description="Estimated first frost date in fall",
    )
    growing_season_days: Optional[int] = Field(
        None,
        description="Number of frost-free days between last spring and first fall frost",
    )
    frost_free_now: bool = Field(
        ...,
        description="Whether today falls in the frost-free growing season",
    )


class HealthResponse(BaseModel):
    """Response from the /health endpoint."""

    status: str = "ok"
    model: str = "TabPFN"
    data_rows: int = Field(..., description="Number of training data rows loaded")
    version: str = "0.1.0"
