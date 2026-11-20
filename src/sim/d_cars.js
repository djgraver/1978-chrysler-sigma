
  /* ==========================================================
     THE SIGMA: VEHICLE DYNAMICS
     A planar "bicycle" model with combined-slip tyres (friction circle per axle), weight transfer,
     a four-speed gearbox with a slipping clutch at launch, and a four-corner spring/damper suspension
     that drives body heave, pitch and roll and feeds the tyre loads. Integrated in small substeps.
     ========================================================== */
  var sigma = buildSigma();
  var carG = sigma.group; carG.rotation.order = 'YZX'; scene.add(carG);
  carG.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  sigma.wheels.forEach(function (w) { w.rotation.order = 'YZX'; });
  var WB = sigma.axF - sigma.axR;
  var VMAX = 100 / 3.6;
  var VEH = { m: 1150, a: 1.157, b: 1.358, h: 0.52, tw: 0.675, Iz: 1850, Ip: 1650, Ir: 520, rw: sigma.tyreR,
              ratios: [3.3, 3.525, 2.193, 1.442, 1.0], fd: 3.889, eff: 0.86, kF: 23500, kR: 21500, cF: 2100, cR: 1900 };
  VEH.L = VEH.a + VEH.b;
  var CGX = sigma.axF - VEH.a;                         /* CG along the model's x axis */
  var H0 = VEH.h;                                      /* CG height above the road at rest */
  var CORNER = [[VEH.a, -VEH.tw], [VEH.a, VEH.tw], [-VEH.b, -VEH.tw], [-VEH.b, VEH.tw]];   /* x, left: FR FL RR RL (matches sigma.wheels) */
  var car = { x: 0, z: 0, y: 0, h: 0, v: 0, vx: 0, vy: 0, r: 0, sIn: 0, steer: 0, thr: 0, brk: 0, gear: 1, shiftT: 0, rpm: 850,
              yb: H0, vyb: 0, pitch: 0, vpitch: 0, roll: 0, vroll: 0, ax: 0, ay: 0, gnd: [0, 0, 0, 0], gndV: [0, 0, 0, 0], comp: [0, 0, 0, 0], F: [0, 0, 0, 0],
              spin: [0, 0, 0, 0], onRoad: true, edge: -1, surf: 0, slip: 0, wheelspin: 0, impact: 0, engineOn: true, fuelRate: 0, brake: false, power: 0, airborne: false };
  var keys = {}, touch = { l: 0, r: 0, g: 0, b: 0 };
  var camYaw = 0, camDist = 8.2, camMode = 0, orbit = { yaw: 0, pitch: 0, idle: 0, drag: false, px: 0, py: 0 };
  function torqueAt(rpm) {
    var T = [[0, 70], [1000, 112], [2000, 140], [3000, 156], [4000, 151], [5000, 136], [5600, 118], [6200, 0]];
    for (var i = 0; i < T.length - 1; i++) if (rpm < T[i + 1][0]) return 0.9 * (T[i][1] + (T[i + 1][1] - T[i][1]) * (rpm - T[i][0]) / (T[i + 1][0] - T[i][0]));
    return 0;
  }
  function fwd() { return [Math.cos(car.h), -Math.sin(car.h)]; }
  function cornerWorld(i) {
    var c = Math.cos(car.h), s = Math.sin(car.h), xi = CORNER[i][0], li = CORNER[i][1];
    return [car.x + c * xi - s * li, car.z - s * xi - c * li];
  }
  function placeOnRoad(x, z) {
    var found = false, r;
    for (r = 60; r <= 4000 && !found; r *= 2) {
      var best = 1e18, bi = -1;
      var x0 = Math.max(0, ((x - r + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((x + r + HALF) / GC) | 0);
      var z0 = Math.max(0, ((z - r + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((z + r + HALF) / GC) | 0);
      for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
        var i = CI[k], d = (PX[i] - x) * (PX[i] - x) + (PZ[i] - z) * (PZ[i] - z);
        if (ECL[PE[i]] > 7 || PB[i]) continue;
        if (d < best) { best = d; bi = i; }
      }
      if (bi >= 0) {
        var e = PE[bi]; if (bi === ES[e + 1] - 1) bi--;
        var dx = PX[bi + 1] - PX[bi], dz = PZ[bi + 1] - PZ[bi], l = Math.hypot(dx, dz) || 1, off = (EF[e] & 1) ? 0 : EW[e] / 4;
        car.h = Math.atan2(-dz, dx);
        car.x = PX[bi] + dz / l * off; car.z = PZ[bi] - dx / l * off;
        car.y = PH[bi]; car.yb = PH[bi] + H0; car.vyb = 0; car.pitch = 0; car.roll = 0; car.vpitch = 0; car.vroll = 0;
        car.vx = 0; car.vy = 0; car.r = 0; car.v = 0; car.sIn = 0; car.steer = 0; car.gear = 1; car.shiftT = 0; found = true;
        for (var q = 0; q < 4; q++) { car.gndV[q] = 0; car.gnd[q] = PH[bi]; car.comp[q] = 0; }
      }
    }
    camYaw = car.h; orbit.yaw = 0; orbit.pitch = 0;
    lastPlan.x = 1e9;
    respawnAround();
  }
  /* after a jump across town, bring the traffic and the people along */
  function respawnAround() {
    if (!PX || !others.length) return;
    others.forEach(function (o) { spawnOther(o, true); });
    if (typeof peds !== 'undefined') peds.forEach(function (p) { p.i = -3; p.stop = null; });
  }
  function gripMu() {
    var mu = car.surf === 0 ? 0.88 : car.surf === 1 ? 0.8 : 0.55;
    mu *= 1 - 0.27 * LIT.uWet.value;
    mu *= 1 - 0.45 * W.all;                                 /* snow lying everywhere */
    return mu;
  }
  function tyreF(alpha, Fz, mu, B) { return mu * Fz * Math.sin(1.45 * Math.atan((B || 9.5) * alpha)); }
  var fuelFactor = 5, DBG = { flat: false };
  function stepCar(dt) {
    var up = keys.ArrowUp || keys.KeyW || touch.g, dn = keys.ArrowDown || keys.KeyS || touch.b;
    var lf = keys.ArrowLeft || keys.KeyA || touch.l, rt = keys.ArrowRight || keys.KeyD || touch.r, hb = !!keys.Space;
    /* steering: the wheel winds on gradually and unwinds a little faster */
    var target = (lf ? 1 : 0) - (rt ? 1 : 0);
    var rate = target === 0 ? 2.0 : (car.sIn * target < 0 ? 2.6 : 1.0);
    car.sIn += clamp(target - car.sIn, -rate * dt, rate * dt);
    var speed = Math.abs(car.vx);
    car.steer = car.sIn * 0.6 / (1 + Math.pow(speed / 7, 1.6));
    /* pedals and gear selection (R engages when stopped and Brake is held) */
    var thrIn = 0, brkIn = 0;
    if (car.gear === -1) { if (dn) thrIn = 1; if (up) { if (car.vx < -0.3) brkIn = 1; else car.gear = 1; } }
    else { if (up) thrIn = 1; if (dn) { if (car.vx > 0.4) brkIn = 1; else if (!up) car.gear = -1; } }
    if (!car.engineOn || car.cut) thrIn = 0;
    car.thr += clamp(thrIn - car.thr, -dt * 6, dt * 3.5);
    car.brk += clamp(brkIn - car.brk, -dt * 8, dt * 5);
    car.brake = car.brk > 0.1 || hb;
    /* the ground under each wheel, sampled once per frame */
    var refY = car.yb - H0;
    for (var q = 0; q < 4; q++) {
      var cw = cornerWorld(q), gq = DBG.flat ? 0 : carGround(cw[0], cw[1], refY);
      if (q === 0) { car.onRoad = DBG.flat || G.onRoad; car.edge = DBG.flat ? -1 : G.e; car.surf = DBG.flat ? 0 : G.surf; }
      car.gndV[q] = dt > 0 ? clamp((gq - car.gnd[q]) / dt, -12, 12) : 0;
      car.gnd[q] = gq;
    }
    var gF = (car.gnd[0] + car.gnd[1]) / 2, gR = (car.gnd[2] + car.gnd[3]) / 2, gL = (car.gnd[1] + car.gnd[3]) / 2, gRt = (car.gnd[0] + car.gnd[2]) / 2;
    var slopeX = (gF - gR) / VEH.L, slopeY = (gL - gRt) / (2 * VEH.tw);
    var mu = gripMu(), m = VEH.m, g = 9.81, N = 8, h = dt / N;
    var rrC = car.surf === 0 ? 0.013 : car.surf === 1 ? 0.016 : 0.075;
    car.slip = 0; car.wheelspin = 0; car.power = 0;
    for (var st = 0; st < N; st++) {
      /* engine and gearbox */
      var gear = car.gear, ratio = (gear === -1 ? -VEH.ratios[0] : VEH.ratios[gear]) * VEH.fd;
      var wheelRpm = Math.abs(car.vx / VEH.rw * ratio) * 60 / (2 * Math.PI), Te = 0, Fd = 0;
      if (car.shiftT > 0) { car.shiftT -= h; car.rpm += (wheelRpm - car.rpm) * Math.min(1, h * 8); if (car.shiftT <= 0 && car._next) { car.gear = car._next; car._next = 0; } }
      else if (car.engineOn) {
        var thr = car.thr * (gear > 0 ? clamp((VMAX + 0.2 - car.vx) / 0.5, 0, 1) : clamp((7 + car.vx) / 1.5, 0, 1));
        var launch = wheelRpm < 1250;
        car.rpm = launch ? Math.max(wheelRpm, 850 + thr * 1300) : wheelRpm;
        if (car.rpm > 6100) thr = 0;
        Te = thr * torqueAt(car.rpm) - (1 - thr) * (launch ? 0 : 12 + car.rpm * 0.0045);
        Fd = Te * ratio * VEH.eff / VEH.rw;
        car.power = Math.max(car.power, Te * car.rpm * 2 * Math.PI / 60);
        if (gear > 0 && !launch) {
          if (car.rpm > (thr > 0.5 ? 5300 : 2900) && gear < 4 && car.vx > 1) { car.shiftT = 0.32; car._next = gear + 1; }
          else if (gear > 1 && car.rpm < (thr > 0.6 ? 2300 : 1350)) { car.shiftT = 0.25; car._next = gear - 1; }
        }
      } else { car.rpm = Math.max(0, car.rpm - h * 2500); }
      /* loads on each axle: suspension forces blended with steady weight transfer */
      var FzF0 = m * g * VEH.b / VEH.L - m * car.ax * VEH.h / VEH.L, FzR0 = m * g * VEH.a / VEH.L + m * car.ax * VEH.h / VEH.L;
      var FzF = Math.max(0, 0.5 * FzF0 + 0.5 * (car.F[0] + car.F[1])), FzR = Math.max(0, 0.5 * FzR0 + 0.5 * (car.F[2] + car.F[3]));
      if (car.airborne) { FzF = 0; FzR = 0; }
      /* brakes: 62 % front, 38 % rear; the handbrake locks the rears */
      var sv = car.vx > 0.05 ? 1 : car.vx < -0.05 ? -1 : 0;
      var Fb = car.brk * 9800, FbF = Fb * 0.62 * sv, FbR = Fb * 0.38 * sv + (hb ? 5200 * sv : 0);
      /* front tyres in their own frame */
      var d = car.steer, cd = Math.cos(d), sd = Math.sin(d);
      var uyF = car.vy + VEH.a * car.r, lonF = cd * car.vx + sd * uyF, latF = -sd * car.vx + cd * uyF;
      var aF = Math.atan2(latF, Math.max(Math.abs(lonF), 1.8));
      var muF = mu * 0.94;
      var FyT = -tyreF(aF, FzF, muF, 8.5), FxT = -FbF - rrC * FzF * sv;
      var totF = Math.hypot(FxT, FyT), capF = muF * FzF;
      if (totF > capF && totF > 0) { car.slip = Math.max(car.slip, (totF - capF) / (capF + 1)); FxT *= capF / totF; FyT *= capF / totF; }
      var FxF = FxT * cd - FyT * sd, FyF = FxT * sd + FyT * cd;
      /* rear tyres */
      var latR = car.vy - VEH.b * car.r, aR = Math.atan2(latR, Math.max(Math.abs(car.vx), 1.8));
      var muR = mu * (hb && Math.abs(car.vx) > 1.5 ? 0.5 : 1);
      var FyR = -tyreF(aR, FzR, muR, 11), FxR = Fd - FbR - rrC * FzR * sv;
      var totR = Math.hypot(FxR, FyR), capR = muR * FzR;
      if (totR > capR && totR > 0) { var ex = (totR - capR) / (capR + 1); car.slip = Math.max(car.slip, ex); if (Math.abs(Fd) > Math.abs(FbR)) car.wheelspin = Math.max(car.wheelspin, ex); FxR *= capR / totR; FyR *= capR / totR; }
      var drag = 0.47 * car.vx * Math.abs(car.vx);
      var ax = (FxF + FxR - drag) / m - g * slopeX, ay = (FyF + FyR) / m + g * slopeY;
      car.vx += (ax + car.vy * car.r) * h;
      car.vy += (ay - car.vx * car.r) * h;
      car.r += (VEH.a * FyF - VEH.b * FyR) / VEH.Iz * h;
      /* holding still: no creep when braked or idling at a standstill on the flat */
      if (Math.abs(car.vx) < 0.15 && Math.abs(car.vy) < 0.15 && (car.brk > 0.3 || hb || (car.thr < 0.05 && Math.abs(slopeX) < 0.04))) { car.vx = 0; car.vy *= 0.5; car.r *= 0.5; }
      car.ax += (ax - car.ax) * Math.min(1, h * 12); car.ay += (ay - car.ay) * Math.min(1, h * 12);
      var c = Math.cos(car.h), s = Math.sin(car.h);
      car.x += (car.vx * c - car.vy * s) * h;
      car.z += (-car.vx * s - car.vy * c) * h;
      car.h += car.r * h;
      /* suspension: four springs and dampers against the road under each wheel */
      var sumF = 0, mP = 0, mR = 0, nGround = 0;
      for (q = 0; q < 4; q++) {
        var xi = CORNER[q][0], li = CORNER[q][1], front = q < 2;
        var yi = car.yb + car.pitch * xi + car.roll * li, comp = (car.gnd[q] + H0) - yi;
        var dcomp = car.gndV[q] - (car.vyb + car.vpitch * xi + car.vroll * li);
        var Fs = m * g * (front ? VEH.b : VEH.a) / VEH.L / 2;
        var F = Fs + (front ? VEH.kF : VEH.kR) * comp + (front ? VEH.cF : VEH.cR) * dcomp;
        if (comp > 0.075) F += 160000 * (comp - 0.075);
        if (comp < -0.11) F = 0;
        F = Math.max(0, F);
        if (F > 0) nGround++;
        car.F[q] = F; car.comp[q] = comp;
        sumF += F; mP += F * xi; mR += F * li;
      }
      car.airborne = nGround === 0;
      car.vyb += (sumF / m - g) * h;
      car.vpitch += (mP + m * car.ax * VEH.h) / VEH.Ip * h - car.vpitch * 0.6 * h;
      car.vroll += (mR + m * car.ay * VEH.h) / VEH.Ir * h - car.vroll * 0.6 * h;
      car.yb += car.vyb * h; car.pitch += car.vpitch * h; car.roll += car.vroll * h;
      /* the body sits relative to the road's own slope; keep the angles sane */
      car.pitch = clamp(car.pitch, slopeX - 0.12, slopeX + 0.12); car.roll = clamp(car.roll, slopeY - 0.12, slopeY + 0.12);
    }
    /* never sink through the road */
    var minY = Math.max(car.gnd[0], car.gnd[1], car.gnd[2], car.gnd[3]) + H0 - 0.16;
    if (car.yb < minY) { car.yb = minY; if (car.vyb < 0) car.vyb = 0; }
    car.v = car.vx;
    var r = Math.hypot(car.x, car.z);
    if (r > RADIUS - 60) { car.x *= (RADIUS - 60) / r; car.z *= (RADIUS - 60) / r; car.vx *= 0.9; }
    if (!DBG.flat) collide(dt);
    if (!DBG.flat && car.yb - H0 < -0.6 || Math.min(car.gnd[0], car.gnd[1]) < -0.8) placeOnRoad(car.x, car.z);
    /* fuel: brake specific consumption from the engine's power, plus idle */
    var pkw = Math.max(0, car.power) / 1000, load = clamp(pkw / 66, 0, 1);
    var gps = car.engineOn ? (0.22 + (260 + 260 * (1 - load) * (1 - load)) * pkw / 3600) : 0;
    car.fuelRate = gps / 740 * fuelFactor;
    /* place the model: its origin is under the CG by CGX, at road level */
    var c2 = Math.cos(car.h), s2 = Math.sin(car.h);
    car.y = car.yb - H0;
    carG.position.set(car.x - c2 * CGX, car.y, car.z + s2 * CGX);
    carG.rotation.set(car.roll, car.h, car.pitch);
    for (q = 0; q < 4; q++) {
      var w = sigma.wheels[q], spinRate = car.vx / VEH.rw * (q >= 2 ? 1 + car.wheelspin * 3 : 1);
      if (q >= 2 && keys.Space && Math.abs(car.vx) > 1.5) spinRate = 0;
      car.spin[q] -= spinRate * dt;
      w.position.y = sigma.tyreR + clamp(car.comp[q], -0.11, 0.09);
      w.rotation.set(0, q < 2 ? car.steer : 0, car.spin[q]);
    }
    if (steerWheel) steerWheel.rotation.z = -car.steer * 14;
  }

  /* ==========================================================
     COLLISIONS: buildings and street fixtures (as footprints), and other cars (as boxes). Not pedestrians.
     ========================================================== */
  var CAR_F = 2.15 - CGX, CAR_R = -2.15 - CGX, CAR_W = 0.84;
  var CPTS = [[CAR_F, -0.78], [CAR_F, 0.78], [CAR_F + 0.05, 0], [CAR_R, -0.78], [CAR_R, 0.78], [CAR_R - 0.05, 0],
              [0.9, -CAR_W], [0.9, CAR_W], [-0.3, -CAR_W], [-0.3, CAR_W], [-1.5, -CAR_W], [-1.5, CAR_W]];
  var collCache = new Map(), STATIC_COLL = new Map();
  function addStaticCollider(pts) {
    var cx = 0, cz = 0; pts.forEach(function (p) { cx += p[0]; cz += p[1]; }); cx /= pts.length; cz /= pts.length;
    var k = clamp(((cz + HALF) / 256) | 0, 0, 239) * 240 + clamp(((cx + HALF) / 256) | 0, 0, 239);
    if (!STATIC_COLL.has(k)) STATIC_COLL.set(k, []);
    STATIC_COLL.get(k).push(makePoly(pts));
  }
  function makePoly(pts) {
    var o = { pts: pts, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
    pts.forEach(function (p) { o.x0 = Math.min(o.x0, p[0]); o.x1 = Math.max(o.x1, p[0]); o.z0 = Math.min(o.z0, p[1]); o.z1 = Math.max(o.z1, p[1]); });
    return o;
  }
  function tileColliders(jx, jz) {
    var t = jz * 240 + jx, c = collCache.get(t);
    if (c) return c;
    c = [];
    if (BLD && jx >= 0 && jz >= 0 && jx < 240 && jz < 240) {
      var ox = -HALF + jx * 256, oz = -HALF + jz * 256;
      for (var b = BLD.TS[t]; b < BLD.TS[t + 1]; b++) {
        if (BLD_SKIP.has(b)) continue;
        var n = BLD.BN[b], off = BLD.BO[b], pts = [];
        for (var i = 0; i < n; i++) pts.push([ox + BLD.V[off + i * 2] / 10, oz + BLD.V[off + i * 2 + 1] / 10]);
        c.push(makePoly(pts));
      }
    }
    (STATIC_COLL.get(t) || []).forEach(function (p) { c.push(p); });
    if (collCache.size > 80) collCache.delete(collCache.keys().next().value);
    collCache.set(t, c);
    return c;
  }
  function closestOnPoly(pts, x, z) {
    var best = 1e18, bx = 0, bz = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var ax = pts[j][0], az = pts[j][1], dx = pts[i][0] - ax, dz = pts[i][1] - az;
      var t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1), px = ax + dx * t, pz = az + dz * t, d = (px - x) * (px - x) + (pz - z) * (pz - z);
      if (d < best) { best = d; bx = px; bz = pz; }
    }
    return [bx, bz, Math.sqrt(best)];
  }
  function applyImpulse(nx, nz, px, pz, e) {
    var c = Math.cos(car.h), s = Math.sin(car.h);
    var Vx = car.vx * c - car.vy * s, Vz = -car.vx * s - car.vy * c;
    var dx = px - car.x, dz = pz - car.z, perpx = dz, perpz = -dx;
    var vpx = Vx + car.r * perpx, vpz = Vz + car.r * perpz, vn = vpx * nx + vpz * nz;
    if (vn >= 0) return 0;
    var pn = perpx * nx + perpz * nz, j = -(1 + e) * vn / (1 / VEH.m + pn * pn / VEH.Iz);
    Vx += j * nx / VEH.m; Vz += j * nz / VEH.m; car.r += j * pn / VEH.Iz;
    /* scrub some of the sliding speed along the wall */
    var tx = -nz, tz = nx, vt = Vx * tx + Vz * tz; Vx -= tx * vt * 0.25; Vz -= tz * vt * 0.25;
    car.vx = Vx * c - Vz * s; car.vy = -Vx * s - Vz * c;
    car.impact = Math.max(car.impact, -vn);
    return -vn;
  }
  function collide(dt) {
    car.impact = Math.max(0, car.impact - dt * 4);
    var c = Math.cos(car.h), s = Math.sin(car.h);
    for (var iter = 0; iter < 3; iter++) {
      var bestD = 0, bnx = 0, bnz = 0, bpx = 0, bpz = 0;
      var wp = CPTS.map(function (p) { return [car.x + c * p[0] - s * p[1], car.z - s * p[0] - c * p[1]]; });
      var minx = car.x - 2.6, maxx = car.x + 2.6, minz = car.z - 2.6, maxz = car.z + 2.6;
      var tx0 = clamp(((minx + HALF) / 256) | 0, 0, 239), tx1 = clamp(((maxx + HALF) / 256) | 0, 0, 239), tz0 = clamp(((minz + HALF) / 256) | 0, 0, 239), tz1 = clamp(((maxz + HALF) / 256) | 0, 0, 239);
      for (var tz = tz0; tz <= tz1; tz++) for (var tx = tx0; tx <= tx1; tx++) {
        var list = tileColliders(tx, tz);
        for (var k = 0; k < list.length; k++) {
          var P = list[k];
          if (P.x1 < minx || P.x0 > maxx || P.z1 < minz || P.z0 > maxz) continue;
          for (var q = 0; q < wp.length; q++) {
            if (!pip(P.pts, wp[q][0], wp[q][1])) continue;
            var cp = closestOnPoly(P.pts, wp[q][0], wp[q][1]);
            if (cp[2] > bestD) { bestD = cp[2]; bnx = (cp[0] - wp[q][0]) / (cp[2] || 1); bnz = (cp[1] - wp[q][1]) / (cp[2] || 1); bpx = wp[q][0]; bpz = wp[q][1]; }
          }
          /* corners of the obstacle poking into the car */
          for (q = 0; q < P.pts.length; q++) {
            var rx = P.pts[q][0] - car.x, rz = P.pts[q][1] - car.z, lx = rx * c - rz * s, lz = -(rx * s + rz * c);
            if (lx > CAR_R && lx < CAR_F && Math.abs(lz) < CAR_W) {
              var df = CAR_F - lx, dr = lx - CAR_R, ds = CAR_W - Math.abs(lz), m = Math.min(df, dr, ds), nlx = 0, nlz = 0;
              if (m === df) nlx = -1; else if (m === dr) nlx = 1; else nlz = lz > 0 ? -1 : 1;
              if (m > bestD) { bestD = m; bnx = nlx * c - nlz * s; bnz = -nlx * s - nlz * c; bpx = P.pts[q][0]; bpz = P.pts[q][1]; }
            }
          }
        }
      }
      /* other cars: oriented boxes */
      for (var oi = 0; oi < others.length; oi++) {
        var o = others[oi];
        if (o.i < 0 || Math.abs(o.x - car.x) > 9 || Math.abs(o.z - car.z) > 9) continue;
        var T = TYPES[o.type], res = satBoxes(car.x + c * (CAR_F + CAR_R) / 2, car.z - s * (CAR_F + CAR_R) / 2, car.h, (CAR_F - CAR_R) / 2, CAR_W, o.x, o.z, o.h, T.L / 2, T.W / 2);
        if (res && res[0] > bestD) { bestD = res[0]; bnx = res[1]; bnz = res[2]; bpx = car.x + bnx * -1.2; bpz = car.z + bnz * -1.2; o.stun = 2.5; o.v *= 0.3; }
      }
      if (bestD <= 0.001) break;
      car.x += bnx * (bestD + 0.01); car.z += bnz * (bestD + 0.01);
      applyImpulse(bnx, bnz, bpx, bpz, 0.18);
    }
  }
  /* separating axis test for two rectangles; returns [depth, nx, nz] pushing box A out of box B */
  function satBoxes(ax, az, ah, ahl, ahw, bx, bz, bh, bhl, bhw) {
    var axes = [[Math.cos(ah), -Math.sin(ah)], [Math.sin(ah), Math.cos(ah)], [Math.cos(bh), -Math.sin(bh)], [Math.sin(bh), Math.cos(bh)]];
    var dx = ax - bx, dz = az - bz, best = 1e9, bnx = 0, bnz = 0;
    for (var i = 0; i < 4; i++) {
      var nx = axes[i][0], nz = axes[i][1];
      var ra = ahl * Math.abs(axes[0][0] * nx + axes[0][1] * nz) + ahw * Math.abs(axes[1][0] * nx + axes[1][1] * nz);
      var rb = bhl * Math.abs(axes[2][0] * nx + axes[2][1] * nz) + bhw * Math.abs(axes[3][0] * nx + axes[3][1] * nz);
      var dist = dx * nx + dz * nz, over = ra + rb - Math.abs(dist);
      if (over <= 0) return null;
      if (over < best) { best = over; var sg = dist < 0 ? -1 : 1; bnx = nx * sg; bnz = nz * sg; }
    }
    return [best, bnx, bnz];
  }
  /* a steering wheel with spokes, so turning it shows */
  var steerWheel = null;
  (function () {
    if (sigma.sw) sigma.sw.visible = false;
    var outer = new THREE.Group(); outer.position.set(0.47, 0.885, 0.37); outer.rotation.set(0, Math.PI / 2, 0); outer.rotateX(0.42);
    var inner = new THREE.Group(); outer.add(inner);
    var mat = new THREE.MeshStandardMaterial({ color: C('#1a1714'), roughness: 0.6 }), metal = new THREE.MeshStandardMaterial({ color: C('#b8bcbf'), roughness: 0.3, metalness: 1 });
    inner.add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.016, 10, 40), mat));
    [0, 2.2, -2.2].forEach(function (a) { var sp = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.022, 0.012), metal); sp.position.set(Math.cos(a - Math.PI / 2) * 0.09, Math.sin(a - Math.PI / 2) * 0.09, 0); sp.rotation.z = a - Math.PI / 2; inner.add(sp); });
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 20), mat); hub.rotation.x = Math.PI / 2; inner.add(hub);
    carG.add(outer); steerWheel = inner;
  })();

  /* ==========================================================
     ERA TRAFFIC: generic 1970s and early-80s body styles, generated from a handful of numbers.
     Each body is lofted from cross-sections along its length (lower body plus glasshouse), every face is
     classed as paint, glass, chrome, rubber, lamp or tyre, and one instanced mesh per style draws them all.
     ========================================================== */
  var PAL70 = ['#c9a227', '#6b7f3a', '#c4561d', '#5a3a24', '#e8dcb8', '#7fa7c9', '#eeeae0', '#d4a81c', '#6e1f24', '#2f4d36', '#a32b23', '#c2ad86', '#2f6e6a', '#4d3a5c', '#9cb43c', '#3c4f7a', '#b98a5a', '#d9d2c0', '#7a2f1c', '#e07a2a'].map(C);
  var PAL80 = ['#b9bcbe', '#7d1d22', '#1f2c44', '#eeeeea', '#3a3d40', '#8a6a4a', '#4a5a3a', '#c8bfa8', '#9aa6b2', '#5c1f2a', '#24412e', '#d8d4cc'].map(C);
  var TYPES = [
    { name: 'large sedan', L: 4.86, W: 1.88, H: 1.38, wb: 2.82, fo: 0.98, tr: 0.33, belt: 0.93, hoodF: 0.80, hoodR: 0.9, deckH: 0.94, deckR: 0.88, xWs: 1.62, ws: 0.62, roof: 1.25, rw: 0.55, tail: 'notch', roofW: 0.8, lamps: 'rect4', bumper: 'chrome', tails: 'wide', era: 70, vinyl: 0.25, w: 10 },
    { name: 'large wagon', L: 4.98, W: 1.88, H: 1.42, wb: 2.82, fo: 0.98, tr: 0.33, belt: 0.93, hoodF: 0.80, hoodR: 0.9, deckH: 0.94, deckR: 0.92, xWs: 1.62, ws: 0.62, roof: 2.35, rw: 0.18, tail: 'wagon', roofW: 0.82, lamps: 'rect4', bumper: 'chrome', tails: 'vert', era: 70, vinyl: 0, w: 8 },
    { name: 'utility', L: 4.95, W: 1.88, H: 1.4, wb: 2.9, fo: 0.98, tr: 0.33, belt: 0.95, hoodF: 0.82, hoodR: 0.92, deckH: 1.0, deckR: 1.0, xWs: 1.62, ws: 0.6, roof: 0.85, rw: 0.08, tail: 'ute', roofW: 0.82, lamps: 'round2', bumper: 'chrome', tails: 'vert', era: 70, vinyl: 0, w: 6 },
    { name: 'panel van', L: 4.98, W: 1.88, H: 1.45, wb: 2.9, fo: 0.98, tr: 0.33, belt: 0.95, hoodF: 0.8, hoodR: 0.9, deckH: 0.95, deckR: 0.95, xWs: 1.62, ws: 0.62, roof: 2.42, rw: 0.12, tail: 'van', roofW: 0.84, lamps: 'round4', bumper: 'chrome', tails: 'vert', era: 70, vinyl: 0, w: 5 },
    { name: 'mid sedan', L: 4.45, W: 1.72, H: 1.36, wb: 2.6, fo: 0.88, tr: 0.31, belt: 0.9, hoodF: 0.78, hoodR: 0.88, deckH: 0.92, deckR: 0.86, xWs: 1.45, ws: 0.6, roof: 1.2, rw: 0.5, tail: 'notch', roofW: 0.8, lamps: 'round4', bumper: 'chrome', tails: 'wide', era: 70, vinyl: 0.2, w: 10 },
    { name: 'coupe', L: 4.55, W: 1.74, H: 1.3, wb: 2.6, fo: 0.9, tr: 0.31, belt: 0.88, hoodF: 0.76, hoodR: 0.86, deckH: 0.88, deckR: 0.84, xWs: 1.55, ws: 0.68, roof: 0.75, rw: 1.2, tail: 'fast', roofW: 0.78, lamps: 'round2', bumper: 'chrome', tails: 'wide', era: 70, vinyl: 0.3, w: 5 },
    { name: 'small hatch', L: 3.95, W: 1.62, H: 1.36, wb: 2.4, fo: 0.72, tr: 0.29, belt: 0.88, hoodF: 0.76, hoodR: 0.86, deckH: 0.9, deckR: 0.86, xWs: 1.15, ws: 0.58, roof: 1.25, rw: 0.62, tail: 'hatch', roofW: 0.8, lamps: 'rect2', bumper: 'chrome', tails: 'vert', era: 78, vinyl: 0, w: 10 },
    { name: 'compact sedan', L: 4.15, W: 1.62, H: 1.37, wb: 2.42, fo: 0.78, tr: 0.29, belt: 0.88, hoodF: 0.76, hoodR: 0.86, deckH: 0.9, deckR: 0.86, xWs: 1.3, ws: 0.56, roof: 1.12, rw: 0.45, tail: 'notch', roofW: 0.8, lamps: 'round2', bumper: 'chrome', tails: 'wide', era: 70, vinyl: 0.15, w: 9 },
    { name: 'mini', L: 3.05, W: 1.41, H: 1.35, wb: 2.04, fo: 0.45, tr: 0.26, belt: 0.86, hoodF: 0.8, hoodR: 0.86, deckH: 0.86, deckR: 0.84, xWs: 0.68, ws: 0.35, roof: 1.45, rw: 0.3, tail: 'notch', roofW: 0.84, lamps: 'round2', bumper: 'chrome', tails: 'vert', era: 70, vinyl: 0, w: 4 },
    { name: 'eighties sedan', L: 4.62, W: 1.72, H: 1.38, wb: 2.67, fo: 0.92, tr: 0.31, belt: 0.92, hoodF: 0.74, hoodR: 0.9, deckH: 0.98, deckR: 0.96, xWs: 1.5, ws: 0.72, roof: 1.15, rw: 0.55, tail: 'notch', roofW: 0.8, lamps: 'rect2', bumper: 'black', tails: 'wide', era: 82, vinyl: 0, w: 8 },
    { name: 'people mover', L: 4.4, W: 1.7, H: 1.92, wb: 2.4, fo: 0.4, tr: 0.3, belt: 1.12, hoodF: 1.05, hoodR: 1.12, deckH: 1.12, deckR: 1.1, xWs: 0.45, ws: 0.45, roof: 3.25, rw: 0.15, tail: 'wagon', roofW: 0.9, lamps: 'round2', bumper: 'chrome', tails: 'vert', era: 70, vinyl: 0, w: 4, flatNose: true },
    { name: 'four-wheel drive', L: 4.6, W: 1.8, H: 1.86, wb: 2.7, fo: 0.8, tr: 0.38, belt: 1.18, hoodF: 1.08, hoodR: 1.16, deckH: 1.18, deckR: 1.16, xWs: 1.45, ws: 0.4, roof: 2.45, rw: 0.08, tail: 'wagon', roofW: 0.9, lamps: 'round2', bumper: 'black', tails: 'vert', era: 78, vinyl: 0, w: 4, sill: 0.55, spare: true },
    { name: 'taxi', base: 0, taxi: true, w: 3 },
    { name: 'delivery truck', truck: true, L: 6.6, W: 2.2, w: 3 },
    { name: 'city bus', bus: true, L: 11.2, W: 2.48, w: 2 }
  ];
  TYPES.forEach(function (T) { if (T.base !== undefined) { var B = TYPES[T.base]; for (var k in B) if (T[k] === undefined && k !== 'w' && k !== 'name') T[k] = B[k]; } });
  var cGlass = C('#0d1216'), cChrome = C('#d9dcde'), cTyre = C('#141414'), cRubber = C('#1b1b1b'), cHead = C('#f1eed8'), cTail = C('#8e1212'), cAmber = C('#d07a10'), cUnder = C('#151515'), cGrille = C('#121212'), cPlate = C('#eeeee6'), cVinyl = C('#1c1a18');
  /* one builder for all the lofted bodies */
  function buildEraCar(T) {
    var P = [], Cc = [], Pt = [], RM = [], GL = [];
    function tri(a, b, c, col, paintM, rough, metal, glow) {
      P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      for (var q = 0; q < 3; q++) { Cc.push(col.r, col.g, col.b); Pt.push(paintM); RM.push(rough, metal); GL.push(glow || 0); }
    }
    function quad(a, b, c, d, col, pm, ro, me, gl) { tri(a, b, c, col, pm, ro, me, gl); tri(a, c, d, col, pm, ro, me, gl); }
    function addGeo(g, col, pm, ro, me, gl, mtx) {
      g = g.index ? g.toNonIndexed() : g; if (mtx) g.applyMatrix4(mtx);
      var p = g.getAttribute('position').array;
      for (var i = 0; i < p.length; i += 9) tri([p[i], p[i + 1], p[i + 2]], [p[i + 3], p[i + 4], p[i + 5]], [p[i + 6], p[i + 7], p[i + 8]], col, pm, ro, me, gl);
    }
    var mtx = new THREE.Matrix4();
    var L = T.L, Wd = T.W, hw = Wd / 2, sill = T.sill || 0.32, belt = T.belt, H = T.H, xF = L / 2, xR = -L / 2;
    var xA = xF - T.xWs, xAt = xA - T.ws, xC = xAt - T.roof, xCb = xC - T.rw;
    if (T.tail === 'ute') { xC = xAt - T.roof; xCb = xC - 0.08; }
    var xB = (xAt + xC) / 2 + (T.tail === 'fast' ? 0.35 : 0.05);
    var vinyl = hash(T.L * 100 | 0, 3, 3) < (T.vinyl || 0) * 2;
    function topY(x) {
      if (x >= xA) { var t = (x - xA) / (xF - xA); return T.hoodR + (T.hoodF - T.hoodR) * t - 0.03 * t * t; }
      if (x <= xCb) {
        if (T.tail === 'wagon' || T.tail === 'van') return belt;
        var t2 = (xCb - x) / Math.max(0.01, xCb - xR); return T.deckH + (T.deckR - T.deckH) * t2;
      }
      return belt;
    }
    function inGlass(x) { return x <= xA && x >= xCb; }
    function glassTop(x) {
      if (!inGlass(x)) return null;
      if (x > xAt) return belt + (H - belt) * (xA - x) / (xA - xAt);
      if (x < xC) return belt + (H - belt) * (x - xCb) / Math.max(0.01, xC - xCb);
      return H - 0.02 * Math.pow((x - (xAt + xC) / 2) / ((xAt - xC) / 2 + 0.01), 2);
    }
    function plan(x) {
      var nr = T.flatNose ? 0.12 : 0.32, f = clamp((x - (xF - nr)) / nr, 0, 1), r = clamp(((xR + 0.28) - x) / 0.28, 0, 1);
      return 1 - 0.1 * f * f - 0.07 * r * r;
    }
    /* the ring at station x: [z, y, kind] from the bottom centre round to the top centre (right half) */
    function ring(x) {
      var k = plan(x), gt = glassTop(x), top = topY(x), z = hw * k, rz = hw * T.roofW;
      var r = [[0, sill - 0.06], [z - 0.1, sill - 0.04], [z - 0.012, sill + 0.06], [z, sill + 0.24], [z + 0.008, sill + 0.3], [z, sill + 0.36], [z - 0.01, top - 0.06], [z - 0.035, top]];
      if (gt !== null) {
        var gz = rz + (z - 0.07 - rz) * 0.0;
        r.push([z - 0.07, top + 0.004]); r.push([rz, gt]); r.push([rz - 0.08, gt + 0.03]); r.push([0, gt + 0.045]);
      } else {
        r.push([z * 0.78, top + 0.018]); r.push([z * 0.55, top + 0.026]); r.push([z * 0.3, top + 0.032]); r.push([0, top + 0.035]);
      }
      return r;
    }
    var NS = 70, xs = [];
    for (var i = 0; i <= NS; i++) xs.push(xR + (xF - xR) * i / NS);
    [xA, xAt, xC, xCb, xB - 0.05, xB + 0.05, xAt + 0.06, xC - 0.06].forEach(function (v) { if (v > xR && v < xF) xs.push(v); });
    xs.sort(function (a, b) { return a - b; });
    var rings = xs.map(ring), nP = rings[0].length;
    function kindOf(x, j) {
      /* j is the band index (between ring point j and j+1) */
      var g = inGlass(x), van = T.tail === 'van';
      if (j === 0) return 'under';
      if (j === 3 && T.era >= 78) return 'rub';
      if (j === 3 && T.era < 78 && T.bumper === 'chrome') return 'chromeStrip';
      if (j === 7 && g && T.era < 78) return 'chromeStrip';
      if (j === 8 && g) {
        if (x > xAt + 0.06 || x < xC - 0.06 && T.tail !== 'wagon' && T.tail !== 'ute' && !van || (x < xC - 0.06 && false)) return 'paint';
        if (Math.abs(x - xB) < 0.05) return 'paint';
        if (van && x < xB) return 'paint';
        if (T.tail === 'ute' && x < xC) return 'paint';
        return 'glass';
      }
      if ((j === 10) && g && (x > xAt || x < xC)) {
        if (T.tail === 'ute' || (T.tail === 'van' && x < xC)) return 'paint';
        return 'glass';
      }
      if (j === 9 && g && (x > xAt || x < xC) && T.tail !== 'ute') return 'paint';
      if ((j === 9 || j === 10) && g && x <= xAt && x >= xC && vinyl) return 'vinyl';
      if (T.tail === 'ute' && !g && x < xCb && j >= 7) return 'tray';
      return 'paint';
    }
    function cls(kind) {
      switch (kind) {
        case 'glass': return [cGlass, 0, 0.05, 0, 0];
        case 'under': return [cUnder, 0, 0.9, 0, 0];
        case 'rub': return [cRubber, 0, 0.8, 0, 0];
        case 'chromeStrip': return [cChrome, 0, 0.15, 1, 0];
        case 'vinyl': return [cVinyl, 0, 0.75, 0, 0];
        case 'tray': return [C('#262626'), 0, 0.9, 0, 0];
        default: return [new THREE.Color(1, 1, 1), 1, 0.33, 0.1, 0];
      }
    }
    for (var s = 0; s < xs.length - 1; s++) {
      var x0 = xs[s], x1 = xs[s + 1], R0 = rings[s], R1 = rings[s + 1], xm = (x0 + x1) / 2;
      for (var j = 0; j < nP - 1; j++) {
        var k = cls(kindOf(xm, j));
        for (var sd = -1; sd <= 1; sd += 2) {
          var a = [x0, R0[j][1], sd * R0[j][0]], b = [x1, R1[j][1], sd * R1[j][0]], c = [x1, R1[j + 1][1], sd * R1[j + 1][0]], d = [x0, R0[j + 1][1], sd * R0[j + 1][0]];
          if (sd > 0) quad(a, b, c, d, k[0], k[1], k[2], k[3], k[4]); else quad(a, d, c, b, k[0], k[1], k[2], k[3], k[4]);
        }
      }
    }
    /* close the nose and tail */
    [[0, -1], [xs.length - 1, 1]].forEach(function (e) {
      var R = rings[e[0]], x = xs[e[0]], k = cls('paint');
      for (var j = 0; j < nP - 1; j++) {
        var a = [x, R[j][1], -R[j][0]], b = [x, R[j][1], R[j][0]], c = [x, R[j + 1][1], R[j + 1][0]], d = [x, R[j + 1][1], -R[j + 1][0]];
        if (e[1] > 0) quad(a, b, c, d, k[0], k[1], k[2], k[3], 0); else quad(a, d, c, b, k[0], k[1], k[2], k[3], 0);
      }
    });
    /* wheels, wheel arches */
    var tr = T.tr, axF = xF - T.fo, axR = axF - T.wb;
    [axF, axR].forEach(function (ax) {
      [1, -1].forEach(function (sd) {
        var arch = new THREE.CircleGeometry(tr + 0.07, 18); arch.rotateY(sd > 0 ? 0 : Math.PI);
        addGeo(arch, cUnder, 0, 0.9, 0, 0, mtx.makeTranslation(ax, tr, sd * (hw * plan(ax) + 0.004)));
        var tyre = new THREE.CylinderGeometry(tr, tr, 0.2, 16, 1); tyre.rotateX(Math.PI / 2);
        addGeo(tyre, cTyre, 0, 0.85, 0, 0, mtx.makeTranslation(ax, tr, sd * (hw - 0.12)));
        var hub = new THREE.CylinderGeometry(tr * 0.62, tr * 0.66, 0.04, 14); hub.rotateX(Math.PI / 2);
        var steel = T.era < 75 && hash(T.L * 10 | 0, sd, 7) < 0.3;
        addGeo(hub, steel ? C('#8f9294') : cChrome, 0, steel ? 0.5 : 0.18, steel ? 0.3 : 1, 0, mtx.makeTranslation(ax, tr, sd * (hw - 0.012)));
      });
    });
    /* bumpers, grille, lamps, plates */
    var bY = sill + 0.13, bH = T.bumper === 'chrome' ? 0.13 : 0.19, bC = T.bumper === 'chrome' ? cChrome : cRubber, bRo = T.bumper === 'chrome' ? 0.14 : 0.7, bMe = T.bumper === 'chrome' ? 1 : 0;
    [xF + 0.04, xR - 0.04].forEach(function (bx) {
      addGeo(new THREE.BoxGeometry(0.12, bH, Wd + 0.02), bC, 0, bRo, bMe, 0, mtx.makeTranslation(bx, bY, 0));
    });
    var fy = Math.min(T.hoodF - 0.13, sill + 0.42), fz = hw * plan(xF) - 0.2;
    addGeo(new THREE.BoxGeometry(0.02, 0.2, fz * 2 - 0.26), cGrille, 0, 0.6, 0, 0, mtx.makeTranslation(xF + 0.003, fy, 0));
    if (T.era < 78) for (var gb = 0; gb < 3; gb++) addGeo(new THREE.BoxGeometry(0.01, 0.012, fz * 2 - 0.26), cChrome, 0, 0.15, 1, 0, mtx.makeTranslation(xF + 0.014, fy - 0.07 + gb * 0.07, 0));
    [1, -1].forEach(function (sd) {
      var lamps = T.lamps === 'round4' || T.lamps === 'rect4' ? [fz, fz - 0.21] : [fz - 0.04];
      lamps.forEach(function (lz) {
        var lg = T.lamps.indexOf('rect') === 0 ? new THREE.PlaneGeometry(lamps.length > 1 ? 0.19 : 0.26, 0.14) : new THREE.CircleGeometry(lamps.length > 1 ? 0.075 : 0.088, 14);
        lg.rotateY(Math.PI / 2);
        addGeo(lg.clone(), cChrome, 0, 0.15, 1, 0, mtx.makeScale(1, 1.25, 1.25).premultiply(new THREE.Matrix4().makeTranslation(xF + 0.006, fy, sd * lz)));
        addGeo(lg, cHead, 0, 0.1, 0, 1, mtx.makeTranslation(xF + 0.012, fy, sd * lz));
      });
      var ind = new THREE.PlaneGeometry(0.12, 0.05); ind.rotateY(Math.PI / 2);
      addGeo(ind, cAmber, 0, 0.3, 0, 3, mtx.makeTranslation(xF + 0.05, bY - 0.1, sd * (fz - 0.05)));
      var ty = T.tail === 'wagon' || T.tail === 'van' ? sill + 0.5 : T.deckR - 0.15;
      var tl = T.tails === 'wide' ? new THREE.PlaneGeometry(0.5, 0.13) : new THREE.PlaneGeometry(0.16, 0.3);
      tl.rotateY(-Math.PI / 2);
      addGeo(tl, cTail, 0, 0.25, 0, 2, mtx.makeTranslation(xR - 0.006, ty, sd * (hw * plan(xR) - (T.tails === 'wide' ? 0.3 : 0.12))));
      var mir = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10); mir.rotateZ(Math.PI / 2);
      if (sd > 0 || T.era >= 78) addGeo(mir, T.era >= 78 ? cRubber : cChrome, 0, 0.2, T.era >= 78 ? 0 : 1, 0, mtx.makeTranslation(xA - 0.12, belt + 0.08, sd * (hw + 0.07)));
      var hdl = new THREE.BoxGeometry(0.16, 0.025, 0.02);
      addGeo(hdl, cChrome, 0, 0.15, 1, 0, mtx.makeTranslation(xB + 0.35, belt - 0.07, sd * (hw * plan(xB) + 0.005)));
    });
    var pl = new THREE.PlaneGeometry(0.37, 0.12); pl.rotateY(Math.PI / 2);
    addGeo(pl.clone(), cPlate, 0, 0.6, 0, 0, mtx.makeTranslation(xF + 0.11, bY, 0));
    pl.rotateY(Math.PI); addGeo(pl, cPlate, 0, 0.6, 0, 0, mtx.makeTranslation(xR - 0.11, bY + (T.tail === 'wagon' ? 0.25 : 0.22), 0));
    if (T.spare) { var sp = new THREE.CylinderGeometry(0.36, 0.36, 0.22, 14); sp.rotateZ(Math.PI / 2); addGeo(sp, cTyre, 0, 0.85, 0, 0, mtx.makeTranslation(xR - 0.14, sill + 0.65, 0)); }
    if (T.taxi) {
      addGeo(new THREE.BoxGeometry(0.42, 0.16, 0.2), C('#f2d34a'), 0, 0.4, 0, 3, mtx.makeTranslation((xAt + xC) / 2, H + 0.1, 0));
    }
    T.lamps3 = { fx: xF + 0.05, rx: xR - 0.05, y: fy, ty: T.tail === 'wagon' || T.tail === 'van' ? sill + 0.5 : T.deckR - 0.15, w: fz - 0.04 };
    return finishGeo(P, Cc, Pt, RM, GL);
  }
  function finishGeo(P, Cc, Pt, RM, GL) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setAttribute('aPaint', new THREE.Float32BufferAttribute(Pt, 1));
    g.setAttribute('aRM', new THREE.Float32BufferAttribute(RM, 2));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(GL, 1));
    g.computeVertexNormals();
    return g;
  }
  /* boxy vehicles: the bus and the truck, built from boxes and a few panels */
  function buildBoxVehicle(T) {
    var P = [], Cc = [], Pt = [], RM = [], GL = [], mtx = new THREE.Matrix4();
    function addGeo(g, col, pm, ro, me, gl, m) {
      g = g.index ? g.toNonIndexed() : g; if (m) g.applyMatrix4(m);
      var p = g.getAttribute('position').array;
      for (var i = 0; i < p.length; i++) P.push(p[i]);
      for (i = 0; i < p.length / 3; i++) { Cc.push(col.r, col.g, col.b); Pt.push(pm); RM.push(ro, me); GL.push(gl || 0); }
    }
    var L = T.L, Wd = T.W, white = new THREE.Color(1, 1, 1);
    if (T.bus) {
      addGeo(new THREE.BoxGeometry(L, 1.25, Wd), white, 1, 0.35, 0.1, 0, mtx.makeTranslation(0, 0.95, 0));
      addGeo(new THREE.BoxGeometry(L - 0.1, 0.95, Wd - 0.02), cGlass, 0, 0.06, 0, 0, mtx.makeTranslation(-0.05, 2.05, 0));
      addGeo(new THREE.BoxGeometry(L, 0.32, Wd), C('#e9e4d4'), 0, 0.4, 0, 0, mtx.makeTranslation(0, 2.68, 0));
      addGeo(new THREE.BoxGeometry(L - 0.4, 0.06, Wd - 0.3), C('#cfcac0'), 0, 0.6, 0, 0, mtx.makeTranslation(0, 2.87, 0));
      for (var k = 0; k < 9; k++) addGeo(new THREE.BoxGeometry(0.1, 0.92, Wd + 0.01), C('#e9e4d4'), 0, 0.4, 0, 0, mtx.makeTranslation(-L / 2 + 1.2 + k * 1.15, 2.05, 0));
      addGeo(new THREE.BoxGeometry(0.4, 0.3, 1.6), C('#101010'), 0, 0.5, 0, 0, mtx.makeTranslation(L / 2 - 0.15, 2.55, 0));
      [[L / 2 - 2.3, 0.5], [-L / 2 + 2.6, 0.5]].forEach(function (a) { [1, -1].forEach(function (sd) { var t = new THREE.CylinderGeometry(a[1], a[1], 0.3, 16); t.rotateX(Math.PI / 2); addGeo(t, cTyre, 0, 0.85, 0, 0, mtx.makeTranslation(a[0], a[1], sd * (Wd / 2 - 0.18))); }); });
      T.lamps3 = { fx: L / 2 + 0.03, rx: -L / 2 - 0.03, y: 0.55, ty: 0.9, w: Wd / 2 - 0.25 };
      T.tr = 0.5;
    } else {
      addGeo(new THREE.BoxGeometry(1.8, 1.25, Wd), white, 1, 0.35, 0.1, 0, mtx.makeTranslation(L / 2 - 0.9, 1.15, 0));
      addGeo(new THREE.BoxGeometry(1.4, 0.75, Wd - 0.06), cGlass, 0, 0.05, 0, 0, mtx.makeTranslation(L / 2 - 0.85, 2.1, 0));
      addGeo(new THREE.BoxGeometry(1.75, 0.12, Wd), white, 1, 0.35, 0.1, 0, mtx.makeTranslation(L / 2 - 0.95, 2.52, 0));
      addGeo(new THREE.BoxGeometry(L - 2.0, 2.4, Wd + 0.05), C('#dedbd2'), 0, 0.5, 0.2, 0, mtx.makeTranslation(-1.0, 1.95, 0));
      addGeo(new THREE.BoxGeometry(L, 0.25, 0.9), cUnder, 0, 0.9, 0, 0, mtx.makeTranslation(0, 0.55, 0));
      [[L / 2 - 1.0, 0.45], [-L / 2 + 1.5, 0.45]].forEach(function (a) { [1, -1].forEach(function (sd) { var t = new THREE.CylinderGeometry(a[1], a[1], 0.28, 16); t.rotateX(Math.PI / 2); addGeo(t, cTyre, 0, 0.85, 0, 0, mtx.makeTranslation(a[0], a[1], sd * (Wd / 2 - 0.2))); }); });
      T.lamps3 = { fx: L / 2 + 0.03, rx: -L / 2 - 0.03, y: 0.85, ty: 0.85, w: Wd / 2 - 0.25 };
      T.tr = 0.45;
    }
    [1, -1].forEach(function (sd) {
      var hl = new THREE.CircleGeometry(0.11, 12); hl.rotateY(Math.PI / 2); addGeo(hl, cHead, 0, 0.1, 0, 1, mtx.makeTranslation(L / 2 + 0.02, T.lamps3.y, sd * T.lamps3.w));
      var tl = new THREE.PlaneGeometry(0.2, 0.28); tl.rotateY(-Math.PI / 2); addGeo(tl, cTail, 0, 0.3, 0, 2, mtx.makeTranslation(-L / 2 - 0.03, T.lamps3.ty, sd * T.lamps3.w));
    });
    return finishGeo(P, Cc, Pt, RM, GL);
  }
  var carMat = litMaterial(std({ vertexColors: true, roughness: 0.4, metalness: 0.1, envMapIntensity: 1.1 }), {
    key: 'eracar', vhead: 'attribute float glow; attribute float aPaint; attribute vec2 aRM; varying float vGlow; varying vec2 vRM;\n', vmain: 'vGlow = glow; vRM = aRM;',
    fhead: 'varying float vGlow; varying vec2 vRM;\n',
    color: 'diffuseColor.rgb *= 1.0 - 0.1 * uWet;',
    rough: 'roughnessFactor = vRM.x; metalnessFactor = vRM.y;',
    pre: 'gl_FragColor.rgb += (vGlow > 0.5 && vGlow < 1.5 ? vec3(1.0, 0.9, 0.7) * 3.0 : vGlow > 1.5 && vGlow < 2.5 ? vec3(1.6, 0.05, 0.03) : vGlow > 2.5 ? vec3(1.2, 0.6, 0.05) * 0.8 : vec3(0.0)) * uNight;'
  });
  (function () {
    var prev = carMat.onBeforeCompile;
    carMat.onBeforeCompile = function (sh) {
      prev(sh);
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', [
        '#ifdef USE_COLOR', ' vColor = color;', '#endif',
        '#ifdef USE_INSTANCING_COLOR', ' vColor = mix(color, color * instanceColor, aPaint);', '#endif'
      ].join('\n'));
    };
  })();
  var TRAFFIC = 140, others = [], typeMeshes = [], typeW = [];
  TYPES.forEach(function (T, ti) {
    var geo = T.bus || T.truck ? buildBoxVehicle(T) : buildEraCar(T);
    T.lamps = T.lamps3;
    var maxN = T.bus ? 6 : T.truck ? 8 : 24;
    var im = new THREE.InstancedMesh(geo, carMat, maxN);
    for (var q = 0; q < maxN; q++) im.setColorAt(q, (T.era >= 78 ? PAL80 : PAL70)[q % (T.era >= 78 ? PAL80.length : PAL70.length)]);
    im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
    typeMeshes.push({ T: T, paint: im, max: maxN, used: 0 });
    typeW.push(T.w);
  });
  function pickType(rnd) {
    var tot = typeW.reduce(function (a, b) { return a + b; }, 0), r = rnd * tot;
    for (var i = 0; i < typeW.length; i++) { r -= typeW[i]; if (r <= 0) return i; }
    return 0;
  }
  function vehColour(T, k) {
    if (T.taxi) return C('#f3f0e6');
    if (T.bus) return [C('#2f5b3e'), C('#3a4f7a'), C('#a1442a')][k % 3];
    if (T.truck) return [C('#e9e6dc'), C('#c43a24'), C('#2f4d6a'), C('#d4a81c')][k % 4];
    var pal = T.era >= 78 ? PAL80 : PAL70; return pal[k % pal.length];
  }
  for (var oi = 0; oi < TRAFFIC; oi++) {
    var tix = pickType(hash(oi, 77, 1));
    others.push({ type: tix, i: -1, t: 0, dir: 1, v: 0, lane: hash(oi, 9, 2) > 0.5 ? 1 : -1, k: 0.72 + 0.28 * hash(oi, 5, 5), x: 0, z: 0, y: 0, h: 0, pitch: 0,
                  col: vehColour(TYPES[tix], (oi * 7 + 3) | 0), braking: false, stun: 0, bob: hash(oi, 3, 9) * 6 });
  }
  function allowed(o, e) { var T = TYPES[o.type]; return !(ECL[e] > 6 || (T.bus && ECL[e] > 3) || (T.truck && ECL[e] > 5)); }
  function spawnOther(o, near) {
    for (var tries = 0; tries < 24; tries++) {
      var a = Math.random() * Math.PI * 2, r = (near ? 30 : 170) + Math.random() * (near ? 260 : 230);
      var cx = ((car.x + Math.cos(a) * r + HALF) / GC) | 0, cz = ((car.z + Math.sin(a) * r + HALF) / GC) | 0;
      if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
      var c = cz * GN + cx, n = CS[c + 1] - CS[c];
      if (!n) continue;
      var i = CI[CS[c] + ((Math.random() * n) | 0)], e = PE[i];
      if (!allowed(o, e)) continue;
      if (ECL[e] >= 6 && Math.random() < 0.6) continue;   /* most traffic keeps to the through roads */
      if (Math.hypot(PX[i] - car.x, PZ[i] - car.z) < 35) continue;
      o.i = i; o.t = 0; o.dir = (EF[e] & 1) ? 1 : (Math.random() < 0.5 ? 1 : -1); o.v = ESP[e] / 3.6 * o.k * 0.7; o.stun = 0;
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
      if (!allowed(o, f) && ECL[f] > 7) continue;
      if (!allowed(o, f) && Math.random() < 0.85 && VAS[v + 1] - VAS[v] > 2) continue;
      opts.push(VAI[i]);
    }
    if (!opts.length) return false;
    var pick = opts[(Math.random() * opts.length) | 0], f2 = pick >> 1;
    if (pick & 1) { o.i = ES[f2 + 1] - 2; o.t = PL[o.i + 1] - PL[o.i]; o.dir = -1; } else { o.i = ES[f2]; o.t = 0; o.dir = 1; }
    return true;
  }
  var simTime = 0, trafficCount = 90;
  function stepTraffic(dt) {
    var q, o;
    for (q = 0; q < others.length; q++) {
      o = others[q];
      if (q >= trafficCount) { o.i = -1; continue; }
      if (o.i < 0 || Math.hypot(o.x - car.x, o.z - car.z) > 440) { spawnOther(o, false); if (o.i < 0) continue; }
      var e = PE[o.i], a = ES[e], b = ES[e + 1] - 1, sl, T = TYPES[o.type];
      var toEnd = o.dir > 0 ? PL[b] - PL[o.i] - o.t : PL[o.i] + o.t, target = ESP[e] / 3.6 * o.k * (T.bus || T.truck ? 0.85 : 1);
      if (toEnd < 16) target = Math.min(target, 5 + toEnd * 0.4);
      var vEnd = o.dir > 0 ? EB[e] : EA[e], sig = SIGV.get(vEnd);
      if (sig) {
        var grp = sig.groupOf.get(e * 2 + (o.dir > 0 ? 1 : 0));
        if (grp !== undefined) {
          var stt = sigState(sig, grp, simTime), stopAt = toEnd - (VR[vEnd] + 5);
          if (stt === 0 || (stt === 1 && stopAt > 6)) { if (stopAt > -1) target = Math.min(target, Math.max(0, stopAt) * 0.45); }
        }
      }
      var fxo = Math.cos(o.h), fzo = -Math.sin(o.h), myL = T.L;
      function follow(px, pz, pv, ph, pl) {
        var dxp = px - o.x, dzp = pz - o.z, ahead = dxp * fxo + dzp * fzo, side = Math.abs(dxp * fzo - dzp * fxo);
        if (ahead > 0 && ahead < 26 && side < 2.3) {
          var along = Math.max(0, pv * (fxo * Math.cos(ph) - fzo * Math.sin(ph))), gap = ahead - (myL + pl) / 2 - 2.5;
          target = Math.min(target, along + Math.max(0, gap) * 0.55);
        }
      }
      follow(car.x, car.z, car.vx, car.h, 4.3);
      for (var k2 = 0; k2 < others.length; k2++) if (k2 !== q && others[k2].i >= 0) { var p = others[k2]; if (Math.abs(p.x - o.x) < 26 && Math.abs(p.z - o.z) < 26) follow(p.x, p.z, p.v, p.h, TYPES[p.type].L); }
      if (o.stun > 0) { o.stun -= dt; target = 0; }
      o.braking = target < o.v - 0.4;
      o.v += clamp(Math.max(0, target) - o.v, -6.5 * dt, (T.bus || T.truck ? 1.2 : 2.0) * dt);
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
      o.h += dh * Math.min(1, dt * 6);
      o.y = PH[o.i] + (PH[o.i + 1] - PH[o.i]) * t + 0.02;
      var pt = Math.atan2((PH[o.i + 1] - PH[o.i]) * o.dir, sl) + clamp(-(target - o.v) * 0.004, -0.02, 0.02);
      o.pitch += (pt - o.pitch) * Math.min(1, dt * 5);
    }
    typeMeshes.forEach(function (tm) { tm.used = 0; });
    var nb = 0;
    for (q = 0; q < others.length; q++) {
      o = others[q];
      if (o.i < 0) continue;
      var tmz = typeMeshes[o.type];
      if (tmz.used >= tmz.max) continue;
      o.bob += dt * (1 + o.v * 0.4);
      qtmp.setFromEuler(eTmp.set(Math.sin(o.bob * 1.7) * 0.004 * Math.min(1, o.v / 5), o.h, o.pitch, 'YZX'));
      mtmp.compose(vtmp.set(o.x, o.y + Math.sin(o.bob * 2.3) * 0.006, o.z), qtmp, stmp);
      tmz.paint.setMatrixAt(tmz.used, mtmp);
      tmz.paint.setColorAt(tmz.used, o.col);
      o.slot = tmz.used; tmz.used++;
      blobAt(nb++, o.x, o.y, o.z, o.h, TYPES[o.type].L * 0.62, TYPES[o.type].W * 0.7);
    }
    typeMeshes.forEach(function (tm) {
      tm.paint.count = tm.used;
      tm.paint.instanceMatrix.needsUpdate = true;
      if (tm.paint.instanceColor) tm.paint.instanceColor.needsUpdate = true;
    });
    blobUsed.cars = nb;
  }
  var eTmp = new THREE.Euler();

  /* soft contact shadows under traffic and pedestrians */
  var BLOBS = 600, blobUsed = { cars: 0, peds: 0 };
  var blobMesh = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    var geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    var m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, color: 0x000000 }), BLOBS);
    m.count = 0; m.frustumCulled = false; m.renderOrder = 2; scene.add(m);
    return m;
  })();
  function blobAt(k, x, y, z, h, sx, sz) {
    if (k >= BLOBS) return;
    qtmp.setFromAxisAngle(yAxis, h);
    mtmp.compose(vtmp.set(x, y + 0.03, z), qtmp, stmp.set(sx * 2, 1, sz * 2)); stmp.set(1, 1, 1);
    blobMesh.setMatrixAt(k, mtmp);
  }
  function finishBlobs() { blobMesh.count = Math.min(BLOBS, blobUsed.cars + blobUsed.peds); blobMesh.instanceMatrix.needsUpdate = true; }

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
