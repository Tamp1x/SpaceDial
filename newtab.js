/* ============================================================
   SpaceDial v4 — Main Logic
   ============================================================ */

// ─── Default state ─────────────────────────────────────────
const DEFAULT_STATE = () => ({
  groups: [
    { id: 'home', name: 'HOME', isHome: true, dials: [] },
    { id: uid(), name: 'Main', dials: [] }
  ],
  activeGroup: 'home',
  settings: {
    theme: 'default',
    liquidVariant: 'light',
    galaxyPlanet: 'earth',
    bgType: 'night',
    bgTime: 12, // manual time-of-day for Default theme smooth sky (0..24)
    autoDayNight: false,
    weatherEffect: 'clear',
    autoWeather: false,
    overlayOp: 0.35,
    weatherCity: 'Dublin',
    tempUnit: 'celsius',
    cols: 5,
    dialShape: 'wide',
    showLabel: true,
    showFavicon: true,
    showFooter: true,
    hoverZoom: true,
    glass: true,
    glassStyle: 'standard',
    tabStyle: 'default',
    showBorder: true,
    dialIconScale: 100,
    showAddDialButton: true,
    showClock: true,
    use24h: true,
    showSeconds: false,
    showWeather: true,
    showWeatherForecast: true,
    weatherForecastDays: 7,
    showPlayer: true,
    showNotes: true,
    speedTestMode: 'ookla',
    musicLeave: 'stop',
    showAddTabButton: true,
    showFocusButton: true,
    showSpeedTestButton: true,
    showAiButton: true,
    autoplay: false,
    loopPlaylist: true,
    shuffleOnStart: false,
    blockedDomains: 'youtube.com\ntiktok.com\ntwitter.com\nx.com\ninstagram.com\nfacebook.com\nreddit.com\nnetflix.com\ntwitch.tv\ntumblr.com\npinterest.com',
    wallpaper: null,
    wallpaperFit: 'cover',
    wallpaperZoom: 100,
    wallpaperX: 50,
    wallpaperY: 50,
    wallpaperBlur: false,
    sleepEnabled: true,
    sleepTimeout: 60,
    sleepColorGlow: false
  },
  notes: '',
  player: {
    playlist: [],
    currentIdx: 0,
    shuffle: false,
    repeat: false,
    volume: 1,
    position: 0
  },
  lastWeatherAtmosphere: null,
  lastUpdateCheck: 0,
  ignoredUpdate: null
});

let state = DEFAULT_STATE();
let ctxDialId = null;
let editingDialId = null;
let editingItemType = 'dial';
let editingTabId = null;
let selectedIconUrl = null;
let iconSearchSource = 'duckduckgo';
let focusSession = null; // { endTime, blockedGroups, blockedDomains, name, hardBlock, showTimer, intervalId }
let lastClockText = '';
let viewTransitionTimer = null;
let folderStack = [];

function getIconScale(value, fallback = 100) {
  const scale = Number(value);
  return Number.isFinite(scale) ? scale : fallback;
}
let ctxHideTimer = null;
let starsAnimationFrame = null;
let weatherAnimationFrame = null;
let galaxyAnimationFrame = null;
let starsResizeTimer = null;
let lastWeatherAtmosphere = null;
let lastWeatherDesc = '';
let lastWeatherTemp = '';
const MODAL_CLOSE_MS = 280;
const CLOCK_ANIM_MS = 420;
const AUTO_BACKUP_DEBOUNCE_MS = 1800;

// ─── Audio engine ──────────────────────────────────────────
const audio = new Audio();
audio.preload = 'metadata';
let playerSeeking = false;
let wasPlayingBeforeSeek = false;

// ─── Drag & Drop state ─────────────────────────────────────
let draggingDialId = null;
let draggingTabId = null;
let isSelectingCtxText = false;
const DIAL_DRAG_MIME = 'application/x-dialspace-dial';
const TAB_DRAG_MIME = 'application/x-dialspace-tab';
let dragHoverTimer = null;
let dragHoverTabId = null;
let dragDropIndicator = null;

// ─── Dev logs capture ────────────────────────────────────────
const devLogs = window.__devLogs || [];

// ─── Notes debounce ────────────────────────────────────────
let notesSaveTimer = null;
let autoBackupTimer = null;
let pendingBackupSnapshot = null;

let lastBackupFingerprint = '';
let lastPromptFingerprint = '';
let backupPromptVisible = false;

// ─── Sleep mode state ──────────────────────────────────────
let sleepTimer = null;
let sleepActive = false;
let sleepCanvas = null;
let sleepCtx = null;
let sleepAnimId = null;
let sleepStars = [];
let sleepFadePhase = 'none'; // 'none' | 'entering' | 'leaving'
let sleepFadeAlpha = 0;
let sleepEnterStart = 0;
let sleepExitStart = 0;
let sleepPlanetRadius = 0;

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  chrome.storage.local.get(['lastWeatherDesc', 'lastWeatherTemp'], r => {
    if (r.lastWeatherDesc) lastWeatherDesc = r.lastWeatherDesc;
    if (r.lastWeatherTemp) lastWeatherTemp = r.lastWeatherTemp;
  });
  installConsoleCommands();
  sessionStorage.removeItem('dev-earth-override');
  // Establish baseline so prompt does not appear right after startup.
  lastBackupFingerprint = JSON.stringify(makeBackupFingerprintSource(state));
  setupOverlayPanels();
  applySettings(true);
  buildTabs();
  showView(state.activeGroup);
  startClock();
  fetchWeather();
  if (isMilkywaySelected()) drawGalaxyStars(); else if (getResolvedTheme() === 'default') drawStars();
  trackGalaxyMouse();
  initFabricHover();
  initWallpaperControls();
  initEarthTimeControl();
  initSkyTimeControl();
  bindAll();
  setupOfflineBanner();
  restorePlayer();
  restoreFocus();
  initSleepMode();
  setInterval(fetchWeather, 15 * 60 * 1000);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('load', () => {
    requestAnimationFrame(() => requestAnimationFrame(updateTabsActivePill));
  }, { once: true });
  document.fonts?.ready?.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(updateTabsActivePill));
  });
  setTimeout(() => {
    if (!document.fonts?.check?.('1em Anurati')) {
      document.documentElement.classList.add('fonts-loaded');
    }
  }, 4000);
  checkForUpdates();
  // Listen for AI tool state changes from the AI panel iframe
  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'spacedial-state-changed') {
      await loadState();
      applySettings(true);
      buildTabs();
      showView(state.activeGroup);
      renderDials();
      fetchWeather();
      updateTabsActivePill();
    }
  });
});

// ─── Persistence ────────────────────────────────────────────
function saveState(options = {}) {
  const { scheduleBackup = true } = options;
  const s = JSON.parse(JSON.stringify(state));
  s.player.playlist = s.player.playlist.map(t => ({
    name: t.name, artist: t.artist || '',
    type: t.type,
    src: t.type === 'url' ? t.src : null
  })).filter(t => t.type === 'url' || t.src);
  chrome.storage.local.set({ ds2: s }, () => {
    if (!chrome.runtime.lastError) return;
    console.warn('SpaceDial storage save failed:', chrome.runtime.lastError.message);
  });
  if (scheduleBackup) scheduleBackupPrompt(s);
}

function buildExportableState(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  if (copy.player?.playlist) {
    copy.player.playlist = copy.player.playlist.filter(t => t.type === 'url');
  }
  return copy;
}

function makeBackupFingerprintSource(snapshot) {
  // Ignore transient/UI-only changes to avoid noisy backup prompts.
  const copy = buildExportableState(snapshot);
  delete copy.activeGroup;
  delete copy.lastWeatherAtmosphere;
  if (copy.player) delete copy.player.position;
  if (copy.settings) {
    delete copy.settings.bgType;
    delete copy.settings.autoDayNight;
    delete copy.settings.weatherEffect;
    delete copy.settings.autoWeather;
  }
  return copy;
}

function scheduleBackupPrompt(snapshot) {
  if (!chrome.downloads?.download) return;
  const exportState = buildExportableState(snapshot);
  const fingerprint = JSON.stringify(makeBackupFingerprintSource(snapshot));
  if (fingerprint === lastBackupFingerprint) return;
  if (fingerprint === lastPromptFingerprint) return;
  pendingBackupSnapshot = exportState;
  clearTimeout(autoBackupTimer);
  if (backupPromptVisible) return;
  autoBackupTimer = setTimeout(() => {
    showBackupPrompt();
  }, AUTO_BACKUP_DEBOUNCE_MS);
}

function showBackupPrompt() {
  const toast = document.getElementById('backup-toast');
  if (!toast || !pendingBackupSnapshot) return;
  lastPromptFingerprint = JSON.stringify(makeBackupFingerprintSource(pendingBackupSnapshot));
  toast.style.display = 'flex';
  backupPromptVisible = true;
}

function hideBackupPrompt() {
  const toast = document.getElementById('backup-toast');
  if (!toast) return;
  toast.style.display = 'none';
  backupPromptVisible = false;
}

function saveBackupToFile() {
  if (!chrome.downloads?.download || !pendingBackupSnapshot) return;
  const payload = JSON.stringify(pendingBackupSnapshot, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({
    url,
    filename: 'SpaceDial/auto-backup-latest.json',
    saveAs: false,
    conflictAction: 'overwrite'
  }, () => {
    URL.revokeObjectURL(url);
  });
  lastBackupFingerprint = JSON.stringify(makeBackupFingerprintSource(pendingBackupSnapshot));
  lastPromptFingerprint = '';
  hideBackupPrompt();
}

async function loadState() {
  return new Promise(res => {
    chrome.storage.local.get('ds2', r => {
      if (r.ds2) {
        const saved = r.ds2;
        state.groups = normalizeGroupsWithHome(saved.groups || state.groups);
        state.activeGroup = saved.activeGroup || state.groups[0].id;
        state.settings = { ...DEFAULT_STATE().settings, ...(saved.settings || {}) };
        state.settings.bgType = normalizeBgType(state.settings.bgType);
        const savedBgTime = Number(state.settings.bgTime);
        state.settings.bgTime = Number.isFinite(savedBgTime)
          ? Math.max(0, Math.min(24, savedBgTime))
          : DEFAULT_STATE().settings.bgTime;
        state.settings.weatherEffect = normalizeWeatherEffect(state.settings.weatherEffect);
        state.settings.liquidVariant = normalizeLiquidVariant(state.settings.liquidVariant);
        const oldTheme = state.settings.theme;
        if (oldTheme === 'earth' || oldTheme === 'milkyway') {
          state.settings.theme = 'galaxy';
          state.settings.galaxyPlanet = oldTheme === 'earth' ? 'earth' : 'milkyway';
        }
        state.settings.galaxyPlanet = normalizeGalaxyBody(state.settings.galaxyPlanet);
        delete state.settings.bgImage;
        state.player = { ...DEFAULT_STATE().player, ...(saved.player || {}) };
        state.notes = saved.notes || ''; if (saved.lastWeatherAtmosphere !== undefined) { state.lastWeatherAtmosphere = saved.lastWeatherAtmosphere; lastWeatherAtmosphere = saved.lastWeatherAtmosphere; }
        if (saved.lastUpdateCheck !== undefined) state.lastUpdateCheck = saved.lastUpdateCheck;
        if (saved.ignoredUpdate !== undefined) state.ignoredUpdate = saved.ignoredUpdate;
        if (!state.groups.some(g => g.id === state.activeGroup)) state.activeGroup = 'home';
      }
      res();
    });
  });
}

function uid() { return Math.random().toString(36).slice(2, 10); }

function normalizeGroupsWithHome(groups) {
  const normalizedGroups = Array.isArray(groups) ? groups.map(group => ({
    ...group,
    dials: Array.isArray(group?.dials) ? group.dials.map(dial => normalizeDial(dial)).filter(Boolean) : []
  })) : [];

  const homeCandidates = normalizedGroups.filter(group =>
    group?.isHome || group?.id === 'home' || String(group?.name || '').trim().toUpperCase() === 'HOME'
  );
  const primaryHome = homeCandidates[0];
  const homeGroup = {
    ...(primaryHome || {}),
    id: 'home',
    name: 'HOME',
    isHome: true,
    dials: []
  };

  const usedIds = new Set(['home']);
  const regularGroups = normalizedGroups
    .filter(group => group && group !== primaryHome)
    .map(group => {
      const nextGroup = { ...group, isHome: false };
      if (nextGroup.id === 'home' || usedIds.has(nextGroup.id)) nextGroup.id = uid();
      usedIds.add(nextGroup.id);
      return nextGroup;
    });

  return [homeGroup, ...regularGroups];
}

function normalizeBgType(value) {
  if (value === 'stars' || value === 'image') return 'night';
  if (['night', 'sunrise', 'day', 'sunset'].includes(value)) return value;
  return 'night';
}

function normalizeWeatherEffect(value) {
  return ['clear', 'cloudy', 'rain', 'snow', 'fog'].includes(value) ? value : 'clear';
}

function normalizeLiquidVariant(value) {
  return ['light', 'dark'].includes(value) ? value : 'light';
}

function normalizeGalaxyBody(value) {
  const legacyBlackHole = ['blackhole-m87', 'blackhole-sgra', 'blackhole-reference'];
  if (legacyBlackHole.includes(value)) return 'blackhole';
  const allowed = ['milkyway', 'earth', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'blackplanet', 'blackhole'];
  return allowed.includes(value) ? value : 'earth';
}

// Effective hour-of-day (0..24) used to render the Default smooth sky.
// Auto = real local clock time; manual = settings.bgTime slider.
function getResolvedSkyHour() {
  if (state.settings.autoDayNight) {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }
  const t = Number(state.settings.bgTime);
  return ((Number.isFinite(t) ? t : 12) % 24 + 24) % 24;
}

function getResolvedBgType() {
  if (state.settings.autoDayNight) {
    if (lastWeatherAtmosphere?.phase) {
      return normalizeBgType(lastWeatherAtmosphere.phase);
    }
    return bgTypeFromHour(new Date().getHours() + new Date().getMinutes() / 60);
  }
  if (getResolvedTheme() === 'default' && !isFixedWallpaperTheme()) {
    return bgTypeFromHour(getResolvedSkyHour());
  }
  return normalizeBgType(state.settings.bgType);
}

function bgTypeFromHour(hour) {
  if (hour >= 5 && hour < 8) return 'sunrise';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20.5) return 'sunset';
  return 'night';
}

