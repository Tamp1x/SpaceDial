# DialSpace

> Space-inspired speed dial new tab for Chrome and Firefox — with groups, widgets, music, notes, and focus mode.

![DialSpace](icons/icon128.png)

---

## Overview

DialSpace replaces your browser's new tab page with a fully-featured, space-themed start screen. Every element is designed to stay out of your way until you need it, while giving you fast access to your most-used sites, a live clock and weather feed, a music player, a scratchpad, and a focus timer that actually blocks distractions.

---

## Features

### Speed Dials
- Organise bookmarks into named **groups** (tabs across the top)
- Drag and drop dials to reorder or move between groups
- Choose dial shape: wide cards or compact squares
- Custom icon support — search DuckDuckGo/Google or paste any URL
- Favicon auto-fetch with fallback letter avatar
- Right-click context menu: edit, move, delete

### Widgets
| Widget | Details |
|---|---|
| **Clock** | Live 12/24h clock with animated character transitions |
| **Weather** | Current conditions + up to 7-day forecast via Open-Meteo (no API key) |
| **Notes** | Full-page scratchpad, auto-saved to storage |
| **Music Player** | Local file playlist — add, reorder, shuffle, repeat, seek |

### Focus Mode
- Set a named session with a custom duration
- Choose which dial groups and domains to block
- **Hard block** option disables the "wait and go back" escape hatch
- Blocked sites redirect to a countdown page with the session name and remaining time
- Session persists across browser restarts via `session` storage

### Appearance
- Animated Night background plus Sunrise, Day, and Sunset atmosphere modes
- Optional automatic day/night switching via Open-Meteo sunrise/sunset data
- Manual or automatic weather effects: clouds, rain, snow, and fog
- Optional solid colour background with overlay opacity control
- Glassmorphism card style (toggleable)
- Adjustable column count and dial icon scale
- Border visibility toggle

### Import / Export
- Export the full state as a JSON backup file
- Import native DialSpace backups
- Import **FVD Speed Dial** backups (auto-detected)
- Auto-backup prompt — triggers when the state changes significantly and reminds you to save

### Cloud Sync
- Optional sync via `chrome.storage.sync` (toggle in settings)
- Falls back to `chrome.storage.local` when sync quota is exceeded

---

## Installation

### Chrome / Chromium (unpacked)
1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extension folder.
4. Open a new tab — DialSpace loads automatically.

### Firefox (temporary)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json`.

> Firefox support is provided via `browser_specific_settings` in the manifest. Permanent installation requires signing via AMO.

---

## File Structure

```
dialspace/
├── manifest.json       # Extension manifest (MV3)
├── newtab.html         # Main new tab page
├── newtab.js           # All UI logic (~2 500 lines)
├── newtab.css          # All styles
├── background.js       # Service worker — focus blocking, notifications
├── blocked.html        # Focus mode block page
├── blocked.js          # Block page countdown logic
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save dials, settings, notes and player state |
| `tabs` | Detect navigation for focus mode site blocking |
| `notifications` | Notify when music is playing in a background tab |
| `downloads` | Export backup JSON files |
| `host_permissions: *://*/*` | Required for focus-mode URL interception across all sites |
| `api.open-meteo.com` | Weather data (no account needed) |

---

## Settings Reference

All settings live in **Settings → Appearance / Behaviour / Focus** inside the extension.

| Setting | Default | Description |
|---|---|---|
| Background type | Night | `night`, `sunrise`, `day`, `sunset`, or `solid` |
| Auto day/night | Off | Uses Open-Meteo sunrise/sunset data to switch between Sunrise, Day, Sunset, and Night |
| Weather effect | Clear | `clear`, `cloudy`, `rain`, `snow`, or `fog` |
| Auto weather | Off | Uses Open-Meteo current weather data to switch weather effects |
| Columns | 5 | Number of dial columns |
| Dial shape | Wide | `wide` or `square` |
| Clock format | 24h | 12h or 24h |
| Weather city | Dublin | Any city name |
| Temperature unit | Celsius | Celsius or Fahrenheit |
| Music on tab leave | Stop | Stop, pause, or continue playing |
| Hard block | Off | Disables bypass on the block page |

---

## Keyboard Shortcuts

There are no global keyboard shortcuts defined. All interaction is mouse-driven. The notes widget supports standard textarea shortcuts.

---

## Data & Privacy

DialSpace stores everything locally in `chrome.storage.local` by default. No data is sent to any external server. Weather requests go directly to the [Open-Meteo](https://open-meteo.com/) public API using only the city name you provide. Favicon lookups use the `favicone.com` proxy or DuckDuckGo's favicon service.

---

## Browser Compatibility

| Browser | Status |
|---|---|
| Chrome 114+ | ✅ Full support |
| Edge (Chromium) | ✅ Full support |
| Firefox 120+ | ⚠️ Mostly works — `chrome.storage.session` and some MV3 APIs may behave differently |
| Safari | ❌ Not supported |

---

## Development Notes

- The extension uses **Manifest V3** with a service worker (`background.js`).
- State is a single serialisable object managed by `loadState` / `saveState`.
- Focus session state uses `chrome.storage.session` so it survives service worker restarts but is cleared when the browser closes.
- The music player is a plain `<audio>` element; files are stored as base64 blobs in local storage.
- Auto-backup uses a debounce + fingerprint comparison to avoid prompting on trivial changes.

---

## License

MIT — do whatever you want, just don't claim you made it.
