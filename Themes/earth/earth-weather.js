/* ============================================================
   SpaceDial — Earth Weather Effects (v4 — realistic rain/snow)
   ============================================================ */

const EarthWeather = (() => {
  let cloudMesh, windSystem, rainSystem, snowSystem;
  let scene, globeGroup, weatherParent;
  let currentEffect = 'clear';
  let pendingEffect = null;
  let weatherData = null;

  const RAIN_COUNT = 1600;
  const SNOW_COUNT = 900;
  const SPLASH_COUNT = 150;
  const WIND_PARTICLE_COUNT = 400;

  function getSunDirForWeather() {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const decl = 23.44 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));
    const hour = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const lon = (hour - 12) * 15;
    const decRad = decl * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(decRad) * Math.sin(lonRad),
      Math.sin(decRad),
      Math.cos(decRad) * Math.cos(lonRad)
    ).normalize();
  }

  /* ── Cloud layer v3 — clean 3D noise on sphere ──────────── */
  function createCloudLayer() {
    const group = new THREE.Group();

    const vertexShader = `
      varying vec3 vLocalPos;
      varying vec3 vNorm;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        vLocalPos = position;
        vNorm = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `;

    const noiseGLSL = `
      vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
    `;

    function makeFragmentShader(isFog) {
      return `
        uniform float time;
        uniform float opacity;
        uniform vec3 sunDir;
        varying vec3 vLocalPos;
        varying vec3 vNorm;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;

        ${noiseGLSL}

        void main() {
          vec3 samplePos = normalize(vLocalPos) * 2.0 + vec3(time * 0.000012, 0.0, 0.0);

          float v = 0.0;
          float a = 0.5;
          vec3 p = samplePos;
          for (int i = 0; i < 6; i++) {
            v += a * snoise(p);
            p = p * 2.03 + vec3(100.0);
            a *= 0.49;
          }

          float cloud = smoothstep(-0.05, 0.5, v);

          float fresnel = pow(clamp(1.0 - max(dot(vViewDir, vNorm), 0.0), 0.0, 1.0), 2.0);
          float edgeFade = smoothstep(0.0, 0.35, fresnel);

          float lit = max(dot(vWorldNormal, sunDir), 0.0);
          float scatter = pow(max(dot(vViewDir, sunDir), 0.0), 8.0) * 0.25;
          float brightness = mix(0.01, 1.0, lit * 0.8 + scatter + 0.2);

          vec3 cloudDark = vec3(0.08, 0.10, 0.18);
          vec3 cloudBright = vec3(1.0, 1.0, 1.0);
          vec3 cloudColor = mix(cloudDark, cloudBright, brightness);

          float alpha = cloud * opacity * edgeFade;
          ${isFog ? 'alpha = smoothstep(0.0, 0.7, fresnel) * opacity * 0.65;' : ''}

          gl_FragColor = vec4(cloudColor, alpha);
        }
      `;
    }

    const cloudGeo1 = new THREE.SphereGeometry(1.001, 128, 128);
    const cloudMat1 = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: makeFragmentShader(false),
      uniforms: {
        time: { value: 0 },
        opacity: { value: 1.0 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) }
      },
      transparent: true, depthWrite: false, side: THREE.FrontSide
    });
    const cloudMesh1 = new THREE.Mesh(cloudGeo1, cloudMat1);
    group.add(cloudMesh1);

    const cloudGeo2 = new THREE.SphereGeometry(1.003, 96, 96);
    const cloudMat2 = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: makeFragmentShader(false),
      uniforms: {
        time: { value: 0 },
        opacity: { value: 0.55 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) }
      },
      transparent: true, depthWrite: false, side: THREE.FrontSide
    });
    const cloudMesh2 = new THREE.Mesh(cloudGeo2, cloudMat2);
    group.add(cloudMesh2);

    const fogGeo = new THREE.SphereGeometry(1.0005, 96, 96);
    const fogMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: makeFragmentShader(true),
      uniforms: {
        time: { value: 0 },
        opacity: { value: 1.5 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) }
      },
      transparent: true, depthWrite: false, side: THREE.FrontSide
    });
    const fogMesh = new THREE.Mesh(fogGeo, fogMat);
    fogMesh.visible = false;
    group.add(fogMesh);

    group._cloudMesh1 = cloudMesh1;
    group._cloudMesh2 = cloudMesh2;
    group._fogMesh = fogMesh;
    return group;
  }

  /* ── Wind particles ───────────────────────────────────────── */
  function createWindParticles() {
    const count = WIND_PARTICLE_COUNT;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      resetWindParticle(positions, velocities, lifetimes, i, sizes, opacities);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute float opacity;
        varying float vOpacity;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (12.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
          vOpacity = opacity;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, d) * vOpacity;
          gl_FragColor = vec4(0.85, 0.93, 1.0, alpha);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    points._velocities = velocities;
    points._lifetimes = lifetimes;
    return points;
  }

  function resetWindParticle(positions, velocities, lifetimes, i, sizes, opacities) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.004 + Math.random() * 0.008;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const windSpeed = 0.0015 + Math.random() * 0.003;
    const westToEast = phi > Math.PI * 0.5 ? -1 : 1;
    const tangentX = -Math.sin(theta) * westToEast;
    const tangentZ = Math.cos(theta) * westToEast;

    velocities[i * 3] = tangentX * windSpeed;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * windSpeed * 0.05;
    velocities[i * 3 + 2] = tangentZ * windSpeed;

    lifetimes[i] = 50 + Math.random() * 120;
    if (sizes) sizes[i] = 0.25 + Math.random() * 0.4;
    if (opacities) opacities[i] = 0.25 + Math.random() * 0.4;
  }

  /* ── Rain: elongated streaks + splash particles ────────────── */
  function createRainSystem() {
    const count = RAIN_COUNT;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      resetRainParticle(positions, velocities, sizes, phases, i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute float phase;
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (35.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
          float dist = length(position);
          vAlpha = smoothstep(1.2, 1.01, dist);
          vPhase = phase;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying float vPhase;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float dx = uv.x;
          float dy = uv.y;
          float streak = 1.0 - smoothstep(0.0, 0.1, abs(dx));
          float drop = 1.0 - smoothstep(0.0, 0.4, abs(dy + 0.08));
          float shape = streak * drop;
          if (shape < 0.03) discard;
          float alpha = shape * vAlpha * 0.9;
          float bright = mix(0.65, 0.95, vPhase);
          gl_FragColor = vec4(bright * 0.75, bright * 0.88, bright, alpha);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    points._velocities = velocities;
    points._phases = phases;
    points._type = 'rain';

    /* splash ring system */
    const splashGeo = new THREE.BufferGeometry();
    const splashPositions = new Float32Array(SPLASH_COUNT * 3);
    const splashSizes = new Float32Array(SPLASH_COUNT);
    const splashAlphas = new Float32Array(SPLASH_COUNT);
    const splashAges = new Float32Array(SPLASH_COUNT);
    for (let i = 0; i < SPLASH_COUNT; i++) {
      splashAges[i] = 999;
    }
    splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
    splashGeo.setAttribute('size', new THREE.BufferAttribute(splashSizes, 1));
    splashGeo.setAttribute('alpha', new THREE.BufferAttribute(splashAlphas, 1));

    const splashMat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (18.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
          vAlpha = alpha;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float ring = smoothstep(0.3, 0.22, d) - smoothstep(0.22, 0.12, d);
          if (ring < 0.01) discard;
          gl_FragColor = vec4(0.7, 0.82, 0.95, ring * vAlpha * 0.6);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });

    const splashPoints = new THREE.Points(splashGeo, splashMat);
    splashPoints._ages = splashAges;
    points._splash = splashPoints;
    points._splashPositions = splashPositions;
    points._splashSizes = splashSizes;
    points._splashAlphas = splashAlphas;

    return points;
  }

  function resetRainParticle(positions, velocities, sizes, phases, i) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.010 + Math.random() * 0.025;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const normalX = Math.sin(phi) * Math.cos(theta);
    const normalY = Math.cos(phi);
    const normalZ = Math.sin(phi) * Math.sin(theta);
    const speed = 0.008 + Math.random() * 0.012;
    const wobble = 0.0008;

    velocities[i * 3] = -normalX * speed * 0.3 + (Math.random() - 0.5) * wobble;
    velocities[i * 3 + 1] = -normalY * speed * 0.6 - speed * 0.7;
    velocities[i * 3 + 2] = -normalZ * speed * 0.3 + (Math.random() - 0.5) * wobble;

    sizes[i] = 0.7 + Math.random() * 1.0;
    if (phases) phases[i] = Math.random();
  }

  function resetSplash(splashPositions, splashSizes, splashAlphas, splashAges, i, hitPos) {
    const idx = i * 3;
    splashPositions[idx] = hitPos[0];
    splashPositions[idx + 1] = hitPos[1];
    splashPositions[idx + 2] = hitPos[2];
    splashSizes[i] = 0.15 + Math.random() * 0.15;
    splashAlphas[i] = 0.7;
    splashAges[i] = 0;
  }

  /* ── Snow: soft flakes with drift ────────────────────────── */
  function createSnowSystem() {
    const count = SNOW_COUNT;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const drifts = new Float32Array(count * 2);

    for (let i = 0; i < count; i++) {
      resetSnowParticle(positions, velocities, sizes, drifts, i);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        varying float vAlpha;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (20.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
          float dist = length(position);
          vAlpha = smoothstep(1.2, 1.01, dist);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.48) discard;
          float soft = 1.0 - smoothstep(0.1, 0.48, d);
          float inner = 1.0 - smoothstep(0.0, 0.2, d);
          float shape = mix(soft, 1.0, inner * 0.5);
          gl_FragColor = vec4(0.95, 0.97, 1.0, shape * vAlpha * 0.85);
        }
      `,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending
    });

    const points = new THREE.Points(geo, mat);
    points._velocities = velocities;
    points._drifts = drifts;
    points._type = 'snow';
    return points;
  }

  function resetSnowParticle(positions, velocities, sizes, drifts, i) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 1.008 + Math.random() * 0.02;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const speed = 0.0012 + Math.random() * 0.0018;
    velocities[i * 3] = (Math.random() - 0.5) * speed * 0.3;
    velocities[i * 3 + 1] = -speed * 0.5;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * speed * 0.3;

    sizes[i] = 0.5 + Math.random() * 0.9;
    if (drifts) {
      drifts[i * 2] = Math.random() * Math.PI * 2;
      drifts[i * 2 + 1] = 0.5 + Math.random() * 1.5;
    }
  }

  /* ── Init ─────────────────────────────────────────────────── */
  function init(scn, gGroup, globeMeshRef) {
    scene = scn;
    globeGroup = gGroup;
    weatherParent = globeMeshRef || gGroup;

    cloudMesh = createCloudLayer();
    weatherParent.add(cloudMesh);
    cloudMesh.visible = false;

    windSystem = createWindParticles();
    weatherParent.add(windSystem);
    windSystem.visible = false;

    rainSystem = createRainSystem();
    weatherParent.add(rainSystem);
    rainSystem.visible = false;
    if (rainSystem._splash) {
      weatherParent.add(rainSystem._splash);
      rainSystem._splash.visible = false;
    }

    snowSystem = createSnowSystem();
    weatherParent.add(snowSystem);
    snowSystem.visible = false;

    setEffect(pendingEffect || currentEffect || 'clear');
    pendingEffect = null;
  }

  function setEffect(effect, data) {
    currentEffect = effect;
    weatherData = data;

    if (!cloudMesh && !windSystem && !rainSystem && !snowSystem) {
      pendingEffect = effect;
      return;
    }

    const hasClouds = effect === 'cloudy' || effect === 'rain' || effect === 'snow' || effect === 'fog';
    const hasWind = effect === 'cloudy' || effect === 'rain' || effect === 'snow' || effect === 'fog';
    const hasRain = effect === 'rain';
    const hasSnow = effect === 'snow';

    if (cloudMesh) cloudMesh.visible = hasClouds;
    if (windSystem) windSystem.visible = hasWind;
    if (rainSystem) {
      rainSystem.visible = hasRain;
      if (rainSystem._splash) rainSystem._splash.visible = hasRain;
    }
    if (snowSystem) snowSystem.visible = hasSnow;

    if (cloudMesh) {
      const isFog = effect === 'fog';
      if (cloudMesh._cloudMesh1) cloudMesh._cloudMesh1.visible = !isFog;
      if (cloudMesh._cloudMesh2) cloudMesh._cloudMesh2.visible = !isFog;
      if (cloudMesh._fogMesh) cloudMesh._fogMesh.visible = isFog;

      if (cloudMesh._cloudMesh1?.material?.uniforms) {
        cloudMesh._cloudMesh1.material.uniforms.opacity.value = isFog ? 0 : effect === 'cloudy' ? 1.0 : 0.8;
      }
      if (cloudMesh._cloudMesh2?.material?.uniforms) {
        cloudMesh._cloudMesh2.material.uniforms.opacity.value = isFog ? 0 : effect === 'cloudy' ? 0.6 : 0.45;
      }
      if (cloudMesh._fogMesh?.material?.uniforms) {
        cloudMesh._fogMesh.material.uniforms.opacity.value = isFog ? 1.5 : 0;
      }
    }
  }

  /* ── Update loop ──────────────────────────────────────────── */
  function update(time) {
    if (cloudMesh?.visible) {
      const sunDir = getSunDirForWeather();
      [cloudMesh._cloudMesh1, cloudMesh._cloudMesh2, cloudMesh._fogMesh].forEach(m => {
        if (m?.material?.uniforms) {
          m.material.uniforms.time.value = time;
          m.material.uniforms.sunDir.value.copy(sunDir);
        }
      });
    }

    if (windSystem?.visible) {
      const pos = windSystem.geometry.attributes.position;
      const vel = windSystem._velocities;
      const life = windSystem._lifetimes;
      const sz = windSystem.geometry.attributes.size;
      const op = windSystem.geometry.attributes.opacity;
      for (let i = 0; i < pos.count; i++) {
        life[i] -= 1;
        if (life[i] <= 0) {
          resetWindParticle(pos.array, vel, life, i, sz.array, op.array);
        } else {
          pos.array[i * 3] += vel[i * 3];
          pos.array[i * 3 + 1] += vel[i * 3 + 1];
          pos.array[i * 3 + 2] += vel[i * 3 + 2];
          const dist = Math.sqrt(
            pos.array[i * 3] ** 2 + pos.array[i * 3 + 1] ** 2 + pos.array[i * 3 + 2] ** 2
          );
          if (dist < 0.998 || dist > 1.04) {
            resetWindParticle(pos.array, vel, life, i, sz.array, op.array);
          }
        }
      }
      pos.needsUpdate = true;
    }

    if (rainSystem?.visible) {
      const pos = rainSystem.geometry.attributes.position;
      const vel = rainSystem._velocities;
      const sz = rainSystem.geometry.attributes.size;
      const ph = rainSystem.geometry.attributes.phase;
      const splash = rainSystem._splash;
      const sPos = rainSystem._splashPositions;
      const sSz = rainSystem._splashSizes;
      const sAlpha = rainSystem._splashAlphas;
      const sAges = splash?._ages;

      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += vel[i * 3];
        pos.array[i * 3 + 1] += vel[i * 3 + 1];
        pos.array[i * 3 + 2] += vel[i * 3 + 2];

        const x = pos.array[i * 3];
        const y = pos.array[i * 3 + 1];
        const z = pos.array[i * 3 + 2];
        const dist = Math.sqrt(x * x + y * y + z * z);

        if (dist < 1.003) {
          if (sAges && splash) {
            const si = i % SPLASH_COUNT;
            resetSplash(sPos, sSz, sAlpha, sAges, si, [x, y, z]);
          }
          resetRainParticle(pos.array, vel, sz.array, ph.array, i);
        } else if (dist > 1.08) {
          resetRainParticle(pos.array, vel, sz.array, ph.array, i);
        }
      }
      pos.needsUpdate = true;

      if (splash?.visible && sAges) {
        const sPositions = splash.geometry.attributes.position;
        const sSizesAtt = splash.geometry.attributes.size;
        const sAlphaAtt = splash.geometry.attributes.alpha;
        for (let i = 0; i < SPLASH_COUNT; i++) {
          if (sAges[i] < 999) {
            sAges[i] += 1;
            const t = sAges[i] / 15.0;
            if (t >= 1.0) {
              sAges[i] = 999;
              sAlphaAtt.array[i] = 0;
            } else {
              sAlphaAtt.array[i] = 0.6 * (1.0 - t);
              sSizesAtt.array[i] = 0.15 + t * 0.25;
            }
          }
        }
        sPositions.needsUpdate = true;
        sSizesAtt.needsUpdate = true;
        sAlphaAtt.needsUpdate = true;
      }
    }

    if (snowSystem?.visible) {
      const pos = snowSystem.geometry.attributes.position;
      const vel = snowSystem._velocities;
      const drifts = snowSystem._drifts;
      for (let i = 0; i < pos.count; i++) {
        const driftPhase = drifts[i * 2];
        const driftFreq = drifts[i * 2 + 1];
        const driftX = Math.sin(time * 0.001 * driftFreq + driftPhase) * 0.0003;
        const driftZ = Math.cos(time * 0.0008 * driftFreq + driftPhase * 1.3) * 0.0003;

        pos.array[i * 3] += vel[i * 3] + driftX;
        pos.array[i * 3 + 1] += vel[i * 3 + 1];
        pos.array[i * 3 + 2] += vel[i * 3 + 2] + driftZ;

        const dist = Math.sqrt(
          pos.array[i * 3] ** 2 + pos.array[i * 3 + 1] ** 2 + pos.array[i * 3 + 2] ** 2
        );
        if (dist < 1.003 || dist > 1.06) {
          resetSnowParticle(pos.array, vel, snowSystem.geometry.attributes.size.array, drifts, i);
        }
      }
      pos.needsUpdate = true;
    }
  }

  function destroy() {
    function disposeSystem(sys) {
      if (!sys) return;
      if (sys._splash) {
        weatherParent?.remove(sys._splash);
        if (sys._splash.geometry) sys._splash.geometry.dispose();
        if (sys._splash.material) sys._splash.material.dispose();
      }
      weatherParent?.remove(sys);
      if (sys.geometry) sys.geometry.dispose();
      if (sys.material) sys.material.dispose();
    }

    if (cloudMesh) {
      weatherParent?.remove(cloudMesh);
      cloudMesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
      cloudMesh = null;
    }
    disposeSystem(windSystem);
    disposeSystem(rainSystem);
    disposeSystem(snowSystem);
    windSystem = null;
    rainSystem = null;
    snowSystem = null;
    scene = null;
    globeGroup = null;
    weatherParent = null;
    weatherData = null;
    currentEffect = 'clear';
  }

  return { init, setEffect, update, destroy };
})();
