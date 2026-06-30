# SpaceDial

> Space-inspired speed dial new tab for Chrome — with AI assistant, groups, folders, widgets, music, notes, focus mode, and speed test.

![SpaceDial](icons/icon128.png)

---

## Features

### Speed Dials
- Organise bookmarks into named **groups** (tabs across the top)
- **Folders** inside groups — Android-style preview grid (up to 4 dial previews) with optional **cover icon** override
- **Live drag & drop** — animated reorder with FLIP transitions, auto-switch tabs on hover, drop indicator
- Drag dials between groups or into/out of folders
- Choose dial shape: wide (16:9), square (1:1), or tall (3:4)
- Custom icon support — search DuckDuckGo/Google or paste any URL
- Favicon auto-fetch with fallback letter avatar
- Right-click context menu: edit, move, delete

### AI Chat Assistant
- Built-in AI chat panel that opens alongside your dials
- **OpenAI-compatible API** (connect to Zen API or any compatible endpoint)
- **Encrypted API key** storage (AES-GCM 256-bit via Web Crypto API)
- **Model selector** with 49+ models grouped by family, capability icons (T / 🖼), model visibility settings
- **Streaming responses** with markdown, code blocks with copy button, and HTML preview (sandboxed iframe)
- **10 built-in tools**: web search, manage dials/folders/settings, open URLs
- **Multi-turn tool calling** with confirmation popup for destructive actions
- **File attachments** via drag & drop, file picker, or clipboard paste (images rendered inline)
- **Auto-naming** of chats from the first AI response
- **Chat history** with sidebar, delete, per-chat model memory, and grouped history by model family
- **Funny loading phrases** toggle
- **Auto-cleanup** of empty chats when switching away

### Widgets
| Widget | Details |
|---|---|
| **Clock** | Live 12/24h clock with animated character transitions |
| **Weather** | Current conditions + up to 7/16-day forecast via Open-Meteo (no API key) |
| **Notes** | Full-page scratchpad, auto-saved to storage |
| **Music Player** | Local file playlist — add, reorder, shuffle, repeat, seek |
| **Speed Test** | Built-in browser-based speed test (Ookla or internal) |

### Focus Mode
- Set a named session with a custom duration
- Choose which dial groups and domains to block
- **Hard block** option disables the "wait and go back" escape hatch
- Blocked sites redirect to a countdown page with session name and remaining time
- Session persists across browser restarts via `session` storage

### Appearance
- Animated Night, Sunrise, Day, Sunset atmosphere modes + solid colour
- Optional automatic day/night switching via Open-Meteo sunrise/sunset data
- Weather effects: clouds, rain, snow, fog (manual or auto)
- Glassmorphism card style, hover zoom, border visibility, adjustable columns and icon scale
- Show/hide top bar buttons (add group, focus mode, speed test, AI)

### Updates
- Automatic check for new versions on startup
- Toast notification when update is available — Later (dismiss) or Download (opens GitHub releases)
- Settings **Updates** tab shows current version and a manual check button

### Backup & Sync
- Export minimal (dials + settings) or full (everything) JSON backup
- Import SpaceDial or FVD Speed Dial backups
- Auto-backup prompt on significant state changes
- Optional Chrome Cloud sync (`chrome.storage.sync`)

---

## Installation

### Chrome / Chromium (unpacked)
1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `SpaceDial` folder.
4. Open a new tab — SpaceDial loads automatically.

---

## File Structure

```
SpaceDial/
├── manifest.json          # Extension manifest (MV3, v4.7.0)
├── newtab.html            # Main new tab page
├── newtab.js              # All UI logic + settings
├── newtab.css             # All styles
├── ai.html                # AI chat panel (loaded in iframe)
├── ai.js                  # AI chat logic — streaming, tools, encryption
├── ai.css                 # AI panel styles
├── background.js          # Service worker — focus blocking, notifications
├── blocked.html           # Focus mode block page
├── blocked.js             # Block page countdown logic
├── speedtest.html         # Internal speed test panel
├── speedtest.js           # Speed test logic
├── manifest.json
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
| `storage` | Save dials, settings, notes, player state, AI data |
| `tabs` | Detect navigation for focus mode site blocking |
| `notifications` | Notify when music is playing in a background tab |
| `downloads` | Export backup JSON files |
| `host_permissions: *://*/*` | Required for focus-mode URL interception |
| `api.open-meteo.com` | Weather data (no API key needed) |