function updateBgTimeLabel() {
  const val = document.getElementById('s-bg-time');
  const lbl = document.getElementById('s-bg-time-val');
  if (!val || !lbl) return;
  const h = parseFloat(val.value) || 0;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  lbl.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function getResolvedWeatherEffect() {
  if (isEarthSelected() || isMilkywaySelected()) {
    if (isEarthSelected() && state.settings.autoWeather) {
      if (lastWeatherAtmosphere?.effect) {
        return normalizeWeatherEffect(lastWeatherAtmosphere.effect);
      }
      return 'clear';
    }
    return normalizeWeatherEffect(state.settings.weatherEffect);
  }
  if (getResolvedTheme() !== 'default') return 'clear';
  if (state.settings.autoWeather) {
    if (lastWeatherAtmosphere?.effect) {
      return normalizeWeatherEffect(lastWeatherAtmosphere.effect);
    }
    const bg = getResolvedBgType();
    if (bg === 'night' || bg === 'sunset') return 'clear';
    return 'cloudy';
  }
  return normalizeWeatherEffect(state.settings.weatherEffect);
}

function backgroundUsesStars(bgType = getResolvedBgType()) {
  return bgType === 'night' || bgType === 'sunset';
}

// ─── Smooth sky (continuous time-of-day gradient) ──────────────
// Palettes keyed by hour of day (local time). Between slices we
// interpolate each RGB channel so the Default sky flows smoothly
// from night → sunrise → day → sunset → night.
const SKY_PALETTES = [
  { h: 0,  top:[6,9,22],  midTop:[16,19,42], mid:[26,30,58], bot:[6,8,20], sun:[235,240,255], sunX:0.70, sunY:0.16, sunA:0.10, stars:true },
  { h: 4.5, top:[8,12,28], midTop:[24,28,60], mid:[40,44,84], bot:[8,10,26], sun:[235,240,255], sunX:0.70, sunY:0.18, sunA:0.12, stars:true },
  { h: 6,   top:[55,78,128], midTop:[180,125,145], mid:[245,170,118], bot:[70,84,112], sun:[255,214,140], sunX:0.30, sunY:0.72, sunA:0.55, stars:false },
  { h: 8.5, top:[65,140,190], midTop:[145,190,218], mid:[190,220,215], bot:[125,165,170], sun:[255,250,210], sunX:0.42, sunY:0.30, sunA:0.38, stars:false },
  { h: 12,  top:[77,143,196], midTop:[114,179,214], mid:[183,218,222], bot:[183,214,204], sun:[255,254,230], sunX:0.68, sunY:0.20, sunA:0.42, stars:false },
  { h: 16,  top:[67,125,185], midTop:[110,168,205], mid:[190,214,175], bot:[145,178,165], sun:[255,242,150], sunX:0.78, sunY:0.30, sunA:0.30, stars:false },
  { h: 18,  top:[44,40,96],  midTop:[146,84,150], mid:[252,148,110], bot:[168,70,86], sun:[255,160,90], sunX:0.62, sunY:0.62, sunA:0.55, stars:false },
  { h: 20,  top:[16,20,42],  midTop:[50,40,84],  mid:[110,70,120],  bot:[20,16,40],  sun:[255,150,110], sunX:0.55, sunY:0.70, sunA:0.22, stars:true },
  { h: 24,  top:[6,9,22],  midTop:[16,19,42], mid:[26,22,58], bot:[6,8,20], sun:[235,240,255], sunX:0.70, sunY:0.16, sunA:0.10, stars:true },
];

function _clamp01(v) { return Math.max(0, Math.min(1, v)); }
function _hexRgb(c) { return [c>>16 & 255, c>>8 & 255, c & 255]; }

function _lerpColors(a, b, t) {
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
function _rgbCss(c) { return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`; }

// Resolve a continuous palette (with per-channel interpolation) for any hour in local time.
function skyPaletteAt(hour) {
  let h = ((hour % 24) + 24) % 24;
  const p = SKY_PALETTES;
  let i = 0;
  while (i < p.length - 1 && h > p[i + 1].h) i++;
  const a = p[i];
  const b = p[(i + 1) % p.length];
  let spanA = a.h, spanB = b.h;
  if (spanB <= spanA) spanB += 24;
  let local = h;
  if (local < spanA) local += 24;
  const t = (local - spanA) / (spanB - spanA);
  const out = {
    top: _lerpColors(a.top, b.top, t),
    midTop: _lerpColors(a.midTop, b.midTop, t),
    mid: _lerpColors(a.mid, b.mid, t),
    bot: _lerpColors(a.bot, b.bot, t),
    sun: _lerpColors(a.sun, b.sun, t),
    sunX: a.sunX + (b.sunX - a.sunX) * t,
    sunY: a.sunY + (b.sunY - a.sunY) * t,
    sunA: a.sunA + (b.sunA - a.sunA) * t,
    stars: t < 0.5 ? a.stars : b.stars,
  };
  return out;
}

// Solar disk glow layer (follows the sun position across the sky).
function _skyGlowStop(p) {
  return `
    radial-gradient(circle at ${Math.round(p.sunX*100)}% ${Math.round(p.sunY*100)}%,
      rgba(255,252,235,${0.9*p.sunA}) 0%,
      rgba(255,230,150,${0.6*p.sunA}) 8%,
      rgba(255,200,110,${0.3*p.sunA}) 18%,
      rgba(255,170,90,${0.12*p.sunA}) 30%,
      transparent 55%)`;
}

// Produce the CSS background string for bg-layer at a given local hour and optional eclipse dim (0..1).
function smoothSkyBackground(hour, eclipseDim = 0) {
  const p = skyPaletteAt(hour);
  const glow = _skyGlowStop(p);
  const g = glow + `, ` +
    `linear-gradient(180deg,
      ${_rgbCss(p.top)} 0%,
      ${_rgbCss(p.midTop)} 38%,
      ${_rgbCss(p.mid)} 68%,
      ${_rgbCss(p.bot)} 100%)`;
  if (eclipseDim > 0) {
    return `linear-gradient(180deg, rgba(8,10,18,${eclipseDim}) 0%, rgba(6,8,16,${eclipseDim}) 100%), ` + g;
  }
  return g;
}

// ─── Solar eclipse (NASA official data + live detection) ───────
// Source: NASA / F. Espenak, GSFC — Solar Eclipses 2021–2030
// (eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html). Times are UT
// of "greatest eclipse"; the ephemeris below dims the sky live.
const NASA_SOLAR_ECLIPSES = [
  { id:'2026A', date:'2026-02-17T12:13:05Z', type:'Annular', mag:0.963, dur:'2m20s' },
  { id:'2026T', date:'2026-08-12T17:47:05Z', type:'Total',   mag:1.039, dur:'2m18s' },
  { id:'2027A', date:'2027-02-06T16:00:47Z', type:'Annular', mag:0.928, dur:'7m51s' },
  { id:'2027T', date:'2027-08-02T10:07:49Z', type:'Total',   mag:1.079, dur:'6m23s' },
  { id:'2028A', date:'2028-01-26T15:08:58Z', type:'Annular', mag:0.921, dur:'10m27s' },
  { id:'2028T', date:'2028-07-22T02:56:39Z', type:'Total',   mag:1.056, dur:'5m10s' },
  { id:'2029P1',date:'2029-06-12T04:06:13Z', type:'Partial', mag:0.458, dur:'—' },
  { id:'2030A', date:'2030-06-01T06:29:13Z', type:'Annular', mag:0.944, dur:'5m21s' },
  { id:'2030T', date:'2030-11-25T06:51:37Z', type:'Total',   mag:1.047, dur:'3m44s' },
];

function getSunEcliptic(date) {
  const J2000 = Date.UTC(2000,0,1,12,0,0);
  const d = (date.getTime()-J2000)/86400000;
  const T = d/36525;
  const g = (357.52911 + 35999.05029*T) % 360;
  const gRad = g*Math.PI/180;
  const L = 280.46646 + 36000.76983*T + 0.0003032*T*T;
  const lam = (L + (1.9146 - 0.004817*T - 0.000014*T*T)*Math.sin(gRad)
    + (0.019993 - 0.000101*T)*Math.sin(2*gRad) + 0.0002*Math.sin(3*gRad)) % 360;
  const lamRad = lam*Math.PI/180;
  const eps = (23.439291 - 0.01300417*T)*Math.PI/180;
  const x = Math.cos(lamRad), y = Math.sin(lamRad)*Math.cos(eps), z = Math.sin(lamRad)*Math.sin(eps);
  return { ra: Math.atan2(y,x), dec: Math.atan2(z, Math.sqrt(x*x+y*y)) };
}

function getMoonEcliptic(date) {
  const J2000 = Date.UTC(2000,0,1,12,0,0);
  const d = (date.getTime()-J2000)/86400000;
  const T = d/36525;
  const L0 = ((218.3165 + 481267.8813*T) % 360 + 360) % 360;
  const M  = ((357.5291 + 35999.0503*T) % 360 + 360) % 360;
  const Mr = M*Math.PI/180;
  const F  = ((93.2720 + 483202.0175*T) % 360 + 360) % 360;
  const Fr = F*Math.PI/180;
  const D  = ((297.8502 + 445267.1115*T) % 360 + 360) % 360;
  const Dr = D*Math.PI/180;
  const lam = (L0 + 6.289*Math.sin(Mr) + 1.274*Math.sin(2*Dr-Mr)
    + 0.658*Math.sin(2*Dr) + 0.214*Math.sin(2*Mr)
    - 0.186*Math.sin(Mr) - 0.114*Math.sin(2*Fr)) % 360;
  const beta = 5.128*Math.sin(Fr);
  const lamRad = lam*Math.PI/180, betRad = beta*Math.PI/180;
  const eps = (23.439 - 0.0000004*d)*Math.PI/180;
  const x = Math.cos(betRad)*Math.cos(lamRad);
  const y = Math.cos(betRad)*Math.sin(lamRad);
  const z = Math.sin(betRad);
  const xEq = x;
  const yEq = y*Math.cos(eps) - z*Math.sin(eps);
  const zEq = y*Math.sin(eps) + z*Math.cos(eps);
  return { ra: Math.atan2(yEq,xEq), dec: Math.atan2(zEq, Math.sqrt(xEq*xEq+yEq*yEq)) };
}

// Live eclipse amount (0..1) from NASA's official greatest-eclipse timestamps.
// The local ephemeris helpers above are useful for astronomy visuals, but are
// not accurate enough to decide the exact second of a real eclipse. The
// catalogue is the source of truth for this UI indicator.
function computeEclipseDim(date = new Date()) {
  const time = date.getTime();
  let nearest = null;
  for (const eclipse of NASA_SOLAR_ECLIPSES) {
    const ts = Date.parse(eclipse.date);
    const distance = Math.abs(time - ts);
    if (!nearest || distance < nearest.distance) nearest = { eclipse, distance };
  }
  // Greatest-eclipse is an instant. Use a short tolerance for clock/network
  // jitter so a tab repaint does not miss it, without darkening normal days.
  const tolerance = 15 * 60 * 1000;
  if (!nearest || nearest.distance > tolerance) return 0;
  return _clamp01(1 - nearest.distance / tolerance);
}

function getNextSolarEclipse(fromMs = Date.now()) {
  return NASA_SOLAR_ECLIPSES
    .map(e => ({ ...e, ts: Date.parse(e.date) }))
    .filter(e => e.ts >= fromMs)
    .sort((a,b) => a.ts-b.ts)[0] || null;
}

// Global flag: when the bottom-left panel simulates an eclipse for preview.
let eclipsePreview = 0; // 0 = off, >0 dim
let skyTransitionTimer = null;
function crossfadeSky(background, initial = false) {
  const current = document.getElementById('bg-layer');
  const next = document.getElementById('bg-layer-next');
  if (!current || !next) return;
  if (initial) {
    current.style.background = background;
    next.style.opacity = '0';
    next.style.background = '';
    return;
  }
  next.style.transition = 'none';
  next.style.background = background;
  next.style.opacity = '0';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      next.style.transition = 'opacity 1.2s ease';
      next.style.opacity = '1';
    });
  });
  clearTimeout(skyTransitionTimer);
  skyTransitionTimer = setTimeout(() => {
    current.style.background = background;
    next.style.transition = 'none';
    next.style.opacity = '0';
    next.style.background = '';
  }, 1250);
}
function getEclipseDimForDisplay() {
  if (eclipsePreview > 0) return eclipsePreview;
  return computeEclipseDim(new Date());
}

function normalizeTheme(value) {
  if (value === 'auto') return 'default';
  if (['default', 'liquid', 'galaxy'].includes(value)) return value;
  return 'default';
}
function getResolvedTheme() {
  return normalizeTheme(state.settings.theme);
}

// Small, documented console API for power users and debugging. It only
// calls the same state/update paths as the UI, so commands stay reversible.
function installConsoleCommands() {
  const api = {
    getState() { return JSON.parse(JSON.stringify(state)); },
    setTheme(theme) {
      const value = normalizeTheme(theme);
      state.settings.theme = value;
      const radio = document.querySelector(`input[name="theme"][value="${value}"]`);
      if (radio) radio.checked = true;
      applySettings();
      saveState();
      return value;
    },
    setGalaxyBody(body) {
  const allowed = ['milkyway', 'earth', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'blackplanet', 'blackhole'];
      if (!allowed.includes(body)) throw new Error(`Unknown Galaxy body: ${body}`);
      state.settings.theme = 'galaxy';
      state.settings.galaxyPlanet = body;
      const select = document.getElementById('s-galaxy-planet');
      if (select) select.value = body;
      applySettings();
      saveState();
      return body;
    },
    setTime(hour) {
      const value = Number(hour);
      if (!Number.isFinite(value) || value < 0 || value > 24) throw new Error('Time must be between 0 and 24');
      state.settings.autoDayNight = false;
      state.settings.bgTime = value;
      const slider = document.getElementById('s-bg-time');
      const auto = document.getElementById('s-auto-daynight');
      if (slider) slider.value = value;
      if (auto) auto.checked = false;
      updateBgTimeLabel();
      applySettings();
      saveState();
      return value;
    },
    setAutoTime(enabled = true) {
      state.settings.autoDayNight = Boolean(enabled);
      const auto = document.getElementById('s-auto-daynight');
      if (auto) auto.checked = state.settings.autoDayNight;
      applySettings();
      saveState();
      return state.settings.autoDayNight;
    },
    previewEclipse() { eclipsePreview = 0.85; applySettings(); return true; },
    clearEclipse() { eclipsePreview = 0; applySettings(); return true; },
    clearWallpaper() { selectWallpaper(null); saveState(); applySettings(); return true; },
    setSleepTime(hour) {
      const value = Number(hour);
      if (!Number.isFinite(value) || value < 0 || value > 23) throw new Error('Hour must be between 0 and 23');
      window.__sleepDebugHour = value;
      return `Sleep glow locked to ${value}:00`;
    },
    setSleepAutoTime() {
      window.__sleepDebugHour = undefined;
      return 'Sleep glow returned to automatic mode';
    }
  };
  window.SpaceDial = api;
  window.spacedial = api;
}
function isMilkywaySelected() {
  return getResolvedTheme() === 'galaxy' && (state.settings.galaxyPlanet || 'earth') === 'milkyway';
}
function isEarthSelected() {
  return getResolvedTheme() === 'galaxy' && (state.settings.galaxyPlanet || 'earth') === 'earth';
}
function isFixedWallpaperTheme() {
  const t = getResolvedTheme();
  return t === 'liquid' || isEarthSelected() || isMilkywaySelected();
}

// ─── Apply settings to DOM ──────────────────────────────────
function applySettings(initial) {
  const s = state.settings;
  s.galaxyPlanet = normalizeGalaxyBody(s.galaxyPlanet);
  const root = document.documentElement;

  // Background
  const bgLayer = document.getElementById('bg-layer');
  const nextBgLayer = document.getElementById('bg-layer-next');
  const weatherLayer = document.getElementById('weather-layer');
  const starsCanvas = document.getElementById('stars-canvas');
  const galaxyCanvas = document.getElementById('galaxy-canvas');
  
  if (initial) {
    bgLayer.style.transition = 'none';
    const tabBar = document.getElementById('tab-bar');
    if (tabBar) tabBar.style.transition = 'none';
  } else {
    bgLayer.style.transition = '';
    const tabBar = document.getElementById('tab-bar');
    if (tabBar) tabBar.style.transition = '';
  }

  const theme = getResolvedTheme();
  const galaxy = theme === 'galaxy';
  const galaxyPlanet = s.galaxyPlanet || 'earth';
  const milkyway = galaxy && galaxyPlanet === 'milkyway';
  const earth = galaxy && galaxyPlanet === 'earth';
  const simPlanet = galaxy && !milkyway && !earth;
  const fixedBg = theme === 'liquid' || galaxy;
  const bgType = galaxy ? 'galaxy' : (fixedBg ? theme : getResolvedBgType());
  const weatherEffect = galaxy || theme === 'liquid' ? 'clear' : getResolvedWeatherEffect();
  root.dataset.bg = bgType;
  root.dataset.weather = weatherEffect;
  root.dataset.theme = theme;
  root.dataset.liquidVariant = theme === 'liquid' ? (s.liquidVariant || 'light') : '';
  if (galaxy) {
    bgLayer.className = milkyway ? 'bg-milkyway' : (earth ? 'bg-earth' : 'bg-planet');
    weatherLayer.className = '';
    bgLayer.style.background = '';
    bgLayer.style.backgroundImage = '';
    if (nextBgLayer) { nextBgLayer.style.opacity = '0'; nextBgLayer.style.background = ''; }
  } else if (theme === 'liquid') {
    bgLayer.className = 'bg-liquid';
    weatherLayer.className = '';
    bgLayer.style.background = '';
    bgLayer.style.backgroundImage = '';
    if (nextBgLayer) { nextBgLayer.style.opacity = '0'; nextBgLayer.style.background = ''; }
  } else {
    bgLayer.className = `bg-${bgType}`;
    weatherLayer.className = weatherEffect === 'clear' ? '' : `weather-${weatherEffect}`;
  }
  if (galaxyCanvas) galaxyCanvas.style.display = sleepActive ? 'none' : (milkyway ? 'block' : 'none');
  const planetCanvas = document.getElementById('planet-canvas');
  if (planetCanvas) planetCanvas.style.display = simPlanet ? 'block' : 'none';
  const earthCanvas = document.getElementById('earth-canvas');
  if (earthCanvas) earthCanvas.style.display = earth ? 'block' : 'none';
  if (!earth && typeof EarthTheme !== 'undefined' && EarthTheme.isActive()) {
    EarthTheme.destroy();
  }
  if (!simPlanet && typeof GalaxyTheme !== 'undefined' && GalaxyTheme.isActive()) {
    GalaxyTheme.destroy();
  }
  const earthTimePanel = document.getElementById('earth-time-panel');
  if (earthTimePanel) earthTimePanel.style.display = earth ? 'flex' : 'none';
  const skyTimePanel = document.getElementById('sky-time-panel');
  if (skyTimePanel) skyTimePanel.style.display = theme === 'default' && !galaxy && !isFixedWallpaperTheme() ? 'flex' : 'none';
  const bgOverlay = document.getElementById('bg-overlay');
  if (bgOverlay) bgOverlay.style.display = earth ? 'none' : '';
  starsCanvas.style.display = galaxy ? 'none' : (backgroundUsesStars(bgType) ? 'block' : 'none');
  weatherLayer.style.display = weatherEffect === 'clear' ? 'none' : 'block';

  root.style.setProperty('--overlay-op', s.overlayOp);
  root.style.setProperty('--cols', s.cols);
  root.style.setProperty('--dial-icon-scale', `${getIconScale(s.dialIconScale) / 100}`);

  // Dial shape — proper aspect-ratio values
  const ratios = { wide: '16/9', square: '1/1', tall: '3/4' };
  root.style.setProperty('--dial-aspect', ratios[s.dialShape] || '16/9');

  root.dataset.glass = s.glass ? (s.glassStyle || 'standard') : 'none';
  root.dataset.tabStyle = s.tabStyle || 'default';
  // Dial appearance
  document.querySelectorAll('.dial-card:not(.dial-add)').forEach(c => {
    c.classList.toggle('no-border', !s.showBorder);
    c.classList.toggle('no-glass', !s.glass);
    c.classList.toggle('no-zoom', !s.hoverZoom);
    c.querySelectorAll('.dial-label').forEach(l => l.classList.toggle('hidden', !s.showLabel));
    c.querySelectorAll('.dial-favicon,.dial-letter').forEach(i => i.style.display = s.showFavicon ? '' : 'none');
  });

  // Widget visibility
  document.getElementById('clock-block').style.display = s.showClock ? '' : 'none';
  document.getElementById('weather-block').style.display = s.showWeather ? '' : 'none';
  document.getElementById('weather-forecast').style.display = s.showWeather && s.showWeatherForecast ? '' : 'none';
  document.getElementById('player-block').style.display = s.showPlayer ? '' : 'none';
  document.getElementById('notes-block').style.display = s.showNotes ? '' : 'none';
  const addDialCard = document.querySelector('#dials-grid .dial-add');
  if (addDialCard) addDialCard.style.display = s.showAddDialButton ? '' : 'none';
  document.getElementById('add-tab-btn').style.display = s.showAddTabButton ? '' : 'none';
  document.getElementById('focus-btn').style.display = s.showFocusButton ? '' : 'none';
  document.getElementById('speedtest-btn').style.display = s.showSpeedTestButton ? '' : 'none';
  document.getElementById('ai-btn').style.display = s.showAiButton ? '' : 'none';

  // Player state
  document.getElementById('btn-shuffle').classList.toggle('on', state.player.shuffle);
  document.getElementById('btn-repeat').classList.toggle('on', state.player.repeat);
  document.getElementById('player-vol').value = state.player.volume;
  audio.volume = state.player.volume;

  // Notes content
  const notesArea = document.getElementById('notes-area');
  if (notesArea && initial) notesArea.value = state.notes || '';

  if (milkyway) drawGalaxyStars();
  else if (theme === 'default' && backgroundUsesStars(bgType)) drawStars();

  // Apply custom wallpaper if set (Default theme).
  if (theme === 'default') {
    if (s.wallpaper) {
      applyWallpaperPreview(s.wallpaper);
    } else {
      const eclipseDim = getEclipseDimForDisplay();
      crossfadeSky(smoothSkyBackground(getResolvedSkyHour(), eclipseDim), Boolean(initial));
      bgLayer.style.backgroundSize = '';
      bgLayer.style.backgroundPosition = '';
      bgLayer.style.backgroundRepeat = '';
      bgLayer.style.filter = '';
    }
  }

  if (earth) {
    const panel = document.getElementById('earth-time-panel');
    if (panel) panel.style.display = 'flex';
    const ec = document.getElementById('earth-canvas');
    if (ec && typeof EarthTheme !== 'undefined' && typeof THREE !== 'undefined') {
      ec.style.display = 'block';
      if (!EarthTheme.isActive()) {
        requestAnimationFrame(() => {
          try {
            EarthTheme.init(ec, s.weatherCity);
            if (typeof EarthTheme.setWeatherEffect === 'function') {
              const devOverride = sessionStorage.getItem('dev-earth-override');
              EarthTheme.setWeatherEffect(devOverride || getResolvedWeatherEffect());
            }
          }
          catch(e) { console.error('EarthTheme init failed:', e); }
        });
      } else if (typeof EarthTheme.setWeatherEffect === 'function') {
        const devOverride = sessionStorage.getItem('dev-earth-override');
        EarthTheme.setWeatherEffect(devOverride || getResolvedWeatherEffect());
      }
    }
  }
  if (galaxy && simPlanet) {
    const pc = document.getElementById('planet-canvas');
    if (pc && typeof GalaxyTheme !== 'undefined' && typeof THREE !== 'undefined') {
      pc.style.display = 'block';
      const planet = s.galaxyPlanet || 'earth';
      if (!GalaxyTheme.isActive()) {
        requestAnimationFrame(() => {
          try { GalaxyTheme.init(pc, planet); }
          catch(e) { console.error('GalaxyTheme init failed:', e); }
        });
      } else if (GalaxyTheme.getPlanet() !== planet) {
        GalaxyTheme.setPlanet(planet);
      }
    }
  }
  drawWeatherEffect(weatherEffect);
  updateSpeedTestTheme();
}

// ─── Earth sim-time control ─────────────────────────────────
function initEarthTimeControl() {
  const panel = document.getElementById('earth-time-panel');
  if (!panel) return;
  const toggle = document.getElementById('earth-time-toggle');
  const box = document.getElementById('earth-time-box');
  const input = document.getElementById('earth-time-input');
  const nowBtn = document.getElementById('earth-time-now');

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
  });
  nowBtn.addEventListener('click', () => {
    if (typeof EarthTheme !== 'undefined' && EarthTheme.setSimTime) EarthTheme.clearSimTime();
    input.value = '';
  });
  input.addEventListener('change', () => {
    if (!input.value) return;
    const ms = new Date(input.value).getTime();
    if (!isNaN(ms) && typeof EarthTheme !== 'undefined' && EarthTheme.setSimTime) {
      EarthTheme.setSimTime(ms);
    }
  });
  panel.querySelectorAll('.earth-time-presets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const ms = new Date(btn.dataset.ts + 'Z').getTime();
      input.value = btn.dataset.ts;
      if (typeof EarthTheme !== 'undefined' && EarthTheme.setSimTime) EarthTheme.setSimTime(ms);
    });
  });
}

// ─── Default-theme time & eclipse quick control ──────────────
function initSkyTimeControl() {
  const panel = document.getElementById('sky-time-panel');
  if (!panel) return;
  const toggle = document.getElementById('sky-time-toggle');
  const previewBtn = document.getElementById('sky-eclipse-now');
  const clearBtn = document.getElementById('sky-eclipse-clear');
  const status = document.getElementById('sky-eclipse-status');

  const refreshStatus = () => {
    if (!status) return;
    const next = getNextSolarEclipse();
    const live = computeEclipseDim(new Date());
    if (live > 0.15) status.textContent = `● Eclipse in progress (${Math.round(live*100)}%)`;
    else if (next) {
      const d = new Date(next.ts);
      status.textContent = `Next ${next.type.toLowerCase()} eclipse: ${d.toUTCString().replace(' GMT','')} (mag ${next.mag.toFixed(3)})`;
    } else status.textContent = 'Next: none in catalogue';
  };
  refreshStatus();

  toggle.addEventListener('click', () => panel.classList.toggle('open'));

  panel.querySelectorAll('[data-sky]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.sky;
      if (v === 'now') {
        state.settings.autoDayNight = true;
        const probe = document.getElementById('s-auto-daynight');
        if (probe) probe.checked = true;
      } else {
        state.settings.autoDayNight = false;
        state.settings.bgTime = _clamp01(parseFloat(v) / 24) * 24;
        const probe = document.getElementById('s-auto-daynight');
        if (probe) probe.checked = false;
        const bg = document.getElementById('s-bg-time');
        if (bg) { bg.value = state.settings.bgTime; updateBgTimeLabel(); }
      }
      applySettings();
      saveState();
    });
  });

  if (previewBtn) previewBtn.addEventListener('click', () => {
    const next = getNextSolarEclipse();
    if (next) {
      // Simulate the eclipse by dimming to its peak while keeping an artificially
      // "solar noon" sky so the effect is visible regardless of current local time.
      state.settings.autoDayNight = false;
      state.settings.bgTime = 12;
      const auto = document.getElementById('s-auto-daynight');
      if (auto) auto.checked = false;
      const save = document.getElementById('s-bg-time');
      if (save) { save.value = 12; updateBgTimeLabel(); }
      eclipsePreview = Math.max(0.55, Math.min(0.95, next.mag));
    } else {
      eclipsePreview = 0.8;
    }
    applySettings();
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    eclipsePreview = 0;
    applySettings();
  });
}

// ─── Stars ──────────────────────────────────────────────────
function drawStars() {
  const c = document.getElementById('stars-canvas');
  if (starsAnimationFrame) {
    cancelAnimationFrame(starsAnimationFrame);
    starsAnimationFrame = null;
  }
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  if (!backgroundUsesStars()) {
    c.style.display = 'none';
    return;
  }

  const ctx = c.getContext('2d');
  const count = Math.min(260, Math.max(120, Math.round((c.width * c.height) / 9000)));
  const travelBase = Math.max(240, c.width * 0.22);
  const parallaxAmp = Math.max(6, Math.min(20, c.width * 0.008));
  const stars = Array.from({ length: count }, () => {
    const targetX = Math.random() * c.width;
    const targetY = Math.random() * c.height;
    const fromLeft = Math.random() > 0.5;
    const driftY = (Math.random() - 0.5) * c.height * 0.18;
    const startX = fromLeft ? -travelBase - Math.random() * (c.width * 0.18) : c.width + travelBase + Math.random() * (c.width * 0.18);
    const startY = targetY + driftY;
    return {
      targetX,
      targetY,
      startX,
      startY,
      radius: Math.random() * 1.45 + 0.22,
      alpha: Math.random() * 0.82 + 0.14,
      delay: Math.random() * 260,
      duration: 900 + Math.random() * 850,
      twinkleSpeed: 0.0008 + Math.random() * 0.0018,
      twinkleOffset: Math.random() * Math.PI * 2,
      parallaxX: (Math.random() - 0.5) * parallaxAmp,
      parallaxY: (Math.random() - 0.5) * parallaxAmp,
      trail: 8 + Math.random() * 18
    };
  });
  let nextCometAt = performance.now() + 1800 + Math.random() * 2800;
  let comet = null;

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const startTime = performance.now();

  function render(now) {
    if (!backgroundUsesStars()) {
      ctx.clearRect(0, 0, c.width, c.height);
      starsAnimationFrame = null;
      return;
    }

    ctx.clearRect(0, 0, c.width, c.height);
    const settled = Math.max(0, Math.min(1, (now - startTime - 600) / 1800));
    const driftTime = (now - startTime) * 0.001;

    for (const star of stars) {
      const elapsed = now - startTime - star.delay;
      const progress = Math.max(0, Math.min(1, elapsed / star.duration));
      const eased = easeOutCubic(progress);
      const baseX = star.startX + (star.targetX - star.startX) * eased;
      const baseY = star.startY + (star.targetY - star.startY) * eased;
      const driftX = Math.sin(driftTime * 0.8 + star.twinkleOffset) * star.parallaxX * settled;
      const driftY = Math.cos(driftTime * 0.65 + star.twinkleOffset * 1.3) * star.parallaxY * settled;
      const x = baseX + driftX;
      const y = baseY + driftY;
      const twinkle = 0.72 + ((Math.sin(now * star.twinkleSpeed + star.twinkleOffset) + 1) * 0.5) * 0.42;
      const opacity = star.alpha * Math.max(0, Math.min(1, progress * 1.25)) * twinkle;

      if (progress < 1) {
        const trailX = x - (star.targetX - star.startX) * 0.018;
        const trailY = y - (star.targetY - star.startY) * 0.018;
        const grad = ctx.createLinearGradient(trailX - star.trail, trailY, x, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(235,245,255,${opacity * 0.46})`);
        ctx.beginPath();
        ctx.moveTo(trailX - star.trail, trailY);
        ctx.lineTo(x, y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = Math.max(0.4, star.radius * 0.9);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,250,255,${Math.min(1, opacity * 1.12)})`;
      ctx.fill();
    }

    if (!comet && now >= nextCometAt) {
      const startX = -80 - Math.random() * 120;
      const startY = 20 + Math.random() * Math.max(80, c.height * 0.2);
      const endX = c.width + 180;
      const endY = startY + 90 + Math.random() * Math.max(140, c.height * 0.22);
      comet = {
        startAt: now,
        duration: 1700 + Math.random() * 800,
        startX,
        startY,
        endX,
        endY,
        size: 1.8 + Math.random() * 1.8,
        tail: 120 + Math.random() * 80
      };
      nextCometAt = now + 7000 + Math.random() * 12000;
    }

    if (comet) {
      const progress = Math.max(0, Math.min(1, (now - comet.startAt) / comet.duration));
      const eased = easeOutCubic(progress);
      const x = comet.startX + (comet.endX - comet.startX) * eased;
      const y = comet.startY + (comet.endY - comet.startY) * eased;
      const angle = Math.atan2(comet.endY - comet.startY, comet.endX - comet.startX);
      const tailX = x - Math.cos(angle) * comet.tail;
      const tailY = y - Math.sin(angle) * comet.tail;
      const grad = ctx.createLinearGradient(tailX, tailY, x, y);
      grad.addColorStop(0, 'rgba(180,220,255,0)');
      grad.addColorStop(0.45, 'rgba(180,220,255,0.08)');
      grad.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = comet.size * 1.25;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, comet.size, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.98)';
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(180,220,255,0.85)';
      ctx.fill();
      ctx.shadowBlur = 0;

      if (progress >= 1) comet = null;
    }

    starsAnimationFrame = requestAnimationFrame(render);
  }

  starsAnimationFrame = requestAnimationFrame(render);
}

// ─── Galaxy theme ───────────────────────────────────────────
let galaxyMouse = { x: -9999, y: -9999, active: false };
function trackGalaxyMouse() {
  window.addEventListener('mousemove', e => {
    galaxyMouse.x = e.clientX;
    galaxyMouse.y = e.clientY;
    galaxyMouse.active = true;
  });
  window.addEventListener('mouseleave', () => { galaxyMouse.active = false; });
}

function initFabricHover() {
  const root = document.documentElement;
  let rafId = null;
  let targetX = 50, targetY = 50;
  let currentX = 50, currentY = 50;
  function update() {
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    root.style.setProperty('--mx', currentX + '%');
    root.style.setProperty('--my', currentY + '%');
    if (Math.abs(targetX - currentX) > 0.01 || Math.abs(targetY - currentY) > 0.01) {
      rafId = requestAnimationFrame(update);
    } else {
      rafId = null;
    }
  }
  document.addEventListener('mousemove', e => {
    targetX = (e.clientX / window.innerWidth) * 100;
    targetY = (e.clientY / window.innerHeight) * 100;
    if (!rafId) rafId = requestAnimationFrame(update);
  });
}
function drawGalaxyStars() {
  const c = document.getElementById('galaxy-canvas');
  if (!c) return;
  if (galaxyAnimationFrame) { cancelAnimationFrame(galaxyAnimationFrame); galaxyAnimationFrame = null; }
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  if (!isMilkywaySelected()) { c.style.display = 'none'; return; }

  const ctx = c.getContext('2d');
  const count = Math.min(150, Math.max(60, Math.round((c.width * c.height) / 15000)));
  const REPEL_R = Math.max(90, c.width * 0.075);
  const REPEL_STRENGTH = 54;
  const stars = Array.from({ length: count }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    baseX: 0, baseY: 0, // set below
    radius: Math.random() * 1.15 + 0.35,
    alpha: Math.random() * 0.55 + 0.25,
    twinkleSpeed: 0.001 + Math.random() * 0.0025,
    twinkleOffset: Math.random() * Math.PI * 2,
    ox: 0, oy: 0, // current repulsion offset
    vx: 0, vy: 0
  }));
  stars.forEach(s => { s.baseX = s.x; s.baseY = s.y; });

  function render(now) {
    if (!isMilkywaySelected()) {
      ctx.clearRect(0, 0, c.width, c.height);
      galaxyAnimationFrame = null;
      return;
    }
    ctx.clearRect(0, 0, c.width, c.height);

    for (const star of stars) {
      // compute target repulsion offset
      let tx = 0, ty = 0;
      if (galaxyMouse.active || galaxyMouse.x !== -9999) {
        const dx = star.baseX - galaxyMouse.x;
        const dy = star.baseY - galaxyMouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < REPEL_R && dist > 0.001) {
          const strength = REPEL_STRENGTH * (1 - dist / REPEL_R);
          const inv = 1 / dist;
          tx = dx * inv * strength;
          ty = dy * inv * strength;
        }
      }
      // spring physics toward target offset
      star.vx += (tx - star.ox) * 0.06;
      star.vy += (ty - star.oy) * 0.06;
      star.vx *= 0.82;
      star.vy *= 0.82;
      star.ox += star.vx;
      star.oy += star.vy;

      const px = star.baseX + star.ox;
      const py = star.baseY + star.oy;
      const twinkle = 0.6 + ((Math.sin(now * star.twinkleSpeed + star.twinkleOffset) + 1) * 0.5) * 0.5;

      ctx.beginPath();
      ctx.arc(px, py, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(230,235,255,${Math.min(1, star.alpha * twinkle)})`;
      ctx.fill();
    }

    galaxyAnimationFrame = requestAnimationFrame(render);
  }

  galaxyAnimationFrame = requestAnimationFrame(render);
}

