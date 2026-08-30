(() => {
  const $ = id => document.getElementById(id);
  const el = {
    down: $('m-down'), up: $('m-up'), ping: $('m-ping'),
    fill: $('gauge-fill'), btn: $('btn'), btnIn: $('btn-in'),
    go: $('go-text'), spd: $('speed-text'), spdu: $('speed-unit'),
    status: $('status')
  };

  let ctrl = null, running = false, ringAnim = null;

  // ─── Theme ──────────────────────────────────────────────────
  const T = {
    night:{t:'#f0f0f0',m:'rgba(255,255,255,0.3)',
      r:'rgba(255,255,255,0.12)',rf:'#fff',g:'rgba(255,255,255,0.06)',go:'#fff'},
    sunrise:{t:'#f0e8e0',m:'rgba(255,200,150,0.45)',
      r:'rgba(255,200,150,0.16)',rf:'#e8b888',g:'rgba(255,180,120,0.1)',go:'#e8b888'},
    day:{t:'#e0ecf5',m:'rgba(160,215,245,0.45)',
      r:'rgba(140,200,240,0.16)',rf:'#70b8e0',g:'rgba(120,200,255,0.1)',go:'#70b8e0'},
    sunset:{t:'#f0e0e8',m:'rgba(220,150,180,0.45)',
      r:'rgba(200,120,160,0.16)',rf:'#d088a8',g:'rgba(200,120,160,0.1)',go:'#d088a8'}
  };

  function setTheme(bg){
    const x = T[bg]||T.night;
    const d = document.documentElement;
    d.style.setProperty('--text',x.t); d.style.setProperty('--muted',x.m);
    d.style.setProperty('--ring',x.r); d.style.setProperty('--ring-fill',x.rf);
    d.style.setProperty('--glow',x.g); d.style.setProperty('--go',x.go);
  }

  const q = new URLSearchParams(location.search);
  setTheme(q.get('bg')||'night');
  addEventListener('message',e=>{if(e.data?.type==='theme-update')setTheme(e.data.bg)});

  // ─── Gauge ──────────────────────────────────────────────────
  const C = 314.16;
  function gauge(pct){ el.fill.style.strokeDashoffset = String(C - C*pct/100); }
  function gaugeReset(){ el.fill.style.strokeDashoffset = String(C);
    el.go.style.display='block'; el.spd.style.display='none'; el.spdu.style.display='none'; }

  // ─── Smooth ring number ─────────────────────────────────────
  let ringCur=0, ringTgt=null;
  function ringNum(v){
    el.go.style.display='none'; el.spd.style.display='block'; el.spdu.style.display='block';
    if(ringAnim) cancelAnimationFrame(ringAnim);
    ringTgt = v;
    (function fn(){
      ringCur += (ringTgt-ringCur)*.15;
      if(Math.abs(ringCur-ringTgt)<.05){ el.spd.textContent=ringTgt.toFixed(1); ringAnim=null; return; }
      el.spd.textContent=ringCur.toFixed(1);
      ringAnim = requestAnimationFrame(fn);
    })();
  }

  // ─── Animate number in result box ───────────────────────────
  function anim(el, to, dur){
    const from = 0, start = performance.now();
    (function fn(now){
      const p = Math.min(1,(now-start)/dur);
      const e = 1 - Math.pow(1-p,3);
      el.textContent = (from + (to-from)*e).toFixed(1);
      if(p<1) requestAnimationFrame(fn);
      else el.textContent = to.toFixed(1);
    })(performance.now());
  }

  // ─── Network ────────────────────────────────────────────────
  async function fetchTO(url, opt, ms=20000){
    const c=new AbortController(), t=setTimeout(()=>c.abort(),ms);
    const sig=opt.signal?(AbortSignal.any?AbortSignal.any([opt.signal,c.signal]):c.signal):c.signal;
    try{return await fetch(url,{...opt,cache:'no-store',signal:sig})}finally{clearTimeout(t)}
  }

  async function ping(signal){
    const s=[];
    for(let i=0;i<5;i++){const t=performance.now();
      await fetchTO(`https://speed.cloudflare.com/cdn-cgi/trace?x=${Date.now()}-${i}`,{signal},8000);
      s.push(performance.now()-t);}
    s.sort((a,b)=>a-b); const tr=s.slice(1,-1);
    return tr.length?tr.reduce((a,b)=>a+b,0)/tr.length:s[0];
  }

  async function dl(bytes,signal,onP){
    const url=`https://speed.cloudflare.com/__down?bytes=${bytes}&x=${Date.now()}-${Math.random()}`;
    const t=performance.now(), resp=await fetchTO(url,{signal},25000);
    if(!resp.ok) throw Error('Download failed');
    let r=0;
    if(resp.body?.getReader){const rd=resp.body.getReader();
      while(true){const{done,value}=await rd.read();if(done)break;
        r+=value?.byteLength||0; onP?.(Math.min(1,r/bytes));}}
    else{const b=await resp.blob();r=b.size;onP?.(1);}
    return (r*8)/(Math.max(.001,(performance.now()-t)/1000)*1000000);
  }

  async function ul(bytes,signal,onP){
    const c=new Uint8Array(bytes);
    crypto.getRandomValues(c.subarray(0,Math.min(c.length,65536)));
    const t=performance.now(),resp=await fetchTO(`https://speed.cloudflare.com/__up?x=${Date.now()}-${Math.random()}`,
      {method:'POST',body:c,headers:{'content-type':'application/octet-stream'},signal},30000);
    if(!resp.ok) throw Error('Upload failed');
    onP?.(1);
    return (bytes*8)/(Math.max(.001,(performance.now()-t)/1000)*1000000);
  }

  // ─── Run ────────────────────────────────────────────────────
  async function run(){
    if(running) return;
    ctrl=new AbortController(); const sig=ctrl.signal;
    running=true;
    [el.down,el.up,el.ping].forEach(e=>{e.textContent='~';e.classList.add('loading')});
    gaugeReset(); gauge(0); el.status.textContent='Pinging...';
    try{
      const p = await ping(sig);
      el.ping.classList.remove('loading');
      el.ping.textContent=Math.round(p);
      anim(el.ping, p, 350);

      el.status.textContent='Downloading...';
      const sizes=[4_000_000,10_000_000,20_000_000]; let dt=0;
      for(let i=0;i<sizes.length;i++){
        el.status.textContent=`Download ${i+1}/${sizes.length}`;
        const mbps=await dl(sizes[i],sig,p=>gauge(20+i*16+p*15));
        dt+=mbps; ringNum(mbps); gauge(20+(i+1)*16);
      }
      const d=dt/sizes.length; el.down.classList.remove('loading'); anim(el.down,d,600); ringNum(d);
      el.status.textContent='Uploading...';
      const u=await ul(3_500_000,sig,p=>gauge(72+p*24));
      el.up.classList.remove('loading'); el.up.textContent=u.toFixed(1); anim(el.up,u,500); ringNum(u); gauge(100);
      el.status.textContent='Complete';
      setTimeout(gaugeReset,600);
    }catch(e){
      if(sig.aborted){el.status.textContent='Stopped'; gaugeReset();}
      else{el.status.textContent='Failed'; gaugeReset();}
    }finally{running=false;ctrl=null;ringCur=0;ringTgt=null;}
  }

  el.btnIn.addEventListener('click',()=>{
    if(running&&ctrl) ctrl.abort();
    else run();
  });
})();
