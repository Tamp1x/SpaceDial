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

  const root = document.documentElement;
  const bgLayer = document.getElementById('bg-layer');
  const starsCanvas = document.getElementById('stars-canvas');
  const weatherCanvas = document.getElementById('weather-layer');

  function getDayPhase() {
    const h = new Date().getHours();
    if (h >= 5 && h < 8) return 'sunrise';
    if (h >= 8 && h < 18) return 'day';
    if (h >= 18 && h < 21) return 'sunset';
    return 'night';
  }

  function backgroundUsesStars(bgType) {
    return bgType === 'night' || bgType === 'sunset';
  }

  function drawStars(bgType) {
    const c = starsCanvas;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const ctx = c.getContext('2d');
    const useStars = backgroundUsesStars(bgType);
    if (!useStars) { ctx.clearRect(0, 0, c.width, c.height); c.style.display = 'none'; return; }
    c.style.display = 'block';
    ctx.clearRect(0, 0, c.width, c.height);
    const count = Math.round((c.width * c.height) / 3000);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * c.width;
      const y = Math.random() * c.height;
      const r = Math.random() * 1.6 + 0.3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5 + 0.15})`;
      ctx.fill();
    }
  }

  function drawWeatherEffect(effect, phase) {
    const c = weatherCanvas;
    if (!c) return;
    if (weatherAnimationFrame) { cancelAnimationFrame(weatherAnimationFrame); weatherAnimationFrame = null; }
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    if (effect === 'clear') {
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      c.style.display = 'none';
      return;
    }
    c.style.display = 'block';
    const ctx = c.getContext('2d');
    const rand = (min, max) => min + Math.random() * (max - min);
    let particles;
    let lastTime = performance.now();
    const bgType = phase;

    if (effect === 'rain') {
      const count = Math.min(450, Math.max(180, Math.round((c.width * c.height) / 5500)));
      particles = Array.from({ length: count }, () => makeRainDrop(c, rand, true));
    } else if (effect === 'snow') {
      const count = Math.min(240, Math.max(90, Math.round((c.width * c.height) / 9800)));
      particles = Array.from({ length: count }, () => makeSnowFlake(c, rand, true));
    } else if (effect === 'fog') {
      const count = Math.min(34, Math.max(18, Math.round(c.width / 64)));
      particles = Array.from({ length: count }, () => makeFogWisp(c, rand, true));
    } else {
      const cloudBoost = (effect === 'cloudy' && (bgType === 'day' || bgType === 'sunrise')) ? 1.75 : 1;
      const count = Math.round(Math.min(34, Math.max(14, Math.round(c.width / 92))) * cloudBoost);
      particles = Array.from({ length: count }, () => makeCloudWisp(c, rand, true, cloudBoost));
    }

    function render(now) {
      const dt = Math.min(2, Math.max(0.45, (now - lastTime) / 16.67));
      lastTime = now;
      ctx.clearRect(0, 0, c.width, c.height);

      if (effect === 'rain') {
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
      } else if (effect === 'snow') {
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
      } else if (effect === 'fog') {
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
          if (cloud.x - cloud.rx > c.width + 180) Object.assign(cloud, makeCloudWisp(c, rand, false, 1));
          ctx.save();
          ctx.translate(cloud.x, cloud.y);
          ctx.rotate(cloud.rot);
          ctx.scale(1, cloud.ry / cloud.rx);
          const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, cloud.rx);
          shadow.addColorStop(0, `rgba(245,248,252,${cloud.alpha})`);
          shadow.addColorStop(0.34, `rgba(220,232,242,${cloud.alpha * 0.72})`);
          shadow.addColorStop(0.72, `rgba(168,188,210,${cloud.alpha * 0.24})`);
          shadow.addColorStop(1, 'rgba(168,188,210,0)');
          ctx.fillStyle = shadow;
          ctx.beginPath();
          ctx.arc(0, 0, cloud.rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(70,85,105,0.08)';
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
      sway: rand(0.12, 0.55),
      swaySpeed: rand(0.0012, 0.0036),
      alpha: rand(0.22, 0.58),
      spin: Math.random() * Math.PI * 2,
      spinSpeed: rand(-0.018, 0.018),
      phase: Math.random() * Math.PI * 2
    };
  }

  function makeFogWisp(c, rand, initial) {
    return {
      x: initial ? rand(-c.width * 0.1, c.width * 0.6) : rand(-40, 20),
      y: rand(c.height * 0.1, c.height * 0.72),
      rx: rand(80, 180),
      ry: rand(22, 58),
      rot: rand(-0.08, 0.08),
      speed: rand(0.12, 0.38),
      lift: rand(0.08, 0.22),
      sway: rand(0.04, 0.2),
      swaySpeed: rand(0.0008, 0.0022),
      alpha: rand(0.06, 0.18),
      phase: Math.random() * Math.PI * 2
    };
  }

  function makeCloudWisp(c, rand, initial, boost) {
    return {
      x: initial ? rand(-c.width * 0.4, c.width * 0.2) : rand(-c.width * 0.5, -20),
      y: rand(c.height * 0.02, c.height * 0.34),
      rx: rand(80, 200) * (boost || 1),
      ry: rand(24, 52) * (boost || 1),
      rot: rand(-0.06, 0.06),
      speed: rand(0.18, 0.44),
      lift: rand(0.06, 0.18),
      sway: rand(0.04, 0.16),
      swaySpeed: rand(0.0006, 0.002),
      alpha: rand(0.08, 0.22),
      phase: Math.random() * Math.PI * 2
    };
  }

  let weatherAnimationFrame = null;

  function applyAtmosphere() {
    const phase = getDayPhase();
    root.dataset.bg = phase;
    bgLayer.className = `bg-${phase}`;
    drawStars(phase);

    chrome.storage.local.get(['ds2', 'ds2_lastWeather'], (r) => {
      let weather = 'clear';
      try {
        const data = r.ds2 || r.ds2_lastWeather;
        if (data) {
          const stored = typeof data === 'string' ? JSON.parse(data) : data;
          if (stored.lastWeatherAtmosphere?.effect) {
            weather = stored.lastWeatherAtmosphere.effect;
          } else if (stored.settings?.weatherEffect && !stored.settings?.autoWeather) {
            weather = stored.settings.weatherEffect;
          }
        }
      } catch {}
      root.dataset.weather = weather;
      drawWeatherEffect(weather, phase);
    });
  }

  applyAtmosphere();

  // Check if focus session is still active; if not, unblock
  setInterval(() => {
    if (Date.now() >= endTime) return; // will be handled by countdown
    chrome.runtime.sendMessage({ type: 'focus-query' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (!response?.session || Date.now() >= response.session.endTime) {
        if (originalUrl) {
          location.href = originalUrl;
        } else {
          location.href = chrome.runtime.getURL('newtab.html');
        }
      }
    });
  }, 5000);
})();