// ─── Sleep Mode ─────────────────────────────────────────────
function initSleepMode() {
  sleepCanvas = document.getElementById('sleep-canvas');
  if (!sleepCanvas) return;
  sleepCtx = sleepCanvas.getContext('2d');
  sleepCanvas.width = window.innerWidth;
  sleepCanvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    if (!sleepActive) return;
    sleepCanvas.width = window.innerWidth;
    sleepCanvas.height = window.innerHeight;
    generateSleepStars();
  });

  sleepCanvas.addEventListener('click', () => { if (sleepActive) exitSleepMode(); });
  sleepCanvas.addEventListener('mousemove', () => { if (sleepActive) exitSleepMode(); });
  document.addEventListener('keydown', () => { if (sleepActive) exitSleepMode(); });

  resetSleepTimer();
  const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  events.forEach(evt => document.addEventListener(evt, resetSleepTimer, { passive: true }));
}

function resetSleepTimer() {
  if (sleepActive) return;
  clearTimeout(sleepTimer);
  const timeout = (state.settings.sleepTimeout || 60) * 1000;
  sleepTimer = setTimeout(() => {
    if (!state.settings.sleepEnabled) return;
    if (document.querySelector('.overlay-panel.is-open')) return;
    if (focusSession) return;
    enterSleepMode();
  }, timeout);
}

function generateSleepStars() {
  sleepStars = [];
  const w = sleepCanvas.width;
  const h = sleepCanvas.height;
  const bgCount = Math.min(200, Math.max(80, Math.round((w * h) / 8000)));
  for (let i = 0; i < bgCount; i++) {
    sleepStars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.7 + 0.3
    });
  }
  sleepPlanetRadius = Math.min(w, h) * 0.28;
}

function enterSleepMode() {
  if (sleepActive) return;
  sleepActive = true;
  sleepFadePhase = 'entering';
  sleepFadeAlpha = 0;
  sleepEnterStart = performance.now();
  generateSleepStars();

  sleepCanvas.width = window.innerWidth;
  sleepCanvas.height = window.innerHeight;
  sleepCanvas.style.display = 'block';
  sleepCanvas.style.pointerEvents = 'auto';

  document.getElementById('tab-bar').style.opacity = '0';
  document.getElementById('view-home').style.opacity = '0';
  document.getElementById('view-dials').style.opacity = '0';
  document.getElementById('bg-layer').style.opacity = '0';
  document.getElementById('bg-layer-next').style.opacity = '0';
  document.getElementById('bg-overlay').style.opacity = '0';
  document.getElementById('fabric-overlay').style.opacity = '0';
  document.getElementById('stars-canvas').style.opacity = '0';
  document.getElementById('galaxy-canvas').style.opacity = '0';
  document.getElementById('planet-canvas').style.opacity = '0';
  document.getElementById('earth-canvas').style.opacity = '0';
  document.getElementById('weather-layer').style.opacity = '0';

  if (typeof EarthTheme !== 'undefined' && EarthTheme.isActive()) EarthTheme.destroy();
  if (typeof GalaxyTheme !== 'undefined' && GalaxyTheme.isActive()) GalaxyTheme.destroy();

  requestAnimationFrame(drawSleepFrame);
}

function exitSleepMode() {
  if (!sleepActive) return;
  sleepFadePhase = 'leaving';
  sleepExitStart = performance.now();
  sleepCanvas.style.pointerEvents = 'none';
}

function finishSleepExit() {
  sleepActive = false;
  sleepFadePhase = 'none';
  sleepFadeAlpha = 0;
  clearTimeout(sleepAnimId);
  cancelAnimationFrame(sleepAnimId);
  sleepAnimId = null;
  sleepCanvas.style.display = 'none';
  sleepCanvas.style.pointerEvents = '';
  sleepCanvas.style.opacity = '0';

  document.getElementById('tab-bar').style.opacity = '';
  document.getElementById('view-home').style.opacity = '';
  document.getElementById('view-dials').style.opacity = '';
  document.getElementById('bg-layer').style.opacity = '';
  document.getElementById('bg-overlay').style.opacity = '';
  document.getElementById('fabric-overlay').style.opacity = '';
  document.getElementById('stars-canvas').style.opacity = '';
  document.getElementById('galaxy-canvas').style.opacity = '';
  document.getElementById('planet-canvas').style.opacity = '';
  document.getElementById('earth-canvas').style.opacity = '';
  document.getElementById('weather-layer').style.opacity = '';

  applySettings(false);
  resetSleepTimer();
}

function drawSleepFrame(now) {
  if (sleepFadePhase === 'none' && !sleepActive) return;

  if (sleepFadePhase === 'entering') {
    const elapsed = now - sleepEnterStart;
    sleepFadeAlpha = Math.min(1, elapsed / 1200);
    if (sleepFadeAlpha >= 1) sleepFadePhase = 'none';
    sleepCanvas.style.opacity = String(sleepFadeAlpha);
  } else if (sleepFadePhase === 'leaving') {
    const elapsed = now - sleepExitStart;
    sleepFadeAlpha = Math.max(0, 1 - elapsed / 1000);
    sleepCanvas.style.opacity = String(sleepFadeAlpha);
    if (sleepFadeAlpha <= 0) { finishSleepExit(); return; }
  }

  drawSleepScene(now);

  if (sleepFadePhase !== 'none') {
    sleepAnimId = requestAnimationFrame(drawSleepFrame);
  } else {
    sleepAnimId = setTimeout(() => {
      sleepAnimId = requestAnimationFrame(drawSleepFrame);
    }, 1000);
  }
}

function drawSleepScene(now) {
  const w = sleepCanvas.width;
  const h = sleepCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = sleepPlanetRadius;
  const ctx = sleepCtx;
  const colorGlow = state.settings.sleepColorGlow;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  for (const star of sleepStars) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220,225,255,${star.a})`;
    ctx.fill();
  }

  let glowR = 255, glowG = 255, glowB = 255;
  if (colorGlow) {
    const hour = window.__sleepDebugHour !== undefined ? window.__sleepDebugHour : new Date().getHours();
    if (hour >= 0 && hour < 5)       { glowR = 25;  glowG = 40;  glowB = 100; }
    else if (hour >= 5 && hour < 8)  { glowR = 255; glowG = 140; glowB = 50;  }
    else if (hour >= 8 && hour < 17) { glowR = 170; glowG = 210; glowB = 255; }
    else if (hour >= 17 && hour < 20){ glowR = 255; glowG = 100; glowB = 80;  }
    else                             { glowR = 40;  glowG = 50;  glowB = 120; }
  }

  const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 2.5);
  glowGrad.addColorStop(0, `rgba(${glowR},${glowG},${glowB},0.18)`);
  glowGrad.addColorStop(0.2, `rgba(${glowR},${glowG},${glowB},0.10)`);
  glowGrad.addColorStop(0.5, `rgba(${glowR},${glowG},${glowB},0.04)`);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const now2 = new Date();
  const hh = String(now2.getHours()).padStart(2, '0');
  const mm = String(now2.getMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm}`;
  const fontSize = Math.max(36, r * 0.42);

  const weatherY = cy - fontSize * 0.7;
  const clockY = cy;
  const dateY = cy + fontSize * 0.65;
  const hintY = cy + fontSize * 1.2;

  if (lastWeatherDesc) {
    const weatherStr = lastWeatherDesc + '  ' + lastWeatherTemp;
    const weatherSize = Math.max(11, r * 0.10);
    ctx.font = `300 ${weatherSize}px 'SF Pro Rounded', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillText(weatherStr, cx, weatherY);
  }

  ctx.font = `300 ${fontSize}px 'SF Pro Rounded', sans-serif`;
  ctx.fillStyle = `rgba(255,255,255,${0.8 + Math.sin(now * 0.001) * 0.08})`;
  ctx.shadowColor = `rgba(${glowR},${glowG},${glowB},0.35)`;
  ctx.shadowBlur = 14;
  ctx.fillText(timeStr, cx, clockY);
  ctx.shadowBlur = 0;

  const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dateStr = `${days[now2.getDay()]},  ${now2.getDate()} ${months[now2.getMonth()]}`;
  const dateSize = Math.max(10, r * 0.10);
  ctx.font = `300 ${dateSize}px 'SF Pro Rounded', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText(dateStr, cx, dateY);

  const hint = 'move mouse or press any key to wake up';
  const hintSize = Math.max(8, r * 0.06);
  ctx.font = `100 ${hintSize}px 'SF Pro Rounded', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillText(hint, cx, hintY);
}

// ─── Weather atmosphere ─────────────────────────────────────
function drawWeatherEffect(effect = getResolvedWeatherEffect()) {
  const c = document.getElementById('weather-layer');
  if (weatherAnimationFrame) {
    cancelAnimationFrame(weatherAnimationFrame);
    weatherAnimationFrame = null;
  }
if (typeof getResolvedTheme === 'function' && getResolvedTheme() === 'galaxy') {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    c.style.display = 'none';
    return;
  }
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  const mode = normalizeWeatherEffect(effect);
  if (mode === 'clear') {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    c.style.display = 'none';
    return;
  }
  c.style.display = 'block';
  const ctx = c.getContext('2d');
  const rand = (min, max) => min + Math.random() * (max - min);
  const bgType = getResolvedBgType();
  const brightClouds = mode === 'cloudy' && (bgType === 'day' || bgType === 'sunrise');
  const cloudBoost = brightClouds ? 1.75 : 1;
  let particles;
  let lastTime = performance.now();

  if (mode === 'rain') {
    const count = Math.min(450, Math.max(180, Math.round((c.width * c.height) / 5500)));
    particles = Array.from({ length: count }, () => makeRainDrop(c, rand, true));
  } else if (mode === 'snow') {
    const count = Math.min(240, Math.max(90, Math.round((c.width * c.height) / 9800)));
    particles = Array.from({ length: count }, () => makeSnowFlake(c, rand, true));
  } else if (mode === 'fog') {
    const count = Math.min(34, Math.max(18, Math.round(c.width / 64)));
    particles = Array.from({ length: count }, () => makeFogWisp(c, rand, true));
  } else {
    const count = Math.round(Math.min(34, Math.max(14, Math.round(c.width / 92))) * cloudBoost);
    particles = Array.from({ length: count }, () => makeCloudWisp(c, rand, true, cloudBoost));
  }

  function render(now) {
    if (normalizeWeatherEffect(getResolvedWeatherEffect()) !== mode) {
      ctx.clearRect(0, 0, c.width, c.height);
      weatherAnimationFrame = null;
      return;
    }
    const dt = Math.min(2, Math.max(0.45, (now - lastTime) / 16.67));
    lastTime = now;
    ctx.clearRect(0, 0, c.width, c.height);

    if (mode === 'rain') {
      ctx.lineCap = 'butt';
      for (const drop of particles) {
        drop.x += drop.wind * dt;
        drop.y += drop.speed * dt;
        if (drop.y - drop.len > c.height || drop.x > c.width + 120 || drop.x < -120) Object.assign(drop, makeRainDrop(c, rand, false));
        const alpha = drop.alpha * (0.8 + Math.sin(now * 0.0015 + drop.phase) * 0.12);
        ctx.strokeStyle = `rgba(170,210,245,${alpha})`;
        ctx.lineWidth = drop.width;
        ctx.beginPath();
        ctx.moveTo(drop.x - drop.slant, drop.y - drop.len);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
      }
    } else if (mode === 'snow') {
      for (const flake of particles) {
        flake.y += flake.speed * dt;
        flake.x += (flake.wind + Math.sin(now * flake.swaySpeed + flake.phase) * flake.sway) * dt;
        flake.spin += flake.spinSpeed * dt;
        if (flake.y - flake.size > c.height || flake.x < -80 || flake.x > c.width + 80) Object.assign(flake, makeSnowFlake(c, rand, false));
        const alpha = flake.alpha * (0.84 + Math.sin(now * 0.0012 + flake.phase) * 0.16);
        ctx.fillStyle = `rgba(245,250,255,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(flake.x, flake.y, flake.size * (1 + Math.sin(flake.spin) * 0.18), flake.size, flake.spin, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (mode === 'fog') {
      ctx.globalCompositeOperation = 'screen';
      for (const wisp of particles) {
        wisp.x += (wisp.speed + Math.sin(now * wisp.swaySpeed + wisp.phase) * wisp.sway) * dt;
        wisp.y += Math.cos(now * wisp.swaySpeed * 0.7 + wisp.phase) * wisp.lift * dt;
        if (wisp.x - wisp.rx > c.width + 140) Object.assign(wisp, makeFogWisp(c, rand, false));
        ctx.save();
        ctx.translate(wisp.x, wisp.y);
        ctx.rotate(wisp.rot);
        ctx.scale(1, wisp.ry / wisp.rx);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, wisp.rx);
        grad.addColorStop(0, `rgba(230,238,245,${wisp.alpha})`);
        grad.addColorStop(0.48, `rgba(210,224,236,${wisp.alpha * 0.45})`);
        grad.addColorStop(1, 'rgba(210,224,236,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, wisp.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      for (const cloud of particles) {
        cloud.x += (cloud.speed + Math.sin(now * cloud.swaySpeed + cloud.phase) * cloud.sway) * dt;
        cloud.y += Math.cos(now * cloud.swaySpeed * 0.55 + cloud.phase) * cloud.lift * dt;
        if (cloud.x - cloud.rx > c.width + 180) Object.assign(cloud, makeCloudWisp(c, rand, false, cloudBoost));
        ctx.save();
        ctx.translate(cloud.x, cloud.y);
        ctx.rotate(cloud.rot);
        ctx.scale(1, cloud.ry / cloud.rx);
        const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, cloud.rx);
        if (brightClouds) {
          shadow.addColorStop(0, `rgba(78,96,120,${cloud.alpha * 0.9})`);
          shadow.addColorStop(0.42, `rgba(96,116,140,${cloud.alpha * 0.58})`);
          shadow.addColorStop(0.78, `rgba(126,146,168,${cloud.alpha * 0.2})`);
          shadow.addColorStop(1, 'rgba(126,146,168,0)');
        } else {
          shadow.addColorStop(0, `rgba(245,248,252,${cloud.alpha})`);
          shadow.addColorStop(0.34, `rgba(220,232,242,${cloud.alpha * 0.72})`);
          shadow.addColorStop(0.72, `rgba(168,188,210,${cloud.alpha * 0.24})`);
          shadow.addColorStop(1, 'rgba(168,188,210,0)');
        }
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, 0, cloud.rx, 0, Math.PI * 2);
        ctx.fill();
        if (brightClouds) {
          const highlight = ctx.createRadialGradient(-cloud.rx * 0.18, -cloud.rx * 0.08, 0, -cloud.rx * 0.18, -cloud.rx * 0.08, cloud.rx * 0.74);
          highlight.addColorStop(0, `rgba(255,255,255,${cloud.alpha * 0.72})`);
          highlight.addColorStop(0.44, `rgba(245,250,255,${cloud.alpha * 0.32})`);
          highlight.addColorStop(1, 'rgba(245,250,255,0)');
          ctx.fillStyle = highlight;
          ctx.beginPath();
          ctx.arc(0, 0, cloud.rx * 0.82, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = brightClouds ? 'rgba(62,82,108,0.16)' : 'rgba(70,85,105,0.08)';
      ctx.fillRect(0, 0, c.width, c.height);
    }

    weatherAnimationFrame = requestAnimationFrame(render);
  }

  weatherAnimationFrame = requestAnimationFrame(render);
}

function makeRainDrop(c, rand, initial) {
  const wind = rand(-2.5, 4.5);
  return {
    x: rand(-80, c.width + 80),
    y: initial ? rand(-c.height * 0.5, 0) : rand(-200, -40),
    len: rand(60, 180),
    speed: rand(18, 32),
    slant: wind * 3 + rand(-0.5, 0.5),
    wind: wind,
    width: rand(0.5, 1.4),
    alpha: rand(0.18, 0.42),
    wobble: 0,
    wobbleSpeed: 0,
    phase: Math.random() * Math.PI * 2
  };
}

function makeSnowFlake(c, rand, initial) {
  return {
    x: rand(-40, c.width + 40),
    y: initial ? rand(-c.height, c.height) : rand(-90, -8),
    size: rand(0.8, 3.4),
    speed: rand(0.45, 2.2),
    wind: rand(-0.45, 1.1),
    sway: rand(0.35, 1.9),
    swaySpeed: rand(0.0012, 0.0045),
    spin: rand(0, Math.PI * 2),
    spinSpeed: rand(-0.035, 0.035),
    alpha: rand(0.32, 0.82),
    phase: Math.random() * Math.PI * 2
  };
}

function makeFogWisp(c, rand, initial) {
  return {
    x: initial ? rand(-c.width * 0.2, c.width * 1.05) : rand(-240, -60),
    y: rand(c.height * 0.12, c.height * 0.92),
    rx: rand(150, 420),
    ry: rand(42, 150),
    speed: rand(0.05, 0.32),
    sway: rand(0.03, 0.22),
    swaySpeed: rand(0.00018, 0.00065),
    lift: rand(0.02, 0.16),
    rot: rand(-0.18, 0.18),
    alpha: rand(0.025, 0.09),
    phase: Math.random() * Math.PI * 2
  };
}

function makeCloudWisp(c, rand, initial, boost = 1) {
  return {
    x: initial ? rand(-c.width * 0.25, c.width * 1.08) : rand(-320, -100),
    y: rand(c.height * 0.03, c.height * (boost > 1 ? 0.56 : 0.46)),
    rx: rand(190, 560),
    ry: rand(52, 150),
    speed: rand(0.06, 0.26),
    sway: rand(0.02, 0.16),
    swaySpeed: rand(0.00012, 0.00046),
    lift: rand(0.015, 0.1),
    rot: rand(-0.12, 0.1),
    alpha: rand(0.09, 0.21) * boost,
    phase: Math.random() * Math.PI * 2
  };
}

// ─── Clock ──────────────────────────────────────────────────
const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function startClock() { updateClock(); setInterval(updateClock, 1000); }

// Refresh the Default smooth sky once a minute so Auto mode stays in sync.
let _lastSkyMinute = -1;
function refreshSkyMinute(now) {
  const theme = getResolvedTheme();
  if (theme !== 'default' || state.settings.wallpaper) { _lastSkyMinute = -1; return; }
  const key = now.getMinutes();
  if (key === _lastSkyMinute) return;
  _lastSkyMinute = key;
  applySettings(false);
  const panel = document.getElementById('sky-eclipse-status');
  if (panel) {
    const next = getNextSolarEclipse();
    panel.textContent = next
      ? `Next ${next.type.toLowerCase()} eclipse: ${new Date(next.ts).toUTCString().replace(' GMT','')}`
      : 'Next: none in catalogue';
  }
}

function formatClockText(now) {
  const s = state.settings;
  let hh = now.getHours(), mm = now.getMinutes(), ss = now.getSeconds();
  if (!s.use24h) {
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    return `- ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}${s.showSeconds ? ':'+String(ss).padStart(2,'0') : ''} ${ampm} -`;
  }
  return `- ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}${s.showSeconds ? ':'+String(ss).padStart(2,'0') : ''} -`;
}

function isStaticTimeChar(char) {
  return /[\s:-]/.test(char);
}

function buildTimeSlot(char) {
  const slot = document.createElement('span');
  slot.className = 'time-slot' + (isStaticTimeChar(char) ? ' static' : '');
  slot.dataset.char = char;
  const inner = document.createElement('span');
  inner.className = 'time-slot-char';
  inner.textContent = char;
  slot.appendChild(inner);
  return slot;
}

function renderClockText(text) {
  const timeLine = document.getElementById('time-line');
  const chars = Array.from(text);

  if (!timeLine.children.length || timeLine.children.length !== chars.length) {
    timeLine.innerHTML = '';
    chars.forEach(char => timeLine.appendChild(buildTimeSlot(char)));
    lastClockText = text;
    return;
  }

  chars.forEach((char, idx) => {
    const slot = timeLine.children[idx];
    if (!slot || slot.dataset.char === char) return;

    if (isStaticTimeChar(char)) {
      slot.className = 'time-slot static';
      slot.dataset.char = char;
      slot.innerHTML = '';
      const inner = document.createElement('span');
      inner.className = 'time-slot-char';
      inner.textContent = char;
      slot.appendChild(inner);
      return;
    }

    const previous = document.createElement('span');
    previous.className = 'time-slot-char';
    previous.textContent = slot.dataset.char || '';

    const next = document.createElement('span');
    next.className = 'time-slot-char';
    next.textContent = char;

    slot.className = 'time-slot';
    slot.dataset.char = char;
    slot.innerHTML = '';
    slot.classList.add('leaving', 'entering');
    slot.append(previous, next);
    setTimeout(() => {
      slot.classList.remove('leaving', 'entering');
      slot.innerHTML = '';
      slot.appendChild(next);
    }, CLOCK_ANIM_MS);
  });

  lastClockText = text;
}

function updateClock() {
  const now = new Date();
  document.getElementById('day-name').textContent = DAYS[now.getDay()];
  document.getElementById('date-line').textContent =
    String(now.getDate()).padStart(2,'0') + '  ' + MONTHS[now.getMonth()] + ',  ' + now.getFullYear() + '.';
  const nextClockText = formatClockText(now);
  if (lastClockText !== nextClockText) renderClockText(nextClockText);
  refreshSkyMinute(now);
}

// ─── Weather ────────────────────────────────────────────────
async function fetchWeather() {
  if (!state.settings.showWeather && !state.settings.autoDayNight && !state.settings.autoWeather) return;
  const city = state.settings.weatherCity || 'Dublin';
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 12000);
  const sig = ac.signal;
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`, { signal: sig });
    const gd = await geo.json();
    if (!gd.results?.length) { clearTimeout(to); return; }
    const { latitude: lat, longitude: lon, name, country } = gd.results[0];
    const unit = state.settings.tempUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const forecastDays = state.settings.showWeatherForecast ? normalizeForecastDays(state.settings.weatherForecastDays) : 1;
    const dailyParams = state.settings.showWeatherForecast
      ? 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset'
      : 'sunrise,sunset';
    const currentParams = 'temperature_2m,weather_code,is_day,precipitation,rain,snowfall,cloud_cover,relative_humidity_2m,visibility';
    const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${currentParams}&daily=${dailyParams}&temperature_unit=${unit}&forecast_days=${forecastDays}&timezone=auto`, { signal: sig });
    const wd = await wx.json();
    clearTimeout(to);
    const temp = Math.round(wd.current.temperature_2m);
    const code = Number(wd.current.weather_code ?? wd.current.weathercode ?? 0);
    const isNight = Number(wd.current?.is_day) === 0;
    lastWeatherDesc = wmoDesc(code);
    lastWeatherTemp = temp + (unit === 'fahrenheit' ? '°F' : '°C');
    chrome.storage.local.set({ lastWeatherDesc, lastWeatherTemp });
    updateAtmosphereFromWeather(wd);
    if (state.settings.showWeather) {
      document.getElementById('weather-city').textContent = `${name.toUpperCase()}, ${country.toUpperCase()}`;
      document.getElementById('weather-desc').textContent = wmoDesc(code) + '  ' + temp + (unit === 'fahrenheit' ? '°F' : '°C');
      document.getElementById('weather-icon').className = `${wmoIcon(code)}${isNight ? ' night' : ''}`.trim();
      renderWeatherForecast(wd.daily, unit);
    }
  } catch(e) {
    clearTimeout(to);
    lastWeatherAtmosphere = null;
    state.lastWeatherAtmosphere = null;
    saveState({ scheduleBackup: false });
    applySettings();
    document.getElementById('weather-city').textContent = city.toUpperCase();
    document.getElementById('weather-desc').textContent = 'UNAVAILABLE';
    document.getElementById('weather-forecast').innerHTML = '';
  }
}

function updateAtmosphereFromWeather(data) {
  const phase = state.settings.autoDayNight ? getDayPhase(data) : null;
  const effect = state.settings.autoWeather ? getWeatherEffect(data.current || {}) : null;
  lastWeatherAtmosphere = { phase, effect };
  state.lastWeatherAtmosphere = lastWeatherAtmosphere;
  saveState({ scheduleBackup: false });
  applySettings();
}

function getDayPhase(data) {
  const currentTime = new Date(data.current?.time || Date.now()).getTime();
  const sunrise = new Date(data.daily?.sunrise?.[0] || '').getTime();
  const sunset = new Date(data.daily?.sunset?.[0] || '').getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(sunrise) || !Number.isFinite(sunset)) {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'sunrise';
    if (hour >= 8 && hour < 18) return 'day';
    if (hour >= 18 && hour < 21) return 'sunset';
    return 'night';
  }
  const halfHour = 30 * 60 * 1000;
  const oneHour = 60 * 60 * 1000;
  if (currentTime >= sunrise - halfHour && currentTime <= sunrise + oneHour) return 'sunrise';
  if (currentTime >= sunset - oneHour && currentTime <= sunset + halfHour) return 'sunset';
  if (currentTime > sunrise && currentTime < sunset) return 'day';
  return 'night';
}

