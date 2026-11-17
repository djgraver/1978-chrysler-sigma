(function () {
  'use strict';
  var THREE = window.THREE;
  function $(id) { return document.getElementById(id); }
  var stage = $('stage'), canvas = $('gl'), loadEl = $('loading'), loadMsg = $('loadmsg');
  if (!THREE) { loadMsg.textContent = 'The 3D engine could not load.'; return; }
  function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash(a, b, c) {
    var h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var SKY = '#b9d0e4';
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(C(SKY), 700, 16000);
  var camera = new THREE.PerspectiveCamera(55, 1, 0.3, 46000);

  (function () {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#8fa9c4'); grad.addColorStop(0.46, '#e6edf3'); grad.addColorStop(0.5, '#6b6f72'); grad.addColorStop(1, '#2a2c2e');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#ffffff';
    [[90, 70, 200, 60], [400, 40, 240, 50], [740, 80, 220, 60], [560, 180, 120, 30], [940, 160, 80, 40], [250, 180, 90, 30]].forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
    var tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.encoding = THREE.sRGBEncoding;
    var pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(tex).texture;
    tex.dispose(); pm.dispose();
  })();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x77705f, 0.85));
  var SUN = new THREE.Vector3(0.45, 0.80, -0.40).normalize();     /* the sun sits to the north here */
  var sun = new THREE.DirectionalLight(0xfff4e2, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90; sun.shadow.bias = -0.0008;
  scene.add(sun); scene.add(sun.target);

  /*SIGMA*/

  /* ==========================================================
     WORLD DATA
     x runs east, z runs south, y is up, in metres from Hobart GPO.
     ========================================================== */
  var HALF = 30720, CELL = 40, DN = 1537, RADIUS = 30000;
  var DEM = null;
  function demH(x, z) {
    var fx = clamp((x + HALF) / CELL, 0, DN - 1.001), fz = clamp((z + HALF) / CELL, 0, DN - 1.001);
    var ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * DN + ix;
    return (DEM[k] * (1 - tx) + DEM[k + 1] * tx) * (1 - tz) + (DEM[k + DN] * (1 - tx) + DEM[k + DN + 1] * tx) * tz;
  }
  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Could not load ' + url)); };
      im.src = url;
    });
  }
  function decodeDem(im) {
    var c = document.createElement('canvas'); c.width = DN; c.height = DN;
    var g = c.getContext('2d'); g.drawImage(im, 0, 0);
    var d = g.getImageData(0, 0, DN, DN).data;
    DEM = new Float32Array(DN * DN);
    for (var i = 0, n = DN * DN; i < n; i++) { var h = ((d[i * 4] << 8) | d[i * 4 + 1]) / 4 - 500; DEM[i] = h < 0.6 ? -5 : h; }   /* sea level cells become river bed */
  }

  /* the street data travels as the bytes of an image, three per pixel, with its length in the first four */
  function imageBytes(im) {
    var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    var g = c.getContext('2d'); g.drawImage(im, 0, 0);
    var d = g.getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, raw = new Uint8Array(n * 3);
    for (var i = 0, j = 0; i < n; i++) { raw[j++] = d[i * 4]; raw[j++] = d[i * 4 + 1]; raw[j++] = d[i * 4 + 2]; }
    var len = raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24);
    return raw.buffer.slice(4, 4 + len);
  }
  /* ---------- road network ---------- */
  var NE, NV, EA, EB, EW, ECL, EF, ESP, ENM, NAMES;      /* per edge */
  var ES, PX, PZ, PH, PL, PE, PNX, PNZ, PB;              /* per point */
  var VX, VZ, VH, VR, VAS, VAI;                          /* per junction */
  var GC = 64, GN = 960, CS, CI;                         /* 64 m lookup grid of road segments */
  var SPACING = 10;
  function parseRoads(buf) {
    var dv = new DataView(buf), hl = dv.getUint32(0, true);
    var hdr = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl;
    function sec(n, T) { var s = hdr.sec[n]; return new T(buf, base + s[0], s[1]); }
    NE = hdr.E; NV = hdr.V; NAMES = hdr.names;
    EA = sec('A', Uint32Array); EB = sec('B', Uint32Array);
    var P0 = sec('P0', Uint32Array), X0 = sec('X0', Int32Array), Z0 = sec('Z0', Int32Array), D = sec('D', Int16Array), NP = sec('NP', Uint16Array);
    ENM = sec('NM', Uint16Array); EW = new Float32Array(NE); ECL = sec('C', Uint8Array); EF = sec('F', Uint8Array); ESP = sec('S', Uint8Array);
    var W = sec('W', Uint8Array), e, j, total = 0;
    /* first pass: count points after resampling to at most SPACING metres */
    for (e = 0; e < NE; e++) {
      EW[e] = W[e] / 10;
      var k = P0[e] * 2; total++;
      for (j = 1; j < NP[e]; j++, k += 2) total += Math.max(1, Math.ceil(Math.hypot(D[k], D[k + 1]) / 10 / SPACING));
    }
    PX = new Float32Array(total); PZ = new Float32Array(total); PH = new Float32Array(total); PL = new Float32Array(total);
    PNX = new Float32Array(total); PNZ = new Float32Array(total); PE = new Uint16Array(total); PB = new Uint8Array(total);
    ES = new Uint32Array(NE + 1);
    VX = new Float32Array(NV); VZ = new Float32Array(NV); VH = new Float32Array(NV); VR = new Float32Array(NV);
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
    /* side normals for the road ribbons */
    for (e = 0; e < NE; e++) {
      var a = ES[e], b = ES[e + 1] - 1;
      for (var i = a; i <= b; i++) {
        var i0 = Math.max(a, i - 1), i1 = Math.min(b, i + 1), tx = PX[i1] - PX[i0], tz = PZ[i1] - PZ[i0], l = Math.hypot(tx, tz) || 1;
        PNX[i] = tz / l; PNZ[i] = -tx / l;                      /* points to the left of travel */
      }
    }
    /* junction adjacency */
    var deg = new Uint32Array(NV + 1);
    for (e = 0; e < NE; e++) { deg[EA[e] + 1]++; deg[EB[e] + 1]++; }
    for (var v = 0; v < NV; v++) deg[v + 1] += deg[v];
    VAS = deg; VAI = new Uint32Array(NE * 2);
    var fill = new Uint32Array(NV);
    for (e = 0; e < NE; e++) { VAI[VAS[EA[e]] + fill[EA[e]]++] = e * 2; VAI[VAS[EB[e]] + fill[EB[e]]++] = e * 2 + 1; }
  }
  /* Heights: sample the terrain, smooth along each road, then span bridges between their abutments. */
  function roadHeights() {
    var e, i, v, it, a, b;
    for (i = 0; i < PH.length; i++) PH[i] = Math.max(1.2, demH(PX[i], PZ[i]));
    for (v = 0; v < NV; v++) VH[v] = Math.max(1.2, demH(VX[v], VZ[v]));
    var sum = new Float32Array(NV), cnt = new Uint16Array(NV), tmp = new Float32Array(1024);
    for (it = 0; it < 10; it++) {
      sum.fill(0); cnt.fill(0);
      for (e = 0; e < NE; e++) {
        a = ES[e]; b = ES[e + 1] - 1;
        PH[a] = VH[EA[e]]; PH[b] = VH[EB[e]];
        if (b - a + 1 > tmp.length) tmp = new Float32Array(b - a + 1);
        for (i = a + 1; i < b; i++) tmp[i - a] = 0.25 * PH[i - 1] + 0.5 * PH[i] + 0.25 * PH[i + 1];
        for (i = a + 1; i < b; i++) PH[i] = tmp[i - a];
        sum[EA[e]] += PH[a + 1]; cnt[EA[e]]++; sum[EB[e]] += PH[b - 1]; cnt[EB[e]]++;
      }
      for (v = 0; v < NV; v++) if (cnt[v]) VH[v] = 0.5 * VH[v] + 0.5 * sum[v] / cnt[v];
    }
    /* bridges: junctions that only touch bridge spans float between the banks */
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
        var L = PL[b] || 1;
        for (i = a; i <= b; i++) {
          PH[i] = Math.max(4, PH[a] + (PH[b] - PH[a]) * PL[i] / L);
          if (PH[i] - demH(PX[i], PZ[i]) > 2.5) PB[i] = 1;      /* deck is clear of the ground */
        }
      }
    }
  }
  function buildIndex() {
    var n = PX.length, cnt = new Uint32Array(GN * GN + 1), e, i, pass;
    function cellOf(v) { return clamp(((v + HALF) / GC) | 0, 0, GN - 1); }
    for (pass = 0; pass < 2; pass++) {
      for (e = 0; e < NE; e++) {
        for (i = ES[e]; i < ES[e + 1] - 1; i++) {
          var x0 = cellOf(Math.min(PX[i], PX[i + 1])), x1 = cellOf(Math.max(PX[i], PX[i + 1]));
          var z0 = cellOf(Math.min(PZ[i], PZ[i + 1])), z1 = cellOf(Math.max(PZ[i], PZ[i + 1]));
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
  /* how built-up each 256 m square is: residential street segments in it and its neighbours */
  var URB = null;
  function buildUrban() {
    var raw = new Float32Array(240 * 240), i, j;
    for (i = 0; i < PX.length; i++) if (ECL[PE[i]] >= 6) raw[clamp(((PZ[i] + HALF) / 256) | 0, 0, 239) * 240 + clamp(((PX[i] + HALF) / 256) | 0, 0, 239)]++;
    URB = new Float32Array(240 * 240);
    for (j = 1; j < 239; j++) for (i = 1; i < 239; i++) {
      var s = 0;
      for (var b = -1; b <= 1; b++) for (var a = -1; a <= 1; a++) s += raw[(j + b) * 240 + i + a];
      URB[j * 240 + i] = s;
    }
  }
  /* nearest road segment within r (r <= 64). mode 1 ignores raised bridge decks. Result in Q. */
  var Q = { d: 0, i: 0, t: 0, h: 0, e: 0 };
  function nearRoad(x, z, r, mode) {
    var cx = ((x + HALF) / GC) | 0, cz = ((z + HALF) / GC) | 0, best = r * r, found = false;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    for (cz = z0; cz <= z1; cz++) for (cx = x0; cx <= x1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k];
        if (mode === 1 && (PB[i] || PB[i + 1])) continue;
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
  /* ground height with the land graded to meet nearby roads; cell is the mesh spacing that will draw it */
  function terrainH(x, z, cell) {
    var b = demH(x, z);
    if (!nearRoad(x, z, 62, 1)) return b;
    var m = EW[Q.e] * 0.5 + Math.max(3, 1.5 * cell), hr = Q.h - 0.15;
    var B = Math.min(clamp(2.5 * Math.abs(hr - b), 5, 40), 61 - m);
    var t = sstep(m, m + B, Q.d);
    return hr + (b - hr) * t;
  }
  /* what the car stands on: a road surface near its own level if there is one, else the graded land */
  var G = { onRoad: false, e: -1 };
  function carGround(x, z, refY) {
    var r = 9, bestS = 1e9, bh = 0, be = -1;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k], ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
        var t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ex = ax + dx * t - x, ez = az + dz * t - z, d = Math.sqrt(ex * ex + ez * ez), e = PE[i];
        if (d > EW[e] * 0.5 + 0.5) continue;
        var h = PH[i] + (PH[i + 1] - PH[i]) * t, s = refY === null ? d : Math.abs(h - refY);
        if (s < bestS) { bestS = s; bh = h; be = e; }
      }
    }
    if (be >= 0 && (refY === null || bestS < 5)) { G.onRoad = true; G.e = be; return bh + 0.03; }
    G.onRoad = false; G.e = -1;
    return terrainH(x, z, 4);
  }

  /* ==========================================================
     TERRAIN, ROADS AND BUILDINGS, BUILT IN TILES AROUND THE CAR
     ========================================================== */
  var world = new THREE.Group(); scene.add(world);
  var landMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  var builtMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  var roadMat = (function () {
    var c = document.createElement('canvas'); c.width = 256; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#3d3f42'; g.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 2600; i++) {
      var s = Math.random(); g.fillStyle = s < 0.5 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.03)';
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.fillStyle = '#d9dbd6';
    g.fillRect(7, 0, 3, 256); g.fillRect(118, 0, 3, 256);       /* edge lines, left half only */
    g.fillRect(62, 0, 3, 64);                                    /* 3 m dash every 12 m */
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return new THREE.MeshLambertMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  })();
  var water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.4, HALF * 2.4), new THREE.MeshLambertMaterial({ color: C('#3f6f8f') }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0; scene.add(water);

  var SIZE = [4096, 1024, 256];
  var cLow = C('#8e9463'), cDry = C('#a39a66'), cBush = C('#4d6a40'), cRock = C('#8b877b'), cSand = C('#b8ab87'), cAlp = C('#7d8468');
  var tc = new THREE.Color();
  function landColour(x, z, h, slope) {
    var n = hash(Math.round(x / 4), Math.round(z / 4), 7), n2 = hash(Math.round(x / 90), Math.round(z / 90), 3);
    if (h < 1.0) tc.copy(cSand);
    else {
      tc.copy(cLow).lerp(cDry, n2 * 0.7);
      tc.lerp(cBush, sstep(60, 320, h + n2 * 120));
      tc.lerp(cAlp, sstep(850, 1050, h));
      tc.lerp(cRock, clamp(sstep(0.45, 0.9, slope) + sstep(1100, 1250, h) * 0.7, 0, 1));
    }
    var k = 0.92 + n * 0.16;
    tc.r *= k; tc.g *= k; tc.b *= k;
  }
  var stampP = null, stampV = null, stampId = 0;
  function buildChunk(L, ix, iz, hi) {
    var size = SIZE[L], n = (L === 2 && hi) ? 64 : 16, cell = size / n, x0 = -HALF + ix * size, z0 = -HALF + iz * size;
    var group = new THREE.Group(), m = n + 3, hs = new Float32Array(m * m), i, j;
    var cx0 = clamp(((x0 - 64 + HALF) / GC) | 0, 0, GN - 1), cx1 = clamp(((x0 + size + 64 + HALF) / GC) | 0, 0, GN - 1);
    var cz0 = clamp(((z0 - 64 + HALF) / GC) | 0, 0, GN - 1), cz1 = clamp(((z0 + size + 64 + HALF) / GC) | 0, 0, GN - 1);
    var hasRoad = false;
    if (L === 2) for (j = cz0; j <= cz1 && !hasRoad; j++) for (i = cx0; i <= cx1; i++) if (CS[j * GN + i + 1] > CS[j * GN + i]) { hasRoad = true; break; }
    for (j = 0; j < m; j++) for (i = 0; i < m; i++) {
      var x = x0 + (i - 1) * cell, z = z0 + (j - 1) * cell;
      hs[j * m + i] = hasRoad ? terrainH(x, z, cell) : demH(x, z);
    }
    var nv = (n + 1) * (n + 1), ns = 4 * (n + 1), pos = new Float32Array((nv + ns) * 3), nor = new Float32Array((nv + ns) * 3), col = new Float32Array((nv + ns) * 3);
    var idx = [], k = 0, skirt = cell * 0.8 + 2;
    for (j = 0; j <= n; j++) for (i = 0; i <= n; i++, k++) {
      var c = (j + 1) * m + i + 1, h = hs[c];
      var nx = hs[c - 1] - hs[c + 1], nz = hs[c - m] - hs[c + m], ny = 2 * cell, l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      pos[k * 3] = x0 + i * cell; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z0 + j * cell;
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      landColour(pos[k * 3], pos[k * 3 + 2], h, Math.sqrt(nx * nx + nz * nz) / ny);
      col[k * 3] = tc.r; col[k * 3 + 1] = tc.g; col[k * 3 + 2] = tc.b;
    }
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) { var a = j * (n + 1) + i, b = a + 1, c2 = a + n + 1, d = c2 + 1; idx.push(a, c2, b, b, c2, d); }
    /* skirts hide the seams between tiles of different detail */
    function skirtRun(get, flip) {
      var s0 = k;
      for (var q = 0; q <= n; q++, k++) {
        var src = get(q);
        pos[k * 3] = pos[src * 3]; pos[k * 3 + 1] = pos[src * 3 + 1] - skirt; pos[k * 3 + 2] = pos[src * 3 + 2];
        nor[k * 3] = nor[src * 3]; nor[k * 3 + 1] = nor[src * 3 + 1]; nor[k * 3 + 2] = nor[src * 3 + 2];
        col[k * 3] = col[src * 3]; col[k * 3 + 1] = col[src * 3 + 1]; col[k * 3 + 2] = col[src * 3 + 2];
        if (q < n) { var a = get(q), b = get(q + 1), c = s0 + q, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
      }
    }
    skirtRun(function (q) { return q; }, false);
    skirtRun(function (q) { return n * (n + 1) + q; }, true);
    skirtRun(function (q) { return q * (n + 1); }, true);
    skirtRun(function (q) { return q * (n + 1) + n; }, false);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    var land = new THREE.Mesh(geo, landMat);
    land.receiveShadow = L === 2 && hi;
    group.add(land);
    if (L >= 1 && (L === 1 || hasRoad)) buildRoads(group, L, hi, x0, z0, size, cx0, cx1, cz0, cz1);
    return group;
  }
  function buildRoads(group, L, hi, x0, z0, size, cx0, cx1, cz0, cz1) {
    var pos = [], uv = [], idx = [], bp = [], bc = [], bn = [], bi = [], x1 = x0 + size, z1 = z0 + size;
    var lift = L === 1 ? 1.6 : hi ? 0.0 : 0.22, wide = L === 1 ? 1.6 : 1, maxClass = L === 1 ? 3 : 9, id = ++stampId;
    function inside(x, z) { return x >= x0 && x < x1 && z >= z0 && z < z1; }
    function disc(v) {
      if (stampV[v] === id || !inside(VX[v], VZ[v])) return;
      stampV[v] = id;
      var r = VR[v] * wide, b = pos.length / 3, y = VH[v] + lift + 0.012;
      pos.push(VX[v], y, VZ[v]); uv.push(0.75, 0.5);
      for (var q = 0; q < 10; q++) { var a = q * Math.PI / 5; pos.push(VX[v] + Math.cos(a) * r, y, VZ[v] + Math.sin(a) * r); uv.push(0.75, 0.5); }
      for (q = 0; q < 10; q++) idx.push(b, b + 1 + (q + 1) % 10, b + 1 + q);
    }
    for (var cz = cz0; cz <= cz1; cz++) for (var cx = cx0; cx <= cx1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k], e = PE[i];
        if (stampP[i] === id || ECL[e] > maxClass) continue;
        stampP[i] = id;
        if (i === ES[e]) disc(EA[e]);
        if (i + 1 === ES[e + 1] - 1) disc(EB[e]);
        if (!inside((PX[i] + PX[i + 1]) / 2, (PZ[i] + PZ[i + 1]) / 2)) continue;
        var hw = EW[e] * 0.5 * wide, lined = ECL[e] <= 4 && !(EF[e] & 24), u0 = lined ? 0.004 : 0.55, u1 = lined ? 0.496 : 0.95;
        var b = pos.length / 3;
        for (var s = 0; s < 2; s++) {
          var p = i + s, y = PH[p] + lift;
          pos.push(PX[p] + PNX[p] * hw, y, PZ[p] + PNZ[p] * hw, PX[p] - PNX[p] * hw, y, PZ[p] - PNZ[p] * hw);
          uv.push(u0, PL[p] / 12, u1, PL[p] / 12);
        }
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        if (L === 2 && (PB[i] || PB[i + 1])) bridgeBits(i, hw, bp, bc, bn, bi);
        else if (L === 2) houses(i, e, hw, bp, bc, bn, bi);
      }
    }
    if (idx.length) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      var nrm = new Float32Array(pos.length); for (var q = 1; q < nrm.length; q += 3) nrm[q] = 1;
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setIndex(idx);
      var m = new THREE.Mesh(g, roadMat); m.receiveShadow = L === 2 && hi; group.add(m);
    }
    if (bi.length) {
      var g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      g2.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      g2.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
      g2.setIndex(bi);
      group.add(new THREE.Mesh(g2, builtMat));
    }
  }
  /* an upright box: centre, half sizes along (ux,uz) and across, base and top heights, wall and roof colours */
  function box(bp, bc, bn, bi, cx, cz, ux, uz, ha, hb, y0, y1, wall, roof) {
    var vx = -uz, vz = ux, cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], q, b;
    var P = cs.map(function (c) { return [cx + ux * ha * c[0] + vx * hb * c[1], cz + uz * ha * c[0] + vz * hb * c[1]]; });
    for (q = 0; q < 4; q++) {
      var A = P[q], B = P[(q + 1) % 4], nx = B[1] - A[1], nz = -(B[0] - A[0]), l = Math.hypot(nx, nz) || 1, sh = 0.86 + 0.14 * (q % 2);
      b = bp.length / 3;
      bp.push(A[0], y0, A[1], B[0], y0, B[1], B[0], y1, B[1], A[0], y1, A[1]);
      for (var r = 0; r < 4; r++) { bn.push(nx / l, 0, nz / l); bc.push(wall.r * sh, wall.g * sh, wall.b * sh); }
      bi.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    b = bp.length / 3;
    for (q = 0; q < 4; q++) { bp.push(P[q][0], y1, P[q][1]); bn.push(0, 1, 0); bc.push(roof.r, roof.g, roof.b); }
    bi.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  var WALLS = ['#d8d1c0', '#c9b79a', '#b9a58c', '#e4dfd3', '#a66a4f', '#8d5b45', '#cfc8b8', '#b7bcc0', '#9aa5a8', '#d9c9a8'].map(C);
  var ROOFS = ['#8e3b32', '#6f7477', '#4d5a55', '#a0483a', '#585c60', '#7a8a86', '#3f4447'].map(C);
  var GLASSY = ['#8fa3b0', '#9aa7ad', '#b3b8ba', '#7f8f9c', '#c4c1b8'].map(C);
  var cConc = C('#9a9a94'), cConcD = C('#777872');
  function houses(i, e, hw, bp, bc, bn, bi) {
    var cl = ECL[e];
    if (EF[e] & 30 || cl < 2) return;
    var mx = (PX[i] + PX[i + 1]) / 2, mz = (PZ[i] + PZ[i + 1]) / 2, rc = Math.hypot(mx, mz);
    if (rc > 2600 && URB[clamp(((mz + HALF) / 256) | 0, 0, 239) * 240 + clamp(((mx + HALF) / 256) | 0, 0, 239)] < 40) return;   /* only where streets are dense */
    var dx = PX[i + 1] - PX[i], dz = PZ[i + 1] - PZ[i], len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    dx /= len; dz /= len;
    var cbd = rc < 950, inner = rc < 2600, sp = cbd ? 26 : 19;
    for (var s = Math.ceil(PL[i] / sp) * sp; s < PL[i + 1]; s += sp) {
      var t = (s - PL[i]) / len, px = PX[i] + dx * len * t, pz = PZ[i] + dz * len * t, slot = Math.round(s / sp);
      for (var side = -1; side <= 1; side += 2) {
        var h1 = hash(e, slot, side), h2 = hash(e, slot, side + 5), h3 = hash(e, slot, side + 9), h4 = hash(e, slot, side + 13);
        if (h1 < (cbd ? 0.12 : 0.28)) continue;
        var wa = cbd ? 9 + h2 * 5 : 5 + h2 * 3.5, wb = cbd ? 8 + h3 * 6 : 4.5 + h3 * 2.5, set = hw + (cbd ? 2.5 : 5 + h4 * 5);
        var cx = px + dz * side * (set + wb), cz = pz - dx * side * (set + wb);
        var g0 = demH(cx, cz);
        if (g0 < 1.6 || Math.abs(demH(cx + dz * 6, cz - dx * 6) - demH(cx - dz * 6, cz + dx * 6)) > 5.5) continue;
        if (nearRoad(cx, cz, 40, 0) && Q.d < Math.max(wa, wb) + EW[Q.e] * 0.5 + 1.2) continue;
        var ht = cbd ? 8 + h4 * h4 * 46 : inner ? 4 + h4 * 8 : 3 + h4 * 2.6;
        var gl = cbd && ht > 22, wall = gl ? GLASSY[(h2 * GLASSY.length) | 0] : WALLS[(h2 * WALLS.length) | 0], roof = gl ? cConcD : ROOFS[(h3 * ROOFS.length) | 0];
        box(bp, bc, bn, bi, cx, cz, dx, dz, wa, wb, g0 - 2.5, g0 + ht, wall, roof);
      }
    }
  }
  function bridgeBits(i, hw, bp, bc, bn, bi) {
    var dx = PX[i + 1] - PX[i], dz = PZ[i + 1] - PZ[i], len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    dx /= len; dz /= len;
    var mx = (PX[i] + PX[i + 1]) / 2, mz = (PZ[i] + PZ[i + 1]) / 2, my = (PH[i] + PH[i + 1]) / 2;
    box(bp, bc, bn, bi, mx, mz, dx, dz, len / 2 + 0.05, hw + 0.35, my - 1.3, my - 0.04, cConc, cConc);     /* deck slab */
    for (var s = -1; s <= 1; s += 2) box(bp, bc, bn, bi, mx + dz * s * (hw + 0.2), mz - dx * s * (hw + 0.2), dx, dz, len / 2 + 0.05, 0.14, my - 0.1, my + 0.85, cConcD, cConcD);
    if (((PL[i] / SPACING) | 0) % 4 === 0) {
      var g = Math.min(demH(mx, mz), 0) - 3;
      if (my - g > 5) box(bp, bc, bn, bi, mx, mz, dx, dz, 0.9, hw * 0.8, g, my - 1.2, cConcD, cConcD);       /* pier */
    }
  }

  /* quadtree of tiles: 4 km tiles everywhere, 1 km within 2.6 km, 256 m within 600 m, 4 m detail under the car */
  var chunks = new Map(), queue = [], lastPlan = { x: 1e9, z: 1e9 }, frameNo = 0;
  function rectDist(x, z, x0, z0, s) { var dx = Math.max(x0 - x, 0, x - x0 - s), dz = Math.max(z0 - z, 0, z - z0 - s); return Math.hypot(dx, dz); }
  function want(L, ix, iz, hi, d, shown) {
    var key = L + '_' + ix + '_' + iz + (hi ? 'h' : ''), c = chunks.get(key);
    if (!c) { c = { key: key, L: L, ix: ix, iz: iz, hi: hi, group: null, d: d, used: 0 }; chunks.set(key, c); }
    c.d = d; c.used = frameNo;
    if (c.group) { shown.add(c); return true; }
    if (!c.queued) { c.queued = true; queue.push(c); }
    return false;
  }
  function plan(x, z) {
    var shown = new Set(), R = SIZE[0], i, j, a, b;
    frameNo++;
    for (var rz = 0; rz < 15; rz++) for (var rx = 0; rx < 15; rx++) {
      var x0 = -HALF + rx * R, z0 = -HALF + rz * R, d0 = rectDist(x, z, x0, z0, R);
      if (d0 >= 2600) { want(0, rx, rz, false, d0, shown); continue; }
      var rootNeeded = false;
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) {
        var ix = rx * 4 + i, iz = rz * 4 + j, x1 = -HALF + ix * 1024, z1 = -HALF + iz * 1024, d1 = rectDist(x, z, x1, z1, 1024);
        if (d1 >= 600) { if (!want(1, ix, iz, false, d1, shown)) rootNeeded = true; continue; }
        var midNeeded = false;
        for (b = 0; b < 4; b++) for (a = 0; a < 4; a++) {
          var jx = ix * 4 + a, jz = iz * 4 + b, d2 = rectDist(x, z, -HALF + jx * 256, -HALF + jz * 256, 256), hi = d2 < 110;
          if (!want(2, jx, jz, hi, d2, shown)) {
            var alt = chunks.get('2_' + jx + '_' + jz + (hi ? '' : 'h'));
            if (alt && alt.group) { alt.used = frameNo; shown.add(alt); } else midNeeded = true;
          }
        }
        if (midNeeded) { var mid = chunks.get('1_' + ix + '_' + iz); if (mid && mid.group) { mid.used = frameNo; shown.add(mid); } else rootNeeded = true; }
      }
      if (rootNeeded) { var root = chunks.get('0_' + rx + '_' + rz); if (root && root.group) { root.used = frameNo; shown.add(root); } }
    }
    chunks.forEach(function (c) {
      if (c.group) c.group.visible = shown.has(c);
      if (c.L > 0 && frameNo - c.used > 12 && chunks.size > 420) {
        if (c.group) { world.remove(c.group); c.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
        chunks.delete(c.key);
      }
    });
    queue = queue.filter(function (c) { return chunks.get(c.key) === c && frameNo - c.used < 3; });
    chunks.forEach(function (c) { if (!c.group && queue.indexOf(c) < 0) c.queued = false; });
    queue.sort(function (p, q) { return q.d - p.d; });              /* nearest last, so pop() takes it */
    lastPlan.x = x; lastPlan.z = z;
  }
  function buildSome(ms) {
    var t0 = performance.now(), n = 0;
    while (queue.length && (n === 0 || performance.now() - t0 < ms)) {
      var c = queue.pop(); c.queued = false;
      if (c.group) continue;
      c.group = buildChunk(c.L, c.ix, c.iz, c.hi); c.group.visible = false;
      world.add(c.group); n++;
    }
    return n;
  }

  /* ==========================================================
     THE CAR
     ========================================================== */
  var sigma = buildSigma();
  var carG = sigma.group; carG.rotation.order = 'YZX'; scene.add(carG);
  sigma.wheels.forEach(function (w) { w.rotation.order = 'YZX'; });
  var WB = sigma.axF - sigma.axR;
  var car = { x: 0, z: 0, y: 0, h: 0, v: 0, steer: 0, pitch: 0, roll: 0, spin: 0, onRoad: true, edge: -1 };
  var keys = {}, touch = { l: 0, r: 0, g: 0, b: 0 };
  function placeOnRoad(x, z) {
    var found = false, r;
    for (r = 60; r <= 4000 && !found; r *= 2) {
      var best = 1e18, bi = -1;
      var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
      var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
      for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
        var i = CI[k], d = (PX[i] - x) * (PX[i] - x) + (PZ[i] - z) * (PZ[i] - z);
        if (d < best) { best = d; bi = i; }
      }
      if (bi >= 0) {
        var e = PE[bi]; if (bi === ES[e + 1] - 1) bi--;
        var dx = PX[bi + 1] - PX[bi], dz = PZ[bi + 1] - PZ[bi], l = Math.hypot(dx, dz) || 1, off = (EF[e] & 1) ? 0 : EW[e] / 4;
        car.h = Math.atan2(-dz, dx);
        car.x = PX[bi] + dz / l * off; car.z = PZ[bi] - dx / l * off;       /* keep left */
        car.y = PH[bi]; car.v = 0; car.steer = 0; found = true;
      }
    }
    camYaw = car.h; orbit.yaw = 0; orbit.pitch = 0;
    lastPlan.x = 1e9;
  }
  function stepCar(dt) {
    var up = keys.ArrowUp || keys.KeyW || touch.g, dn = keys.ArrowDown || keys.KeyS || touch.b;
    var lf = keys.ArrowLeft || keys.KeyA || touch.l, rt = keys.ArrowRight || keys.KeyD || touch.r, hb = keys.Space;
    var v = car.v, a = 0;
    if (up) a += v >= -0.5 ? 3.4 * (1 - Math.max(0, v) / 43) : 8;
    if (dn) a -= v > 0.6 ? 8.5 : 2.6 * (1 + v / 9);
    if (hb) a -= Math.sign(v) * 10;
    a -= Math.sign(v) * (0.12 + 0.00042 * v * v + (car.onRoad ? 0 : 1.1 + 0.07 * Math.abs(v)));
    a -= 9.81 * Math.sin(car.pitch) * 0.85;
    var nv = v + a * dt;
    if (!up && !dn && v !== 0 && Math.sign(nv) !== Math.sign(v) && Math.abs(car.pitch) < 0.03) nv = 0;
    if (hb && Math.sign(nv) !== Math.sign(v)) nv = 0;
    car.v = clamp(nv, -9, 46);
    var maxSteer = 0.6 / (1 + Math.pow(Math.abs(car.v) / 11, 1.6)), target = ((lf ? 1 : 0) - (rt ? 1 : 0)) * maxSteer;
    car.steer += clamp(target - car.steer, -1.6 * dt, 1.6 * dt);
    var cs = Math.cos(car.h), sn = Math.sin(car.h);
    var rx = car.x - cs * (-sigma.axR), rz = car.z + sn * (-sigma.axR);          /* rear axle */
    rx += car.v * cs * dt; rz -= car.v * sn * dt;
    car.h += car.v / WB * Math.tan(car.steer) * dt;
    cs = Math.cos(car.h); sn = Math.sin(car.h);
    car.x = rx + cs * (-sigma.axR); car.z = rz - sn * (-sigma.axR);
    var r = Math.hypot(car.x, car.z);
    if (r > RADIUS - 60) { car.x *= (RADIUS - 60) / r; car.z *= (RADIUS - 60) / r; car.v *= 0.9; }
    /* stand the car on four wheels */
    var fx = car.x + cs * sigma.axF, fz = car.z - sn * sigma.axF, bx = car.x + cs * sigma.axR, bz = car.z - sn * sigma.axR, hw = 0.68;
    var hFL = carGround(fx - sn * hw, fz - cs * hw, car.y), hFR = carGround(fx + sn * hw, fz + cs * hw, car.y);
    var hBL = carGround(bx - sn * hw, bz - cs * hw, car.y), hBR = carGround(bx + sn * hw, bz + cs * hw, car.y);
    var hc = carGround(car.x, car.z, car.y);
    car.onRoad = G.onRoad; car.edge = G.e;
    var ty = (hFL + hFR + hBL + hBR) / 4, k = Math.min(1, dt * 14);
    car.y += (ty - car.y) * Math.min(1, dt * 20);
    car.pitch += (Math.atan2((hFL + hFR - hBL - hBR) / 2, WB) - car.pitch) * k;
    car.roll += (Math.atan2((hFL + hBL - hFR - hBR) / 2, 2 * hw) - car.roll) * k;
    if (car.y < -0.6 || hc < -0.8) placeOnRoad(car.x, car.z);                 /* drove into the river */
    car.spin -= car.v * dt / sigma.tyreR;
    carG.position.set(car.x, car.y, car.z);
    carG.rotation.set(car.roll, car.h, car.pitch);
    sigma.wheels.forEach(function (w, i) { w.rotation.set(0, i < 2 ? car.steer : 0, car.spin); });
  }

  /* ==========================================================
     OTHER TRAFFIC
     ========================================================== */
  var TRAFFIC = 34, others = [];
  (function () {
    var body = new THREE.BoxGeometry(4.1, 0.62, 1.68), cabin = new THREE.BoxGeometry(2.1, 0.5, 1.5), axle = new THREE.CylinderGeometry(0.31, 0.31, 1.74, 12);
    axle.rotateX(Math.PI / 2);
    var glass = new THREE.MeshLambertMaterial({ color: C('#232a30') }), tyre = new THREE.MeshLambertMaterial({ color: C('#141516') });
    var cols = ['#c9ccd0', '#f2f2ee', '#22262b', '#8e1b1f', '#27477a', '#5b6166', '#b9b29b', '#2f5d44', '#d8b23a', '#6c2f2a'];
    for (var i = 0; i < TRAFFIC; i++) {
      var g = new THREE.Group(), tall = hash(i, 3, 1) > 0.7;
      var b = new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color: C(cols[i % cols.length]) })); b.position.y = 0.62; if (tall) { b.scale.y = 1.5; b.position.y = 0.78; }
      var c = new THREE.Mesh(cabin, glass); c.position.set(-0.25, tall ? 1.42 : 1.16, 0); if (tall) c.scale.x = 1.5;
      var a1 = new THREE.Mesh(axle, tyre); a1.position.set(1.3, 0.31, 0);
      var a2 = new THREE.Mesh(axle, tyre); a2.position.set(-1.3, 0.31, 0);
      g.add(b, c, a1, a2); g.rotation.order = 'YZX'; g.visible = false; scene.add(g);
      others.push({ g: g, i: -1, t: 0, dir: 1, v: 0, lane: hash(i, 9, 2) > 0.5 ? 1 : -1, k: 0.8 + 0.22 * hash(i, 5, 5), x: 0, z: 0 });
    }
  })();
  function spawnOther(o, near) {
    for (var tries = 0; tries < 24; tries++) {
      var a = Math.random() * Math.PI * 2, r = (near ? 60 : 170) + Math.random() * 330;
      var cx = ((car.x + Math.cos(a) * r + HALF) / GC) | 0, cz = ((car.z + Math.sin(a) * r + HALF) / GC) | 0;
      if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
      var c = cz * GN + cx, n = CS[c + 1] - CS[c];
      if (!n) continue;
      var i = CI[CS[c] + ((Math.random() * n) | 0)], e = PE[i];
      if (Math.hypot(PX[i] - car.x, PZ[i] - car.z) < 45) continue;
      o.i = i; o.t = 0; o.dir = (EF[e] & 1) ? 1 : (Math.random() < 0.5 ? 1 : -1); o.v = ESP[e] / 3.6 * o.k * 0.7;
      o.g.visible = true;
      return;
    }
    o.i = -1; o.g.visible = false;
  }
  function nextEdge(o, v, from) {
    var opts = [], i;
    for (i = VAS[v]; i < VAS[v + 1]; i++) {
      var f = VAI[i] >> 1, end = VAI[i] & 1;
      if (f === from && VAS[v + 1] - VAS[v] > 1) continue;
      if (end === 1 && (EF[f] & 1)) continue;
      opts.push(VAI[i]);
    }
    if (!opts.length) return false;
    var pick = opts[(Math.random() * opts.length) | 0], f2 = pick >> 1;
    if (pick & 1) { o.i = ES[f2 + 1] - 2; o.t = PL[o.i + 1] - PL[o.i]; o.dir = -1; } else { o.i = ES[f2]; o.t = 0; o.dir = 1; }
    return true;
  }
  function stepTraffic(dt) {
    for (var q = 0; q < others.length; q++) {
      var o = others[q];
      if (o.i < 0 || Math.hypot(o.x - car.x, o.z - car.z) > 680) { spawnOther(o, false); if (o.i < 0) continue; }
      var e = PE[o.i], a = ES[e], b = ES[e + 1] - 1, sl = PL[o.i + 1] - PL[o.i];
      var toEnd = o.dir > 0 ? PL[b] - PL[o.i] - o.t : PL[o.i] + o.t, target = ESP[e] / 3.6 * o.k;
      if (toEnd < 14) target = Math.min(target, 5.5 + toEnd * 0.4);
      /* hold back behind the player's car */
      var dxp = car.x - o.x, dzp = car.z - o.z, fxo = Math.cos(o.g.rotation.y), fzo = -Math.sin(o.g.rotation.y);
      var ahead = dxp * fxo + dzp * fzo, side = Math.abs(dxp * fzo - dzp * fxo);
      if (ahead > 0 && ahead < 16 && side < 2.4) target = Math.min(target, Math.max(0, car.v * (fxo * Math.cos(car.h) - fzo * Math.sin(car.h))) * (ahead - 6) / 10);
      o.v += clamp(Math.max(0, target) - o.v, -6 * dt, 2.2 * dt);
      o.t += o.dir * o.v * dt;
      var ok = true, guard = 0;
      while (ok && guard++ < 8) {
        sl = PL[o.i + 1] - PL[o.i];
        if (o.t > sl) { if (o.i + 1 >= b) ok = nextEdge(o, EB[e], e); else { o.i++; o.t -= sl; } }
        else if (o.t < 0) { if (o.i <= a) ok = nextEdge(o, EA[e], e); else { o.i--; o.t += PL[o.i + 1] - PL[o.i]; } }
        else break;
        e = PE[o.i]; a = ES[e]; b = ES[e + 1] - 1;
      }
      if (!ok) { spawnOther(o, false); continue; }
      sl = PL[o.i + 1] - PL[o.i] || 1;
      var t = clamp(o.t / sl, 0, 1), dx = (PX[o.i + 1] - PX[o.i]) / sl * o.dir, dz = (PZ[o.i + 1] - PZ[o.i]) / sl * o.dir;
      var w = EW[e], off = (EF[e] & 1) ? (w >= 7 ? o.lane * w / 4 : 0) : w / 4;
      o.x = PX[o.i] + (PX[o.i + 1] - PX[o.i]) * t + dz * off; o.z = PZ[o.i] + (PZ[o.i + 1] - PZ[o.i]) * t - dx * off;
      var hy = Math.atan2(-dz, dx), dh = hy - o.g.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      o.g.position.set(o.x, PH[o.i] + (PH[o.i + 1] - PH[o.i]) * t + 0.03, o.z);
      o.g.rotation.set(0, o.g.rotation.y + dh * Math.min(1, dt * 8), Math.atan2((PH[o.i + 1] - PH[o.i]) * o.dir, sl));
    }
  }

  /* ==========================================================
     CAMERA, INPUT AND HUD
     ========================================================== */
  var camYaw = 0, camDist = 8.2, camMode = 0, orbit = { yaw: 0, pitch: 0, idle: 0, drag: false, px: 0, py: 0 };
  var camPos = new THREE.Vector3(), look = new THREE.Vector3();
  function stepCamera(dt) {
    if (camMode === 1) {
      var cs = Math.cos(car.h), sn = Math.sin(car.h);
      camera.near = 0.12; camera.fov = 68; camera.updateProjectionMatrix();
      carG.updateMatrixWorld();
      camPos.set(0.02, 1.20, 0.36).applyMatrix4(carG.matrixWorld);
      look.set(6, 0.92 - orbit.pitch * 4, 0.36 - orbit.yaw * 6).applyMatrix4(carG.matrixWorld);
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(look);
      return;
    }
    var dy = car.h - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * Math.min(1, dt * (2.2 + Math.abs(car.v) * 0.12));
    orbit.idle += dt;
    if (!orbit.drag && orbit.idle > 2.5 && Math.abs(car.v) > 1.5) { var f = Math.exp(-dt * 2.2); orbit.yaw *= f; orbit.pitch *= f; }
    var yaw = camYaw + orbit.yaw, p = clamp(0.24 + orbit.pitch, 0.03, 1.35), d = camDist + Math.abs(car.v) * 0.05;
    camPos.set(car.x - Math.cos(yaw) * d * Math.cos(p), car.y + 1.25 + d * Math.sin(p), car.z + Math.sin(yaw) * d * Math.cos(p));
    var floor = terrainH(camPos.x, camPos.z, 4) + 0.55;
    if (camPos.y < floor) camPos.y = floor;
    camera.position.copy(camPos);
    look.set(car.x, car.y + 1.15, car.z); camera.lookAt(look);
  }
  function setCam(m) {
    camMode = m; orbit.yaw = 0; orbit.pitch = 0;
    camera.near = m ? 0.12 : 0.3; camera.fov = m ? 68 : 55; camera.updateProjectionMatrix();
    $('camBtn').textContent = m ? 'Chase view' : 'Driver view';
  }
  window.addEventListener('keydown', function (ev) {
    if (ev.target && /SELECT|INPUT|TEXTAREA/.test(ev.target.tagName)) return;
    keys[ev.code] = true;
    if (ev.code === 'KeyC') setCam(camMode ? 0 : 1);
    if (ev.code === 'KeyR') placeOnRoad(car.x, car.z);
    if (/^Arrow|Space/.test(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', function (ev) { keys[ev.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  canvas.addEventListener('pointerdown', function (ev) { orbit.drag = true; orbit.px = ev.clientX; orbit.py = ev.clientY; canvas.setPointerCapture(ev.pointerId); canvas.focus(); });
  canvas.addEventListener('pointermove', function (ev) {
    if (!orbit.drag) return;
    orbit.yaw -= (ev.clientX - orbit.px) * 0.006; orbit.pitch += (ev.clientY - orbit.py) * 0.004;
    orbit.pitch = clamp(orbit.pitch, -0.22, 1.1); if (camMode) orbit.yaw = clamp(orbit.yaw, -1.2, 1.2);
    orbit.px = ev.clientX; orbit.py = ev.clientY; orbit.idle = 0;
  });
  function endDrag() { orbit.drag = false; orbit.idle = 0; }
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', function (ev) { camDist = clamp(camDist * (ev.deltaY > 0 ? 1.1 : 0.9), 4.5, 60); ev.preventDefault(); }, { passive: false });
  [['tl', 'l'], ['tr', 'r'], ['tg', 'g'], ['tb', 'b']].forEach(function (p) {
    var el = $(p[0]);
    function set(v) { return function (ev) { touch[p[1]] = v; el.classList.toggle('on', !!v); ev.preventDefault(); }; }
    el.addEventListener('pointerdown', set(1)); el.addEventListener('pointerup', set(0));
    el.addEventListener('pointercancel', set(0)); el.addEventListener('pointerleave', set(0));
    el.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  });
  $('camBtn').addEventListener('click', function () { setCam(camMode ? 0 : 1); canvas.focus(); });
  $('resetBtn').addEventListener('click', function () { placeOnRoad(car.x, car.z); canvas.focus(); });
  var LAT0 = -42.8826, LON0 = 147.3290, KN = 6371000 * Math.PI / 180, KX = KN * Math.cos(LAT0 * Math.PI / 180);
  var PLACES = [['Hobart city centre', -42.8826, 147.3290], ['Tasman Bridge', -42.8672, 147.3395], ['kunanyi / Mt Wellington summit', -42.8958, 147.2372],
                ['Sandy Bay', -42.9015, 147.3330], ['Glenorchy', -42.8330, 147.2760], ['Kingston', -42.9760, 147.3050],
                ['Hobart Airport', -42.8376, 147.5010], ['Richmond', -42.7355, 147.4385], ['Bridgewater', -42.7385, 147.2330], ['Sorell', -42.7820, 147.5640]];
  PLACES.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p[0]; $('places').appendChild(o); });
  $('places').addEventListener('change', function () {
    var p = PLACES[+this.value];
    placeOnRoad((p[2] - LON0) * KX, -(p[1] - LAT0) * KN);
    needWarm = true; canvas.focus();
  });

  var mm = $('map'), mg = mm.getContext('2d'), MMS = 168, MMR = 320;
  (function () { var dpr = Math.min(2, window.devicePixelRatio || 1); mm.width = MMS * dpr; mm.height = MMS * dpr; mg.scale(dpr, dpr); })();
  var MCOL = ['#ffb347', '#ffb347', '#ffd98a', '#ffffff', '#ffffff', '#c9ced3', '#c9ced3', '#c9ced3'];
  function drawMap() {
    var s = MMS / (2 * MMR), ox = MMS / 2 - car.x * s, oz = MMS / 2 - car.z * s;
    mg.fillStyle = '#26313a'; mg.fillRect(0, 0, MMS, MMS);
    var x0 = Math.max(0, ((car.x - MMR + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((car.x + MMR + HALF) / GC) | 0);
    var z0 = Math.max(0, ((car.z - MMR + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((car.z + MMR + HALF) / GC) | 0);
    for (var pass = 0; pass < 2; pass++) {
      mg.beginPath();
      for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
        var i = CI[k], major = ECL[PE[i]] <= 3;
        if (major !== (pass === 1)) continue;
        mg.moveTo(PX[i] * s + ox, PZ[i] * s + oz); mg.lineTo(PX[i + 1] * s + ox, PZ[i + 1] * s + oz);
      }
      mg.strokeStyle = pass ? '#ffc56b' : '#aab3bb'; mg.lineWidth = pass ? 2.4 : 1.2; mg.stroke();
    }
    mg.fillStyle = '#7fd0ff';
    others.forEach(function (o) { if (o.i >= 0) mg.fillRect(o.x * s + ox - 1.5, o.z * s + oz - 1.5, 3, 3); });
    mg.save(); mg.translate(MMS / 2, MMS / 2); mg.rotate(-car.h);
    mg.fillStyle = '#ff6a1a'; mg.strokeStyle = '#fff'; mg.lineWidth = 1.5;
    mg.beginPath(); mg.moveTo(8, 0); mg.lineTo(-6, 5); mg.lineTo(-3, 0); mg.lineTo(-6, -5); mg.closePath(); mg.fill(); mg.stroke();
    mg.restore();
    mg.fillStyle = '#fff'; mg.font = '600 11px Inter, system-ui, sans-serif'; mg.fillText('N', MMS / 2 - 4, 12);
  }
  var hudT = 0, COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  function drawHud(dt) {
    hudT += dt; if (hudT < 0.12) return; hudT = 0;
    $('speed').textContent = Math.round(Math.abs(car.v) * 3.6);
    var nm = '';
    if (car.edge >= 0) nm = NAMES[ENM[car.edge]];
    else if (nearRoad(car.x, car.z, 25, 0)) nm = NAMES[ENM[Q.e]];
    $('street').textContent = nm || (car.onRoad ? 'Unnamed road' : 'Off road');
    var a = ((car.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    $('info').textContent = COMPASS[Math.round(a / (Math.PI / 4)) % 8] + ' · ' + Math.round(car.y) + ' m';
    drawMap();
  }

  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  /* ==========================================================
     START-UP AND MAIN LOOP
     ========================================================== */
  var needWarm = false, running = false, last = 0;
  function warm(done) {
    plan(car.x, car.z);
    var total = queue.length;
    (function go() {
      buildSome(40);
      loadMsg.textContent = 'Building the land around you… ' + Math.round(100 * (1 - queue.length / Math.max(1, total))) + '%';
      if (queue.length) setTimeout(go, 0); else { plan(car.x, car.z); done(); }
    })();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    if (needWarm) { needWarm = false; plan(car.x, car.z); buildSome(400); plan(car.x, car.z); }
    stepCar(dt);
    stepTraffic(dt);
    if (Math.hypot(car.x - lastPlan.x, car.z - lastPlan.z) > 14 || (pending && !queue.length)) { plan(car.x, car.z); pending = false; }
    if (queue.length) { buildSome(5); pending = true; }
    stepCamera(dt);
    sun.position.set(car.x + SUN.x * 50, car.y + SUN.y * 50, car.z + SUN.z * 50);
    sun.target.position.set(car.x, car.y, car.z);
    water.position.set(car.x, 0, car.z);
    drawHud(dt);
    renderer.render(scene, camera);
  }
  var pending = false;
  window.__sim = { car: car, keys: keys, place: placeOnRoad, chunks: chunks, stats: function () { return { edges: NE, points: PX ? PX.length : 0, chunks: chunks.size, queue: queue.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; } };

  loadMsg.textContent = 'Loading the Hobart map…';
  Promise.all([loadImage('roads.png'), loadImage('terrain.png')])
    .then(function (res) {
      loadMsg.textContent = 'Reading heights and streets…';
      return new Promise(function (ok) { setTimeout(function () { decodeDem(res[1]); parseRoads(imageBytes(res[0])); roadHeights(); buildIndex(); buildUrban(); ok(); }, 30); });
    })
    .then(function () {
      stampP = new Uint32Array(PX.length); stampV = new Uint32Array(NV);
      placeOnRoad(0, 0);
      resize();
      warm(function () {
        others.forEach(function (o) { spawnOther(o, true); });
        loadEl.hidden = true; running = true; last = performance.now();
        canvas.focus();
      });
    })
    .catch(function (err) { loadMsg.textContent = 'Could not load the map data. ' + (err && err.message ? err.message : ''); });
  requestAnimationFrame(frame);
})();
