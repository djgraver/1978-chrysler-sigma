
  /* ==========================================================
     THE SIGMA
     ========================================================== */
  var sigma = buildSigma();
  var carG = sigma.group; carG.rotation.order = 'YZX'; scene.add(carG);
  carG.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  sigma.wheels.forEach(function (w) { w.rotation.order = 'YZX'; });
  var WB = sigma.axF - sigma.axR;
  var car = { x: 0, z: 0, y: 0, h: 0, v: 0, steer: 0, pitch: 0, roll: 0, spin: 0, onRoad: true, edge: -1, gear: 1, rpm: 800, brake: false };
  var VMAX = 100 / 3.6;
  /* Astron 2.0 with a four-speed: engine rpm per m/s in each gear, and push in m/s^2 at peak torque */
  var GEARS = [null, { k: 360, a: 2.55 }, { k: 215, a: 1.9 }, { k: 148, a: 1.5 }, { k: 112, a: 1.1 }];
  function torque(rpm) { return clamp(0.62 + 0.38 * Math.sin(clamp((rpm - 1000) / 4200, 0, 1) * Math.PI * 0.85), 0.5, 1) * (rpm > 5600 ? 0.4 : 1); }
  var keys = {}, touch = { l: 0, r: 0, g: 0, b: 0 };
  var camYaw = 0, camDist = 8.2, camMode = 0, orbit = { yaw: 0, pitch: 0, idle: 0, drag: false, px: 0, py: 0 };
  function placeOnRoad(x, z) {
    var found = false, r;
    for (r = 60; r <= 4000 && !found; r *= 2) {
      var best = 1e18, bi = -1;
      var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
      var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
      for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
        var i = CI[k], d = (PX[i] - x) * (PX[i] - x) + (PZ[i] - z) * (PZ[i] - z);
        if (ECL[PE[i]] > 7) continue;
        if (d < best) { best = d; bi = i; }
      }
      if (bi >= 0) {
        var e = PE[bi]; if (bi === ES[e + 1] - 1) bi--;
        var dx = PX[bi + 1] - PX[bi], dz = PZ[bi + 1] - PZ[bi], l = Math.hypot(dx, dz) || 1, off = (EF[e] & 1) ? 0 : EW[e] / 4;
        car.h = Math.atan2(-dz, dx);
        car.x = PX[bi] + dz / l * off; car.z = PZ[bi] - dx / l * off;
        car.y = PH[bi]; car.v = 0; car.steer = 0; car.gear = 1; found = true;
      }
    }
    camYaw = car.h; orbit.yaw = 0; orbit.pitch = 0;
    lastPlan.x = 1e9;
  }
  function stepCar(dt) {
    var up = keys.ArrowUp || keys.KeyW || touch.g, dn = keys.ArrowDown || keys.KeyS || touch.b;
    var lf = keys.ArrowLeft || keys.KeyA || touch.l, rt = keys.ArrowRight || keys.KeyD || touch.r, hb = keys.Space;
    var v = car.v, a = 0, gr = GEARS[car.gear];
    car.rpm = Math.max(850, Math.abs(v) * gr.k + (up && v < 2 ? 1400 : 0));
    if (car.rpm > (up && v < VMAX - 0.6 ? 5000 : 2900) && car.gear < 4) car.gear++;
    else if (car.gear > 1 && Math.abs(v) * GEARS[car.gear - 1].k < 2600) car.gear--;
    gr = GEARS[car.gear];
    if (up) {
      if (v >= -0.5) { if (v < VMAX) a += gr.a * torque(car.rpm) * (1 - sstep(VMAX - 0.25, VMAX + 0.05, v)); }
      else a += 7;
    }
    car.brake = !!(dn && v > 0.6) || !!hb;
    if (dn) a -= v > 0.6 ? 7.5 : 1.8 * (1 + v / 9);
    if (hb) a -= Math.sign(v) * 9;
    a -= Math.sign(v) * (0.15 + 0.00048 * v * v + (car.onRoad ? 0 : 1.2 + 0.08 * Math.abs(v)));
    if (!up && v > 2) a -= 0.35;                              /* engine braking */
    a -= 9.81 * Math.sin(car.pitch) * 0.85;
    var nv = v + a * dt;
    if (!up && !dn && v !== 0 && Math.sign(nv) !== Math.sign(v) && Math.abs(car.pitch) < 0.03) nv = 0;
    if (hb && Math.sign(nv) !== Math.sign(v)) nv = 0;
    car.v = clamp(nv, -6, VMAX + 0.4);
    var maxSteer = 0.6 / (1 + Math.pow(Math.abs(car.v) / 11, 1.6)), target = ((lf ? 1 : 0) - (rt ? 1 : 0)) * maxSteer;
    car.steer += clamp(target - car.steer, -1.6 * dt, 1.6 * dt);
    var cs = Math.cos(car.h), sn = Math.sin(car.h);
    var rx = car.x - cs * (-sigma.axR), rz = car.z + sn * (-sigma.axR);
    rx += car.v * cs * dt; rz -= car.v * sn * dt;
    car.h += car.v / WB * Math.tan(car.steer) * dt;
    cs = Math.cos(car.h); sn = Math.sin(car.h);
    car.x = rx + cs * (-sigma.axR); car.z = rz - sn * (-sigma.axR);
    var r = Math.hypot(car.x, car.z);
    if (r > RADIUS - 60) { car.x *= (RADIUS - 60) / r; car.z *= (RADIUS - 60) / r; car.v *= 0.9; }
    var fx = car.x + cs * sigma.axF, fz = car.z - sn * sigma.axF, bx = car.x + cs * sigma.axR, bz = car.z - sn * sigma.axR, hw = 0.68;
    var hFL = carGround(fx - sn * hw, fz - cs * hw, car.y), hFR = carGround(fx + sn * hw, fz + cs * hw, car.y);
    var hBL = carGround(bx - sn * hw, bz - cs * hw, car.y), hBR = carGround(bx + sn * hw, bz + cs * hw, car.y);
    var hc = carGround(car.x, car.z, car.y);
    car.onRoad = G.onRoad; car.edge = G.e;
    var ty = (hFL + hFR + hBL + hBR) / 4, k = Math.min(1, dt * 14);
    car.y += (ty - car.y) * Math.min(1, dt * 20);
    car.pitch += (Math.atan2((hFL + hFR - hBL - hBR) / 2, WB) - car.pitch) * k;
    car.roll += (Math.atan2((hFL + hBL - hFR - hBR) / 2, 2 * hw) - car.roll) * k;
    if (car.y < -0.6 || hc < -0.8) placeOnRoad(car.x, car.z);
    car.spin -= car.v * dt / sigma.tyreR;
    carG.position.set(car.x, car.y, car.z);
    carG.rotation.set(car.roll, car.h, car.pitch);
    sigma.wheels.forEach(function (w, i) { w.rotation.set(0, i < 2 ? car.steer : 0, car.spin); });
  }

  /* ==========================================================
     VINTAGE TRAFFIC: seven simple period body types, built from side profiles
     ========================================================== */
  var VINTAGE = ['#c9a227', '#6b7f3a', '#c4561d', '#5a3a24', '#e8dcb8', '#7fa7c9', '#eeeae0', '#d4a81c', '#6e1f24', '#2f4d36',
                 '#8fa0ad', '#a32b23', '#c2ad86', '#2f6e6a', '#4d3a5c', '#9cb43c', '#3c4f7a', '#b98a5a', '#d9d2c0', '#7a2f1c'].map(C);
  var TYPES = [
    { name: 'sedan', L: 4.6, W: 1.72, body: [[0, 0.36], [0, 0.8], [0.12, 0.88], [1.0, 0.9], [3.3, 0.92], [4.45, 0.84], [4.6, 0.76], [4.6, 0.36]],
      cab: [[1.0, 0.9], [1.42, 1.36], [2.75, 1.37], [3.3, 0.92]], pillars: [2.12], wf: 3.55, wr: 0.95 },
    { name: 'wagon', L: 4.75, W: 1.74, body: [[0, 0.36], [0, 0.86], [0.08, 0.92], [3.35, 0.94], [4.6, 0.86], [4.75, 0.78], [4.75, 0.36]],
      cab: [[0.12, 0.92], [0.22, 1.4], [2.85, 1.41], [3.35, 0.94]], pillars: [1.25, 2.2], wf: 3.65, wr: 1.0 },
    { name: 'ute', L: 4.8, W: 1.74, body: [[0, 0.38], [0, 0.98], [2.0, 0.98], [2.0, 0.92], [3.4, 0.94], [4.65, 0.86], [4.8, 0.78], [4.8, 0.38]],
      cab: [[2.02, 0.92], [2.12, 1.4], [2.95, 1.41], [3.4, 0.94]], pillars: [], wf: 3.75, wr: 1.0, tray: true },
    { name: 'van', L: 4.4, W: 1.76, body: [[0, 0.34], [0, 1.88], [0.08, 1.96], [3.55, 1.96], [4.2, 1.62], [4.4, 1.02], [4.4, 0.34]],
      glass: [[0.45, 1.28], [0.45, 1.74], [3.5, 1.74], [3.95, 1.3]], pillars: [1.7, 2.6], wf: 3.55, wr: 0.85 },
    { name: 'small', L: 3.65, W: 1.56, body: [[0, 0.34], [0, 0.88], [0.08, 0.96], [2.6, 0.94], [3.5, 0.82], [3.65, 0.72], [3.65, 0.34]],
      cab: [[0.12, 0.96], [0.3, 1.37], [1.95, 1.38], [2.6, 0.94]], pillars: [1.25], wf: 2.95, wr: 0.68 },
    { name: 'fastback', L: 4.5, W: 1.74, body: [[0, 0.36], [0, 0.84], [0.25, 0.9], [3.2, 0.88], [4.35, 0.8], [4.5, 0.72], [4.5, 0.36]],
      cab: [[0.35, 0.9], [1.85, 1.3], [2.65, 1.31], [3.2, 0.88]], pillars: [1.95], wf: 3.5, wr: 0.95 },
    { name: 'truck', L: 6.2, W: 2.1, body: [[4.5, 0.55], [4.5, 2.15], [5.75, 2.15], [6.2, 1.55], [6.2, 0.55]],
      glass: [[4.62, 1.45], [4.62, 2.0], [5.7, 2.0], [6.08, 1.5]], pillars: [], wf: 5.3, wr: 1.3, box: true, big: true }
  ];
  var cGlass = C('#141a1f'), cChrome = C('#d5d8da'), cTyre = C('#151515'), cHead = C('#f3efd8'), cTail = C('#8e1212'), cGrille = C('#1a1a1a'), cBoxW = C('#d9dad5'), cTray = C('#262626');
  function extrude(poly, depth, z0, bevel) {
    var s = new THREE.Shape(poly.map(function (p) { return new THREE.Vector2(p[0], p[1]); }));
    var g = new THREE.ExtrudeGeometry(s, { depth: depth - (bevel ? 0.08 : 0), bevelEnabled: !!bevel, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
    g.translate(0, 0, z0 + (bevel ? 0.04 : 0));
    return g;
  }
  function glowAttr(g, v) { var n = g.getAttribute('position').count; g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(v), 1)); return g; }
  function mergeGlow(list) {
    var m = mergeGeos(list.map(function (g) { return g.index ? g.toNonIndexed() : g; }));
    var gl = [];
    list.forEach(function (g) { var a = (g.index ? g.toNonIndexed() : g).getAttribute('glow'); for (var i = 0; i < a.count; i++) gl.push(a.array[i]); });
    m.setAttribute('glow', new THREE.Float32BufferAttribute(gl, 1));
    return m;
  }
  function buildType(T) {
    var W = T.W, L = T.L, paintParts = [], trim = [];
    function addT(g, col, glow) { trim.push(glowAttr(paint(g.index ? g.toNonIndexed() : g, col), glow || 0)); }
    paintParts.push(extrude(T.body, W, -W / 2, true));
    if (T.cab) {
      addT(extrude(T.cab, W - 0.16, -(W - 0.16) / 2), cGlass);
      var top = T.cab[1][1], tx0 = T.cab[1][0], tx1 = T.cab[2][0];
      paintParts.push(extrude([[tx0 - 0.03, top - 0.07], [tx0, top + 0.015], [tx1, top + 0.02], [tx1 + 0.03, top - 0.07]], W - 0.12, -(W - 0.12) / 2));
      var pillars = [[T.cab[0][0], T.cab[1][0]], [T.cab[3][0], T.cab[2][0]]];
      T.pillars.forEach(function (px) { pillars.push([px, px]); });
      pillars.forEach(function (pp) {
        var b0 = T.cab[0][1], t0 = top;
        paintParts.push(extrude([[pp[0] - 0.05, b0], [pp[0] + 0.05, b0], [pp[1] + 0.05, t0], [pp[1] - 0.05, t0]], W - 0.13, -(W - 0.13) / 2));
      });
    }
    if (T.glass) {
      addT(extrude(T.glass, W + 0.02, -(W + 0.02) / 2), cGlass);
      T.pillars.forEach(function (px) { paintParts.push(extrude([[px - 0.06, T.glass[0][1]], [px + 0.06, T.glass[0][1]], [px + 0.06, T.glass[1][1]], [px - 0.06, T.glass[1][1]]], W + 0.04, -(W + 0.04) / 2)); });
    }
    if (T.tray) addT(new THREE.BoxGeometry(1.9, 0.05, W - 0.2).translate(1.0, 0.97, 0), cTray);
    if (T.box) addT(new THREE.BoxGeometry(4.4, 2.5, W).translate(2.2, 1.65, 0), cBoxW);
    /* wheels, bumpers, grille, lamps */
    var R = T.big ? 0.45 : 0.32;
    [[T.wf, 1], [T.wf, -1], [T.wr, 1], [T.wr, -1]].forEach(function (w) {
      var cyl = new THREE.CylinderGeometry(R, R, 0.2, 12); cyl.rotateX(Math.PI / 2); cyl.translate(w[0], R, w[1] * (W / 2 - 0.08));
      addT(cyl, cTyre);
      var cap = new THREE.CircleGeometry(R * 0.55, 10); if (w[1] < 0) cap.rotateY(Math.PI); cap.translate(w[0], R, w[1] * (W / 2 + 0.025));
      addT(cap, cChrome);
    });
    var front = T.body[T.body.length - 2][0], fy = T.big ? 0.75 : 0.52;
    addT(new THREE.BoxGeometry(0.12, 0.13, W + 0.04).translate(front + 0.02, T.big ? 0.62 : 0.42, 0), cChrome);
    addT(new THREE.BoxGeometry(0.12, 0.13, W + 0.04).translate((T.box ? 0 : 0) - 0.02, T.big ? 0.62 : 0.42, 0), cChrome);
    addT(new THREE.BoxGeometry(0.03, 0.2, W * 0.45).translate(front + 0.005, fy + 0.08, 0), cGrille);
    [1, -1].forEach(function (s) {
      var hl = new THREE.CircleGeometry(0.09, 12); hl.rotateY(Math.PI / 2); hl.translate(front + 0.012, fy + 0.1, s * (W / 2 - 0.22));
      addT(hl, cHead, 1);
      var tl = new THREE.PlaneGeometry(0.22, 0.14); tl.rotateY(-Math.PI / 2); tl.translate(-0.012, fy + 0.18 + (T.box ? 0.1 : 0), s * (W / 2 - 0.2));
      addT(tl, cTail, 2);
    });
    var pg = mergeGeos(paintParts.map(function (g) { return g.index ? g.toNonIndexed() : g; }));
    var tg = mergeGlow(trim);
    var shift = -L / 2;
    pg.translate(shift, 0, 0); tg.translate(shift, 0, 0);
    T.lamps = { fx: front + shift + 0.05, rx: shift - 0.05, y: fy + 0.1, ty: fy + 0.18 + (T.box ? 0.1 : 0), w: W / 2 - 0.22 };
    return { paint: pg, trim: tg };
  }
  var carPaintMat = litMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff }), { key: 'carpaint', color: 'diffuseColor.rgb *= 1.0 - 0.1 * uWet;' });
  var carTrimMat = litMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), {
    key: 'cartrim', vhead: 'attribute float glow; varying float vGlow;\n', vmain: 'vGlow = glow;',
    fhead: 'varying float vGlow;\n',
    pre: 'gl_FragColor.rgb += (vGlow > 0.5 && vGlow < 1.5 ? vec3(1.0, 0.9, 0.7) * 3.0 : vGlow > 1.5 ? vec3(1.6, 0.05, 0.03) : vec3(0.0)) * uNight;'
  });
  var TRAFFIC = 80, others = [], typeMeshes = [];
  TYPES.forEach(function (T, ti) {
    var g = buildType(T), maxN = ti === 6 ? 8 : 22;
    var pm = new THREE.InstancedMesh(g.paint, carPaintMat, maxN), tm = new THREE.InstancedMesh(g.trim, carTrimMat, maxN);
    for (var q = 0; q < maxN; q++) pm.setColorAt(q, VINTAGE[q % VINTAGE.length]);
    pm.count = 0; tm.count = 0; pm.frustumCulled = false; tm.frustumCulled = false;
    pm.castShadow = true;
    scene.add(pm); scene.add(tm);
    typeMeshes.push({ T: T, paint: pm, trim: tm, max: maxN, used: 0 });
  });
  for (var oi = 0; oi < TRAFFIC; oi++) {
    var tix = oi % 23 === 0 ? 6 : (oi % 6);
    others.push({ type: tix, i: -1, t: 0, dir: 1, v: 0, lane: hash(oi, 9, 2) > 0.5 ? 1 : -1, k: 0.75 + 0.25 * hash(oi, 5, 5), x: 0, z: 0, y: 0, h: 0, pitch: 0, col: VINTAGE[(oi * 7) % VINTAGE.length], braking: false });
  }
  function spawnOther(o, near) {
    for (var tries = 0; tries < 24; tries++) {
      var a = Math.random() * Math.PI * 2, r = (near ? 50 : 160) + Math.random() * 360;
      var cx = ((car.x + Math.cos(a) * r + HALF) / GC) | 0, cz = ((car.z + Math.sin(a) * r + HALF) / GC) | 0;
      if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
      var c = cz * GN + cx, n = CS[c + 1] - CS[c];
      if (!n) continue;
      var i = CI[CS[c] + ((Math.random() * n) | 0)], e = PE[i];
      if (ECL[e] > 6 || (o.type === 6 && ECL[e] > 4)) continue;
      if (Math.hypot(PX[i] - car.x, PZ[i] - car.z) < 45) continue;
      o.i = i; o.t = 0; o.dir = (EF[e] & 1) ? 1 : (Math.random() < 0.5 ? 1 : -1); o.v = ESP[e] / 3.6 * o.k * 0.7;
      o.h = Math.atan2(-(PZ[i + 1] - PZ[i]) * o.dir, (PX[i + 1] - PX[i]) * o.dir);
      return;
    }
    o.i = -1;
  }
  function nextEdge(o, v, from) {
    var opts = [], i;
    for (i = VAS[v]; i < VAS[v + 1]; i++) {
      var f = VAI[i] >> 1, end = VAI[i] & 1;
      if (f === from && VAS[v + 1] - VAS[v] > 1) continue;
      if (end === 1 && (EF[f] & 1)) continue;
      if (ECL[f] > 7) continue;
      opts.push(VAI[i]);
    }
    if (!opts.length) return false;
    var pick = opts[(Math.random() * opts.length) | 0], f2 = pick >> 1;
    if (pick & 1) { o.i = ES[f2 + 1] - 2; o.t = PL[o.i + 1] - PL[o.i]; o.dir = -1; } else { o.i = ES[f2]; o.t = 0; o.dir = 1; }
    return true;
  }
  var simTime = 0;
  function stepTraffic(dt) {
    var q, o;
    for (q = 0; q < others.length; q++) {
      o = others[q];
      if (o.i < 0 || Math.hypot(o.x - car.x, o.z - car.z) > 700) { spawnOther(o, false); if (o.i < 0) continue; }
      var e = PE[o.i], a = ES[e], b = ES[e + 1] - 1, sl;
      var toEnd = o.dir > 0 ? PL[b] - PL[o.i] - o.t : PL[o.i] + o.t, target = ESP[e] / 3.6 * o.k;
      if (toEnd < 14) target = Math.min(target, 5.5 + toEnd * 0.4);
      /* traffic lights at the junction ahead */
      var vEnd = o.dir > 0 ? EB[e] : EA[e], sig = SIGV.get(vEnd);
      if (sig) {
        var grp = sig.groupOf.get(e * 2 + (o.dir > 0 ? 1 : 0));
        if (grp !== undefined) {
          var st = sigState(sig, grp, simTime), stopAt = toEnd - (VR[vEnd] + 3);
          if (st === 0 || (st === 1 && stopAt > 6)) { if (stopAt > -1) target = Math.min(target, Math.max(0, stopAt) * 0.45); }
        }
      }
      /* keep a gap to the car in front, the Sigma included */
      var fxo = Math.cos(o.h), fzo = -Math.sin(o.h);
      function follow(px, pz, pv, ph) {
        var dxp = px - o.x, dzp = pz - o.z, ahead = dxp * fxo + dzp * fzo, side = Math.abs(dxp * fzo - dzp * fxo);
        if (ahead > 0 && ahead < 20 && side < 2.2) {
          var along = Math.max(0, pv * (fxo * Math.cos(ph) - fzo * Math.sin(ph)));
          target = Math.min(target, along + Math.max(0, ahead - 7) * 0.5);
        }
      }
      follow(car.x, car.z, car.v, car.h);
      for (var k = 0; k < others.length; k++) if (k !== q && others[k].i >= 0) { var p = others[k]; if (Math.abs(p.x - o.x) < 20 && Math.abs(p.z - o.z) < 20) follow(p.x, p.z, p.v, p.h); }
      o.braking = target < o.v - 0.5;
      o.v += clamp(Math.max(0, target) - o.v, -6 * dt, 2.0 * dt);
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
      var hy = Math.atan2(-dz, dx), dh = Math.atan2(Math.sin(hy - o.h), Math.cos(hy - o.h));
      o.h += dh * Math.min(1, dt * 7);
      o.y = PH[o.i] + (PH[o.i + 1] - PH[o.i]) * t + 0.03;
      o.pitch = Math.atan2((PH[o.i + 1] - PH[o.i]) * o.dir, sl);
    }
    /* write the instances */
    typeMeshes.forEach(function (tm) { tm.used = 0; });
    for (q = 0; q < others.length; q++) {
      o = others[q];
      if (o.i < 0) continue;
      var tmz = typeMeshes[o.type];
      if (tmz.used >= tmz.max) continue;
      qtmp.setFromEuler(eTmp.set(0, o.h, o.pitch, 'YZX'));
      mtmp.compose(vtmp.set(o.x, o.y, o.z), qtmp, stmp);
      tmz.paint.setMatrixAt(tmz.used, mtmp); tmz.trim.setMatrixAt(tmz.used, mtmp);
      tmz.paint.setColorAt(tmz.used, o.col);
      o.slot = tmz.used; tmz.used++;
    }
    typeMeshes.forEach(function (tm) {
      tm.paint.count = tm.used; tm.trim.count = tm.used;
      tm.paint.instanceMatrix.needsUpdate = true; tm.trim.instanceMatrix.needsUpdate = true;
      if (tm.paint.instanceColor) tm.paint.instanceColor.needsUpdate = true;
    });
  }
  var eTmp = new THREE.Euler();

  /* night glows for every car lamp (and the Sigma's), one point cloud */
  var CARGLOW_N = (TRAFFIC + 1) * 4;
  var cgPos = new Float32Array(CARGLOW_N * 3), cgCol = new Float32Array(CARGLOW_N * 3), cgSize = new Float32Array(CARGLOW_N);
  var cgGeo = new THREE.BufferGeometry();
  cgGeo.setAttribute('position', new THREE.BufferAttribute(cgPos, 3));
  cgGeo.setAttribute('color', new THREE.BufferAttribute(cgCol, 3));
  cgGeo.setAttribute('size', new THREE.BufferAttribute(cgSize, 1));
  var carGlow = new THREE.Points(cgGeo, glowMat); carGlow.frustumCulled = false; carGlow.renderOrder = 9; scene.add(carGlow);
  var lp = new THREE.Vector3();
  function updateCarGlows() {
    var n = 0;
    function put(x, y, z, r, g, b, s) { cgPos[n * 3] = x; cgPos[n * 3 + 1] = y; cgPos[n * 3 + 2] = z; cgCol[n * 3] = r; cgCol[n * 3 + 1] = g; cgCol[n * 3 + 2] = b; cgSize[n] = s; n++; }
    if (LIT.uNight.value > 0.01) {
      for (var q = 0; q < others.length; q++) {
        var o = others[q];
        if (o.i < 0 || o.slot === undefined) continue;
        var Lm = TYPES[o.type].lamps, c = Math.cos(o.h), s = Math.sin(o.h);
        for (var sd = -1; sd <= 1; sd += 2) {
          var lx = -s * Lm.w * sd, lz = -c * Lm.w * sd;
          put(o.x + c * Lm.fx + lx, o.y + Lm.y, o.z - s * Lm.fx + lz, 1.0, 0.86, 0.6, 1.3);
          var br = o.braking ? 1.0 : 0.45;
          put(o.x + c * Lm.rx + lx, o.y + Lm.ty, o.z - s * Lm.rx + lz, br, 0.04, 0.02, o.braking ? 1.1 : 0.7);
        }
      }
      carG.updateMatrixWorld();
      [[2.18, 0.69, 0.53], [2.18, 0.69, -0.53]].forEach(function (p) { lp.set(p[0], p[1], p[2]).applyMatrix4(carG.matrixWorld); put(lp.x, lp.y, lp.z, 1.0, 0.9, 0.7, 1.5); });
      var br2 = car.brake ? 1 : 0.45;
      [[-2.16, 0.84, 0.6], [-2.16, 0.84, -0.6]].forEach(function (p) { lp.set(p[0], p[1], p[2]).applyMatrix4(carG.matrixWorld); put(lp.x, lp.y, lp.z, br2, 0.03, 0.02, car.brake ? 1.2 : 0.8); });
    }
    for (var k = n; k < CARGLOW_N; k++) cgSize[k] = 0;
    cgGeo.attributes.position.needsUpdate = true; cgGeo.attributes.color.needsUpdate = true; cgGeo.attributes.size.needsUpdate = true;
  }
