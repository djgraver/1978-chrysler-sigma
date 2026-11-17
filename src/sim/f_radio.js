
  /* ==========================================================
     THE RADIO: original music composed on the fly in 70s styles, nothing pre-recorded.
     Each station has a genre; songs are generated from chord progressions, drum and bass patterns
     and a short melodic motif that is repeated and varied, then played on simple synthesised instruments.
     ========================================================== */
  var Radio = (function () {
    var STATIONS = [
      { f: 89.7, name: 'Battery Point Lounge', g: 'lounge' },
      { f: 92.1, name: 'Derwent Disco', g: 'disco' },
      { f: 96.9, name: 'Mountain Soft Rock', g: 'soft' },
      { f: 101.3, name: 'Sandy Bay Funk', g: 'funk' },
      { f: 105.7, name: 'Glam 105', g: 'glam' }
    ];
    var ctx = null, master, music, radioIn, staticG, noiseBuf, on = false, freq = 96.9, vol = 0.55, song = null, current = null, timer = null, seed = (Math.random() * 1e6) | 0;
    function rng(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function init() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
      /* the car radio: mono, band-limited, a little saturation */
      radioIn = ctx.createGain(); radioIn.gain.value = 0;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6200;
      var mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1400; mid.gain.value = 3; mid.Q.value = 0.7;
      var sh = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
      sh.curve = curve;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3.5;
      music = ctx.createGain(); music.gain.value = 0.32;
      music.connect(hp); hp.connect(lp); lp.connect(mid); mid.connect(sh); sh.connect(comp); comp.connect(radioIn); radioIn.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      var ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      var nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 2600; nb.Q.value = 0.5;
      staticG = ctx.createGain(); staticG.gain.value = 0;
      ns.connect(nb); nb.connect(staticG); staticG.connect(master); ns.start();
      return true;
    }
    /* ---------- instruments ---------- */
    function env(g, t, a, peak, d, sus, r, end) {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
      g.gain.setTargetAtTime(peak * sus, t + a, d); g.gain.setTargetAtTime(0.0001, end, r);
    }
    function noise(t, dur) { var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 1.5, dur + 0.05); return s; }
    function kick(t, v) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g); g.connect(music); o.start(t); o.stop(t + 0.4);
    }
    function snare(t, v, brush) {
      var n = noise(t, 0.25), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = brush ? 3500 : 1900; f.Q.value = 0.7;
      g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (brush ? 0.28 : 0.2));
      n.connect(f); f.connect(g); g.connect(music);
      if (!brush) {
        var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.value = 190;
        og.gain.setValueAtTime(0.3 * v, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og); og.connect(music); o.start(t); o.stop(t + 0.12);
      }
    }
    function hat(t, v, open) {
      var n = noise(t, open ? 0.3 : 0.06), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7200;
      g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.26 : 0.045));
      n.connect(f); f.connect(g); g.connect(music);
    }
    function clap(t, v) {
      for (var k = 0; k < 3; k++) {
        var tt = t + k * 0.011, n = noise(tt, 0.15), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2;
        g.gain.setValueAtTime(0.35 * v, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (k === 2 ? 0.14 : 0.02));
        n.connect(f); f.connect(g); g.connect(music);
      }
    }
    function bass(t, m, dur, kind, v) {
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = kind === 'round' ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m);
      f.type = 'lowpass'; f.Q.value = kind === 'slap' ? 6 : 1;
      var c0 = kind === 'slap' ? 2400 : kind === 'round' ? 700 : 1100;
      f.frequency.setValueAtTime(c0, t); f.frequency.exponentialRampToValueAtTime(kind === 'round' ? 400 : 320, t + 0.18);
      env(g, t, 0.006, 0.42 * v, 0.15, 0.6, 0.05, t + dur);
      o.connect(f); f.connect(g); g.connect(music); o.start(t); o.stop(t + dur + 0.3);
      if (kind === 'round') { var s = ctx.createOscillator(), sg = ctx.createGain(); s.frequency.value = mtof(m); env(sg, t, 0.01, 0.3 * v, 0.3, 0.7, 0.06, t + dur); s.connect(sg); sg.connect(music); s.start(t); s.stop(t + dur + 0.3); }
    }
    function epiano(t, notes, dur, v) {
      notes.forEach(function (m) {
        var o = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain(), fr = mtof(m);
        o.frequency.value = fr; mo.frequency.value = fr * 1.0; mg.gain.setValueAtTime(fr * 2.2, t); mg.gain.exponentialRampToValueAtTime(fr * 0.15, t + 0.6);
        mo.connect(mg); mg.connect(o.frequency);
        env(g, t, 0.004, 0.11 * v, 0.5, 0.35, 0.12, t + dur);
        o.connect(g); g.connect(music); o.start(t); mo.start(t); o.stop(t + dur + 0.6); mo.stop(t + dur + 0.6);
      });
    }
    function strings(t, notes, dur, v) {
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.frequency.value = 2600;
      env(g, t, 0.35, 0.07 * v, 0.5, 0.9, 0.35, t + dur);
      f.connect(g); g.connect(music);
      notes.forEach(function (m) {
        [-7, 7].forEach(function (cents) {
          var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.detune.value = cents;
          o.connect(f); o.start(t); o.stop(t + dur + 1.2);
        });
      });
    }
    function organ(t, notes, dur, v) {
      var g = ctx.createGain(); env(g, t, 0.01, 0.06 * v, 0.2, 1, 0.08, t + dur); g.connect(music);
      notes.forEach(function (m) {
        [[1, 1], [2, 0.6], [3, 0.35], [4, 0.25]].forEach(function (h) {
          var o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = mtof(m) * h[0]; og.gain.value = h[1];
          o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.4);
        });
      });
    }
    function clav(t, m, v) {
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = mtof(m);
      f.type = 'bandpass'; f.Q.value = 4; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.12);
      g.gain.setValueAtTime(0.13 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(f); f.connect(g); g.connect(music); o.start(t); o.stop(t + 0.2);
    }
    function brass(t, notes, dur, v) {
      var f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(3200, t + 0.06); f.frequency.setTargetAtTime(1400, t + 0.08, 0.1);
      env(g, t, 0.02, 0.09 * v, 0.1, 0.7, 0.06, t + dur);
      f.connect(g); g.connect(music);
      notes.forEach(function (m) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + 12); o.connect(f); o.start(t); o.stop(t + dur + 0.4); });
    }
    var distCurve = null;
    function guitar(t, m, dur, v, muted) {
      if (!distCurve) { distCurve = new Float32Array(1024); for (var i = 0; i < 1024; i++) { var x = i / 512 - 1; distCurve[i] = Math.tanh(x * 6); } }
      var sh = ctx.createWaveShaper(), f = ctx.createBiquadFilter(), g = ctx.createGain(), pre = ctx.createGain();
      sh.curve = distCurve; pre.gain.value = 0.6; f.type = 'lowpass'; f.frequency.value = muted ? 1100 : 2800;
      env(g, t, 0.005, 0.07 * v, muted ? 0.05 : 0.6, muted ? 0.2 : 0.7, 0.05, t + dur);
      pre.connect(sh); sh.connect(f); f.connect(g); g.connect(music);
      [0, 7, 12].forEach(function (iv) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + iv); o.detune.value = (Math.random() - 0.5) * 10; o.connect(pre); o.start(t); o.stop(t + dur + 0.3); });
    }
    function lead(t, m, dur, kind, v) {
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = kind === 'flute' ? 'triangle' : kind === 'square' ? 'square' : 'sawtooth'; o.frequency.value = mtof(m);
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(mtof(m) * 0.012, t + Math.min(dur, 0.4));
      lfo.connect(lg); lg.connect(o.frequency);
      f.type = 'lowpass'; f.frequency.value = kind === 'flute' ? 3000 : 2200; f.Q.value = 1.5;
      env(g, t, kind === 'flute' ? 0.04 : 0.015, (kind === 'flute' ? 0.16 : 0.09) * v, 0.3, 0.8, 0.07, t + dur);
      o.connect(f); f.connect(g); g.connect(music); o.start(t); lfo.start(t); o.stop(t + dur + 0.4); lfo.stop(t + dur + 0.4);
      if (kind === 'flute') { var n = noise(t, dur), nf = ctx.createBiquadFilter(), ng = ctx.createGain(); nf.type = 'bandpass'; nf.frequency.value = mtof(m) * 2; nf.Q.value = 3; env(ng, t, 0.03, 0.03 * v, 0.2, 0.5, 0.05, t + dur); n.connect(nf); nf.connect(ng); ng.connect(music); }
    }
    /* ---------- composition ---------- */
    var SCALES = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
    var GENRES = {
      disco: { bpm: [116, 124], scales: ['dorian', 'major', 'minor'], prog: { verse: [[0, 3], [0, 5, 1, 4]], chorus: [[5, 6, 0, 0], [3, 4, 2, 5]], bridge: [[3, 4, 3, 4]] }, swing: 0 },
      funk: { bpm: [96, 106], scales: ['dorian', 'mixo'], prog: { verse: [[0, 0, 0, 3], [0, 0]], chorus: [[3, 3, 0, 0], [3, 4, 0, 0]], bridge: [[5, 4, 3, 4]] }, swing: 0.08 },
      soft: { bpm: [74, 88], scales: ['major'], prog: { verse: [[0, 4, 5, 3], [0, 2, 3, 4], [5, 3, 0, 4]], chorus: [[3, 4, 0, 5], [3, 0, 4, 4]], bridge: [[5, 3, 4, 4]] }, swing: 0 },
      lounge: { bpm: [92, 108], scales: ['major', 'dorian'], prog: { verse: [[1, 4, 0, 5], [0, 5, 1, 4]], chorus: [[3, 6, 2, 5], [1, 4, 0, 0]], bridge: [[3, 3, 2, 5]] }, swing: 0.17 },
      glam: { bpm: [124, 140], scales: ['mixo', 'major'], prog: { verse: [[0, 6, 3, 0], [0, 0, 3, 4]], chorus: [[3, 0, 4, 0], [0, 6, 3, 4]], bridge: [[5, 3, 6, 4]] }, swing: 0 }
    };
    function Song(genre, sd) {
      var R = rng(sd), G = GENRES[genre];
      function pick(a) { return a[(R() * a.length) | 0]; }
      this.g = genre; this.bpm = G.bpm[0] + R() * (G.bpm[1] - G.bpm[0]); this.swing = G.swing;
      this.scale = SCALES[pick(G.scales)]; this.root = 40 + ((R() * 9) | 0);
      var sec = { intro: pick(G.prog.verse), verse: pick(G.prog.verse), chorus: pick(G.prog.chorus), bridge: pick(G.prog.bridge) };
      var form = [['intro', 4], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['bridge', 4], ['chorus', 8], ['outro', 4]];
      this.bars = [];
      var self = this;
      form.forEach(function (f) { var p = sec[f[0] === 'outro' ? 'chorus' : f[0]]; for (var b = 0; b < f[1]; b++) self.bars.push({ sec: f[0], deg: p[b % p.length], bi: b, last: b === f[1] - 1 }); });
      /* a two-bar melodic motif per section, reused and varied */
      this.motif = {};
      ['verse', 'chorus', 'bridge'].forEach(function (s) {
        var on = [], dens = genre === 'soft' ? 0.28 : genre === 'lounge' ? 0.32 : 0.4, steps = [];
        for (var k = 0; k < 32; k++) if ((k % 4 === 0 && R() < 0.7) || R() < dens * (k % 2 ? 0.55 : 1)) steps.push(k);
        var walk = 7 + ((R() * 5) | 0);
        steps.forEach(function () { walk += pick([-2, -1, -1, 0, 1, 1, 2, 3, -3]); walk = clamp(walk, 4, 14); on.push(walk); });
        self.motif[s] = { steps: steps, deg: on };
      });
      this.step = 0; this.total = this.bars.length * 16; this.R = R; this.arpI = 0;
    }
    Song.prototype.chord = function (deg, n) {
      var sc = this.scale, out = [];
      for (var k = 0; k < (n || 4); k++) { var d = deg + k * 2; out.push(this.root + sc[d % 7] + 12 * Math.floor(d / 7)); }
      return out;
    };
    Song.prototype.scaleNote = function (d) { var sc = this.scale, o = Math.floor(d / 7), r = ((d % 7) + 7) % 7; return this.root + 12 + sc[r] + 12 * o; };
    Song.prototype.play = function (t, s16) {
      var bar = this.bars[Math.floor(this.step / 16)], s = this.step % 16, g = this.g, R = this.R, sec = bar.sec;
      var ch = this.chord(bar.deg), lo = ch[0] - 12, full = sec === 'chorus' || sec === 'outro', dur = s16;
      var beat = s % 4 === 0;
      /* drums */
      if (g === 'disco') {
        if (beat) kick(t, 1); if (s % 4 === 2) hat(t, 0.9, true); else if (s % 2) hat(t, 0.5);
        if (s === 4 || s === 12) { clap(t, 0.9); if (full) snare(t, 0.6); }
      } else if (g === 'funk') {
        if ([0, 3, 7, 10].indexOf(s) >= 0) kick(t, s === 0 ? 1 : 0.8); hat(t, s % 2 ? 0.35 : 0.6, s === 14);
        if (s === 4 || s === 12) snare(t, 1); else if (s === 9 || s === 15) snare(t, 0.25);
      } else if (g === 'soft') {
        if (s === 0 || s === 8 || (s === 10 && R() < 0.4)) kick(t, 0.9); if (s % 2 === 0) hat(t, 0.4);
        if (s === 4 || s === 12) snare(t, 0.8);
      } else if (g === 'lounge') {
        if (s === 0 || s === 6 || s === 8 || s === 14) hat(t, 0.5, s % 8 === 0); if (s === 0) kick(t, 0.5);
        if (s === 4 || s === 12) snare(t, 0.45, true);
      } else if (g === 'glam') {
        if (s === 0 || s === 8 || s === 10) kick(t, 1); if (s % 2 === 0) hat(t, 0.5);
        if (s === 4 || s === 12) { snare(t, 1); if (full) clap(t, 0.8); }
      }
      if (sec === 'intro' && bar.bi < 2 && g !== 'disco') return this.adv();
      /* bass */
      if (g === 'disco' && s % 2 === 0) bass(t, s % 4 === 0 ? lo : lo + 12, dur * 1.6, 'saw', 0.9);
      else if (g === 'funk' && [0, 3, 6, 8, 10, 13].indexOf(s) >= 0) bass(t, [lo, lo + 12, lo + 7, lo, lo + 10, lo + 12][[0, 3, 6, 8, 10, 13].indexOf(s)], dur * 1.4, 'slap', 1);
      else if (g === 'soft' && (s === 0 || s === 8 || s === 14)) bass(t, s === 14 ? lo + this.scale[4] - (R() < 0.5 ? 0 : 2) : lo, dur * (s === 14 ? 2 : 6), 'round', 1);
      else if (g === 'lounge' && beat) bass(t, [lo, lo + (this.scale[2] || 4), lo + 7, lo + 11 - (R() < 0.5 ? 1 : 0)][s / 4], dur * 3.5, 'round', 0.9);
      else if (g === 'glam' && s % 2 === 0) bass(t, lo, dur * 1.8, 'saw', 0.8);
      /* chords */
      if (g === 'disco') { if (full && s === 0) strings(t, ch.slice(0, 3), dur * 15, 1); if (s === 2 || s === 6 || s === 10 || s === 14) epiano(t, ch.slice(1, 4).map(function (n) { return n + 12; }), dur * 1.2, 0.8); }
      if (g === 'funk') { if ([0, 2, 3, 6, 8, 11, 14].indexOf(s) >= 0) clav(t, ch[(s * 3) % 4] + 12, 0.9); if (full && (s === 12 || s === 14) && bar.bi % 2) brass(t, ch.slice(0, 3), dur * 1.5, 1); if (s === 0) organ(t, ch.slice(0, 3).map(function (n) { return n + 12; }), dur * 15, 0.5); }
      if (g === 'soft') { if (s % 2 === 0) { var arp = ch.concat([ch[1] + 12]); epiano(t, [arp[this.arpI++ % 4] + 12], dur * 2, 0.9); } if (full && s === 0) strings(t, ch.slice(0, 3), dur * 15, 0.8); }
      if (g === 'lounge') { if (s === 3 || s === 10 || (s === 0 && R() < 0.3)) epiano(t, ch.map(function (n) { return n + 12; }), dur * 3, 0.9); }
      if (g === 'glam') { if (s % 2 === 0) guitar(t, lo + 12, full ? dur * 2 : dur * 0.9, 1, !full); if (bar.last && s === 12) organ(t, ch.slice(0, 3).map(function (n) { return n + 12; }), dur * 4, 0.8); }
      /* melody */
      if (sec !== 'intro' && sec !== 'outro') {
        var mo = this.motif[sec], ks = ((bar.bi % 2) * 16) + s, j = mo.steps.indexOf(ks);
        if (j >= 0 && !(g === 'disco' && sec === 'verse') && !(g === 'funk' && sec === 'verse' && bar.bi < 4)) {
          var d = mo.deg[j] + (bar.bi >= 4 && sec !== 'bridge' ? (bar.bi % 4 === 3 && j === mo.steps.length - 1 ? 0 : 2) : 0);
          var m = this.scaleNote(d);
          if (beat) { var best = m, bd = 99; ch.forEach(function (c) { for (var o = -2; o <= 3; o++) { var cand = c + 12 * o; if (Math.abs(cand - m) < bd) { bd = Math.abs(cand - m); best = cand; } } }); m = best; }
          var nx = mo.steps[j + 1] !== undefined ? mo.steps[j + 1] : 32, len = Math.min(nx - ks, 6) * dur;
          if (bar.last && bar.bi % 2 === 1 && j === mo.steps.length - 1) { m = this.root + 24; len = dur * 6; }
          lead(t, m, len * 0.92, g === 'lounge' ? 'flute' : g === 'glam' ? 'saw' : g === 'disco' ? 'square' : 'saw', g === 'soft' ? 0.9 : 1);
        }
      }
      return this.adv();
    };
    Song.prototype.adv = function () { this.step++; return this.step < this.total; };
    function jingle(t) {
      [[72, 0], [76, 0.18], [79, 0.36], [84, 0.54]].forEach(function (n) { epiano(t + n[1], [n[0], n[0] + 12], 0.5, 1.2); });
      var s = noise(t, 1.2), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(5000, t + 1.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 1.2); s.connect(f); f.connect(g); g.connect(music);
    }
    var nextT = 0, pause = 0;
    function tick() {
      if (!ctx || !on || !current) return;
      var ahead = ctx.currentTime + 0.18;
      if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
      while (nextT < ahead) {
        if (!song) { if (pause <= nextT) { song = new Song(current.g, seed++); } else { nextT = pause; continue; } }
        var s16 = 60 / song.bpm / 4, sw = (song.step % 2) ? song.swing * s16 : 0;
        var more = song.play(nextT + sw, s16);
        nextT += s16;
        if (!more) { song = null; jingle(nextT + 0.2); pause = nextT + 1.8; nextT = pause; }
      }
    }
    function tuneUpdate() {
      if (!ctx) return;
      var best = null, bd = 9;
      STATIONS.forEach(function (s) { var d = Math.abs(s.f - freq); if (d < bd) { bd = d; best = s; } });
      var sig = clamp(1 - bd / 0.45, 0, 1);
      if (best !== current) {
        if (sig > 0) { current = best; song = null; pause = 0; seed = (Math.random() * 1e6) | 0; }
        else current = null;
      }
      var t = ctx.currentTime;
      radioIn.gain.setTargetAtTime(on && current ? sig * sig : 0, t, 0.05);
      staticG.gain.setTargetAtTime(on ? (1 - sig) * 0.16 + 0.006 : 0, t, 0.05);
      updateLabel(sig);
    }
    function updateLabel(sig) {
      var lab = $('station'), fq = $('freq');
      if (fq) fq.textContent = freq.toFixed(1);
      if (lab) lab.textContent = !on ? 'Off' : current && sig > 0.25 ? current.name : 'Static…';
      var sl = $('tune'); if (sl && Math.abs(+sl.value - freq) > 0.05) sl.value = freq.toFixed(1);
    }
    return {
      toggle: function () {
        if (!ctx && !init()) { $('station').textContent = 'No audio here'; return; }
        if (ctx.state === 'suspended') ctx.resume();
        on = !on;
        $('radioPower').setAttribute('aria-pressed', String(on));
        if (on && !timer) timer = setInterval(tick, 25);
        if (!on) { song = null; }
        tuneUpdate();
      },
      seek: function (dir) {
        var list = STATIONS.slice().sort(function (a, b) { return a.f - b.f; }), pickS = null;
        for (var i = 0; i < list.length; i++) { var s = dir > 0 ? list[i] : list[list.length - 1 - i]; if (dir > 0 ? s.f > freq + 0.05 : s.f < freq - 0.05) { pickS = s; break; } }
        if (!pickS) pickS = dir > 0 ? list[0] : list[list.length - 1];
        freq = pickS.f; if (!on) this.toggle(); else tuneUpdate();
      },
      tune: function (f) { freq = f; tuneUpdate(); },
      volume: function (v) { vol = v; if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
      label: function () { updateLabel(0); }
    };
  })();
