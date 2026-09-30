/**
 * 550W — content layer.
 *
 * Deliberately thin. 550C needed one because the port arrives with authoring-time
 * clock stamps and no terminal texture; 550W is written in one go and carries its
 * own typography. What is left for this layer is the "self-consistent data" half:
 * a session id and a real start stamp in the telemetry column, so the readout is
 * about this boot rather than a decorative constant.
 *
 * No timers and no observers on purpose — anything animated here would be a
 * ticker that `cancel()` cannot see, and the leak audit exists to catch exactly
 * that. The returned disposer is therefore a no-op that keeps the registry's
 * contract (`enhance(stage, opts) -> disposer`) intact.
 */
function enhanceShow550W(stage, options) {
  const values = (stage.querySelectorAll('#w-hud-l .w-v') ?? [])
  if (values.length > 0) {
    const started = new Date()
    const stamp =
      String(started.getHours()).padStart(2, '0') +
      ':' +
      String(started.getMinutes()).padStart(2, '0') +
      ':' +
      String(started.getSeconds()).padStart(2, '0')
    const session = '0x' + Math.floor(started.getTime() / 1000).toString(16).toUpperCase().slice(-6)
    values[values.length - 1].textContent = values[values.length - 1].textContent + ' · ' + session + ' @ ' + stamp
  }
  return function stop() {}
}