function getWeatherEffect(current) {
  const code = Number(current.weather_code ?? current.weathercode ?? 0);
  const precipitation = Number(current.precipitation || 0);
  const rain = Number(current.rain || 0);
  const snow = Number(current.snowfall || 0);
  const visibility = Number(current.visibility || 0);
  const clouds = Number(current.cloud_cover || 0);
  const humidity = Number(current.relative_humidity_2m || 0);
  if (isMeteoSnowCode(code) || snow >= 0.1) return 'snow';
  if (rain >= 0.5 || precipitation >= 0.5 || isMeteoHeavyRainCode(code)) return 'rain';
  if (code === 45 || code === 48 || (visibility > 0 && visibility < 5000) || (clouds >= 90 && humidity >= 88)) return 'fog';
  if ((code >= 1 && code <= 3) || clouds >= 58) return 'cloudy';
  return 'clear';
}

function isMeteoSnowCode(code) {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function isMeteoHeavyRainCode(code) {
  return code === 65 || code === 67 || code === 81 || code === 82 || code >= 95;
}

function setPickedFileName(labelEl, file) {
  if (!labelEl) return;
  if (!file?.name) {
    labelEl.textContent = 'No file selected';
    return;
  }
  const maxLen = 28;
  const text = file.name.length > maxLen ? `${file.name.slice(0, maxLen - 1)}...` : file.name;
  labelEl.textContent = text;
}
function normalizeForecastDays(value) {
  return Number(value) === 16 ? 16 : 7;
}
function renderWeatherForecast(daily, unit) {
  const wrap = document.getElementById('weather-forecast');
  if (!state.settings.showWeatherForecast || !daily?.time?.length) {
    wrap.innerHTML = '';
    return;
  }
  const unitLabel = unit === 'fahrenheit' ? '°F' : '°C';
  const days = normalizeForecastDays(state.settings.weatherForecastDays);
  wrap.innerHTML = '';
  daily.time.slice(0, days).forEach((dateText, idx) => {
    const card = document.createElement('div');
    card.className = 'forecast-day';

    const label = document.createElement('div');
    label.className = 'forecast-label';
    label.textContent = idx === 0 ? 'Today' : new Date(dateText + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });

    const icon = document.createElement('div');
    icon.className = `forecast-icon ${wmoIcon(Number(daily.weather_code?.[idx] ?? 0))}`.trim();
    const precip = document.createElement('span');
    precip.className = 'forecast-precip';
    icon.appendChild(precip);

    const high = document.createElement('div');
    high.className = 'forecast-temp';
    high.textContent = formatForecastTemp(daily.temperature_2m_max?.[idx], unitLabel);

    const low = document.createElement('div');
    low.className = 'forecast-low';
    low.textContent = formatForecastTemp(daily.temperature_2m_min?.[idx], unitLabel);

    card.append(label, icon, high, low);
    wrap.appendChild(card);
  });
}
function formatForecastTemp(value, unitLabel) {
  const temp = Math.round(Number(value));
  return Number.isFinite(temp) ? `${temp}${unitLabel}` : '—';
}
function wmoDesc(c) {
  if (c===0) return 'CLEAR SKY';
  if (c<=2) return 'PARTLY CLOUDY';
  if (c===3) return 'OVERCAST';
  if (c<=49) return 'FOG';
  if (c<=59) return 'DRIZZLE';
  if (c<=69) return 'RAIN';
  if (c<=79) return 'SNOW';
  if (c<=84) return 'SHOWERS';
  return 'THUNDERSTORM';
}
function wmoIcon(c) {
  if (c===0) return '';
  if (c<=2) return 'partly';
  if (c<=49) return 'cloudy';
  if (c<=69) return 'rainy';
  if (c<=79) return 'snowy';
  return 'thunder';
}

// ─── Views / Tabs ────────────────────────────────────────────
function buildTabs() {
  const list = document.getElementById('tabs-list');
  list.innerHTML = '';
  const pill = document.createElement('div');
  pill.id = 'tabs-active-pill';
  list.appendChild(pill);
  state.groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (g.id === state.activeGroup ? ' active' : '') + (g.isHome ? ' home-tab' : '');
    btn.textContent = g.name;
    btn.dataset.id = g.id;
    btn.addEventListener('click', () => switchView(g.id));
    if (!g.isHome) {
      btn.addEventListener('dblclick', () => openTabModal(g.id));
      btn.addEventListener('contextmenu', e => { e.preventDefault(); openTabModal(g.id); });

      // Tab drag & drop (reorder)
      btn.draggable = true;
      btn.addEventListener('dragstart', e => {
        draggingTabId = g.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', g.id);
        e.dataTransfer.setData(TAB_DRAG_MIME, g.id);
      });
      btn.addEventListener('dragend', () => {
        draggingTabId = null;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('drag-over'));
      });
      btn.addEventListener('dragover', e => {
        const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
        const draggedTabId = e.dataTransfer?.getData(TAB_DRAG_MIME) || draggingTabId;
        if ((!draggedTabId && !draggedDialId) || draggedTabId === g.id) return;
        e.preventDefault();
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('drag-over'));
        btn.classList.add('drag-over');
        if (draggedDialId && dragHoverTabId !== g.id) {
          clearTimeout(dragHoverTimer);
          dragHoverTabId = g.id;
          dragHoverTimer = setTimeout(() => {
            if (state.activeGroup !== g.id) switchView(g.id);
            dragHoverTabId = null;
          }, 600);
        }
      });
      btn.addEventListener('dragleave', () => {
        btn.classList.remove('drag-over');
        if (dragHoverTabId === g.id) {
          clearTimeout(dragHoverTimer);
          dragHoverTabId = null;
        }
      });
      btn.addEventListener('drop', e => {
        e.preventDefault();
        btn.classList.remove('drag-over');
        clearTimeout(dragHoverTimer);
        dragHoverTabId = null;
        hideDropIndicator();
        const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
        const draggedTabId = e.dataTransfer?.getData(TAB_DRAG_MIME) || draggingTabId;

        if (draggedDialId) {
          moveDial(draggedDialId, g.id);
          draggingDialId = null;
          if (state.activeGroup !== g.id) switchView(g.id);
          return;
        }

        if (!draggedTabId || draggedTabId === g.id) return;
        // Reorder tabs
        const fromIdx = state.groups.findIndex(gr => gr.id === draggedTabId);
        const toIdx   = state.groups.findIndex(gr => gr.id === g.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = state.groups.splice(fromIdx, 1);
        state.groups.splice(toIdx, 0, moved);
        draggingTabId = null;
        saveState();
        buildTabs();
      });
    }

    // Also allow dropping dials onto home tab? No — only non-home groups
    if (g.isHome) {
      btn.addEventListener('dragover', e => {
        const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
        if (draggedDialId) e.preventDefault();
      });
      btn.addEventListener('dragleave', () => {
        clearTimeout(dragHoverTimer);
        dragHoverTabId = null;
      });
      btn.addEventListener('drop', e => {
        const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
        if (!draggedDialId) return;
        e.preventDefault();
        clearTimeout(dragHoverTimer);
        dragHoverTabId = null;
        draggingDialId = null;
      });
    }

    list.appendChild(btn);
  });
  requestAnimationFrame(updateTabsActivePill);
}

function syncActiveTabButton() {
  document.querySelectorAll('#tabs-list .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === state.activeGroup);
  });
}

function updateTabsActivePill() {
  const list = document.getElementById('tabs-list');
  const scroll = document.getElementById('tabs-scroll');
  const pill = document.getElementById('tabs-active-pill');
  const activeBtn = list?.querySelector('.tab-btn.active');
  if (!list || !scroll || !pill || !activeBtn) {
    if (pill) pill.style.opacity = '0';
    return;
  }

  const left = activeBtn.offsetLeft;
  const width = activeBtn.offsetWidth;
  pill.style.opacity = '1';
  pill.style.width = `${width}px`;
  pill.style.transform = `translate3d(${left}px, 0, 0)`;
}

function switchView(groupId) {
  if (state.activeGroup === groupId) return;
  folderStack = [];
  state.activeGroup = groupId;
  saveState({ scheduleBackup: false });
  syncActiveTabButton();
  showView(groupId);
  requestAnimationFrame(updateTabsActivePill);
}

function showView(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  const nextView = document.getElementById(group?.isHome ? 'view-home' : 'view-dials');
  const prevView = document.querySelector('.view.active');
  clearTimeout(viewTransitionTimer);
  if (prevView && prevView !== nextView) {
    prevView.classList.remove('active');
    prevView.classList.add('view-leaving');
    viewTransitionTimer = setTimeout(() => prevView.classList.remove('view-leaving'), 520);
  }
  nextView.classList.remove('view-leaving');
  nextView.classList.add('active');
  if (!group?.isHome) renderDials();
}

function activeGroup() {
  return state.groups.find(g => g.id === state.activeGroup) || state.groups[0];
}

function activeDialList() {
  let list = activeGroup()?.dials || [];
  for (const folderId of folderStack) {
    const folder = list.find(item => item.id === folderId && item.type === 'folder');
    if (!folder) {
      folderStack = [];
      return activeGroup()?.dials || [];
    }
    folder.dials = Array.isArray(folder.dials) ? folder.dials : [];
    list = folder.dials;
  }
  return list;
}

function parentDialList() {
  if (!folderStack.length) return null;
  let list = activeGroup()?.dials || [];
  for (const folderId of folderStack.slice(0, -1)) {
    const folder = list.find(item => item.id === folderId && item.type === 'folder');
    if (!folder) return null;
    folder.dials = Array.isArray(folder.dials) ? folder.dials : [];
    list = folder.dials;
  }
  return list;
}

function findDialEntry(id, list = null) {
  if (!list) {
    for (const group of state.groups) {
      const found = findDialEntry(id, group.dials || []);
      if (found) return found;
    }
    return null;
  }
  const source = list;
  for (const item of source) {
    if (item.id === id) return { item, list: source, index: source.indexOf(item) };
    if (item.type === 'folder' && Array.isArray(item.dials)) {
      const found = findDialEntry(id, item.dials);
      if (found) return found;
    }
  }
  return null;
}

function openFolder(folderId) {
  folderStack.push(folderId);
  renderDials();
}

function closeFolderLevel() {
  folderStack.pop();
  renderDials();
}

// ─── Drop indicator ──────────────────────────────────────────
let dragDropIdx = -1;
function showDropIndicator(insertBefore, refCard) {
  if (!refCard) { hideDropIndicator(); return; }
  const idx = insertBefore ? 'before-' + refCard.dataset.id : 'after-' + refCard.dataset.id;
  if (idx === dragDropIdx && dragDropIndicator?.isConnected) return;
  dragDropIdx = idx;
  if (!dragDropIndicator) {
    dragDropIndicator = document.createElement('div');
    dragDropIndicator.className = 'dial-drop-indicator';
    document.body.appendChild(dragDropIndicator);
  }
  const r = refCard.getBoundingClientRect();
  const x = insertBefore ? r.left - 2 : r.right - 2;
  const h = Math.min(r.height, 80);
  dragDropIndicator.style.left = x + 'px';
  dragDropIndicator.style.top = (r.top + r.height / 2) + 'px';
  dragDropIndicator.style.height = h + 'px';
  dragDropIndicator.classList.add('visible');
}
function hideDropIndicator() {
  dragDropIdx = -1;
  if (dragDropIndicator) {
    dragDropIndicator.remove();
    dragDropIndicator = null;
  }
}

// ─── FLIP animation for smooth grid reorder ────────────────
let _flipRects = null;
function snapCardPositions() {
  _flipRects = new Map();
  document.querySelectorAll('.dial-card').forEach(c => {
    _flipRects.set(c.dataset.id, c.getBoundingClientRect());
  });
}
function flipAnimateCards() {
  if (!_flipRects) return;
  const cards = document.querySelectorAll('.dial-card');
  cards.forEach(card => {
    const old = _flipRects.get(card.dataset.id);
    if (!old) return;
    const cur = card.getBoundingClientRect();
    const dx = old.left - cur.left;
    const dy = old.top - cur.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    card.style.transition = 'none';
    card.style.transform = `translate(${dx}px, ${dy}px)`;
    card.offsetHeight;
    card.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1)';
    card.style.transform = '';
    card.addEventListener('transitionend', function handler() {
      card.style.transition = '';
      card.style.transform = '';
      card.removeEventListener('transitionend', handler);
    });
  });
  _flipRects = null;
}

// ─── Dials ──────────────────────────────────────────────────
function renderDials() {
  const grid = document.getElementById('dials-grid');
  grid.innerHTML = '';
  if (dragDropIndicator) { dragDropIndicator.remove(); dragDropIndicator = null; }
  dragDropIdx = -1;
  _flipRects = null;
  const g = activeGroup();
  if (!g || g.isHome) return;
  const items = activeDialList();
  const s = state.settings;

  if (folderStack.length) {
    const back = document.createElement('div');
    back.className = 'dial-card dial-add dial-folder-back';
    back.innerHTML = '<div class="dial-add-inner"><div class="dial-add-icon">←</div><div class="dial-add-text">Back</div></div>';
    back.addEventListener('click', closeFolderLevel);
    back.addEventListener('dragover', e => {
      const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
      if (!draggedDialId) return;
      e.preventDefault();
      back.classList.add('drag-over-folder');
    });
    back.addEventListener('dragleave', () => back.classList.remove('drag-over-folder'));
    back.addEventListener('drop', e => {
      e.preventDefault();
      back.classList.remove('drag-over-folder');
      const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
      const found = findDialEntry(draggedDialId);
      const parent = parentDialList();
      if (!found || !parent || found.list === parent) return;
      const [movedDial] = found.list.splice(found.index, 1);
      parent.push(movedDial);
      draggingDialId = null;
      saveState();
      renderDials();
    });
    grid.appendChild(back);
  }

  items.forEach((dial, i) => {
    const card = document.createElement('div');
    card.className = 'dial-card' + (dial.type === 'folder' ? ' dial-folder' : '') +
      (dial.type === 'folder' && dial.win11FolderStyle ? ' win11-folder-card' : '') +
      (s.showBorder ? '' : ' no-border') +
      (s.glass ? '' : ' no-glass') +
      (s.hoverZoom ? '' : ' no-zoom');
    const iconScale = Number.isFinite(Number(dial.iconScale))
      ? Number(dial.iconScale)
      : getIconScale(s.dialIconScale);
    card.style.setProperty('--dial-icon-scale-local', `${iconScale / 100}`);
    card.dataset.id = dial.id;
    card.style.animationDelay = `${i * 0.03}s`;

    if (dial.type === 'folder' && dial.win11FolderStyle) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'dial-folder-svg-border');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 0.5,0.5 L 35,0.5 L 42,10 L 99.5,10 L 99.5,99.5 L 0.5,99.5 Z');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'var(--border)');
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path);
      card.appendChild(svg);
    }

    // Drag & drop for dials
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      draggingDialId = dial.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dial.id);
      e.dataTransfer.setData(DIAL_DRAG_MIME, dial.id);
    });
    card.addEventListener('dragend', () => {
      draggingDialId = null;
      clearTimeout(dragHoverTimer);
      dragHoverTabId = null;
      hideDropIndicator();
      card.classList.remove('dragging');
      document.querySelectorAll('.dial-card').forEach(c => {
        c.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-folder');
      });
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
      if (!draggedDialId || draggedDialId === dial.id) return;
      const draggedItem = findDial(draggedDialId);
      e.preventDefault();
      document.querySelectorAll('.dial-card').forEach(c => {
        c.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-folder');
      });
      const rect = card.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      if (dial.type === 'folder' && draggedItem?.type !== 'folder' && rel > 0.25 && rel < 0.75) {
        card.classList.add('drag-over-folder');
        hideDropIndicator();
      } else {
        const insertBefore = rel < 0.5;
        card.classList.add(insertBefore ? 'drag-over-left' : 'drag-over-right');
        showDropIndicator(insertBefore, card);
      }
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      hideDropIndicator();
      document.querySelectorAll('.dial-card').forEach(c => {
        c.classList.remove('drag-over-left', 'drag-over-right', 'drag-over-folder');
      });
      const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
      if (!draggedDialId || draggedDialId === dial.id) return;

      const found = findDialEntry(draggedDialId);
      if (!found) return;
      const toList = activeDialList();
      const rect = card.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;

      if (dial.type === 'folder' && found.item.type !== 'folder' && rel > 0.25 && rel < 0.75) {
        const [movedDial] = found.list.splice(found.index, 1);
        dial.dials = Array.isArray(dial.dials) ? dial.dials : [];
        dial.dials.push(movedDial);
        draggingDialId = null;
        saveState();
        renderDials();
        return;
      }

      snapCardPositions();

      const [movedDial] = found.list.splice(found.index, 1);
      const toIdx = toList.findIndex(d => d.id === dial.id);
      const insertAfter = e.clientX >= rect.left + rect.width / 2;
      toList.splice(insertAfter ? toIdx + 1 : toIdx, 0, movedDial);

      const draggedCard = document.querySelector(`.dial-card[data-id="${draggedDialId}"]`);
      const grid = document.getElementById('dials-grid');
      if (draggedCard && grid && found.list === toList) {
        const refCard = document.querySelector(`.dial-card[data-id="${dial.id}"]`);
        const ipos = insertAfter ? (refCard?.nextElementSibling?.classList.contains('dial-card') ? refCard.nextElementSibling : null) : refCard;
        if (ipos && ipos !== draggedCard) grid.insertBefore(draggedCard, ipos);
        else if (!ipos && refCard !== draggedCard) grid.appendChild(draggedCard);
        flipAnimateCards();
      } else {
        renderDials();
      }

      draggingDialId = null;
      saveState();
    });

    // ── Thumbnail area ──
    const thumb = document.createElement('div');
    thumb.className = 'dial-thumb';

    if (dial.type === 'folder') {
      if (dial.win11FolderStyle) {
        const icon = document.createElement('div');
        icon.className = 'dial-win11-folder-icon';
        thumb.appendChild(icon);
      } else {
        const folderCoverIcon = getFolderCoverIcon(dial);
        if (folderCoverIcon) {
          const img = document.createElement('img');
          img.className = 'dial-thumb-img dial-thumb-custom-icon';
          img.src = folderCoverIcon;
          img.alt = '';
          thumb.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'dial-thumb-placeholder dial-folder-thumb';
          ph.innerHTML = '<div class="dial-win11-folder-icon"></div>';
          thumb.appendChild(ph);
        }
      }
    } else if (dial.customIcon) {
      const img = document.createElement('img');
      img.className = 'dial-thumb-img dial-thumb-custom-icon';
      img.src = dial.customIcon;
      img.alt = '';
      img.onerror = () => {
        const ph = document.createElement('div');
        ph.className = 'dial-thumb-placeholder';
        const l = document.createElement('div');
        l.className = 'dial-letter';
        l.textContent = (dial.name || 'S')[0].toUpperCase();
        ph.appendChild(l);
        thumb.innerHTML = '';
        thumb.appendChild(ph);
      };
      thumb.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'dial-thumb-placeholder';
      if (s.showFavicon) {
        const dialFavicon = getDialFavicon(dial);
        if (dialFavicon) {
          const ico = document.createElement('img');
          ico.className = 'dial-favicon';
          ico.src = dialFavicon;
          ico.alt = '';
          ico.onerror = () => {
            const l = document.createElement('div');
            l.className = 'dial-letter';
            l.textContent = (dial.name || 'S')[0].toUpperCase();
            ico.replaceWith(l);
          };
          ph.appendChild(ico);
        } else {
          const l = document.createElement('div');
          l.className = 'dial-letter';
          l.textContent = (dial.name || 'S')[0].toUpperCase();
          ph.appendChild(l);
        }
      }
      thumb.appendChild(ph);
    }

    // ── Footer bar ──
    if (s.showFooter) {
      const footer = document.createElement('div');
      footer.className = 'dial-footer' + (s.showLabel ? '' : ' no-label');

      const dialFavicon = getDialFavicon(dial);
      if (dial.type === 'folder' && s.showFavicon && folderCoverIcon) {
        const fi = document.createElement('img');
        fi.className = 'dial-footer-icon';
        fi.src = folderCoverIcon;
        fi.alt = '';
        footer.appendChild(fi);
      } else if (dial.type === 'folder' && s.showFavicon && !dial.customIcon) {
        const fl = document.createElement('div');
        fl.className = 'dial-footer-folder-icon';
        footer.appendChild(fl);
      } else if (s.showFavicon && dialFavicon && !dial.customIcon) {
        const fi = document.createElement('img');
        fi.className = 'dial-footer-icon';
        fi.src = dialFavicon;
        fi.alt = '';
        fi.onerror = () => {
          const fl = document.createElement('div');
          fl.className = 'dial-footer-icon-letter';
          fl.textContent = (dial.name || 'S')[0].toUpperCase();
          fi.replaceWith(fl);
        };
        footer.appendChild(fi);
      } else if (s.showFavicon && !dialFavicon && !dial.customIcon) {
        const fl = document.createElement('div');
        fl.className = 'dial-footer-icon-letter';
        fl.textContent = (dial.name || 'S')[0].toUpperCase();
        footer.appendChild(fl);
      }

      if (s.showLabel) {
        const label = document.createElement('div');
        label.className = 'dial-label';
        label.textContent = dial.name || (dial.type === 'folder' ? 'Folder' : cleanHost(dial.url));
        footer.appendChild(label);
      }

      card.append(thumb, footer);
    } else {
      card.appendChild(thumb);
    }

    // ── Context button ──
    const ctx = document.createElement('button');
    ctx.className = 'dial-ctx';
    ctx.textContent = '⋯';
    ctx.addEventListener('click', e => { e.stopPropagation(); showCtxMenu(e, dial.id); });
    card.appendChild(ctx);

    card.addEventListener('click', () => {
      if (dial.type === 'folder') { openFolder(dial.id); return; }
      if (checkFocusBlock(g.id)) {
        window._lastBlockedUrl = dial.url;
        showBlockedToast(focusSession?.hardBlock);
        return;
      }
      window.location.href = dial.url;
    });
    card.addEventListener('auxclick', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      if (dial.type === 'folder') return;
      if (checkFocusBlock(g.id)) {
        window._lastBlockedUrl = dial.url;
        showBlockedToast(focusSession?.hardBlock);
        return;
      }
      chrome.tabs.create({ url: dial.url, active: false });
    });
    card.addEventListener('mousedown', e => {
      if (e.button === 1) e.preventDefault();
    });
    card.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, dial.id); });
    grid.appendChild(card);
  });

  // ── Add button ──
  const add = document.createElement('div');
  add.className = 'dial-card dial-add';
  add.style.display = s.showAddDialButton ? '' : 'none';
  add.style.animationDelay = `${items.length * 0.03}s`;
  const addInner = document.createElement('div');
  addInner.className = 'dial-add-inner';
  addInner.innerHTML = '<div class="dial-add-icon">+</div><div class="dial-add-text">Add Dial</div>';
  add.appendChild(addInner);
  add.addEventListener('click', e => showCreateMenu(e.clientX, e.clientY));
  // Allow drops on the add button too (append at end)
  add.addEventListener('dragover', e => {
    const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
    if (draggedDialId) {
      e.preventDefault();
      const cards = grid.querySelectorAll('.dial-card:not(.dial-add)');
      const lastCard = cards[cards.length - 1];
      if (lastCard) showDropIndicator(false, lastCard);
      else hideDropIndicator();
    }
  });
  add.addEventListener('dragleave', () => {
    const draggedDialId = draggingDialId;
    if (!draggedDialId) hideDropIndicator();
  });
  add.addEventListener('drop', e => {
    e.preventDefault();
    hideDropIndicator();
    const draggedDialId = e.dataTransfer?.getData(DIAL_DRAG_MIME) || draggingDialId;
    if (!draggedDialId) return;
    const found = findDialEntry(draggedDialId);
    if (!found) return;
    snapCardPositions();
    const [movedDial] = found.list.splice(found.index, 1);
    activeDialList().push(movedDial);
    const draggedCard = document.querySelector(`.dial-card[data-id="${draggedDialId}"]`);
    const grid = document.getElementById('dials-grid');
    if (draggedCard && grid && found.list === activeDialList()) {
      grid.insertBefore(draggedCard, add);
      flipAnimateCards();
    } else {
      renderDials();
    }
    draggingDialId = null;
    saveState();
  });
  grid.appendChild(add);

}

function cleanHost(url) {
  try { return new URL(url).hostname.replace('www.',''); } catch { return url || ''; }
}

function faviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return null; }
}

function favIconUrl(url) {
  return faviconUrl(url);
}

function getDialFavicon(dial) {
  return dial?.favIconUrl || dial?.favicon || null;
}

function getFolderCoverIcon(folder) {
  if (!folder || folder.type !== 'folder' || !folder.coverDialId) return null;
  const dial = (folder.dials || []).find(item => item.id === folder.coverDialId && item.type !== 'folder');
  return dial?.customIcon || getDialFavicon(dial) || null;
}

