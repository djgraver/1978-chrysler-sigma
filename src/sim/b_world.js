
  /* ==========================================================
     MATERIALS FOR THE WORLD
     ========================================================== */
  var world = new THREE.Group(); scene.add(world);
  var NOISE_GLSL = 'float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n' +
    'float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }\n';
  var landMat = litMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'land', uniforms: { uSnowline: LIT.uSnowline, uSnowAll: LIT.uSnowAll },
    fhead: 'uniform float uSnowline; uniform float uSnowAll;\n' + NOISE_GLSL,
    color: [
      '{ float ny = normalize(vWN).y; float n = vnoise(vWP.xz * 0.02) * 0.7 + vnoise(vWP.xz * 0.11) * 0.3;',
      '  float sn = smoothstep(uSnowline - 40.0, uSnowline + 60.0, vWP.y + (n - 0.5) * 140.0) * smoothstep(0.6, 0.88, ny) * smoothstep(0.5, 0.68, vnoise(vWP.xz * 0.05) * 0.75 + vnoise(vWP.xz * 0.21) * 0.25 + (vWP.y - uSnowline) * 0.0012);',
      '  sn = max(sn, uSnowAll * smoothstep(0.7, 0.9, ny) * smoothstep(0.35, 0.6, n) * step(1.0, vWP.y));',
      '  diffuseColor.rgb *= 1.0 - 0.3 * uWet;',
      '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.86, 0.9), sn); }'
    ].join('\n')
  });
  var builtMat = litMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
    key: 'built', color: 'diffuseColor.rgb *= 1.0 - 0.2 * uWet;'
  });
  /* buildings: wall colour from vertices, windows drawn from a per-vertex (along-wall, height, type) code */
  var houseMat = litMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), {
    key: 'house', uniforms: { uSnowAll: LIT.uSnowAll },
    vhead: 'attribute vec3 aWin; varying vec3 vWin;\n', vmain: 'vWin = aWin;',
    fhead: 'varying vec3 vWin; uniform float uSnowAll;\n',
    color: [
      'float winLit = 0.0;',
      '{ float wt = floor(vWin.z / 1000.0 + 0.001); float seed = vWin.z - wt * 1000.0; vec3 nn = normalize(vWN);',
      '  if (wt > 0.5 && abs(nn.y) < 0.5) {',
      '    float lvl = (wt == 2.0 || wt == 4.0 || wt == 5.0) ? 3.6 : 3.0;',
      '    float fl = floor(vWin.y / lvl); float fy = vWin.y - fl * lvl;',
      '    float sp = wt == 5.0 ? 1.7 : (wt == 2.0 || wt == 4.0) ? 2.6 : wt == 3.0 ? 2.8 : 3.6;',
      '    float ww = wt == 5.0 ? 1.55 : wt == 3.0 ? 1.0 : wt == 1.0 ? 1.6 : 1.7;',
      '    float cc = floor(vWin.x / sp); float fx = vWin.x - cc * sp;',
      '    float y0 = wt == 3.0 ? 0.8 : wt == 5.0 ? 0.3 : 0.95; float y1 = wt == 3.0 ? 2.45 : wt == 5.0 ? lvl - 0.3 : 2.25;',
      '    float inW = step(abs(fx - sp * 0.5), ww * 0.5) * step(y0, fy) * step(fy, y1) * step(0.3, vWin.y);',
      '    if (wt == 4.0 && fl < 0.5) inW = step(0.4, fract(vWin.x / 4.5)) * step(0.25, fy) * step(fy, 2.9);',
      '    float h1 = fract(sin(cc * 12.9898 + fl * 78.233 + seed * 3.17) * 43758.5453);',
      '    float h2 = fract(sin(cc * 39.346 + fl * 11.135 + seed * 7.31) * 24634.6345);',
      '    if (wt == 1.0 && h1 < 0.4) inW = 0.0;',
      '    float lit = step(1.0 - (wt >= 4.0 ? 0.55 : 0.4), h2);',
      '    float fd = smoothstep(110.0, 380.0, length(vWP - cameraPosition));',
      '    float cov = wt == 5.0 ? 0.55 : wt == 1.0 ? 0.1 : 0.28;',
      '    inW = mix(inW, cov, fd); lit = mix(lit, wt >= 4.0 ? 0.5 : 0.4, fd);',
      '    diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.02, 0.025, 0.03), vec3(0.16, 0.2, 0.24), 0.5 + 0.5 * nn.x), inW);',
      '    winLit = lit * inW;',
      '  }',
      '  if (nn.y > 0.35) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.92), uSnowAll * 0.9);',
      '  diffuseColor.rgb *= 1.0 - 0.15 * uWet; }'
    ].join('\n'),
    pre: 'gl_FragColor.rgb += winLit * vec3(1.0, 0.72, 0.4) * 1.3 * uNight;'
  });
  var roadTex = (function () {
    var c = document.createElement('canvas'); c.width = 512; c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#46484a'; g.fillRect(0, 0, 512, 256);
    for (var i = 0; i < 5000; i++) {
      var s = Math.random(); g.fillStyle = s < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
      g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (i = 0; i < 14; i++) g.fillRect(Math.random() * 512, Math.random() * 256, 30 + Math.random() * 60, 3 + Math.random() * 6);
    g.fillStyle = '#e2e0d6';
    g.fillRect(8, 0, 4, 256); g.fillRect(244, 0, 4, 256); g.fillRect(126, 0, 4, 80);  /* edges and centre dash */
    g.fillRect(318, 0, 4, 80);                                                         /* centre dash only */
    var t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    return t;
  })();
  var roadMat = litMaterial(new THREE.MeshLambertMaterial({ map: roadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), {
    key: 'road', color: 'diffuseColor.rgb *= 1.0 - 0.45 * uWet;',
    pre: 'gl_FragColor.rgb += uWet * 0.05 * vec3(0.55, 0.6, 0.7) * (1.0 - uNight);'
  });
  var water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.6, HALF * 2.6), new THREE.MeshPhongMaterial({ color: C('#2f5266'), specular: C('#8a99a3'), shininess: 80 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0; scene.add(water);

  /* ==========================================================
     LAND COLOUR: satellite colour, then rock and snow on the mountain
     ========================================================== */
  var tc = new THREE.Color();
  var cRockB = C('#3d3027'), cRockG = C('#4a4640'), cRockL = C('#6d6a63'), cLawn = C('#5e7038'), cSand = C('#b8a983');
  function landColour(x, z, h, slope) {
    var fx = clamp((x + HALF) / CELL, 0, DN - 1.001), fz = clamp((z + HALF) / CELL, 0, DN - 1.001);
    var ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = (iz * DN + ix) * 3, r = 0, g = 0, b = 0;
    var w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz, K = DN * 3;
    r = S2L[GRC[k]] * w00 + S2L[GRC[k + 3]] * w10 + S2L[GRC[k + K]] * w01 + S2L[GRC[k + K + 3]] * w11;
    g = S2L[GRC[k + 1]] * w00 + S2L[GRC[k + 4]] * w10 + S2L[GRC[k + K + 1]] * w01 + S2L[GRC[k + K + 4]] * w11;
    b = S2L[GRC[k + 2]] * w00 + S2L[GRC[k + 5]] * w10 + S2L[GRC[k + K + 2]] * w01 + S2L[GRC[k + K + 5]] * w11;
    var l = (r + g + b) / 3;
    r = l + (r - l) * 1.25; g = l + (g - l) * 1.25; b = l + (b - l) * 1.1;
    tc.setRGB(r * 1.9, g * 1.9, b * 1.7);
    if (h < 2.2 && l > 0.06) tc.lerp(cSand, 0.4);
    var u = urbanAt(x, z);
    if (u > 30) tc.lerp(cLawn, clamp((u - 30) / 120, 0, 0.45));
    /* kunanyi / Mt Wellington: dark brown and grey dolerite above the forest */
    var n = hash(Math.round(x / 30), Math.round(z / 30), 11), n2 = hash(Math.round(x / 9), Math.round(z / 9), 5);
    var rock = sstep(560, 820, h + (n - 0.5) * 160);
    if (rock > 0) {
      var rc = n2 < 0.5 ? cRockB : cRockG;
      tc.lerp(rc, rock * 0.85);
      tc.lerp(cRockL, sstep(930, 1180, h + (n2 - 0.5) * 120) * 0.7 * rock);
    }
    if (slope > 0.9) tc.lerp(cRockG, sstep(0.9, 1.6, slope) * 0.7);
    var k2 = 0.93 + n2 * 0.14;
    tc.r *= k2; tc.g *= k2; tc.b *= k2;
  }

  /* ==========================================================
     TILES
     ========================================================== */
  var SIZE = [4096, 1024, 256];
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
    var info = { lamps: [], sigs: [] };
    if (L >= 1 && (L === 1 || hasRoad)) buildRoads(group, L, hi, x0, z0, size, cx0, cx1, cz0, cz1, info);
    if (L === 2) { var occ = buildBuildings(group, ix, iz, 2); buildTrees(group, x0, z0, 256, hi ? 2 : 1, occ, ix, iz); buildSignals(group, x0, z0, info); }
    if (L === 1) {
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) buildBuildings(group, ix * 4 + i, iz * 4 + j, 1);
      buildTrees(group, x0, z0, 1024, 0, null, 0, 0);
    }
    if (info.lamps.length) buildLamps(group, info.lamps);
    group.userData = info;
    return group;
  }

  /* ---------- roads, kerbs, footpaths and street lamps ---------- */
  function onCarriageway(x, z, skipE, pad) {
    var cx = ((x + HALF) / GC) | 0, cz = ((z + HALF) / GC) | 0;
    if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) return false;
    var c = cz * GN + cx;
    for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
      var i = CI[k], e = PE[i];
      if (e === skipE) continue;
      var ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
      var t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      var ex = ax + dx * t - x, ez = az + dz * t - z, r = EW[e] * 0.5 + pad;
      if (ex * ex + ez * ez < r * r) return true;
    }
    return false;
  }
  var cKerb = C('#9c9b95'), cPath = C('#8d8b84'), cPathD = C('#7c7a74');
  function buildRoads(group, L, hi, x0, z0, size, cx0, cx1, cz0, cz1, info) {
    var pos = [], uv = [], idx = [], bp = [], bc = [], bn = [], bi = [], x1 = x0 + size, z1 = z0 + size;
    var lift = L === 1 ? 1.6 : hi ? 0.0 : 0.2, wide = L === 1 ? 1.6 : 1, maxClass = L === 1 ? 3 : 9, id = ++stampId;
    function inside(x, z) { return x >= x0 && x < x1 && z >= z0 && z < z1; }
    function disc(v) {
      if (stampV[v] === id || !inside(VX[v], VZ[v])) return;
      stampV[v] = id;
      var r = VR[v] * wide + 0.3, b = pos.length / 3, y = VH[v] + lift + 0.012;
      pos.push(VX[v], y, VZ[v]); uv.push(0.88, 0.5);
      for (var q = 0; q < 18; q++) { var a = q * Math.PI / 9; pos.push(VX[v] + Math.cos(a) * r, y, VZ[v] + Math.sin(a) * r); uv.push(0.88, 0.5); }
      for (q = 0; q < 18; q++) idx.push(b, b + 1 + (q + 1) % 18, b + 1 + q);
    }
    function quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col) {
      var b = bp.length / 3;
      bp.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
      var ux = bx - ax, uy = by - ay, uz = bz - az, vx = dx - ax, vy = dy - ay, vz = dz - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (var q = 0; q < 4; q++) { bn.push(nx / l, ny / l, nz / l); bc.push(col.r, col.g, col.b); }
      bi.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    for (var cz = cz0; cz <= cz1; cz++) for (var cx = cx0; cx <= cx1; cx++) {
      var c = cz * GN + cx;
      for (var k = CS[c], ke = CS[c + 1]; k < ke; k++) {
        var i = CI[k], e = PE[i];
        if (stampP[i] === id || ECL[e] > maxClass) continue;
        stampP[i] = id;
        if (i === ES[e]) disc(EA[e]);
        if (i + 1 === ES[e + 1] - 1) disc(EB[e]);
        var mx = (PX[i] + PX[i + 1]) / 2, mz = (PZ[i] + PZ[i + 1]) / 2;
        if (!inside(mx, mz)) continue;
        var hw = EW[e] * 0.5 * wide, sw = L === 2 && ESW[e] && !PB[i] && !PB[i + 1];
        var lined = ECL[e] <= 4 && !(EF[e] & 24);
        var u0 = lined ? (sw ? 0.505 : 0.004) : 0.76, u1 = lined ? (sw ? 0.745 : 0.496) : 0.99;
        var b = pos.length / 3;
        for (var s = 0; s < 2; s++) {
          var p = i + s, y = PH[p] + lift;
          pos.push(PX[p] + PNX[p] * hw, y, PZ[p] + PNZ[p] * hw, PX[p] - PNX[p] * hw, y, PZ[p] - PNZ[p] * hw);
          uv.push(u0, PL[p] / 12, u1, PL[p] / 12);
        }
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        if (L !== 2) continue;
        if (PB[i] || PB[i + 1]) { bridgeBits(i, hw, bp, bc, bn, bi); continue; }
        var dA = Math.hypot(mx - VX[EA[e]], mz - VZ[EA[e]]), dB = Math.hypot(mx - VX[EB[e]], mz - VZ[EB[e]]);
        var nearJ = dA < VTRIM[EA[e]] || dB < VTRIM[EB[e]];
        if (sw && !nearJ) {
          for (var side = 1; side >= -1; side -= 2) {
            var om = hw + SWW * 0.5;
            if (onCarriageway(mx + PNX[i] * om * side, mz + PNZ[i] * om * side, e, 0.2)) continue;
            var o0 = hw, o1 = hw + SWW, y0 = PH[i], y1 = PH[i + 1];
            var ax = PX[i] + PNX[i] * side * o0, az = PZ[i] + PNZ[i] * side * o0, bx = PX[i + 1] + PNX[i + 1] * side * o0, bz = PZ[i + 1] + PNZ[i + 1] * side * o0;
            var axo = PX[i] + PNX[i] * side * o1, azo = PZ[i] + PNZ[i] * side * o1, bxo = PX[i + 1] + PNX[i + 1] * side * o1, bzo = PZ[i + 1] + PNZ[i + 1] * side * o1;
            quad(ax, y0 - 0.05, az, bx, y1 - 0.05, bz, bx, y1 + KERB, bz, ax, y0 + KERB, az, cKerb);                 /* kerb face */
            var ak = ax + PNX[i] * side * 0.3, akz = az + PNZ[i] * side * 0.3, bk = bx + PNX[i + 1] * side * 0.3, bkz = bz + PNZ[i + 1] * side * 0.3;
            quad(ax, y0 + KERB, az, bx, y1 + KERB, bz, bk, y1 + KERB, bkz, ak, y0 + KERB, akz, cKerb);              /* kerb top */
            var jn = ((PL[i] / 1.6) | 0) % 2 ? cPath : cPathD;
            quad(ak, y0 + KERB, akz, bk, y1 + KERB, bkz, bxo, y1 + KERB, bzo, axo, y0 + KERB, azo, jn);             /* footpath */
            quad(axo, y0 + KERB, azo, bxo, y1 + KERB, bzo, bxo, y1 - 0.5, bzo, axo, y0 - 0.5, azo, cPathD);         /* outer edge */
          }
        }
        /* street lamps every 38 m on the left of urban and main roads */
        var lampRoad = (ESW[e] || (ECL[e] <= 3 && urbanAt(mx, mz) > 25)) && !(EF[e] & 4);
        if (lampRoad && !nearJ) {
          var step = 38, s0 = Math.ceil(PL[i] / step) * step;
          if (s0 < PL[i + 1]) {
            var t = (s0 - PL[i]) / ((PL[i + 1] - PL[i]) || 1), off = hw + (ESW[e] ? SWW - 0.45 : 1.1), sd = ((s0 / step) | 0) % 2 && !(EF[e] & 1) && ECL[e] <= 3 ? -1 : 1;
            var lx = PX[i] + (PX[i + 1] - PX[i]) * t + PNX[i] * off * sd, lz = PZ[i] + (PZ[i + 1] - PZ[i]) * t + PNZ[i] * off * sd;
            if (!onCarriageway(lx, lz, e, 0.6)) info.lamps.push([lx, PH[i] + (PH[i + 1] - PH[i]) * t + (ESW[e] ? KERB : 0), lz, -PNX[i] * sd, -PNZ[i] * sd]);
          }
        }
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
      var mm = new THREE.Mesh(g2, builtMat); mm.receiveShadow = hi; group.add(mm);
    }
  }
  function box(bp, bc, bn, bi, cx, cz, ux, uz, ha, hb, y0, y1, wall, roof) {
    var vx = -uz, vz = ux, cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]], q, b;
    var P = cs.map(function (c) { return [cx + ux * ha * c[0] + vx * hb * c[1], cz + uz * ha * c[0] + vz * hb * c[1]]; });
    for (q = 0; q < 4; q++) {
      var A = P[q], B = P[(q + 1) % 4], nx = B[1] - A[1], nz = -(B[0] - A[0]), l = Math.hypot(nx, nz) || 1;
      b = bp.length / 3;
      bp.push(A[0], y0, A[1], B[0], y0, B[1], B[0], y1, B[1], A[0], y1, A[1]);
      for (var r = 0; r < 4; r++) { bn.push(nx / l, 0, nz / l); bc.push(wall.r, wall.g, wall.b); }
      bi.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    b = bp.length / 3;
    for (q = 0; q < 4; q++) { bp.push(P[q][0], y1, P[q][1]); bn.push(0, 1, 0); bc.push(roof.r, roof.g, roof.b); }
    bi.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  var cConc = C('#9a9a94'), cConcD = C('#777872');
  function bridgeBits(i, hw, bp, bc, bn, bi) {
    var dx = PX[i + 1] - PX[i], dz = PZ[i + 1] - PZ[i], len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    dx /= len; dz /= len;
    var mx = (PX[i] + PX[i + 1]) / 2, mz = (PZ[i] + PZ[i + 1]) / 2, my = (PH[i] + PH[i + 1]) / 2;
    box(bp, bc, bn, bi, mx, mz, dx, dz, len / 2 + 0.05, hw + 0.9, my - 1.3, my - 0.04, cConc, cConc);
    for (var s = -1; s <= 1; s += 2) box(bp, bc, bn, bi, mx + dz * s * (hw + 0.6), mz - dx * s * (hw + 0.6), dx, dz, len / 2 + 0.05, 0.25, my - 0.1, my + 1.0, cConcD, cConcD);
    if (((PL[i] / SPACING) | 0) % 5 === 0) {
      var g = Math.min(demH(mx, mz), 0) - 3;
      if (my - g > 5) box(bp, bc, bn, bi, mx, mz, dx, dz, 1.1, hw * 0.8, g, my - 1.2, cConcD, cConcD);
    }
  }

  /* ---------- street lamp posts (instanced) and their night glow ---------- */
  var lampGeo = (function () {
    var parts = [], m = new THREE.Matrix4();
    var pole = new THREE.CylinderGeometry(0.07, 0.11, 7.6, 6); pole.translate(0, 3.8, 0); parts.push(pole);
    var arm = new THREE.BoxGeometry(1.7, 0.08, 0.08); arm.translate(0.8, 7.5, 0); parts.push(arm);
    var head = new THREE.BoxGeometry(0.7, 0.16, 0.32); head.translate(1.55, 7.42, 0); parts.push(head);
    return mergeGeos(parts);
  })();
  var lampMat = litMaterial(new THREE.MeshLambertMaterial({ color: C('#6d7072') }), { key: 'lamp' });
  var glowMat = new THREE.ShaderMaterial({
    uniforms: { uNight: LIT.uNight, uScale: { value: 400 } },
    vertexShader: 'attribute vec3 color; attribute float size; varying vec3 vC; uniform float uScale; uniform float uNight;\n' +
      'void main(){ vC = color * uNight; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(size * uScale / -mv.z, 1.5, 90.0) * step(0.01, uNight); }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = exp(-r * 5.0) + 0.5 * exp(-r * 1.3); gl_FragColor = vec4(vC * a, 1.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  function mergeGeos(list) {
    var pos = [], nor = [], col = [], hasCol = list.some(function (g) { return g.getAttribute('color'); });
    list.forEach(function (g0) {
      var g = g0.index ? g0.toNonIndexed() : g0;
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      var p = g.getAttribute('position').array, n = g.getAttribute('normal').array, c = g.getAttribute('color');
      for (var i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      if (hasCol) for (i = 0; i < p.length; i++) col.push(c ? c.array[i] : 1);
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (hasCol) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return out;
  }
  /* a view of a shared geometry with its own bounds, so a tile's instances are culled as a whole */
  function shareGeo(g, cx, cy, cz, r) {
    var n = new THREE.BufferGeometry();
    for (var k in g.attributes) n.setAttribute(k, g.attributes[k]);
    n.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r);
    n.userData.shared = true;
    return n;
  }
  function paint(g, color) {
    var n = g.getAttribute('position').count, c = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }
  var mtmp = new THREE.Matrix4(), qtmp = new THREE.Quaternion(), vtmp = new THREE.Vector3(), stmp = new THREE.Vector3(1, 1, 1), yAxis = new THREE.Vector3(0, 1, 0);
  function buildLamps(group, lamps) {
    var l0 = lamps[0], im = new THREE.InstancedMesh(shareGeo(lampGeo, l0[0], l0[1], l0[2], 400), lampMat, lamps.length), gp = [], gc = [], gs = [];
    lamps.forEach(function (l, i) {
      qtmp.setFromAxisAngle(yAxis, Math.atan2(-l[4], l[3]));
      mtmp.compose(vtmp.set(l[0], l[1], l[2]), qtmp, stmp); im.setMatrixAt(i, mtmp);
      var hx = l[0] + l[3] * 1.55, hz = l[2] + l[4] * 1.55;
      l.push(hx, l[1] + 7.3, hz);
      gp.push(hx, l[1] + 7.3, hz); gc.push(1.0, 0.72, 0.38); gs.push(2.6);
    });
    group.add(im);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(gs, 1));
    var pts = new THREE.Points(g, glowMat); pts.frustumCulled = false; pts.renderOrder = 8; group.add(pts);
  }
