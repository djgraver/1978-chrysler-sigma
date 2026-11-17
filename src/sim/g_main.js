
  /* ==========================================================
     TILE PLANNING AROUND THE CAR
     4 km tiles everywhere, 1 km within 2.6 km (main roads, larger buildings, sparse trees),
     256 m within 900 m (every street, kerbs, footpaths, all buildings, trees, lamps and signals),
     4 m terrain detail right under the car.
     ========================================================== */
  var chunks = new Map(), queue = [], lastPlan = { x: 1e9, z: 1e9 }, frameNo = 0, pending = false;
  function rectDist(x, z, x0, z0, s) { var dx = Math.max(x0 - x, 0, x - x0 - s), dz = Math.max(z0 - z, 0, z - z0 - s); return Math.hypot(dx, dz); }
  function want(L, ix, iz, hi, d, shown) {
    var key = L + '_' + ix + '_' + iz + (hi ? 'h' : ''), c = chunks.get(key);
    if (!c) { c = { key: key, L: L, ix: ix, iz: iz, hi: hi, group: null, d: d, used: 0 }; chunks.set(key, c); }
    c.d = d; c.used = frameNo;
    if (c.group) { shown.add(c); return true; }
    if (!c.queued) { c.queued = true; queue.push(c); }
    return false;
  }
  function disposeChunk(c) {
    if (c.group) {
      world.remove(c.group);
      (c.group.userData.sigs || []).forEach(function (s) { s.heads = null; activeSigs.delete(s); });
      c.group.traverse(function (o) { if (o.geometry && !o.geometry.userData.shared && o.geometry !== lensGeo) o.geometry.dispose(); });
    }
    chunks.delete(c.key);
  }
  var NEAR_L2 = 900;
  function plan(x, z) {
    var shown = new Set(), R = SIZE[0], i, j, a, b;
    frameNo++;
    for (var rz = 0; rz < 15; rz++) for (var rx = 0; rx < 15; rx++) {
      var x0 = -HALF + rx * R, z0 = -HALF + rz * R, d0 = rectDist(x, z, x0, z0, R);
      if (d0 >= 2600) { want(0, rx, rz, false, d0, shown); continue; }
      var rootNeeded = false;
      for (j = 0; j < 4; j++) for (i = 0; i < 4; i++) {
        var ix = rx * 4 + i, iz = rz * 4 + j, x1 = -HALF + ix * 1024, z1 = -HALF + iz * 1024, d1 = rectDist(x, z, x1, z1, 1024);
        if (d1 >= NEAR_L2) { if (!want(1, ix, iz, false, d1, shown)) rootNeeded = true; continue; }
        var midNeeded = false;
        for (b = 0; b < 4; b++) for (a = 0; a < 4; a++) {
          var jx = ix * 4 + a, jz = iz * 4 + b, d2 = rectDist(x, z, -HALF + jx * 256, -HALF + jz * 256, 256), hi = d2 < 120;
          if (!want(2, jx, jz, hi, d2, shown)) {
            var alt = chunks.get('2_' + jx + '_' + jz + (hi ? '' : 'h'));
            if (alt && alt.group) { alt.used = frameNo; shown.add(alt); } else midNeeded = true;
          }
        }
        if (midNeeded) { var mid = chunks.get('1_' + ix + '_' + iz); if (mid && mid.group) { mid.used = frameNo; shown.add(mid); } else rootNeeded = true; }
      }
      if (rootNeeded) { var root = chunks.get('0_' + rx + '_' + rz); if (root && root.group) { root.used = frameNo; shown.add(root); } }
    }
    var evict = [];
    chunks.forEach(function (c) {
      if (c.group) c.group.visible = shown.has(c);
      if (c.L > 0 && frameNo - c.used > 10 && chunks.size > 300) evict.push(c);
    });
    evict.forEach(disposeChunk);
    activeSigs.clear();
    chunks.forEach(function (c) { if (c.group && c.group.visible && c.L === 2) (c.group.userData.sigs || []).forEach(function (s) { activeSigs.add(s); }); });
    queue = queue.filter(function (c) { return chunks.get(c.key) === c && frameNo - c.used < 3; });
    chunks.forEach(function (c) { if (!c.group && queue.indexOf(c) < 0) c.queued = false; });
    queue.sort(function (p, q) { return (q.d + (q.L === 2 ? 0 : 150)) - (p.d + (p.L === 2 ? 0 : 150)); });
    lastPlan.x = x; lastPlan.z = z;
  }
  function buildSome(ms) {
    var t0 = performance.now(), n = 0;
    while (queue.length && (n === 0 || performance.now() - t0 < ms)) {
      var c = queue.pop(); c.queued = false;
      if (c.group || chunks.get(c.key) !== c) continue;
      c.group = buildChunk(c.L, c.ix, c.iz, c.hi); c.group.visible = false;
      world.add(c.group); n++;
    }
    return n;
  }
  /* the nearest 24 street lamps light the road, footpaths, walls and trees around the car */
  var lampScratch = [];
  function updateLampUniform() {
    lampScratch.length = 0;
    chunks.forEach(function (c) {
      if (!c.group || c.L !== 2 || c.d > 260) return;
      var ls = c.group.userData.lamps || [];
      for (var i = 0; i < ls.length; i++) { var l = ls[i], d = (l[5] - car.x) * (l[5] - car.x) + (l[7] - car.z) * (l[7] - car.z); if (d < 220 * 220) lampScratch.push([d, l]); }
    });
    lampScratch.sort(function (a, b) { return a[0] - b[0]; });
    var on = LIT.uNight.value > 0.02 ? 1 : 0;
    for (var i = 0; i < NL; i++) {
      var v = LIT.uLamps.value[i];
      if (i < lampScratch.length && on) { var l = lampScratch[i][1]; v.set(l[5], l[6], l[7], 1); } else v.set(0, -1000, 0, 0);
    }
  }

  /* ==========================================================
     CAMERA AND INPUT
     ========================================================== */
  var camPos = new THREE.Vector3(), look = new THREE.Vector3();
  function stepCamera(dt) {
    if (camMode === 1) {
      carG.updateMatrixWorld();
      camPos.set(0.02, 1.2, 0.36).applyMatrix4(carG.matrixWorld);
      look.set(6, 0.92 - orbit.pitch * 4, 0.36 - orbit.yaw * 6).applyMatrix4(carG.matrixWorld);
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(look);
      return;
    }
    var dy = car.h - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camYaw += dy * Math.min(1, dt * (2.2 + Math.abs(car.v) * 0.12));
    orbit.idle += dt;
    if (!orbit.drag && orbit.idle > 2.5 && Math.abs(car.v) > 1.5) { var f = Math.exp(-dt * 2.2); orbit.yaw *= f; orbit.pitch *= f; }
    var yaw = camYaw + orbit.yaw, p = clamp(0.22 + orbit.pitch, 0.03, 1.35), d = camDist + Math.abs(car.v) * 0.05;
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
    if (ev.code === 'KeyM') Radio.toggle();
    if (ev.code === 'KeyN') Radio.seek(1);
    if (/^Arrow|Space/.test(ev.code)) ev.preventDefault();
  });
  window.addEventListener('keyup', function (ev) { keys[ev.code] = false; });
  window.addEventListener('blur', function () { for (var k in keys) keys[k] = false; });
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
  var PLACES = [['Hobart city centre', -42.8826, 147.3290], ['Battery Point', -42.8895, 147.3330], ['Salamanca Place', -42.8868, 147.3315], ['Tasman Bridge', -42.8672, 147.3395],
                ['kunanyi / Mt Wellington summit', -42.8958, 147.2372], ['The Springs, Pinnacle Road', -42.8975, 147.2615], ['Sandy Bay', -42.9015, 147.3330], ['North Hobart', -42.8700, 147.3170],
                ['Glenorchy', -42.8330, 147.2760], ['Kingston', -42.9760, 147.3050], ['Bellerive', -42.8740, 147.3700], ['Hobart Airport', -42.8376, 147.5010],
                ['Richmond', -42.7355, 147.4385], ['Bridgewater', -42.7385, 147.2330], ['Sorell', -42.7820, 147.5640]];
  PLACES.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p[0]; $('places').appendChild(o); });
  var needWarm = false;
  $('places').addEventListener('change', function () {
    var p = PLACES[+this.value];
    placeOnRoad((p[2] - LON0) * KX, -(p[1] - LAT0) * KN);
    needWarm = true; canvas.focus();
  });
  /* time, weather and film controls */
  function hhmm(h) { var m = Math.round(h * 60) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  $('timeSl').addEventListener('input', function () { env.hour = +this.value; $('timeLbl').textContent = hhmm(env.hour); });
  $('cycleChk').addEventListener('change', function () { env.cycle = this.checked; });
  $('speedSel').addEventListener('change', function () { env.speed = +this.value; });
  $('weatherSel').addEventListener('change', function () { if (this.value === 'auto') { env.auto = true; env.nextAuto = 1; } else setWeather(this.value); });
  $('filmChk').addEventListener('change', function () { film.on = this.checked; });
  $('grainSl').addEventListener('input', function () { film.grain = +this.value; });
  function panelToggle(btn, panel) {
    $(btn).addEventListener('click', function () {
      var open = $(panel).hidden;
      ['envPanel', 'radioPanel'].forEach(function (p) { $(p).hidden = true; });
      ['envBtn', 'radioBtn'].forEach(function (b) { $(b).setAttribute('aria-expanded', 'false'); });
      $(panel).hidden = !open; $(btn).setAttribute('aria-expanded', String(open));
    });
  }
  panelToggle('envBtn', 'envPanel'); panelToggle('radioBtn', 'radioPanel');
  $('radioPower').addEventListener('click', function () { Radio.toggle(); });
  $('seekDn').addEventListener('click', function () { Radio.seek(-1); });
  $('seekUp').addEventListener('click', function () { Radio.seek(1); });
  $('tune').addEventListener('input', function () { Radio.tune(+this.value); });
  $('vol').addEventListener('input', function () { Radio.volume(+this.value); });
  Radio.label();

  /* ==========================================================
     HUD: two small analogue dials, the street, a map
     ========================================================== */
  var gc = $('gauges'), gg = gc.getContext('2d'), GD = 0;
  function sizeGauges() {
    var d = Math.min(2, window.devicePixelRatio || 1), w = gc.clientWidth, h = gc.clientHeight;
    gc.width = Math.round(w * d); gc.height = Math.round(h * d); gg.setTransform(d, 0, 0, d, 0, 0); GD = h;
  }
  function dial(cx, cy, r, val, max, major, minor, labelEvery, label, red, sub) {
    var a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, k;
    var grd = gg.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    grd.addColorStop(0, '#e9ecee'); grd.addColorStop(0.5, '#7d8286'); grd.addColorStop(1, '#d6d9db');
    gg.beginPath(); gg.arc(cx, cy, r, 0, Math.PI * 2); gg.fillStyle = grd; gg.fill();
    gg.beginPath(); gg.arc(cx, cy, r - 2.5, 0, Math.PI * 2); gg.fillStyle = '#121314'; gg.fill();
    if (red) { gg.beginPath(); gg.arc(cx, cy, r - 7, a0 + sweep * red / max, a0 + sweep); gg.strokeStyle = '#c0392b'; gg.lineWidth = 3; gg.stroke(); }
    for (k = 0; k <= max; k += minor) {
      var a = a0 + sweep * k / max, maj = Math.abs(k / major - Math.round(k / major)) < 1e-6, r1 = r - 5, r2 = maj ? r - 12 : r - 9;
      gg.beginPath(); gg.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); gg.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      gg.strokeStyle = '#ece7da'; gg.lineWidth = maj ? 1.6 : 0.8; gg.stroke();
      if (maj && Math.abs(k / labelEvery - Math.round(k / labelEvery)) < 1e-6) {
        gg.fillStyle = '#ece7da'; gg.font = '600 ' + Math.max(7, r * 0.15) + 'px "Space Grotesk", system-ui, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
        var lr = r - 20; gg.fillText(String(label(k)), cx + Math.cos(a) * lr, cy + Math.sin(a) * lr);
      }
    }
    gg.fillStyle = '#a9a39a'; gg.font = '500 ' + Math.max(6, r * 0.12) + 'px Inter, system-ui, sans-serif'; gg.textAlign = 'center';
    gg.fillText(sub, cx, cy + r * 0.42);
    var an = a0 + sweep * clamp(val, 0, max) / max;
    gg.beginPath(); gg.moveTo(cx - Math.cos(an) * r * 0.16, cy - Math.sin(an) * r * 0.16); gg.lineTo(cx + Math.cos(an) * (r - 9), cy + Math.sin(an) * (r - 9));
    gg.strokeStyle = '#ff6a1a'; gg.lineWidth = 2.2; gg.lineCap = 'round'; gg.stroke();
    gg.beginPath(); gg.arc(cx, cy, r * 0.09, 0, Math.PI * 2); gg.fillStyle = '#2b2d2f'; gg.fill();
  }
  var shownKmh = 0, shownRpm = 800;
  function drawGauges(dt) {
    if (!GD) sizeGauges();
    var w = gc.clientWidth, h = gc.clientHeight, r = h / 2 - 2;
    shownKmh += (Math.abs(car.v) * 3.6 - shownKmh) * Math.min(1, dt * 8);
    shownRpm += (car.rpm - shownRpm) * Math.min(1, dt * 10);
    gg.clearRect(0, 0, w, h);
    dial(r + 2, h / 2, r, shownKmh, 160, 20, 10, 20, function (k) { return k; }, 0, 'km/h');
    dial(w - r - 2, h / 2, r, shownRpm / 1000, 7, 1, 0.5, 1, function (k) { return k; }, 6, 'x1000 rpm');
    gg.fillStyle = '#ffb347'; gg.font = '600 ' + Math.round(r * 0.22) + 'px "Space Grotesk", system-ui, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    gg.fillText(car.v < -0.2 ? 'R' : String(car.gear), w - r - 2, h / 2 + r * 0.7);
  }
  window.addEventListener('resize', function () { GD = 0; });

  var mm = $('map'), mg = mm.getContext('2d'), MMS = 150, MMR = 320;
  function sizeMap() { MMS = mm.clientWidth || 150; var d = Math.min(2, window.devicePixelRatio || 1); mm.width = MMS * d; mm.height = MMS * d; mg.setTransform(d, 0, 0, d, 0, 0); }
  sizeMap(); window.addEventListener('resize', sizeMap);
  function drawMap() {
    var s = MMS / (2 * MMR), ox = MMS / 2 - car.x * s, oz = MMS / 2 - car.z * s;
    mg.fillStyle = '#2b2a26'; mg.fillRect(0, 0, MMS, MMS);
    var x0 = Math.max(0, ((car.x - MMR + HALF) / GC) | 0), x1 = Math.min(GN - 1, ((car.x + MMR + HALF) / GC) | 0);
    var z0 = Math.max(0, ((car.z - MMR + HALF) / GC) | 0), z1 = Math.min(GN - 1, ((car.z + MMR + HALF) / GC) | 0);
    for (var pass = 0; pass < 2; pass++) {
      mg.beginPath();
      for (var cz = z0; cz <= z1; cz++) for (var cx = x0; cx <= x1; cx++) for (var k = CS[cz * GN + cx]; k < CS[cz * GN + cx + 1]; k++) {
        var i = CI[k], major = ECL[PE[i]] <= 3;
        if (major !== (pass === 1)) continue;
        mg.moveTo(PX[i] * s + ox, PZ[i] * s + oz); mg.lineTo(PX[i + 1] * s + ox, PZ[i + 1] * s + oz);
      }
      mg.strokeStyle = pass ? '#e8a54a' : '#9c978c'; mg.lineWidth = pass ? 2.4 : 1.1; mg.stroke();
    }
    mg.fillStyle = '#9fd0e8';
    others.forEach(function (o) { if (o.i >= 0) mg.fillRect(o.x * s + ox - 1.5, o.z * s + oz - 1.5, 3, 3); });
    activeSigs.forEach(function (sg) { mg.fillStyle = '#d24a3a'; mg.fillRect(sg.x * s + ox - 1.5, sg.z * s + oz - 1.5, 3, 3); });
    mg.save(); mg.translate(MMS / 2, MMS / 2); mg.rotate(-car.h);
    mg.fillStyle = '#ff6a1a'; mg.strokeStyle = '#fff'; mg.lineWidth = 1.5;
    mg.beginPath(); mg.moveTo(8, 0); mg.lineTo(-6, 5); mg.lineTo(-3, 0); mg.lineTo(-6, -5); mg.closePath(); mg.fill(); mg.stroke();
    mg.restore();
    mg.fillStyle = '#f4ead6'; mg.font = '600 11px Inter, system-ui, sans-serif'; mg.fillText('N', MMS / 2 - 4, 12);
  }
  var hudT = 0, COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  function drawHud(dt) {
    drawGauges(dt);
    hudT += dt; if (hudT < 0.15) return; hudT = 0;
    var nm = '';
    if (car.edge >= 0) nm = NAMES[ENM[car.edge]];
    else if (nearRoad(car.x, car.z, 25, 0)) nm = NAMES[ENM[Q.e]];
    $('street').textContent = nm || (car.onRoad ? 'Unnamed road' : 'Off road');
    var a = ((car.h % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    $('info').textContent = COMPASS[Math.round(a / (Math.PI / 4)) % 8] + ' · ' + Math.round(car.y) + ' m · ' + hhmm(env.hour);
    if (document.activeElement !== $('timeSl')) { $('timeSl').value = env.hour; $('timeLbl').textContent = hhmm(env.hour); }
    drawMap();
  }
  function resize() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    makeTargets(w, h);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  /* ==========================================================
     START-UP AND MAIN LOOP
     ========================================================== */
  var running = false, last = 0, lampT = 0, headDir = new THREE.Vector3();
  function warm(done) {
    plan(car.x, car.z);
    var total = queue.length;
    (function go() {
      buildSome(45);
      loadMsg.textContent = 'Building the streets around you… ' + Math.round(100 * (1 - queue.length / Math.max(1, total))) + '%';
      if (queue.length) setTimeout(go, 0); else { plan(car.x, car.z); done(); }
    })();
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    simTime += dt; LIT.uTime.value = simTime;
    if (needWarm) { needWarm = false; plan(car.x, car.z); buildSome(500); plan(car.x, car.z); }
    var e = updateSky(dt);
    stepCar(dt);
    stepTraffic(dt);
    updateSignals(simTime);
    if (Math.hypot(car.x - lastPlan.x, car.z - lastPlan.z) > 14 || (pending && !queue.length)) { plan(car.x, car.z); pending = false; }
    if (queue.length) { buildSome(6); pending = true; }
    stepCamera(dt);
    /* sun and moon follow the car so its shadow stays sharp */
    sun.position.set(car.x + sdir.x * 60, car.y + Math.max(sdir.y, 0.05) * 60, car.z + sdir.z * 60); sun.target.position.set(car.x, car.y, car.z);
    moon.position.set(car.x - 30, car.y + 50, car.z + 20); moon.target.position.set(car.x, car.y, car.z);
    /* headlights at dusk, at night and in rain or fog */
    var lightsOn = LIT.uNight.value > 0.05 || W.rain > 0.5 || W.ff < 1200;
    LIT.uHeadOn.value = lightsOn ? 1 : 0;
    carG.updateMatrixWorld();
    LIT.uHeadPos.value.set(2.1, 0.68, 0).applyMatrix4(carG.matrixWorld);
    headDir.set(Math.cos(car.h), -0.1, -Math.sin(car.h)).normalize(); LIT.uHeadDir.value.copy(headDir);
    if (sigma.lens) sigma.lens.emissive.setRGB(1.0, 0.92, 0.75).multiplyScalar(lightsOn ? 2.2 : 0);
    if (sigma.tail) sigma.tail.emissive.setRGB(1, 0.05, 0.03).multiplyScalar(car.brake ? 2.2 : lightsOn ? 0.9 : 0.05);
    lampT += dt; if (lampT > 0.3) { lampT = 0; updateLampUniform(); }
    updateCarGlows();
    updatePrecip();
    sky.position.copy(camera.position);
    water.position.set(camera.position.x, 0, camera.position.z);
    drawHud(dt);
    renderFrame();
  }
  window.__sim = { stepCar: stepCar, types: typeMeshes, renderer: renderer, scene: scene, view: function (y, p, d) { orbit.yaw = y; orbit.pitch = p; camDist = d; orbit.idle = -1e9; }, sigs: SIGS, others: others, car: car, keys: keys, place: placeOnRoad, warmAll: function () { for (var k = 0; k < 4; k++) { plan(car.x, car.z); while (queue.length) buildSome(1000); } plan(car.x, car.z); }, chunks: chunks, env: env, film: film, setWeather: setWeather, radio: Radio,
    stats: function () { return { edges: NE, points: PX ? PX.length : 0, buildings: BLD ? BLD.N : 0, signals: SIGS.length, chunks: chunks.size, queue: queue.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; } };

  loadMsg.textContent = 'Loading the Hobart map…';
  Promise.all(['terrain.png', 'land.png', 'ground.jpg', 'roads.png', 'buildings.png'].map(loadImage))
    .then(function (im) {
      loadMsg.textContent = 'Reading heights, streets and 152,000 buildings…';
      return new Promise(function (ok, bad) {
        setTimeout(function () {
          try {
            decodeLand(im[0], im[1], im[2]);
            parseRoads(imageBytes(im[3])); roadHeights(); buildIndex(); averageOverlaps(); buildUrban();
            parseBuildings(imageBytes(im[4])); bucketTrees(); setupSignals();
            ok();
          } catch (err) { bad(err); }
        }, 30);
      });
    })
    .then(function () {
      stampP = new Uint32Array(PX.length); stampV = new Uint32Array(NV);
      placeOnRoad(0, 0);
      resize();
      updateSky(0);
      warm(function () {
        others.forEach(function (o) { spawnOther(o, true); });
        loadEl.hidden = true; running = true; last = performance.now();
        canvas.focus();
      });
    })
    .catch(function (err) { loadMsg.textContent = 'Could not load the map data. ' + (err && err.message ? err.message : ''); console.error(err); });
  requestAnimationFrame(frame);
})();