function findDial(id) {
  return findDialEntry(id)?.item;
}

// ─── Dial Modal ──────────────────────────────────────────────
function openDialModal(dialId, itemType = 'dial') {
  editingDialId = dialId;
  editingItemType = itemType;
  selectedIconUrl = null;
  const d = dialId ? findDial(dialId) : null;
  if (d?.type === 'folder') editingItemType = 'folder';
  const fallbackScale = getIconScale(state.settings.dialIconScale);
  const currentScale = Number.isFinite(Number(d?.iconScale)) ? Number(d.iconScale) : fallbackScale;
  const hasCustomIcon = !!d?.customIcon;
  document.getElementById('modal-dial-title').textContent = editingItemType === 'folder'
    ? (dialId ? 'Edit Folder' : 'Add Folder')
    : (dialId ? 'Edit Dial' : 'Add Dial');
  document.getElementById('dial-name-inp').value = d?.name || '';
  document.getElementById('dial-url-inp').value = d?.url || '';
  const urlInput = document.getElementById('dial-url-inp');
  const urlLabel = document.getElementById('dial-url-label');
  if (urlLabel) urlLabel.style.display = editingItemType === 'folder' ? 'none' : '';
  urlInput.style.display = editingItemType === 'folder' ? 'none' : '';
  const folderCoverArea = document.getElementById('folder-cover-area');
  const folderCoverSelect = document.getElementById('folder-cover-select');
  const folderStyleArea = document.getElementById('folder-style-area');
  const folderWin11StyleChk = document.getElementById('folder-win11-style-chk');
  if (folderStyleArea && folderWin11StyleChk) {
    folderStyleArea.style.display = editingItemType === 'folder' ? 'block' : 'none';
    folderWin11StyleChk.checked = d ? !!d.win11FolderStyle : false;
  }
  if (folderCoverArea && folderCoverSelect) {
    folderCoverArea.style.display = editingItemType === 'folder' && d ? 'block' : 'none';
    folderCoverSelect.innerHTML = '<option value="">Default folder icon</option>';
    if (editingItemType === 'folder' && d) {
      (d.dials || []).filter(item => item.type !== 'folder').forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name || cleanHost(item.url);
        folderCoverSelect.appendChild(opt);
      });
      folderCoverSelect.value = d.coverDialId || '';
    }
  }
  document.getElementById('dial-icon-scale-inp').value = String(currentScale);
  document.querySelector(`input[name="icon-src"][value="${hasCustomIcon ? 'upload' : 'auto'}"]`).checked = true;
  document.getElementById('icon-search-area').style.display = 'none';
  document.getElementById('icon-upload-area').style.display = hasCustomIcon ? 'block' : 'none';
  document.getElementById('icon-results').innerHTML = '';
  document.getElementById('icon-selected-preview').style.display = 'none';
  const preview = document.getElementById('dial-icon-preview');
  preview.src = d?.customIcon || '';
  preview.style.display = hasCustomIcon ? 'block' : 'none';
  document.getElementById('dial-icon-file').value = '';
  document.getElementById('dial-icon-file-name').textContent = hasCustomIcon ? 'Current image' : 'No file selected';
  openOverlay('modal-dial');
  document.getElementById('dial-name-inp').focus();
}

function closeDialModal() {
  closeOverlay('modal-dial');
  editingDialId = null;
  editingItemType = 'dial';
  selectedIconUrl = null;
}

function openFolderModal(folderId) {
  openDialModal(folderId, 'folder');
}

async function saveDialModal() {
  const name = document.getElementById('dial-name-inp').value.trim();
  let url = document.getElementById('dial-url-inp').value.trim();
  const iconScale = getIconScale(parseInt(document.getElementById('dial-icon-scale-inp').value, 10));
  if (editingItemType !== 'folder') {
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  }

  const iconSrc = document.querySelector('input[name="icon-src"]:checked').value;
  const coverDialId = document.getElementById('folder-cover-select')?.value || '';
  const win11FolderStyle = document.getElementById('folder-win11-style-chk')?.checked || false;
  const existingDial = editingDialId ? findDial(editingDialId) : null;
  let customIcon = existingDial?.customIcon || null;
  let favicon = existingDial?.favIconUrl || existingDial?.favicon || null;

  if (iconSrc === 'upload') {
    const prev = document.getElementById('dial-icon-preview');
    if (prev.src && prev.src !== window.location.href && prev.style.display !== 'none') {
      customIcon = prev.src;
      favicon = null;
    }
  } else if (iconSrc === 'search' && selectedIconUrl) {
    customIcon = selectedIconUrl;
    favicon = null;
  } else if (editingItemType === 'folder') {
    customIcon = null;
    favicon = null;
  } else {
    customIcon = null;
    favicon = faviconUrl(url);
  }

  if (editingDialId) {
    const d = findDial(editingDialId);
    if (d) {
      d.name = name || (editingItemType === 'folder' ? 'Folder' : cleanHost(url));
      if (editingItemType !== 'folder') {
        d.url = url;
        d.favicon = favicon;
        d.favIconUrl = favicon;
      }
      d.customIcon = customIcon;
      if (editingItemType === 'folder') {
        d.coverDialId = coverDialId;
        d.win11FolderStyle = win11FolderStyle;
      }
      d.iconScale = iconScale;
    }
  } else if (editingItemType === 'folder') {
    activeDialList().push({ id: uid(), type: 'folder', name: name || 'Folder', customIcon, coverDialId: '', iconScale, win11FolderStyle, dials: [] });
  } else {
    activeDialList().push({ id: uid(), type: 'dial', name: name || cleanHost(url), url, favicon, favIconUrl: favicon, customIcon, iconScale });
  }
  saveState(); renderDials(); closeDialModal();
}

// ─── Context menu ────────────────────────────────────────────
function showCtxMenu(e, dialId) {
  ctxDialId = dialId;
  const m = document.getElementById('ctx-menu');
  clearTimeout(ctxHideTimer);
  m.style.display = 'block';
  positionEl(m, e.clientX, e.clientY);
  requestAnimationFrame(() => m.classList.add('is-open'));
  document.getElementById('ctx-move-sub').style.display = 'none';
  document.getElementById('ctx-move-sub').classList.remove('is-open');
}

function positionEl(el, x, y) {
  el.style.left = x + 'px'; el.style.top = y + 'px';
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth) el.style.left = (x - r.width) + 'px';
    if (r.bottom > window.innerHeight) el.style.top = (y - r.height) + 'px';
  });
}

function hideCtx() {
  const menu = document.getElementById('ctx-menu');
  const sub = document.getElementById('ctx-move-sub');
  const top = document.getElementById('topbar-ctx-menu');
  const create = document.getElementById('create-ctx-menu');
  menu.classList.remove('is-open');
  sub.classList.remove('is-open');
  top?.classList.remove('is-open');
  create?.classList.remove('is-open');
  clearTimeout(ctxHideTimer);
  ctxHideTimer = setTimeout(() => {
    menu.style.display = 'none';
    sub.style.display = 'none';
    if (top) top.style.display = 'none';
    if (create) create.style.display = 'none';
  }, 180);
  ctxDialId = null;
}

function showTopBarCtxMenu(e) {
  const menu = document.getElementById('topbar-ctx-menu');
  if (!menu) return;
  clearTimeout(ctxHideTimer);
  menu.style.display = 'block';
  positionEl(menu, e.clientX, e.clientY);
  requestAnimationFrame(() => menu.classList.add('is-open'));
}

function showCreateMenu(x, y) {
  const menu = document.getElementById('create-ctx-menu');
  if (!menu) return;
  const folderItem = document.getElementById('create-folder');
  if (folderItem) folderItem.style.display = folderStack.length ? 'none' : '';
  clearTimeout(ctxHideTimer);
  menu.style.display = 'block';
  positionEl(menu, x, y);
  requestAnimationFrame(() => menu.classList.add('is-open'));
}

function switchSettingsSection(section) {
  document.querySelectorAll('.settings-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });
  document.querySelectorAll('#modal-settings .s-section').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.section === section);
  });
}

function moveDial(dialId, toGroupId) {
  const found = findDialEntry(dialId);
  if (found) {
    const [dial] = found.list.splice(found.index, 1);
    const tg = state.groups.find(g => g.id === toGroupId);
    if (tg) tg.dials.push(dial);
  }
  saveState(); renderDials();
}

function normalizeDial(input) {
  if (!input) return null;
  if (input.type === 'folder') {
    const iconScaleRaw = parseInt(input.iconScale, 10);
    return {
      id: input.id || uid(),
      type: 'folder',
      name: String(input.name || input.title || 'Folder').trim() || 'Folder',
      customIcon: input.customIcon || null,
      coverDialId: input.coverDialId || '',
      iconScale: Number.isFinite(iconScaleRaw) ? iconScaleRaw : 100,
      win11FolderStyle: !!input.win11FolderStyle,
      dials: Array.isArray(input.dials) ? input.dials.map(item => normalizeDial(item)).filter(Boolean) : []
    };
  }
  const rawUrl = String(input.url || input.link || input.display_url || input.site || '').trim();
  if (!rawUrl) return null;
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  const icon = input.favIconUrl || input.favicon || input.iconUrl || input.icon || favIconUrl(url);
  const iconScaleRaw = parseInt(input.iconScale, 10);
  const iconScale = Number.isFinite(iconScaleRaw) ? iconScaleRaw : 100;
  return {
    id: input.id || uid(),
    type: 'dial',
    name: String(input.name || input.title || input.label || cleanHost(url)).trim() || cleanHost(url),
    url,
    favicon: icon,
    favIconUrl: icon,
    customIcon: input.customIcon || null,
    iconScale
  };
}

function findArrayDeep(obj, predicate, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object') return null;
  if (seen.has(obj)) return null;
  seen.add(obj);
  if (Array.isArray(obj)) {
    if (predicate(obj)) return obj;
    for (const item of obj) {
      const found = findArrayDeep(item, predicate, seen);
      if (found) return found;
    }
    return null;
  }
  for (const value of Object.values(obj)) {
    const found = findArrayDeep(value, predicate, seen);
    if (found) return found;
  }
  return null;
}

function importNativeBackup(imported) {
  if (!imported.groups) throw new Error('Invalid backup');
  state.groups = normalizeGroupsWithHome(imported.groups);
  state.activeGroup = imported.activeGroup || state.groups[0]?.id;
  state.settings = { ...DEFAULT_STATE().settings, ...(imported.settings || {}) };
  state.settings.bgType = normalizeBgType(state.settings.bgType);
  state.settings.weatherEffect = normalizeWeatherEffect(state.settings.weatherEffect);
  delete state.settings.bgImage;
  state.player = { ...DEFAULT_STATE().player, ...(imported.player || {}) };
  state.notes = imported.notes || '';
  if (!state.groups.some(g => g.id === state.activeGroup)) state.activeGroup = 'home';
}

function importFvdBackup(imported) {
  const groupsRaw = findArrayDeep(imported, arr => arr.some(item =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    (item.name || item.title) &&
    (Object.hasOwn(item, 'id') || Object.hasOwn(item, 'group_id') || Object.hasOwn(item, 'global_id'))
  ));
  const dialsRaw = findArrayDeep(imported, arr => arr.some(item =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    (item.url || item.link || item.display_url || item.site)
  ));
  if (!groupsRaw || !dialsRaw) throw new Error('FVD structure not recognized');

  const groups = groupsRaw.map((group, index) => ({
    id: String(group.id ?? group.group_id ?? group.global_id ?? `fvd-group-${index}`),
    name: String(group.name || group.title || `Group ${index + 1}`),
    dials: []
  }));
  const groupMap = new Map(groups.map(group => [group.id, group]));

  dialsRaw.forEach(dial => {
    const normalized = normalizeDial(dial);
    if (!normalized) return;
    const groupId = String(dial.group_id ?? dial.groupId ?? dial.groupid ?? dial.parent_id ?? dial.category_id ?? groups[0]?.id);
    const group = groupMap.get(groupId) || groups[0];
    if (group) group.dials.push(normalized);
  });

  state.groups = normalizeGroupsWithHome([{ id: 'home', name: 'HOME', isHome: true, dials: [] }, ...groups]);
  state.activeGroup = groups[0]?.id || 'home';
  state.settings = { ...DEFAULT_STATE().settings, ...state.settings };
}

function importData(imported, sourceHint = 'auto') {
  const looksNative = Array.isArray(imported?.groups) && imported.groups.some(group => Array.isArray(group?.dials));
  if (sourceHint === 'fvd' || !looksNative) {
    try {
      importFvdBackup(imported);
      return 'FVD Speed Dial';
    } catch (error) {
      if (sourceHint === 'fvd') throw error;
    }
  }
  importNativeBackup(imported);
  return 'backup';
}

// ─── Tab Modal ───────────────────────────────────────────────
function openTabModal(groupId, triggerEl) {
  editingTabId = groupId;
  const g = state.groups.find(g => g.id === groupId);
  document.getElementById('modal-tab-title').textContent = groupId ? 'Rename Group' : 'New Group';
  document.getElementById('tab-name-inp').value = g?.name || '';
  document.getElementById('tab-delete-btn').style.display = (groupId && state.groups.filter(g => !g.isHome).length > 1) ? 'inline-flex' : 'none';
  openOverlay('modal-tab', triggerEl);
  document.getElementById('tab-name-inp').focus();
}
function closeTabModal() { closeOverlay('modal-tab'); editingTabId = null; }
function saveTabModal() {
  const name = document.getElementById('tab-name-inp').value.trim() || 'Group';
  if (editingTabId) {
    const g = state.groups.find(g => g.id === editingTabId);
    if (g) g.name = name;
  } else {
    const ng = { id: uid(), name, dials: [] };
    state.groups.push(ng);
    state.activeGroup = ng.id;
  }
  saveState(); buildTabs(); showView(state.activeGroup); closeTabModal();
}
function deleteTab() {
  if (!editingTabId || state.groups.filter(g => !g.isHome).length <= 1) return;
  state.groups = state.groups.filter(g => g.id !== editingTabId);
  if (state.activeGroup === editingTabId) state.activeGroup = state.groups.find(g => !g.isHome)?.id || state.groups[0].id;
  saveState(); buildTabs(); showView(state.activeGroup); closeTabModal();
}

// ─── AI / Encryption ──────────────────────────────────────────
const AI_STORAGE_KEY = 'spacedial-ai-key';
const AI_ENC_KEY = 'spacedial-enc-key';

async function getEncryptionKey() {
  let raw = (await chrome.storage.local.get(AI_ENC_KEY))[AI_ENC_KEY];
  if (!raw) {
    const key = await crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
    raw = Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
    await chrome.storage.local.set({ [AI_ENC_KEY]: raw });
    return key;
  }
  return crypto.subtle.importKey('raw', new Uint8Array(raw), { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}

async function encryptApiKey(plaintext) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return btoa(String.fromCharCode(...iv)) + '.' + btoa(String.fromCharCode(...new Uint8Array(enc)));
}

async function decryptApiKey(packet) {
  try {
    const [ivB64, dataB64] = packet.split('.');
    const key = await getEncryptionKey();
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch { return null; }
}

async function saveAiApiKey(plaintext) {
  if (!plaintext) { await chrome.storage.local.remove(AI_STORAGE_KEY); return; }
  const enc = await encryptApiKey(plaintext);
  await chrome.storage.local.set({ [AI_STORAGE_KEY]: enc });
}

async function loadAiApiKey() {
  const data = (await chrome.storage.local.get(AI_STORAGE_KEY))[AI_STORAGE_KEY];
  return data ? decryptApiKey(data) : null;
}

// ─── Settings Modal ──────────────────────────────────────────
function openSettings(triggerEl) {
  const s = state.settings;
  s.bgType = normalizeBgType(s.bgType);
  s.weatherEffect = normalizeWeatherEffect(s.weatherEffect);
  const themeRadio = document.querySelector(`input[name="theme"][value="${getResolvedTheme()}"]`);
  if (themeRadio) themeRadio.checked = true;
  const bgTimeInput = document.getElementById('s-bg-time');
  if (bgTimeInput) {
    bgTimeInput.value = getResolvedSkyHour();
    updateBgTimeLabel();
  }
  document.getElementById('s-auto-options').style.display = getResolvedTheme() === 'default' ? 'block' : 'none';
  document.getElementById('s-liquid-variant-wrap').style.display = getResolvedTheme() === 'liquid' ? 'block' : 'none';
  document.getElementById('s-galaxy-options').style.display = getResolvedTheme() === 'galaxy' ? 'block' : 'none';
  const gpSel = document.getElementById('s-galaxy-planet');
  if (gpSel) gpSel.value = s.galaxyPlanet || 'earth';
  const lvRadio = document.querySelector(`input[name="liquid-variant"][value="${s.liquidVariant || 'light'}"]`);
  if (lvRadio) lvRadio.checked = true;
  document.getElementById('s-auto-daynight').checked = !!s.autoDayNight;
  document.getElementById('s-weather-effect').value = s.weatherEffect;
  document.getElementById('s-auto-weather').checked = !!s.autoWeather;
  document.getElementById('overlay-opacity').value = s.overlayOp;
  document.getElementById('overlay-val').textContent = s.overlayOp;
  document.getElementById('s-cols').value = s.cols;
  document.getElementById('s-shape').value = s.dialShape;
  document.getElementById('s-show-label').checked = s.showLabel;
  document.getElementById('s-show-favicon').checked = s.showFavicon;
  document.getElementById('s-show-footer').checked = s.showFooter;
  document.getElementById('s-hover-zoom').checked = s.hoverZoom;
  document.getElementById('s-glass').checked = s.glass;
  document.getElementById('s-glass-style').value = s.glassStyle || 'standard';
  document.getElementById('s-tab-style').value = s.tabStyle || 'default';
  document.getElementById('s-border').checked = s.showBorder;
  document.getElementById('s-show-add-dial').checked = s.showAddDialButton;
  document.getElementById('s-dial-icon-scale').value = String(s.dialIconScale ?? 100);
  document.getElementById('s-show-clock').checked = s.showClock;
  document.getElementById('s-24h').checked = s.use24h;
  document.getElementById('s-seconds').checked = s.showSeconds;
  document.getElementById('s-show-weather').checked = s.showWeather;
  document.getElementById('s-show-weather-forecast').checked = s.showWeatherForecast;
  document.getElementById('s-weather-forecast-days').value = String(normalizeForecastDays(s.weatherForecastDays));
  document.getElementById('s-show-player').checked = s.showPlayer;
  document.getElementById('s-show-notes').checked = s.showNotes;
  document.getElementById('s-speedtest-mode').value = s.speedTestMode || 'ookla';
  document.getElementById('s-show-add-tab').checked = s.showAddTabButton !== false;
  document.getElementById('s-show-focus-btn').checked = s.showFocusButton !== false;
  document.getElementById('s-show-speedtest-btn').checked = s.showSpeedTestButton !== false;
  document.getElementById('s-show-ai-btn').checked = s.showAiButton !== false;
  document.getElementById('s-weather-city').value = s.weatherCity;
  document.getElementById('s-temp-unit').value = s.tempUnit;
  document.getElementById('s-music-leave').value = s.musicLeave;
  document.getElementById('s-autoplay').checked = s.autoplay;
  document.getElementById('s-loop').checked = s.loopPlaylist;
  document.getElementById('s-shuffle-start').checked = s.shuffleOnStart;
  document.getElementById('s-blocked-domains').value = s.blockedDomains || '';
  document.getElementById('s-sleep-enabled').checked = s.sleepEnabled !== false;
  document.getElementById('s-sleep-timeout').value = String(s.sleepTimeout || 60);
  document.getElementById('s-sleep-color-glow').checked = s.sleepColorGlow === true;
  chrome.storage.local.get('ai-funny-thinking', r => { document.getElementById('s-ai-funny').checked = !!r['ai-funny-thinking']; });

  // Wallpaper settings
  document.getElementById('s-wallpaper-zoom').value = s.wallpaperZoom || 100;
  document.getElementById('wallpaper-zoom-val').textContent = (s.wallpaperZoom || 100) + '%';
  document.getElementById('s-wallpaper-x').value = s.wallpaperX || 50;
  document.getElementById('wallpaper-x-val').textContent = (s.wallpaperX || 50) + '%';
  document.getElementById('s-wallpaper-y').value = s.wallpaperY || 50;
  document.getElementById('wallpaper-y-val').textContent = (s.wallpaperY || 50) + '%';
  document.getElementById('s-wallpaper-blur').checked = !!s.wallpaperBlur;
  const fitRadio = document.querySelector(`input[name="wallpaper-fit"][value="${s.wallpaperFit || 'cover'}"]`);
  if (fitRadio) fitRadio.checked = true;

  // Scan wallpapers from Wallpapers folder
  loadWallpaperGrid(s.wallpaper);

  switchSettingsSection('appearance');
  getLiveVersion().then(v => { document.querySelector('.settings-version').textContent = 'v' + v; });
  loadAiApiKey().then(key => {
    document.getElementById('s-ai-key').value = key ? '••••••••••••••••' : '';
    document.getElementById('s-ai-key').dataset.hasKey = key ? '1' : '0';
  });
  openOverlay('modal-settings', triggerEl);
}
function closeSettings() { closeOverlay('modal-settings'); }

// ─── Developer menu ─────────────────────────────────────────
const DEV_FILES = ['manifest.json', 'newtab.html', 'newtab.css', 'newtab.js', 'console-capture.js', 'ai.html', 'ai.js', 'ai.css', 'blocked.html', 'blocked.js', 'Themes/earth/three.min.js', 'Themes/earth/earth-theme.js', 'Themes/earth/earth-weather.js', 'Themes/earth/earth-day.jpg', 'Themes/earth/earth-night.jpg', 'Themes/earth/earth-bump.png', 'Themes/earth/earth-spec.png', 'Themes/earth/moon.jpg', 'Themes/earth/sun.jpg', 'Themes/galaxy/galaxy-theme.js', 'Themes/galaxy/mercury.jpg', 'Themes/galaxy/venus.jpg', 'Themes/galaxy/earth.jpg', 'Themes/galaxy/mars.jpg', 'Themes/galaxy/jupiter.jpg', 'Themes/galaxy/saturn.jpg', 'Themes/galaxy/saturn-ring.png', 'Themes/galaxy/uranus.jpg', 'Themes/galaxy/uranus-ring.png', 'Themes/galaxy/neptune.jpg', 'Themes/milkyway/milkyway.jpg', 'Themes/macos/liquid-light.jpg', 'Themes/macos/liquid-dark.jpg', 'Anurati-Regular.woff'];
function openDevMenu() {
  document.getElementById('dev-logs').value = devLogs.length
    ? devLogs.map(l => `[${l.time}] ${l.type.toUpperCase()} ${l.msg}`).join('\n')
    : '(no logs captured yet)';
  getLiveVersion().then(v => { document.getElementById('dev-version').textContent = 'v' + v; });
  document.getElementById('dev-integrity').textContent = '';
  const devOverride = sessionStorage.getItem('dev-earth-override');
  document.querySelectorAll('.dev-weather-btn').forEach(b => {
    b.classList.toggle('active', devOverride ? b.dataset.effect === devOverride : b.dataset.effect === 'clear');
  });
  const statusEl = document.getElementById('dev-weather-status');
  if (statusEl) statusEl.textContent = devOverride ? `Override: ${devOverride}` : 'Auto mode (resets on reload)';
  openOverlay('modal-dev');
}
function closeDevMenu() { closeOverlay('modal-dev'); }
function copyDevLogs() {
  const t = document.getElementById('dev-logs').value;
  if (navigator.clipboard) navigator.clipboard.writeText(t);
}
async function runIntegrityCheck() {
  const out = document.getElementById('dev-integrity');
  out.textContent = 'Checking…';
  const results = [];
  for (const f of DEV_FILES) {
    try {
      const res = await fetch(chrome.runtime.getURL(f));
      if (res.ok) {
        const buf = await res.arrayBuffer();
        results.push(`✓ ${f} — ${buf.byteLength} B`);
      } else {
        results.push(`✗ ${f} — HTTP ${res.status}`);
      }
    } catch (e) {
      results.push(`✗ ${f} — ${e.message}`);
    }
  }
  out.textContent = results.join('\n');
}

async function runSelfTest() {
  const out = document.getElementById('dev-integrity');
  out.textContent = 'Running self test…';
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  try { add('chrome.runtime', !!(chrome && chrome.runtime && chrome.runtime.getURL), ''); }
  catch (e) { add('chrome.runtime', false, e.message); }
  try { add('chrome.storage', !!chrome?.storage?.local, ''); }
  catch (e) { add('chrome.storage', false, e.message); }

  try {
    const m = chrome.runtime.getManifest();
    add('manifest', !!(m && m.version && m.name), 'v' + m.version);
  } catch (e) { add('manifest', false, e.message); }

  try {
    const v = await getLiveVersion();
    add('live version', /^\d+\.\d+\.\d+(\.\d+)?$/.test(v), 'v' + v);
  } catch (e) { add('live version', false, e.message); }

  let fontOk = false;
  try { fontOk = !!document.fonts && document.fonts.check('16px Anurati'); } catch {}
  add('Anurati font', fontOk, fontOk ? 'loaded' : 'not loaded');

  const domIds = ['bg-layer', 'tab-bar', 'tabs-list', 'dials-grid', 'clock-block', 'weather-block', 'notes-block', 'player-block', 'modal-settings', 'ctx-menu', 'ai-panel', 'speedtest-panel', 'galaxy-canvas'];
  const missingDom = domIds.filter(id => !document.getElementById(id));
  add('DOM elements', missingDom.length === 0, missingDom.length ? 'missing: ' + missingDom.join(', ') : `${domIds.length} present`);

  try {
    const sc = document.getElementById('stars-canvas');
    const gc = document.getElementById('galaxy-canvas');
    add('canvas 2d', !!(sc?.getContext('2d') || gc?.getContext('2d')), '');
  } catch (e) { add('canvas 2d', false, e.message); }

  let stateOk = false, schemaDetail = '(no ds2 stored)';
  try {
    const raw = (await chrome.storage.local.get('ds2'))['ds2'];
    if (raw) {
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      stateOk = !!(s.settings && Array.isArray(s.groups));
      const dialCount = (s.groups || []).reduce((acc, g) => acc + (g.dials || []).filter(d => d.type !== 'folder').length, 0);
      schemaDetail = `settings:${s.settings ? 'ok' : 'missing'}, groups:${Array.isArray(s.groups) ? s.groups.length : 'missing'}, dials:${dialCount}`;
    }
    add('state schema', stateOk, schemaDetail);
  } catch (e) { add('state schema', false, e.message); }

  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    add('storage usage', bytes >= 0, (bytes / 1024).toFixed(1) + ' KB');
  } catch (e) { add('storage usage', false, e.message); }

  add('groups', state.groups.length > 0, `${state.groups.length} groups, active=${state.activeGroup ?? '?'}`);
  add('theme', !!getResolvedTheme(), getResolvedTheme());
  add('weather widget', !!document.getElementById('weather-current'), lastWeatherAtmosphere ? `last=${lastWeatherAtmosphere.phase}/${lastWeatherAtmosphere.effect}` : 'no data yet');

  let key = null;
  try { key = await loadAiApiKey(); } catch {}
  add('AI API key', !!key, key ? 'configured' : 'not set');

  add('network', navigator.onLine, navigator.onLine ? 'online' : 'offline');
  add('clipboard API', !!navigator.clipboard, '');

  const missingFiles = [];
  for (const f of DEV_FILES) {
    try { const r = await fetch(chrome.runtime.getURL(f)); if (!r.ok) missingFiles.push(f); }
    catch { missingFiles.push(f); }
  }
  add('bundled files', missingFiles.length === 0, missingFiles.length ? 'missing: ' + missingFiles.join(', ') : DEV_FILES.length + ' files ok');

  const clockText = document.querySelector('#clock-block')?.textContent?.trim() || '';
  add('clock', clockText.length > 0, clockText.slice(0, 20));

  const fail = results.filter(r => !r.ok).length;
  out.textContent = results.map(r => (r.ok ? '✓ ' : '✗ ') + r.name + (r.detail ? ' — ' + r.detail : '')).join('\n') + `\n\n${results.length - fail} OK, ${fail} FAILED`;
}

async function saveSettings() {
  const s = state.settings;
  s.theme = document.querySelector('input[name="theme"]:checked').value || 'default';
  s.liquidVariant = document.querySelector('input[name="liquid-variant"]:checked')?.value || 'light';
  const gpSel = document.getElementById('s-galaxy-planet');
  s.galaxyPlanet = gpSel ? (gpSel.value || 'earth') : (s.galaxyPlanet || 'earth');
  s.bgType = normalizeBgType(document.querySelector('input[name="bg-type"]:checked')?.value || bgTypeFromHour(getResolvedSkyHour()));
  const bgTimeInput = document.getElementById('s-bg-time');
  if (bgTimeInput) s.bgTime = _clamp01(parseFloat(bgTimeInput.value) / 24) * 24;
  s.autoDayNight = document.getElementById('s-auto-daynight').checked;
  s.weatherEffect = normalizeWeatherEffect(document.getElementById('s-weather-effect').value);
  s.autoWeather = document.getElementById('s-auto-weather').checked;
  s.overlayOp = parseFloat(document.getElementById('overlay-opacity').value);
  s.cols = parseInt(document.getElementById('s-cols').value);
  s.dialShape = document.getElementById('s-shape').value;
  s.showLabel = document.getElementById('s-show-label').checked;
  s.showFavicon = document.getElementById('s-show-favicon').checked;
  s.showFooter = document.getElementById('s-show-footer').checked;
  s.hoverZoom = document.getElementById('s-hover-zoom').checked;
  s.glass = document.getElementById('s-glass').checked;
  s.glassStyle = document.getElementById('s-glass-style').value || 'standard';
  s.tabStyle = document.getElementById('s-tab-style').value || 'default';
  s.showBorder = document.getElementById('s-border').checked;
  s.showAddDialButton = document.getElementById('s-show-add-dial').checked;
  s.dialIconScale = getIconScale(parseInt(document.getElementById('s-dial-icon-scale').value, 10));
  s.showClock = document.getElementById('s-show-clock').checked;
  s.use24h = document.getElementById('s-24h').checked;
  s.showSeconds = document.getElementById('s-seconds').checked;
  s.showWeather = document.getElementById('s-show-weather').checked;
  s.showWeatherForecast = document.getElementById('s-show-weather-forecast').checked;
  s.weatherForecastDays = normalizeForecastDays(document.getElementById('s-weather-forecast-days').value);
  s.showPlayer = document.getElementById('s-show-player').checked;
  s.showNotes = document.getElementById('s-show-notes').checked;
  s.speedTestMode = document.getElementById('s-speedtest-mode').value || 'ookla';
  s.showAddTabButton = document.getElementById('s-show-add-tab').checked;
  s.showFocusButton = document.getElementById('s-show-focus-btn').checked;
  s.showSpeedTestButton = document.getElementById('s-show-speedtest-btn').checked;
  s.showAiButton = document.getElementById('s-show-ai-btn').checked;
  const aiKeyEl = document.getElementById('s-ai-key');
  if (aiKeyEl.dataset.hasKey === '1' && !aiKeyEl.value) {
    await saveAiApiKey('');
    aiKeyEl.dataset.hasKey = '0';
  } else if (aiKeyEl.value && !aiKeyEl.value.startsWith('••')) {
    await saveAiApiKey(aiKeyEl.value);
    aiKeyEl.dataset.hasKey = '1';
  }
  chrome.storage.local.set({ 'ai-funny-thinking': !!document.getElementById('s-ai-funny').checked });
  s.weatherCity = document.getElementById('s-weather-city').value.trim() || 'Dublin';
  s.tempUnit = document.getElementById('s-temp-unit').value;
  s.musicLeave = document.getElementById('s-music-leave').value;
  s.autoplay = document.getElementById('s-autoplay').checked;
  s.loopPlaylist = document.getElementById('s-loop').checked;
  s.shuffleOnStart = document.getElementById('s-shuffle-start').checked;
  s.blockedDomains = document.getElementById('s-blocked-domains').value;
  s.sleepEnabled = document.getElementById('s-sleep-enabled').checked;
  s.sleepTimeout = parseInt(document.getElementById('s-sleep-timeout').value) || 60;
  s.sleepColorGlow = document.getElementById('s-sleep-color-glow').checked;

  // Wallpaper settings
  s.wallpaperFit = document.querySelector('input[name="wallpaper-fit"]:checked')?.value || 'cover';
  s.wallpaperZoom = parseInt(document.getElementById('s-wallpaper-zoom').value) || 100;
  s.wallpaperX = parseInt(document.getElementById('s-wallpaper-x').value) || 50;
  s.wallpaperY = parseInt(document.getElementById('s-wallpaper-y').value) || 50;
  s.wallpaperBlur = document.getElementById('s-wallpaper-blur').checked;

  saveState();
  applySettings();
  renderDials();
  fetchWeather();
  closeSettings();
}

function openSpeedTestPanel() {
  const panel = document.getElementById('speedtest-panel');
  const frame = document.getElementById('speedtest-frame');
  if (!panel || !frame) return;
  if (!frame.src) {
    const p = new URLSearchParams({ bg: getResolvedBgType(), weather: getResolvedWeatherEffect() });
    frame.src = chrome.runtime.getURL('speedtest.html?' + p);
  }
  panel.style.display = 'block';
  requestAnimationFrame(() => panel.classList.add('open'));
}

function updateSpeedTestTheme() {
  const frame = document.getElementById('speedtest-frame');
  if (frame?.contentWindow) {
    frame.contentWindow.postMessage({
      type: 'theme-update',
      bg: getResolvedBgType(),
      weather: getResolvedWeatherEffect()
    }, '*');
  }
}

function closeSpeedTestPanel() {
  const panel = document.getElementById('speedtest-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(() => {
    if (!panel.classList.contains('open')) panel.style.display = 'none';
  }, 220);
}

