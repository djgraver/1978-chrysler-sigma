(function () {
  'use strict';
  var THREE = window.THREE;
  function $(id) { return document.getElementById(id); }
  var stage = $('stage'), canvas = $('gl'), loadEl = $('loading'), loadMsg = $('loadmsg');
  if (!THREE) { loadMsg.textContent = 'The 3D engine could not load.'; return; }
  function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hash(a, b, c) {
    var h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* ==========================================================
     RENDERER AND FILM PASS TARGETS
     ========================================================== */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var GL2 = renderer.capabilities.isWebGL2;
  var rtMain, rtGlow;
  function makeTargets(w, h) {
    if (rtMain) { rtMain.dispose(); rtGlow.dispose(); }
    var pw = Math.max(2, Math.round(w * DPR)), ph = Math.max(2, Math.round(h * DPR));
    if (GL2 && THREE.WebGLMultisampleRenderTarget) {
      rtMain = new THREE.WebGLMultisampleRenderTarget(pw, ph, { type: THREE.HalfFloatType, format: THREE.RGBAFormat });
      rtMain.samples = 4;
    } else {
      rtMain = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.UnsignedByteType });
      rtMain.texture.encoding = THREE.sRGBEncoding;
    }
    rtGlow = new THREE.WebGLRenderTarget(Math.max(2, pw >> 2), Math.max(2, ph >> 2), { type: GL2 ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }
  var LINEAR_RT = GL2 && !!THREE.WebGLMultisampleRenderTarget;
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfd0de, 900, 17000);
  var camera = new THREE.PerspectiveCamera(55, 1, 0.3, 46000);

  /* shared lighting uniforms: street lamps and the Sigma's headlights reach these materials */
  var NL = 24;
  var LIT = {
    uLamps: { value: [] }, uHeadPos: { value: new THREE.Vector3() }, uHeadDir: { value: new THREE.Vector3(1, 0, 0) },
    uHeadOn: { value: 0 }, uNight: { value: 0 }, uWet: { value: 0 }, uSnowline: { value: 1130 }, uTime: { value: 0 }, uSnowAll: { value: 0 }
  };
  for (var li = 0; li < NL; li++) LIT.uLamps.value.push(new THREE.Vector4(0, -1000, 0, 0));
  var LIGHT_GLSL = [
    'uniform vec4 uLamps[' + NL + ']; uniform vec3 uHeadPos; uniform vec3 uHeadDir; uniform float uHeadOn; uniform float uNight; uniform float uWet;',
    'vec3 nightLight(vec3 p, vec3 n){',
    '  vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < ' + NL + '; i++) {',
    '    vec4 L = uLamps[i];',
    '    vec3 v = L.xyz - p; float d2 = dot(v, v);',
    '    float ndl = max(dot(n, v * inversesqrt(d2 + 0.01)), 0.0);',
    '    acc += vec3(1.0, 0.70, 0.40) * L.w * ndl * 42.0 / (d2 + 7.0) * (1.0 - smoothstep(500.0, 2000.0, d2));',
    '  }',
    '  vec3 hv = p - uHeadPos; float hd = length(hv) + 0.01; vec3 hdir = hv / hd;',
    '  float cone = smoothstep(0.82, 0.965, dot(hdir, uHeadDir));',
    '  acc += vec3(1.0, 0.92, 0.75) * uHeadOn * cone * max(dot(n, -hdir), 0.0) * 260.0 / (hd * hd + 8.0);',
    '  return acc * uNight * (1.0 + 0.8 * uWet);',
    '}',
    '/* glints of street lamps and headlights off a glossy (wet) surface */',
    'vec3 nightSpec(vec3 p, vec3 n, vec3 v, float rough){',
    '  if (uNight < 0.01) return vec3(0.0);',
    '  float sh = 2.0 / max(rough * rough, 0.002); vec3 acc = vec3(0.0);',
    '  for (int i = 0; i < ' + NL + '; i++) {',
    '    vec4 L = uLamps[i]; vec3 l = L.xyz - p; float d2 = dot(l, l); l *= inversesqrt(d2 + 0.01);',
    '    vec3 h = normalize(l + v); acc += vec3(1.0, 0.7, 0.4) * L.w * pow(max(dot(n, h), 0.0), sh) * (sh + 2.0) * 0.06 * 40.0 / (d2 + 30.0);',
    '  }',
    '  return acc * uNight;',
    '}'
  ].join('\n');
  /* shared helpers for procedural surface detail: value noise, a world-space bump that tilts the view-space normal,
     and the distance at which fine detail fades out so it never shimmers */
  var DETAIL_GLSL = [
    'float dh1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
    'float dnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(dh1(i), dh1(i + vec2(1, 0)), f.x), mix(dh1(i + vec2(0, 1)), dh1(i + vec2(1, 1)), f.x), f.y); }',
    'float dfbm(vec2 p){ return dnoise(p) * 0.5 + dnoise(p * 2.07 + 3.1) * 0.25 + dnoise(p * 4.13 + 7.7) * 0.125; }',
    '/* tilt a view-space normal by world-space slopes gx, gy along world tangents T and B */',
    'vec3 bumpN(vec3 nV, vec3 T, vec3 B, float gx, float gy){ vec3 tv = normalize((viewMatrix * vec4(T, 0.0)).xyz); vec3 bv = normalize((viewMatrix * vec4(B, 0.0)).xyz); return normalize(nV - tv * gx - bv * gy); }',
    'float detailFade(float near, float far){ return 1.0 - smoothstep(near, far, length(vWP - cameraPosition)); }'
  ].join('\n');
  /* adds world position/normal varyings and night lighting to a Lambert or Standard material, plus optional extra code */
  function litMaterial(mat, o) {
    o = o || {};
    mat.onBeforeCompile = function (sh) {
      for (var k in LIT) sh.uniforms[k] = LIT[k];
      if (o.uniforms) for (var k2 in o.uniforms) sh.uniforms[k2] = o.uniforms[k2];
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + (o.vhead || '') + sh.vertexShader.replace('#include <project_vertex>', [
        '#include <project_vertex>',
        'vec4 wp4 = vec4(transformed, 1.0); vec3 wn = objectNormal;',
        '#ifdef USE_INSTANCING',
        ' wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;',
        '#endif',
        'vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn);',
        o.vmain || ''
      ].join('\n'));
      var fs = 'varying vec3 vWP; varying vec3 vWN;\n' + LIGHT_GLSL + '\n' + DETAIL_GLSL + '\n' + (o.fhead || '') + sh.fragmentShader;
      if (o.color) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.color);
      if (o.rough) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + o.rough);
      if (o.normal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + o.normal);
      fs = fs.replace('#include <tonemapping_fragment>', (o.pre || '') + '\n gl_FragColor.rgb += diffuseColor.rgb * nightLight(vWP, normalize(vWN));\n' + (o.post || '') + '\n#include <tonemapping_fragment>');
      sh.fragmentShader = fs;
    };
    mat.customProgramCacheKey = function () { return 'lit-' + (o.key || ''); };
    return mat;
  }

  /* ==========================================================
     WORLD DATA
     x runs east, z runs south, y is up, in metres from the Hobart GPO.
     ========================================================== */
  var HALF = 30720, CELL = 40, DN = 1537, RADIUS = 30000;
  var DEM = null, GRC = null;                /* heights and ground colour at 40 m */
  var LN = 3073, LT = null, LW = null;       /* tree cover 0..15 and water at 20 m */
  function demH(x, z) {
    var fx = clamp((x + HALF) / CELL, 0, DN - 1.001), fz = clamp((z + HALF) / CELL, 0, DN - 1.001);
    var ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * DN + ix;
    return (DEM[k] * (1 - tx) + DEM[k + 1] * tx) * (1 - tz) + (DEM[k + DN] * (1 - tx) + DEM[k + DN + 1] * tx) * tz;
  }
  function landAt(arr, x, z) {
    var ix = clamp(Math.round((x + HALF) / 20), 0, LN - 1), iz = clamp(Math.round((z + HALF) / 20), 0, LN - 1);
    return arr[iz * LN + ix];
  }
  function treeCover(x, z) {
    var fx = clamp((x + HALF) / 20, 0, LN - 1.001), fz = clamp((z + HALF) / 20, 0, LN - 1.001);
    var ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * LN + ix;
    return ((LT[k] * (1 - tx) + LT[k + 1] * tx) * (1 - tz) + (LT[k + LN] * (1 - tx) + LT[k + LN + 1] * tx) * tz) / 15;
  }
  var S2L = new Float32Array(256);
  for (var si = 0; si < 256; si++) S2L[si] = Math.pow(si / 255, 2.2);
  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Could not load ' + url)); };
      im.src = url;
    });
  }
  function pixels(im) {
    var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    var g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  }
  function decodeLand(dem, land, ground) {
    var d = new Uint16Array(dem), n = DN * DN, i;
    DEM = new Float32Array(n);
    for (i = 0; i < n; i++) DEM[i] = d[i] / 4 - 500;
    var l = new Uint8Array(land), m = LN * LN;
    LT = new Uint8Array(m); LW = new Uint8Array(m);
    for (i = 0; i < m; i++) { LT[i] = l[i] & 15; LW[i] = l[i] >> 4; }
    /* shoreline from the satellite water mask: water cells drop below the sea, land stays above it */
    for (var j = 0; j < DN; j++) for (i = 0; i < DN; i++) {
      var k = j * DN + i, w = LW[(j * 2) * LN + i * 2];
      if (w) DEM[k] = Math.min(DEM[k], -3); else if (DEM[k] < 0.9) DEM[k] = 0.9;
    }
    var g = pixels(ground);
    GRC = new Uint8Array(n * 3);
    for (i = 0; i < n; i++) { GRC[i * 3] = g[i * 4]; GRC[i * 3 + 1] = g[i * 4 + 1]; GRC[i * 3 + 2] = g[i * 4 + 2]; }
  }
  /* the street and building data travel as the bytes of an image, three per pixel, length first */
  function imageBytes(im) {
    var d = pixels(im), n = d.length / 4, raw = new Uint8Array(n * 3);
    for (var i = 0, j = 0; i < n; i++) { raw[j++] = d[i * 4]; raw[j++] = d[i * 4 + 1]; raw[j++] = d[i * 4 + 2]; }
    var len = raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24);
    return raw.buffer.slice(4, 4 + len);
  }
  function unpack(buf) {
    var dv = new DataView(buf), hl = dv.getUint32(0, true);
    var hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl;
    var T = { uint8: Uint8Array, uint16: Uint16Array, int16: Int16Array, uint32: Uint32Array, int32: Int32Array };
    hdr.get = function (n) { var s = hdr.sec[n]; return new T[s[2]](buf, base + s[0], s[1]); };
    return hdr;
  }

  /* ---------- road network ---------- */
  var NE, NV, EA, EB, EW, ECL, EF, ESP, ENM, NAMES, ESW;   /* per edge */
  var ES, PX, PZ, PH, PL, PE, PNX, PNZ, PB;                /* per point */
  var VX, VZ, VH, VR, VAS, VAI, VTRIM;                     /* per junction */
  var GC = 64, GN = 960, CS, CI;
  var SPACING = 8, SWW = 2.2, KERB = 0.13;
  var SIGRAW, TREERAW;
  function parseRoads(buf) {
    var hdr = unpack(buf);
    NE = hdr.E; NV = hdr.V; NAMES = hdr.names;
    EA = hdr.get('A'); EB = hdr.get('B');
    var P0 = hdr.get('P0'), X0 = hdr.get('X0'), Z0 = hdr.get('Z0'), D = hdr.get('D'), NP = hdr.get('NP');
    ENM = hdr.get('NM'); EW = new Float32Array(NE); ECL = hdr.get('C'); EF = hdr.get('F'); ESP = hdr.get('S');
    SIGRAW = hdr.get('SG'); TREERAW = hdr.get('TR');
    var W = hdr.get('W'), e, j, total = 0;
    for (e = 0; e < NE; e++) {
      EW[e] = W[e] / 10;
      var k = P0[e] * 2; total++;
      for (j = 1; j < NP[e]; j++, k += 2) total += Math.max(1, Math.ceil(Math.hypot(D[k], D[k + 1]) / 10 / SPACING));
    }
    PX = new Float32Array(total); PZ = new Float32Array(total); PH = new Float32Array(total); PL = new Float32Array(total);
    PNX = new Float32Array(total); PNZ = new Float32Array(total); PE = new Uint16Array(total); PB = new Uint8Array(total);
    ES = new Uint32Array(NE + 1);
    VX = new Float32Array(NV); VZ = new Float32Array(NV); VH = new Float32Array(NV); VR = new Float32Array(NV); VTRIM = new Float32Array(NV);
    var p = 0;
    for (e = 0; e < NE; e++) {
      ES[e] = p;
      var x = X0[e] / 10, z = Z0[e] / 10, len = 0, kk = P0[e] * 2;
      PX[p] = x; PZ[p] = z; PL[p] = 0; PE[p] = e; p++;
      for (j = 1; j < NP[e]; j++, kk += 2) {
        var dx = D[kk] / 10, dz = D[kk + 1] / 10, sl = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(sl / SPACING));
        for (var s = 1; s <= n; s++) { PX[p] = x + dx * s / n; PZ[p] = z + dz * s / n; PL[p] = len + sl * s / n; PE[p] = e; p++; }
        x += dx; z += dz; len += sl;
      }
      VX[EA[e]] = PX[ES[e]]; VZ[EA[e]] = PZ[ES[e]]; VX[EB[e]] = x; VZ[EB[e]] = z;
      VR[EA[e]] = Math.max(VR[EA[e]], EW[e] / 2); VR[EB[e]] = Math.max(VR[EB[e]], EW[e] / 2);
    }
    ES[NE] = p;
    for (e = 0; e < NE; e++) {
      var a = ES[e], b = ES[e + 1] - 1;
      for (var i = a; i <= b; i++) {
        var i0 = Math.max(a, i - 1), i1 = Math.min(b, i + 1), tx = PX[i1] - PX[i0], tz = PZ[i1] - PZ[i0], l = Math.hypot(tx, tz) || 1;
        PNX[i] = tz / l; PNZ[i] = -tx / l;
      }
    }
    var deg = new Uint32Array(NV + 1);
    for (e = 0; e < NE; e++) { deg[EA[e] + 1]++; deg[EB[e] + 1]++; }
    for (var v = 0; v < NV; v++) deg[v + 1] += deg[v];
    VAS = deg; VAI = new Uint32Array(NE * 2);
    var fill = new Uint32Array(NV);
    for (e = 0; e < NE; e++) { VAI[VAS[EA[e]] + fill[EA[e]]++] = e * 2; VAI[VAS[EB[e]] + fill[EB[e]]++] = e * 2 + 1; }
    /* how far footpaths stop short of a junction */
    for (v = 0; v < NV; v++) {
      var dg = VAS[v + 1] - VAS[v];
      if (dg < 3) continue;
      var w1 = 0, w2 = 0;
      for (i = VAS[v]; i < VAS[v + 1]; i++) { var ww = EW[VAI[i] >> 1]; if (ww > w1) { w2 = w1; w1 = ww; } else if (ww > w2) w2 = ww; }
      VTRIM[v] = w1 / 2 + SWW + 2.5;
      VR[v] = Math.max(VR[v], w2 / 2 + 1.2);
    }
  }
  /* Heights: sample the terrain, smooth along each road, average where roads overlap, then span bridges. */
  /* Road heights: sample the terrain, then smooth over the whole network (across junctions too) so
     roads run in long even grades with no bumps. Bridges count as straight spans while smoothing. */
  function smoothNet(iters) {
    var e, i, v, it, a, b, sum = new Float32Array(NV), cnt = new Uint16Array(NV), tmp = new Float32Array(4096);
    for (it = 0; it < iters; it++) {
      sum.fill(0); cnt.fill(0);
      for (e = 0; e < NE; e++) {
        a = ES[e]; b = ES[e + 1] - 1;
        PH[a] = VH[EA[e]]; PH[b] = VH[EB[e]];
        if (EF[e] & 2) {
          var L = PL[b] || 1;
          for (i = a + 1; i < b; i++) PH[i] = PH[a] + (PH[b] - PH[a]) * PL[i] / L;
        } else {
          if (b - a + 1 > tmp.length) tmp = new Float32Array(b - a + 1);
          for (i = a + 1; i < b; i++) {
            /* pull each point toward the straight line through its neighbours, weighted by real distance */
            var l1 = PL[i] - PL[i - 1], l2 = PL[i + 1] - PL[i], line = (PH[i - 1] * l2 + PH[i + 1] * l1) / (l1 + l2 || 1);
            tmp[i - a] = 0.5 * PH[i] + 0.5 * line;
          }
          for (i = a + 1; i < b; i++) PH[i] = tmp[i - a];
        }
        /* a junction looks one step (about 8 m) along each of its roads */
        var na = b > a ? PH[a + 1] : PH[b], nb = b > a ? PH[b - 1] : PH[a];
        sum[EA[e]] += na; cnt[EA[e]]++; sum[EB[e]] += nb; cnt[EB[e]]++;
      }
      for (v = 0; v < NV; v++) if (cnt[v]) VH[v] = 0.5 * VH[v] + 0.5 * sum[v] / cnt[v];
    }
    for (e = 0; e < NE; e++) { PH[ES[e]] = VH[EA[e]]; PH[ES[e + 1] - 1] = VH[EB[e]]; }
  }
  /* smooth each road by real distance along it: a Gaussian on its offset from a straight ramp between its two junctions */
  function gaussEdges(sigma) {
    var dv = new Float32Array(4096), out = new Float32Array(4096), R = sigma * 3, k2 = 1 / (2 * sigma * sigma);
    for (var e = 0; e < NE; e++) {
      if (EF[e] & 2) continue;
      var a = ES[e], b = ES[e + 1] - 1, n = b - a + 1, L = PL[b] || 1, i, j;
      if (n < 3) continue;
      if (n > dv.length) { dv = new Float32Array(n); out = new Float32Array(n); }
      for (i = 0; i < n; i++) dv[i] = PH[a + i] - (PH[a] + (PH[b] - PH[a]) * PL[a + i] / L);
      var j0 = 0, j1 = 0;
      for (i = 1; i < n - 1; i++) {
        var s = PL[a + i];
        while (PL[a + j0] < s - R) j0++;
        while (j1 < n - 1 && PL[a + j1 + 1] <= s + R) j1++;
        var ws = 0, vs = 0;
        for (j = j0; j <= j1; j++) {
          var ds = PL[a + j] - s, len = 0.5 * ((j < n - 1 ? PL[a + j + 1] : PL[a + j]) - (j > 0 ? PL[a + j - 1] : PL[a + j]));
          var w = Math.exp(-ds * ds * k2) * len;
          ws += w; vs += w * dv[j];
        }
        /* near the ends, the missing part of the window counts as zero offset, so ends stay at the junction height */
        var miss = Math.max(0, R - s) + Math.max(0, s + R - L);
        out[i] = vs / (ws + miss * 0.4 + 1e-6);
      }
      for (i = 1; i < n - 1; i++) PH[a + i] = PH[a] + (PH[b] - PH[a]) * PL[a + i] / L + out[i];
    }
  }
  function roadHeights() {
    var i, v;
    for (i = 0; i < PH.length; i++) PH[i] = Math.max(1.2, demH(PX[i], PZ[i]));
    for (v = 0; v < NV; v++) VH[v] = Math.max(1.2, demH(VX[v], VZ[v]));
    smoothNet(120);
    gaussEdges(22);
  }
  function bridges() {
    var e, i, v, it, a, b;
    var inner = [];
    for (v = 0; v < NV; v++) {
      var all = VAS[v + 1] - VAS[v] >= 2;
      for (i = VAS[v]; i < VAS[v + 1] && all; i++) if (!(EF[VAI[i] >> 1] & 2)) all = false;
      if (all) inner.push(v);
    }
    for (it = 0; it < 400 && inner.length; it++) {
      for (var q = 0; q < inner.length; q++) {
        v = inner[q]; var ws = 0, hs = 0;
        for (i = VAS[v]; i < VAS[v + 1]; i++) {
          e = VAI[i] >> 1; var o = (VAI[i] & 1) ? EA[e] : EB[e], w = 1 / Math.max(1, PL[ES[e + 1] - 1]);
          ws += w; hs += w * VH[o];
        }
        VH[v] = hs / ws;
      }
    }
    for (e = 0; e < NE; e++) {
      a = ES[e]; b = ES[e + 1] - 1;
      PH[a] = VH[EA[e]]; PH[b] = VH[EB[e]];
      if (EF[e] & 2) {
        var L = PL[b] || 1, lift = Math.min(18, L * 0.04);
        for (i = a; i <= b; i++) {
          var f = PL[i] / L;
          PH[i] = Math.max(4, PH[a] + (PH[b] - PH[a]) * f + lift * 4 * f * (1 - f));
          if (PH[i] - demH(PX[i], PZ[i]) > 2.5) PB[i] = 1;
        }
      }
    }
  }
  /* where two roads overlap (dual carriageways, merges, odd junctions) give them the middle height */
  function averageOverlaps() {
    var nh = new Float32Array(PH.length);
    for (var pass = 0; pass < 1; pass++) {
      for (var i = 0; i < PX.length; i++) {
        var e = PE[i]; nh[i] = PH[i];
        if (PB[i] || i === ES[e] || i === ES[e + 1] - 1) continue;
        var x = PX[i], z = PZ[i], cx = ((x + HALF) / GC) | 0, cz = ((z + HALF) / GC) | 0, c = cz * GN + cx;
        if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
        var s = PH[i] * 2, w = 2;
        for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
          var j = CI[k], f = PE[j];
          if (f === e || PB[j] || PB[j + 1]) continue;
          var ax = PX[j], az = PZ[j], dx = PX[j + 1] - ax, dz = PZ[j + 1] - az;
          var t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
          var ex = ax + dx * t - x, ez = az + dz * t - z, d = Math.sqrt(ex * ex + ez * ez), reach = (EW[e] + EW[f]) * 0.5 + 1;
          if (d > reach) continue;
          var h = PH[j] + (PH[j + 1] - PH[j]) * t;
          if (Math.abs(h - PH[i]) > 4) continue;
          var ww = 1 - d / reach; s += h * ww; w += ww;
        }
        nh[i] = s / w;
      }
      PH.set(nh);
    }
  }
  function buildIndex() {
    var cnt = new Uint32Array(GN * GN + 1), e, i, pass;
    function cellOf(v) { return clamp(((v + HALF) / GC) | 0, 0, GN - 1); }
    for (pass = 0; pass < 2; pass++) {
      for (e = 0; e < NE; e++) {
        for (i = ES[e]; i < ES[e + 1] - 1; i++) {
          var x0 = cellOf(Math.min(PX[i], PX[i + 1]) - 6), x1 = cellOf(Math.max(PX[i], PX[i + 1]) + 6);
          var z0 = cellOf(Math.min(PZ[i], PZ[i + 1]) - 6), z1 = cellOf(Math.max(PZ[i], PZ[i + 1]) + 6);
          for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
            var c = cz * GN + cx;
            if (pass === 0) cnt[c + 1]++; else CI[CS[c] + cnt[c]++] = i;
          }
        }
      }
      if (pass === 0) {
        for (i = 0; i < GN * GN; i++) cnt[i + 1] += cnt[i];
        CS = cnt; CI = new Uint32Array(CS[GN * GN]); cnt = new Uint32Array(GN * GN);
      }
    }
  }
  var Q = { d: 0, i: 0, t: 0, h: 0, e: 0 };
  function nearRoad(x, z, r, mode, skipE) {
    var best = r * r, found = false;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k];
        if (mode === 1 && (PB[i] || PB[i + 1])) continue;
        if (skipE !== undefined && PE[i] === skipE) continue;
        var ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
        var t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
        if (d2 < best) { best = d2; Q.i = i; Q.t = t; found = true; }
      }
    }
    if (found) { Q.d = Math.sqrt(best); Q.e = PE[Q.i]; Q.h = PH[Q.i] + (PH[Q.i + 1] - PH[Q.i]) * Q.t; }
    return found;
  }
  /* is (x,z) on some road's carriageway or footpath? (used to keep trees, houses and lamps off roads) */
  function onRoadArea(x, z, pad) {
    var cx = ((x + HALF) / GC) | 0, cz = ((z + HALF) / GC) | 0;
    if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) return false;
    var c = cz * GN + cx;
    for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
      var i = CI[k], e = PE[i], ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
      var t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      var ex = ax + dx * t - x, ez = az + dz * t - z, r = EW[e] * 0.5 + (ESW[e] ? SWW : 0) + pad;
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }
  /* ground height: natural land, graded to meet nearby roads. Where several roads reach a spot the ground
     follows the most influential one, and where it lies under a roadway it takes the lowest, so it never pokes through. */
  function terrainH(x, z, cell) {
    var b = demH(x, z), r = 62, bestT = 2, bestH = b, coreH = 1e9;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    var pad = Math.max(3, 1.5 * cell);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k];
        if (PB[i] || PB[i + 1]) continue;
        var ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
        var t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ex = ax + dx * t - x, ez = az + dz * t - z, d = Math.sqrt(ex * ex + ez * ez);
        if (d > r) continue;
        var e = PE[i], h = PH[i] + (PH[i + 1] - PH[i]) * t, hw = EW[e] * 0.5;
        var hr = h - (d < hw + 0.4 ? 0.45 : ESW[e] ? 0.0 : 0.15);
        var m = hw + (ESW[e] ? SWW + 0.6 : 0) + pad, B = Math.min(clamp(2.5 * Math.abs(hr - b), 5, 40), 61 - m);
        var f = sstep(m, m + B, d);
        if (f < 0.001) { if (hr < coreH) coreH = hr; }
        if (f < bestT) { bestT = f; bestH = hr + (b - hr) * f; }
      }
    }
    if (coreH < 1e8) return Math.min(coreH, bestH);
    return bestH;
  }
  var G = { onRoad: false, e: -1, surf: 0 };
  function carGround(x, z, refY) {
    var r = 9, bestS = 1e9, bh = 0, be = -1, fpS = 1e9, fpH = 0;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k], ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
        var t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ex = ax + dx * t - x, ez = az + dz * t - z, d = Math.sqrt(ex * ex + ez * ez), e = PE[i];
        var hw = EW[e] * 0.5, h = PH[i] + (PH[i + 1] - PH[i]) * t;
        if (d > hw + 0.25) {
          /* footpath: a kerb's height above the road, except where the footpath stops short of a junction */
          if (ESW[e] && !PB[i] && d < hw + SWW + 0.1) {
            var jx = PX[i] + dx * t, jz = PZ[i] + dz * t;
            if (Math.hypot(jx - VX[EA[e]], jz - VZ[EA[e]]) > VTRIM[EA[e]] && Math.hypot(jx - VX[EB[e]], jz - VZ[EB[e]]) > VTRIM[EB[e]]) {
              var sf = refY === null ? d : Math.abs(h - refY);
              if (sf < fpS) { fpS = sf; fpH = h + KERB; }
            }
          }
          continue;
        }
        var s = refY === null ? d : Math.abs(h - refY);
        if (s < bestS) { bestS = s; bh = h; be = e; }
      }
    }
    if (be >= 0 && (refY === null || bestS < 5)) { G.onRoad = true; G.e = be; G.surf = 0; return bh + 0.03; }
    G.onRoad = false; G.e = -1;
    if (fpS < 5) { G.surf = 1; return fpH; }
    G.surf = 2;
    return padAdjust(x, z, terrainH(x, z, 4));
  }
  /* flat forecourts (fuel stations): ground inside a pad is levelled to it, blending out over 8 m */
  var PADS = new Map();
  function addPad(p) {
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
      var k = clamp((((p.z + HALF) / 256) | 0) + dz, 0, 239) * 240 + clamp((((p.x + HALF) / 256) | 0) + dx, 0, 239);
      if (!PADS.has(k)) PADS.set(k, []);
      if (PADS.get(k).indexOf(p) < 0) PADS.get(k).push(p);
    }
  }
  function padAdjust(x, z, h) {
    var list = PADS.get(clamp(((z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x + HALF) / 256) | 0, 0, 239));
    if (!list) return h;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], rx = x - p.x, rz = z - p.z, u = Math.abs(rx * p.tx + rz * p.tz) - p.hl, v = Math.abs(-rx * p.tz + rz * p.tx) - p.hd;
      var d = Math.max(u, v, 0);
      if (d < 8) h = lerp(p.y - 0.06, h, sstep(0, 8, d));
    }
    return h;
  }
  function inPad(x, z, m) {
    var list = PADS.get(clamp(((z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x + HALF) / 256) | 0, 0, 239));
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      var p = list[i], rx = x - p.x, rz = z - p.z;
      if (Math.abs(rx * p.tx + rz * p.tz) < p.hl + m && Math.abs(-rx * p.tz + rz * p.tx) < p.hd + m) return true;
    }
    return false;
  }
  /* how built-up each 256 m square is */
  var URB = null;
  function buildUrban() {
    var raw = new Float32Array(240 * 240), i, j;
    for (i = 0; i < PX.length; i++) if (ECL[PE[i]] >= 6) raw[clamp(((PZ[i] + HALF) / 256) | 0, 0, 239) * 240 + clamp(((PX[i] + HALF) / 256) | 0, 0, 239)] += SPACING / 10;
    URB = new Float32Array(240 * 240);
    for (j = 1; j < 239; j++) for (i = 1; i < 239; i++) {
      var s = 0;
      for (var b = -1; b <= 1; b++) for (var a = -1; a <= 1; a++) s += raw[(j + b) * 240 + i + a];
      URB[j * 240 + i] = s;
    }
    ESW = new Uint8Array(NE);
    for (var e = 0; e < NE; e++) {
      var mid = (ES[e] + ES[e + 1]) >> 1, u = URB[clamp(((PZ[mid] + HALF) / 256) | 0, 0, 239) * 240 + clamp(((PX[mid] + HALF) / 256) | 0, 0, 239)];
      var cl = ECL[e], f = EF[e];
      var want = (f & 32) || (u >= 40 && cl >= 2 && !(f & (2 | 4 | 8)) && !(cl <= 3 && (f & 1) && u < 90));
      if (f & 64) want = false;
      ESW[e] = want ? 1 : 0;
    }
  }
  function urbanAt(x, z) { return URB[clamp(((z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x + HALF) / 256) | 0, 0, 239)]; }
