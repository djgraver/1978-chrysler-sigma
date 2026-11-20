  /* ==========================================================
     LAST LIGHT
     Five errands across Hobart while the world quietly winds down: each one is "go here, then go there".
     After every chapter the sky whitens, the colour drains, the streets empty and the radio loses its
     stations. The last errand ends at the top of the mountain, and so does the driver. Then the credits.
     ========================================================== */
  var STORY = {
    title: 'Last Light',
    sub: 'Hobart, November 1978',
    prologue: [
      'On Tuesday the sky went the colour of milk and did not come back.',
      'The radio says it is happening everywhere, quietly, the way a tide goes out. Nobody is panicking. There is nothing to panic at.',
      'You have a few errands. You might as well do them.'
    ],
    chapters: [
      { title: 'The prescription', decay: 0.0,
        legs: [
          { goal: "Pick up Mum's prescription", where: 'the chemist, Elizabeth Street', at: [-42.88129, 147.32716],
            text: "The chemist is open, but there's nobody behind the counter. Her name is typed on a white paper bag beside the till, spelled right. You take it, and leave the exact money on the glass, because she taught you to." },
          { goal: 'Take it to Mum', where: 'her flat in North Hobart', at: [-42.8703, 147.3166],
            text: "She is asleep in the chair by the window with the cat in her lap. The tea beside her has gone cold; the skin on the milk doesn't move. You put the bag on the sill where she'll see it. You don't wake her. Later you will tell yourself that you didn't know." }
        ] },
      { title: 'Photographs', decay: 0.2,
        legs: [
          { goal: 'Collect your photographs', where: 'the camera shop, Murray Street', at: [-42.88268, 147.32589],
            text: 'Twenty-four prints in a yellow envelope. Every one of them is white. Not overexposed. Just white, as if the light had got into the camera and would not leave.' },
          { goal: 'Show them to Ruth', where: 'Salamanca Place', at: [-42.8866, 147.3318],
            text: "Ruth goes through them slowly, holding each one up against the sky as if there might be something underneath. She says they are the most honest pictures anyone has ever taken. She keeps the one she says is of you." }
        ] },
      { title: 'The record', decay: 0.4,
        legs: [
          { goal: "Give Tom back his record", where: 'his place in Rosny, across the bridge', at: [-42.8652, 147.3592],
            text: "Tom's front door is open. The stereo is still on, the needle riding the run-out groove, round and round, a sound like surf on a beach a long way off. You lift the arm. The house is very quiet after that." },
          { goal: 'Go down to the water', where: 'Bellerive Beach', at: [-42.8746, 147.3741],
            text: 'The river is flat as a plate. No gulls. The tide has gone out further than you have ever seen it, and the boats lie on their sides in the mud like sleeping dogs. You stand there until standing there stops meaning anything.' }
        ] },
      { title: 'The cutting', decay: 0.6,
        legs: [
          { goal: "Take a cutting of Dad's rose", where: 'the Botanical Gardens', at: [-42.86469, 147.32888],
            text: 'The gates are open and nobody minds. You take a slip from the old rose by the conservatory, the one he always stopped at, and wrap the end in a wet handkerchief.' },
          { goal: 'Plant it for Dad', where: 'Cornelian Bay cemetery', at: [-42.8541, 147.3196],
            text: 'You plant the cutting beside his stone with your bare hands. It is absurd to plant anything now. You do it carefully anyway, and press the soil down, and water it from the tap by the gate.' }
        ] },
      { title: 'The mountain', decay: 0.8,
        legs: [
          { goal: 'Fill the tank', where: 'the nearest service station', fuel: true,
            text: 'The attendant has gone. The pumps still work. You fill her up and leave the money on the counter under a jar of barley sugar, because some habits outlast the world.' },
          { goal: 'Drive up the mountain', where: 'the Pinnacle, Mount Wellington', at: [-42.8957, 147.2367], last: true }
        ] }
    ],
    ending: [
      'You turn off the engine.',
      'It ticks as it cools.',
      'Below you the city lies under a light with no source, as if the whole river were the inside of a shell.',
      'You are tired in the good way, the way you are after a long day of small jobs.',
      'Your heart, which has kept time for you without complaint for thirty-one years, begins to lose the beat.',
      'It is not frightening. It is like the radio going quiet between stations.',
      'The last thing you think about is the tea, and whether anyone will drink it.'
    ],
    radio: [
      ['…the Bureau says the brightness is not cloud and not smoke, and asks motorists to use their headlamps…', '…cricket at Bellerive is postponed. The groundsman says the grass has stopped growing…', '…and that was the Derwent Disco top ten. Stay tuned. We will be here as long as there is a here…'],
      ['…reports from Melbourne and Perth describe the same pale sky. The Prime Minister has asked for calm, and is said to be calm himself…', '…the ferry will not run today. The ferry will not run…', '…if you are listening, ring your mother…'],
      ['…we have lost contact with the mainland. We are still playing records. Somebody has to…', '…the birds have gone quiet across the state. Experts are unable to…', "…this one's for everybody still driving around…"],
      ['…this is… this is the Hobart station of the… we are…', '…nothing further to report. There is nothing further.', '…(static)…'],
      ['…(static)…', '…', '…(a long hiss, like surf)…']
    ],
    cosmos: [
      'The light that fell on the mountain this morning left the sun eight minutes and twenty seconds earlier. It did not know you were there.',
      'The Earth is four and a half billion years old. If all of that were a single day, people turned up in the last few seconds before midnight. You were here for a few hundred-thousandths of one of those seconds.',
      'There are about two hundred billion galaxies we can see, each with hundreds of billions of stars. Around nearly all of them, nothing is happening at all, and nothing ever will.',
      'In about a billion years the sun will grow bright enough to boil the oceans. In five billion it will swell and swallow the inner planets. No one will be left to notice that the Sigma was orange.',
      'After the last star burns out, the galaxies will drift apart until each is alone in a dark it cannot see across. Matter itself may slowly come undone. In a googol years the last black holes will evaporate, and the universe will settle into a temperature so even that nothing can ever happen again.',
      'There will be no record of the prescription, or the white photographs, or the rose. No one is keeping score. No one ever was.',
      'All of this was already true while the tea was hot and Ruth was laughing.',
      'It meant nothing. It meant nothing then, either.',
      'You did the errands anyway.'
    ],
    credits: [
      ['Driver', 'You'],
      ['The car', 'A 1978 Chrysler Sigma, modelled from photographs of the real one'],
      ['Hobart', '152,000 buildings and 3,000 km of streets from OpenStreetMap contributors, under the Open Database Licence'],
      ['The ground', 'Elevation from the Mapzen terrain tiles. Colour from Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016)'],
      ['The radio', 'Music composed in the browser as you drive. None of it was ever recorded, and none of it will be again'],
      ['Rendering', 'three.js'],
      ['Made with', 'Claude'],
      ['', 'Mum, Ruth, Tom and Dad are invented. So, in the end, are you.']
    ]
  };

  var Q = { mode: 'off', ch: 0, leg: 0, target: null, decay: 0, decayGoal: 0, radioT: 25, radioI: 0, scene: null, end: null };
  function llToXZ(la, lo) { return [(lo - LON0) * KX, -(la - LAT0) * KN]; }
  function resolveTarget(L) {
    var x, z;
    if (L.fuel) { var ns = nearestStation(car.x, car.z); if (!ns) return null; return { x: ns.st.x, z: ns.st.z, y: ns.st.y, r: Math.max(ns.st.hl, ns.st.hd) + 2, station: ns.st }; }
    var p = llToXZ(L.at[0], L.at[1]); x = p[0]; z = p[1];
    var rp = nearestRoadPoint(x, z, 450, 7);
    if (rp) { var i = rp.i; x = PX[i] + (PX[i + 1] - PX[i]) * rp.t; z = PZ[i] + (PZ[i + 1] - PZ[i]) * rp.t; return { x: x, z: z, y: PH[i] + (PH[i + 1] - PH[i]) * rp.t, r: 20 }; }
    return { x: x, z: z, y: terrainH(x, z, 4), r: 25 };
  }

  /* ---------- a column of pale light over the destination ---------- */
  var beaconMat = new THREE.ShaderMaterial({
    uniforms: { uTime: LIT.uTime, uA: { value: 0 }, uNight: LIT.uNight },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: [
      'uniform float uTime; uniform float uA; uniform float uNight; varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);',
      '  float core = 1.0 - edge;',
      '  float h = vUv.y; float fade = smoothstep(0.0, 0.03, h) * (1.0 - smoothstep(0.35, 1.0, h));',
      '  float shimmer = 0.75 + 0.25 * sin(h * 60.0 - uTime * 2.0);',
      '  vec3 col = mix(vec3(1.0, 0.86, 0.6), vec3(1.0, 0.97, 0.9), h) * (0.35 + 0.65 * core) * shimmer;',
      '  gl_FragColor = vec4(col * fade * uA * (0.55 + 0.6 * uNight), 1.0);',
      '}'
    ].join('\n')
  });
  var beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 420, 24, 1, true).translate(0, 210, 0), beaconMat);
  beacon.frustumCulled = false; beacon.renderOrder = 8; beacon.visible = false; scene.add(beacon);
  var ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48).rotateX(-Math.PI / 2), ringMat);
  ring.renderOrder = 8; ring.visible = false; scene.add(ring);

  /* ---------- page furniture ---------- */
  function save() { try { localStorage.setItem('lastlight.v1', JSON.stringify({ ch: Q.ch, leg: Q.leg })); } catch (e) { } }
  function loadSave() { try { var s = JSON.parse(localStorage.getItem('lastlight.v1') || 'null'); return s && s.ch >= 0 ? s : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem('lastlight.v1'); } catch (e) { } }
  var ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  function setLeg() {
    var C = STORY.chapters[Q.ch], L = C.legs[Q.leg];
    Q.target = resolveTarget(L); Q.mode = 'drive'; Q.hint = 0;
    $('qChap').textContent = ROMAN[Q.ch] + ' · ' + C.title;
    $('qGoal').textContent = L.goal;
    $('qWhere').textContent = L.where;
    $('quest').hidden = false;
    save();
  }
  /* ---------- scenes: the car stops, the bars come in, the words come up ---------- */
  var typing = null;
  function showScene(opts) {
    var ov = $('scene'), tx = $('sceneTxt');
    ov.hidden = false; ov.classList.remove('white');
    requestAnimationFrame(function () { ov.classList.add('on'); });
    ov.classList.toggle('big', !!opts.big);
    $('sceneHead').textContent = opts.head || '';
    $('sceneSub').textContent = opts.sub || '';
    tx.textContent = '';
    var btn = $('sceneBtn'), alt = $('sceneAlt'), alt2 = $('sceneAlt2');
    btn.hidden = true; alt.hidden = true; alt2.hidden = true;
    var paras = opts.paras || [], full = paras.join('\n\n'), n = 0;
    if (typing) clearInterval(typing);
    var t0 = performance.now();
    typing = setInterval(function () {
      n = Math.max(n + 1, Math.floor((performance.now() - t0) / 1000 * 68)); tx.textContent = full.slice(0, n);
      if (n >= full.length) { clearInterval(typing); typing = null; showButtons(); }
    }, 28);
    function showButtons() {
      btn.textContent = opts.btn || 'Continue'; btn.hidden = false; btn.onclick = function () { closeScene(); opts.then && opts.then(); };
      if (opts.alt) { alt.textContent = opts.alt; alt.hidden = false; alt.onclick = function () { closeScene(); opts.thenAlt && opts.thenAlt(); }; }
      if (opts.alt2) { alt2.textContent = opts.alt2; alt2.hidden = false; alt2.onclick = function () { closeScene(); opts.thenAlt2 && opts.thenAlt2(); }; }
      setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) { } }, 30);
    }
    /* a click or a key during typing shows the whole passage at once */
    ov.onclick = function (ev) { if (typing && ev.target.tagName !== 'BUTTON') { clearInterval(typing); typing = null; tx.textContent = full; showButtons(); } };
    LOCK.on = true;
  }
  function closeScene() {
    var ov = $('scene'); ov.classList.remove('on');
    setTimeout(function () { if (!ov.classList.contains('on')) ov.hidden = true; }, 700);
    LOCK.on = false; canvas.focus();
  }
  function arrive() {
    var C = STORY.chapters[Q.ch], L = C.legs[Q.leg];
    Q.mode = 'scene'; beacon.visible = false; ring.visible = false;
    if (L.last) { startEnding(); return; }
    if (L.fuel) { car.fuel = TANK; car.engineOn = true; }
    showScene({ head: L.goal, sub: L.where, paras: [L.text], then: function () {
      if (Q.leg + 1 < C.legs.length) { Q.leg++; setLeg(); }
      else nextChapter();
    } });
  }
  function nextChapter() {
    Q.ch++; Q.leg = 0;
    var C = STORY.chapters[Q.ch];
    Q.decayGoal = C.decay;
    Q.radioT = 6; Q.radioI = 0;
    showScene({ head: ROMAN[Q.ch], sub: C.title, paras: [], btn: 'Drive', big: true, then: function () { setLeg(); } });
  }
  function beginStory(fromSave) {
    var s = fromSave ? loadSave() : null;
    Q.ch = s ? Math.min(4, s.ch) : 0; Q.leg = s ? s.leg : 0;
    Q.decayGoal = STORY.chapters[Q.ch].decay; Q.decay = Q.decayGoal * 0.6;
    Q.radioT = 12; Q.radioI = 0;
    if (!s) showScene({ head: ROMAN[0], sub: STORY.chapters[0].title, paras: [], btn: 'Drive', big: true, then: setLeg });
    else setLeg();
  }
  function freeDrive() {
    Q.mode = 'off'; Q.decayGoal = 0; $('quest').hidden = true; beacon.visible = false; ring.visible = false;
  }
  function titleCard() {
    var s = loadSave();
    showScene({ head: STORY.title, sub: STORY.sub, paras: STORY.prologue, big: true,
      btn: s ? 'Continue the story' : 'Begin', then: function () { beginStory(!!s); },
      alt: s ? 'Start again' : 'Just drive', thenAlt: s ? function () { clearSave(); beginStory(false); } : freeDrive,
      alt2: s ? 'Just drive' : null, thenAlt2: freeDrive });
  }

  /* ---------- the ending ---------- */
  function startEnding() {
    Q.mode = 'ending';
    /* turn the camera to look past the car, down over the city */
    var toCity = Math.atan2(-(0 - car.z), 0 - car.x);
    Q.end = { t: 0, line: -1, credits: false, yaw: Math.atan2(Math.sin(toCity - camYaw), Math.cos(toCity - camYaw)) };
    orbit.yaw = Q.end.yaw; orbit.pitch = 0.05; camDist = 9;
    LOCK.on = true; Q.decayGoal = 1;
    $('quest').hidden = true;
    var ov = $('scene'); ov.hidden = false; ov.classList.remove('big'); ov.classList.add('on', 'ending');
    document.body.classList.add('cine');
    $('sceneHead').textContent = ''; $('sceneSub').textContent = ''; $('sceneTxt').textContent = '';
    ['sceneBtn', 'sceneAlt', 'sceneAlt2'].forEach(function (b) { $(b).hidden = true; });
    clearSave();
  }
  function stepEnding(dt) {
    var E = Q.end; E.t += dt;
    if (Math.abs(car.vx) < 0.3 && car.engineOn && E.t > 1.5) car.engineOn = false;
    /* the camera drifts up and away while the light comes in */
    orbit.idle = -1e9; orbit.drag = false;
    orbit.yaw = Q.end.yaw + Math.sin(E.t * 0.02) * 0.35; orbit.pitch = Math.min(0.5, 0.05 + E.t * 0.006); camDist = Math.min(30, 9 + E.t * 0.4);
    var LINE_T = 6.5, n = STORY.ending.length;
    var li = Math.floor((E.t - 3) / LINE_T);
    while (E.line < Math.min(li, n - 1)) {
      E.line++;
      var p = document.createElement('p'); p.textContent = STORY.ending[E.line]; p.className = 'endline';
      $('sceneTxt').appendChild(p);
      (function (el) { requestAnimationFrame(function () { el.classList.add('in'); }); })(p);
    }
    var tEnd = 3 + n * LINE_T;
    var beat = clamp((E.t - 10) / (tEnd - 10), 0, 1);
    Sound.heart(E.t < 6 ? 0 : beat < 1 ? 64 - beat * 36 : 0, 0.55 * (1 - beat * 0.5));
    Driver.state.slump = clamp((E.t - (tEnd - 14)) / 12, 0, 1);
    Driver.state.alive = 1 - Driver.state.slump;
    Sound.drone(clamp((E.t - 8) / 20, 0, 1) * 0.7);
    finalPass.uniforms.uWhite.value = clamp((E.t - (tEnd - 6)) / 10, 0, 1);
    if (E.t > tEnd + 6 && !E.credits) { E.credits = true; rollCredits(); }
  }
  function rollCredits() {
    Q.mode = 'credits';
    var ov = $('scene'); ov.classList.remove('on', 'ending'); ov.hidden = true;
    var cr = $('credits'), body = $('credBody');
    body.innerHTML = '';
    function add(tag, text, cls) { var e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; body.appendChild(e); return e; }
    add('h2', STORY.title); add('p', STORY.sub, 'csub');
    add('div', '', 'gap');
    STORY.cosmos.forEach(function (t) { add('p', t, 'cosmos'); });
    add('div', '', 'gap');
    STORY.credits.forEach(function (c) { var d = document.createElement('div'); d.className = 'crow'; if (c[0]) { var a = document.createElement('span'); a.className = 'clab'; a.textContent = c[0]; d.appendChild(a); } var b = document.createElement('span'); b.textContent = c[1]; if (!c[0]) b.className = 'cnote'; d.appendChild(b); body.appendChild(d); });
    add('div', '', 'gap');
    add('p', 'The end.', 'cend');
    cr.hidden = false; cr.scrollTop = 0;
    requestAnimationFrame(function () { cr.classList.add('on'); });
    Sound.drone(1);
    Q.credT = 0;
  }
  function stepCredits(dt) {
    var cr = $('credits');
    Q.credT += dt;
    if (Q.credT > 4 && !Q.credHold) cr.scrollTop += dt * 26;
    if (cr.scrollTop + cr.clientHeight >= cr.scrollHeight - 2) $('credBtns').classList.add('on');
  }
  function leaveCredits(story) {
    var cr = $('credits'); cr.classList.remove('on'); setTimeout(function () { cr.hidden = true; $('credBtns').classList.remove('on'); }, 900);
    Sound.drone(0); Sound.heart(0);
    finalPass.uniforms.uWhite.value = 0; Driver.reset(); LOCK.on = false; document.body.classList.remove('cine');
    Q.decay = 0; Q.decayGoal = 0; car.engineOn = true; camDist = 7; orbit.pitch = 0; orbit.yaw = 0; orbit.idle = 0;
    placeOnRoad(0, 0); needWarm = true;
    if (story) { clearSave(); beginStory(false); } else freeDrive();
  }

  /* ---------- every frame ---------- */
  var qDir = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
  function stepQuest(dt) {
    /* the world goes on fading towards where the story is */
    Q.decay += (Q.decayGoal - Q.decay) * Math.min(1, dt * (Q.mode === 'ending' ? 0.08 : 0.05));
    DECAY = Q.decay;
    lifeMul = Q.mode === 'ending' || Q.mode === 'credits' ? Math.max(0, lifeMul - dt * 0.05) : 1 - Q.decay * 0.95;
    finalPass.uniforms.uDesat.value = Q.decay * 0.78;
    finalPass.uniforms.uTintA.value += ((camMode === 1 ? 0.55 : 0) - finalPass.uniforms.uTintA.value) * Math.min(1, dt * 4);
    Radio.decay(Q.decay);
    Driver.update(dt, camMode);
    if (Q.mode === 'ending') { stepEnding(dt); return; }
    if (Q.mode === 'credits') { stepCredits(dt); return; }
    /* bulletins from a radio somewhere */
    if (Q.mode === 'drive' || Q.mode === 'scene') {
      Q.radioT -= dt;
      if (Q.radioT < 0 && Q.mode === 'drive') {
        var list = STORY.radio[Math.min(4, Q.ch)], cap = $('caption');
        $('capTxt').textContent = list[Q.radioI % list.length]; Q.radioI++;
        cap.hidden = false; requestAnimationFrame(function () { cap.classList.add('on'); });
        setTimeout(function () { cap.classList.remove('on'); setTimeout(function () { cap.hidden = true; }, 800); }, 9000);
        Q.radioT = 55 + Math.random() * 40;
      }
    }
    if (Q.mode !== 'drive' || !Q.target) return;
    var T = Q.target, d = Math.hypot(T.x - car.x, T.z - car.z);
    beacon.visible = d > 12; beacon.position.set(T.x, T.y, T.z);
    beaconMat.uniforms.uA.value = clamp((d - 12) / 40, 0, 1) * clamp(1 - (d - 2500) / 1500, 0.15, 1);
    ring.visible = d < 160; ring.position.set(T.x, T.y + 0.08, T.z);
    var rr = T.r * (0.92 + 0.08 * Math.sin(simTime * 2.5)); ring.scale.set(rr, 1, rr); ringMat.opacity = 0.35 * clamp(1 - d / 160, 0, 1) + 0.1;
    var a = Math.atan2(-(T.z - car.z), T.x - car.x), rel = Math.atan2(Math.sin(a - car.h), Math.cos(a - car.h));
    $('qArrow').style.transform = 'rotate(' + (-rel).toFixed(3) + 'rad)';
    $('qDist').textContent = (d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m') + ' ' + qDir[(Math.round(a / (Math.PI / 4)) + 8) % 8];
    var slow = Math.abs(car.vx) < 2.8;
    $('qHint').textContent = d < T.r ? (slow ? '' : 'Slow down and stop here.') : d < 120 ? 'Nearly there.' : '';
    if (d < T.r && slow) arrive();
  }
  function questMap(mg, s, ox, oz) {
    if (Q.mode !== 'drive' || !Q.target) return;
    var px = Q.target.x * s + ox, pz = Q.target.z * s + oz, c = MMS / 2, R = c - 8;
    var dx = px - c, dz = pz - c, dd = Math.hypot(dx, dz);
    if (dd > R) { px = c + dx / dd * R; pz = c + dz / dd * R; }
    var pulse = 4 + Math.sin(simTime * 4) * 1.2;
    mg.beginPath(); mg.arc(px, pz, pulse + 3, 0, Math.PI * 2); mg.fillStyle = 'rgba(255, 241, 208, 0.35)'; mg.fill();
    mg.beginPath(); mg.arc(px, pz, 4, 0, Math.PI * 2); mg.fillStyle = '#fff1d0'; mg.fill(); mg.strokeStyle = '#1d1a16'; mg.lineWidth = 1.5; mg.stroke();
  }
  $('credBtnStory').addEventListener('click', function () { leaveCredits(true); });
  $('credBtnDrive').addEventListener('click', function () { leaveCredits(false); });
  $('credSkip').addEventListener('click', function () { var cr = $('credits'); cr.scrollTop = cr.scrollHeight; });
  $('credits').addEventListener('wheel', function () { Q.credHold = false; });
  $('storyBtn').addEventListener('click', function () { if (Q.mode === 'scene' || Q.mode === 'ending' || Q.mode === 'credits') return; titleCard(); });
  window.addEventListener('keydown', function (ev) {
    if (ev.code !== 'Enter' && ev.code !== 'Space') return;
    var ov = $('scene');
    if (ov.hidden || Q.mode === 'ending') return;
    if (typing) { ov.onclick({ target: ov }); ev.preventDefault(); return; }
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    var b = $('sceneBtn'); if (!b.hidden) { b.click(); ev.preventDefault(); }
  });
