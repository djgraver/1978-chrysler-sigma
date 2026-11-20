
  /* ==========================================================
     BUILDINGS
     Every footprint is a real OpenStreetMap building. Its style (Georgian sandstone, Federation brick,
     weatherboard, 60s-70s brick veneer, modern, shed, industrial, city block, flats or church), roof shape,
     pitch and colours were chosen when the data was packed, from its tags, size, where it is in Hobart
     and, for bigger roofs, the colour seen from the satellite. Here each one is turned into walls, windows and a roof.
     ========================================================== */
  var BLD = null, BLD_SKIP = new Set();   /* footprints replaced by our own fuel stations */
  function parseBuildings(buf) {
    var h = unpack(buf);
    BLD = { N: h.N, TS: h.get('TS'), BN: h.get('BN'), BS: h.get('BS'), BR: h.get('BR'), BP: h.get('BP'), BRC: h.get('BRC'), BWC: h.get('BWC'), BH: h.get('BH'), V: h.get('V') };
    BLD.BO = new Uint32Array(h.N + 1);
    for (var i = 0; i < h.N; i++) BLD.BO[i + 1] = BLD.BO[i] + BLD.BN[i] * 2;
    BLD.ROOF = h.ROOF.map(C); BLD.WALL = h.WALL.map(C);
    /* how much of each 256 m square is under roofs, smoothed: the dense centre gets paved ground */
    var raw = new Float32Array(240 * 240);
    for (var t = 0; t < 240 * 240; t++) for (var b = BLD.TS[t]; b < BLD.TS[t + 1]; b++) {
      var n = BLD.BN[b], off = BLD.BO[b], A = 0;
      for (var k = 0; k < n; k++) { var k2 = (k + 1) % n; A += BLD.V[off + k * 2] * BLD.V[off + k2 * 2 + 1] - BLD.V[off + k2 * 2] * BLD.V[off + k * 2 + 1]; }
      raw[t] += Math.abs(A) / 200 / 65536;
    }
    BCOV = new Float32Array(240 * 240);
    for (var j = 1; j < 239; j++) for (var i2 = 1; i2 < 239; i2++) {
      var sm = raw[j * 240 + i2] * 4;
      for (var bb = -1; bb <= 1; bb++) for (var aa = -1; aa <= 1; aa++) sm += raw[(j + bb) * 240 + i2 + aa];
      BCOV[j * 240 + i2] = sm / 13;
    }
  }
  var BCOV = null;
  function coverAt(x, z) {
    if (!BCOV) return 0;
    var fx = clamp((x + HALF) / 256 - 0.5, 0, 238.999), fz = clamp((z + HALF) / 256 - 0.5, 0, 238.999), ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, k = iz * 240 + ix;
    return (BCOV[k] * (1 - tx) + BCOV[k + 1] * tx) * (1 - tz) + (BCOV[k + 240] * (1 - tx) + BCOV[k + 241] * tx) * tz;
  }
  var WINTYPE = [0, 3, 3, 1, 1, 0, 0, 4, 4, 1, 2, 3];
  var cChimney = C('#7d4535'), cPlant = C('#8b8d8c');
  function hull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  /* smallest enclosing rectangle: centre, long axis, half length, half width */
  function obb(pts) {
    var h = hull(pts), best = null;
    for (var i = 0; i < h.length; i++) {
      var a = h[i], b = h[(i + 1) % h.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      if (l < 1e-6) continue;
      dx /= l; dz /= l;
      var mn0 = 1e9, mx0 = -1e9, mn1 = 1e9, mx1 = -1e9;
      for (var k = 0; k < h.length; k++) {
        var u = h[k][0] * dx + h[k][1] * dz, v = -h[k][0] * dz + h[k][1] * dx;
        if (u < mn0) mn0 = u; if (u > mx0) mx0 = u; if (v < mn1) mn1 = v; if (v > mx1) mx1 = v;
      }
      var area = (mx0 - mn0) * (mx1 - mn1);
      if (!best || area < best.area) {
        var cu = (mn0 + mx0) / 2, cv = (mn1 + mx1) / 2;
        best = { area: area, ax: dx, az: dz, cx: cu * dx - cv * dz, cz: cu * dz + cv * dx, hl: (mx0 - mn0) / 2, hw: (mx1 - mn1) / 2 };
      }
    }
    if (best && best.hw > best.hl) { var t = best.hl; best.hl = best.hw; best.hw = t; var ax = best.ax; best.ax = -best.az; best.az = ax; }
    return best;
  }
  function pip(pts, x, z) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
    }
    return inside;
  }
  /* surface codes: walls 1 brick, 2 weatherboard, 3 sandstone, 4 render, 10 corrugated iron, 12 concrete panels;
     fences 6 pickets, 8 palings; roofs 20 iron, 21 tiles, 22 flat, 23 slate; 9 verandah iron */
  var WALLMAT = [3, 3, 1, 1, 1, 2, 2, 2, 2, 4, 1, 4, 4, 12, 12, 1, 1, 2];
  var ROOFMAT = [21, 21, 21, 20, 20, 20, 20, 20, 20, 22, 21, 22, 21, 21, 23, 20];
  var cPicket = C('#e9e6dc'), cPaling = C('#8a7b66'), cVerPost = C('#e6e2d6'), cBrickF = C('#9a5a42');
  function buildBuildings(group, jx, jz, detail) {
    if (!BLD || jx < 0 || jz < 0 || jx >= 240 || jz >= 240) return null;
    var t = jz * 240 + jx, b0 = BLD.TS[t], b1 = BLD.TS[t + 1];
    var ox = -HALF + jx * 256, oz = -HALF + jz * 256, occ = detail === 2 ? new Uint8Array(128 * 128) : null;
    if (b1 <= b0) return occ;
    var P = [], N = [], Cc = [], W = [], M = [];
    function tri(a, b, c, col, wa, wb, wc, flat, mat) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (flat && ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (var q = 0; q < 3; q++) { N.push(nx, ny, nz); Cc.push(col.r, col.g, col.b); M.push(mat || 0); }
      W.push(wa[0], wa[1], wa[2], wb[0], wb[1], wb[2], wc[0], wc[1], wc[2]);
    }
    /* a quad facing out along (nx, nz) with wall coordinates; mat is the surface code */
    function quadW(ax, az, bx, bz, y0a, y0b, y1a, y1b, u0, u1, v0, col, mat, code, v0b) {
      var A0 = [ax, y0a, az], B0 = [bx, y0b, bz], B1 = [bx, y1b, bz], A1 = [ax, y1a, az], vb = v0b === undefined ? v0 : v0b;
      tri(A0, A1, B1, col, [u0, y0a - v0, code], [u0, y1a - v0, code], [u1, y1b - vb, code], false, mat);
      tri(A0, B1, B0, col, [u0, y0a - v0, code], [u1, y1b - vb, code], [u1, y0b - vb, code], false, mat);
    }
    function boxB(cx, cz, ax, az, ha, hb, y0, y1, col, mat) {
      var pb = [], pc = [], pn = [], pi = [];
      box(pb, pc, pn, pi, cx, cz, ax, az, ha, hb, y0, y1, col, col);
      for (var k = 0; k < pi.length; k += 3) {
        var i1 = pi[k] * 3, i2 = pi[k + 1] * 3, i3 = pi[k + 2] * 3;
        tri([pb[i1], pb[i1 + 1], pb[i1 + 2]], [pb[i2], pb[i2 + 1], pb[i2 + 2]], [pb[i3], pb[i3 + 1], pb[i3 + 2]], col, Z0, Z0, Z0, false, mat || 0);
      }
    }
    var Z0 = [0, 0, 0], wcol = new THREE.Color(), rcol = new THREE.Color();
    for (var b = b0; b < b1; b++) {
      if (BLD_SKIP.has(b)) continue;
      var n = BLD.BN[b], off = BLD.BO[b], pts = [], i;
      for (i = 0; i < n; i++) pts.push([ox + BLD.V[off + i * 2] / 10, oz + BLD.V[off + i * 2 + 1] / 10]);
      var A = 0, cx = 0, cz = 0;
      for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; cx += p[0]; cz += p[1]; }
      A /= 2; cx /= n; cz /= n;
      var area = Math.abs(A), sgn = A > 0 ? 1 : -1, st = BLD.BS[b];
      if (detail === 1 && (area < 120 || st === 5)) continue;
      var shape = BLD.BR[b] & 15, chim = BLD.BR[b] >> 4, pitch = BLD.BP[b] * Math.PI / 180, hgt = BLD.BH[b] / 10;
      var hv = 0.92 + hash(b, 3, 7) * 0.16;
      wcol.copy(BLD.WALL[BLD.BWC[b]]).multiplyScalar(hv); rcol.copy(BLD.ROOF[BLD.BRC[b]]).multiplyScalar(0.94 + hash(b, 5, 1) * 0.12);
      var wmat = (st === 5 || st === 6) ? (hash(b, 2, 2) < 0.7 ? 10 : 12) : WALLMAT[BLD.BWC[b]];
      if (st === 7 && hgt > 24 && wmat !== 3) wmat = 12;
      var rmat = ROOFMAT[BLD.BRC[b]];
      var gy = detail === 2 ? terrainH(cx, cz, 4) : demH(cx, cz), minG = gy;
      for (i = 0; i < n; i++) minG = Math.min(minG, demH(pts[i][0], pts[i][1]));
      var base = minG - 0.8, eave = gy + hgt;
      var wt = WINTYPE[st]; if (st === 7 && hgt > 24) wt = 5; if (detail === 1 && wt < 4) wt = 0;
      var code = wt * 1000 + (b * 7) % 997;
      var o = (shape !== 0 && n >= 3) ? obb(pts) : null, rect = o ? area / Math.max(1, 4 * o.hl * o.hw) : 0;
      if (o && (o.hw < 1.2 || rect < 0.45)) { if (shape === 3) shape = 0; else if (rect < 0.45) pitch *= 0.6; }
      if (!o) shape = 0;
      if (shape === 0 && (rmat === 21 || rmat === 23)) rmat = 22;
      var rise = shape === 0 ? 0 : (shape === 3 ? 2 * o.hw : o.hw) * Math.tan(pitch);
      if (detail === 1) { shape = 0; eave += rise * 0.4; }
      var par = (shape === 0 && (st === 7 || st === 8 || st === 10 || st === 6)) ? 0.7 : 0;
      function topAt(x, z) {
        if (shape !== 3) return eave + par;
        var v = (-(x - o.cx) * o.az + (z - o.cz) * o.ax) / o.hw;
        return eave + (v * 0.5 + 0.5) * rise;
      }
      /* which wall faces the street: it gets the front door, a verandah and a front fence */
      var frontI = -1, road = null;
      if (detail === 2 && (st <= 4 || st === 9 || st === 10) && nearRoad(cx, cz, 40, 0)) {
        var e0 = Q.e, qi = Q.i, qx = PX[qi] + (PX[qi + 1] - PX[qi]) * Q.t, qz = PZ[qi] + (PZ[qi + 1] - PZ[qi]) * Q.t;
        var tdx = PX[qi + 1] - PX[qi], tdz = PZ[qi + 1] - PZ[qi], tl = Math.hypot(tdx, tdz) || 1;
        road = { e: e0, x: qx, z: qz, h: Q.h, tx: tdx / tl, tz: tdz / tl, d: Q.d };
        var dvx = (qx - cx) / (Q.d || 1), dvz = (qz - cz) / (Q.d || 1), best = 0.45;
        for (i = 0; i < n; i++) {
          var a1 = pts[i], c1 = pts[(i + 1) % n], ex = c1[0] - a1[0], ez = c1[1] - a1[1], el = Math.hypot(ex, ez);
          if (el < 2.6) continue;
          var dot = (sgn * ez * dvx - sgn * ex * dvz) / el;
          if (dot > best) { best = dot; frontI = i; }
        }
      }
      /* walls */
      var u = 0;
      for (i = 0; i < n; i++) {
        var a = pts[i], c = pts[(i + 1) % n], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        var ta = topAt(a[0], a[1]), tb = topAt(c[0], c[1]);
        var wcode = len > 2.4 ? code : 0, front = i === frontI ? 1 : 0;
        var u0 = front ? -len / 2 : u, u1 = front ? len / 2 : u + len;
        if (sgn > 0) quadW(a[0], a[1], c[0], c[1], base, base, ta, tb, u0, u1, gy, wcol, wmat * 10 + front, wcode);
        else quadW(c[0], c[1], a[0], a[1], base, base, tb, ta, u1, u0, gy, wcol, wmat * 10 + front, wcode);
        u += len + 0.7;
      }
      /* roof */
      if (shape === 0 || shape === 3) {
        var contour = pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), faces = THREE.ShapeUtils.triangulateShape(contour, []);
        var ry = par ? eave + par - 0.25 : 0, fm = shape === 3 ? rmat : (rmat === 20 ? 20 : 22);
        var ax2 = o ? -o.az : 1, az2 = o ? o.ax : 0;
        faces.forEach(function (f) {
          var vs = [pts[f[0]], pts[f[1]], pts[f[2]]].map(function (p) { return [p[0], par ? ry : topAt(p[0], p[1]), p[1]]; });
          var uvs = vs.map(function (p) { return [p[0] * az2 - p[2] * ax2, p[0] * ax2 + p[2] * az2, 0]; });
          tri(vs[0], vs[1], vs[2], rcol, uvs[0], uvs[1], uvs[2], true, fm * 10);
        });
        if (st === 7 && area > 350 && hash(b, 9, 9) < 0.6 && detail === 2) boxB(cx, cz, 1, 0, 2.2, 1.6, eave + par - 0.3, eave + par + 2.2, cPlant, 120);
      } else {
        var e = shape === 2 ? Math.max(0, o.hl - o.hw) : shape === 1 ? o.hl : shape === 5 ? Math.max(0, o.hl - o.hw * 0.45) : 0;
        var r0x = o.cx - o.ax * e, r0z = o.cz - o.az * e, r1x = o.cx + o.ax * e, r1z = o.cz + o.az * e, ry2 = eave + rise;
        var tops = [], rb = [];
        for (i = 0; i < n; i++) {
          var px = pts[i][0], pz = pts[i][1], dx = r1x - r0x, dz = r1z - r0z, L2 = dx * dx + dz * dz;
          var tt = L2 > 1e-9 ? clamp(((px - r0x) * dx + (pz - r0z) * dz) / L2, 0, 1) : 0;
          tops.push([r0x + dx * tt, ry2, r0z + dz * tt]);
          var pp = pts[(i + n - 1) % n], pq = pts[(i + 1) % n];
          var e1x = px - pp[0], e1z = pz - pp[1], e2x = pq[0] - px, e2z = pq[1] - pz, l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
          var n1x = e1z / l1 * sgn, n1z = -e1x / l1 * sgn, n2x = e2z / l2 * sgn, n2z = -e2x / l2 * sgn;
          var bx = n1x + n2x, bz = n1z + n2z, bl = Math.hypot(bx, bz) || 1, sc = 0.4 / Math.max(0.35, (bx * n1x + bz * n1z) / bl);
          rb.push([px + bx / bl * sc, eave - 0.12, pz + bz / bl * sc]);
        }
        var cosP = Math.cos(pitch) || 1;
        for (i = 0; i < n; i++) {
          var j = (i + 1) % n, T0 = tops[i], T1 = tops[j];
          var same = Math.abs(T0[0] - T1[0]) + Math.abs(T0[2] - T1[2]) < 0.05;
          var gable = same && shape === 1;
          var a0 = gable ? [pts[i][0], eave, pts[i][1]] : rb[i], a1 = gable ? [pts[j][0], eave, pts[j][1]] : rb[j];
          /* roof coordinates: along the eave, and up the slope */
          var exx = a1[0] - a0[0], ezz = a1[2] - a0[2], el2 = Math.hypot(exx, ezz) || 1; exx /= el2; ezz /= el2;
          var ruv = function (p) { var rx = p[0] - a0[0], rz = p[2] - a0[2]; return [rx * exx + rz * ezz, Math.abs(rx * ezz - rz * exx) / cosP, 0]; };
          if (gable) { var gw = [0, 0, 0]; tri(a0, a1, T0, wcol, [0, eave - gy, 0], [el2, eave - gy, 0], [el2 / 2, ry2 - gy, 0], false, wmat * 10); }
          else if (same) tri(a0, a1, T0, rcol, ruv(a0), ruv(a1), ruv(T0), true, rmat * 10);
          else { tri(a0, a1, T1, rcol, ruv(a0), ruv(a1), ruv(T1), true, rmat * 10); tri(a0, T1, T0, rcol, ruv(a0), ruv(T1), ruv(T0), true, rmat * 10); }
        }
        if (chim && detail === 2) {
          var chx = r0x + (r1x - r0x) * 0.2 + (-o.az) * o.hw * 0.25, chz = r0z + (r1z - r0z) * 0.2 + o.ax * o.hw * 0.25;
          boxB(chx, chz, o.ax, o.az, 0.35, 0.35, eave, ry2 + 0.9, cChimney, 10);
          boxB(chx, chz, o.ax, o.az, 0.42, 0.42, ry2 + 0.9, ry2 + 1.02, cChimney, 10);
          boxB(chx + o.ax * 0.15, chz + o.az * 0.15, o.ax, o.az, 0.07, 0.07, ry2 + 1.02, ry2 + 1.35, C('#8a5a40'), 0);
        }
      }
      if (detail === 2 && frontI >= 0) {
        var fa = pts[frontI], fc = pts[(frontI + 1) % n], fl = Math.hypot(fc[0] - fa[0], fc[1] - fa[1]);
        var fnx = sgn * (fc[1] - fa[1]) / fl, fnz = -sgn * (fc[0] - fa[0]) / fl, ftx = (fc[0] - fa[0]) / fl, ftz = (fc[1] - fa[1]) / fl;
        /* a verandah across the front of older single-storey houses */
        if ((st === 2 || st === 3) && hgt < 4.6 && fl > 5 && hash(b, 13, 1) < 0.6) {
          var dep = 2.2, vy0 = eave - 0.3, vy1 = Math.max(gy + 2.45, eave - 0.85), inset = 0.3;
          var va = [fa[0] + ftx * inset, fa[1] + ftz * inset], vc = [fc[0] - ftx * inset, fc[1] - ftz * inset];
          var vao = [va[0] + fnx * dep, va[1] + fnz * dep], vco = [vc[0] + fnx * dep, vc[1] + fnz * dep];
          var A1v = [va[0], vy0, va[1]], C1v = [vc[0], vy0, vc[1]], Co = [vco[0], vy1, vco[1]], Ao = [vao[0], vy1, vao[1]];
          var vu = function (p) { return [(p[0] - va[0]) * ftx + (p[2] - va[1]) * ftz, Math.hypot(p[0] - (va[0] + ftx * ((p[0] - va[0]) * ftx + (p[2] - va[1]) * ftz)), p[2] - (va[1] + ftz * ((p[0] - va[0]) * ftx + (p[2] - va[1]) * ftz))), 0]; };
          var vcol = hash(b, 14, 1) < 0.5 ? rcol : C('#9aa19b');
          tri(A1v, C1v, Co, vcol, vu(A1v), vu(C1v), vu(Co), true, 90); tri(A1v, Co, Ao, vcol, vu(A1v), vu(Co), vu(Ao), true, 90);
          var posts = Math.max(2, Math.round((fl - 2 * inset) / 2.6) + 1);
          for (var k = 0; k < posts; k++) {
            var f = k / (posts - 1), qx2 = vao[0] + (vco[0] - vao[0]) * f - fnx * 0.1, qz2 = vao[1] + (vco[1] - vao[1]) * f - fnz * 0.1;
            boxB(qx2, qz2, ftx, ftz, 0.06, 0.06, gy - 0.2, vy1, cVerPost, 0);
          }
          boxB((va[0] + vco[0]) / 2 + fnx * -0.0, (va[1] + vco[1]) / 2, ftx, ftz, fl / 2 - inset, dep / 2, gy - 0.4, gy + 0.22, C('#7c6a58'), 0);
        }
        /* a front fence along the footpath, with a gap for the driveway */
        if (road && road.d < 30 && ESW[road.e] && hash(b, 15, 1) < 0.82) {
          var ft = st === 1 || st === 2 ? (hash(b, 16, 1) < 0.7 ? 6 : 1) : st === 3 ? (hash(b, 16, 1) < 0.6 ? 6 : 8) : st === 4 ? (hash(b, 16, 1) < 0.6 ? 1 : 0) : (hash(b, 16, 1) < 0.5 ? 8 : 0);
          if (ft) {
            var side = ((cx - road.x) * -road.tz + (cz - road.z) * road.tx) > 0 ? 1 : -1;
            var nX = -road.tz * side, nZ = road.tx * side, dOff = EW[road.e] / 2 + SWW + 0.2;
            var mn = 1e9, mx = -1e9;
            for (i = 0; i < n; i++) { var pr = (pts[i][0] - road.x) * road.tx + (pts[i][1] - road.z) * road.tz; mn = Math.min(mn, pr); mx = Math.max(mx, pr); }
            mn -= 2.2; mx += 2.2;
            if (hash(b, 17, 1) < 0.5) mn += 3.4; else mx -= 3.4;
            var fh = ft === 6 ? 1.0 : ft === 8 ? 1.7 : 0.75, fcol = ft === 6 ? cPicket : ft === 8 ? cPaling : cBrickF;
            var segs = Math.max(1, Math.ceil((mx - mn) / 4));
            for (k = 0; k < segs; k++) {
              var s0 = mn + (mx - mn) * k / segs, s1 = mn + (mx - mn) * (k + 1) / segs;
              var fx0 = road.x + road.tx * s0 + nX * dOff, fz0 = road.z + road.tz * s0 + nZ * dOff, fx1 = road.x + road.tx * s1 + nX * dOff, fz1 = road.z + road.tz * s1 + nZ * dOff;
              if (onCarriageway(fx0, fz0, -1, 0.8) || onCarriageway(fx1, fz1, -1, 0.8) || onCarriageway((fx0 + fx1) / 2, (fz0 + fz1) / 2, -1, 0.8)) continue;
              var h0 = terrainH(fx0, fz0, 4), h1 = terrainH(fx1, fz1, 4);
              quadW(fx0, fz0, fx1, fz1, h0 - 0.1, h1 - 0.1, h0 + fh, h1 + fh, s0, s1, h0, fcol, ft * 10, 0, h1);
              if (ft === 1) { boxB(fx0, fz0, road.tx, road.tz, 0.2, 0.2, h0 - 0.1, h0 + fh + 0.15, fcol, 10); }
            }
          }
        }
      }
      if (occ) {
        var mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        for (i = 0; i < n; i++) { mnx = Math.min(mnx, pts[i][0]); mxx = Math.max(mxx, pts[i][0]); mnz = Math.min(mnz, pts[i][1]); mxz = Math.max(mxz, pts[i][1]); }
        var gx0 = clamp(Math.floor((mnx - ox) / 2) - 1, 0, 127), gx1 = clamp(Math.ceil((mxx - ox) / 2) + 1, 0, 127);
        var gz0 = clamp(Math.floor((mnz - oz) / 2) - 1, 0, 127), gz1 = clamp(Math.ceil((mxz - oz) / 2) + 1, 0, 127);
        for (var gz = gz0; gz <= gz1; gz++) for (var gx = gx0; gx <= gx1; gx++) {
          var qx = ox + gx * 2 + 1, qz = oz + gz * 2 + 1;
          if (qx < mnx - 2.5 || qx > mxx + 2.5 || qz < mnz - 2.5 || qz > mxz + 2.5) continue;
          if (pip(pts, qx, qz) || pip(pts, qx + 1.6, qz) || pip(pts, qx - 1.6, qz) || pip(pts, qx, qz + 1.6) || pip(pts, qx, qz - 1.6)) occ[gz * 128 + gx] = 1;
        }
      }
    }
    if (P.length) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
      g.setAttribute('aWin', new THREE.Float32BufferAttribute(W, 3));
      g.setAttribute('aMat', new THREE.Float32BufferAttribute(M, 1));
      var mesh = new THREE.Mesh(g, houseMat);
      mesh.castShadow = detail === 2; mesh.receiveShadow = detail === 2;
      group.add(mesh);
    }
    return occ;
  }

  /* ==========================================================
     TREES
     Where they go: OpenStreetMap's mapped trees, tree cover read from 10 m Sentinel-2 satellite imagery,
     garden trees in built-up blocks and street trees along footpaths.
     ========================================================== */
  var cBark = C('#8d857a'), cBarkD = C('#4a3d32'), cEuc = C('#56603f'), cEuc2 = C('#6b7350'), cGarden = C('#4f7234'), cGarden2 = C('#6d8a3c'), cPine = C('#24402c'), cBush = C('#4b5634');
  function blob(r, sx, sy, sz, x, y, z, col, detailed) {
    var g = detailed ? new THREE.IcosahedronGeometry(r, 0) : new THREE.OctahedronGeometry(r, 0);
    var p = g.getAttribute('position');
    for (var i = 0; i < p.count; i++) {
      var j = 0.82 + 0.36 * hash(i, Math.round(x * 10), Math.round(y * 10));
      p.setXYZ(i, p.getX(i) * sx * j + x, p.getY(i) * sy * j + y, p.getZ(i) * sz * j + z);
    }
    g.computeVertexNormals();
    return paint(g, col);
  }
  function trunk(h, r, col, sides) {
    var g = new THREE.CylinderGeometry(r * 0.6, r, h, sides || 5, 1, true); g.translate(0, h / 2 - 0.3, 0);
    return paint(g, col);
  }
  function makeTreeGeos(detailed) {
    var d = detailed, T = [];
    T.push(mergeGeos(d ? [trunk(7, 0.22, cBark, 6), blob(1, 2.4, 1.5, 2.2, 0.6, 7.6, 0.3, cEuc, d), blob(1, 2.0, 1.4, 2.1, -1.2, 8.8, -0.6, cEuc2, d),
      blob(1, 1.7, 1.2, 1.8, 0.3, 10.0, 0.9, cEuc, d), blob(1, 1.5, 1.1, 1.4, -0.4, 6.3, -1.4, cEuc2, d)]
      : [trunk(6, 0.2, cBark, 3), blob(1, 3.0, 2.4, 3.0, 0, 8.4, 0, cEuc, d)]));
    T.push(mergeGeos(d ? [trunk(3.2, 0.2, cBarkD, 6), blob(1, 2.6, 2.2, 2.6, 0, 4.8, 0, cGarden, d), blob(1, 1.9, 1.7, 1.9, 1.2, 5.9, 0.5, cGarden2, d), blob(1, 1.8, 1.6, 1.8, -1.0, 5.6, -0.8, cGarden, d)]
      : [trunk(3, 0.2, cBarkD, 3), blob(1, 3.0, 2.6, 3.0, 0, 5.2, 0, cGarden, d)]));
    var cones = d ? [paint(new THREE.ConeGeometry(2.3, 4.2, 7).translate(0, 3.6, 0), cPine), paint(new THREE.ConeGeometry(1.8, 3.6, 7).translate(0, 6.0, 0), cPine), paint(new THREE.ConeGeometry(1.1, 3.0, 7).translate(0, 8.3, 0), cPine)]
      : [paint(new THREE.ConeGeometry(2.2, 9.5, 4).translate(0, 5.6, 0), cPine)];
    T.push(mergeGeos([trunk(2.2, 0.18, cBarkD, d ? 5 : 3)].concat(cones)));
    T.push(mergeGeos(d ? [trunk(1.2, 0.12, cBarkD, 4), blob(1, 1.8, 1.3, 1.8, 0, 1.9, 0, cBush, d), blob(1, 1.3, 1.1, 1.4, 0.9, 2.5, 0.4, cEuc, d)]
      : [blob(1, 1.9, 1.5, 1.9, 0, 2.0, 0, cBush, d)]));
    return T;
  }
  var TREE_HI = makeTreeGeos(true), TREE_LO = makeTreeGeos(false);
  var WIND = { value: 0.3 };
  var treeMat = litMaterial(std({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.7 }), {
    key: 'tree', uniforms: { uWind: WIND },
    vhead: 'uniform float uWind; uniform float uTime;\n',
    vmain: '',
    color: 'diffuseColor.rgb *= (1.0 - 0.15 * uWet) * (0.86 + 0.28 * dnoise(vWP.xz * 1.3 + vWP.y * 0.7));',
    pre: '{ vec3 nn = normalize(vWN); float back = max(dot(-nn, normalize(cameraPosition - vWP)), 0.0); gl_FragColor.rgb += diffuseColor.rgb * vec3(0.5, 0.6, 0.25) * 0.12 * (1.0 - uNight); }'
  });
  (function () {
    var prev = treeMat.onBeforeCompile;
    treeMat.onBeforeCompile = function (sh) {
      prev(sh);
      sh.uniforms.uTime = LIT.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float ph = 0.0;',
        '#ifdef USE_INSTANCING',
        ' ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;',
        '#endif',
        'float sway = max(position.y - 2.0, 0.0) * 0.012 * uWind;',
        'transformed.x += sin(uTime * 1.7 + ph) * sway; transformed.z += cos(uTime * 1.3 + ph) * sway * 0.7;'
      ].join('\n'));
    };
  })();
  var TREEB = null;   /* mapped trees bucketed by 256 m tile */
  function bucketTrees() {
    TREEB = new Map();
    for (var i = 0; i < TREERAW.length; i += 2) {
      var x = TREERAW[i] / 10, z = TREERAW[i + 1] / 10, t = clamp(((z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x + HALF) / 256) | 0, 0, 239);
      if (!TREEB.has(t)) TREEB.set(t, []);
      TREEB.get(t).push(x, z);
    }
  }
  var tcol = new THREE.Color();
  function buildTrees(group, x0, z0, size, detail, occ, jx, jz) {
    var L = [[], [], [], []], urb = urbanAt(x0 + size / 2, z0 + size / 2), i, j, q;
    function free(x, z, pad) {
      if (landAt(LW, x, z)) return false;
      if (occ) { var gx = ((x - x0) / 2) | 0, gz = ((z - z0) / 2) | 0; if (gx >= 0 && gz >= 0 && gx < 128 && gz < 128 && occ[gz * 128 + gx]) return false; }
      return !onRoadArea(x, z, pad);
    }
    function put(kind, x, z, s, sink) {
      if (inPad(x, z, 2)) return;
      var h = detail === 0 ? demH(x, z) : terrainH(x, z, 4);
      if (h < 0.5) return;
      L[kind].push(x, h - (sink || 0.25), z, s, hash(Math.round(x * 3), Math.round(z * 3), 1) * 6.283);
    }
    if (detail === 0) {
      for (j = 0; j < size / 40; j++) for (i = 0; i < size / 40; i++) {
        var x = x0 + i * 40 + 20, z = z0 + j * 40 + 20, d = treeCover(x, z);
        if (d < 0.3) continue;
        var cnt = Math.round(d * 1.7 + hash(i + jx, j, 3) - 0.5);
        for (q = 0; q < cnt; q++) {
          var tx = x + (hash(i, j, q * 2) - 0.5) * 38, tz = z + (hash(j, i, q * 2 + 1) - 0.5) * 38, h0 = demH(tx, tz);
          if (h0 > 1060 || h0 < 1) continue;
          put(hash(i, q, 9) < 0.85 ? 0 : 2, tx, tz, (1.25 + hash(q, i, j) * 0.5) * (h0 > 800 ? 0.7 : 1), 0.4);
        }
      }
    } else {
      var t = jz * 240 + jx, mapped = TREEB.get(t) || [];
      for (q = 0; q < mapped.length; q += 2) {
        var mk = hash(q, t, 4);
        put(mk < 0.5 ? 1 : mk < 0.8 ? 0 : mk < 0.9 ? 2 : 3, mapped[q], mapped[q + 1], 0.8 + hash(q, t, 5) * 0.45);
      }
      for (j = 0; j < 13; j++) for (i = 0; i < 13; i++) {
        var cx = x0 + i * 20 + 10, cz = z0 + j * 20 + 10, dd = treeCover(cx, cz), hgt = demH(cx, cz);
        var n = Math.floor(dd * dd * 5.5 + hash(i + jx * 13, j + jz * 13, 1));
        var yard = urb >= 40 && dd < 0.45 && hash(i + jx * 13, j + jz * 13, 2) < 0.42 ? 1 : 0;
        for (q = 0; q < n + yard; q++) {
          var px = cx + (hash(i * 7 + q, j + jx, 3) - 0.5) * 19, pz = cz + (hash(j * 7 + q, i + jz, 4) - 0.5) * 19, hh = hash(q, i * 13 + j, 5);
          if (!free(px, pz, 1.2)) continue;
          var kind, s;
          if (q >= n || urb >= 40) { kind = hh < 0.4 ? 1 : hh < 0.7 ? 0 : hh < 0.85 ? 2 : 3; s = 0.75 + hash(q, j, i) * 0.45; }
          else { kind = hh < 0.74 ? 0 : hh < 0.95 ? 3 : 2; s = 0.95 + hash(q, j, i) * 0.7; }
          if (hgt > 760) { s *= clamp(1 - (hgt - 760) / 420, 0.35, 1); if (hgt > 900) kind = 3; }
          if (hgt > 1100) continue;
          put(kind, px, pz, s);
        }
      }
      /* street trees in the footpath */
      if (urb >= 40) {
        var gx0 = clamp(((x0 + HALF) / GC) | 0, 0, GN - 1), gz0 = clamp(((z0 + HALF) / GC) | 0, 0, GN - 1), id = ++stampId;
        for (var gz = gz0; gz < gz0 + 4; gz++) for (var gx = gx0; gx < gx0 + 4; gx++) {
          var c = gz * GN + gx;
          for (var k = CS[c]; k < CS[c + 1]; k++) {
            var si = CI[k], e = PE[si];
            if (stampP[si] === id || !ESW[e] || ECL[e] < 4) continue;
            stampP[si] = id;
            var s0 = Math.ceil(PL[si] / 17) * 17;
            if (s0 >= PL[si + 1] || hash(e, s0, 6) > 0.55 || Math.abs(((s0 + 19) % 38) - 19) < 5) continue;
            var f = (s0 - PL[si]) / ((PL[si + 1] - PL[si]) || 1), side = hash(e, s0, 7) < 0.5 ? 1 : -1, off = EW[e] / 2 + SWW - 0.55;
            var sx = PX[si] + (PX[si + 1] - PX[si]) * f + PNX[si] * off * side, sz = PZ[si] + (PZ[si + 1] - PZ[si]) * f + PNZ[si] * off * side;
            if (sx < x0 || sz < z0 || sx >= x0 + 256 || sz >= z0 + 256) continue;
            if (Math.hypot(sx - VX[EA[e]], sz - VZ[EA[e]]) < VTRIM[EA[e]] + 2 || Math.hypot(sx - VX[EB[e]], sz - VZ[EB[e]]) < VTRIM[EB[e]] + 2) continue;
            if (onCarriageway(sx, sz, e, 0.4) || inPad(sx, sz, 3)) continue;
            L[1].push(sx, PH[si] + KERB - 0.2, sz, 0.7 + hash(e, s0, 8) * 0.3, hash(e, s0, 9) * 6.283);
          }
        }
      }
    }
    var geos = detail === 2 ? TREE_HI : TREE_LO;
    for (var kind2 = 0; kind2 < 4; kind2++) {
      var arr = L[kind2], cnt2 = arr.length / 5;
      if (!cnt2) continue;
      var im = new THREE.InstancedMesh(shareGeo(geos[kind2], x0 + size / 2, arr[1], z0 + size / 2, size * 0.75 + 40), treeMat, cnt2);
      for (q = 0; q < cnt2; q++) {
        var s2 = arr[q * 5 + 3];
        qtmp.setFromAxisAngle(yAxis, arr[q * 5 + 4]);
        mtmp.compose(vtmp.set(arr[q * 5], arr[q * 5 + 1], arr[q * 5 + 2]), qtmp, stmp.set(s2, s2 * (0.9 + hash(q, kind2, 3) * 0.25), s2));
        im.setMatrixAt(q, mtmp);
        var v = 0.82 + hash(q, kind2, 4) * 0.3;
        tcol.setRGB(v * (0.95 + hash(q, 1, kind2) * 0.12), v, v * (0.9 + hash(q, 2, kind2) * 0.12));
        im.setColorAt(q, tcol);
      }
      stmp.set(1, 1, 1);
      im.castShadow = detail >= 1;
      group.add(im);
    }
  }

  /* ==========================================================
     TRAFFIC LIGHTS, from OpenStreetMap's traffic signal nodes
     ========================================================== */
  var SIGS = [], SIGV = new Map(), SIGT = new Map();
  function setupSignals() {
    for (var s = 0; s < SIGRAW.length; s += 2) {
      var x = SIGRAW[s] / 10, z = SIGRAW[s + 1] / 10, bestV = -1, bd = 32;
      if (!nearRoad(x, z, 40, 0)) continue;
      var e = Q.e;
      [EA[e], EB[e]].forEach(function (v) { var d = Math.hypot(VX[v] - x, VZ[v] - z); if (d < bd && VAS[v + 1] - VAS[v] >= 3) { bd = d; bestV = v; } });
      if (bestV < 0) {
        /* look a little wider for the junction this signal belongs to */
        for (var k = 0; k < 2 && bestV < 0; k++) { }
      }
      var sig;
      if (bestV >= 0) {
        if (SIGV.has(bestV)) continue;
        sig = { v: bestV, x: VX[bestV], z: VZ[bestV], appr: [], off: hash(bestV, 1, 1) * 40, cyc: 40, heads: null, groupOf: new Map() };
        var ref = null;
        for (var i = VAS[bestV]; i < VAS[bestV + 1]; i++) {
          var ee = VAI[i] >> 1, end = VAI[i] & 1;
          if (end === 0 && (EF[ee] & 1)) continue;
          var a = ES[ee], b = ES[ee + 1] - 1, p0 = end ? Math.max(a, b - 1) : Math.min(b, a + 1), p1 = end ? b : a;
          var dx = PX[p1] - PX[p0], dz = PZ[p1] - PZ[p0], l = Math.hypot(dx, dz) || 1;
          dx /= l; dz /= l;
          var ang = Math.atan2(dz, dx);
          if (ref === null) ref = ang;
          var df = Math.abs(((ang - ref) % Math.PI + Math.PI * 1.5) % Math.PI - Math.PI / 2);
          var grp = df > Math.PI / 4 ? 0 : 1;
          sig.appr.push({ e: ee, end: end, dx: dx, dz: dz, grp: grp });
          sig.groupOf.set(ee * 2 + end, grp);
        }
        if (sig.appr.length < 2) continue;
        SIGV.set(bestV, sig);
      } else {
        if (!nearRoad(x, z, 25, 0)) continue;
        var pi = Q.i, ex = PX[pi + 1] - PX[pi], ez = PZ[pi + 1] - PZ[pi], el = Math.hypot(ex, ez) || 1;
        ex /= el; ez /= el;
        sig = { v: -1, x: x, z: z, pi: pi, appr: [], off: hash(s, 2, 2) * 30, cyc: 30, heads: null, groupOf: new Map(), crossing: true };
        var px = PX[pi] + (PX[pi + 1] - PX[pi]) * Q.t, pz = PZ[pi] + (PZ[pi + 1] - PZ[pi]) * Q.t;
        sig.x = px; sig.z = pz; sig.y = Q.h;
        sig.appr.push({ e: Q.e, end: 1, dx: ex, dz: ez, grp: 0, at: [px, pz] });
        if (!(EF[Q.e] & 1)) sig.appr.push({ e: Q.e, end: 0, dx: -ex, dz: -ez, grp: 0, at: [px, pz] });
      }
      SIGS.push(sig);
      var tk = clamp(((sig.z + HALF) / 256) | 0, 0, 239) * 240 + clamp(((sig.x + HALF) / 256) | 0, 0, 239);
      if (!SIGT.has(tk)) SIGT.set(tk, []);
      SIGT.get(tk).push(sig);
    }
  }
  /* 0 red, 1 amber, 2 green */
  function sigState(sig, grp, t) {
    var c = ((t + sig.off) % sig.cyc + sig.cyc) % sig.cyc;
    if (sig.crossing) return c < 21 ? 2 : c < 24 ? 1 : 0;
    var h = c < 20 ? c : c - 20, mine = (c < 20 ? 0 : 1) === grp;
    if (!mine) return 0;
    return h < 15 ? 2 : h < 18 ? 1 : 0;
  }
  var LAMP_ON = [new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.25, 0.15) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.2) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 4.5, 1.8) })];
  var LAMP_OFF = [new THREE.MeshBasicMaterial({ color: C('#2a0b09') }), new THREE.MeshBasicMaterial({ color: C('#2a1d07') }), new THREE.MeshBasicMaterial({ color: C('#0a2116') })];
  var lensGeo = new THREE.CircleGeometry(0.13, 14);
  var cSigPole = C('#2c302d'), cSigHead = C('#1b1d1c'), cSigBack = C('#d8c64a');
  function buildSignals(group, x0, z0, info) {
    var tk = clamp(((z0 + 128 + HALF) / 256) | 0, 0, 239) * 240 + clamp(((x0 + 128 + HALF) / 256) | 0, 0, 239), list = SIGT.get(tk);
    if (!list) return;
    var bp = [], bc = [], bn = [], bi = [], mk = [], mki = [];
    list.forEach(function (sig) {
      sig.heads = [];
      sig.appr.forEach(function (ap) {
        var w = EW[ap.e] / 2, setb = sig.crossing ? 0 : VR[sig.v] + 2.2, sideOff = w + (ESW[ap.e] ? SWW * 0.55 : 1.4);
        var bx = (ap.at ? ap.at[0] : sig.x) - ap.dx * setb + ap.dz * sideOff, bz = (ap.at ? ap.at[1] : sig.z) - ap.dz * setb - ap.dx * sideOff;
        var by = (sig.crossing ? sig.y : VH[sig.v]) + (ESW[ap.e] ? KERB : 0) - 0.1;
        box(bp, bc, bn, bi, bx, bz, ap.dx, ap.dz, 0.07, 0.07, by, by + 3.6, cSigPole, cSigPole);
        box(bp, bc, bn, bi, bx - ap.dx * 0.12, bz - ap.dz * 0.12, ap.dx, ap.dz, 0.12, 0.2, by + 2.7, by + 3.75, cSigHead, cSigHead);
        box(bp, bc, bn, bi, bx - ap.dx * 0.02, bz - ap.dz * 0.02, ap.dx, ap.dz, 0.02, 0.3, by + 2.6, by + 3.85, cSigBack, cSigBack);
        var head = { grp: ap.grp, lamps: [] };
        for (var q = 0; q < 3; q++) {
          var m = new THREE.Mesh(lensGeo, LAMP_OFF[q]);
          m.position.set(bx - ap.dx * 0.25, by + 3.52 - q * 0.33, bz - ap.dz * 0.25);
          m.rotation.y = Math.atan2(-ap.dx, -ap.dz);
          group.add(m); head.lamps.push(m);
        }
        sig.heads.push(head);
        /* painted lines: two pedestrian crossing lines across the road and a stop line across the approaching lane */
        var cx0 = ap.at ? ap.at[0] : sig.x, cz0 = ap.at ? ap.at[1] : sig.z, lx = ap.dz, lz = -ap.dx, two = !(EF[ap.e] & 1);
        var d0 = sig.crossing ? -1.6 : VR[sig.v] + 0.6;
        var lines = [[d0, -w + 0.3, w - 0.3, 0.3], [d0 + 2.8, -w + 0.3, w - 0.3, 0.3], [d0 + 3.6, two ? 0.1 : -w + 0.3, w - 0.3, 0.45]];
        if (sig.crossing) lines.push([-d0 - 2.8, -w + 0.3, w - 0.3, 0.3]);
        lines.forEach(function (ln) {
          var mx = cx0 - ap.dx * ln[0], mz = cz0 - ap.dz * ln[0], my = nearRoad(mx, mz, 12, 0) ? Q.h + 0.025 : VH[Math.max(0, sig.v)] + 0.025;
          var hl = ln[3] / 2, a = ln[1], c = ln[2], k = mk.length / 3;
          mk.push(mx + lx * a - ap.dx * hl, my, mz + lz * a - ap.dz * hl, mx + lx * c - ap.dx * hl, my, mz + lz * c - ap.dz * hl,
                  mx + lx * c + ap.dx * hl, my, mz + lz * c + ap.dz * hl, mx + lx * a + ap.dx * hl, my, mz + lz * a + ap.dz * hl);
          mki.push(k, k + 2, k + 1, k, k + 3, k + 2);
        });
      });
      info.sigs.push(sig);
    });
    if (mki.length) {
      var gm = new THREE.BufferGeometry(); gm.setAttribute('position', new THREE.Float32BufferAttribute(mk, 3));
      var nm = new Float32Array(mk.length); for (var q = 1; q < nm.length; q += 3) nm[q] = 1; gm.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
      gm.setIndex(mki); var mm = new THREE.Mesh(gm, markMat); mm.receiveShadow = true; group.add(mm);
    }
    if (bi.length) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
      g.setIndex(bi);
      group.add(new THREE.Mesh(g, builtMat));
    }
  }
  var activeSigs = new Set();
  function updateSignals(t) {
    activeSigs.forEach(function (sig) {
      if (!sig.heads) return;
      sig.heads.forEach(function (h) {
        var s = sigState(sig, h.grp, t);
        for (var q = 0; q < 3; q++) {
          var on = (q === 0 && s === 0) || (q === 1 && s === 1) || (q === 2 && s === 2);
          h.lamps[q].material = on ? LAMP_ON[q] : LAMP_OFF[q];
        }
      });
    });
  }
