  /* ==========================================================
     CAR SOUND
     A synthesised 2.0-litre four: oscillators at the firing frequency (two pulses per revolution)
     through a throttle-opened filter and a little distortion, plus intake roar, tyre squeal,
     wind, rain and the thump of a collision. Starts on the first key or tap.
     ========================================================== */
  var Sound = (function () {
    var ctx = null, on = true, started = false, N = {}, lastImpact = 0, heartBpm = 0, nextBeat = 0, heartVol = 0.5, droneG = null;
    function noiseBuf(c, secs) {
      var b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate), d = b.getChannelData(0), last = 0;
      for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; }
      return b;
    }
    function loopNoise(buf) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; }
    function start() {
      if (started || !on) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { return; }
      started = true;
      var nb = noiseBuf(ctx, 3);
      N.master = ctx.createGain(); N.master.gain.value = 0.9; N.master.connect(ctx.destination);
      /* engine */
      N.eng = ctx.createGain(); N.eng.gain.value = 0;
      N.lp = ctx.createBiquadFilter(); N.lp.type = 'lowpass'; N.lp.Q.value = 2.5;
      var shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4); }
      shaper.curve = curve;
      N.o1 = ctx.createOscillator(); N.o1.type = 'sawtooth';
      N.o2 = ctx.createOscillator(); N.o2.type = 'sawtooth';
      N.o3 = ctx.createOscillator(); N.o3.type = 'square';
      var g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
      g1.gain.value = 0.5; g2.gain.value = 0.35; g3.gain.value = 0.12;
      N.o1.connect(g1); N.o2.connect(g2); N.o3.connect(g3);
      [g1, g2, g3].forEach(function (g) { g.connect(shaper); });
      /* a slow wobble so it never sounds like a pure tone */
      N.wob = ctx.createOscillator(); N.wob.frequency.value = 7.3; var wg = ctx.createGain(); wg.gain.value = 3; N.wob.connect(wg); wg.connect(N.o2.frequency);
      shaper.connect(N.lp); N.lp.connect(N.eng); N.eng.connect(N.master);
      /* intake and exhaust breath */
      N.intake = loopNoise(nb); N.ibp = ctx.createBiquadFilter(); N.ibp.type = 'bandpass'; N.ibp.Q.value = 1.2; N.ig = ctx.createGain(); N.ig.gain.value = 0;
      N.intake.connect(N.ibp); N.ibp.connect(N.ig); N.ig.connect(N.master);
      /* tyres */
      N.tyre = loopNoise(nb); N.tbp = ctx.createBiquadFilter(); N.tbp.type = 'bandpass'; N.tbp.frequency.value = 1150; N.tbp.Q.value = 9; N.tg = ctx.createGain(); N.tg.gain.value = 0;
      N.tyre.connect(N.tbp); N.tbp.connect(N.tg); N.tg.connect(N.master);
      N.sq = ctx.createOscillator(); N.sq.frequency.value = 980; var sqg = ctx.createGain(); sqg.gain.value = 0.25; N.sq.connect(sqg); sqg.connect(N.tg);
      /* road and wind */
      N.road = loopNoise(nb); N.rlp = ctx.createBiquadFilter(); N.rlp.type = 'lowpass'; N.rlp.frequency.value = 260; N.rg = ctx.createGain(); N.rg.gain.value = 0;
      N.road.connect(N.rlp); N.rlp.connect(N.rg); N.rg.connect(N.master);
      N.wind = loopNoise(nb); N.whp = ctx.createBiquadFilter(); N.whp.type = 'bandpass'; N.whp.frequency.value = 700; N.whp.Q.value = 0.5; N.wg = ctx.createGain(); N.wg.gain.value = 0;
      N.wind.connect(N.whp); N.whp.connect(N.wg); N.wg.connect(N.master);
      N.rain = loopNoise(nb); N.rhp = ctx.createBiquadFilter(); N.rhp.type = 'highpass'; N.rhp.frequency.value = 2500; N.rag = ctx.createGain(); N.rag.gain.value = 0;
      N.rain.connect(N.rhp); N.rhp.connect(N.rag); N.rag.connect(N.master);
      N.nb = nb;
      [N.o1, N.o2, N.o3, N.wob, N.sq].forEach(function (o) { o.start(); });
    }
    function thump(strength) {
      var s = ctx.createBufferSource(); s.buffer = N.nb;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180 + strength * 40;
      var g = ctx.createGain(), t = ctx.currentTime, a = Math.min(1.2, 0.15 + strength * 0.12);
      g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      s.connect(f); f.connect(g); g.connect(N.master); s.start(t, Math.random()); s.stop(t + 0.5);
      /* and a metallic clank on top */
      var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'square'; o.frequency.setValueAtTime(220 + Math.random() * 120, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
      og.gain.setValueAtTime(a * 0.12, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(og); og.connect(N.master); o.start(t); o.stop(t + 0.25);
    }
    /* a heartbeat, felt more than heard: two low thumps */
    function beat(t, v) {
      [[0, 1], [0.16, 0.7]].forEach(function (b) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(62, t + b[0]); o.frequency.exponentialRampToValueAtTime(38, t + b[0] + 0.14);
        g.gain.setValueAtTime(0.0001, t + b[0]); g.gain.exponentialRampToValueAtTime(v * b[1], t + b[0] + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + b[0] + 0.2);
        o.connect(g); g.connect(N.master); o.start(t + b[0]); o.stop(t + b[0] + 0.25);
      });
    }
    /* a slow pad for the ending and the credits: open fifths drifting between two chords */
    function drone(level) {
      if (!ctx) return;
      if (!droneG) {
        droneG = ctx.createGain(); droneG.gain.value = 0;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
        var dl = ctx.createDelay(1.5), fb = ctx.createGain(); dl.delayTime.value = 0.9; fb.gain.value = 0.45;
        lp.connect(droneG); droneG.connect(N.master); droneG.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(N.master);
        [[38, 0.5], [45, 0.35], [50, 0.28], [57, 0.2], [62, 0.12], [69, 0.06]].forEach(function (n, i) {
          [-6, 5].forEach(function (cents) {
            var o = ctx.createOscillator(), g = ctx.createGain(); o.type = i < 2 ? 'sine' : 'triangle';
            o.frequency.value = 440 * Math.pow(2, (n[0] - 69) / 12); o.detune.value = cents;
            var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05 + i * 0.017; lg.gain.value = n[1] * 0.4;
            g.gain.value = n[1] * 0.5; lfo.connect(lg); lg.connect(g.gain);
            o.connect(g); g.connect(lp); o.start(); lfo.start();
          });
        });
      }
      droneG.gain.setTargetAtTime(on ? level * 0.12 : 0, ctx.currentTime, 2.5);
    }
    function set(param, v, tc) { param.setTargetAtTime(v, ctx.currentTime, tc || 0.04); }
    function update(dt) {
      if (!started || !ctx) return;
      if (ctx.state === 'suspended') return;
      var rpm = Math.max(0, car.rpm), f = rpm / 60 * 2, thr = car.thr, run = car.engineOn && rpm > 300 ? 1 : 0;
      set(N.o1.frequency, Math.max(20, f)); set(N.o2.frequency, Math.max(10, f * 0.5)); set(N.o3.frequency, Math.max(40, f * 2));
      set(N.lp.frequency, 180 + f * 2.2 + thr * 1400);
      set(N.eng.gain, on ? run * (0.05 + thr * 0.09 + rpm / 6000 * 0.05) : 0);
      set(N.ibp.frequency, 300 + rpm * 0.25); set(N.ig.gain, on ? run * thr * (0.04 + rpm / 6000 * 0.08) : 0);
      var v = Math.abs(car.vx);
      set(N.tg.gain, on ? clamp((car.slip - 0.04) * 0.9, 0, 0.32) * clamp(v / 4, 0, 1) : 0, 0.03);
      set(N.tbp.frequency, 1000 + Math.min(v, 25) * 12);
      set(N.rg.gain, on ? Math.min(0.22, v * 0.0075) * (car.surf === 2 ? 2.2 : 1) : 0, 0.1);
      set(N.rlp.frequency, car.surf === 2 ? 600 : 260);
      set(N.wg.gain, on ? Math.min(0.2, v * v * 0.00022) + W.wind * 0.03 : 0, 0.2);
      set(N.rag.gain, on ? W.rain * 0.07 : 0, 0.5);
      if (car.impact > lastImpact + 1.2 && on) thump(car.impact);
      if (heartBpm > 0 && on) {
        if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05;
        if (nextBeat < ctx.currentTime + 0.2) { beat(nextBeat, heartVol); nextBeat += 60 / heartBpm * (1 + (Math.random() - 0.5) * 0.06 * (80 / heartBpm)); }
      }
      lastImpact = car.impact;
    }
    function toggle() { on = !on; if (on && !started) start(); if (ctx && on && ctx.state === 'suspended') ctx.resume(); if (N.master) set(N.master.gain, on ? 0.9 : 0, 0.05); return on; }
    function wake() { if (!started) start(); else if (ctx && ctx.state === 'suspended') ctx.resume(); }
    return { start: start, update: update, toggle: toggle, wake: wake, isOn: function () { return on; },
             heart: function (bpm, v) { heartBpm = bpm; if (v !== undefined) heartVol = v; }, drone: drone,
             engineMute: function (m) { if (N.master) set(N.master.gain, on ? (m ? 0.35 : 0.9) : 0, 1.5); } };
  })();
