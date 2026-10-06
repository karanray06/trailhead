# Prediction Service

FastAPI service powered by **TabPFN** (Prior Labs) for weather-based outdoor activity prediction.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/predict/forecast` | 7-day outdoor activity forecast with anomaly detection |
| `POST` | `/predict/frost-dates` | Frost date computation for garden planning |
| `GET` | `/health` | Service health check |

## Quick Start

```bash
cd predict
pip install -r requirements.txt
uvicorn app.main:app --port 8001 --reload
```

## Example Request

```bash
curl -X POST http://localhost:8001/predict/forecast \
  -H "Content-Type: application/json" \
  -d '{"latitude": 40.71, "longitude": -74.01, "days_ahead": 7}'
```

## How It Works

1. Loads historical weather CSV (sample data or real Open-Meteo data)
2. Engineers features: day-of-year, temperature range, seasonal signals
3. Fits TabPFN on the historical data (zero-shot tabular classification)
4. For each forecast day, builds features from historical averages for that calendar period
5. TabPFN predicts probability of a "good outdoor day" + confidence
6. Anomaly detection compares predictions to historical norms (±2σ)

## TabPFN vs Traditional ML

TabPFN is ideal here because:
- **Small dataset** (~150-700 rows) — TabPFN excels where other models underfit
- **No hyperparameter tuning** — one forward pass, no training loop
- **Calibrated probabilities** — we can trust the confidence scores
- **Fast inference** — sub-second for our dataset size
