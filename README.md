# SpaceDial

> Space-inspired speed dial new tab for Chrome — with AI assistant, groups, widgets, music, notes, and focus mode.

![SpaceDial](icons/icon128.png)

---

## Overview

SpaceDial replaces your browser's new tab page with a fully-featured, space-themed start screen. Every element is designed to stay out of your way until you need it, while giving you fast access to your most-used sites, a built-in AI chat assistant, live clock and weather, music player, scratchpad, and focus timer.

---

## Features

### AI Chat Assistant
- Built-in AI chat panel that opens alongside your dials
- **OpenAI-compatible API** (connect to Zen API or any compatible endpoint)
- **Encrypted API key** storage (AES-GCM 256-bit via Web Crypto API)
- **Model selector** with 49+ models grouped by family, capability icons (T / 🖼)
- **Model visibility** settings — hide unused models from the dropdown
- **Streaming responses** rendered live with markdown and code blocks
- **10 built-in tools**: web search, manage dials/folders/settings, open URLs
- **Multi-turn tool calling** with confirmation popup for destructive actions
- **File attachments** via drag & drop, file picker, or clipboard paste
- **Auto-naming** of chats from the first AI response
- **Chat history** with sidebar, delete, and per-chat model memory
- **Auto-switch** active chat when typing while viewing a past conversation
- **Funny loading phrases** toggle replaces "Thinking" with random phrases
- **Code block rendering** with copy button and HTML preview (sandboxed iframe)
- **HTML preview** with automatic document wrapping for partial snippets
- **Grouped chat history** by model family in sidebar

### Speed Dials
- Organise bookmarks into named **groups** (tabs across the top)
- **Live drag & drop** — animated reorder with FLIP transitions
- Drop indicator shows exactly where the dial will land
- **Auto-switch tabs** when dragging a dial over a tab for 600ms
- Drag dials between groups or into folders
- Choose dial shape: wide cards or compact squares
- Custom icon support — search DuckDuckGo/Google or paste any URL
- Favicon auto-fetch with fallback letter avatar
- **Windows 11-style folder icons** with CSS-drawn folder shape
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
- Hover zoom effect on dials

### Import / Export
- Export the full state as a JSON backup file
- Import native SpaceDial backups
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
4. Open a new tab — SpaceDial loads automatically.

---

## File Structure

```
spacedial/
├── manifest.json       # Extension manifest (MV3, v4.5.0)
├── newtab.html         # Main new tab page
├── newtab.js           # All UI logic + AI settings
├── newtab.css          # All styles
├── ai.html             # AI chat panel UI
├── ai.js               # AI chat logic — streaming, tools, encryption
├── ai.css              # AI panel styles
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
| `storage` | Save dials, settings, notes, player state, and AI data |
| `tabs` | Detect navigation for focus mode site blocking |
| `notifications` | Notify when music is playing in a background tab |
| `downloads` | Export backup JSON files |
| `host_permissions: *://*/*` | Required for focus-mode URL interception across all sites |
| `api.open-meteo.com` | Weather data (no account needed) |

---

## Settings Reference

Settings are organised into **Appearance**, **Behaviour**, **Focus**, and **AI** tabs inside the extension.

| Setting | Tab | Default | Description |
|---|---|---|---|
| Background type | Appearance | Night | `night`, `sunrise`, `day`, `sunset`, or `solid` |
| Auto day/night | Appearance | Off | Uses Open-Meteo sunrise/sunset data |
| Weather effect | Appearance | Clear | `clear`, `cloudy`, `rain`, `snow`, or `fog` |
| Auto weather | Appearance | Off | Uses Open-Meteo current weather |
| Solid colour picker | Appearance | #07070e | Background colour when type is `solid` |
| Overlay opacity | Appearance | 0.35 | Translucency of the background overlay |
| Columns | Appearance | 5 | Number of dial columns |
| Dial shape | Appearance | Wide | `wide` or `square` |
| Show labels | Appearance | On | Show/hide dial name labels |
| Show favicons | Appearance | On | Show/hide favicon images |
| Show footer | Appearance | On | Show/hide the bottom info bar on dials |
| Hover zoom | Appearance | On | Dial zoom effect on hover |
| Glass effect | Appearance | On | Glassmorphism card style |
| Dial border | Appearance | On | Show/hide dial card borders |
| Dial icon scale | Appearance | 100 | Icon size percentage (50–200) |
| Show add button | Appearance | On | Show/hide the "+" add dial card |
| Clock format | Behaviour | 24h | 12h or 24h |
| Weather city | Behaviour | Dublin | Any city name |
| Temperature unit | Behaviour | Celsius | Celsius or Fahrenheit |
| Show weather | Behaviour | On | Show/hide the weather widget |
| Show clock | Behaviour | On | Show/hide the clock widget |
| Show notes | Behaviour | Off | Show/hide the notes widget |
| Show music player | Behaviour | Off | Show/hide the music player |
| Music on tab leave | Behaviour | Stop | Stop, pause, or continue playing |
| Show AI button | AI | On | Show/hide the AI button in the top bar |
| Funny loading phrases | AI | Off | Random phrases instead of "Thinking" |
| Hard block | Focus | Off | Disables bypass on the block page |

---

## AI Configuration

SpaceDial includes a built-in AI chat panel that connects to any OpenAI-compatible API endpoint:

1. Click the **AI** button in the top bar to open the chat panel
2. Enter your API key when prompted (stored encrypted via AES-GCM)
3. Select a model from the dropdown (49+ models available)
4. Start chatting — the AI can search the web and manage your dials

**Default endpoint:** `https://opencode.ai/zen/v1/chat/completions`

### Available Tools
- `web_search` — Search the web via DuckDuckGo
- `get_dials` — List all dials and folders
- `create_dial` — Create a new speed dial
- `update_dial` — Modify an existing dial
- `delete_dial` — Remove a dial
- `create_folder` — Create a new folder
- `move_dial_to_folder` — Move a dial into a folder
- `change_setting` — Modify any extension setting
- `open_url` — Open a URL in a new tab

Destructive tools show a confirmation popup before execution.

---

## Keyboard Shortcuts

There are no global keyboard shortcuts defined. All interaction is mouse-driven. The notes widget supports standard textarea shortcuts.

---

## Data & Privacy

SpaceDial stores everything locally in `chrome.storage.local` by default. No data is sent to any external server. Weather requests go directly to the [Open-Meteo](https://open-meteo.com/) public API using only the city name you provide. Favicon lookups use the `favicone.com` proxy or DuckDuckGo's favicon service. AI chat history is stored in `localStorage` and is never sent anywhere except the API endpoint you configure.

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
- AI chat uses a ReadableStream-based SSE parser for streaming responses.
- Drag and drop uses FLIP animation for smooth dial reordering.
- Folder icons are pure CSS — no image assets needed.

---

## License

MIT — do whatever you want, just don't claim you made it.