function toggleSpeedTestPanel() {
  const panel = document.getElementById('speedtest-panel');
  if (!panel || panel.classList.contains('open')) {
    closeSpeedTestPanel();
    return;
  }
  openSpeedTestPanel();
}

function openSpeedTest() {
  const mode = state.settings.speedTestMode || 'ookla';
  if (mode === 'internal') {
    toggleSpeedTestPanel();
    return;
  }
  chrome.tabs.create({ url: 'https://www.speedtest.net/' });
}

let aiPanelOpen = false;
function openAI() {
  aiPanelOpen = !aiPanelOpen;
  document.getElementById('ai-btn').classList.toggle('active', aiPanelOpen);
  document.getElementById('ai-panel').classList.toggle('open', aiPanelOpen);
  document.getElementById('ai-panel').style.display = aiPanelOpen ? 'block' : 'none';
  if (aiPanelOpen) {
    document.getElementById('ai-frame').src = 'ai.html?new=' + Date.now() +
      '&theme=' + encodeURIComponent(getResolvedTheme()) +
      '&glass=' + encodeURIComponent(state.settings.glass ? (state.settings.glassStyle || 'standard') : 'none') +
      '&liquidVariant=' + encodeURIComponent(state.settings.liquidVariant || 'light');
  }
}
function closeAI() {
  aiPanelOpen = false;
  document.getElementById('ai-btn').classList.remove('active');
  document.getElementById('ai-panel').classList.remove('open');
  document.getElementById('ai-panel').style.display = 'none';
}

// ─── Import / Export ─────────────────────────────────────────
function openIE(triggerEl) { openOverlay('modal-ie', triggerEl); }
function closeIE() { closeOverlay('modal-ie'); }

