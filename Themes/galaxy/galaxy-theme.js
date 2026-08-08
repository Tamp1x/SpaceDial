/* ============================================================
   SpaceDial — Galaxy Theme (3D solar-system planet viewer)
   Real surface textures for Mercury, Venus, Earth, Mars,
   Jupiter, Saturn (with rings), Uranus, Neptune.
   Black hole: full-screen raymarching (ported from black_hole.html TSL → GLSL).
   API mirrors EarthTheme for drop-in usage from newtab.js.
   ============================================================ */

const GalaxyTheme = (() => {
  let scene, camera, renderer, animId;
  let planetGroup, starMesh, ringMesh;
  let targetRotationY = 0, currentRotationY = 0;
  let targetRotationX = 0, currentRotationX = 0;
  let targetZoomDist = 3.2, currentZoomDist = 3.2;
  let animStartTime = 0;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartRotY = 0, dragStartRotX = 0;
  let dragHandlers = null;
  let currentPlanet = 'earth';
  let spinSpeed = 0.4;
  let blackHoleMesh = null;
  let blackHoleMat = null;

  let bloomComposer = null;

  const MIN_ZOOM_DIST = 1.7;
  const MAX_ZOOM_DIST = 30;

  const PLANETS = {
    mercury:  { scale: 1.0, speed: 0.5,  ring: false },
    venus:    { scale: 1.0, speed: 0.22, ring: false },
    earth:    { scale: 1.0, speed: 0.4,  ring: false },
    mars:     { scale: 1.0, speed: 0.46, ring: false },
    jupiter:  { scale: 1.0, speed: 0.6,  ring: false },
    saturn:   { scale: 1.0, speed: 0.5,  ring: 'saturn-ring.png' },
    uranus:   { scale: 1.0, speed: 0.3,  ring: 'uranus-ring.png' },
    neptune:  { scale: 1.0, speed: 0.34, ring: false },
    blackhole: {
      scale: 1.0, speed: 0.04, ring: false, blackHole: true,
      viewPitch: 0.18, zoom: 24.0,
      diskInnerRadius: 4.1, diskOuterRadius: 14.5,
      diskTemperature: 49.78, temperatureFalloff: 5.22,
      diskBrightness: 3.8, diskRotationSpeed: -8.7,
      turbulenceScale: 1.81, turbulenceStretch: 0.75,
      turbulenceSharpness: 7.4, turbulenceCycleTime: 5.0,
      turbulenceLacunarity: 2.5, turbulencePersistence: 0.8,
      diskEdgeSoftnessInner: 0.18, diskEdgeSoftnessOuter: 0.5,
      gravitationalLensing: 2.4, dopplerStrength: 1.0, stepSize: 1.0,
      bloomStrength: 0.68, bloomThreshold: 0.45
    }
  };

  /* ===================== STAR FIELD ===================== */

  function createStarField() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 30;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const sz = 64;
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = sz;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, sz, sz);
    const tex = new THREE.CanvasTexture(cvs);

    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9,
      sizeAttenuation: true, blending: THREE.AdditiveBlending,
      map: tex, depthWrite: false
    });
    return new THREE.Points(geo, mat);
  }

  /* ===================== TEXTURE URL ===================== */

  function textureUrl(planetId) {
    const file = PLANETS[planetId]?.texture || `${planetId}.jpg`;
    return `Themes/galaxy/${file}`;
  }

  /* ===================== SCENE ===================== */

  function createScene(canvas) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 0, targetZoomDist);
    camera.lookAt(0, 0, 0);

    const R = THREE.WebGL1Renderer || THREE.WebGLRenderer;
    renderer = new R({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    planetGroup = new THREE.Group();
    scene.add(planetGroup);

    starMesh = createStarField();
    planetGroup.add(starMesh);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334, 0.28));
    const keyL = new THREE.DirectionalLight(0xffffff, 0.85);
    keyL.position.set(3, 2, 4);
    scene.add(keyL);
    const rimL = new THREE.DirectionalLight(0xffffff, 0.22);
    rimL.position.set(-3, -1, -2);
    scene.add(rimL);
  }

  /* ===================== BLOOM POST-PROCESSING ===================== */

  const BLOOM_VERTEX = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const BLOOM_BRIGHT_FRAGMENT = `
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float br = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 bright = c.rgb * smoothstep(uThreshold - 0.1, uThreshold + 0.3, br);
      gl_FragColor = vec4(bright, 1.0);
    }
  `;

  const BLOOM_BLUR_FRAGMENT = `
    uniform sampler2D tDiffuse;
    uniform vec2 uDirection;
    uniform vec2 uResolution;
    varying vec2 vUv;
    void main() {
      vec2 texel = uDirection / uResolution;
      vec3 result = vec3(0.0);
      float weights[5];
      weights[0] = 0.227027;
      weights[1] = 0.1945946;
      weights[2] = 0.1216216;
      weights[3] = 0.054054;
      weights[4] = 0.016216;
      result += texture2D(tDiffuse, vUv).rgb * weights[0];
      for (int i = 1; i < 5; i++) {
        vec2 off = texel * float(i) * 2.0;
        result += texture2D(tDiffuse, vUv + off).rgb * weights[i];
        result += texture2D(tDiffuse, vUv - off).rgb * weights[i];
      }
      gl_FragColor = vec4(result, 1.0);
    }
  `;

  const BLOOM_COMPOSITE_FRAGMENT = `
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec3 scene = texture2D(tScene, vUv).rgb;
      vec3 bloom = texture2D(tBloom, vUv).rgb;
      gl_FragColor = vec4(scene + bloom * uStrength, 1.0);
    }
  `;

  let bloomRT, bloomBrightRT, bloomBlurRT1, bloomBlurRT2;
  let bloomBrightMat, bloomBlurHMat, bloomBlurVMat, bloomCompositeMat;
  let bloomQuad;

  function setupBloom(w, h) {
    const pr = renderer.getPixelRatio();
    const bw = Math.floor(w * pr * 0.5);
    const bh = Math.floor(h * pr * 0.5);
    const rw = Math.floor(w * pr);
    const rh = Math.floor(h * pr);

    const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
    bloomRT = new THREE.WebGLRenderTarget(rw, rh, rtOpts);
    bloomBrightRT = new THREE.WebGLRenderTarget(bw, bh, rtOpts);
    bloomBlurRT1 = new THREE.WebGLRenderTarget(bw, bh, rtOpts);
    bloomBlurRT2 = new THREE.WebGLRenderTarget(bw, bh, rtOpts);

    const quadGeo = new THREE.PlaneGeometry(2, 2);

    bloomBrightMat = new THREE.ShaderMaterial({
      vertexShader: BLOOM_VERTEX,
      fragmentShader: BLOOM_BRIGHT_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.25 }
      },
      depthWrite: false, depthTest: false
    });

    bloomBlurHMat = new THREE.ShaderMaterial({
      vertexShader: BLOOM_VERTEX,
      fragmentShader: BLOOM_BLUR_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uResolution: { value: new THREE.Vector2(bw, bh) }
      },
      depthWrite: false, depthTest: false
    });

    bloomBlurVMat = new THREE.ShaderMaterial({
      vertexShader: BLOOM_VERTEX,
      fragmentShader: BLOOM_BLUR_FRAGMENT,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new THREE.Vector2(0, 1) },
        uResolution: { value: new THREE.Vector2(bw, bh) }
      },
      depthWrite: false, depthTest: false
    });

    bloomCompositeMat = new THREE.ShaderMaterial({
      vertexShader: BLOOM_VERTEX,
      fragmentShader: BLOOM_COMPOSITE_FRAGMENT,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uStrength: { value: 2.4 }
      },
      depthWrite: false, depthTest: false
    });

    bloomQuad = new THREE.Mesh(quadGeo, bloomBrightMat);
    const bloomCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    bloomQuad.frustumCulled = false;
    return { bloomCam, bw, bh };
  }

  function disposeBloom() {
    if (bloomRT) bloomRT.dispose();
    if (bloomBrightRT) bloomBrightRT.dispose();
    if (bloomBlurRT1) bloomBlurRT1.dispose();
    if (bloomBlurRT2) bloomBlurRT2.dispose();
    bloomRT = bloomBrightRT = bloomBlurRT1 = bloomBlurRT2 = null;
    if (bloomQuad) { bloomQuad.geometry.dispose(); bloomQuad.material.dispose(); bloomQuad = null; }
    bloomComposer = null;
  }

  function renderBloom(bloomCam) {
    const passes = 4;

    bloomQuad.material = bloomBrightMat;
    bloomBrightMat.uniforms.tDiffuse.value = bloomRT.texture;
    renderer.setRenderTarget(bloomBrightRT);
    renderer.render(bloomQuad, bloomCam);

    for (let i = 0; i < passes; i++) {
      bloomQuad.material = bloomBlurHMat;
      bloomBlurHMat.uniforms.tDiffuse.value = bloomBrightRT.texture;
      renderer.setRenderTarget(bloomBlurRT1);
      renderer.render(bloomQuad, bloomCam);

      bloomQuad.material = bloomBlurVMat;
      bloomBlurVMat.uniforms.tDiffuse.value = bloomBlurRT1.texture;
      renderer.setRenderTarget(bloomBrightRT);
      renderer.render(bloomQuad, bloomCam);
    }

    bloomQuad.material = bloomCompositeMat;
    bloomCompositeMat.uniforms.tScene.value = bloomRT.texture;
    bloomCompositeMat.uniforms.tBloom.value = bloomBrightRT.texture;
    renderer.setRenderTarget(null);
    renderer.render(bloomQuad, bloomCam);
  }

  /* ===================== RING GEOMETRY ===================== */

  function createRingGeometry(inner, outer) {
    const seg = 128;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= 1; j++) {
        const r = j === 0 ? inner : outer;
        pos.push(ca * r, sa * r, 0);
        uv.push(j === 0 ? 0 : 1, 0.5);
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  /* ===================== RAYMARCHED BLACK HOLE ===================== */
  /* Ported from black_hole.html TSL → GLSL for WebGL1 compatibility. */

  const BH_VERTEX = `
    varying vec3 vWorldPos;
    void main() {
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const BH_FRAGMENT = `
    precision highp float;

    uniform float uTime;
    uniform vec3  uCamPos;
    uniform vec3  uCamTarget;
    uniform vec2  uResolution;

    /* disk params */
    uniform float uDiskInner;
    uniform float uDiskOuter;
    uniform float uDiskTemp;
    uniform float uTempFalloff;
    uniform float uDiskBrightness;
    uniform float uDiskRotSpeed;
    uniform float uTurbScale;
    uniform float uTurbStretch;
    uniform float uTurbSharp;
    uniform float uTurbCycle;
    uniform float uTurbLac;
    uniform float uTurbPers;
    uniform float uEdgeSoftIn;
    uniform float uEdgeSoftOut;
    uniform float uLens;
    uniform float uDoppler;
    uniform float uStep;

    varying vec3 vWorldPos;

    /* ---- hash / noise ---- */
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    vec2 hash22(vec2 p) {
      return vec2(
        fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
        fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
      );
    }
    float hash31(vec3 p) {
      return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    }

    float noise3D(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      vec3 u = f * f * (3.0 - 2.0 * f);
      float a = hash31(i);
      float b = hash31(i + vec3(1,0,0));
      float c = hash31(i + vec3(0,1,0));
      float d = hash31(i + vec3(1,1,0));
      float e = hash31(i + vec3(0,0,1));
      float f2= hash31(i + vec3(1,0,1));
      float g = hash31(i + vec3(0,1,1));
      float h = hash31(i + vec3(1,1,1));
      return mix(
        mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
        mix(mix(e,f2,u.x), mix(g,h,u.x), u.y),
        u.z
      );
    }

    float fbm3(vec3 p, float lac, float per) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += noise3D(p) * a;
        p *= lac; a *= per;
      }
      return v;
    }

    /* ---- blackbody ---- */
    vec3 blackbody(float tempK) {
      float t = clamp((tempK - 1000.0) / 9000.0, 0.0, 1.0);
      float r = clamp(1.0 - (t - 0.8) * 2.0, 0.5, 1.0);
      float g = smoothstep(0.0, 0.5, t) * (1.0 - max((t - 0.7) * 0.3, 0.0));
      float b = smoothstep(0.3, 1.0, t) * t;
      return vec3(r, g, b);
    }

    /* ---- accretion disk ---- */
    vec4 diskColor(float hitR, float hitAngle, float time, vec3 rd) {
      float inR  = uDiskInner;
      float outR = uDiskOuter;
      float normR = clamp((hitR - inR) / (outR - inR), 0.0, 1.0);

      /* blackbody */
      float peakT = uDiskTemp * 1000.0;
      float outerT = 1500.0;
      float tFalloff = pow(inR / hitR, uTempFalloff);
      float tK = mix(outerT, peakT, tFalloff);
      vec3 col = blackbody(tK);

      /* doppler */
      float rs = sign(uDiskRotSpeed);
      vec3 vel = vec3(-sin(hitAngle) * rs, 0.0, cos(hitAngle) * rs);
      float vmag = 1.0 / sqrt(hitR / inR);
      float beta = vmag * 0.3;
      float ct = dot(vel, rd);
      float df = 1.0 / (1.0 - beta * ct);
      float db = pow(df, 3.0 * uDoppler);
      col *= clamp(db, 0.1, 5.0);

      /* edge falloff */
      float ef = smoothstep(0.0, uEdgeSoftIn, normR)
               * smoothstep(1.0, 1.0 - uEdgeSoftOut, normR);

      /* turbulence */
      float cyc = uTurbCycle;
      float ct2 = mod(time, cyc);
      float blend = ct2 / cyc;
      float kp1 = ct2 * uDiskRotSpeed / pow(hitR, 1.5);
      float kp2 = (ct2 + cyc) * uDiskRotSpeed / pow(hitR, 1.5);
      float ra1 = hitAngle + kp1;
      float ra2 = hitAngle + kp2;
      float str = max(uTurbStretch, 0.1);
      vec3 nc1 = vec3(hitR * uTurbScale, cos(ra1) / str, sin(ra1) / str);
      vec3 nc2 = vec3(hitR * uTurbScale, cos(ra2) / str, sin(ra2) / str);
      float t1 = fbm3(nc1, uTurbLac, uTurbPers);
      float t2 = fbm3(nc2, uTurbLac, uTurbPers);
      float turb = mix(t2, t1, blend);
      float ring = pow(clamp(turb, 0.0, 1.0), uTurbSharp);

      float opacity = ring * ef;
      return vec4(col * uDiskBrightness, opacity);
    }

    /* ---- star field ---- */
    vec3 stars(vec3 rd) {
      float th = atan(rd.z, rd.x);
      float ph = asin(clamp(rd.y, -1.0, 1.0));
      float gs = 60.0;
      vec2 sc = vec2(th, ph) * gs;
      vec2 cell = floor(sc);
      vec2 cuv = fract(sc);
      float ch = hash21(cell);
      float prob = step(0.9, ch);
      vec2 sp = hash22(cell + 42.0) * 0.8 + 0.1;
      float d = length(cuv - sp);
      float bs = hash21(cell + 100.0) * 0.03 + 0.01;
      float core = smoothstep(bs, 0.0, d);
      float glow = smoothstep(bs * 3.0, 0.0, d) * 0.3;
      float si = (core + glow) * prob;
      float ct = hash21(cell + 200.0);
      vec3 scol = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.95, 0.8), ct);
      return scol * si * 0.25;
    }

    /* ---- nebula ---- */
    vec3 nebula(vec3 rd) {
      vec3 p1 = rd * 2.0;
      float n1 = fbm3(p1, 2.0, 0.5) * 2.0 - 1.0;
      float l1 = clamp(n1 + 0.5, 0.0, 1.0);
      vec3 c1 = vec3(0.027, 0.122, 0.267) * l1 * 0.04;

      vec3 p2 = rd * 5.5;
      float n2 = fbm3(p2, 2.0, 0.5) * 2.0 - 1.0;
      float l2 = clamp(n2 + 0.05, 0.0, 1.0);
      vec3 c2 = vec3(0.004, 0.024, 0.082) * l2 * 0.5;

      return c1 + c2;
    }

    /* ---- main ---- */
    void main() {
      float rs = 0.4 * 2.0;                       /* blackHoleMass * 2 */
      vec2 uv = (gl_FragCoord.xy / uResolution - 0.5) * 2.0;
      float aspect = uResolution.x / uResolution.y;
      vec2 sp = vec2(uv.x * aspect, uv.y);

      vec3 cF = normalize(uCamTarget - uCamPos);
      vec3 cR = normalize(cross(vec3(0,1,0), cF));
      vec3 cU = cross(cF, cR);
      vec3 rd = normalize(cF + cR * sp.x + cU * sp.y);

      vec3 rp = uCamPos;
      vec3 pp = uCamPos;
      vec3 col = vec3(0.0);
      float alpha = 0.0;
      float escaped = 0.0, captured = 0.0;

      for (int i = 0; i < 48; i++) {
        if (escaped > 0.5 || captured > 0.5 || alpha > 0.99) break;

        float r = length(rp);
        if (r < rs * 1.01) { captured = 1.0; break; }
        if (r > 100.0)     { escaped  = 1.0; break; }

        vec3 tc = -rp / r;
        float bend = rs / (r * r) * uStep * uLens;
        rd = normalize(rd + tc * bend);

        pp = rp;
        rp += rd * uStep;

        if (pp.y * rp.y < 0.0 && alpha < 0.99) {
          float t = -pp.y / (rp.y - pp.y);
          vec3 hp = mix(pp, rp, t);
          float hr = sqrt(hp.x * hp.x + hp.z * hp.z);
          if (hr > uDiskInner && hr < uDiskOuter) {
            float ha = atan(hp.z, hp.x);
            vec4 dc = diskColor(hr, ha, uTime, rd);
            float rem = 1.0 - alpha;
            col += dc.rgb * dc.a * rem;
            alpha += rem * dc.a;
          }
        }
      }

      if (captured < 0.5) escaped = 1.0;

      if (escaped > 0.5 && alpha < 0.99) {
        vec3 bg = stars(rd) + nebula(rd);
        col += bg * (1.0 - alpha);
      }

      col = pow(col, vec3(1.0 / 2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function createBlackHoleRaymarched(cfg) {
    const geo = new THREE.SphereGeometry(100, 64, 64);
    geo.scale(-1, 1, 1);

    const mat = new THREE.ShaderMaterial({
      vertexShader: BH_VERTEX,
      fragmentShader: BH_FRAGMENT,
      uniforms: {
        uTime:           { value: 0 },
        uCamPos:         { value: new THREE.Vector3(0, 0, 10) },
        uCamTarget:      { value: new THREE.Vector3(0, 0, 0) },
        uResolution:     { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uDiskInner:      { value: cfg.diskInnerRadius },
        uDiskOuter:      { value: cfg.diskOuterRadius },
        uDiskTemp:       { value: cfg.diskTemperature },
        uTempFalloff:    { value: cfg.temperatureFalloff },
        uDiskBrightness: { value: cfg.diskBrightness },
        uDiskRotSpeed:   { value: cfg.diskRotationSpeed },
        uTurbScale:      { value: cfg.turbulenceScale },
        uTurbStretch:    { value: cfg.turbulenceStretch },
        uTurbSharp:      { value: cfg.turbulenceSharpness },
        uTurbCycle:      { value: cfg.turbulenceCycleTime },
        uTurbLac:        { value: cfg.turbulenceLacunarity },
        uTurbPers:       { value: cfg.turbulencePersistence },
        uEdgeSoftIn:     { value: cfg.diskEdgeSoftnessInner },
        uEdgeSoftOut:    { value: cfg.diskEdgeSoftnessOuter },
        uLens:           { value: cfg.gravitationalLensing },
        uDoppler:        { value: cfg.dopplerStrength },
        uStep:           { value: cfg.stepSize }
      },
      depthWrite: false,
      side: THREE.FrontSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.position.set(0, 0, 0);
    blackHoleMesh = mesh;
    blackHoleMat = mat;
    return mesh;
  }

  /* ===================== DISPOSE ===================== */

  function disposeNode(node) {
    if (!node?.traverse) return;
    node.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  /* ===================== BUILD PLANET ===================== */

  function buildPlanet(planetId) {
    blackHoleMesh = null;
    blackHoleMat = null;
    if (bloomComposer) disposeBloom();
    const toKeep = new Set();
    if (starMesh) toKeep.add(starMesh);
    if (planetGroup) {
      [...planetGroup.children].forEach(child => {
        if (toKeep.has(child)) return;
        disposeNode(child);
        planetGroup.remove(child);
      });
    }

    const cfg = PLANETS[planetId] || PLANETS.earth;

    if (cfg.blackHole) {
      targetRotationX = currentRotationX = cfg.viewPitch || 0;
      targetZoomDist = currentZoomDist = cfg.zoom || 8.0;
      const bh = createBlackHoleRaymarched(cfg);
      planetGroup.add(bh);
      if (starMesh) starMesh.visible = false;
      ringMesh = null;
      return;
    }

    if (starMesh) starMesh.visible = true;

    const material = cfg.unlit
      ? new THREE.MeshBasicMaterial({ color: 0xffffff })
      : new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 4, specular: 0x222222 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.scale, 40, 28), material);
    mesh.name = 'planetBody';
    planetGroup.add(mesh);

    if (cfg.ring) {
      const innerR = cfg.scale * 1.35, outerR = cfg.scale * 2.35;
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, side: THREE.DoubleSide,
        depthWrite: false, opacity: 1
      });
      const ring = new THREE.Mesh(createRingGeometry(innerR, outerR), ringMat);
      ring.rotation.x = Math.PI / 2.15;
      planetGroup.add(ring);
      ringMesh = ring;
    } else {
      ringMesh = null;
    }

    const loader = new THREE.TextureLoader();
    loader.load(textureUrl(planetId), tex => {
      tex.anisotropy = 4;
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    });
    if (cfg.ring && ringMesh) {
      loader.load(`Themes/galaxy/${cfg.ring}`, tex => {
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        if (ringMesh) { ringMesh.material.map = tex; ringMesh.material.needsUpdate = true; }
      });
    }
  }

  /* ===================== DRAG CONTROLS ===================== */

  function setupDragControls() {
    function onPointerDown(e) {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartRotY = currentRotationY;
      dragStartRotX = currentRotationX;
    }
    function onPointerMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      targetRotationY = dragStartRotY + dx * 0.005;
      targetRotationX = Math.max(-0.8, Math.min(0.8, dragStartRotX + dy * 0.005));
    }
    function onPointerUp() { isDragging = false; }
    function onWheel(e) {
      if (document.querySelector('.overlay-panel.is-open')) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0012);
      targetZoomDist = Math.max(MIN_ZOOM_DIST, Math.min(MAX_ZOOM_DIST, targetZoomDist * factor));
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('wheel', onWheel, { passive: false });
    dragHandlers = { onPointerDown, onPointerMove, onPointerUp, onWheel };
  }

  function removeDragControls() {
    if (!dragHandlers) return;
    const { onPointerDown, onPointerMove, onPointerUp, onWheel } = dragHandlers;
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('wheel', onWheel);
    dragHandlers = null;
  }

  /* ===================== ANIMATION ===================== */

  function lerp(a, b, t) { return a + (b - a) * t; }

  function animate(time) {
    if (!renderer || !scene || !camera) { animId = null; return; }
    animId = requestAnimationFrame(animate);
    if (!animStartTime) animStartTime = time;
    const elapsed = (time - animStartTime) / 1000;

    if (!isDragging) currentRotationY += spinSpeed * 0.016;
    targetRotationY = currentRotationY;

    currentRotationY = lerp(currentRotationY, targetRotationY, 0.08);
    currentRotationX = lerp(currentRotationX, targetRotationX, 0.08);
    currentZoomDist  = lerp(currentZoomDist, targetZoomDist, 0.12);

    if (planetGroup) {
      if (blackHoleMat) {
        planetGroup.rotation.y = 0;
        planetGroup.rotation.x = 0;
      } else {
        planetGroup.rotation.y = currentRotationY;
        planetGroup.rotation.x = currentRotationX;
      }
    }

    /* Update raymarched black hole uniforms */
    if (blackHoleMat) {
      const cy = currentRotationY;
      const wobble = Math.sin(elapsed * 0.3) * 0.15;
      const cx = currentRotationX + wobble;
      const d  = currentZoomDist;
      const camX = d * Math.sin(cy) * Math.cos(cx);
      const camY = d * Math.sin(cx);
      const camZ = d * Math.cos(cy) * Math.cos(cx);

      blackHoleMat.uniforms.uTime.value      = elapsed;
      blackHoleMat.uniforms.uCamPos.value.set(camX, camY, camZ);
      blackHoleMat.uniforms.uCamTarget.value.set(0, 0, 0);
      blackHoleMat.uniforms.uResolution.value.set(
        renderer.domElement.width,
        renderer.domElement.height
      );
    }

    if (camera) {
      if (blackHoleMat) {
        camera.position.set(0, 0, 0.1);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(0, 0, currentZoomDist);
        camera.lookAt(0, 0, 0);
      }
    }

    if (starMesh?.material) starMesh.rotation.y = elapsed * 0.002;

    if (blackHoleMat) {
      if (!bloomComposer) {
        bloomComposer = setupBloom(window.innerWidth, window.innerHeight);
      }
      renderer.setRenderTarget(bloomRT);
      renderer.render(scene, camera);
      renderBloom(bloomComposer.bloomCam);
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  /* ===================== RESIZE ===================== */

  function handleResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const canvas = renderer.domElement;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (bloomComposer) {
      disposeBloom();
    }
  }

  /* ===================== DISPOSE ALL ===================== */

  function disposeAll() {
    disposeBloom();
    [planetGroup, starMesh].forEach(obj => {
      if (!obj) return;
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    });
  }

  /* ===================== PUBLIC API ===================== */

  return {
    init(canvas, planetId) {
      if (animId) this.destroy();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      currentPlanet = (PLANETS[planetId] ? planetId : 'earth');
      spinSpeed = (PLANETS[currentPlanet] || PLANETS.earth).speed;
      createScene(canvas);
      buildPlanet(currentPlanet);
      setupDragControls();
      window.addEventListener('resize', handleResize);
      animStartTime = 0;
      animate(0);
    },
    setPlanet(planetId) {
      if (!PLANETS[planetId]) return;
      currentPlanet = planetId;
      spinSpeed = PLANETS[planetId].speed;
      buildPlanet(planetId);
    },
    getPlanet() { return currentPlanet; },
    destroy() {
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      removeDragControls();
      window.removeEventListener('resize', handleResize);
      disposeAll();
      if (renderer) { renderer.dispose(); renderer = null; }
      blackHoleMesh = null;
      blackHoleMat = null;
      scene = null; camera = null; planetGroup = null; starMesh = null;
      animStartTime = 0;
      targetRotationY = 0; currentRotationY = 0;
      targetRotationX = 0; currentRotationX = 0;
      targetZoomDist = 3.2; currentZoomDist = 3.2;
      currentPlanet = 'earth';
      ringMesh = null;
    },
    isActive() { return !!animId; }
  };
})();
