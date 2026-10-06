"""
Fetch historical weather data from the Open-Meteo Archive API.

Open-Meteo is free, open-source, no API key required.
Docs: https://open-meteo.com/en/docs/historical-weather-api

Usage:
    python fetch_openmeteo.py --lat 40.71 --lon -74.01 --start 2022-01-01 --end 2024-12-31
    python fetch_openmeteo.py --lat 51.51 --lon -0.13 --start 2023-01-01 --end 2024-12-31 --output london_weather.csv
"""

import argparse
import csv
import json
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError


OPEN_METEO_BASE = "https://archive-api.open-meteo.com/v1/archive"

DAILY_VARIABLES = [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "relative_humidity_2m_mean",
    "wind_speed_10m_max",
    "sunrise",
    "sunset",
    "daylight_duration",
]


def fetch_weather(lat: float, lon: float, start: str, end: str) -> dict:
    """Fetch daily weather data from Open-Meteo Historical API."""
    params = (
        f"latitude={lat}&longitude={lon}"
        f"&start_date={start}&end_date={end}"
        f"&daily={','.join(DAILY_VARIABLES)}"
        f"&timezone=auto"
    )
    url = f"{OPEN_METEO_BASE}?{params}"

    print(f"Fetching data from Open-Meteo...")
    print(f"  URL: {url}")

    try:
        with urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode())
    except URLError as e:
        print(f"Error fetching data: {e}", file=sys.stderr)
        sys.exit(1)

    if "error" in data:
        print(f"API error: {data['reason']}", file=sys.stderr)
        sys.exit(1)

    return data


def classify_outdoor_day(
    temp_max: float,
    temp_min: float,
    precip: float,
    humidity: float,
    wind: float,
    daylight_hours: float,
) -> int:
    """
    Simple heuristic to label a day as good for outdoor activity.
    This is what TabPFN will learn to predict from historical patterns.

    Rules (intentionally simple — TabPFN will find more nuanced patterns):
    - Not too cold (min > -5°C) and not too hot (max < 35°C)
    - Low precipitation (< 5mm)
    - Reasonable humidity (< 85%)
    - Not too windy (< 25 km/h)
    - Enough daylight (> 9 hours)
    """
    if temp_min < -5 or temp_max > 35:
        return 0
    if precip > 5:
        return 0
    if humidity > 85:
        return 0
    if wind > 25:
        return 0
    if daylight_hours < 9:
        return 0
    return 1


def extract_time(iso_string: str) -> str:
    """Extract HH:MM from ISO datetime string."""
    if not iso_string:
        return ""
    try:
        dt = datetime.fromisoformat(iso_string)
        return dt.strftime("%H:%M")
    except (ValueError, TypeError):
        return ""


def save_csv(data: dict, output_path: Path) -> int:
    """Convert Open-Meteo response to our CSV format. Returns row count."""
    daily = data["daily"]
    dates = daily["time"]
    row_count = 0

    with open(output_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "date", "temp_max_c", "temp_min_c", "precipitation_mm",
            "humidity_pct", "wind_speed_kmh", "sunrise", "sunset",
            "daylight_hours", "good_outdoor_day",
        ])

        for i, date in enumerate(dates):
            temp_max = daily["temperature_2m_max"][i]
            temp_min = daily["temperature_2m_min"][i]
            precip = daily["precipitation_sum"][i] or 0.0
            humidity = daily["relative_humidity_2m_mean"][i] or 50.0
            wind = daily["wind_speed_10m_max"][i] or 0.0
            sunrise = extract_time(daily["sunrise"][i]) if daily["sunrise"][i] else ""
            sunset = extract_time(daily["sunset"][i]) if daily["sunset"][i] else ""
            daylight_sec = daily["daylight_duration"][i] or 0
            daylight_hours = round(daylight_sec / 3600, 2)

            # Skip rows with missing critical data
            if temp_max is None or temp_min is None:
                continue

            good_day = classify_outdoor_day(
                temp_max, temp_min, precip, humidity, wind, daylight_hours
            )

            writer.writerow([
                date,
                round(temp_max, 1),
                round(temp_min, 1),
                round(precip, 1),
                round(humidity, 0),
                round(wind, 0),
                sunrise,
                sunset,
                daylight_hours,
                good_day,
            ])
            row_count += 1

    return row_count


def main():
    parser = argparse.ArgumentParser(
        description="Fetch historical weather data from Open-Meteo for Trailhead"
    )
    parser.add_argument("--lat", type=float, required=True, help="Latitude")
    parser.add_argument("--lon", type=float, required=True, help="Longitude")
    parser.add_argument("--start", required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument(
        "--output", default="weather_real.csv",
        help="Output CSV filename (default: weather_real.csv)"
    )

    args = parser.parse_args()
    output_path = Path(__file__).parent / args.output

    data = fetch_weather(args.lat, args.lon, args.start, args.end)
    row_count = save_csv(data, output_path)

    print(f"\n✓ Saved {row_count} days of weather data to {output_path}")
    print(f"  Location: ({args.lat}, {args.lon})")
    print(f"  Period: {args.start} to {args.end}")
    print(f"\nThis CSV is ready for the TabPFN prediction service.")


if __name__ == "__main__":
    main()
