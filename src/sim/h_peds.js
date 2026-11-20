  /* ==========================================================
     PEDESTRIANS
     Instanced figures that walk the footpaths, cross at corners and wait at bus stops. Arms and legs
     swing in the vertex shader; clothes and skin are per-instance colours. The Sigma passes
     through them (they are not collidable), but they skip out of its way.
     ========================================================== */
  var PED_MAX = 420, pedCount = 260;
  var peds = [];
  function pedGeometry(coat) {
    var P = [], K = [], LB = [], mtx = new THREE.Matrix4();
    /* kind: 0 shirt, 1 skin, 2 trousers, 3 shoes, 4 hair.  limb: 0 body, 1 left leg, 2 right leg, 3 left arm, 4 right arm */
    function add(g, kind, limb, m) {
      g = g.index ? g.toNonIndexed() : g; g.applyMatrix4(m);
      var p = g.getAttribute('position').array;
      for (var i = 0; i < p.length; i++) P.push(p[i]);
      for (i = 0; i < p.length / 3; i++) { K.push(kind); LB.push(limb); }
    }
    function T(x, y, z) { return mtx.makeTranslation(x, y, z).clone(); }
    /* legs (pivot at the hip, 0.92 m) */
    [[1, -0.095], [2, 0.095]].forEach(function (l) {
      add(new THREE.BoxGeometry(0.15, 0.46, 0.15), coat ? 0 : 2, l[0], T(0, 0.7, l[1]));
      add(new THREE.BoxGeometry(0.13, 0.42, 0.13), 2, l[0], T(0, 0.27, l[1]));
      add(new THREE.BoxGeometry(0.26, 0.08, 0.12), 3, l[0], T(0.045, 0.04, l[1]));
    });
    /* hips and torso */
    add(new THREE.BoxGeometry(0.24, 0.16, 0.36), coat ? 0 : 2, 0, T(0, 0.95, 0));
    var torso = new THREE.CylinderGeometry(0.2, 0.17, 0.56, 8, 1); torso.scale(0.62, 1, 1);
    add(torso, 0, 0, T(0, 1.3, 0));
    if (coat) { var skirt = new THREE.CylinderGeometry(0.19, 0.25, 0.5, 8, 1, true); skirt.scale(0.7, 1, 1); add(skirt, 0, 0, T(0, 0.78, 0)); }
    add(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6), 1, 0, T(0, 1.61, 0));
    var head = new THREE.SphereGeometry(0.105, 10, 8); head.scale(1, 1.14, 0.92);
    add(head, 1, 0, T(0.01, 1.72, 0));
    var hair = new THREE.SphereGeometry(0.114, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.44); hair.scale(1, 1.1, 0.96);
    add(hair, 4, 0, T(-0.008, 1.738, 0));
    /* hair over the back of the head, longer on some */
    add(new THREE.BoxGeometry(0.1, coat ? 0.34 : 0.14, 0.2), 4, 0, T(-0.075, coat ? 1.63 : 1.72, 0));
    /* arms (pivot at the shoulder, 1.53 m) */
    [[3, -0.25], [4, 0.25]].forEach(function (a) {
      add(new THREE.BoxGeometry(0.1, 0.34, 0.1), 0, a[0], T(0, 1.38, a[1]));
      add(new THREE.BoxGeometry(0.085, 0.27, 0.085), coat ? 1 : 0, a[0], T(0, 1.08, a[1]));
      add(new THREE.BoxGeometry(0.08, 0.1, 0.07), 1, a[0], T(0, 0.9, a[1]));
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('pkind', new THREE.Float32BufferAttribute(K, 1));
    g.setAttribute('plimb', new THREE.Float32BufferAttribute(LB, 1));
    g.computeVertexNormals();
    return g;
  }
  var pedMat = litMaterial(std({ roughness: 0.85, metalness: 0 }), {
    key: 'ped',
    vhead: 'attribute float pkind; attribute float plimb; attribute vec4 iPed; attribute vec3 iShirt; attribute vec3 iPants; attribute vec3 iSkin; varying vec3 vPC;\n',
    vmain: [
      'vec3 hairC = iPed.w < 0.3 ? vec3(0.02, 0.015, 0.01) : iPed.w < 0.6 ? vec3(0.09, 0.05, 0.02) : iPed.w < 0.8 ? vec3(0.35, 0.24, 0.1) : vec3(0.5, 0.5, 0.5);',
      'vPC = pkind < 0.5 ? iShirt : pkind < 1.5 ? iSkin : pkind < 2.5 ? iPants : pkind < 3.5 ? vec3(0.03, 0.025, 0.02) : hairC;'
    ].join('\n'),
    fhead: 'varying vec3 vPC;\n',
    color: 'diffuseColor.rgb = vPC * (1.0 - 0.12 * uWet);'
  });
  (function () {
    var prev = pedMat.onBeforeCompile;
    pedMat.onBeforeCompile = function (sh) {
      prev(sh);
      var rot = [
        'float pSw = iPed.y * sin(iPed.x);',
        'float pAng = plimb < 0.5 ? 0.0 : plimb < 1.5 ? pSw : plimb < 2.5 ? -pSw : plimb < 3.5 ? -pSw * 0.75 : pSw * 0.75;',
        'float pPiv = plimb > 2.5 ? 1.53 : 0.92;',
        'float pc = cos(pAng), ps = sin(pAng);'
      ].join('\n');
      sh.vertexShader = sh.vertexShader
        .replace('#include <beginnormal_vertex>', rot + '\nvec3 objectNormal = vec3(pc * normal.x - ps * normal.y, ps * normal.x + pc * normal.y, normal.z);')
        .replace('#include <begin_vertex>', [
          'vec3 transformed = position;',
          'if (plimb > 0.5) { vec2 r = vec2(position.x, position.y - pPiv); transformed.xy = vec2(pc * r.x - ps * r.y, ps * r.x + pc * r.y + pPiv); }',
          'transformed.y += abs(cos(iPed.x)) * 0.045 * iPed.y;',
          'transformed.z += sin(iPed.x) * 0.012 * iPed.y;'
        ].join('\n'));
    };
  })();
  var pedMeshes = [false, true].map(function (coat) {
    var g = pedGeometry(coat);
    var ib = function (n) { return new THREE.InstancedBufferAttribute(new Float32Array(PED_MAX * n), n).setUsage(THREE.DynamicDrawUsage); };
    g.setAttribute('iPed', ib(4)); g.setAttribute('iShirt', ib(3)); g.setAttribute('iPants', ib(3)); g.setAttribute('iSkin', ib(3));
    var m = new THREE.InstancedMesh(g, pedMat, PED_MAX);
    m.count = 0; m.frustumCulled = false; m.receiveShadow = true;
    scene.add(m);
    return m;
  });
  var SHIRTS = ['#c4561d', '#6b7f3a', '#e8dcb8', '#7a2f1c', '#2f4d36', '#c9a227', '#7fa7c9', '#b33a2a', '#4d3a5c', '#d9d2c0', '#3c4f7a', '#8a6a4a', '#e07a2a', '#a8b07a', '#5c1f2a', '#efe6d0'].map(C);
  var PANTS = ['#2b3346', '#4a3a28', '#1f1f22', '#6b5a3a', '#3a4a5c', '#55503f', '#2c2a26', '#7a6648', '#283a2e'].map(C);
  var SKINS = ['#f1c8a8', '#e3b08c', '#c98d66', '#a8714d', '#7a4d32', '#5a3624', '#f6d6bd'].map(C);
  for (var pi0 = 0; pi0 < PED_MAX; pi0++) {
    peds.push({ i: -1, t: 0, dir: 1, side: 1, v: 1.3, x: 0, z: 0, y: 0, h: 0, rx: 0, rz: 0, ry: 0, phase: 0, wait: 0, stop: null, coat: hash(pi0, 4, 4) < 0.42 ? 1 : 0,
                s: 0.9 + hash(pi0, 5, 5) * 0.17, lat: (hash(pi0, 11, 3) - 0.5) * 0.9, dodge: 0, dodgeV: 0, look: 0,
                shirt: SHIRTS[(hash(pi0, 6, 6) * SHIRTS.length) | 0], pants: PANTS[(hash(pi0, 7, 7) * PANTS.length) | 0], skin: SKINS[(hash(pi0, 8, 8) * SKINS.length) | 0], hair: hash(pi0, 9, 9) });
  }
  /* where people go: footpaths, weighted towards busy, built-up streets */
  function pedSpawn(p, near) {
    /* some wait at a bus stop */
    if (STOPS_ALL.length && Math.random() < 0.14) {
      var cands = stopsNear(car.x, car.z, near ? 200 : 300);
      if (cands.length) {
        var st = cands[(Math.random() * cands.length) | 0], busy = 0;
        peds.forEach(function (q) { if (q.stop === st) busy++; });
        if (busy < 3) {
          var a = Math.random() * 6.283, r = 0.6 + Math.random() * 1.1;
          p.stop = st; p.i = -2; p.wait = 20 + Math.random() * 80;
          p.x = st.x + st.fx * (0.4 + Math.random() * 0.8) + st.tx * (Math.random() - 0.5) * 3.2; p.z = st.z + st.fz * (0.4 + Math.random() * 0.8) + st.tz * (Math.random() - 0.5) * 3.2;
          p.y = st.y; p.h = Math.atan2(-st.fz, st.fx) + (Math.random() - 0.5) * 1.2; p.rx = p.x; p.rz = p.z; p.ry = p.y; p.v = 0;
          return true;
        }
      }
    }
    for (var tries = 0; tries < 30; tries++) {
      var ang = Math.random() * Math.PI * 2, rr = (near ? 12 : 140) + Math.random() * (near ? 220 : 120);
      var cx = ((car.x + Math.cos(ang) * rr + HALF) / GC) | 0, cz = ((car.z + Math.sin(ang) * rr + HALF) / GC) | 0;
      if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
      var c = cz * GN + cx, n = CS[c + 1] - CS[c];
      if (!n) continue;
      var i = CI[CS[c] + ((Math.random() * n) | 0)], e = PE[i];
      if (!ESW[e] || PB[i]) continue;
      var u = urbanAt(PX[i], PZ[i]);
      if (Math.random() > 0.12 + 1.6 * u) continue;
      p.i = i; p.t = Math.random() * (PL[i + 1] - PL[i]); p.dir = Math.random() < 0.5 ? 1 : -1; p.side = Math.random() < 0.5 ? 1 : -1;
      p.v = 1.05 + Math.random() * 0.6; p.stop = null; p.wait = 0; p.dodge = 0; p.dodgeV = 0;
      pedPos(p);
      if (onCarriageway(p.x, p.z, -1, 0.4)) continue;
      p.rx = p.x; p.rz = p.z; p.ry = p.y; p.h = Math.atan2(-(PZ[i + 1] - PZ[i]) * p.dir, (PX[i + 1] - PX[i]) * p.dir);
      return true;
    }
    p.i = -1; return false;
  }
  function pedPos(p) {
    var i = p.i, e = PE[i], sl = PL[i + 1] - PL[i] || 1, t = clamp(p.t / sl, 0, 1);
    var off = (EW[e] / 2 + SWW * 0.55 + p.lat + p.dodge) * p.side;
    var nx = PNX[i] + (PNX[i + 1] - PNX[i]) * t, nz = PNZ[i] + (PNZ[i + 1] - PNZ[i]) * t;
    var jx = PX[i] + (PX[i + 1] - PX[i]) * t, jz = PZ[i] + (PZ[i + 1] - PZ[i]) * t;
    p.x = jx + nx * off; p.z = jz + nz * off;
    var nearJ = Math.hypot(jx - VX[EA[e]], jz - VZ[EA[e]]) < VTRIM[EA[e]] || Math.hypot(jx - VX[EB[e]], jz - VZ[EB[e]]) < VTRIM[EB[e]];
    p.y = PH[i] + (PH[i + 1] - PH[i]) * t + (nearJ ? 0.03 : KERB);
  }
  function pedNext(p, v, from) {
    var opts = [];
    for (var k = VAS[v]; k < VAS[v + 1]; k++) { var f = VAI[k] >> 1; if (ESW[f] && (f !== from || VAS[v + 1] - VAS[v] === 1)) opts.push(VAI[k]); }
    if (!opts.length) return false;
    var pick = opts[(Math.random() * opts.length) | 0], f2 = pick >> 1;
    if (pick & 1) { p.i = ES[f2 + 1] - 2; p.t = PL[p.i + 1] - PL[p.i]; p.dir = -1; } else { p.i = ES[f2]; p.t = 0; p.dir = 1; }
    if (f2 === from) p.dir = -p.dir;
    if (Math.random() < 0.3) p.side = -p.side;   /* cross the road at the corner */
    return true;
  }
  var pedTmpCol = new THREE.Color();
  function stepPeds(dt) {
    var cfx = Math.cos(car.h), cfz = -Math.sin(car.h), csp = Math.abs(car.vx), used = [0, 0];
    /* fewer people out late at night, early in the morning and in the rain */
    var hr = env.hour, busy = hr < 6 ? 0.08 : hr < 8 ? 0.08 + (hr - 6) * 0.4 : hr < 18 ? 1 : hr < 23 ? 1 - (hr - 18) * 0.17 : 0.12;
    var cap = Math.min(PED_MAX, Math.round(pedCount * busy * (1 - 0.55 * W.rain - 0.4 * W.snow)));
    for (var q = 0; q < PED_MAX; q++) {
      var p = peds[q];
      if (q >= cap && (p.i < 0 || q >= pedCount || Math.hypot(p.rx - car.x, p.rz - car.z) > 140)) { p.i = -1; continue; }
      if (p.i === -1 || p.i === -3 || Math.hypot(p.rx - car.x, p.rz - car.z) > 330) { if (!pedSpawn(p, p.i === -3 || (p.i === -1 && simTime < 2))) continue; }
      var walking = p.i >= 0;
      if (walking) {
        p.t += p.dir * p.v * dt;
        var ok = true, guard = 0;
        while (guard++ < 6) {
          var e = PE[p.i], a = ES[e], b = ES[e + 1] - 1, sl = PL[p.i + 1] - PL[p.i];
          if (p.t > sl) { if (p.i + 1 >= b) { ok = pedNext(p, EB[e], e); if (!ok) break; } else { p.i++; p.t -= sl; } }
          else if (p.t < 0) { if (p.i <= a) { ok = pedNext(p, EA[e], e); if (!ok) break; } else { p.i--; p.t += PL[p.i + 1] - PL[p.i]; } }
          else break;
        }
        if (!ok) { p.dir = -p.dir; p.t = clamp(p.t, 0, PL[p.i + 1] - PL[p.i]); }
        /* the car is coming: step back towards the buildings */
        var dxc = p.rx - car.x, dzc = p.rz - car.z, ahead = dxc * cfx + dzc * cfz, side = Math.abs(dxc * cfz - dzc * cfx);
        var threat = csp > 2 && ahead > -2 && ahead < 4 + csp * 1.2 && side < 2.6;
        p.dodge += ((threat ? 1.6 : 0) - p.dodge) * Math.min(1, dt * (threat ? 7 : 0.8));
        pedPos(p);
        /* the drawn figure follows its target at a walking pace, so corners are walked, not jumped */
        var mx = p.x - p.rx, mz = p.z - p.rz, md = Math.hypot(mx, mz), lim = (p.v * 1.6 + (threat ? 4 : 0)) * dt;
        if (md > 25) { p.rx = p.x; p.rz = p.z; }
        else if (md > lim) { p.rx += mx / md * lim; p.rz += mz / md * lim; } else { p.rx = p.x; p.rz = p.z; }
        if (md > 0.02) { var hh = Math.atan2(-mz, mx), dh = Math.atan2(Math.sin(hh - p.h), Math.cos(hh - p.h)); p.h += dh * Math.min(1, dt * 7); }
        p.ry += (p.y - p.ry) * Math.min(1, dt * 8);
        p.phase += dt * p.v * 5.2 / p.s;
      } else {
        /* waiting at a stop: shift weight, glance up the road */
        p.wait -= dt;
        p.phase += dt * 0.6;
        p.look += dt;
        var stp = p.stop, want = Math.atan2(-stp.fz, stp.fx) + Math.sin(p.look * 0.3 + q) * 0.9;
        p.h += Math.atan2(Math.sin(want - p.h), Math.cos(want - p.h)) * Math.min(1, dt * 0.8);
        if (p.wait < 0) { p.stop = null; p.i = -1; continue; }
      }
      var mesh = pedMeshes[p.coat], k = used[p.coat]++;
      qtmp.setFromAxisAngle(yAxis, p.h);
      mtmp.compose(vtmp.set(p.rx, p.ry, p.rz), qtmp, stmp.set(p.s, p.s, p.s)); stmp.set(1, 1, 1);
      mesh.setMatrixAt(k, mtmp);
      var g = mesh.geometry, A = g.attributes;
      A.iPed.setXYZW(k, p.phase, walking ? 0.42 * Math.min(1, p.v) : 0.02, 0, p.hair);
      A.iShirt.setXYZ(k, p.shirt.r, p.shirt.g, p.shirt.b);
      A.iPants.setXYZ(k, p.pants.r, p.pants.g, p.pants.b);
      A.iSkin.setXYZ(k, p.skin.r, p.skin.g, p.skin.b);
      blobAt(blobUsed.cars + used[0] + used[1] - 1, p.rx, p.ry, p.rz, p.h, 0.42, 0.42);
    }
    pedMeshes.forEach(function (m, j) {
      m.count = used[j]; m.instanceMatrix.needsUpdate = true;
      var A = m.geometry.attributes; A.iPed.needsUpdate = true; A.iShirt.needsUpdate = true; A.iPants.needsUpdate = true; A.iSkin.needsUpdate = true;
    });
    blobUsed.peds = used[0] + used[1];
  }
