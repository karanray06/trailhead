"""
Trailhead Prediction Service — FastAPI app powered by TabPFN.

Endpoints:
  POST /predict/forecast     — 7-day outdoor activity forecast
  POST /predict/frost-dates  — Frost date computation for garden planning
  GET  /health               — Service health check
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    ForecastRequest,
    ForecastResponse,
    FrostDatesRequest,
    FrostDatesResponse,
    HealthResponse,
)
from .tabpfn_model import WeatherPredictor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Global model instance — loaded once at startup
predictor: WeatherPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model on startup, clean up on shutdown."""
    global predictor
    csv_path = os.getenv("WEATHER_CSV_PATH")
    logger.info("Loading weather prediction model...")
    start = time.time()
    try:
        predictor = WeatherPredictor(csv_path=csv_path)
        elapsed = time.time() - start
        logger.info(
            f"Model loaded in {elapsed:.2f}s — "
            f"{predictor.data_rows} rows, using {predictor.model_name}"
        )
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise
    yield
    logger.info("Shutting down prediction service")


app = FastAPI(
    title="Trailhead Prediction Service",
    description=(
        "Weather-based outdoor activity forecasting powered by TabPFN. "
        "Part of the Trailhead offline-first outdoor companion."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow the frontend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Service health check."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return HealthResponse(
        status="ok",
        model=predictor.model_name,
        data_rows=predictor.data_rows,
    )


@app.post("/predict/forecast", response_model=ForecastResponse)
async def forecast(request: ForecastRequest):
    """
    Generate a multi-day outdoor activity forecast.

    Uses TabPFN to predict "good outdoor day" probability for each day,
    based on historical weather patterns for the location's latitude.
    Also detects weather anomalies (cold snaps, frost risk, heat waves).
    """
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start = time.time()

    try:
        result = predictor.forecast(
            latitude=request.latitude,
            longitude=request.longitude,
            target_date=request.target_date or date.today(),
            days_ahead=request.days_ahead,
        )
    except Exception as e:
        logger.error(f"Forecast error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")

    elapsed = time.time() - start
    logger.info(
        f"Forecast generated in {elapsed:.3f}s — "
        f"{request.days_ahead} days for ({request.latitude}, {request.longitude})"
    )

    return result


@app.post("/predict/frost-dates", response_model=FrostDatesResponse)
async def frost_dates(request: FrostDatesRequest):
    """
    Compute frost dates for garden planning.

    Analyzes historical weather data to estimate:
    - Last spring frost date
    - First fall frost date
    - Growing season length
    - Whether today is frost-free
    """
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        result = predictor.get_frost_dates(
            latitude=request.latitude,
            longitude=request.longitude,
            year=request.year,
        )
    except Exception as e:
        logger.error(f"Frost dates error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Frost dates failed: {str(e)}")

    return result


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PREDICT_PORT", "8001"))
    uvicorn.run("predict.app.main:app", host="0.0.0.0", port=port, reload=True)
