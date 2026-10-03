# Dsh-550-Boot

[English](README.en.md) | [中文](README.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

## Sources and acknowledgements

This project is derived from **Ziyang Song ([@yannicksong0106](https://github.com/yannicksong0106))**'s
open-source **[dsh-550c-boot](https://github.com/yannicksong0106/dsh-550c-boot)** (MIT licensed) —
**the 550C boot animation comes from that project**; its original HTML was provided by
**Voidpoket ([@Voidpoket](https://github.com/Voidpoket))**.
This repository adds the 550W and 550A variants, a terminal workbench layout, and the corresponding
build and verification scaffolding. Thanks to both authors.

The additions are by **Sun-sh902** ([@Sun-sh902](https://github.com/Sun-sh902)); 550A remains a work-in-progress placeholder.

## Unofficial fan-work disclaimer

This is an unofficial fan work, unaffiliated with *The Wandering Earth* film series, its rights holders,
or DeepSeek. Film names and related marks belong to their respective owners. The 550W wordmark in this
repository is a vector manually traced from film imagery, for learning and demonstration only;
it is not an original wordmark. If a rights holder objects, please open an issue and we will promptly
adjust or remove it.

**550C / 550W full-screen boot intros and a 550A placeholder for DeepSeek Harness (DSH).**
It plays on every client start, fades out when it finishes, and reveals the real UI.

![Full mode: 47 nodes rewritten one by one](docs/preview-full.png)

- 🎬 **Independent variants and cuts**: the upstream 550C sequence, a 3.05-second simple / 15.45-second full 550W cut, a 550A placeholder, or off
- ⏭️ **Skippable**: click the screen or press `Esc`
- 🖥️ **Covers DSH's own boot card**: the host half injects the opening frame while the document is still
  parsing, so `HARNESS / Loading plugins…` never shows
- 🎨 **Four phosphor palettes**, amber (the original author's) by default; the native window buttons are
  repainted to match

## Install

```sh
# GitHub installation only; committed build output, no install-time scripts
dsh plugin --profile web add github:Sun-sh902/Dsh-550-Boot

# Desktop profile, using the same GitHub source
dsh plugin --profile desktop add github:Sun-sh902/Dsh-550-Boot
```

**Restart DSH once** after installing (bundles are assembled at startup). After an upgrade, hard-refresh
with **Ctrl+Shift+R** — DSH serves client bundles with `max-age=31536000, immutable` while the `rev` in the
URL is a process nonce, so a plain F5 keeps the first copy it ever fetched.

## Usage

Settings → General → **550C 开机动画**. A **Preview** button replays it immediately.
Choose 550C / 550W / 550A and a palette on the same page. Existing settings ids and storage keys remain compatible.

| Mode | Length | Content |
|---|---|---|
| **Simple** | 550W 3.05 s; 550C uses its upstream timeline | logo drawn stroke by stroke |
| **Full** (this repository's default) | 550W 15.45 s; 550C uses its upstream timeline | 550C rewrite / 550W terminal workbench, countdown, engine plumes and successful access |
| **Off** | — | nothing is painted at all |

Palettes: **amber** (default, no override: upstream amber for 550C, neutral/red for 550W), green (P1),
cyan, white (P4). The 550W ending stays 550C amber; pale blue is confined to its two engine plumes.
Preferences live in `localStorage` (`dsh-550c-boot:mode`). Retirement time is separate from playback.
With reduced motion, an unset mode defaults to Simple; 550W plumes are static and the white flash is disabled.

![Simple mode](docs/preview-simple.png)
![Cyan palette](docs/preview-cyan.png)

## Compatibility and limits

- **Requires DSH `>=0.2.0-rc.1`** (`package.json#dsh.engines`). The host half depends on how
  `webserver/index-inject` rows are rendered, and that is only tested on `0.2.0-rc.1`; a lower floor would
  claim support that was never verified.
- It can only cover the screen **after the Web UI loads** — the Electron window itself still shows a blank
  frame for a moment.
- The first frame is a **solid colour** (the animation's own background), not the animation's first picture.
- On macOS the top strip stays draggable while the intro plays; click elsewhere or press `Esc` to skip.

## Docs

| Document | Content |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | layout, why the animation is *extracted* rather than rewritten, boot timeline and first-frame injection |
| [docs/ENHANCEMENTS.md](docs/ENHANCEMENTS.md) | the enhancement layer: monospace stack, cell-based progress bar, real clock stamps, firmware footer and CRC32 |
| [docs/DESKTOP-CHROME.md](docs/DESKTOP-CHROME.md) | the native caption buttons: making room, repainting them, the macOS drag guard |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | build and verification: harness probes, CDP screenshots of the real GUI |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | GitHub-only distribution, reproducible builds and attribution checks |

## Credits

The animation and its HTML source were provided by **Voidpoket** ([@Voidpoket](https://github.com/Voidpoket));
the plugin engineering and port are by **Ziyang Song** ([@yannicksong0106](https://github.com/yannicksong0106)).
See [CREDITS.md](CREDITS.md).

[MIT](LICENSE) © 2026 Ziyang Song; © 2026 Sun-sh902 (repository modifications). See [CREDITS.md](CREDITS.md) for all three contributors.
