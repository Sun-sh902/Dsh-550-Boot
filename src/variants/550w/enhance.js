/* 550W — the content layer.
 *
 * 550C's enhance.js upgrades the ported terminal after the fact (terminal type,
 * self-consistent clock stamps, CRC32 footer) because that markup is somebody
 * else's and must stay byte-identical. 550W's markup is ours, so this layer is
 * small and does exactly two things the markup cannot do by itself:
 *
 *   1. the session fingerprint's checksum is COMPUTED. The RELAY LINK window
 *      prints the session string in its own row and `#wp-crc` right under it gets
 *      the CRC32 of that printed string — so the value is reproducible by anyone
 *      reading the screen (and by tools/probe-550w.mjs, which recomputes it and
 *      compares). It used to live in the KEY NEGOTIATION window; R4 merged that
 *      window into RELAY LINK, so the row moved with it.
 * The HUD/window clock lives in show.js so its 1 s tick uses the same
 * cancellable later() queue as every other timer in the sequence.
 *
 * Everything else the machine prints is either a §1 constant (the master's own
 * numbers: 3,751 / 10,000 / 3 / 1.28 S / 3.84E8 M / 46 KM / 11 KM / 20–30 KM /
 * quantum volume 8192), a runtime-consistent quantity (that checksum, the
 * countdown, the progress bars, the RTT) or a discrete state string
 * (`INLET OPEN`, `COIL 1–4 FIELD OK`). No derived engine figures: specific
 * impulse, field strength and plasma temperature have no source and are not
 * printed anywhere in this machine.
 *
 * The registry's contract is `enhance(stage, { mode }) -> disposer`.
 */

/** CRC32 (IEEE 802.3, reflected) — the same polynomial as the ported terminal's. */
function crc32_550W(input) {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) & 0xff;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function enhanceShow550W(stage, options) {
  // 1. The checksum, over what the screen actually prints.
  const sessionRow = Array.from(stage.querySelectorAll('.popup[data-p="link"] .wp-row')).filter(
    (row) => row.querySelector('.k') !== null && row.querySelector('.k').textContent === 'SESSION',
  )[0];
  const crcNode = stage.querySelector('#wp-crc');
  const busTerminal = stage.querySelector('#term-bus');
  if (sessionRow !== undefined) {
    const printed = sessionRow.querySelector('.v').textContent.trim();
    const computed = '0x' + crc32_550W(printed);
    if (crcNode !== null) {
      crcNode.textContent = computed;
      crcNode.dataset.source = printed;
    }
    if (busTerminal !== null) {
      busTerminal.dataset.fingerprint = printed;
      busTerminal.dataset.crc = computed;
    }
  }

  return function stop() {};
}
