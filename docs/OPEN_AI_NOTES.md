# Why Open AI Matters for Trailhead

> This document answers the challenge prompt: "Tell us why open innovation matters
> for what you built."

## The Core Argument

Trailhead is an outdoor companion. Its entire purpose is getting you *away from the screen
and off the network*. A closed-API approach fundamentally contradicts that goal.

### 1. Works With No Internet

You're on a trail. You have no signal. With a closed API (GPT-4, Claude), the app is dead.

With open weights (Gemma via Ollama):
- The model runs on your phone/laptop
- TabPFN inference happens locally against cached weather data
- Voice falls back to browser SpeechSynthesis
- Routes and checklists are cached in IndexedDB

**The app works exactly where you need it most: outside, away from infrastructure.**

### 2. Your Data Stays On Your Device

Trailhead knows:
- Where you live
- Where you hike
- Your daily routine (when you go outside)
- Your garden layout
- Your fitness level

With a closed API, all of this goes to someone else's server. With open models running
locally, none of it leaves your device. Ever.

### 3. Model Is Swappable

One env var (`MODEL_NAME`) swaps the entire reasoning layer:

```bash
MODEL_NAME=gemma3:4b    # Fast, fits in 4GB RAM
MODEL_NAME=gemma3:12b   # Better reasoning, needs 8GB
MODEL_NAME=gemma3:27b   # Best quality, needs 16GB
MODEL_NAME=llama3.2:3b  # Different model family entirely
```

This means:
- Users pick the model that fits their hardware
- No vendor lock-in
- Can fine-tune for regional knowledge (local trails, native plants)
- Community can contribute better models

### 4. Zero Running Cost

| | Open (Trailhead) | Closed API |
|---|---|---|
| Per-day cost | $0 | ~$0.05-0.15 (GPT-4) |
| Monthly (daily use) | $0 | $1.50-4.50 |
| Yearly | $0 | $18-54 |
| 1000 users/year | $0 | $18,000-54,000 |

For an app you use every single day, this adds up fast.

## Honest Comparison: Open vs Closed

| Dimension | Open (Gemma local) | Closed (GPT-4 API) |
|---|---|---|
| **Latency (first token)** | 2-8s (CPU), <1s (GPU) | 0.5-2s |
| **Answer quality** | Good for structured tasks | Slightly better reasoning |
| **Offline** | ✅ Full functionality | ❌ Dead |
| **Privacy** | ✅ Nothing leaves device | ❌ All data sent to API |
| **Cost per request** | $0 | $0.01-0.05 |
| **Model swappable** | ✅ One env var | ❌ Locked to provider |
| **Fine-tunable** | ✅ LoRA/QLoRA | ❌ Not for most models |
| **Hardware needed** | 4-16GB RAM | Just an API key |
| **Setup complexity** | `ollama pull gemma3:4b` | Get API key, add billing |

### Where Open Wins

1. **Offline reliability** — the killer feature for an outdoor app
2. **Privacy** — location data never leaves the device
3. **Cost** — free forever, not $0.05/day
4. **Customization** — fine-tune for your region's trails, plants, birds

### Where Closed Wins (honestly)

1. **First-token latency on CPU** — GPT-4 is faster if you have internet
2. **Reasoning on complex multi-step queries** — marginal advantage
3. **Zero setup** — no model download needed

### Our Take

For Trailhead's use case, open wins decisively. The daily brief is a structured task
(weather → activity → route → script) that Gemma handles well. The offline requirement
alone makes closed APIs a non-starter. And the privacy win is real — you shouldn't have
to send your location to a cloud API just to find out if it's a good day for birding.

## TabPFN: Open-Source Tabular ML

[TabPFN](https://github.com/PriorLabs/TabPFN) deserves a special mention. It's a
foundation model for tabular data from Prior Labs — open-source, works great on small
datasets, and provides calibrated probabilities without hyperparameter tuning.

For our weather prediction task:
- ~150-700 rows of historical weather data
- 9 features → binary classification ("good outdoor day")
- TabPFN fits in one forward pass, no training loop
- Probabilities are well-calibrated (important for "how confident are we?")
- Falls back to sklearn if TabPFN isn't installed

This is exactly the kind of task where tabular foundation models shine — and where
traditional deep learning would overfit on such a small dataset.

## Mastra: Open-Source Agent Framework

[Mastra](https://mastra.ai) is an open-source TypeScript agent framework. We use it for:
- Agent orchestration (tools, memory, workflows)
- Connecting to Ollama (local LLM provider)
- Structured tool calls (weather forecast, route building, checklists)
- Memory (remembering user preferences and past outings)

Being open-source means we can inspect how it handles tool calls, customize the
orchestration logic, and contribute back fixes.
