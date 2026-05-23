# apps/no-cheat/client/src/components/DiceCheckCard.tsx

> Shows a detected die face ROI with its predicted pip count. User can confirm or correct.

## Prompt

Display a detected die face image (from the CV pipeline) with the predicted pip count. Show 6 buttons (1-6) for the user to confirm or override the prediction. Highlighted button shows the current prediction. On selection, calls a callback with the confirmed/corrected label. Used during calibration and recording for training data collection.
