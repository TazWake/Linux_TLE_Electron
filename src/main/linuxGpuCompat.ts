import { app } from 'electron'

/**
 * SIFT workstations, VMs, and remote desktops often lack working VA-API/GPU drivers.
 * Chromium then logs libva errors and may exit before showing a window.
 * Call before app.whenReady(). Set ETV_ENABLE_GPU=1 to skip (native Linux with GPU).
 */
export function applyLinuxGpuCompat(): void {
  if (process.platform !== 'linux') {
    return
  }

  if (process.env.ETV_ENABLE_GPU === '1') {
    return
  }

  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-dev-shm-usage')

  if (process.env.DISPLAY === undefined && process.env.WAYLAND_DISPLAY === undefined) {
    console.warn(
      'No DISPLAY or WAYLAND_DISPLAY is set. Electron needs a graphical session to open a window.'
    )
  }
}
