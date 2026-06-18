# apps/no-cheat/client/src/lib/getMainCamera.ts

> Smart camera selection — picks the main rear camera on phones with multiple lenses.

## Prompt

Write a function `getMainCamera(): Promise<MediaStream>` that reliably opens the main rear camera on multi-camera phones (avoiding ultra-wide and telephoto lenses).

### Strategy

1. Open with `facingMode: 'environment'` to get permission + a working stream
2. Call `navigator.mediaDevices.enumerateDevices()` — device labels are only available AFTER permission is granted
3. Filter to `videoinput` devices. Find all back cameras (labels NOT containing 'front' or 'user').
4. If multiple back cameras found, prefer the one whose label does NOT contain 'ultra', 'telephoto', or 'tele ' (the main wide-angle lens).
5. If a better camera is found, stop the original stream's tracks and re-open with `deviceId: { exact: mainCamera.deviceId }`.
6. If enumeration fails or only one back camera exists, return the original stream.

### Error handling

Wrap the device enumeration in try/catch — some browsers restrict this API. Fall back silently to the original stream.

## Dependencies

None — uses native `navigator.mediaDevices` API.
