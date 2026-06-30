/* ============================================================
   SpaceDial v3 — Background Service Worker
   ============================================================ */

// ─── Extension icon click → open new tab ───────────────────
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'newtab.html' });
});

// ─── Focus session state ────────────────────────────────────
let focusSession = null; // { endTime, blockedDomains, hardBlock, name }
let notifTabId = null;   // tab that owns the music notification

// Load persisted focus session on startup
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
  }
  return true;
});

// ─── Notification click → switch to SpaceDial tab ──────────
chrome.notifications.onClicked.addListener(notifId => {
  if (notifId === 'music-playing' && notifTabId != null) {
    chrome.tabs.update(notifTabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        // Tab gone — open new SpaceDial tab
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