function doExportFull() {
  const data = buildExportableState(state);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spacedial-full-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function doExportMinimal() {
  const data = {
    format: 'spacedial-minimal-backup-v1',
    exportedAt: new Date().toISOString(),
    data: cloudSerialize()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `spacedial-minimal-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function doImport(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      const data = normalizeImportedCloudPayload(imported) || imported;
      const source = importData(data);
      saveState(); applySettings(true); buildTabs(); showView(state.activeGroup);
      closeIE(); closeSettings(); alert(`Imported ${source} successfully!`);
    } catch(err) { alert('Invalid backup file: ' + err.message); }
  };
  r.readAsText(file);
}

function doImportFvd(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      importFvdText(e.target.result);
    } catch(err) { alert('FVD import failed: ' + err.message); }
  };
  r.readAsText(file);
}

function importFvdText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) throw new Error('Empty FVD text');
  const imported = JSON.parse(text);
  importData(imported, 'fvd');
  saveState();
  applySettings(true);
  buildTabs();
  showView(state.activeGroup);
  const textArea = document.getElementById('ie-import-fvd-text');
  if (textArea) textArea.value = '';
  const settingsTextArea = document.getElementById('s-import-fvd-text');
  if (settingsTextArea) settingsTextArea.value = '';
  closeIE();
  closeSettings();
  alert('Imported FVD Speed Dial successfully!');
}

function doReset() {
  if (!confirm('Reset ALL data? This cannot be undone.')) return;
  chrome.storage.local.remove('ds2', () => {
    state = DEFAULT_STATE();
    applySettings(true); buildTabs(); showView(state.activeGroup);
    closeIE(); closeSettings();
  });
}

// ─── Cloud Sync ───────────────────────────────────────────────
function cloudSerialize() {
  const s = JSON.parse(JSON.stringify(state));
  s.player.playlist = s.player.playlist.filter(t => t.type === 'url');
  const serializeDialItem = item => item.type === 'folder'
    ? {
        id: item.id,
        type: 'folder',
        name: item.name,
        customIcon: item.customIcon && item.customIcon.length <= 1500 ? item.customIcon : null,
        coverDialId: item.coverDialId || '',
        iconScale: item.iconScale,
        win11FolderStyle: !!item.win11FolderStyle,
        dials: (item.dials || []).map(serializeDialItem)
      }
    : {
        id: item.id,
        type: 'dial',
        name: item.name,
        url: item.url,
        favicon: item.favicon || item.favIconUrl || null,
        favIconUrl: item.favIconUrl || item.favicon || null,
        customIcon: item.customIcon && item.customIcon.length <= 1500 ? item.customIcon : null,
        iconScale: item.iconScale
      };
  s.groups = s.groups.map(group => ({
    id: group.id,
    name: group.name,
    isHome: !!group.isHome,
    dials: (group.dials || []).map(serializeDialItem)
  }));
  s.player = {
    playlist: s.player.playlist.map(track => ({
      name: track.name,
      artist: track.artist || '',
      type: 'url',
      src: track.src
    })),
    currentIdx: s.player.currentIdx || 0,
    shuffle: !!s.player.shuffle,
    repeat: !!s.player.repeat,
    volume: s.player.volume ?? 1,
    position: 0
  };
  if (s.notes && s.notes.length > 2000) s.notes = s.notes.slice(0, 2000);
  return s;
}

function chunkStringByBytes(str, maxBytes) {
  const chunks = [];
  let current = '';
  for (const ch of str) {
    const next = current + ch;
    if (new Blob([next]).size > maxBytes) {
      if (!current) throw new Error('Cloud item too large');
      chunks.push(current);
      current = ch;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function getCloudKeysToRemove(items) {
  return Object.keys(items).filter(key =>
    key === 'ds2cloud' ||
    key === 'ds2cloud_chunks' ||
    key.startsWith('ds2cloud_')
  );
}

function readCloudBackupString(items) {
  if (!items || typeof items !== 'object') return '';

  if (typeof items.ds2cloud === 'string' && items.ds2cloud) {
    return items.ds2cloud;
  }

  const chunkKeys = Object.keys(items)
    .filter(key => /^ds2cloud_\d+$/.test(key))
    .sort((a, b) => parseInt(a.split('_').pop(), 10) - parseInt(b.split('_').pop(), 10));

  if (chunkKeys.length) {
    return chunkKeys.map(key => items[key] || '').join('');
  }

  if (items.ds2cloud_chunks && Number(items.ds2cloud_chunks) > 0) {
    let str = '';
    for (let i = 0; i < Number(items.ds2cloud_chunks); i++) {
      str += items[`ds2cloud_${i}`] || '';
    }
    return str;
  }

  return '';
}

function readChunkedCloudByPrefix(items, prefix) {
  if (!items || !prefix) return '';
  if (typeof items[prefix] === 'string' && items[prefix]) return items[prefix];

  const numberedKeys = Object.keys(items)
    .filter(key => new RegExp(`^${prefix}_\\d+$`).test(key))
    .sort((a, b) => parseInt(a.split('_').pop(), 10) - parseInt(b.split('_').pop(), 10));

  if (numberedKeys.length) {
    return numberedKeys.map(key => items[key] || '').join('');
  }

  if (items[`${prefix}_chunks`] && Number(items[`${prefix}_chunks`]) > 0) {
    let str = '';
    for (let i = 0; i < Number(items[`${prefix}_chunks`]); i++) {
      str += items[`${prefix}_${i}`] || '';
    }
    return str;
  }

  return '';
}

function parseMaybeJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeImportedCloudPayload(value) {
  let current = value;
  for (let i = 0; i < 6; i++) {
    const parsed = parseMaybeJson(current);
    if (parsed == null) return null;
    current = parsed;
    if (typeof current === 'string') continue;
    if ((current?.format === 'spacedial-minimal-backup-v1' || current?.format === 'dialspace-minimal-backup-v1') && current?.data) {
      current = current.data;
      continue;
    }
    if (current?.backup) {
      current = current.backup;
      continue;
    }
    if (current?.payload) {
      current = current.payload;
      continue;
    }
    if (current?.data && typeof current.data === 'object' && !Array.isArray(current.data)) {
      current = current.data;
      continue;
    }
    return current;
  }
  return typeof current === 'object' ? current : null;
}

function collectCloudLoadCandidates(items) {
  const candidates = [];
  const pushIfPresent = value => {
    if (value == null) return;
    if (typeof value === 'string' && !value.trim()) return;
    candidates.push(value);
  };

  pushIfPresent(readCloudBackupString(items));

  const legacyKeys = ['speeddial2', 'speeddial', 'sd2', 'dialspace', 'ds2'];
  legacyKeys.forEach(key => pushIfPresent(items[key]));

  const cloudPrefixes = ['ds2cloud', 'dialspacecloud', 'speeddialcloud', 'sd2cloud', 'dscloud'];
  cloudPrefixes.forEach(prefix => pushIfPresent(readChunkedCloudByPrefix(items, prefix)));

  Object.entries(items || {}).forEach(([key, value]) => {
    if (!/(cloud|backup|speeddial|dialspace|ds2|sd2)/i.test(key)) return;
    pushIfPresent(value);
  });

  const seen = new Set();
  return candidates.filter(candidate => {
    const fingerprint = typeof candidate === 'string' ? candidate.trim() : JSON.stringify(candidate);
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function deepCollectBackups(value, out, visited = new WeakSet(), depth = 0) {
  if (value == null || depth > 7) return;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;
    out.push(trimmed);
    try {
      const parsed = JSON.parse(trimmed);
      deepCollectBackups(parsed, out, visited, depth + 1);
    } catch {}
    return;
  }

  if (typeof value !== 'object') return;
  if (visited.has(value)) return;
  visited.add(value);
  out.push(value);

  if (Array.isArray(value)) {
    value.forEach(item => deepCollectBackups(item, out, visited, depth + 1));
    return;
  }

  Object.values(value).forEach(item => deepCollectBackups(item, out, visited, depth + 1));
}

function looksLikeSpaceDialData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj?.groups) && obj.groups.length) return true;
  if (obj?.data && looksLikeSpaceDialData(obj.data)) return true;
  if (obj?.backup && looksLikeSpaceDialData(obj.backup)) return true;
  if (obj?.payload && looksLikeSpaceDialData(obj.payload)) return true;
  return false;
}

function importFromCandidateList(candidates) {
  if (!candidates.length) return { loaded: false, lastError: null };
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const normalized = normalizeImportedCloudPayload(candidate);
      if (!normalized || typeof normalized !== 'object' || !looksLikeSpaceDialData(normalized)) continue;
      importData(normalized);
      return { loaded: true, lastError: null };
    } catch (error) {
      lastError = error;
    }
  }
  return { loaded: false, lastError };
}

function collectStorageCandidates(items) {
  const candidates = collectCloudLoadCandidates(items);
  const deepCandidates = [];
  deepCollectBackups(items, deepCandidates);
  const combinedCandidates = [...candidates, ...deepCandidates];
  const dedup = new Set();
  return combinedCandidates.filter(candidate => {
    const fingerprint = typeof candidate === 'string' ? candidate.trim() : JSON.stringify(candidate);
    if (!fingerprint || dedup.has(fingerprint)) return false;
    dedup.add(fingerprint);
    return true;
  });
}

function collectLocalStorageCandidates() {
  const out = [];
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (/(cloud|backup|speeddial|dialspace|ds2|sd2)/i.test(key)) keys.push(key);
    }
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) out.push(value);
    });
  } catch {}
  return out;
}

function finalizeCloudSave(payload) {
  chrome.storage.sync.get(null, items => {
    if (chrome.runtime.lastError) {
      alert('Cloud save failed: ' + chrome.runtime.lastError.message);
      return;
    }
    const oldKeys = getCloudKeysToRemove(items);
    const writePayload = () => {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
          alert('Cloud save failed: ' + chrome.runtime.lastError.message);
          return;
        }
        chrome.storage.sync.get(null, savedItems => {
          if (chrome.runtime.lastError) {
            alert('Cloud save failed: ' + chrome.runtime.lastError.message);
            return;
          }
          const savedStr = readCloudBackupString(savedItems);
          if (!savedStr) {
            alert('Cloud save failed: backup was not readable after write.');
            return;
          }
          try {
            JSON.parse(savedStr);
            alert('Saved to Chrome Cloud ✓');
          } catch (err) {
            alert('Cloud save failed: backup was corrupted after write.');
          }
        });
      });
    };
    if (oldKeys.length) {
      chrome.storage.sync.remove(oldKeys, () => {
        if (chrome.runtime.lastError) {
          alert('Cloud save failed: ' + chrome.runtime.lastError.message);
          return;
        }
        writePayload();
      });
      return;
    }
    writePayload();
  });
}

function doCloudSave() {
  const data = cloudSerialize();
  const str = JSON.stringify(data);
  const totalBytes = new Blob([str]).size;
  const maxPerItemBytes = 7000;
  const maxTotalBytes = 95000;
  if (totalBytes > maxTotalBytes) {
    alert('Cloud save failed: data is too large even after optimization. Remove notes, custom icons, or playlist items.');
    return;
  }

  const parts = chunkStringByBytes(str, maxPerItemBytes);
  const payload = { ds2cloud_chunks: parts.length };
  if (parts.length === 1) {
    payload.ds2cloud = parts[0];
  } else {
    payload.ds2cloud = '';
    parts.forEach((part, i) => {
      payload[`ds2cloud_${i}`] = part;
    });
  }
  finalizeCloudSave(payload);
}

function doCloudLoad() {
  chrome.storage.sync.get(null, items => {
    if (chrome.runtime.lastError) { alert('Cloud load failed: ' + chrome.runtime.lastError.message); return; }
    const syncCandidates = collectStorageCandidates(items);
    const syncResult = importFromCandidateList(syncCandidates);
    if (syncResult.loaded) {
      saveState();
      applySettings(true);
      buildTabs();
      showView(state.activeGroup);
      closeIE();
      alert('Loaded backup from Chrome Sync ✓');
      return;
    }

    chrome.storage.local.get(null, localItems => {
      if (chrome.runtime.lastError) {
        alert('Cloud/local load failed: ' + chrome.runtime.lastError.message);
        return;
      }

      const localCandidates = collectStorageCandidates(localItems);
      const localStorageCandidates = collectLocalStorageCandidates();
      const allLocalCandidates = [...localCandidates, ...localStorageCandidates];
      const localResult = importFromCandidateList(allLocalCandidates);

      if (localResult.loaded) {
        saveState();
        applySettings(true);
        buildTabs();
        showView(state.activeGroup);
        closeIE();
        alert('Loaded backup from legacy local storage ✓');
        return;
      }

      const err = localResult.lastError || syncResult.lastError;
      alert('Backup not found or invalid.\n\nIf old extension had a different extension ID, Chrome isolates its storage and direct auto-load is impossible. Import old JSON backup manually.\n\nDetails: ' + (err?.message || 'No supported backup format found.'));
    });
  });
}

// ─── Focus Mode ──────────────────────────────────────────────
function restoreFocus() {
  chrome.runtime.sendMessage({ type: 'focus-query' }, response => {
    if (chrome.runtime.lastError) return;
    const session = response?.session;
    if (session && Date.now() < session.endTime) {
      sessionStorage.setItem('ds2focus', JSON.stringify(session));
      startFocusSession(session);
      return;
    }

    const saved = sessionStorage.getItem('ds2focus');
    if (!saved) return;
    try {
      const fallback = JSON.parse(saved);
      if (Date.now() < fallback.endTime) startFocusSession(fallback);
    } catch(e) { sessionStorage.removeItem('ds2focus'); }
  });
}

function doCloudClear() {
  chrome.storage.sync.get(null, items => {
    if (chrome.runtime.lastError) {
      alert('Cloud clear failed: ' + chrome.runtime.lastError.message);
      return;
    }
    const keys = getCloudKeysToRemove(items);
    if (!keys.length) {
      alert('Chrome Cloud backup is already empty.');
      return;
    }
    chrome.storage.sync.remove(keys, () => {
      if (chrome.runtime.lastError) {
        alert('Cloud clear failed: ' + chrome.runtime.lastError.message);
        return;
      }
      alert('Chrome Cloud backup cleared.');
    });
  });
}

function openFocusModal(triggerEl) {
  document.getElementById('focus-setup').style.display = focusSession ? 'none' : 'block';
  document.getElementById('focus-active').style.display = focusSession ? 'block' : 'none';
  if (focusSession) updateFocusActiveDisplay();

  const list = document.getElementById('focus-group-list');
  list.innerHTML = '';
  state.groups.filter(g => !g.isHome).forEach(g => {
    const item = document.createElement('label');
    item.className = 'focus-group-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = g.id;
    if (focusSession?.blockedGroups?.includes(g.id)) { cb.checked = true; item.classList.add('blocked'); }
    cb.addEventListener('change', () => item.classList.toggle('blocked', cb.checked));
    item.append(cb, document.createTextNode(' ' + g.name));
    list.appendChild(item);
  });

  openOverlay('modal-focus', triggerEl);
}
function closeFocusModal() { closeOverlay('modal-focus'); }

function startFocus() {
  const name = document.getElementById('focus-name-inp').value.trim() || 'Focus Session';
  const mins = parseInt(document.getElementById('focus-duration').value) || 25;
  const blockedGroups = Array.from(document.querySelectorAll('#focus-group-list input:checked')).map(c => c.value);
  const hardBlock = document.getElementById('focus-hard-block').checked;
  const showTimer = document.getElementById('focus-show-timer').checked;

  // Parse blocked domains from settings
  const blockedDomains = (state.settings.blockedDomains || '')
    .split('\n')
    .map(d => d.trim().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))
    .filter(d => d.length > 0);

  const session = {
    name, mins, blockedGroups, blockedDomains, hardBlock, showTimer,
    endTime: Date.now() + mins * 60 * 1000,
    startTime: Date.now()
  };
  sessionStorage.setItem('ds2focus', JSON.stringify(session));
  startFocusSession(session);

  // Notify background service worker
  chrome.runtime.sendMessage({ type: 'focus-start', session }, () => {
    if (chrome.runtime.lastError) {} // ignore if background not ready
  });

  closeFocusModal();
}

function startFocusSession(session) {
  if (focusSession?.intervalId) clearInterval(focusSession.intervalId);
  focusSession = session;
  document.getElementById('focus-btn').classList.add('active');

  if (session.showTimer) {
    document.getElementById('focus-bar').style.display = 'flex';
    document.getElementById('focus-bar-label').textContent = session.name;
    document.body.classList.add('has-focus-bar');
  }

  focusSession.intervalId = setInterval(() => {
    const remaining = session.endTime - Date.now();
    if (remaining <= 0) { endFocusSession(true); return; }
    if (session.showTimer) {
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      document.getElementById('focus-bar-timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
    updateFocusActiveDisplay();
  }, 1000);

  updateFocusActiveDisplay();
}

function updateFocusActiveDisplay() {
  if (!focusSession) return;
  const remaining = Math.max(0, focusSession.endTime - Date.now());
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  document.getElementById('focus-timer-display').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  document.getElementById('focus-session-label').textContent = focusSession.name;
}

function endFocusSession(auto) {
  if (!focusSession) return;
  clearInterval(focusSession.intervalId);
  focusSession = null;
  sessionStorage.removeItem('ds2focus');
  document.getElementById('focus-btn').classList.remove('active');
  document.getElementById('focus-bar').style.display = 'none';
  document.body.classList.remove('has-focus-bar');
  document.getElementById('focus-active').style.display = 'none';
  document.getElementById('focus-setup').style.display = 'block';
  if (auto) { closeFocusModal(); }
  // Notify background
  chrome.runtime.sendMessage({ type: 'focus-end' }, () => {
    if (chrome.runtime.lastError) {}
  });
  renderDials();
}

function checkFocusBlock(groupId) {
  if (!focusSession) return false;
  return focusSession.blockedGroups.includes(groupId);
}

function showBlockedToast(hardBlock) {
  const toast = document.getElementById('focus-blocked-toast');
  document.getElementById('focus-blocked-msg').textContent = '🛡 Focus mode — this group is blocked';
  document.getElementById('focus-blocked-override').style.display = hardBlock ? 'none' : 'inline-block';
  toast.style.display = 'flex';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// Listen for focus ended from another tab
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'focus-ended') endFocusSession(false);
});

// ─── Music Player ────────────────────────────────────────────
let playlist = [];
let currentIdx = 0;
let shuffleQueue = [];

// BroadcastChannel Music Sync
const musicChannel = new BroadcastChannel('ds2_music');
let isMusicLeader = false;
let leaderLastHeartbeat = Date.now();
let slaveSyncState = { playing: false, idx: 0, time: 0, duration: 0 };
let startupPingTimer = null;

function getSyncPlaylist() {
  return playlist.map(t => ({
    name: t.name, artist: t.artist, type: t.type, src: t.type === 'url' ? t.src : null, file: t.file || null
  }));
}

function updatePlaylistFromSync(syncList) {
  playlist = syncList.map(t => {
    if (t.type === 'file' && t.file) {
      return { ...t, src: URL.createObjectURL(t.file) };
    }
    return t;
  });
  updatePlayerList();
}

musicChannel.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'PING') {
    if (isMusicLeader) musicChannel.postMessage({ type: 'PONG', state: getPlayerState(), playlist: getSyncPlaylist() });
  } else if (msg.type === 'PONG') {
    if (startupPingTimer) { clearTimeout(startupPingTimer); startupPingTimer = null; }
    isMusicLeader = false;
    leaderLastHeartbeat = Date.now();
    if (msg.playlist) updatePlaylistFromSync(msg.playlist);
    syncUiFromLeader(msg.state);
  } else if (msg.type === 'PLAYLIST_UPDATE') {
    if (!isMusicLeader) updatePlaylistFromSync(msg.playlist);
  } else if (msg.type === 'LEADER_DYING') {
    setTimeout(() => {
      if (!isMusicLeader && Date.now() - leaderLastHeartbeat > 150) {
        becomeLeader(slaveSyncState);
      }
    }, Math.random() * 80);
  } else if (msg.type === 'CLAIM_LEADER') {
    if (startupPingTimer) { clearTimeout(startupPingTimer); startupPingTimer = null; }
    isMusicLeader = false;
    leaderLastHeartbeat = Date.now();
  } else if (msg.type === 'TIME_UPDATE') {
    if (!isMusicLeader) syncUiFromLeader(msg.state);
  } else if (isMusicLeader) {
    if (msg.type === 'CMD_PLAY') audio.play().catch(()=>{});
    if (msg.type === 'CMD_PAUSE') audio.pause();
    if (msg.type === 'CMD_TOGGLE') togglePlay();
    if (msg.type === 'CMD_NEXT') nextTrack(msg.forcePlay);
    if (msg.type === 'CMD_PREV') prevTrack();
    if (msg.type === 'CMD_SEEK') { audio.currentTime = msg.time; }
    if (msg.type === 'CMD_VOL') { audio.volume = msg.vol; state.player.volume = msg.vol; document.getElementById('player-vol').value = msg.vol; saveState({ scheduleBackup: false }); }
    if (msg.type === 'CMD_LOAD') { loadTrack(msg.idx, msg.autoplay, true); }
  }
};

window.addEventListener('pagehide', () => {
  if (isMusicLeader) musicChannel.postMessage({ type: 'LEADER_DYING' });
});

function getPlayerState() {
  return { playing: !audio.paused, idx: currentIdx, time: audio.currentTime, duration: audio.duration };
}

function syncUiFromLeader(st) {
  slaveSyncState = st;
  document.getElementById('player-seek').value = st.duration ? (st.time / st.duration) * 100 : 0;
  document.getElementById('player-current').textContent = fmtTime(st.time);
  document.getElementById('player-duration').textContent = fmtTime(st.duration);
  setPlayIcon(st.playing);
  currentIdx = st.idx;
  const t = playlist[currentIdx];
  if (t) {
    document.getElementById('player-title').textContent = t.name || 'Unknown';
    document.getElementById('player-artist').textContent = t.artist || '';
  }
}

function becomeLeader(st) {
  isMusicLeader = true;
  musicChannel.postMessage({ type: 'CLAIM_LEADER' });
  if (playlist.length && playlist[st.idx]) {
    audio.src = playlist[st.idx].src;
    audio.currentTime = st.time || 0;
    if (st.playing) audio.play().catch(()=>{});
  }
}

// On init, try to find a leader
setTimeout(() => {
  musicChannel.postMessage({ type: 'PING' });
  startupPingTimer = setTimeout(() => {
    isMusicLeader = true;
    musicChannel.postMessage({ type: 'CLAIM_LEADER' });
    if (playlist.length) {
      loadTrack(currentIdx, state.settings.autoplay, false);
    }
  }, 150);
}, 50);

function resetShuffleQueue() {
  shuffleQueue = [];
}

function buildShuffleQueue(excludeIdx = currentIdx) {
  shuffleQueue = playlist
    .map((_, idx) => idx)
    .filter(idx => idx !== excludeIdx);

  for (let i = shuffleQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleQueue[i], shuffleQueue[j]] = [shuffleQueue[j], shuffleQueue[i]];
  }
}

function nextShuffleIndex() {
  if (playlist.length <= 1) return currentIdx;
  shuffleQueue = shuffleQueue.filter(idx => idx >= 0 && idx < playlist.length && idx !== currentIdx);
  if (!shuffleQueue.length) buildShuffleQueue(currentIdx);
  return shuffleQueue.shift();
}

function restorePlayer() {
  playlist = state.player.playlist.filter(t => t.type === 'url').map(t => ({ ...t }));
  currentIdx = state.player.currentIdx || 0;
  audio.volume = state.player.volume;
  document.getElementById('player-vol').value = audio.volume;
  document.getElementById('btn-shuffle').classList.toggle('on', state.player.shuffle);
  document.getElementById('btn-repeat').classList.toggle('on', state.player.repeat);
  if (playlist.length) {
    loadTrack(currentIdx, false, false);
  }
}

function loadTrack(idx, autoplay, persist = true) {
  if (!playlist.length) return;
  if (!isMusicLeader) {
    musicChannel.postMessage({ type: 'CMD_LOAD', idx, autoplay });
    return;
  }
  idx = ((idx % playlist.length) + playlist.length) % playlist.length;
  currentIdx = idx;
  shuffleQueue = shuffleQueue.filter(queueIdx => queueIdx !== idx);
  const t = playlist[idx];
  audio.src = t.src;
  audio.load();
  document.getElementById('player-title').textContent = t.name || 'Unknown';
  document.getElementById('player-artist').textContent = t.artist || '';
  document.getElementById('player-seek').value = 0;
  document.getElementById('player-current').textContent = '0:00';
  document.getElementById('player-duration').textContent = '0:00';
  setPlayIcon(false);
  if (autoplay) audio.play().catch(() => {});
  state.player.currentIdx = idx;
  if (persist) saveState({ scheduleBackup: false });
}

function setPlayIcon(playing) {
  document.getElementById('icon-play').style.display  = playing ? 'none' : 'block';
  document.getElementById('icon-pause').style.display = playing ? 'block' : 'none';
}

function togglePlay() {
  if (!isMusicLeader) { musicChannel.postMessage({ type: 'CMD_TOGGLE' }); return; }
  if (audio.paused) {
    if (!audio.src && playlist.length) loadTrack(0, true);
    else audio.play().catch(() => {});
  } else audio.pause();
}

function nextTrack(forcePlay = false) {
  if (!isMusicLeader) { musicChannel.postMessage({ type: 'CMD_NEXT', forcePlay }); return; }
  if (!playlist.length) return;
  const shouldAutoplay = forcePlay || !audio.paused;

  if (!state.player.shuffle && !state.settings.loopPlaylist && currentIdx >= playlist.length - 1) {
    audio.pause();
    audio.currentTime = 0;
    setPlayIcon(false);
    return;
  }

  if (state.player.shuffle) {
    loadTrack(nextShuffleIndex(), shouldAutoplay);
  } else loadTrack(currentIdx + 1, shouldAutoplay);
}

function prevTrack() {
  if (!isMusicLeader) { musicChannel.postMessage({ type: 'CMD_PREV' }); return; }
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  loadTrack(currentIdx - 1, !audio.paused);
}

function fmtTime(s) {
  if (isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2,'0')}`;
}

function resetPlayerUi() {
  document.getElementById('player-title').textContent = 'No track loaded';
  document.getElementById('player-artist').textContent = '';
  document.getElementById('player-seek').value = 0;
  document.getElementById('player-current').textContent = '0:00';
  document.getElementById('player-duration').textContent = '0:00';
  setPlayIcon(false);
}

function unloadAllTracks() {
  if (isMusicLeader) audio.pause();
  playlist.forEach(track => {
    if (track?.type === 'file' && track.src) URL.revokeObjectURL(track.src);
  });
  playlist = [];
  currentIdx = 0;
  resetShuffleQueue();
  state.player.playlist = [];
  state.player.currentIdx = 0;
  state.player.position = 0;
  if (isMusicLeader) {
    audio.removeAttribute('src');
    audio.load();
    musicChannel.postMessage({ type: 'PLAYLIST_UPDATE', playlist: [] });
  }
  resetPlayerUi();
  document.getElementById('file-input').value = '';
  document.getElementById('folder-input').value = '';
  closeOverlay('music-prompt');
  saveState({ scheduleBackup: false });
}

// ─── visibilitychange ────────────────────────────────────────
function handleVisibilityChange() {
  if (!document.hidden) {
    if (sleepActive) exitSleepMode();
    else resetSleepTimer();
    return;
  }
  if (!audio.paused) {
    const policy = state.settings.musicLeave;
    if (policy === 'stop') {
      audio.pause();
    } else if (policy === 'ask') {
      openOverlay('music-prompt');
      // Send notification via background
      chrome.runtime.sendMessage({ type: 'music-notify' }, () => {
        if (chrome.runtime.lastError) {}
      });
    }
    // 'continue' — do nothing
  }
}

// Audio events
audio.addEventListener('timeupdate', () => {
  if (isMusicLeader) musicChannel.postMessage({ type: 'TIME_UPDATE', state: getPlayerState() });
  if (!audio.duration) return;
  if (!playerSeeking) {
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('player-seek').value = pct;
  }
  document.getElementById('player-current').textContent = fmtTime(audio.currentTime);
});
audio.addEventListener('durationchange', () => {
  if (isMusicLeader) musicChannel.postMessage({ type: 'TIME_UPDATE', state: getPlayerState() });
  document.getElementById('player-duration').textContent = fmtTime(audio.duration);
});
audio.addEventListener('play',  () => { setPlayIcon(true); if (isMusicLeader) musicChannel.postMessage({ type: 'TIME_UPDATE', state: getPlayerState() }); });
audio.addEventListener('pause', () => { setPlayIcon(false); if (isMusicLeader) musicChannel.postMessage({ type: 'TIME_UPDATE', state: getPlayerState() }); });
audio.addEventListener('ended', () => {
  if (state.player.repeat) { audio.currentTime = 0; audio.play(); }
  else nextTrack(true);
});

function loadFilesIntoPlaylist(files) {
  const tracks = Array.from(files).map(f => ({
    name: f.name.replace(/\.[^.]+$/, ''),
    artist: '',
    src: URL.createObjectURL(f),
    file: f,
    type: 'file'
  }));
  playlist.push(...tracks);
  resetShuffleQueue();
  state.player.playlist.push(...tracks.map(t => ({ name: t.name, artist: t.artist, type: 'file', src: null })));
  if (isMusicLeader) musicChannel.postMessage({ type: 'PLAYLIST_UPDATE', playlist: getSyncPlaylist() });
  if (!audio.src || audio.src === window.location.href) loadTrack(playlist.length - tracks.length, false);
  if (state.settings.autoplay && isMusicLeader) audio.play().catch(() => {});
  updatePlayerList();
  saveState({ scheduleBackup: false });
}

function loadUrlIntoPlaylist(url) {
  if (!url) return;
  const name = url.split('/').pop().split('?')[0] || 'Stream';
  const track = { name, artist: '', src: url, type: 'url' };
  playlist.push(track);
  resetShuffleQueue();
  state.player.playlist.push({ ...track });
  if (isMusicLeader) musicChannel.postMessage({ type: 'PLAYLIST_UPDATE', playlist: getSyncPlaylist() });
  if (!audio.src || audio.src === window.location.href) loadTrack(playlist.length - 1, true);
  saveState({ scheduleBackup: false });
  updatePlayerList();
}

function updatePlayerList() {
  if (!playlist.length) {
    resetPlayerUi();
  }
}

// ─── Icon Search ─────────────────────────────────────────────
function buildIconSearchUrls(query, source) {
  const urls = [];
  const domain = query.replace(/\s+/g, '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  const tlds = ['.com', '.io', '.org', '.net', '.co', '.dev', '.app', '.me', '.tv', '.ai', '.gg'];

  if (source === 'google') {
    for (const sz of [128, 64, 32]) {
      urls.push(`https://www.google.com/s2/favicons?domain=${domain}.com&sz=${sz}`);
    }
    for (const tld of tlds.slice(0, 6)) {
      urls.push(`https://www.google.com/s2/favicons?domain=${domain}${tld}&sz=64`);
      urls.push(`https://www.google.com/s2/favicons?domain=www.${domain}${tld}&sz=64`);
    }
  } else if (source === 'duckduckgo') {
    for (const tld of tlds) {
      urls.push(`https://icons.duckduckgo.com/ip3/${domain}${tld}.ico`);
      urls.push(`https://icons.duckduckgo.com/ip3/www.${domain}${tld}.ico`);
    }
  } else if (source === 'clearbit') {
    for (const tld of tlds.slice(0, 6)) {
      urls.push(`https://logo.clearbit.com/${domain}${tld}`);
    }
  } else if (source === 'brandfetch') {
    for (const tld of tlds.slice(0, 6)) {
      urls.push(`https://cdn.brandfetch.io/${domain}${tld}/w/400/h/400`);
      urls.push(`https://cdn.brandfetch.io/www.${domain}${tld}/w/400/h/400`);
    }
  } else if (source === 'iconhorse') {
    for (const tld of tlds) {
      urls.push(`https://icon.horse/icon/${domain}${tld}`);
    }
    // Also try unavatar and faviconkit as bonus
    urls.push(`https://unavatar.io/${domain}`);
    for (const tld of tlds.slice(0, 4)) {
      urls.push(`https://api.faviconkit.com/${domain}${tld}/144`);
    }
  }
  return urls;
}

function doIconSearch() {
  const query = document.getElementById('icon-search-inp').value.trim();
  if (!query) return;
  const results = document.getElementById('icon-results');
  results.innerHTML = '<div style="color:var(--muted);font-size:13px;grid-column:1/-1">Loading…</div>';

  const urls = buildIconSearchUrls(query, iconSearchSource);
  results.innerHTML = '';

  urls.forEach(url => {
    const wrap = document.createElement('div');
    wrap.className = 'icon-option';
    const img = document.createElement('img');
    img.src = url;
    img.style.display = 'none';
    img.onload = () => {
      if (img.naturalWidth >= 1) { img.style.display = 'block'; wrap.style.display = 'flex'; }
    };
    img.onerror = () => { wrap.remove(); };
    wrap.style.display = 'none';
    wrap.appendChild(img);
    wrap.addEventListener('click', () => {
      document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
      wrap.classList.add('selected');
      selectedIconUrl = url;
      const sel = document.getElementById('icon-selected-preview');
      sel.style.display = 'flex';
      document.getElementById('icon-sel-img').src = url;
      document.getElementById('icon-sel-label').textContent = query;
    });
    results.appendChild(wrap);
  });
}

// ─── Helpers ─────────────────────────────────────────────────
function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function setupOverlayPanels() {
  document.querySelectorAll('.overlay-panel').forEach(panel => {
    panel.style.display = 'flex';
  });
}

function syncBodyModalState() {
  const hasOpenPanels = !!document.querySelector('.overlay-panel.is-open');
  document.body.classList.toggle('animating-modal', hasOpenPanels);
}

function setOverlayOrigin(panel, triggerEl) {
  if (!panel) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight * 0.18;
  if (triggerEl?.getBoundingClientRect) {
    const rect = triggerEl.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const shiftX = Math.round((x - centerX) * 0.82);
  const shiftY = Math.round((y - centerY) * 0.9);
  panel.style.setProperty('--panel-origin-x', `${Math.round(x)}px`);
  panel.style.setProperty('--panel-origin-y', `${Math.round(y)}px`);
  panel.style.setProperty('--lamp-shift-x', `${shiftX}px`);
  panel.style.setProperty('--lamp-shift-y', `${shiftY}px`);
  panel.style.setProperty('--lamp-skew-x', `${shiftX >= 0 ? 12 : -12}deg`);
}

// ─── Wallpaper grid ────────────────────────────────────────
let availableWallpapers = [];

async function loadWallpaperGrid(selectedWallpaper) {
  const grid = document.getElementById('s-wallpaper-grid');
  if (!grid) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'scan-wallpapers' });
    availableWallpapers = response?.wallpapers || [];
  } catch (e) {
    availableWallpapers = [];
  }

  grid.innerHTML = '';

  // Add "None" option
  const noneCard = document.createElement('div');
  noneCard.className = 'wallpaper-card' + (!selectedWallpaper ? ' selected' : '');
  noneCard.innerHTML = `
    <div class="wallpaper-preview" style="background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);display:flex;align-items:center;justify-content:center">
      <span style="font-size:11px;color:rgba(255,255,255,0.5)">None</span>
    </div>
    <div class="wallpaper-name">Default</div>
  `;
  noneCard.addEventListener('click', () => selectWallpaper(null));
  grid.appendChild(noneCard);

  // Add wallpaper cards
  for (const wp of availableWallpapers) {
    const card = document.createElement('div');
    card.className = 'wallpaper-card' + (selectedWallpaper === wp.file ? ' selected' : '');
    card.innerHTML = `
      <div class="wallpaper-preview">
        ${wp.type === 'video'
          ? `<video src="${chrome.runtime.getURL(wp.file)}" muted loop autoplay playsinline></video>`
          : `<img src="${chrome.runtime.getURL(wp.file)}" alt="${wp.name}">`
        }
      </div>
      <div class="wallpaper-name">${wp.name}</div>
    `;
    card.addEventListener('click', () => selectWallpaper(wp.file));
    grid.appendChild(card);
  }

  // Show/hide controls
  const controls = document.getElementById('s-wallpaper-controls');
  if (controls) {
    controls.style.display = selectedWallpaper ? 'block' : 'none';
  }
}

function selectWallpaper(file) {
  state.settings.wallpaper = file;
  document.querySelectorAll('.wallpaper-card').forEach(c => c.classList.remove('selected'));
  const cards = document.querySelectorAll('.wallpaper-card');
  if (!file) {
    cards[0]?.classList.add('selected');
  } else {
    const idx = availableWallpapers.findIndex(w => w.file === file);
    if (idx >= 0) cards[idx + 1]?.classList.add('selected');
  }
  const controls = document.getElementById('s-wallpaper-controls');
  if (controls) {
    controls.style.display = file ? 'block' : 'none';
  }
  applyWallpaperPreview(file);
}

function applyWallpaperPreview(file) {
  const bgLayer = document.getElementById('bg-layer');
  if (!bgLayer) return;

  const s = state.settings;
  const zoom = s.wallpaperZoom || 100;
  const posX = s.wallpaperX || 50;
  const posY = s.wallpaperY || 50;
  const fit = s.wallpaperFit || 'cover';
  const blur = s.wallpaperBlur || false;

  if (!file) {
    bgLayer.style.backgroundImage = '';
    if (getResolvedTheme() === 'default') {
      bgLayer.style.background = smoothSkyBackground(getResolvedSkyHour(), getEclipseDimForDisplay());
      bgLayer.style.backgroundSize = '';
      bgLayer.style.backgroundPosition = '';
      bgLayer.style.backgroundRepeat = '';
      bgLayer.style.filter = '';
    }
    return;
  }

  const url = chrome.runtime.getURL(file);
  const size = fit === 'cover' ? 'cover' : fit === 'contain' ? 'contain' : fit === 'stretch' ? '100% 100%' : 'auto';
  const pos = `${posX}% ${posY}%`;
  const filter = blur ? 'blur(8px) brightness(0.8)' : '';

  // Keep the generated sky underneath the wallpaper. If a stale or missing
  // wallpaper path is stored, Default still has a visible sky instead of a
  // black transparent layer.
  const fallbackSky = getResolvedTheme() === 'default'
    ? smoothSkyBackground(getResolvedSkyHour(), getEclipseDimForDisplay())
    : '';
  bgLayer.style.background = `url('${url}') center / ${size} no-repeat${fallbackSky ? `, ${fallbackSky}` : ''}`;
  bgLayer.style.backgroundImage = `url('${url}'), ${fallbackSky || 'none'}`;
  bgLayer.style.backgroundSize = size;
  bgLayer.style.backgroundPosition = pos;
  bgLayer.style.backgroundRepeat = 'no-repeat';
  bgLayer.style.filter = filter;
}

function initWallpaperControls() {
  const zoomSlider = document.getElementById('s-wallpaper-zoom');
  const xSlider = document.getElementById('s-wallpaper-x');
  const ySlider = document.getElementById('s-wallpaper-y');
  const blurToggle = document.getElementById('s-wallpaper-blur');

  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
      state.settings.wallpaperZoom = parseInt(e.target.value);
      document.getElementById('wallpaper-zoom-val').textContent = e.target.value + '%';
      applyWallpaperPreview(state.settings.wallpaper);
    });
  }

  if (xSlider) {
    xSlider.addEventListener('input', (e) => {
      state.settings.wallpaperX = parseInt(e.target.value);
      document.getElementById('wallpaper-x-val').textContent = e.target.value + '%';
      applyWallpaperPreview(state.settings.wallpaper);
    });
  }

  if (ySlider) {
    ySlider.addEventListener('input', (e) => {
      state.settings.wallpaperY = parseInt(e.target.value);
      document.getElementById('wallpaper-y-val').textContent = e.target.value + '%';
      applyWallpaperPreview(state.settings.wallpaper);
    });
  }

  if (blurToggle) {
    blurToggle.addEventListener('change', (e) => {
      state.settings.wallpaperBlur = e.target.checked;
      applyWallpaperPreview(state.settings.wallpaper);
    });
  }

  document.querySelectorAll('input[name="wallpaper-fit"]').forEach(r => {
    r.addEventListener('change', () => {
      state.settings.wallpaperFit = r.value;
      applyWallpaperPreview(state.settings.wallpaper);
    });
  });

  const sleepEnabledEl = document.getElementById('s-sleep-enabled');
  const sleepTimeoutEl = document.getElementById('s-sleep-timeout');
  const sleepColorGlowEl = document.getElementById('s-sleep-color-glow');
  if (sleepEnabledEl) sleepEnabledEl.addEventListener('change', () => {
    state.settings.sleepEnabled = sleepEnabledEl.checked;
    if (sleepActive && sleepEnabledEl.checked) resetSleepTimer();
    else if (!sleepEnabledEl.checked) { clearTimeout(sleepTimer); }
  });
  if (sleepTimeoutEl) sleepTimeoutEl.addEventListener('change', () => {
    state.settings.sleepTimeout = parseInt(sleepTimeoutEl.value) || 60;
    resetSleepTimer();
  });
  if (sleepColorGlowEl) sleepColorGlowEl.addEventListener('change', () => {
    state.settings.sleepColorGlow = sleepColorGlowEl.checked;
  });
}

