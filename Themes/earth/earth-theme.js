/* ============================================================
   SpaceDial — Earth Theme (3D realistic globe)
   ============================================================ */

const EarthTheme = (() => {
  let scene, camera, renderer, animId;
  let globeGroup, globeMesh, atmosphereMesh, glassMesh, markerGroup, moonMesh, sunMesh, starField;
  let targetRotationY = 0;
  let currentRotationY = 0;
  let targetRotationX = 0;
  let currentRotationX = 0;
  let targetLookAtY = 0;
  let currentLookAtY = 0;
  let cityLookAtZ = 0.6;
  let cityRotationY = 0;
  let animStartTime = 0;
  let lastTime = 0;
  let moonTexture = null;
  let simTimeMs = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartRotY = 0;
  let dragStartRotX = 0;
  let dragStartLookAtY = 0;
  let dragHandlers = null;
  let targetZoomDist = 3.2;
  let currentZoomDist = 3.2;
  const MIN_ZOOM_DIST = 1.6;
  const MAX_ZOOM_DIST = 7;

  const SUN_UPDATE_INTERVAL = 60000;

  function latLonToVec3(lat, lon, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function getRotationForCity(lat, lon) {
    const pos = latLonToVec3(lat, lon, 1.0);
    return Math.atan2(-pos.x, pos.z);
  }

  function getSunEcliptic(date) {
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    const d = (date.getTime() - J2000) / 86400000;
    const T = d / 36525;
    const g = (357.52911 + 35999.05029 * T) % 360;
    const gRad = g * Math.PI / 180;
    const L = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    const Lnew = L % 360;
    const lambda = Lnew + (1.9146 - 0.004817 * T - 0.000014 * T * T) * Math.sin(gRad)
      + (0.019993 - 0.000101 * T) * Math.sin(2 * gRad) + 0.0002 * Math.sin(3 * gRad);
    const lambdaRad = lambda * Math.PI / 180;
    const epsilon = (23.439291 - 0.01300417 * T) * Math.PI / 180;
    const x = Math.cos(lambdaRad);
    const y = Math.sin(lambdaRad) * Math.cos(epsilon);
    const z = Math.sin(lambdaRad) * Math.sin(epsilon);
    const ra = Math.atan2(y, x);
    const dec = Math.atan2(z, Math.sqrt(x * x + y * y));
    return { ra, dec };
  }

  function getMoonEcliptic(date) {
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    const d = (date.getTime() - J2000) / 86400000;
    const T = d / 36525;
    const L0 = ((218.3165 + 481267.8813 * T) % 360 + 360) % 360;
    const M = ((357.5291 + 35999.0503 * T) % 360 + 360) % 360;
    const Mrad = M * Math.PI / 180;
    const F = ((93.2720 + 483202.0175 * T) % 360 + 360) % 360;
    const Frad = F * Math.PI / 180;
    const D = ((297.8502 + 445267.1115 * T) % 360 + 360) % 360;
    const Drad = D * Math.PI / 180;
    const lambda = (L0 + 6.289 * Math.sin(Mrad) + 1.274 * Math.sin(2 * Drad - 2 * Mrad)
      + 0.658 * Math.sin(2 * Drad) + 0.214 * Math.sin(2 * Mrad)
      - 0.186 * Math.sin(Mrad) - 0.114 * Math.sin(2 * Frad)) % 360;
    const beta = 5.128 * Math.sin(Frad);
    const lambdaRad = lambda * Math.PI / 180;
    const betaRad = beta * Math.PI / 180;
    const epsilon = (23.439 - 0.0000004 * d) * Math.PI / 180;
    const x = Math.cos(betaRad) * Math.cos(lambdaRad);
    const y = Math.cos(betaRad) * Math.sin(lambdaRad);
    const z = Math.sin(betaRad);
    const xEq = x;
    const yEq = y * Math.cos(epsilon) - z * Math.sin(epsilon);
    const zEq = y * Math.sin(epsilon) + z * Math.cos(epsilon);
    const ra = Math.atan2(yEq, xEq);
    const dec = Math.atan2(zEq, Math.sqrt(xEq * xEq + yEq * yEq));
    return { ra, dec };
  }

  async function geocodeCity(cityName) {
    if (!cityName) return null;
    try {
      const resp = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en`
      );
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        return [r.latitude, r.longitude];
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function createMarker(coords, color, size) {
    const group = new THREE.Group();
    const c = color || 0xff3333;

    const headGeo = new THREE.SphereGeometry(0.02, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: c });
    const head = new THREE.Mesh(headGeo, headMat);
    head.name = 'markerHead';

    const basePos = latLonToVec3(coords[0], coords[1], 1.005);
    const tipPos = latLonToVec3(coords[0], coords[1], 1.04);
    const dir = tipPos.clone().sub(basePos).normalize();

    const stickLen = tipPos.distanceTo(basePos);
    const stickGeo = new THREE.CylinderGeometry(0.004, 0.001, stickLen, 8);
    const stickMat = new THREE.MeshBasicMaterial({ color: c });
    const stick = new THREE.Mesh(stickGeo, stickMat);

    head.position.copy(tipPos);
    const midPos = basePos.clone().add(tipPos).multiplyScalar(0.5);
    stick.position.copy(midPos);
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    stick.quaternion.copy(quat);

    group.add(head);
    group.add(stick);

    const ringGeo = new THREE.RingGeometry(0.024, 0.03, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.35, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(basePos);
    ring.lookAt(camera.position);
    ring.name = 'markerRing';
    group.add(ring);

    const pulseGeo = new THREE.RingGeometry(0.027, 0.029, 32);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: c, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });
    const pulse = new THREE.Mesh(pulseGeo, pulseMat);
    pulse.position.copy(basePos);
    pulse.lookAt(camera.position);
    pulse._isPulse = true;
    pulse.name = 'markerPulse';
    group.add(pulse);
    return group;
  }

  function createStarField() {
    const count = 3500;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const twinkleOffsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 5 + Math.random() * 30;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i] = Math.random() * 0.5 + 0.1;
      twinkleOffsets[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('twinkleOffset', new THREE.BufferAttribute(twinkleOffsets, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float size;
        attribute float twinkleOffset;
        varying float vTwinkle;
        uniform float time;
        void main() {
          vTwinkle = twinkleOffset;
          float twinkle = 0.7 + 0.3 * sin(time * 0.001 + twinkleOffset * 6.28);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * twinkle * (50.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(0.9, 0.93, 1.0, alpha * 0.9);
        }
      `,
      uniforms: { time: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    return new THREE.Points(geo, mat);
  }

  function createMoonMesh() {
    const group = new THREE.Group();
    group.visible = false;
    const moonGeo = new THREE.SphereGeometry(0.35, 32, 32);
    const moonMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunDir;
        uniform sampler2D moonTex;
        uniform bool hasTexture;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 norm = normalize(vNormal);
          float diff = max(dot(norm, normalize(sunDir)), 0.0);
          float ambient = 0.02;
          vec3 baseColor;
          if (hasTexture) {
            baseColor = texture2D(moonTex, vUv).rgb;
          } else {
            baseColor = vec3(0.72, 0.70, 0.67);
          }
          float brightness = ambient + diff * 0.98;
          gl_FragColor = vec4(baseColor * brightness, 1.0);
        }
      `,
      uniforms: {
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        moonTex: { value: null },
        hasTexture: { value: false }
      }
    });
    group.add(new THREE.Mesh(moonGeo, moonMat));

    const glowGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(clamp(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 0.0, 1.0), 2.5);
          gl_FragColor = vec4(0.5, 0.55, 0.7, intensity * 0.2);
        }
      `,
      transparent: true, side: THREE.BackSide, depthWrite: false,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));

    return group;
  }

  function positionMoon(date) {
    if (!moonMesh) return;
    const moonEcl = getMoonEcliptic(date);
    const wv = raDecToWorld(moonEcl.ra, moonEcl.dec, 7.5, date);
    moonMesh.position.set(wv.x, wv.y, wv.z);
  }

  function getGMST(date) {
    const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
    const d = (date.getTime() - J2000) / 86400000;
    const T = d / 36525;
    let gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000;
    gmst = ((gmst % 360) + 360) % 360;
    return gmst;
  }

  function raDecToWorld(ra, dec, dist, date) {
    const lonDeg = ((ra * 180 / Math.PI - getGMST(date)) % 360 + 360) % 360;
    const lon = lonDeg > 180 ? lonDeg - 360 : lonDeg;
    const raw = latLonToVec3(dec * 180 / Math.PI, lon, dist);
    const cosR = Math.cos(currentRotationY);
    const sinR = Math.sin(currentRotationY);
    const cosX = Math.cos(currentRotationX);
    const sinX = Math.sin(currentRotationX);
    const rx = raw.x * cosR + raw.z * sinR;
    const ry = raw.y;
    const rz = -raw.x * sinR + raw.z * cosR;
    return {
      x: rx,
      y: ry * cosX - rz * sinX,
      z: ry * sinX + rz * cosX
    };
  }

  function createSunMesh() {
    const group = new THREE.Group();

    const sunGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
    const sunSphere = new THREE.Mesh(sunGeo, sunMat);
    sunSphere.name = 'sunBody';
    group.add(sunSphere);

    const glowGeo = new THREE.SphereGeometry(0.7, 32, 32);
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D sunTex;
        uniform bool hasTex;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 baseCol = hasTex ? texture2D(sunTex, vUv).rgb : vec3(1.0, 0.7, 0.2);
          float edge = pow(clamp(1.0 - max(dot(vNormal, vec3(0, 0, 1.0)), 0.0), 0.0, 1.0), 1.8);
          vec3 glowCol = mix(vec3(1.0, 0.5, 0.0), baseCol, 0.5);
          gl_FragColor = vec4(glowCol, edge * 0.7);
        }
      `,
      uniforms: {
        sunTex: { value: null },
        hasTex: { value: false }
      },
      transparent: true, side: THREE.BackSide, depthWrite: false,
    });
    group.add(new THREE.Mesh(glowGeo, glowMat));
    group._glowMat = glowMat;

    const haloGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(clamp(0.5 - dot(vNormal, vec3(0, 0, 1.0)), 0.0, 1.0), 3.0);
          gl_FragColor = vec4(1.0, 0.45, 0.0, intensity * 0.35);
        }
      `,
      transparent: true, side: THREE.BackSide, depthWrite: false,
    });
    group.add(new THREE.Mesh(haloGeo, haloMat));

    return group;
  }

  function positionSun(date) {
    if (!sunMesh) return;
    const sunEcl = getSunEcliptic(date);
    const wv = raDecToWorld(sunEcl.ra, sunEcl.dec, 8, date);
    sunMesh.position.set(wv.x, wv.y, wv.z);
  }

  function createScene(canvas, cityName) {
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

    globeGroup = new THREE.Group();
    scene.add(globeGroup);

    markerGroup = new THREE.Group();
    globeGroup.add(markerGroup);

    starField = createStarField();
    scene.add(starField);

    const textureLoader = new THREE.TextureLoader();

    const earthGeo = new THREE.SphereGeometry(1, 40, 28);
    const earthMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform sampler2D bumpTex;
        uniform sampler2D specTex;
        uniform vec3 sunDirW;
        uniform vec3 moonDirW;
        uniform float eclipseAmount;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec4 dayColor = texture2D(dayTex, vUv);
          vec4 nightColor = texture2D(nightTex, vUv);

          vec3 sunDir = normalize(sunDirW);
          vec3 norm = normalize(vWorldNormal);
          float NdotL = dot(norm, sunDir);

          float dayFactor = smoothstep(-0.2, 0.15, NdotL);

          vec3 dayLit = dayColor.rgb * clamp(NdotL * 0.7 + 0.3, 0.0, 1.0);
          vec3 nightRaw = nightColor.rgb * 0.12;
          float nightLum = dot(nightRaw, vec3(0.299, 0.587, 0.114));
          vec3 nightLit = vec3(nightLum);
          vec3 color = mix(nightLit, dayLit, dayFactor);

          float terminatorGlow = smoothstep(-0.25, -0.05, NdotL) * (1.0 - smoothstep(-0.05, 0.15, NdotL));
          color += vec3(0.08, 0.05, 0.02) * terminatorGlow * 0.35;

          {
            vec3 moonDir = normalize(moonDirW);
            float moonSunAlign = max(dot(moonDir, sunDir), 0.0);
            float penumbra = smoothstep(0.97, 0.9999, moonSunAlign);
            float eclipseFactor = penumbra * eclipseAmount;
            float eclipseShadow = eclipseFactor * dayFactor;
            float umbraSpot = smoothstep(0.45, 0.9, max(dot(norm, moonDir), 0.0));
            color = mix(color, color * 0.04, eclipseShadow * 0.96);
            color = mix(color, color * 0.12, eclipseFactor * dayFactor * umbraSpot * 0.6);
            float eclipseGlobal = eclipseFactor * 0.85;
            color *= (1.0 - eclipseGlobal);
            color = mix(color, vec3(0.02, 0.02, 0.03), eclipseGlobal * 0.5);
          }

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = clamp(1.0 - max(dot(viewDir, norm), 0.0), 0.0, 1.0);

          vec3 atmosColor = vec3(0.25, 0.5, 1.0);
          float atmBlend = pow(fresnel, 3.5) * 0.55 * dayFactor;
          color = mix(color, atmosColor, atmBlend);

          float edgeDark = pow(fresnel, 1.2) * 0.85 * (1.0 - dayFactor);
          color = mix(color, vec3(0.002, 0.005, 0.015), edgeDark);

          float lum = dot(color, vec3(0.299, 0.587, 0.114));
          color = clamp(mix(vec3(lum), color, 1.4), 0.0, 1.0);
          color = pow(color, vec3(0.92));
          color = clamp(color, 0.0, 1.0);

          gl_FragColor = vec4(color, 1.0);
        }
      `,
      uniforms: {
        dayTex: { value: null },
        nightTex: { value: null },
        bumpTex: { value: null },
        specTex: { value: null },
        sunDirW: { value: new THREE.Vector3(0, 1, 0) },
        moonDirW: { value: new THREE.Vector3(0, 1, 0) },
        eclipseAmount: { value: 0 }
      }
    });

    globeMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(globeMesh);

    const texFiles = [
      ['Themes/earth/earth-day.jpg', 'dayTex', true],
      ['Themes/earth/earth-night.jpg', 'nightTex', true],
      ['Themes/earth/earth-bump.png', 'bumpTex', false],
      ['Themes/earth/earth-spec.png', 'specTex', false]
    ];
    texFiles.forEach(([file, uniform, aniso]) => {
      const onLoad = tex => {
        if (aniso) tex.anisotropy = 4;
        earthMat.uniforms[uniform].value = tex;
      };
      try {
        const extUrl = chrome.runtime?.getURL?.(file);
        if (extUrl) {
          textureLoader.load(extUrl, onLoad, undefined, () => textureLoader.load(file, onLoad));
        } else {
          textureLoader.load(file, onLoad);
        }
      } catch (e) {
        textureLoader.load(file, onLoad);
      }
    });

    const atmosGeo = new THREE.SphereGeometry(1.04, 40, 28);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vWorldNormal;
        varying vec3 vViewNormal;
        varying vec3 vViewDir;
        void main() {
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vViewNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirW;
        uniform float eclipseAmount;
        varying vec3 vWorldNormal;
        varying vec3 vViewNormal;
        varying vec3 vViewDir;
        void main() {
          float fresnel = pow(clamp(1.0 - max(dot(vViewDir, vViewNormal), 0.0), 0.0, 1.0), 3.5);
          vec3 sunDir = normalize(sunDirW);
          float sunFacing = max(dot(vWorldNormal, sunDir), 0.0);
          vec3 dayAtmos = vec3(0.35, 0.6, 1.0);
          vec3 nightAtmos = vec3(0.02, 0.05, 0.15);
          vec3 color = mix(nightAtmos, dayAtmos, sunFacing);
          color = mix(color, vec3(0.01, 0.01, 0.02), eclipseAmount);
          float alpha = fresnel * (0.5 - eclipseAmount * 0.35);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      uniforms: { sunDirW: { value: new THREE.Vector3(0, 1, 0) }, eclipseAmount: { value: 0 } },
      transparent: true, side: THREE.FrontSide, depthWrite: false,
    });
    atmosphereMesh = new THREE.Mesh(atmosGeo, atmosMat);
    globeGroup.add(atmosphereMesh);

    const glassGeo = new THREE.SphereGeometry(1.005, 40, 28);
    const glassMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vViewNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vViewNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirW;
        uniform float eclipseAmount;
        varying vec3 vViewNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        void main() {
          vec3 norm = normalize(vViewNormal);
          vec3 viewDir = normalize(vViewDir);
          float fresnel = pow(clamp(1.0 - max(dot(viewDir, norm), 0.0), 0.0, 1.0), 2.2);
          vec3 sunDir = normalize(sunDirW);
          vec3 worldNorm = normalize(vWorldNormal);
          float sunFacing = max(dot(worldNorm, sunDir), 0.0);
          float rim = pow(fresnel, 1.2);
          vec3 rimDay = vec3(0.3, 0.6, 1.0);
          vec3 rimNight = vec3(0.05, 0.15, 0.4);
          vec3 rimColor = mix(rimNight, rimDay, sunFacing * (1.0 - eclipseAmount));
          vec3 color = rimColor * rim * 1.5;
          float alpha = rim * (0.5 - eclipseAmount * 0.3);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      uniforms: { sunDirW: { value: new THREE.Vector3(0, 1, 0) }, eclipseAmount: { value: 0 } },
      transparent: true, side: THREE.FrontSide, depthWrite: false,
    });
    glassMesh = new THREE.Mesh(glassGeo, glassMat);
    globeGroup.add(glassMesh);

    moonMesh = createMoonMesh();
    scene.add(moonMesh);

    sunMesh = createSunMesh();
    scene.add(sunMesh);

    try {
      const moonUrl = chrome.runtime?.getURL?.('Themes/earth/moon.jpg') || 'Themes/earth/moon.jpg';
      textureLoader.load(moonUrl, tex => {
        moonTexture = tex;
        if (moonMesh) moonMesh.visible = true;
        if (moonMesh.children[0]?.material) {
          moonMesh.children[0].material.uniforms.moonTex.value = tex;
          moonMesh.children[0].material.uniforms.hasTexture.value = true;
        }
      });
    } catch (e) {}

    try {
      const sunUrl = chrome.runtime?.getURL?.('Themes/earth/sun.jpg') || 'Themes/earth/sun.jpg';
      textureLoader.load(sunUrl, tex => {
        if (sunMesh._glowMat) {
          sunMesh._glowMat.uniforms.sunTex.value = tex;
          sunMesh._glowMat.uniforms.hasTex.value = true;
        }
        const body = sunMesh.getObjectByName('sunBody');
        if (body?.material) {
          body.material.map = tex;
          body.material.color.set(0xffffff);
          body.material.needsUpdate = true;
        }
      });
    } catch (e) {}

    scene.add(new THREE.AmbientLight(0xffffff, 0.06));
    updateSunPosition(new Date());

    if (typeof EarthWeather !== 'undefined') {
      EarthWeather.init(scene, globeGroup, globeMesh);
    }

    geocodeCity(cityName).then(coords => {
      if (coords) {
        const [lat, lon] = coords;
        targetRotationY = getRotationForCity(lat, lon);
        currentRotationY = targetRotationY;
        cityRotationY = targetRotationY;

        globeMesh.rotation.y = currentRotationY;
        markerGroup.rotation.y = currentRotationY;

        const latRad = lat * Math.PI / 180;
        targetLookAtY = Math.sin(latRad);
        currentLookAtY = targetLookAtY;
        cityLookAtZ = Math.cos(latRad);
        camera.position.set(0, currentLookAtY, currentZoomDist);
        camera.lookAt(0, currentLookAtY, 0);

        markerGroup.add(createMarker(coords, 0xff3333, 0.012));
      }
    });

    setupDragControls(canvas);
  }

  function setupDragControls(canvas) {
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
      targetRotationX = Math.max(-0.6, Math.min(0.6, dragStartRotX + dy * 0.005));
    }
    function onPointerUp() {
      isDragging = false;
    }
    function onWheel(e) {
      if (document.querySelector('.overlay-panel.is-open') || document.body.classList.contains('animating-modal')) return;
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

  function updateSunPosition(date) {
    const sunEcl = getSunEcliptic(date);
    const sunW = raDecToWorld(sunEcl.ra, sunEcl.dec, 1, date);
    if (moonMesh?.children?.[0]?.material?.uniforms?.sunDir) {
      moonMesh.children[0].material.uniforms.sunDir.value.set(sunW.x, sunW.y, sunW.z);
    }
  }

  function lerp(a, b, t) {
    let diff = b - a;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  function animate(time) {
    if (!renderer || !scene || !camera) { animId = null; return; }
    animId = requestAnimationFrame(animate);

    if (!animStartTime) animStartTime = time;
    const elapsed = time - animStartTime;

    currentRotationY = lerp(currentRotationY, targetRotationY, 0.08);
    currentRotationX = lerp(currentRotationX, targetRotationX, 0.08);
    currentLookAtY += (targetLookAtY - currentLookAtY) * 0.08;
    currentZoomDist = lerp(currentZoomDist, targetZoomDist, 0.12);

    if (globeGroup) {
      globeGroup.rotation.x = currentRotationX;
    }
    if (globeMesh) {
      globeMesh.rotation.y = currentRotationY;
    }
    if (markerGroup) {
      markerGroup.rotation.y = currentRotationY;
    }
    if (camera) {
      camera.position.set(0, currentLookAtY, currentZoomDist);
      camera.lookAt(0, currentLookAtY, 0);
    }

    if (starField?.material?.uniforms) {
      starField.material.uniforms.time.value = time;
    }

    markerGroup.children.forEach(group => {
      group.children.forEach(child => {
        if (child._isPulse) {
          const s = 1 + Math.sin(time * 0.003) * 0.4;
          child.scale.set(s, s, s);
          child.material.opacity = 0.35 - Math.sin(time * 0.003) * 0.2;
        }
        if (child.name === 'markerRing' || child.name === 'markerPulse') {
          child.lookAt(camera.position);
        }
      });
    });

    const now = simTimeMs ? new Date(simTimeMs) : new Date();
    const moonEcl = getMoonEcliptic(now);
    const sunEcl = getSunEcliptic(now);
    const moonW = raDecToWorld(moonEcl.ra, moonEcl.dec, 1, now);
    const sunW = raDecToWorld(sunEcl.ra, sunEcl.dec, 1, now);
    const eqSunX = Math.cos(sunEcl.dec) * Math.cos(sunEcl.ra);
    const eqSunY = Math.sin(sunEcl.dec);
    const eqSunZ = Math.cos(sunEcl.dec) * Math.sin(sunEcl.ra);
    const eqMoonX = Math.cos(moonEcl.dec) * Math.cos(moonEcl.ra);
    const eqMoonY = Math.sin(moonEcl.dec);
    const eqMoonZ = Math.cos(moonEcl.dec) * Math.sin(moonEcl.ra);
    const eqAlign = eqSunX * eqMoonX + eqSunY * eqMoonY + eqSunZ * eqMoonZ;
    const eclipseAmount = Math.max(0, Math.min(1, (eqAlign - 0.984) / 0.01));
    if (globeMesh?.material?.uniforms) {
      if (globeMesh.material.uniforms.sunDirW) {
        globeMesh.material.uniforms.sunDirW.value.set(sunW.x, sunW.y, sunW.z);
        globeMesh.material.uniforms.moonDirW.value.set(moonW.x, moonW.y, moonW.z);
      }
      if (globeMesh.material.uniforms.eclipseAmount) {
        globeMesh.material.uniforms.eclipseAmount.value = eclipseAmount;
      }
    }
    if (atmosphereMesh?.material?.uniforms?.sunDirW) {
      atmosphereMesh.material.uniforms.sunDirW.value.set(sunW.x, sunW.y, sunW.z);
    }
    if (atmosphereMesh?.material?.uniforms?.eclipseAmount) {
      atmosphereMesh.material.uniforms.eclipseAmount.value = eclipseAmount;
    }
    if (glassMesh?.material?.uniforms?.sunDirW) {
      glassMesh.material.uniforms.sunDirW.value.set(sunW.x, sunW.y, sunW.z);
    }
    if (glassMesh?.material?.uniforms?.eclipseAmount) {
      glassMesh.material.uniforms.eclipseAmount.value = eclipseAmount;
    }
    if (moonMesh?.children?.[0]?.material?.uniforms?.sunDir) {
      moonMesh.children[0].material.uniforms.sunDir.value.set(sunW.x, sunW.y, sunW.z);
    }

    if (elapsed - lastTime > SUN_UPDATE_INTERVAL) {
      lastTime = elapsed;
    }
    positionMoon(now);
    positionSun(now);

    if (typeof EarthWeather !== 'undefined') {
      EarthWeather.update(time);
    }

    renderer.render(scene, camera);
  }

  function handleResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const canvas = renderer.domElement;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  return {
    init(canvas, cityName) {
      if (animId) this.destroy();
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      createScene(canvas, cityName);
      window.addEventListener('resize', handleResize);
      animStartTime = 0;
      lastTime = 0;
      window.__earthDebug = {
        scene, camera, renderer, globeMesh, atmosphereMesh, glassMesh,
        markerGroup, moonMesh, sunMesh, starField
      };
      animate(0);
    },
    setSimTime(ms) {
      simTimeMs = ms && !isNaN(ms) ? ms : null;
    },
    clearSimTime() {
      simTimeMs = null;
    },
    getSimTime() {
      return simTimeMs;
    },
    destroy() {
      if (typeof EarthWeather !== 'undefined') EarthWeather.destroy();
      if (animId) { cancelAnimationFrame(animId); animId = null; }
      removeDragControls();
      window.removeEventListener('resize', handleResize);

      function disposeObj(obj) {
        if (!obj) return;
        obj.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          }
        });
      }

      disposeObj(starField);
      disposeObj(globeMesh);
      disposeObj(atmosphereMesh);
      disposeObj(glassMesh);
      disposeObj(markerGroup);
      disposeObj(moonMesh);
      disposeObj(sunMesh);
      disposeObj(globeGroup);

      if (moonTexture) { moonTexture.dispose(); moonTexture = null; }
      if (renderer) { renderer.dispose(); renderer = null; }
      scene = null; camera = null; atmosphereMesh = null; glassMesh = null;
      globeGroup = null; globeMesh = null; markerGroup = null;
      moonMesh = null; sunMesh = null; starField = null;
      animStartTime = 0; lastTime = 0;
      targetRotationY = 0; currentRotationY = 0;
      targetLookAtY = 0; currentLookAtY = 0; cityLookAtZ = 0.6;
      cityRotationY = 0;
      targetZoomDist = 3.2; currentZoomDist = 3.2;
    },
    setWeatherEffect(effect) {
      if (typeof EarthWeather !== 'undefined') {
        EarthWeather.setEffect(effect);
      }
    },
    isActive() {
      return !!animId;
    },
    geocodeCity
  };
})();
