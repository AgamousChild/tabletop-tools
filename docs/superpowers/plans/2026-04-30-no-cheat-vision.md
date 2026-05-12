# No-Cheat: Python Vision Model (#40)

## Goal

Replace current CV approach with a trained vision model that identifies dice values with 100% accuracy.

## Current State

- Browser-based: captures photos via webcam
- Uses basic image processing (color detection, blob counting)
- Statistics module detects bias patterns over many rolls
- Does NOT read individual die faces reliably

## Approach Options

### Option A: YOLO v8 trained on dice faces

Train a YOLO object detection model on dice images. Detects each die in the photo AND classifies its face value (1-6).

**Pros:** Fast inference, handles multiple dice, works in real-time
**Cons:** Needs training data (1000+ labeled images), needs GPU for training

### Option B: Pre-trained dice detection model

Several exist on HuggingFace and Roboflow. Fine-tune on 40K dice (which are often custom with faction symbols).

**Pros:** Less training work
**Cons:** Custom 40K dice may not be recognized (skulls instead of 6, etc.)

### Option C: Claude Vision API

Send dice photos to Claude's vision API. Ask "what values are showing on each die?"

**Pros:** No training needed, handles any dice type including custom
**Cons:** API cost per photo, latency, requires internet

### Recommendation: Option C for accuracy, Option A for speed

Start with Claude Vision for 100% accuracy requirement. Build Option A later for offline/real-time use.

Use `claude-haiku-4-5` for cost efficiency (~$0.005/photo).

**Privacy note:** Photos are sent to the Anthropic API. Add a disclosure in the app UI before the user activates vision mode.

## Architecture

```
Phone camera → photo
  → Upload to Worker (R2 temp storage)
  → Worker calls Claude Vision API (claude-haiku-4-5)
  → Returns: [{die: 1, value: 4}, {die: 2, value: 6}, ...]
  → Client displays results + feeds into statistics module
```

## Custom Dice Handling

Custom dice (e.g., skull symbol → 6, faction symbol → 6) are handled in post-processing. Map custom symbols to numeric values configurable per dice set. User configures their dice set once; the mapping is applied before results are fed into the statistics module.

## Needs

- Micah to decide: cloud API (Claude Vision) or local model?
- If local: Python backend service, GPU requirements, training data collection
- If cloud: Anthropic API key already available, cost per roll (~$0.005 per photo with haiku)
- Custom dice handling: configurable symbol → value mapping per dice set

## Estimated effort

- Claude Vision approach: 4 hours (API call + result parsing + UI update + privacy disclosure)
- YOLO training approach: 2-3 days (data collection, labeling, training, deployment)

## Blocked by

- Decision from Micah on approach