function openOverlay(id, triggerEl) {
  const panel = document.getElementById(id);
  if (!panel) return;
  setOverlayOrigin(panel, triggerEl);
  panel.classList.remove('is-closing');
  panel.style.display = panel.id === 'ctx-menu' || panel.id === 'ctx-move-sub' ? 'block' : 'flex';
  requestAnimationFrame(() => panel.classList.add('is-open'));
  syncBodyModalState();
}

function closeOverlay(id) {
  const panel = document.getElementById(id);
  if (!panel || (!panel.classList.contains('is-open') && !panel.classList.contains('is-closing'))) return;
  panel.classList.remove('is-open');
  panel.classList.add('is-closing');
  setTimeout(() => {
    panel.classList.remove('is-closing');
    syncBodyModalState();
  }, MODAL_CLOSE_MS);
}

// ─── Bind All Events ─────────────────────────────────────────
function bindAll() {

  // Add tab
  document.getElementById('add-tab-btn').addEventListener('click', e => openTabModal(null, e.currentTarget));
  document.getElementById('tab-bar').addEventListener('contextmenu', e => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    hideCtx();
    showTopBarCtxMenu(e);
  });
  document.getElementById('topbar-new-tab').addEventListener('click', e => {
    openTabModal(null, e.currentTarget);
    hideCtx();
  });
  document.getElementById('create-dial').addEventListener('click', () => { hideCtx(); openDialModal(null); });
  document.getElementById('create-folder').addEventListener('click', () => {
    if (folderStack.length) { hideCtx(); return; }
    hideCtx();
    openFolderModal(null);
  });

  // Focus mode
  document.getElementById('focus-btn').addEventListener('click', e => openFocusModal(e.currentTarget));
  document.getElementById('focus-cancel').addEventListener('click', closeFocusModal);
  document.getElementById('modal-focus').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeFocusModal(); });
  document.getElementById('focus-start-btn').addEventListener('click', startFocus);
  document.getElementById('focus-stop-btn').addEventListener('click', () => endFocusSession(false));
  document.getElementById('focus-bar-end').addEventListener('click', () => endFocusSession(false));
  document.querySelectorAll('.focus-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('focus-duration').value = btn.dataset.min;
      document.querySelectorAll('.focus-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  document.getElementById('focus-blocked-override').addEventListener('click', () => {
    document.getElementById('focus-blocked-toast').style.display = 'none';
    if (window._lastBlockedUrl) { window.location.href = window._lastBlockedUrl; }
  });
  document.getElementById('backup-toast-save').addEventListener('click', saveBackupToFile);
  document.getElementById('backup-toast-later').addEventListener('click', hideBackupPrompt);

  // Settings
  document.getElementById('speedtest-btn').addEventListener('click', openSpeedTest);
  document.getElementById('ai-btn').addEventListener('click', openAI);
  document.getElementById('speedtest-panel-close').addEventListener('click', closeSpeedTestPanel);
  document.getElementById('ai-panel-close').addEventListener('click', closeAI);
  document.getElementById('settings-btn').addEventListener('click', e => openSettings(e.currentTarget));
  document.getElementById('s-cancel').addEventListener('click', closeSettings);
  document.getElementById('s-save').addEventListener('click', saveSettings);
  let versionClicks = 0, versionClickTimer = null;
  document.getElementById('s-version').addEventListener('click', () => {
    versionClicks++;
    clearTimeout(versionClickTimer);
    versionClickTimer = setTimeout(() => { versionClicks = 0; }, 2000);
    if (versionClicks >= 10) { versionClicks = 0; openDevMenu(); }
  });
  document.getElementById('dev-close').addEventListener('click', closeDevMenu);
  document.getElementById('dev-reload').addEventListener('click', () => location.reload());
  document.getElementById('dev-copy').addEventListener('click', copyDevLogs);
  document.getElementById('dev-integrity-btn').addEventListener('click', runIntegrityCheck);
  document.getElementById('dev-selftest-btn').addEventListener('click', runSelfTest);
  document.getElementById('modal-dev').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeDevMenu(); });

  // Dev — Earth weather override (session-only, resets on reload)
  document.querySelectorAll('.dev-weather-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const effect = btn.dataset.effect;
      if (effect === 'clear') {
        sessionStorage.removeItem('dev-earth-override');
      } else {
        sessionStorage.setItem('dev-earth-override', effect);
      }
      try {
        if (typeof EarthWeather !== 'undefined' && typeof EarthWeather.setEffect === 'function') {
          EarthWeather.setEffect(effect);
        } else if (typeof EarthTheme !== 'undefined' && typeof EarthTheme.setWeatherEffect === 'function') {
          EarthTheme.setWeatherEffect(effect);
        }
      } catch(e) { console.warn('Earth weather override failed:', e); }
      document.querySelectorAll('.dev-weather-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const statusEl = document.getElementById('dev-weather-status');
      if (statusEl) statusEl.textContent = effect === 'clear' ? 'Auto mode (resets on reload)' : `Override: ${effect}`;
    });
  });
  document.getElementById('modal-settings').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeSettings(); });
  document.querySelectorAll('.settings-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsSection(btn.dataset.section));
  });
  document.getElementById('s-ai-key-toggle').addEventListener('click', () => {
    const el = document.getElementById('s-ai-key');
    el.type = el.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('s-ai-clear-key').addEventListener('click', async () => {
    await saveAiApiKey('');
    document.getElementById('s-ai-key').value = '';
    document.getElementById('s-ai-key').dataset.hasKey = '0';
    document.getElementById('s-ai-status').textContent = 'Key cleared.';
  });
  document.getElementById('s-ai-test-key').addEventListener('click', async () => {
    const status = document.getElementById('s-ai-status');
    let key = document.getElementById('s-ai-key').value;
    if (document.getElementById('s-ai-key').dataset.hasKey === '1') key = await loadAiApiKey();
    if (!key || key === '••••••••••••••••') { status.textContent = 'No API key set.'; return; }
    status.textContent = 'Testing…';
    try {
      const r = await fetch('https://opencode.ai/zen/v1/models', {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      if (r.ok) status.textContent = '✓ Connection successful (' + (await r.json()).data.length + ' models available)';
      else status.textContent = '✗ Error ' + r.status + ': ' + (await r.text()).slice(0,80);
    } catch (e) {
      status.textContent = '✗ Network error: ' + e.message;
    }
  });

  const bgTimeInput = document.getElementById('s-bg-time');
  if (bgTimeInput) bgTimeInput.addEventListener('input', () => {
    document.getElementById('s-auto-daynight').checked = false;
    updateBgTimeLabel();
    state.settings.bgTime = _clamp01(parseFloat(bgTimeInput.value) / 24) * 24;
    applySettings();
  });
  document.querySelectorAll('.sky-preset').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('s-auto-daynight').checked = false;
    state.settings.bgTime = _clamp01(parseFloat(btn.dataset.bgtime) / 24) * 24;
    if (bgTimeInput) { bgTimeInput.value = state.settings.bgTime; updateBgTimeLabel(); }
    applySettings();
  }));
  document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener('change', () => {
    if (r.checked) {
      document.getElementById('s-auto-options').style.display = r.value === 'default' ? 'block' : 'none';
      document.getElementById('s-liquid-variant-wrap').style.display = r.value === 'liquid' ? 'block' : 'none';
      document.getElementById('s-galaxy-options').style.display = r.value === 'galaxy' ? 'block' : 'none';
    }
  }));
  const gpSel = document.getElementById('s-galaxy-planet');
  if (gpSel) gpSel.addEventListener('change', () => {
    state.settings.galaxyPlanet = gpSel.value || 'earth';
    if (getResolvedTheme() === 'galaxy' && typeof GalaxyTheme !== 'undefined' && GalaxyTheme.isActive()) {
GalaxyTheme.setPlanet(state.settings.galaxyPlanet);
    }
    saveState();
    applySettings();
  });
  document.getElementById('s-weather-effect').addEventListener('change', () => {
    document.getElementById('s-auto-weather').checked = false;
    state.settings.weatherEffect = normalizeWeatherEffect(document.getElementById('s-weather-effect').value);
    if (isEarthSelected() && typeof EarthTheme !== 'undefined' && typeof EarthTheme.setWeatherEffect === 'function') {
      const devOverride = sessionStorage.getItem('dev-earth-override');
      EarthTheme.setWeatherEffect(devOverride || state.settings.weatherEffect);
    }
    applySettings();
  });
  document.getElementById('overlay-opacity').addEventListener('input', e => {
    document.getElementById('overlay-val').textContent = parseFloat(e.target.value).toFixed(2);
    document.documentElement.style.setProperty('--overlay-op', e.target.value);
  });

  // Import/Export + Cloud
  document.getElementById('import-export-btn').addEventListener('click', e => openIE(e.currentTarget));
  document.getElementById('ie-close').addEventListener('click', closeIE);
  document.getElementById('modal-ie').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeIE(); });
  document.getElementById('ie-export-min').addEventListener('click', doExportMinimal);
  document.getElementById('ie-export-full').addEventListener('click', doExportFull);
  document.getElementById('ie-import-btn').addEventListener('click', () => document.getElementById('ie-import-file').click());
  document.getElementById('ie-import-file').addEventListener('change', e => { if (e.target.files[0]) doImport(e.target.files[0]); });
  document.getElementById('ie-import-fvd-btn').addEventListener('click', () => document.getElementById('ie-import-fvd-file').click());
  document.getElementById('ie-import-fvd-file').addEventListener('change', e => { if (e.target.files[0]) doImportFvd(e.target.files[0]); });
  document.getElementById('ie-import-fvd-text-btn').addEventListener('click', () => {
    try {
      importFvdText(document.getElementById('ie-import-fvd-text').value);
    } catch(err) {
      alert('FVD import failed: ' + err.message);
    }
  });
  document.getElementById('ie-reset').addEventListener('click', doReset);
  document.getElementById('ie-cloud-save').addEventListener('click', doCloudSave);
  document.getElementById('ie-cloud-load').addEventListener('click', doCloudLoad);
  document.getElementById('ie-cloud-clear').addEventListener('click', doCloudClear);
  document.getElementById('s-export-min').addEventListener('click', doExportMinimal);
  document.getElementById('s-export-full').addEventListener('click', doExportFull);
  document.getElementById('s-import-btn').addEventListener('click', () => document.getElementById('ie-import-file').click());
  document.getElementById('s-import-fvd-btn').addEventListener('click', () => document.getElementById('ie-import-fvd-file').click());
  document.getElementById('s-import-fvd-text-btn').addEventListener('click', () => {
    try {
      importFvdText(document.getElementById('s-import-fvd-text').value);
    } catch(err) {
      alert('FVD import failed: ' + err.message);
    }
  });
  document.getElementById('s-reset').addEventListener('click', doReset);
  document.getElementById('s-check-update').addEventListener('click', async () => {
    const statusEl = document.getElementById('s-update-status');
    statusEl.textContent = 'Checking...';
    statusEl.style.color = 'var(--muted)';
    try {
      const repoUrl = chrome.runtime.getManifest().homepage_url || 'https://github.com/Tamp1x/SpaceDial';
      const apiRepo = repoUrl.replace('https://github.com/', '').replace(/\/$/, '');
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 10000);
      const res = await fetch(`https://api.github.com/repos/${apiRepo}/releases/latest`, { signal: ac.signal });
      clearTimeout(to);
      if (!res.ok) { statusEl.textContent = 'Failed to check'; statusEl.style.color = 'var(--danger)'; return; }
      const data = await res.json();
      if (data.tag_name) {
        const remote = data.tag_name.replace(/^v/, '');
        const local = await getLiveVersion();
        if (remote !== local) {
          statusEl.innerHTML = `Update ${data.tag_name} — <a href="${data.html_url || repoUrl + '/releases/latest'}" target="_blank" style="color:var(--accent)">Download on GitHub</a>`;
          statusEl.style.color = 'var(--accent)';
        } else {
          statusEl.textContent = `Up to date (${local})`;
          statusEl.style.color = 'rgba(100,255,130,0.6)';
        }
      }
    } catch(e) {
      statusEl.textContent = 'Check failed';
      statusEl.style.color = 'var(--danger)';
    }
  });
  document.getElementById('s-cloud-save').addEventListener('click', doCloudSave);
  document.getElementById('s-cloud-load').addEventListener('click', doCloudLoad);
  document.getElementById('s-cloud-clear').addEventListener('click', doCloudClear);

  // Dial modal
  document.getElementById('modal-dial-cancel').addEventListener('click', closeDialModal);
  document.getElementById('modal-dial-save').addEventListener('click', saveDialModal);
  document.getElementById('modal-dial').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeDialModal(); });
  document.getElementById('dial-url-inp').addEventListener('keydown', e => { if (e.key === 'Enter') saveDialModal(); });

  document.querySelectorAll('input[name="icon-src"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('icon-search-area').style.display = r.value === 'search' && r.checked ? 'block' : 'none';
    document.getElementById('icon-upload-area').style.display = r.value === 'upload' && r.checked ? 'block' : 'none';
  }));
  document.getElementById('icon-search-btn').addEventListener('click', doIconSearch);
  document.getElementById('icon-search-inp').addEventListener('keydown', e => { if (e.key === 'Enter') doIconSearch(); });
  document.querySelectorAll('.isrc-tab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.isrc-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    iconSearchSource = btn.dataset.src;
    if (document.getElementById('icon-search-inp').value.trim()) doIconSearch();
  }));
  document.getElementById('icon-sel-clear').addEventListener('click', () => {
    selectedIconUrl = null;
    document.getElementById('icon-selected-preview').style.display = 'none';
    document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
  });
  document.getElementById('dial-icon-file-btn').addEventListener('click', () => {
    document.getElementById('dial-icon-file').click();
  });
  document.getElementById('dial-icon-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    setPickedFileName(document.getElementById('dial-icon-file-name'), f);
    const b = await fileToB64(f);
    const p = document.getElementById('dial-icon-preview'); p.src = b; p.style.display = 'block';
  });

  // Tab modal
  document.getElementById('modal-tab-cancel').addEventListener('click', closeTabModal);
  document.getElementById('modal-tab-save').addEventListener('click', saveTabModal);
  document.getElementById('tab-delete-btn').addEventListener('click', deleteTab);
  document.getElementById('modal-tab').addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeTabModal(); });
  document.getElementById('tab-name-inp').addEventListener('keydown', e => { if (e.key === 'Enter') saveTabModal(); });

  // Context menu
  document.getElementById('ctx-edit').addEventListener('click', () => {
    if (!ctxDialId) return;
    const item = findDial(ctxDialId);
    if (item?.type === 'folder') openFolderModal(ctxDialId);
    else openDialModal(ctxDialId);
    hideCtx();
  });
  document.getElementById('ctx-del').addEventListener('click', () => {
    if (!ctxDialId) return;
    const found = findDialEntry(ctxDialId);
    if (found) found.list.splice(found.index, 1);
    saveState(); renderDials(); hideCtx();
  });
  document.getElementById('ctx-move').addEventListener('click', () => {
    const sub = document.getElementById('ctx-move-sub');
    sub.innerHTML = '';
    state.groups.filter(g => !g.isHome && g.id !== state.activeGroup).forEach(g => {
      const item = document.createElement('div');
      item.className = 'ctx-item';
      item.textContent = g.name;
      item.addEventListener('click', () => { moveDial(ctxDialId, g.id); hideCtx(); });
      sub.appendChild(item);
    });
    if (!sub.children.length) {
      const n = document.createElement('div');
      n.className = 'ctx-item'; n.style.color = 'var(--muted)';
      n.textContent = 'No other groups'; sub.appendChild(n);
    }
    sub.style.display = 'block';
    const r = document.getElementById('ctx-menu').getBoundingClientRect();
    positionEl(sub, r.right + 4, r.top);
    requestAnimationFrame(() => sub.classList.add('is-open'));
  });
  document.addEventListener('mousedown', e => {
    isSelectingCtxText = document.getElementById('ctx-menu').contains(e.target) ||
      document.getElementById('ctx-move-sub').contains(e.target) ||
      document.getElementById('topbar-ctx-menu')?.contains(e.target) ||
      document.getElementById('create-ctx-menu')?.contains(e.target);
    if (!isSelectingCtxText && !window.getSelection()?.toString()) hideCtx();
  });
  document.addEventListener('mouseup', e => {
    const hasSelection = !!window.getSelection()?.toString();
    if (hasSelection && isSelectingCtxText) return;
    if (!document.getElementById('ctx-menu').contains(e.target) &&
        !document.getElementById('ctx-move-sub').contains(e.target) &&
        !document.getElementById('topbar-ctx-menu')?.contains(e.target) &&
        !document.getElementById('create-ctx-menu')?.contains(e.target)) hideCtx();
  });

  const dialsView = document.getElementById('view-dials');
  dialsView.addEventListener('contextmenu', e => {
    if (e.target.closest('.dial-card')) return;
    if (e.target.closest('#ctx-menu') || e.target.closest('#ctx-move-sub')) return;
    e.preventDefault();
    hideCtx();
    showCreateMenu(e.clientX, e.clientY);
  });
  dialsView.addEventListener('click', e => {
    if (!folderStack.length) return;
    if (e.target.closest('.dial-card') || e.target.closest('#ctx-menu') || e.target.closest('#ctx-move-sub') || e.target.closest('#create-ctx-menu')) return;
    closeFolderLevel();
  });

  // Music player
  document.getElementById('btn-play').addEventListener('click', togglePlay);
  document.getElementById('btn-next').addEventListener('click', nextTrack);
  document.getElementById('btn-prev').addEventListener('click', prevTrack);
  document.getElementById('btn-shuffle').addEventListener('click', () => {
    state.player.shuffle = !state.player.shuffle;
    resetShuffleQueue();
    document.getElementById('btn-shuffle').classList.toggle('on', state.player.shuffle);
    saveState({ scheduleBackup: false });
  });
  document.getElementById('btn-repeat').addEventListener('click', () => {
    state.player.repeat = !state.player.repeat;
    document.getElementById('btn-repeat').classList.toggle('on', state.player.repeat);
    saveState({ scheduleBackup: false });
  });
  const seekEl = document.getElementById('player-seek');
  const setSeeking = v => {
    if (playerSeeking === v) return;
    playerSeeking = v;
    if (v) {
      wasPlayingBeforeSeek = isMusicLeader ? !audio.paused : slaveSyncState.playing;
      if (wasPlayingBeforeSeek) {
        if (isMusicLeader) audio.pause();
        else musicChannel.postMessage({ type: 'CMD_PAUSE' });
      }
      return;
    }
    if (wasPlayingBeforeSeek) {
      if (isMusicLeader) audio.play().catch(() => {});
      else musicChannel.postMessage({ type: 'CMD_PLAY' });
    }
    wasPlayingBeforeSeek = false;
  };
  seekEl.addEventListener('pointerdown', () => setSeeking(true));
  seekEl.addEventListener('pointerup', () => setSeeking(false));
  seekEl.addEventListener('pointercancel', () => setSeeking(false));
  window.addEventListener('pointerup', () => setSeeking(false));
  seekEl.addEventListener('input', e => {
    const duration = isMusicLeader ? audio.duration : slaveSyncState.duration;
    if (!duration) return;
    const t = (e.target.value / 100) * duration;
    if (isMusicLeader) audio.currentTime = t;
    else musicChannel.postMessage({ type: 'CMD_SEEK', time: t });
    document.getElementById('player-current').textContent = fmtTime(t);
  });
  document.getElementById('player-vol').addEventListener('input', e => {
    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    state.player.volume = vol;
    saveState({ scheduleBackup: false });
    if (!isMusicLeader) musicChannel.postMessage({ type: 'CMD_VOL', vol });
  });
  document.getElementById('btn-load-file').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', e => { if (e.target.files.length) loadFilesIntoPlaylist(e.target.files); });
  document.getElementById('btn-load-folder').addEventListener('click', () => document.getElementById('folder-input').click());
  document.getElementById('folder-input').addEventListener('change', e => { if (e.target.files.length) loadFilesIntoPlaylist(e.target.files); });
  document.getElementById('btn-unload-all').addEventListener('click', unloadAllTracks);
  document.getElementById('btn-load-url').addEventListener('click', () => {
    document.getElementById('stream-url-input').value = '';
    openOverlay('modal-url', document.getElementById('btn-load-url'));
  });
  document.getElementById('modal-url-cancel').addEventListener('click', () => { closeOverlay('modal-url'); });
  document.getElementById('modal-url-ok').addEventListener('click', () => {
    const url = document.getElementById('stream-url-input').value.trim();
    if (url) { loadUrlIntoPlaylist(url); closeOverlay('modal-url'); }
  });
  document.getElementById('stream-url-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('modal-url-ok').click();
  });

  // Music leave prompt
  document.getElementById('mp-stop').addEventListener('click', () => {
    audio.pause();
    closeOverlay('music-prompt');
  });
  document.getElementById('mp-keep').addEventListener('click', () => {
    closeOverlay('music-prompt');
  });

  // Notes — autosave with debounce
  document.getElementById('notes-area').addEventListener('input', e => {
    state.notes = e.target.value;
    clearTimeout(notesSaveTimer);
    notesSaveTimer = setTimeout(() => saveState(), 500);
  });

  // ESC closes all modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeDialModal(); closeTabModal(); closeSettings(); closeIE(); closeFocusModal();
    closeOverlay('modal-url');
    closeOverlay('music-prompt');
    closeSpeedTestPanel();
    hideCtx();
  });

  window.addEventListener('resize', updateTabsActivePill);
  window.addEventListener('resize', () => {
    clearTimeout(starsResizeTimer);
    starsResizeTimer = setTimeout(() => {
      if (isMilkywaySelected()) drawGalaxyStars();
      else if (getResolvedTheme() === 'default' && backgroundUsesStars()) drawStars();
      drawWeatherEffect();
    }, 120);
  });
  document.getElementById('tabs-scroll').addEventListener('scroll', updateTabsActivePill, { passive: true });
}

async function getLiveVersion() {
  try {
    const r = await fetch(chrome.runtime.getURL('manifest.json'));
    const m = await r.json();
    return m.version || chrome.runtime.getManifest().version;
  } catch { return chrome.runtime.getManifest().version; }
}
function setupOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  const update = () => {
    banner.style.display = navigator.onLine ? 'none' : 'flex';
  };
  window.addEventListener('offline', update);
  window.addEventListener('online', update);
  update();
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

async function checkForUpdates() {
  try {
    const repoUrl = chrome.runtime.getManifest().homepage_url || 'https://github.com/Tamp1x/SpaceDial';
    const apiRepo = repoUrl.replace('https://github.com/', '').replace(/\/$/, '');
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`https://api.github.com/repos/${apiRepo}/releases/latest`, { signal: ac.signal });
    clearTimeout(to);
    if (!res.ok) return;
    const data = await res.json();
    if (data.tag_name) {
      const remoteVersion = data.tag_name.replace(/^v/, '');
      const localVersion = await getLiveVersion();
      if (compareVersions(remoteVersion, localVersion) > 0 && remoteVersion !== state.ignoredUpdate) {
        const msg = document.getElementById('update-toast-msg');
        if (msg) msg.textContent = `Update ${data.tag_name}`;
        document.getElementById('update-toast-download').onclick = () => {
          window.open(data.html_url || repoUrl + '/releases/latest', '_blank');
        };
        const toast = document.getElementById('update-toast');
        if (toast) toast.style.display = 'flex';
        document.getElementById('update-toast-later').onclick = () => {
          toast.style.display = 'none';
          state.ignoredUpdate = remoteVersion;
          saveState({ scheduleBackup: false });
        };
      }
    }
  } catch(e) {
    console.error('Update check failed:', e);
  }
}
