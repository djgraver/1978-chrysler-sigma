  /* ==========================================================
     FUEL AND STREET FURNITURE
     Service stations stand where OpenStreetMap has them (79 around Hobart), rebuilt as late-70s
     forecourts with generic signage: a flat concrete pad, a canopy, two pump islands and a kiosk.
     Bus stops get a pole and, often, a shelter. The Sigma burns fuel from its engine power; a fuel
     multiplier makes the tank last minutes rather than hours.
     ========================================================== */
  var TANK = 60, PRICE = 0.209;                       /* litres; dollars a litre (about 20.9 cents in 1978) */
  car.fuel = TANK * 0.32;
  var FUEL = [], FUEL_T = new Map(), STOPS_ALL = [], STOPS_T = new Map();
  function tileKey(x, z) { return clamp(((z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x + HALF) / 256) | 0, 0, 239); }
  function nearestRoadPoint(x, z, r, maxCl) {
    var best = r * r, bi = -1, bt = 0;
    var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
    var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
    for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
      var i = CI[k], e = PE[i];
      if (ECL[e] > maxCl || PB[i]) continue;
      var ax = PX[i], az = PZ[i], dx = PX[i + 1] - ax, dz = PZ[i + 1] - az;
      var t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1), ex = ax + dx * t - x, ez = az + dz * t - z, d = ex * ex + ez * ez;
      if (d < best) { best = d; bi = i; bt = t; }
    }
    return bi < 0 ? null : { i: bi, t: bt, d: Math.sqrt(best) };
  }
  function frameAt(rp, x, z) {
    var i = rp.i, e = PE[i], dx = PX[i + 1] - PX[i], dz = PZ[i + 1] - PZ[i], l = Math.hypot(dx, dz) || 1;
    var tx = dx / l, tz = dz / l, jx = PX[i] + dx * rp.t, jz = PZ[i] + dz * rp.t;
    /* n points away from the road, towards the mapped spot; t is chosen so that n = (-tz, tx) */
    var nx = -tz, nz = tx;
    if ((x - jx) * nx + (z - jz) * nz < 0) { tx = -tx; tz = -tz; nx = -nx; nz = -nz; }
    return { e: e, jx: jx, jz: jz, h: PH[i] + (PH[i + 1] - PH[i]) * rp.t, tx: tx, tz: tz, nx: nx, nz: nz, hw: EW[e] / 2 + (ESW[e] ? SWW : 0) };
  }
  function rectPts(cx, cz, tx, tz, nx, nz, hu, hv, u0, v0) {
    var ox = cx + tx * u0 + nx * v0, oz = cz + tz * u0 + nz * v0;
    return [[ox - tx * hu - nx * hv, oz - tz * hu - nz * hv], [ox + tx * hu - nx * hv, oz + tz * hu - nz * hv], [ox + tx * hu + nx * hv, oz + tz * hu + nz * hv], [ox - tx * hu + nx * hv, oz - tz * hu + nz * hv]];
  }
  function setupFuel(extra) {
    (extra.fuel || []).forEach(function (f) {
      var x = f[0], z = f[1];
      if (FUEL.some(function (s) { return Math.hypot(s.mx - x, s.mz - z) < 45; })) return;
      var rp = nearestRoadPoint(x, z, 55, 6);
      if (!rp) return;
      var F = frameAt(rp, x, z), hl = 14, hd = 10, ok = false;
      for (var tryN = 0; tryN < 3 && !ok; tryN++) {
        ok = true;
        var cx = F.jx + F.nx * (F.hw + hd), cz = F.jz + F.nz * (F.hw + hd);
        for (var u = -hl; u <= hl && ok; u += 2) for (var v = -hd + 1; v <= hd && ok; v += 2) {
          if (onRoadArea(cx + F.tx * u + F.nx * v, cz + F.tz * u + F.nz * v, -0.3)) ok = false;
        }
        if (!ok) { hl -= 2; hd -= 1.5; }
      }
      if (!ok) return;
      var st = { mx: x, mz: z, x: cx, z: cz, y: F.h + KERB, tx: F.tx, tz: F.tz, nx: F.nx, nz: F.nz, hl: hl, hd: hd, e: F.e, pumps: [], th: Math.atan2(-F.tz, F.tx) };
      st.name = 'Service station' + (ENM && NAMES[ENM[F.e]] ? ', ' + NAMES[ENM[F.e]] : '');
      addPad({ x: cx, z: cz, tx: F.tx, tz: F.tz, hl: hl, hd: hd, y: st.y });
      /* pumps on two islands; the car fills up from either side */
      [-3, 1].forEach(function (w) { [-1.5, 1.5].forEach(function (u) { st.pumps.push([cx + F.tx * u + F.nx * w, cz + F.tz * u + F.nz * w]); }); });
      [-3, 1].forEach(function (w) { addStaticCollider(rectPts(cx, cz, F.tx, F.tz, F.nx, F.nz, 4.2 * Math.min(1, hl / 14), 0.55, 0, w)); });
      if (hd >= 8.5) addStaticCollider(rectPts(cx, cz, F.tx, F.tz, F.nx, F.nz, 4.5, 2.0, -3.5, hd - 2.5));
      addStaticCollider(rectPts(cx, cz, F.tx, F.tz, F.nx, F.nz, 0.2, 0.2, hl - 1.5, -hd + 1.2));
      /* the mapped buildings on the forecourt give way to ours */
      if (BLD) for (var dz2 = -1; dz2 <= 1; dz2++) for (var dx2 = -1; dx2 <= 1; dx2++) {
        var jx = clamp((((cx + HALF) / 256) | 0) + dx2, 0, 239), jz = clamp((((cz + HALF) / 256) | 0) + dz2, 0, 239), t = jz * 240 + jx, ox = -HALF + jx * 256, oz = -HALF + jz * 256;
        for (var b = BLD.TS[t]; b < BLD.TS[t + 1]; b++) {
          var n = BLD.BN[b], off = BLD.BO[b], sx = 0, sz = 0;
          for (var k = 0; k < n; k++) { sx += ox + BLD.V[off + k * 2] / 10; sz += oz + BLD.V[off + k * 2 + 1] / 10; }
          sx /= n; sz /= n;
          var ru = (sx - cx) * F.tx + (sz - cz) * F.tz, rv = (sx - cx) * F.nx + (sz - cz) * F.nz;
          if (Math.abs(ru) < hl + 1 && Math.abs(rv) < hd + 1) BLD_SKIP.add(b);
        }
      }
      FUEL.push(st);
      var key = tileKey(cx, cz);
      if (!FUEL_T.has(key)) FUEL_T.set(key, []);
      FUEL_T.get(key).push(st);
    });
    (extra.bus || []).forEach(function (s, idx) {
      var rp = nearestRoadPoint(s[0], s[1], 22, 7);
      if (!rp) return;
      var F = frameAt(rp, s[0], s[1]);
      if (Math.hypot(F.jx - VX[EA[F.e]], F.jz - VZ[EA[F.e]]) < VTRIM[EA[F.e]] + 2 || Math.hypot(F.jx - VX[EB[F.e]], F.jz - VZ[EB[F.e]]) < VTRIM[EB[F.e]] + 2) return;
      var back = F.hw + (ESW[F.e] ? -0.15 : 1.2), shelter = ESW[F.e] && hash(idx, 3, 1) < 0.5;
      var st = { x: F.jx + F.nx * (back - 1.5), z: F.jz + F.nz * (back - 1.5), y: F.h + (ESW[F.e] ? KERB : 0.05), fx: -F.nx, fz: -F.nz, tx: F.tx, tz: F.tz,
                 bx: F.jx + F.nx * back, bz: F.jz + F.nz * back, px: F.jx + F.nx * (EW[F.e] / 2 + 0.45) + F.tx * 2.6, pz: F.jz + F.nz * (EW[F.e] / 2 + 0.45) + F.tz * 2.6, shelter: shelter, th: Math.atan2(-F.tz, F.tx) };
      if (STOPS_ALL.some(function (o) { return Math.abs(o.x - st.x) < 6 && Math.abs(o.z - st.z) < 6; })) return;
      if (inPad(st.x, st.z, 2)) return;
      STOPS_ALL.push(st);
      var key = tileKey(st.x, st.z);
      if (!STOPS_T.has(key)) STOPS_T.set(key, []);
      STOPS_T.get(key).push(st);
      if (shelter) addStaticCollider(rectPts(st.bx, st.bz, F.tx, F.tz, F.nx, F.nz, 1.6, 0.35, 0, -0.35));
    });
  }
  function stopsNear(x, z, r) {
    var out = [], k0 = ((x + HALF) / 256) | 0, k1 = ((z + HALF) / 256) | 0, n = Math.ceil(r / 256);
    for (var dz = -n; dz <= n; dz++) for (var dx = -n; dx <= n; dx++) {
      var l = STOPS_T.get(clamp(k1 + dz, 0, 239) * 240 + clamp(k0 + dx, 0, 239));
      if (l) l.forEach(function (s) { var d = Math.hypot(s.x - x, s.z - z); if (d < r && d > 25) out.push(s); });
    }
    return out;
  }

  /* ---------- geometry kits: many boxes merged into one vertex-coloured mesh ---------- */
  function Kit() { this.P = []; this.C = []; }
  Kit.prototype.add = function (g, col, m) {
    g = g.index ? g.toNonIndexed() : g; if (m) g.applyMatrix4(m);
    var p = g.getAttribute('position').array;
    for (var i = 0; i < p.length; i++) this.P.push(p[i]);
    for (i = 0; i < p.length / 3; i++) this.C.push(col.r, col.g, col.b);
    return this;
  };
  Kit.prototype.box = function (w, h, d, col, m) { return this.add(new THREE.BoxGeometry(w, h, d), col, m); };
  Kit.prototype.mesh = function (mat) {
    if (!this.P.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  var kitMat = litMaterial(std({ vertexColors: true, roughness: 0.55, metalness: 0.05 }), { key: 'kit', color: 'diffuseColor.rgb *= 1.0 - 0.15 * uWet;' });
  var kitGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  var padMat = litMaterial(std({ color: 0xffffff, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), {
    key: 'pad',
    color: [
      'vec2 pq = vWP.xz;',
      'float pn = dfbm(pq * 0.35) * 0.5 + dnoise(pq * 3.0) * 0.12;',
      'float slab = step(0.97, fract(dot(pq, vec2(0.25)))) + step(0.97, fract(dot(pq, vec2(-0.25, 0.25))));',
      'float oil = smoothstep(0.62, 0.8, dfbm(pq * 0.55 + 7.0));',
      'diffuseColor.rgb = vec3(0.56, 0.55, 0.52) * (0.86 + pn * 0.3) * (1.0 - 0.18 * min(slab, 1.0)) * (1.0 - 0.45 * oil) * (1.0 - 0.3 * uWet);'
    ].join('\n'),
    rough: 'roughnessFactor = mix(0.85, 0.25, uWet * 0.8 + 0.1 * smoothstep(0.62, 0.8, dfbm(vWP.xz * 0.55 + 7.0)));'
  });
  function textTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  }
  var signTex = textTex(256, 512, function (g, w, h) {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c4361d'; g.fillRect(0, 0, w, 210);
    g.fillStyle = '#e8a12a'; g.fillRect(0, 210, w, 16);
    g.fillStyle = '#fff6e4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 64px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText('PETROL', w / 2, 82);
    g.font = '700 30px Arial, sans-serif'; g.fillText('OIL · SERVICE', w / 2, 158);
    g.fillStyle = '#1d1a16'; g.font = '700 26px Arial, sans-serif'; g.fillText('SUPER', w / 2, 270);
    g.fillStyle = '#121212'; g.fillRect(28, 300, w - 56, 120);
    g.fillStyle = '#ffd25a'; g.font = '700 92px "Courier New", monospace'; g.fillText('20.9', w / 2 - 16, 362);
    g.font = '700 30px Arial, sans-serif'; g.fillText('¢', w - 50, 340);
    g.fillStyle = '#1d1a16'; g.font = '600 24px Arial, sans-serif'; g.fillText('CENTS PER LITRE', w / 2, 458);
  });
  var signMat = new THREE.MeshBasicMaterial({ map: signTex });
  var fasciaTex = textTex(1024, 64, function (g, w, h) {
    g.fillStyle = '#f2ede0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c4361d'; g.fillRect(0, 40, w, 14);
    g.fillStyle = '#e8a12a'; g.fillRect(0, 54, w, 5);
    g.fillStyle = '#2a2622'; g.font = '800 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SELF SERVE  ·  DRIVE IN  ·  PETROL  ·  OIL  ·  TYRES', w / 2, 21);
  });
  var fasciaMat = litMaterial(std({ map: fasciaTex, roughness: 0.5 }), { key: 'fascia', pre: 'gl_FragColor.rgb += diffuseColor.rgb * 0.5 * uNight;' });
  var busTex = textTex(128, 128, function (g, w, h) {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#25603e'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#f2efe6'; g.fillRect(28, 22, 72, 46); g.fillStyle = '#25603e'; g.fillRect(34, 28, 60, 18);
    g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(42, 72, 8, 0, 7); g.arc(86, 72, 8, 0, 7); g.fill();
    g.font = '800 22px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('BUS STOP', w / 2, 106);
  });
  var busMat = litMaterial(std({ map: busTex, roughness: 0.5 }), { key: 'bussign' });
  var cWhite = C('#ece8de'), cRed = C('#c4361d'), cConc = C('#a5a39c'), cSteel = C('#7c8084'), cDark = C('#1e1d1b'), cYel = C('#e0b02a'), cPump = [C('#c4361d'), C('#e8dcb8'), C('#2f4d6a')], cKiosk = C('#e8e2d2'), cGlassK = C('#1b2328'), cHose = C('#111111'), cGreen = C('#2f5a3e');
  var mtx2 = new THREE.Matrix4(), rotY = new THREE.Matrix4();
  function buildFuel(group, ix, iz, info) {
    var list = FUEL_T.get(iz * 240 + ix);
    if (!list) return;
    list.forEach(function (st) {
      var K = new Kit(), Gk = new Kit(), base = new THREE.Matrix4().makeRotationY(st.th).setPosition(st.x, st.y, st.z);
      function M(u, y, w) { return mtx2.makeTranslation(u, y, w).premultiply(base).clone(); }
      /* forecourt slab */
      var pad = new THREE.Mesh(new THREE.PlaneGeometry(st.hl * 2, st.hd * 2).rotateX(-Math.PI / 2), padMat);
      pad.applyMatrix4(M(0, -0.045, 0)); pad.receiveShadow = true; group.add(pad);
      var cs = Math.min(1, st.hl / 14);
      /* islands, pumps */
      [-3, 1].forEach(function (w, wi) {
        K.box(8.4 * cs, 0.16, 1.1, cConc, M(0, 0.08, w));
        [-4.2 * cs, 4.2 * cs].forEach(function (u) { K.box(0.3, 0.17, 1.1, cYel, M(u, 0.085, w)); });
        [-1.5, 1.5].forEach(function (u, ui) {
          var col = cPump[(((wi * 2 + ui + (st.x | 0)) % 3) + 3) % 3];
          K.box(0.72, 1.5, 0.46, col, M(u, 0.91, w));
          K.box(0.76, 0.06, 0.5, cDark, M(u, 1.69, w));
          K.box(0.6, 0.14, 0.4, cSteel, M(u, 0.22, w));
          Gk.box(0.66, 0.26, 0.5, C('#f6f0d8'), M(u, 1.86, w));
          [-1, 1].forEach(function (sd) {
            Gk.box(0.5, 0.2, 0.01, C('#d8c890'), M(u, 1.32, w + sd * 0.235));
            K.box(0.08, 0.3, 0.1, cDark, M(u + 0.3, 1.0, w + sd * 0.25));
            var hose = new THREE.TorusGeometry(0.32, 0.018, 4, 10, Math.PI); hose.rotateZ(Math.PI / 2);
            K.add(hose, cHose, M(u + 0.28, 0.85, w + sd * 0.26));
          });
        });
        /* canopy columns stand on the islands */
        [-3.6 * cs, 3.6 * cs].forEach(function (u) { K.box(0.32, 4.4, 0.32, cWhite, M(u, 2.36, w)); });
      });
      /* canopy */
      var cw = 9.6 * cs + 1.2, cd = 8.6;
      K.box(cw * 2 * 0.86, 0.12, cd, cWhite, M(0, 4.62, -1));
      var fas = new THREE.Mesh(new THREE.BoxGeometry(cw * 2 * 0.86, 0.7, cd), [fasciaMat, fasciaMat, kitMat, kitMat, fasciaMat, fasciaMat]);
      fas.applyMatrix4(M(0, 4.95, -1));
      fas.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(fas.geometry.attributes.position.count * 3).fill(0.92), 3));
      fas.castShadow = true; group.add(fas);
      for (var r = 0; r < 3; r++) Gk.box(cw * 1.5, 0.03, 0.3, C('#fff7e2'), M(0, 4.55, -4 + r * 3));
      info.lamps.push([0, 0, 0, 0, 0].concat(new THREE.Vector3(-3, 4.3, -1).applyMatrix4(base).toArray()));
      info.lamps.push([0, 0, 0, 0, 0].concat(new THREE.Vector3(3, 4.3, -1).applyMatrix4(base).toArray()));
      /* kiosk at the back, if there is room */
      if (st.hd >= 8.5) {
        var kw = 4.5, kd = 2.0, kc = st.hd - 2.5;
        K.box(kw * 2, 3.2, kd * 2, cKiosk, M(-3.5, 1.6, kc));
        K.box(kw * 2 + 0.4, 0.12, kd * 2 + 0.4, cConc, M(-3.5, 3.24, kc));
        K.box(kw * 2 + 0.6, 0.45, 0.06, cRed, M(-3.5, 3.4, kc - kd - 0.3)); K.box(kw * 2 + 0.6, 0.45, 0.06, cRed, M(-3.5, 3.4, kc + kd + 0.3));
        K.box(0.06, 0.45, kd * 2 + 0.6, cRed, M(-3.5 - kw - 0.3, 3.4, kc)); K.box(0.06, 0.45, kd * 2 + 0.6, cRed, M(-3.5 + kw + 0.3, 3.4, kc));
        K.box(kw * 2 - 1.4, 1.6, 0.04, cGlassK, M(-3.5 - 0.3, 1.5, kc - kd - 0.01));
        Gk.box(kw * 2 - 1.6, 1.45, 0.02, C('#e8c88a'), M(-3.5 - 0.3, 1.5, kc - kd - 0.035));
        K.box(1.0, 2.1, 0.05, cDark, M(-3.5 + kw - 0.8, 1.05, kc - kd - 0.02));
        info.lamps.push([0, 0, 0, 0, 0].concat(new THREE.Vector3(-3.5, 2.8, kc - kd - 1.2).applyMatrix4(base).toArray()));
        /* oil racks and a water tap */
        K.box(1.4, 0.9, 0.5, cGreen, M(2.2, 0.45, kc - kd + 0.3));
        for (var o = 0; o < 6; o++) K.box(0.16, 0.24, 0.12, [cRed, cYel, cWhite][o % 3], M(1.68 + (o % 3) * 0.26 + 0.0, 1.02, kc - kd + 0.2 + (o > 2 ? 0.18 : 0)));
      }
      /* the tall roadside sign */
      var su = st.hl - 1.5, sw0 = -st.hd + 1.2;
      K.box(0.22, 6.2, 0.22, cSteel, M(su, 3.1, sw0));
      K.box(0.26, 3.2, 1.7, cDark, M(su, 5.6, sw0));
      [-1, 1].forEach(function (sd) {
        var face = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 3.06), signMat);
        face.applyMatrix4(M(su + sd * 0.135, 5.6, sw0).multiply(new THREE.Matrix4().makeRotationY(sd * Math.PI / 2)));
        group.add(face);
      });
      var km = K.mesh(kitMat); if (km) group.add(km);
      var gm = Gk.mesh(kitGlow); if (gm) { gm.castShadow = false; group.add(gm); }
    });
  }
  function buildStops(group, ix, iz) {
    var list = STOPS_T.get(iz * 240 + ix);
    if (!list) return;
    var K = new Kit();
    list.forEach(function (st) {
      var base = new THREE.Matrix4().makeRotationY(st.th).setPosition(st.bx, st.y, st.bz);
      function M(u, y, w) { return mtx2.makeTranslation(u, y, w).premultiply(base).clone(); }
      /* the pole by the kerb with its sign */
      var pole = new THREE.Matrix4().makeRotationY(st.th).setPosition(st.px, st.y, st.pz);
      K.box(0.07, 2.7, 0.07, cSteel, mtx2.makeTranslation(0, 1.35, 0).premultiply(pole).clone());
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), busMat);
      sign.applyMatrix4(mtx2.makeTranslation(0, 2.42, 0).premultiply(pole).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
      group.add(sign);
      var back = sign.clone(); back.rotateY(Math.PI); group.add(back);
      if (!st.shelter) return;
      /* a 70s shelter: a steel frame, a ribbed back panel, perspex ends, a bench */
      K.box(3.2, 0.08, 1.5, cWhite, M(0, 2.3, -0.35));
      K.box(3.2, 0.14, 0.06, cGreen, M(0, 2.22, -1.1));
      K.box(3.1, 1.9, 0.05, cGreen, M(0, 1.2, 0.36));
      for (var r = 0; r < 4; r++) K.box(0.06, 2.3, 0.06, cSteel, M(-1.55 + (r % 2) * 3.1, 1.15, r < 2 ? 0.36 : -1.0));
      [-1.55, 1.55].forEach(function (u) { K.box(0.03, 1.5, 1.2, C('#4a5a5c'), M(u, 1.25, -0.3)); });
      K.box(2.6, 0.06, 0.38, C('#8a5a32'), M(0, 0.48, 0.12));
      K.box(0.06, 0.45, 0.3, cSteel, M(-1.1, 0.24, 0.12)); K.box(0.06, 0.45, 0.3, cSteel, M(1.1, 0.24, 0.12));
    });
    var m = K.mesh(kitMat); if (m) group.add(m);
  }

  /* ---------- the fuel itself ---------- */
  var fill = { at: null, litres: 0, active: false, msg: '', msgT: 0, towing: false };
  function nearestStation(x, z) {
    var best = 1e18, bs = null;
    for (var i = 0; i < FUEL.length; i++) { var d = (FUEL[i].x - x) * (FUEL[i].x - x) + (FUEL[i].z - z) * (FUEL[i].z - z); if (d < best) { best = d; bs = FUEL[i]; } }
    return bs ? { st: bs, d: Math.sqrt(best) } : null;
  }
  function placeCarAt(x, z, h, y) {
    car.x = x; car.z = z; car.h = h; car.yb = y + H0; car.vyb = 0; car.pitch = 0; car.roll = 0; car.vpitch = 0; car.vroll = 0;
    car.vx = 0; car.vy = 0; car.r = 0; car.v = 0; car.sIn = 0; car.steer = 0; car.gear = 1; car.shiftT = 0;
    for (var q = 0; q < 4; q++) { car.gndV[q] = 0; car.gnd[q] = y; car.comp[q] = 0; }
    camYaw = h; orbit.yaw = 0; orbit.pitch = 0; lastPlan.x = 1e9;
    respawnAround();
  }
  function tow() {
    var ns = nearestStation(car.x, car.z);
    if (!ns) return;
    var st = ns.st, km = ns.d / 1000;
    placeCarAt(st.x + st.nx * -1, st.z + st.nz * -1, Math.atan2(-st.tz, st.tx), st.y);
    needWarm = true;
    car.fuel = Math.max(car.fuel, 0); car.engineOn = true;
    var cost = 15 + km * 1.5;
    fill.msg = 'Towed ' + km.toFixed(1) + ' km for $' + cost.toFixed(2) + '.'; fill.msgT = 8; fill.towed = true;
  }
  var lowWarned = false;
  function stepFuel(dt) {
    car.fuel = Math.max(0, car.fuel - car.fuelRate * dt);
    car.cut = car.fuel < 0.35 && car.fuel > 0 && Math.sin(simTime * 9.1) + Math.sin(simTime * 3.7) > 0.9;
    if (car.fuel <= 0 && car.engineOn) { car.engineOn = false; fill.msgT = 0; }
    /* at a pump? */
    fill.at = null;
    var ns = nearestStation(car.x, car.z);
    if (ns && ns.d < 30 && Math.abs(car.vx) < 0.8) {
      for (var i = 0; i < ns.st.pumps.length; i++) { var p = ns.st.pumps[i]; if (Math.hypot(p[0] - car.x, p[1] - car.z) < 3.6) { fill.at = ns.st; fill.pump = i + 1; break; } }
    }
    var want = fill.at && (keys.KeyF || fill.btn);
    if (want && car.fuel < TANK - 0.01) {
      if (!fill.active) { fill.active = true; fill.litres = 0; }
      var add = Math.min(TANK - car.fuel, 2.6 * dt);
      car.fuel += add; fill.litres += add;
      if (car.fuel > 0.3) car.engineOn = true;
    } else if (fill.active) {
      fill.active = false;
      if (fill.litres > 0.05) { fill.towed = false; fill.msg = 'Filled ' + fill.litres.toFixed(1) + ' L for $' + (fill.litres * PRICE).toFixed(2) + '. Thank you, call again!'; fill.msgT = 5; }
    }
    if (car.fuel < TANK * 0.15 && !lowWarned) { lowWarned = true; fill.msg = 'Fuel is low. The map shows petrol stations in yellow.'; fill.msgT = 5; }
    if (car.fuel > TANK * 0.25) lowWarned = false;
    fill.msgT -= dt;
    /* night: signs glow */
    var nl = LIT.uNight.value;
    signMat.color.setScalar(0.85 + nl * 0.6);
    kitGlow.color.setScalar(0.55 + nl * 1.1);
  }
  function fuelPrompt() {
    if (fill.active) return { text: 'Pump ' + fill.pump + ' · ' + fill.litres.toFixed(1) + ' L · $' + (fill.litres * PRICE).toFixed(2) + (car.fuel >= TANK - 0.02 ? ' · full' : ''), btn: 'Filling…' };
    if (fill.at && car.fuel < TANK - 0.05) return { text: (fill.msgT > 0 && fill.towed ? fill.msg + ' ' : '') + 'Pump ' + fill.pump + ' · 20.9¢ a litre · hold F (or the button) to fill', btn: 'Hold to fill' };
    if (fill.msgT > 0) return { text: fill.msg, btn: null };
    if (car.fuel <= 0 && Math.abs(car.vx) < 0.5) return { text: 'Out of petrol. Walk to a phone box and call a tow truck?', btn: 'Call a tow', tow: true };
    if (car.fuel < TANK * 0.15) {
      var ns = nearestStation(car.x, car.z);
      if (ns) {
        var a = Math.atan2(-(ns.st.z - car.z), ns.st.x - car.x), dirs = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
        return { text: 'Low fuel · nearest petrol ' + (ns.d / 1000).toFixed(1) + ' km ' + dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8], btn: null };
      }
    }
    return null;
  }
