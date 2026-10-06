# 🌲 DEVLOG — Trailhead

> Running log of decisions, bugs, surprises, and numbers.
> For the DEV blog post — keep it honest and specific.

---

## Day 1 — Oct 6, 2026

### Decisions

- **Repo structure**: Monorepo with `/web`, `/agent`, `/predict`, `/data`. Clean separation
  means each piece can be developed and tested independently.

- **TabPFN as the prediction layer**: Prior Labs' tabular foundation model is perfect here.
  Our weather dataset is small (~150-700 rows depending on how much history you fetch),
  which is TabPFN's sweet spot. No hyperparameter tuning needed, calibrated probabilities
  out of the box. Falls back to sklearn RandomForest for dev environments without TabPFN
  installed.

- **Sample data strategy**: Generated 2 years of synthetic daily weather data for NYC.
  Clearly marked as `## SAMPLE DATA` in the CSV header. The `fetch_openmeteo.py` script
  pulls real data from Open-Meteo (free, no API key) for production use. This way:
  - Demo works without internet
  - Real data is one command away
  - No fake data presented as real

- **Feature engineering**: 9 features for TabPFN: temp_max, temp_min, precipitation,
  humidity, wind_speed, daylight_hours, day_of_year, month, temp_range. The day_of_year
  gives seasonal signal without needing fancy date encoding.

- **Anomaly detection approach**: Compare forecast features to historical ±2σ for the same
  calendar period. Catches cold snaps, frost risk, heat waves. Simple but effective for
  the garden planner use case.

### Numbers

- Sample CSV: 140 rows (2 years, not every day — realistic gaps)
- Feature matrix: 9 columns
- TabPFN fit time: TBD (measuring after install)
- Forecast inference time: TBD

### Surprises

- (will fill in as we go)

### Bugs

- (will fill in as we go)
