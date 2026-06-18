import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getMainCamera } from './getMainCamera'

function mockStream() {
  return { getTracks: vi.fn().mockReturnValue([{ stop: vi.fn() }]) } as unknown as MediaStream
}

function mockDevice(label: string, deviceId: string): MediaDeviceInfo {
  return { kind: 'videoinput', deviceId, label, groupId: '' } as MediaDeviceInfo
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('getMainCamera', () => {
  it('returns the initial stream when there is only one back camera', async () => {
    const stream = mockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([mockDevice('Back Camera', 'cam-1'), mockDevice('Front Camera', 'cam-2')])
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(stream)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('re-opens with the main camera when multiple rear cameras exist', async () => {
    const initialStream = mockStream()
    const mainStream = mockStream()
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(initialStream)
      .mockResolvedValueOnce(mainStream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        mockDevice('Back Camera', 'cam-main'),
        mockDevice('Back Ultra Wide Camera', 'cam-ultra'),
        mockDevice('Front Camera', 'cam-front'),
      ])
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(mainStream)
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: 'cam-main' } },
    })
    expect(initialStream.getTracks()[0].stop).toHaveBeenCalled()
  })

  it('skips re-selection when all rear cameras are ultra-wide or telephoto', async () => {
    const stream = mockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        mockDevice('Back Ultra Wide Camera', 'cam-ultra'),
        mockDevice('Back Telephoto Camera', 'cam-tele'),
      ])
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(stream)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('falls back to initial stream when enumerateDevices fails', async () => {
    const stream = mockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi.fn().mockRejectedValue(new Error('not supported'))
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(stream)
  })

  it('falls back when labels are empty (pre-permission)', async () => {
    const stream = mockStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([mockDevice('', 'cam-1'), mockDevice('', 'cam-2')])
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(stream)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('excludes telephoto with "tele " prefix in label', async () => {
    const initialStream = mockStream()
    const mainStream = mockStream()
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(initialStream)
      .mockResolvedValueOnce(mainStream)
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        mockDevice('Back Camera', 'cam-main'),
        mockDevice('Back Tele Camera', 'cam-tele'),
      ])
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    })

    const result = await getMainCamera()
    expect(result).toBe(mainStream)
    expect(getUserMedia).toHaveBeenLastCalledWith({
      video: { deviceId: { exact: 'cam-main' } },
    })
  })
})
