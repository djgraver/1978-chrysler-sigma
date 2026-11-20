  /* ==========================================================
     THE DRIVER
     Sits in the right-hand seat and never leaves the car: a feathered 70s shag, aviators with orange
     glass, a burnt-orange shirt with a collar the size of a paper plane over a brown corduroy jacket,
     and flares. The hands stay on the wheel and follow it round; the head looks into the corners.
     All coordinates are the car's own (x forward, y up, z right).
     ========================================================== */
  var Driver = (function () {
    var root = new THREE.Group(), headG = new THREE.Group(), torsoG = new THREE.Group();
    carG.add(root);
    function M(hex, rough, metal, extra) { return litMaterial(std(Object.assign({ color: new THREE.Color(hex), roughness: rough, metalness: metal || 0 }, extra || {})), { key: 'drv' + hex.replace('#', '') + (extra && extra.transparent ? 't' : '') }); }
    var mSkin = M('#d9a07a', 0.6), mHair = M('#4b2914', 0.72), mJacket = M('#4a2c1a', 0.92), mShirt = M('#c4561d', 0.7), mPants = M('#8a6a42', 0.85),
        mShoe = M('#2e1b10', 0.5), mGold = M('#c9a24a', 0.28, 1), mLens = M('#ff7a14', 0.04, 0.1, { transparent: true, opacity: 0.58, depthWrite: false }), mDark = M('#1a1310', 0.6);
    mLens.emissive = new THREE.Color('#5a1e00'); mLens.emissiveIntensity = 0.35;
    function mesh(g, m, parent, shadow) { var o = new THREE.Mesh(g, m); o.castShadow = shadow !== false; o.receiveShadow = true; (parent || root).add(o); return o; }
    var up = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
    /* a unit-height tapered limb that is stretched between two points every frame */
    function limb(r0, r1, m, parent) { var g = new THREE.CylinderGeometry(r1, r0, 1, 10, 1); g.translate(0, 0.5, 0); return mesh(g, m, parent); }
    function span(o, a, b) { tmpV.subVectors(b, a); var L = tmpV.length(); o.position.copy(a); o.quaternion.setFromUnitVectors(up, tmpV.normalize()); o.scale.set(1, L, 1); }
    var Z = 0.37;
    /* ---- legs: thighs along the seat, shins down to the pedals, flared at the hem ---- */
    var hipL = new THREE.Vector3(0.02, 0.62, Z - 0.1), hipR = new THREE.Vector3(0.02, 0.62, Z + 0.1);
    var kneeL = new THREE.Vector3(0.33, 0.7, Z - 0.11), kneeR = new THREE.Vector3(0.33, 0.7, Z + 0.12);
    var footL = new THREE.Vector3(0.6, 0.32, Z - 0.12), footR = new THREE.Vector3(0.63, 0.33, Z + 0.13);
    [[hipL, kneeL, footL], [hipR, kneeR, footR]].forEach(function (l) {
      span(limb(0.085, 0.07, mPants), l[0], l[1]);
      span(limb(0.065, 0.1, mPants), l[1], l[2]);
      var sh = mesh(new THREE.BoxGeometry(0.27, 0.09, 0.11), mShoe); sh.position.copy(l[2]).add(new THREE.Vector3(0.07, -0.04, 0)); sh.rotation.z = -0.35;
    });
    mesh(new THREE.BoxGeometry(0.3, 0.16, 0.36), mPants).position.set(-0.01, 0.63, Z);
    /* ---- torso, leaning back into the seat ---- */
    root.add(torsoG); torsoG.position.set(0.02, 0.59, Z); torsoG.rotation.z = 0.19; torsoG.scale.setScalar(0.9);
    var jk = new THREE.CylinderGeometry(0.19, 0.17, 0.44, 12, 1); jk.scale(0.62, 1, 1); jk.translate(0, 0.22, 0);
    mesh(jk, mJacket, torsoG);
    /* the shirt shows in a deep V between the lapels */
    var vee = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.118, 0.42, -0.085), new THREE.Vector3(0.118, 0.42, 0.085), new THREE.Vector3(0.118, 0.17, 0)]);
    vee.computeVertexNormals(); var vm = mesh(vee, mShirt, torsoG, false); vm.material.side = THREE.DoubleSide;
    /* the collar: two long points lying out over the lapels */
    [-1, 1].forEach(function (sd) {
      var c = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.1, 0.45, sd * 0.03), new THREE.Vector3(0.115, 0.43, sd * 0.13), new THREE.Vector3(0.128, 0.29, sd * 0.11)]);
      c.computeVertexNormals(); mesh(c, mShirt, torsoG, false);
      var lap = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.12, 0.41, sd * 0.09), new THREE.Vector3(0.122, 0.4, sd * 0.16), new THREE.Vector3(0.121, 0.18, sd * 0.02)]);
      lap.computeVertexNormals(); mesh(lap, mJacket, torsoG, false);
    });
    [mShirt, mJacket].forEach(function (m) { m.side = THREE.DoubleSide; });
    /* a medallion, naturally */
    var med = mesh(new THREE.CircleGeometry(0.018, 12), mGold, torsoG, false); med.position.set(0.122, 0.3, 0.004); med.rotation.y = Math.PI / 2;
    /* ---- neck and head ---- */
    var neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), mSkin, torsoG); neck.position.set(0.0, 0.48, 0);
    torsoG.add(headG); headG.position.set(0.0, 0.55, 0);
    var head = new THREE.SphereGeometry(0.095, 18, 14); head.scale(0.98, 1.16, 0.88); head.translate(0.012, 0.075, 0);
    mesh(head, mSkin, headG);
    var nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 6), mSkin, headG); nose.rotation.z = -Math.PI / 2; nose.position.set(0.108, 0.06, 0);
    [-1, 1].forEach(function (sd) { var ear = mesh(new THREE.SphereGeometry(0.022, 8, 6), mSkin, headG); ear.scale.set(0.6, 1.2, 0.5); ear.position.set(0.0, 0.07, sd * 0.084); });
    var mouth = mesh(new THREE.BoxGeometry(0.004, 0.006, 0.036), mDark, headG, false); mouth.position.set(0.096, 0.0, 0);
    /* hair: a full feathered shag, parted in the middle, over the ears and down to the collar */
    var cap = new THREE.SphereGeometry(0.108, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56); cap.scale(1.04, 1.08, 1.0); cap.translate(-0.005, 0.085, 0);
    mesh(cap, mHair, headG);
    [-1, 1].forEach(function (sd) {
      var wing = new THREE.SphereGeometry(0.075, 12, 10); wing.scale(0.95, 1.35, 0.55);
      var w = mesh(wing, mHair, headG); w.position.set(-0.01, 0.06, sd * 0.088); w.rotation.x = sd * 0.25;
      var feather = new THREE.SphereGeometry(0.06, 10, 8); feather.scale(1.25, 0.55, 0.8);
      var f = mesh(feather, mHair, headG); f.position.set(0.05, 0.155, sd * 0.06); f.rotation.x = -sd * 0.5; f.rotation.z = -0.25;
    });
    var back = new THREE.SphereGeometry(0.1, 14, 10); back.scale(0.75, 1.25, 1.05);
    mesh(back, mHair, headG).position.set(-0.06, 0.03, 0);
    /* aviators: big teardrop lenses in orange glass, thin gold wire */
    [-1, 1].forEach(function (sd) {
      var lg = new THREE.CircleGeometry(0.03, 20); lg.scale(1.15, 1.0, 1); lg.translate(0, -0.006, 0);
      var pos = lg.attributes.position; for (var i = 0; i < pos.count; i++) { var y = pos.getY(i); if (y < -0.006) pos.setX(i, pos.getX(i) * (1 - (y + 0.006) * -5)); }
      var lens = mesh(lg, mLens, headG, false); lens.position.set(0.1, 0.072, sd * 0.038); lens.rotation.y = Math.PI / 2; lens.renderOrder = 5;
      var rim = mesh(new THREE.TorusGeometry(0.033, 0.0022, 4, 24), mGold, headG, false); rim.position.copy(lens.position); rim.rotation.y = Math.PI / 2; rim.scale.set(1.1, 1.02, 1);
      var temple = mesh(new THREE.BoxGeometry(0.11, 0.003, 0.003), mGold, headG, false); temple.position.set(0.045, 0.08, sd * 0.077);
    });
    var bridge = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.02), mGold, headG, false); bridge.position.set(0.103, 0.088, 0);
    /* ---- arms: shoulders to hands on the wheel, solved every frame ---- */
    var upL = limb(0.05, 0.046, mJacket), upR = limb(0.05, 0.046, mJacket), loL = limb(0.044, 0.04, mJacket), loR = limb(0.044, 0.04, mJacket);
    var cuffL = limb(0.042, 0.042, mShirt), cuffR = limb(0.042, 0.042, mShirt);
    var handL = mesh(new THREE.BoxGeometry(0.085, 0.035, 0.07), mSkin), handR = mesh(new THREE.BoxGeometry(0.085, 0.035, 0.07), mSkin);
    var C0 = new THREE.Vector3(0.47, 0.885, 0.37), U = new THREE.Vector3(0.408, 0.913, 0), Wv = new THREE.Vector3(0, 0, 1), RIM = 0.19;
    var sh = new THREE.Vector3(), hd = new THREE.Vector3(), el = new THREE.Vector3(), pole = new THREE.Vector3(), lap = new THREE.Vector3(), wrist = new THREE.Vector3(), m4 = new THREE.Matrix4();
    function solve(S, H, side, upper, lower, cuff, hand) {
      var L1 = 0.29, L2 = 0.28; tmpV.subVectors(H, S); var d = Math.min(tmpV.length(), L1 + L2 - 0.002), dir = tmpV.normalize().clone();
      var a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      pole.set(-0.1, -1, side * 0.6); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      el.copy(S).addScaledVector(dir, a).addScaledVector(pole, h);
      var Hc = S.clone().addScaledVector(dir, d);
      wrist.copy(el).lerp(Hc, 0.88);
      span(upper, S, el); span(lower, el, wrist); span(cuff, wrist, Hc);
      hand.position.copy(Hc).addScaledVector(dir, 0.03);
      hand.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    }
    var state = { look: 0, glance: 0, glanceT: 3, slump: 0, breath: 0, alive: 1 };
    function update(dt, camMode) {
      state.breath += dt * (state.alive > 0.5 ? 1.6 : 1.6 * state.alive + 0.05);
      var sl = state.slump;
      torsoG.rotation.z = 0.19 - sl * 0.3;
      torsoG.scale.set(0.9 * (1 + Math.sin(state.breath) * 0.012 * state.alive), 0.9, 0.9);
      /* look into the corners, now and then a glance to the side or the mirror */
      state.glanceT -= dt;
      if (state.glanceT < 0) { state.glance = Math.random() < 0.5 ? (Math.random() - 0.5) * 1.4 : 0; state.glanceT = 2 + Math.random() * 5; }
      var want = (car.sIn * 0.55 + state.glance * 0.5) * (1 - sl);
      state.look += (want - state.look) * Math.min(1, dt * 3);
      headG.rotation.set(0, state.look, -sl * 0.55);
      headG.visible = camMode !== 1;
      /* hands at ten and two, following the rim as it turns, and later resting in the lap */
      var th = clamp(-car.steer * 14, -1.4, 1.4);
      torsoG.updateMatrix(); m4.copy(torsoG.matrix);
      [[-1, upL, loL, cuffL, handL], [1, upR, loR, cuffR, handR]].forEach(function (A) {
        var sd = A[0];
        sh.set(0.01, 0.43, sd * 0.2).applyMatrix4(m4);
        var phi = sd * 1.05 + th;
        hd.copy(C0).addScaledVector(U, Math.cos(phi) * RIM).addScaledVector(Wv, Math.sin(phi) * RIM);
        lap.set(0.2, 0.72, Z + sd * 0.09);
        hd.lerp(lap, sl);
        solve(sh, hd, sd, A[1], A[2], A[3], A[4]);
      });
    }
    function reset() { state.slump = 0; state.alive = 1; }
    return { update: update, state: state, reset: reset, root: root };
  })();
