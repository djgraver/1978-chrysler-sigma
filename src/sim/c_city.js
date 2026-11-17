
  /* ==========================================================
     BUILDINGS
     Every footprint is a real OpenStreetMap building. Its style (Georgian sandstone, Federation brick,
     weatherboard, 60s-70s brick veneer, modern, shed, industrial, city block, flats or church), roof shape,
     pitch and colours were chosen when the data was packed, from its tags, size, where it is in Hobart
     and, for bigger roofs, the colour seen from the satellite. Here each one is turned into walls, windows and a roof.
     ========================================================== */
  var BLD = null;
  function parseBuildings(buf) {
    var h = unpack(buf);
    BLD = { N: h.N, TS: h.get('TS'), BN: h.get('BN'), BS: h.get('BS'), BR: h.get('BR'), BP: h.get('BP'), BRC: h.get('BRC'), BWC: h.get('BWC'), BH: h.get('BH'), V: h.get('V') };
    BLD.BO = new Uint32Array(h.N + 1);
    for (var i = 0; i < h.N; i++) BLD.BO[i + 1] = BLD.BO[i] + BLD.BN[i] * 2;
    BLD.ROOF = h.ROOF.map(C); BLD.WALL = h.WALL.map(C);
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
  function buildBuildings(group, jx, jz, detail) {
    if (!BLD || jx < 0 || jz < 0 || jx >= 240 || jz >= 240) return null;
    var t = jz * 240 + jx, b0 = BLD.TS[t], b1 = BLD.TS[t + 1];
    var ox = -HALF + jx * 256, oz = -HALF + jz * 256, occ = detail === 2 ? new Uint8Array(128 * 128) : null;
    if (b1 <= b0) return occ;
    var P = [], N = [], Cc = [], W = [];
    function tri(a, b, c, col, wa, wb, wc, flat) {
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) return;
      nx /= l; ny /= l; nz /= l;
      if (flat && ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (var q = 0; q < 3; q++) { N.push(nx, ny, nz); Cc.push(col.r, col.g, col.b); }
      W.push(wa[0], wa[1], wa[2], wb[0], wb[1], wb[2], wc[0], wc[1], wc[2]);
    }
    var Z0 = [0, 0, 0], wcol = new THREE.Color(), rcol = new THREE.Color();
    for (var b = b0; b < b1; b++) {
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
      var gy = detail === 2 ? terrainH(cx, cz, 4) : demH(cx, cz), minG = gy;
      for (i = 0; i < n; i++) minG = Math.min(minG, demH(pts[i][0], pts[i][1]));
      var base = minG - 0.8, eave = gy + hgt;
      var wt = WINTYPE[st]; if (st === 7 && hgt > 24) wt = 5; if (detail === 1 && wt < 4) wt = 0;
      var code = wt * 1000 + (b * 7) % 997;
      /* roof frame */
      var o = (shape !== 0 && n >= 3) ? obb(pts) : null, rect = o ? area / Math.max(1, 4 * o.hl * o.hw) : 0;
      if (o && (o.hw < 1.2 || rect < 0.45)) { if (shape === 3) shape = 0; else if (rect < 0.45) pitch *= 0.6; }
      if (!o) shape = 0;
      var rise = shape === 0 ? 0 : (shape === 3 ? 2 * o.hw : o.hw) * Math.tan(pitch);
      if (detail === 1) { shape = 0; eave += rise * 0.4; }
      var par = (shape === 0 && (st === 7 || st === 8 || st === 10 || st === 6)) ? 0.7 : 0;
      function topAt(x, z) {
        if (shape !== 3) return eave + par;
        var v = (-(x - o.cx) * o.az + (z - o.cz) * o.ax) / o.hw;
        return eave + (v * 0.5 + 0.5) * rise;
      }
      /* walls */
      var u = 0;
      for (i = 0; i < n; i++) {
        var a = pts[i], c = pts[(i + 1) % n], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        var ta = topAt(a[0], a[1]), tb = topAt(c[0], c[1]);
        var wcode = len > 2.4 ? code : 0;
        var A0 = [a[0], base, a[1]], B0 = [c[0], base, c[1]], B1 = [c[0], tb, c[1]], A1 = [a[0], ta, a[1]];
        var wa0 = [u, base - gy, wcode], wb0 = [u + len, base - gy, wcode], wb1 = [u + len, tb - gy, wcode], wa1 = [u, ta - gy, wcode];
        if (sgn > 0) { tri(A0, A1, B1, wcol, wa0, wa1, wb1); tri(A0, B1, B0, wcol, wa0, wb1, wb0); }
        else { tri(A0, B1, A1, wcol, wa0, wb1, wa1); tri(A0, B0, B1, wcol, wa0, wb0, wb1); }
        u += len + 0.7;
      }
      /* roof */
      if (shape === 0 || shape === 3) {
        var contour = pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), faces = THREE.ShapeUtils.triangulateShape(contour, []);
        var ry = par ? eave + par - 0.25 : 0;
        faces.forEach(function (f) {
          var a = pts[f[0]], bb = pts[f[1]], c = pts[f[2]];
          tri([a[0], par ? ry : topAt(a[0], a[1]), a[1]], [bb[0], par ? ry : topAt(bb[0], bb[1]), bb[1]], [c[0], par ? ry : topAt(c[0], c[1]), c[1]], rcol, Z0, Z0, Z0, true);
        });
        if (st === 7 && area > 350 && hash(b, 9, 9) < 0.6 && detail === 2) {
          var pb = [], pc = [], pn = [], pi = [];
          box(pb, pc, pn, pi, cx, cz, 1, 0, 2.2, 1.6, eave + par - 0.3, eave + par + 2.2, cPlant, cPlant);
          for (var k = 0; k < pi.length; k += 3) {
            var ia = pi[k] * 3, ib = pi[k + 1] * 3, ic = pi[k + 2] * 3;
            tri([pb[ia], pb[ia + 1], pb[ia + 2]], [pb[ib], pb[ib + 1], pb[ib + 2]], [pb[ic], pb[ic + 1], pb[ic + 2]], cPlant, Z0, Z0, Z0);
          }
        }
      } else {
        var e = shape === 2 ? Math.max(0, o.hl - o.hw) : shape === 1 ? o.hl : shape === 5 ? Math.max(0, o.hl - o.hw * 0.45) : 0;
        var r0x = o.cx - o.ax * e, r0z = o.cz - o.az * e, r1x = o.cx + o.ax * e, r1z = o.cz + o.az * e, ry2 = eave + rise;
        var tops = [], rb = [];
        for (i = 0; i < n; i++) {
          var px = pts[i][0], pz = pts[i][1], dx = r1x - r0x, dz = r1z - r0z, L2 = dx * dx + dz * dz;
          var tt = L2 > 1e-9 ? clamp(((px - r0x) * dx + (pz - r0z) * dz) / L2, 0, 1) : 0;
          tops.push([r0x + dx * tt, ry2, r0z + dz * tt]);
          /* eaves stand out 0.4 m along the corner bisector */
          var pp = pts[(i + n - 1) % n], pq = pts[(i + 1) % n];
          var e1x = px - pp[0], e1z = pz - pp[1], e2x = pq[0] - px, e2z = pq[1] - pz, l1 = Math.hypot(e1x, e1z) || 1, l2 = Math.hypot(e2x, e2z) || 1;
          var n1x = e1z / l1 * sgn, n1z = -e1x / l1 * sgn, n2x = e2z / l2 * sgn, n2z = -e2x / l2 * sgn;
          var bx = n1x + n2x, bz = n1z + n2z, bl = Math.hypot(bx, bz) || 1, sc = 0.4 / Math.max(0.35, (bx * n1x + bz * n1z) / bl);
          rb.push([px + bx / bl * sc, eave - 0.12, pz + bz / bl * sc]);
        }
        for (i = 0; i < n; i++) {
          var j = (i + 1) % n, T0 = tops[i], T1 = tops[j];
          var same = Math.abs(T0[0] - T1[0]) + Math.abs(T0[2] - T1[2]) < 0.05;
          var gable = same && shape === 1;
          var a0 = gable ? [pts[i][0], eave, pts[i][1]] : rb[i], a1 = gable ? [pts[j][0], eave, pts[j][1]] : rb[j];
          var cl = gable ? wcol : rcol;
          if (same) tri(a0, a1, T0, cl, Z0, Z0, Z0, !gable);
          else { tri(a0, a1, T1, cl, Z0, Z0, Z0, true); tri(a0, T1, T0, cl, Z0, Z0, Z0, true); }
        }
        if (chim && detail === 2) {
          var chx = r0x + (r1x - r0x) * 0.2 + (-o.az) * o.hw * 0.25, chz = r0z + (r1z - r0z) * 0.2 + o.ax * o.hw * 0.25;
          var cb = [], ccl = [], cnn = [], cii = [];
          box(cb, ccl, cnn, cii, chx, chz, o.ax, o.az, 0.35, 0.35, eave, ry2 + 0.9, cChimney, cChimney);
          for (var k2 = 0; k2 < cii.length; k2 += 3) {
            var i1 = cii[k2] * 3, i2 = cii[k2 + 1] * 3, i3 = cii[k2 + 2] * 3;
            tri([cb[i1], cb[i1 + 1], cb[i1 + 2]], [cb[i2], cb[i2 + 1], cb[i2 + 2]], [cb[i3], cb[i3 + 1], cb[i3 + 2]], cChimney, Z0, Z0, Z0);
          }
        }
      }
      /* mark the footprint so trees stay out of houses */
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
      group.add(new THREE.Mesh(g, houseMat));
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
  var treeMat = litMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'tree', uniforms: { uWind: WIND },
    vhead: 'uniform float uWind; uniform float uTime;\n',
    vmain: '',
    color: 'diffuseColor.rgb *= 1.0 - 0.15 * uWet;'
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
            if (onCarriageway(sx, sz, e, 0.4)) continue;
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
      im.castShadow = detail === 2;
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
    var bp = [], bc = [], bn = [], bi = [];
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
      });
      info.sigs.push(sig);
    });
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
