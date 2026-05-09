(() => {
  const el = {
    status: document.getElementById('status'),
    down: document.getElementById('down-val'),
    up: document.getElementById('up-val'),
    ping: document.getElementById('ping-val'),
    quality: document.getElementById('qual-val'),
    progressLabel: document.getElementById('progress-label'),
    progressBar: document.querySelector('#progress > div'),
    startBtn: document.getElementById('start-btn'),
    stopBtn: document.getElementById('stop-btn')
  };

  let activeController = null;
  let running = false;

  function setPhase(text, pct) {
    el.progressLabel.textContent = text;
    el.progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function setRunning(next) {
    running = next;
    el.startBtn.disabled = next;
    el.stopBtn.disabled = !next;
    el.status.textContent = next ? 'Running...' : 'Idle';
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
      ? AbortSignal.any ? AbortSignal.any([options.signal, controller.signal]) : controller.signal
      : controller.signal;
    try {
      const response = await fetch(url, { ...options, cache: 'no-store', signal });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function measurePing(signal) {
    const rounds = 3;
    let total = 0;
    for (let i = 0; i < rounds; i++) {
      const started = performance.now();
      await fetchWithTimeout(`https://speed.cloudflare.com/cdn-cgi/trace?x=${Date.now()}-${i}`, { signal }, 8000);
      total += performance.now() - started;
    }
    return total / rounds;
  }

  async function measureDownload(bytes, signal, onProgress) {
    const url = `https://speed.cloudflare.com/__down?bytes=${bytes}&x=${Date.now()}-${Math.random()}`;
    const started = performance.now();
    const response = await fetchWithTimeout(url, { signal }, 25000);
    if (!response.ok) throw new Error(`Download failed (${response.status})`);

    let readBytes = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        readBytes += value?.byteLength || 0;
        onProgress?.(Math.min(1, readBytes / bytes));
      }
    } else {
      const blob = await response.blob();
      readBytes = blob.size;
      onProgress?.(1);
    }

    const sec = Math.max(0.001, (performance.now() - started) / 1000);
    return (readBytes * 8) / (sec * 1000000);
  }

  async function measureUpload(bytes, signal, onProgress) {
    const chunk = new Uint8Array(bytes);
    crypto.getRandomValues(chunk.subarray(0, Math.min(chunk.length, 65536)));
    const started = performance.now();
    const response = await fetchWithTimeout(
      `https://speed.cloudflare.com/__up?x=${Date.now()}-${Math.random()}`,
      {
        method: 'POST',
        body: chunk,
        headers: { 'content-type': 'application/octet-stream' },
        signal
      },
      30000
    );
    if (!response.ok) throw new Error(`Upload failed (${response.status})`);
    onProgress?.(1);
    const sec = Math.max(0.001, (performance.now() - started) / 1000);
    return (bytes * 8) / (sec * 1000000);
  }

  function scoreQuality(down, up, ping) {
    const downPart = Math.min(50, down * 1.1);
    const upPart = Math.min(30, up * 1.4);
    const pingPart = Math.max(0, 20 - (ping / 8));
    return Math.round(downPart + upPart + pingPart);
  }

  async function runTest() {
    if (running) return;
    activeController = new AbortController();
    const { signal } = activeController;
    setRunning(true);
    el.down.textContent = '--';
    el.up.textContent = '--';
    el.ping.textContent = '--';
    el.quality.textContent = '--';

    try {
      setPhase('Measuring ping...', 8);
      const ping = await measurePing(signal);
      el.ping.textContent = `${Math.round(ping)}`;

      const downSamples = [4_000_000, 10_000_000, 20_000_000];
      let downTotal = 0;
      for (let i = 0; i < downSamples.length; i++) {
        setPhase(`Download test ${i + 1}/${downSamples.length}`, 20 + i * 16);
        const mbps = await measureDownload(downSamples[i], signal, p => {
          const base = 20 + i * 16;
          setPhase(`Download test ${i + 1}/${downSamples.length}`, base + p * 15);
        });
        downTotal += mbps;
      }
      const down = downTotal / downSamples.length;
      el.down.textContent = down.toFixed(1);

      setPhase('Upload test...', 72);
      const up = await measureUpload(3_500_000, signal, p => {
        setPhase('Upload test...', 72 + p * 24);
      });
      el.up.textContent = up.toFixed(1);

      const score = scoreQuality(down, up, ping);
      el.quality.textContent = `${score}`;
      el.status.textContent = score >= 75 ? 'Great connection' : score >= 45 ? 'Good connection' : 'Weak connection';
      setPhase('Done', 100);
    } catch (error) {
      if (signal.aborted) {
        el.status.textContent = 'Stopped';
        setPhase('Stopped', 0);
      } else {
        el.status.textContent = 'Test failed';
        setPhase(error?.message || 'Failed', 0);
      }
    } finally {
      setRunning(false);
      activeController = null;
    }
  }

  el.startBtn.addEventListener('click', runTest);
  el.stopBtn.addEventListener('click', () => {
    if (!activeController) return;
    activeController.abort();
  });
})();
