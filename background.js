/* ============================================================
   SpaceDial v3 — Background Service Worker
   ============================================================ */

// ─── Extension icon click → open new tab ───────────────────
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'newtab.html' });
});

// ─── Focus session state ────────────────────────────────────
let focusSession = null;
let notifTabId = null;

chrome.storage.session.get('ds3focus', r => {
  if (r.ds3focus && Date.now() < r.ds3focus.endTime) {
    focusSession = r.ds3focus;
    startFocusTimer();
  }
});

let focusTimerId = null;

function startFocusTimer() {
  if (focusTimerId) clearInterval(focusTimerId);
  focusTimerId = setInterval(() => {
    if (!focusSession || Date.now() >= focusSession.endTime) {
      focusSession = null;
      chrome.storage.session.remove('ds3focus');
      clearInterval(focusTimerId);
      focusTimerId = null;
    }
  }, 5000);
}

// ─── Theme Scanner ─────────────────────────────────────────
const KNOWN_THEME_IDS = ['default', 'galaxy', 'macos'];

async function scanThemes() {
  const themes = [];
  for (const id of KNOWN_THEME_IDS) {
    try {
      const url = chrome.runtime.getURL(`Themes/${id}/theme.json`);
      const resp = await fetch(url);
      if (resp.ok) {
        const meta = await resp.json();
        meta.url = chrome.runtime.getURL(`Themes/${id}/`);
        themes.push(meta);
      }
    } catch (e) { /* skip */ }
  }
  return themes;
}

async function scanWallpapers() {
  try {
    const url = chrome.runtime.getURL('wallpapers.json');
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      return data.wallpapers || [];
    }
  } catch (e) { /* skip */ }
  return [];
}

// ─── Weather Data Cache ────────────────────────────────────
const weatherCache = new Map();
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

async function fetchWeather(city) {
  const cached = weatherCache.get(city);
  if (cached && Date.now() - cached.time < WEATHER_CACHE_TTL) {
    return cached.data;
  }

  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    );
    const geoData = await geoResp.json();
    if (!geoData.results?.length) return null;

    const { latitude, longitude } = geoData.results[0];
    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code,windspeed_10m,winddirection_10m,cloudcover,precipitation` +
      `&hourly=temperature_2m,weather_code,windspeed_10m,winddirection_10m,cloudcover,precipitation_probability` +
      `&timezone=auto&forecast_days=2`
    );
    const weatherData = await weatherResp.json();
    const result = { lat: latitude, lon: longitude, ...weatherData };
    weatherCache.set(city, { data: result, time: Date.now() });
    return result;
  } catch (e) {
    return null;
  }
}

// ─── Wind Grid Data ────────────────────────────────────────
async function fetchWindGrid() {
  try {
    const resp = await fetch(
      `https://api.open-meteo.com/v1/gfs?latitude=52.52&longitude=13.41` +
      `&hourly=wind_u_component_10m,wind_v_component_10m` +
      `&forecast_days=1&timezone=auto`
    );
    return await resp.json();
  } catch (e) {
    return null;
  }
}

// ─── Messages from newtab.js ────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'focus-start') {
    focusSession = msg.session;
    chrome.storage.session.set({ ds3focus: msg.session });
    startFocusTimer();
    sendResponse({ ok: true });
  } else if (msg.type === 'focus-end') {
    focusSession = null;
    chrome.storage.session.remove('ds3focus');
    if (focusTimerId) { clearInterval(focusTimerId); focusTimerId = null; }
    chrome.runtime.sendMessage({ type: 'focus-ended' }).catch(() => {});
    sendResponse({ ok: true });
  } else if (msg.type === 'music-notify') {
    notifTabId = sender.tab?.id;
    chrome.notifications.create('music-playing', {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'SpaceDial — Music is playing',
      message: 'Music keeps playing. Click to return.',
      priority: 1
    }, () => {});
    sendResponse({ ok: true });
  } else if (msg.type === 'focus-query') {
    sendResponse({ session: focusSession });
  } else if (msg.type === 'scan-themes') {
    scanThemes().then(themes => sendResponse({ themes }));
    return true;
  } else if (msg.type === 'scan-wallpapers') {
    scanWallpapers().then(wallpapers => sendResponse({ wallpapers }));
    return true;
  } else if (msg.type === 'fetch-weather') {
    fetchWeather(msg.city).then(data => sendResponse({ data }));
    return true;
  } else if (msg.type === 'fetch-wind-grid') {
    fetchWindGrid().then(data => sendResponse({ data }));
    return true;
  }
  return true;
});

// ─── Notification click → switch to SpaceDial tab ──────────
chrome.notifications.onClicked.addListener(notifId => {
  if (notifId === 'music-playing' && notifTabId != null) {
    chrome.tabs.update(notifTabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url: 'newtab.html' });
      }
    });
    chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { focused: true });
    chrome.notifications.clear(notifId);
  }
});

// ─── Focus mode site blocking ───────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!focusSession) return;
  if (changeInfo.status !== 'loading') return;
  if (!tab.url || tab.url.startsWith('chrome-extension://')) return;

  let url;
  try { url = new URL(tab.url); } catch { return; }

  const hostname = url.hostname.replace(/^www\./, '');
  const blocked = focusSession.blockedDomains || [];

  const isBlocked = blocked.some(d => {
    const clean = d.replace(/^www\./, '').trim();
    return hostname === clean || hostname.endsWith('.' + clean);
  });

  if (!isBlocked) return;

  const blockUrl = chrome.runtime.getURL('blocked.html') +
    '?url=' + encodeURIComponent(tab.url) +
    '&end=' + encodeURIComponent(focusSession.endTime) +
    '&name=' + encodeURIComponent(focusSession.name || 'Focus') +
    '&hard=' + (focusSession.hardBlock ? '1' : '0');

  chrome.tabs.update(tabId, { url: blockUrl });
});