---

## Settings Reference

Settings are organised into **Appearance**, **Dials**, **Widgets**, **Music & Focus**, **AI**, **Backup**, and **Updates** tabs.

| Setting | Tab | Default | Description |
|---|---|---|---|
| Background type | Appearance | Night | `night`, `sunrise`, `day`, `sunset`, `solid` |
| Solid colour | Appearance | #07070e | Background when type is `solid` |
| Auto day/night | Appearance | Off | Uses Open-Meteo sunrise/sunset |
| Weather effect | Appearance | Clear | `clear`, `cloudy`, `rain`, `snow`, `fog` |
| Auto weather | Appearance | Off | Uses Open-Meteo current weather |
| Overlay opacity | Appearance | 0.35 | Vignette darkness |
| SpeedTest mode | Appearance | Ookla | `ookla` or `internal` |
| Show/hide top bar buttons | Appearance | On | Add group, Focus, SpeedTest, AI |
| Columns | Dials | 5 | 2–7 |
| Dial shape | Dials | Wide | `wide`, `square`, `tall` |
| Dial icon scale | Dials | 100 | 0–200% |
| Show labels | Dials | On | |
| Show favicons | Dials | On | |
| Show footer | Dials | On | Bottom info bar |
| Hover zoom | Dials | On | |
| Glass effect | Dials | On | Glassmorphism cards |
| Dial border | Dials | On | |
| Show ADD DIAL | Dials | On | "+" card |
| Clock format | Widgets | 24h | 12h or 24h |
| Show seconds | Widgets | Off | |
| Weather city | Widgets | Dublin | Any city name |
| Forecast range | Widgets | 7 | 7 or 16 days |
| Temperature unit | Widgets | Celsius | Celsius or Fahrenheit |
| Show clock/weather/notes/music | Widgets | On/Off | Per-widget toggle |
| Music on tab leave | Music | Stop | Stop, continue, or ask |
| Autoplay / Loop / Shuffle | Music | Off/On/Off | |
| Blocked domains | Music & Focus | list | One per line |
| Show AI button | AI | On | |
| Funny loading phrases | AI | Off | Random phrases |
| API key | AI | — | Encrypted AES-GCM |

---

## AI Configuration

1. Click the **AI** button in the top bar to open the chat panel
2. Enter your API key when prompted (encrypted via AES-GCM)
3. Select a model from the dropdown
4. Start chatting — the AI can search the web and manage your dials

**Default endpoint:** `https://opencode.ai/zen/v1/chat/completions`

### Available Tools
- `web_search` — Search the web via DuckDuckGo
- `get_dials` — List all dials and folders
- `create_dial`, `update_dial`, `delete_dial`
- `create_folder`, `move_dial_to_folder`
- `change_setting` — Modify any extension setting
- `open_url` — Open a URL in a new tab

Destructive tools show a confirmation popup before execution.

---

## Keyboard Shortcuts

No global shortcuts defined. All interaction is mouse-driven.

---

## Data & Privacy

Everything is stored locally in `chrome.storage.local` by default. No data is sent to external servers. Weather requests go directly to the [Open-Meteo](https://open-meteo.com/) public API. Favicon lookups use DuckDuckGo's favicon service. AI chat history is stored in `localStorage` and sent only to the API endpoint you configure.

---

## Browser Compatibility

| Browser | Status |
|---|---|
| Chrome 114+ | ✅ Full support |
| Edge (Chromium) | ✅ Full support |
| Firefox 120+ | ⚠️ Mostly works — some MV3 APIs may differ |
| Safari | ❌ Not supported |

---

## Development Notes

- **Manifest V3** with a service worker (`background.js`).
- State is a single serialisable object managed by `loadState` / `saveState`.
- Focus session uses `chrome.storage.session` (cleared on browser close).
- Music player is a plain `<audio>` element; files stored as base64 blobs.
- AI chat uses ReadableStream-based SSE parser for streaming responses.
- Drag and drop uses FLIP animation for smooth dial reordering.
- Folder preview grid is pure CSS flexbox; no image assets needed.
- Version is read live from `manifest.json` via `fetch` (not cached `chrome.runtime.getManifest`).

---

## License

MIT — do whatever you want, just don't claim you made it.
