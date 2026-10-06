# Data Directory

## Sample Data

`weather_sample.csv` — **SAMPLE DATA, NOT REAL OBSERVATIONS.**  
Generated for development and demo purposes. Contains 2 years of synthetic daily weather
data for the New York City area with these columns:

| Column | Description |
|---|---|
| `date` | ISO date |
| `temp_max_c` | Daily high temperature (°C) |
| `temp_min_c` | Daily low temperature (°C) |
| `precipitation_mm` | Total rainfall (mm) |
| `humidity_pct` | Average relative humidity (%) |
| `wind_speed_kmh` | Average wind speed (km/h) |
| `sunrise` | Sunrise time (HH:MM) |
| `sunset` | Sunset time (HH:MM) |
| `daylight_hours` | Hours of daylight |
| `good_outdoor_day` | Binary label: 1 = good for outdoor activity, 0 = not |

## Fetching Real Data

Use the Open-Meteo Historical Weather API (free, no API key needed):

```bash
python fetch_openmeteo.py --lat 40.71 --lon -74.01 --start 2022-01-01 --end 2024-12-31
```

This produces a CSV in the same format that TabPFN can consume.
