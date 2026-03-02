/**
 * Gets a camera stream from the main (non-ultra-wide) rear camera.
 *
 * Strategy:
 * 1. Open with facingMode:'environment' to get permission + a working stream
 * 2. Enumerate devices — labels are only available after permission is granted
 * 3. If multiple rear cameras found, re-open with the main camera's deviceId
 * 4. Falls back to the original stream if anything goes wrong
 */
export async function getMainCamera(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  })

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const videoDevices = devices.filter((d) => d.kind === 'videoinput')

    // Only attempt re-selection if labels are available and we have multiple rear cameras
    const backCameras = videoDevices.filter((d) => {
      const label = d.label.toLowerCase()
      return label && !label.includes('front') && !label.includes('user')
    })

    if (backCameras.length > 1) {
      // Pick the main camera — the one without "ultra" or "telephoto" in the label
      const mainCamera = backCameras.find((d) => {
        const label = d.label.toLowerCase()
        return !label.includes('ultra') && !label.includes('telephoto') && !label.includes('tele ')
      })

      if (mainCamera) {
        stream.getTracks().forEach((t) => t.stop())
        return navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: mainCamera.deviceId } },
        })
      }
    }
  } catch {
    // Enumeration failed — use the original stream
  }

  return stream
}
