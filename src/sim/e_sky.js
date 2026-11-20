
  /* ==========================================================
     LIGHTS, SKY, TIME OF DAY AND WEATHER
     ========================================================== */
  var hemi = new THREE.HemisphereLight(0xffffff, 0x77705f, 0.8); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff4e2, 1);
  sun.castShadow = true;
  var SHR = 38, SHMAP = 2048, SHQ = 2;
  function setShadows(q) {
    SHQ = q; if (!q) return;
    SHMAP = q === 2 ? 2048 : 1024; SHR = q === 2 ? 38 : 26;
    sun.shadow.mapSize.set(SHMAP, SHMAP);
    sun.shadow.camera.left = -SHR; sun.shadow.camera.right = SHR; sun.shadow.camera.top = SHR; sun.shadow.camera.bottom = -SHR;
    sun.shadow.camera.updateProjectionMatrix();
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  sun.shadow.mapSize.set(SHMAP, SHMAP);
  sun.shadow.camera.left = -SHR; sun.shadow.camera.right = SHR; sun.shadow.camera.top = SHR; sun.shadow.camera.bottom = -SHR;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 300; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.035;
  scene.add(sun); scene.add(sun.target);
  var moon = new THREE.DirectionalLight(0x9fb4e0, 0); scene.add(moon); scene.add(moon.target);

  var skyU = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uCloud: { value: 0.2 }, uCloudDark: { value: 0 }, uTime: LIT.uTime, uNight: LIT.uNight, uEnvPass: { value: 0 }
  };
  var sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 uSun; uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSunCol; uniform float uCloud; uniform float uCloudDark; uniform float uTime; uniform float uNight; uniform float uEnvPass;',
      'varying vec3 vDir;',
      NOISE_GLSL,
      'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }',
      'void main(){',
      '  vec3 d = normalize(vDir); float y = d.y;',
      '  vec3 col = mix(uHor, uZen, pow(clamp(y, 0.0, 1.0), 0.45));',
      '  if (y < 0.0) col = uHor * (1.0 + y * 1.5);',
      '  if (uEnvPass > 0.5 && y < 0.0) col = mix(uHor, uZen * 0.25 + vec3(0.05, 0.045, 0.04) * (1.0 - uNight), smoothstep(0.0, -0.2, y)) * 0.6;',
      '  float sd = max(dot(d, uSun), 0.0);',
      '  col += uSunCol * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5) * (1.0 - uCloud * 0.6);',
      '  col += uSunCol * smoothstep(0.99955, 0.9998, sd) * 18.0 * (1.0 - uCloud * 0.9) * (1.0 - uEnvPass);',
      '  if (uNight > 0.02 && y > 0.0) {',
      '    vec2 sp = d.xz / (y + 0.35) * 260.0; vec2 cell = floor(sp);',
      '    float st = step(0.9965, hh(cell)) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5));',
      '    col += vec3(st) * uNight * 1.6 * (1.0 - uCloud) * (0.5 + 0.5 * sin(uTime * 3.0 + hh(cell + 3.0) * 40.0));',
      '  }',
      '  if (y > 0.0) {',
      '    vec2 uv = d.xz / (y + 0.1) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);',
      '    float c = fbm(uv * 1.6);',
      '    float cov = smoothstep(1.02 - uCloud * 0.85, 1.3 - uCloud * 0.75, c + 0.25) * smoothstep(0.0, 0.12, y);',
      '    vec3 lit = mix(vec3(1.0), uSunCol * 1.2 + uHor * 0.3, 0.35) * (1.0 - 0.75 * uNight);',
      '    vec3 cc = mix(lit, uHor * 0.55 + vec3(0.03), uCloudDark);',
      '    cc += uSunCol * pow(sd, 10.0) * 0.6 * (1.0 - uCloudDark);',
      '    col = mix(col, cc, cov * 0.92);',
      '  }',
      '  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));',
      '}'
    ].join('\n')
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  /* image-based light: the sky (without its sun disc) prefiltered into an environment map every few seconds */
  var envScene = new THREE.Scene(), envU = Object.assign({}, skyU, { uEnvPass: { value: 1 } });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ uniforms: envU, side: THREE.BackSide, depthWrite: false, vertexShader: sky.material.vertexShader, fragmentShader: sky.material.fragmentShader })));
  var pmrem = new THREE.PMREMGenerator(renderer), envRT = null, envT = 99, envLast = -99, envKey = '';
  function updateEnv(dt) {
    var now = performance.now() / 1000; envT = now - envLast;
    var key = Math.round(sdir.y * 60) + ':' + Math.round(W.cloud * 20) + ':' + Math.round(W.dark * 10) + ':' + Math.round(LIT.uNight.value * 20);
    if (envT < 4 || (key === envKey && envT < 20)) return;
    envLast = now; envKey = key;
    var old = envRT;
    envRT = pmrem.fromScene(envScene, 0, 0.1, 1000);
    scene.environment = envRT.texture;
    if (old) old.dispose();
  }

  /* weather presets: cloud cover, cloud darkness, fog near/far, rain, snow, wind, wetness, snow lying everywhere */
  var WEATHERS = {
    clear: { cloud: 0.12, dark: 0.0, fn: 900, ff: 17000, rain: 0, snow: 0, wind: 0.3, wet: 0, all: 0, snowline: 1170 },
    cloudy: { cloud: 0.78, dark: 0.35, fn: 700, ff: 11000, rain: 0, snow: 0, wind: 0.55, wet: 0, all: 0, snowline: 1080 },
    rain: { cloud: 0.97, dark: 0.7, fn: 200, ff: 3000, rain: 1, snow: 0, wind: 1.0, wet: 1, all: 0, snowline: 1000 },
    fog: { cloud: 0.6, dark: 0.25, fn: 20, ff: 480, rain: 0, snow: 0, wind: 0.1, wet: 0.35, all: 0, snowline: 1120 },
    snow: { cloud: 0.92, dark: 0.45, fn: 100, ff: 1500, rain: 0, snow: 1, wind: 0.6, wet: 0.25, all: 0.9, snowline: 380 }
  };
  var W = { cloud: 0.12, dark: 0, fn: 900, ff: 17000, rain: 0, snow: 0, wind: 0.3, wet: 0, all: 0, snowline: 1150 };
  var env = { hour: 16.5, cycle: true, speed: 60, weather: 'clear', auto: false, nextAuto: 240 };
  var DOY = (function () { var d = new Date(); return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); })();
  var LATR = -42.8826 * Math.PI / 180;
  /* sun direction for Hobart at a clock time on today's date (clock time already allows for daylight saving) */
  function sunDir(hour, out) {
    var dec = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI / 365 * (DOY + 10));
    var dst = (DOY > 278 || DOY < 96) ? 1 : 0;
    var solar = hour - dst + (147.33 - 150) / 15;
    var H = (solar - 12) * Math.PI / 12;
    var east = -Math.cos(dec) * Math.sin(H), north = Math.cos(LATR) * Math.sin(dec) - Math.sin(LATR) * Math.cos(dec) * Math.cos(H);
    var up = Math.sin(LATR) * Math.sin(dec) + Math.cos(LATR) * Math.cos(dec) * Math.cos(H);
    return out.set(east, up, -north).normalize();
  }
  var SKYK = [
    { e: -0.3, zen: C('#02040a'), hor: C('#0b1222'), sun: C('#000000') },
    { e: -0.1, zen: C('#0a1430'), hor: C('#2a2e4c'), sun: C('#5a2a1a') },
    { e: -0.02, zen: C('#24365e'), hor: C('#c5705a'), sun: C('#ff7a3a') },
    { e: 0.08, zen: C('#3e5f92'), hor: C('#f0b07a'), sun: C('#ffb070') },
    { e: 0.25, zen: C('#3d6aa6'), hor: C('#b9cde0'), sun: C('#ffe4c0') },
    { e: 1.0, zen: C('#2f5f9e'), hor: C('#c4d6e6'), sun: C('#fff5e6') }
  ];
  var zen = new THREE.Color(), hor = new THREE.Color(), sunc = new THREE.Color(), grey = new THREE.Color(), sdir = new THREE.Vector3();
  var exposure = 1;
  function updateSky(dt) {
    if (env.cycle) env.hour = (env.hour + dt * env.speed / 3600 + 24) % 24;
    if (env.auto) {
      env.nextAuto -= dt;
      if (env.nextAuto <= 0) {
        var ks = ['clear', 'clear', 'cloudy', 'cloudy', 'rain', 'fog', 'snow'], nw = ks[(Math.random() * ks.length) | 0];
        setWeather(nw, true); env.nextAuto = 180 + Math.random() * 240;
      }
    }
    var tg = WEATHERS[env.weather], k = Math.min(1, dt * 0.12);
    ['cloud', 'dark', 'rain', 'snow', 'wind', 'all', 'snowline'].forEach(function (p) { W[p] += (tg[p] - W[p]) * k; });
    W.fn += (tg.fn - W.fn) * k; W.ff += (tg.ff - W.ff) * k;
    W.wet += (tg.wet - W.wet) * Math.min(1, dt * (tg.wet > W.wet ? 0.05 : 0.015));
    sunDir(env.hour, sdir);
    var e = sdir.y, i0 = 0;
    while (i0 < SKYK.length - 2 && e > SKYK[i0 + 1].e) i0++;
    var A = SKYK[i0], B = SKYK[i0 + 1], f = clamp((e - A.e) / (B.e - A.e), 0, 1);
    zen.copy(A.zen).lerp(B.zen, f); hor.copy(A.hor).lerp(B.hor, f); sunc.copy(A.sun).lerp(B.sun, f);
    /* clouds grey the sky */
    var lum = (hor.r + hor.g + hor.b) / 3;
    grey.setRGB(lum, lum * 1.02, lum * 1.08).multiplyScalar(0.85 - W.dark * 0.45);
    hor.lerp(grey, W.cloud * 0.8); zen.lerp(grey.multiplyScalar(0.85), W.cloud * 0.85);
    var night = 1 - sstep(-0.1, 0.05, e);
    skyU.uSun.value.copy(sdir); skyU.uZen.value.copy(zen); skyU.uHor.value.copy(hor); skyU.uSunCol.value.copy(sunc);
    skyU.uCloud.value = W.cloud; skyU.uCloudDark.value = W.dark;
    LIT.uNight.value = clamp(Math.max(night, (W.dark - 0.5) * 0.6 * sstep(0.2, -0.05, e - 0.2) + W.dark * 0.15 * (1 - sstep(0.1, 0.4, e))), 0, 1);
    LIT.uWet.value = W.wet; LIT.uSnowline.value = W.snowline; LIT.uSnowAll.value = W.all;
    WIND.value = W.wind;
    scene.fog.color.copy(hor);
    scene.fog.near = W.fn; scene.fog.far = W.ff;
    var sunUp = sstep(-0.03, 0.12, e);
    sun.color.copy(sunc); sun.intensity = 1.35 * sunUp * (1 - 0.82 * W.cloud * (0.6 + 0.4 * W.dark));
    sun.castShadow = sun.intensity > 0.12 && SHQ > 0;
    hemi.color.copy(zen).lerp(hor, 0.5).multiplyScalar(1.25); hemi.groundColor.setRGB(0.25, 0.23, 0.2).multiplyScalar(0.35 + 0.65 * sstep(-0.1, 0.3, e));
    hemi.intensity = 0.3 + 0.6 * sstep(-0.15, 0.35, e) * (1 - 0.3 * W.dark) + 0.25 * W.cloud * sstep(0, 0.3, e);
    moon.intensity = 0.16 * night * (1 - W.cloud * 0.7);
    waterU.uSun.value.copy(sdir); waterU.uSunCol.value.copy(sunc).multiplyScalar(sunUp); waterU.uZen.value.copy(zen); waterU.uHor.value.copy(hor);
    waterU.uFogC.value.copy(hor); waterU.uFogN.value = W.fn; waterU.uFogF.value = W.ff; waterU.uCloud.value = W.cloud; waterU.uWind.value = W.wind;
    /* the sky now lights the scene through the environment map, so the hemisphere fill is lighter */
    hemi.intensity *= scene.environment ? 0.55 : 1;
    updateEnv(dt);
    exposure = 0.92 + 0.85 * night + 0.25 * W.dark * (1 - night);
    return e;
  }
  function setWeather(name, fromAuto, instant) {
    env.weather = name;
    if (instant) for (var k in WEATHERS[name]) W[k] = WEATHERS[name][k];
    if (!fromAuto) env.auto = false;
    var sel = $('weatherSel'); if (sel && !fromAuto) sel.value = name; else if (sel && fromAuto) sel.value = 'auto';
  }

  /* ---------- rain and snow that follow the camera ---------- */
  var PBOX = 70, precip = new THREE.Group(); scene.add(precip);
  var rainMat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: LIT.uTime, uAmt: { value: 0 }, uWind: WIND, uNight: LIT.uNight },
    vertexShader: [
      'attribute float aEnd; uniform vec3 uCam; uniform float uTime; uniform float uAmt; uniform float uWind; varying float vA;',
      'void main(){',
      '  vec3 p = position; p.y -= uTime * 24.0; p.x += uTime * 3.0 * uWind;',
      '  p = mod(p - uCam + ' + PBOX / 2 + '.0, ' + PBOX + '.0) + uCam - ' + PBOX / 2 + '.0;',
      '  p += vec3(-0.08 * uWind, 0.9, 0.0) * aEnd;',
      '  vA = uAmt * step(fract(position.x * 7.13 + position.z * 3.7), uAmt);',
      '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: 'varying float vA; uniform float uNight; void main(){ gl_FragColor = linearToOutputTexel(vec4(vec3(0.55, 0.6, 0.66) * (1.0 - 0.7 * uNight), vA * 0.35)); }',
    transparent: true, depthWrite: false
  });
  var snowMat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: LIT.uTime, uAmt: { value: 0 }, uWind: WIND, uNight: LIT.uNight },
    vertexShader: [
      'uniform vec3 uCam; uniform float uTime; uniform float uAmt; uniform float uWind; varying float vA;',
      'void main(){',
      '  vec3 p = position; p.y -= uTime * 1.6; p.x += uTime * 1.2 * uWind + sin(uTime * 0.8 + position.y) * 1.2; p.z += cos(uTime * 0.6 + position.x) * 1.0;',
      '  p = mod(p - uCam + ' + PBOX / 2 + '.0, ' + PBOX + '.0) + uCam - ' + PBOX / 2 + '.0;',
      '  vA = uAmt * step(fract(position.x * 7.13 + position.z * 3.7), uAmt);',
      '  vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(90.0 / -mv.z, 1.0, 9.0);',
      '}'
    ].join('\n'),
    fragmentShader: 'varying float vA; uniform float uNight; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.1, dot(d, d)); gl_FragColor = linearToOutputTexel(vec4(vec3(0.95) * (1.0 - 0.75 * uNight), a * vA * 0.9)); }',
    transparent: true, depthWrite: false
  });
  (function () {
    var n = 9000, p = new Float32Array(n * 6), e = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) {
      var x = Math.random() * PBOX, y = Math.random() * PBOX, z = Math.random() * PBOX;
      p.set([x, y, z, x, y, z], i * 6); e[i * 2] = 0; e[i * 2 + 1] = 1;
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
    var rain = new THREE.LineSegments(g, rainMat); rain.frustumCulled = false; precip.add(rain);
    var m = 7000, q = new Float32Array(m * 3);
    for (i = 0; i < m * 3; i++) q[i] = Math.random() * PBOX;
    var g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(q, 3));
    var snow = new THREE.Points(g2, snowMat); snow.frustumCulled = false; precip.add(snow);
  })();
  function updatePrecip() {
    rainMat.uniforms.uCam.value.copy(camera.position); snowMat.uniforms.uCam.value.copy(camera.position);
    rainMat.uniforms.uAmt.value = W.rain; snowMat.uniforms.uAmt.value = W.snow;
    precip.visible = W.rain > 0.02 || W.snow > 0.02;
  }

  /* ==========================================================
     THE FILM LOOK: warm faded print colours, halation round lights, grain, vignette, a little gate weave
     ========================================================== */
  var postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadGeo = new THREE.PlaneGeometry(2, 2);
  var film = { on: true, grain: 0.6 };
  var glowPass = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, uPx: { value: new THREE.Vector2() }, uSRGB: { value: LINEAR_RT ? 0 : 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tScene; uniform vec2 uPx; uniform float uSRGB; varying vec2 vUv;',
      'vec3 tap(vec2 o){ vec3 c = texture2D(tScene, vUv + o * uPx).rgb; if (uSRGB > 0.5) c = pow(c, vec3(2.2)); return max(c - vec3(uSRGB > 0.5 ? 0.88 : 3.0), 0.0); }',
      'void main(){ vec3 c = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)); gl_FragColor = vec4(c * 0.25, 1.0); }'
    ].join('\n'), depthTest: false, depthWrite: false
  });
  var finalPass = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tGlow: { value: null }, uRes: { value: new THREE.Vector2() }, uGP: { value: new THREE.Vector2() }, uTime: LIT.uTime,
                uGrain: { value: 0.6 }, uFilm: { value: 1 }, uExp: { value: 1 }, uSRGB: { value: LINEAR_RT ? 0 : 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tScene; uniform sampler2D tGlow; uniform vec2 uRes; uniform vec2 uGP; uniform float uTime; uniform float uGrain; uniform float uFilm; uniform float uExp; uniform float uSRGB;',
      'varying vec2 vUv;',
      'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
      'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
      'vec3 dec(vec3 c){ return uSRGB > 0.5 ? pow(c, vec3(2.2)) : c; }',
      'void main(){',
      '  vec2 uv = vUv; float fr = floor(uTime * 24.0);',
      '  if (uFilm > 0.5) uv += vec2(h12(vec2(fr, 3.0)) - 0.5, h12(vec2(fr, 7.0)) - 0.5) * vec2(0.0004, 0.0009);',
      '  vec2 cd = uv - 0.5; float r2 = dot(cd, cd); vec3 c;',
      '  if (uFilm > 0.5) { vec2 o = cd * r2 * 0.012; c = vec3(dec(texture2D(tScene, uv + o).rgb).r, dec(texture2D(tScene, uv).rgb).g, dec(texture2D(tScene, uv - o).rgb).b); }',
      '  else c = dec(texture2D(tScene, uv).rgb);',
      '  vec3 g = texture2D(tGlow, uv).rgb * 0.2;',
      '  for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; vec2 o = vec2(cos(a), sin(a));',
      '    g += texture2D(tGlow, uv + o * uGP * 2.5).rgb * 0.075 + texture2D(tGlow, uv + o * uGP * 6.0).rgb * 0.04; }',
      '  c += g * (uFilm > 0.5 ? vec3(1.15, 0.72, 0.5) : vec3(0.7));',
      '  c = aces(c * uExp);',
      '  c = pow(c, vec3(1.0 / 2.2));',
      '  if (uFilm > 0.5) {',
      '    float l = dot(c, vec3(0.299, 0.587, 0.114));',
      '    c = mix(vec3(l), c, 0.84);',
      '    c += vec3(0.035, 0.008, -0.04) * smoothstep(0.3, 1.0, l) + vec3(-0.02, 0.012, 0.03) * (1.0 - smoothstep(0.0, 0.42, l));',
      '    c *= vec3(1.03, 1.0, 0.9);',
      '    c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);',
      '    c = 0.06 * vec3(1.0, 0.95, 0.85) + c * 0.9;',
      '    float vig = smoothstep(0.9, 0.2, length(cd * vec2(1.0, 0.8)));',
      '    c *= mix(0.66, 1.0, vig);',
      '    vec2 fc = gl_FragCoord.xy;',
      '    float gn = h12(fc + fract(uTime * 7.31) * vec2(97.0, 57.0)) + h12(floor(fc * 0.5) + fract(uTime * 3.17) * vec2(41.0, 13.0)) - 1.0;',
      '    c += gn * uGrain * (0.05 + 0.07 * (1.0 - l));',
      '    float sp = step(0.99993, h12(floor(fc / 3.0) + fr * 1.37));',
      '    c = mix(c, vec3(0.08), sp * uGrain);',
      '  }',
      '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
      '}'
    ].join('\n'), depthTest: false, depthWrite: false
  });
  var glowQuad = new THREE.Mesh(quadGeo, glowPass), finalQuad = new THREE.Mesh(quadGeo, finalPass);
  var glowScene = new THREE.Scene(); glowScene.add(glowQuad);
  var finalScene = new THREE.Scene(); finalScene.add(finalQuad);
  function renderFrame() {
    renderer.setRenderTarget(rtMain);
    renderer.render(scene, camera);
    glowPass.uniforms.tScene.value = rtMain.texture;
    glowPass.uniforms.uPx.value.set(1 / rtMain.width, 1 / rtMain.height);
    renderer.setRenderTarget(rtGlow);
    renderer.render(glowScene, postCam);
    finalPass.uniforms.tScene.value = rtMain.texture; finalPass.uniforms.tGlow.value = rtGlow.texture;
    finalPass.uniforms.uRes.value.set(rtMain.width, rtMain.height); finalPass.uniforms.uGP.value.set(1 / rtGlow.width, 1 / rtGlow.height);
    finalPass.uniforms.uFilm.value = film.on ? 1 : 0; finalPass.uniforms.uGrain.value = film.grain; finalPass.uniforms.uExp.value = exposure;
    renderer.setRenderTarget(null);
    renderer.render(finalScene, postCam);
  }
