(() => {
  const params = new URLSearchParams(location.search);
  const originalUrl = params.get('url') || '';
  const endTime = parseInt(params.get('end') || '0', 10);
  const sessionName = params.get('name') || 'Focus Session';
  const hardBlock = params.get('hard') === '1';

  const sessionNameEl = document.getElementById('session-name');
  const blockedUrlEl = document.getElementById('blocked-url-display');
  const countdownEl = document.getElementById('countdown');
  const goBtn = document.getElementById('btn-go');
  const waitBtn = document.getElementById('btn-wait');
  const noteEl = document.getElementById('note-text');

  let waitMode = false;

  sessionNameEl.textContent = sessionName;

  try {
    const url = new URL(originalUrl);
    blockedUrlEl.textContent = url.hostname + (url.pathname !== '/' ? url.pathname : '');
  } catch {
    blockedUrlEl.textContent = originalUrl;
  }

  if (hardBlock) {
    waitBtn.style.display = 'none';
    noteEl.textContent = 'Hard block is active. Wait for the session to end.';
  }

  function updateCountdown() {
    const remaining = Math.max(0, endTime - Date.now());
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    countdownEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (remaining <= 0) {
      countdownEl.classList.add('done');
      countdownEl.textContent = '00:00';
      if (waitMode && originalUrl) {
        location.href = originalUrl;
      }
    }
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  goBtn.addEventListener('click', () => {
    location.href = chrome.runtime.getURL('newtab.html');
  });

  waitBtn.addEventListener('click', () => {
    if (waitMode) return;
    waitMode = true;
    waitBtn.textContent = 'Waiting for session to end...';
    waitBtn.classList.add('loading');
    noteEl.textContent = 'The page will open automatically when the session ends.';
  });

  const canvas = document.getElementById('stars-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 1.2 + 0.1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6 + 0.05})`;
    ctx.fill();
  }
})();
