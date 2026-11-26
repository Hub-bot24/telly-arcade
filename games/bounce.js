/*
 * SPRINGHEIST (rebuilt): an original bounce-and-grab caper for 1 or 2 players.
 *
 * Zip (and, with a second controller, Zap) are tiny robot thieves working a neon tower at night.
 *  - Hold ◀ ▶ to run. Run into a shaft and you drop onto its trampoline and bounce.
 *  - While bouncing you are shielded. Hold ◀ or ▶ (or tap it just before) to hop off at the next floor you pass.
 *  - Each trampoline takes 4 bounces in a row before it tears. Hop off and it springs back.
 *  - Blue force gates block the floors. Stand next to one and press OK to blow it outward: the blast stuns
 *    every Sentry in its path, and chains score double each time.
 *  - Away from a gate, OK fires a short Pulse around you (it recharges).
 *  - Grab loot quickly one after another to build a chain multiplier.
 *  - A gold Overclock core makes the Sentries panic: catch them for big points.
 *  - Clear every bit of loot to crack the vault. Every third vault is followed by Skydrop, a rooftop bonus round.
 */
(function () {
  'use strict';
  var A = window.ARCADE; if (!A) return;
  var W = 1920, H = 1080;
  var BX0 = 90, BX1 = 1830, TOPY = 268, GY = 992, PADY = GY + 30, SHAFT = 116, RUN = 480, SLAB = 20;
  var S = null;
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------------ helpers
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rr(x, px, py, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function font(sz, wt) { return (wt || 700) + ' ' + sz + 'px "Bricolage Grotesque", Manrope, sans-serif'; }
  function mfont(sz, wt) { return (wt || 600) + ' ' + sz + 'px Manrope, sans-serif'; }
  function hexA(hex, a) { var h = String(hex || '#ffffff').replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return 'rgba(' + parseInt(h.substr(0, 2), 16) + ',' + parseInt(h.substr(2, 2), 16) + ',' + parseInt(h.substr(4, 2), 16) + ',' + a + ')'; }
  function play(n, o) { if (A.play) A.play('sh_' + n, o); }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // soft round glow sprites, drawn additively (much cheaper than shadowBlur on a TV)
  var GLOW = {};
  function glow(col) {
    if (GLOW[col]) return GLOW[col];
    var r = 64, c = canvas(r * 2, r * 2), x = c.getContext('2d'), g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, hexA(col, 1)); g.addColorStop(0.25, hexA(col, 0.45)); g.addColorStop(0.6, hexA(col, 0.12)); g.addColorStop(1, hexA(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, r * 2, r * 2); GLOW[col] = c; return c;
  }
  function addGlow(x, col, px, py, r, a) { x.globalAlpha = a == null ? 1 : a; x.drawImage(glow(col), px - r, py - r, r * 2, r * 2); x.globalAlpha = 1; }

  // ------------------------------------------------------------------ loot art (pre-rendered once)
  var LOOT = {
    gem: { v: 150, col: '#7af7ff' }, bars: { v: 200, col: '#ffd36b' }, idol: { v: 300, col: '#ffb84d' },
    art: { v: 400, col: '#ff7ad9' }, watch: { v: 250, col: '#d9e6ff' }, crown: { v: 500, col: '#ffe17a' }
  };
  var LOOTK = ['gem', 'bars', 'idol', 'art', 'watch', 'crown'], LOOTIMG = {};
  function lootImg(k) {
    if (LOOTIMG[k]) return LOOTIMG[k];
    var c = canvas(96, 96), x = c.getContext('2d'); x.translate(48, 52);
    var g, i;
    if (k === 'gem') {
      g = x.createLinearGradient(-30, -30, 30, 30); g.addColorStop(0, '#e8ffff'); g.addColorStop(0.5, '#38d8ff'); g.addColorStop(1, '#1056c8');
      x.fillStyle = g; x.beginPath(); x.moveTo(-30, -10); x.lineTo(-16, -26); x.lineTo(16, -26); x.lineTo(30, -10); x.lineTo(0, 28); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-30, -10); x.lineTo(30, -10); x.moveTo(-16, -26); x.lineTo(-8, -10); x.lineTo(0, 28); x.lineTo(8, -10); x.lineTo(16, -26); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.moveTo(-12, -22); x.lineTo(-4, -22); x.lineTo(-10, -12); x.closePath(); x.fill();
    } else if (k === 'bars') {
      for (i = 0; i < 3; i++) {
        var bx = [-26, 2, -12][i], by = [0, 0, -16][i];
        g = x.createLinearGradient(bx, by - 14, bx + 26, by + 14); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#f5b827'); g.addColorStop(1, '#a86a0a');
        x.fillStyle = g; x.beginPath(); x.moveTo(bx + 4, by - 12); x.lineTo(bx + 22, by - 12); x.lineTo(bx + 26, by + 12); x.lineTo(bx, by + 12); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 1.5; x.stroke();
      }
    } else if (k === 'idol') {
      g = x.createLinearGradient(-20, -34, 20, 30); g.addColorStop(0, '#fff0b8'); g.addColorStop(0.45, '#ffb22e'); g.addColorStop(1, '#8a4a06');
      x.fillStyle = g; x.beginPath(); x.arc(0, -20, 12, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(-14, -8); x.quadraticCurveTo(0, -12, 14, -8); x.lineTo(18, 18); x.lineTo(-18, 18); x.closePath(); x.fill();
      x.fillStyle = '#6a3a05'; x.fillRect(-22, 18, 44, 10);
      x.fillStyle = '#ff3b5c'; x.beginPath(); x.arc(-4, -22, 2.5, 0, TAU); x.arc(5, -22, 2.5, 0, TAU); x.fill();
    } else if (k === 'art') {
      x.fillStyle = '#c9952e'; rr(x, -32, -28, 64, 52, 4); x.fill();
      g = x.createLinearGradient(-26, -22, 26, 18); g.addColorStop(0, '#ff7ad9'); g.addColorStop(0.5, '#7a5cff'); g.addColorStop(1, '#22d3ee');
      x.fillStyle = g; x.fillRect(-26, -22, 52, 40);
      x.fillStyle = 'rgba(255,240,150,.9)'; x.beginPath(); x.arc(10, -10, 7, 0, TAU); x.fill();
      x.fillStyle = 'rgba(10,10,40,.6)'; x.beginPath(); x.moveTo(-26, 18); x.lineTo(-8, -4); x.lineTo(6, 10); x.lineTo(14, 2); x.lineTo(26, 18); x.closePath(); x.fill();
    } else if (k === 'watch') {
      x.fillStyle = '#8fa3c7'; x.fillRect(-9, -34, 18, 68);
      g = x.createRadialGradient(-5, -5, 2, 0, 0, 24); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9fb3d9');
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, 22, 0, TAU); x.fill();
      x.fillStyle = '#0b1230'; x.beginPath(); x.arc(0, 0, 16, 0, TAU); x.fill();
      x.strokeStyle = '#7af7ff'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -11); x.moveTo(0, 0); x.lineTo(8, 4); x.stroke();
    } else if (k === 'crown') {
      g = x.createLinearGradient(0, -26, 0, 20); g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#e0a010');
      x.fillStyle = g; x.beginPath(); x.moveTo(-30, 18); x.lineTo(-30, -14); x.lineTo(-15, 0); x.lineTo(0, -24); x.lineTo(15, 0); x.lineTo(30, -14); x.lineTo(30, 18); x.closePath(); x.fill();
      x.fillStyle = '#ff3b6b'; x.beginPath(); x.arc(0, 6, 5, 0, TAU); x.fill(); x.fillStyle = '#38d8ff'; x.beginPath(); x.arc(-16, 8, 4, 0, TAU); x.arc(16, 8, 4, 0, TAU); x.fill();
    }
    LOOTIMG[k] = c; return c;
  }

  // ------------------------------------------------------------------ level
  function buildLevel(n) {
    var F = n >= 5 ? 6 : 5, ns = n >= 4 ? 4 : 3;
    var fy = []; for (var i = 0; i < F; i++) fy.push(Math.round(TOPY + (GY - TOPY) * i / (F - 1)));
    var sx = [], seg = (BX1 - BX0) / ns;
    for (var s = 0; s < ns; s++) sx.push(Math.round(BX0 + seg * (s + 0.5) + rnd(-seg * 0.12, seg * 0.12)));
    var pads = sx.map(function (x) { return { x: x, hp: 4, squash: 0, vs: 0, broken: 0, flash: 0, heal: 0 }; });
    // floor segments: between walls and shafts
    var segs = [], edges = [BX0].concat(sx).concat([BX1]);
    for (var f = 0; f < F; f++) for (var k = 0; k < edges.length - 1; k++) {
      var a = edges[k] + (k ? SHAFT / 2 : 0), b = edges[k + 1] - (k < edges.length - 2 ? SHAFT / 2 : 0);
      segs.push({ f: f, a: a, b: b });
    }
    var gates = [], loot = [];
    var startX = Math.round((BX0 + sx[0] - SHAFT / 2) / 2);
    for (var q = 0; q < segs.length; q++) {
      var sg = segs[q], w = sg.b - sg.a, gx = null;
      var isStart = sg.f === F - 1 && sg.a <= startX && sg.b >= startX;
      if (w > 300 && !isStart && Math.random() < (n < 2 ? 0.35 : 0.5)) { gx = Math.round(sg.a + w * rnd(0.35, 0.65)); gates.push({ f: sg.f, x: gx, on: 1, off: 0, t: Math.random() * 9 }); }
      var cnt = w > 420 ? 2 : w > 160 ? 1 : 0;
      for (var c = 0; c < cnt; c++) {
        var lx = sg.a + w * (cnt === 1 ? rnd(0.3, 0.7) : (c ? rnd(0.66, 0.85) : rnd(0.15, 0.34)));
        if (gx != null && Math.abs(lx - gx) < 70) lx += lx < gx ? -70 : 70;
        if (sg.f === F - 1 && Math.abs(lx - startX) < 120) continue;
        if (Math.random() < 0.88) loot.push({ f: sg.f, x: Math.round(clamp(lx, sg.a + 36, sg.b - 36)), k: LOOTK[Math.floor(Math.random() * Math.min(LOOTK.length, 3 + n))], t: Math.random() * 6, got: 0 });
      }
    }
    return { n: n, F: F, fy: fy, sx: sx, pads: pads, segs: segs, gates: gates, loot: loot, total: loot.length, startX: startX };
  }
  function shaftAt(x, margin) { var L = S.L; for (var i = 0; i < L.sx.length; i++) if (Math.abs(x - L.sx[i]) < SHAFT / 2 - (margin || 0)) return i; return -1; }
  function segAt(f, x) { var L = S.L; for (var i = 0; i < L.segs.length; i++) { var s = L.segs[i]; if (s.f === f && x >= s.a - 1 && x <= s.b + 1) return s; } return null; }
  function physics() { var h = PADY - (S.L.fy[0] - 66), t = 0.96, g = 2 * h / (t * t); return { g: g, v0: g * t }; }

  // ------------------------------------------------------------------ the static picture (tower, city, sky) per level
  var CITY = null, CITYM = null;
  function paintCity(moon) {
    var c = canvas(W, H), x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05061a'); g.addColorStop(0.55, '#170a33'); g.addColorStop(0.85, '#3a0f3c'); g.addColorStop(1, '#4a1430');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 220; i++) { x.fillStyle = 'rgba(255,255,255,' + rnd(0.08, 0.7) + ')'; var s = rnd(0.8, 2.2); x.fillRect(rnd(0, W), rnd(0, 560), s, s); }
    if (moon) {
    addGlow(x, '#ffd9c8', 1650, 150, 260, 0.35);
    var mg = x.createRadialGradient(1630, 135, 4, 1650, 150, 58); mg.addColorStop(0, '#fff6ea'); mg.addColorStop(1, '#f2c7b4'); x.fillStyle = mg; x.beginPath(); x.arc(1650, 150, 56, 0, TAU); x.fill();
    x.fillStyle = 'rgba(180,120,140,.25)'; x.beginPath(); x.arc(1632, 140, 12, 0, TAU); x.arc(1668, 168, 8, 0, TAU); x.fill();
    }
    var layers = [['#1b0f3a', 0.35, 520, 160], ['#140b2c', 0.55, 640, 120], ['#0c0820', 0.8, 760, 90]];
    for (var l = 0; l < layers.length; l++) {
      var Ly = layers[l], px = -20;
      while (px < W) {
        var bw = rnd(Ly[3] * 0.5, Ly[3] * 1.2), bh = rnd(120, 420) * (1 - l * 0.15), top = Ly[2] - bh + l * 60;
        x.fillStyle = Ly[0]; x.fillRect(px, top, bw, H - top);
        if (Math.random() < 0.3) x.fillRect(px + bw / 2 - 2, top - rnd(20, 60), 4, 60);
        for (var wy = top + 14; wy < H; wy += 18) for (var wx = px + 8; wx < px + bw - 8; wx += 14)
          if (Math.random() < 0.18) { x.fillStyle = ['rgba(255,214,140,', 'rgba(140,220,255,', 'rgba(255,140,220,'][Math.floor(Math.random() * 3)] + (Ly[1] * rnd(0.3, 0.9)) + ')'; x.fillRect(wx, wy, 6, 8); }
        px += bw + rnd(4, 30);
      }
    }
    var hz = x.createLinearGradient(0, 700, 0, H); hz.addColorStop(0, 'rgba(255,80,160,0)'); hz.addColorStop(1, 'rgba(255,80,160,0.18)'); x.fillStyle = hz; x.fillRect(0, 700, W, H - 700);
    return c;
  }
  var FLOORCOL = ['#3a1f6e', '#2a2a7a', '#1f3f7a', '#1f5470', '#2a3a6e', '#3a2a66'];
  function paintTower() {
    var L = S.L, c = canvas(W, H), x = c.getContext('2d');
    if (!CITY) CITY = paintCity();
    x.drawImage(CITY, 0, 0);
    x.fillStyle = '#0d0a22'; x.fillRect(BX0 - 30, TOPY - 150, BX1 - BX0 + 60, 30);
    for (var f = 0; f < L.F; f++) {
      var top = f === 0 ? TOPY - 120 : L.fy[f - 1] + SLAB, bot = L.fy[f], col = FLOORCOL[f % FLOORCOL.length];
      var g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, '#0b0a1e'); g.addColorStop(1, col);
      x.fillStyle = g; x.fillRect(BX0, top, BX1 - BX0, bot - top);
      for (var k = 0; k < L.segs.length; k++) {
        var sg = L.segs[k]; if (sg.f !== f) continue;
        var w = sg.b - sg.a, nwin = Math.floor(w / 190);
        for (var i = 0; i < nwin; i++) {
          var wx = sg.a + (w - nwin * 190) / 2 + i * 190 + 30, wy = top + 22, ww = 130, wh = Math.max(40, bot - top - 66);
          x.save(); x.beginPath(); x.rect(wx, wy, ww, wh); x.clip(); x.globalAlpha = 0.55; x.drawImage(CITY, wx, wy, ww, wh, wx, wy, ww, wh); x.globalAlpha = 1; x.restore();
          var wg = x.createLinearGradient(wx, wy, wx + ww, wy + wh); wg.addColorStop(0, 'rgba(255,255,255,.10)'); wg.addColorStop(0.4, 'rgba(255,255,255,0)'); x.fillStyle = wg; x.fillRect(wx, wy, ww, wh);
          x.strokeStyle = 'rgba(160,150,255,.35)'; x.lineWidth = 3; x.strokeRect(wx, wy, ww, wh); x.beginPath(); x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh); x.stroke();
        }
        for (var lmp = sg.a + 120; lmp < sg.b - 60; lmp += 260) {
          x.fillStyle = '#2a2550'; x.fillRect(lmp - 18, top, 36, 6);
          x.globalCompositeOperation = 'lighter'; var lg = x.createLinearGradient(0, top, 0, bot); lg.addColorStop(0, 'rgba(255,220,180,.16)'); lg.addColorStop(1, 'rgba(255,220,180,0)');
          x.fillStyle = lg; x.beginPath(); x.moveTo(lmp - 14, top + 6); x.lineTo(lmp + 14, top + 6); x.lineTo(lmp + 90, bot); x.lineTo(lmp - 90, bot); x.closePath(); x.fill(); x.globalCompositeOperation = 'source-over';
        }
      }
    }
    for (var s = 0; s < L.sx.length; s++) {
      var cx = L.sx[s], g2 = x.createLinearGradient(cx - SHAFT / 2, 0, cx + SHAFT / 2, 0);
      g2.addColorStop(0, 'rgba(0,0,0,.65)'); g2.addColorStop(0.5, 'rgba(20,10,40,.35)'); g2.addColorStop(1, 'rgba(0,0,0,.65)');
      x.fillStyle = g2; x.fillRect(cx - SHAFT / 2, TOPY - 120, SHAFT, PADY - TOPY + 160);
      x.globalCompositeOperation = 'lighter'; var bg = x.createLinearGradient(0, PADY, 0, TOPY - 120); bg.addColorStop(0, 'rgba(94,242,255,.18)'); bg.addColorStop(1, 'rgba(94,242,255,0)'); x.fillStyle = bg; x.fillRect(cx - SHAFT / 2 + 10, TOPY - 120, SHAFT - 20, PADY - TOPY + 120); x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(94,242,255,.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - SHAFT / 2, TOPY - 120); x.lineTo(cx - SHAFT / 2, PADY); x.moveTo(cx + SHAFT / 2, TOPY - 120); x.lineTo(cx + SHAFT / 2, PADY); x.stroke();
    }
    for (var q = 0; q < L.segs.length; q++) {
      var sgm = L.segs[q], y = L.fy[sgm.f];
      var sg2 = x.createLinearGradient(0, y, 0, y + SLAB); sg2.addColorStop(0, '#4b4a86'); sg2.addColorStop(1, '#17163a');
      x.fillStyle = sg2; x.fillRect(sgm.a, y, sgm.b - sgm.a, SLAB);
      x.fillStyle = '#ff5cb4'; x.fillRect(sgm.a, y, sgm.b - sgm.a, 3);
      x.globalCompositeOperation = 'lighter'; var eg = x.createLinearGradient(0, y - 26, 0, y + 4); eg.addColorStop(0, 'rgba(255,92,180,0)'); eg.addColorStop(1, 'rgba(255,92,180,.22)'); x.fillStyle = eg; x.fillRect(sgm.a, y - 26, sgm.b - sgm.a, 30); x.globalCompositeOperation = 'source-over';
    }
    x.fillStyle = '#0a0818'; x.fillRect(BX0 - 30, GY + SLAB, BX1 - BX0 + 60, H - GY - SLAB);
    for (var p = 0; p < L.sx.length; p++) { x.fillStyle = '#05040e'; x.fillRect(L.sx[p] - SHAFT / 2, GY, SHAFT, PADY - GY + 40); }
    var wl = x.createLinearGradient(BX0 - 30, 0, BX0, 0); wl.addColorStop(0, '#0d0a22'); wl.addColorStop(1, '#262056'); x.fillStyle = wl; x.fillRect(BX0 - 30, TOPY - 120, 30, GY - TOPY + 140);
    var wr = x.createLinearGradient(BX1, 0, BX1 + 30, 0); wr.addColorStop(0, '#262056'); wr.addColorStop(1, '#0d0a22'); x.fillStyle = wr; x.fillRect(BX1, TOPY - 120, 30, GY - TOPY + 140);
    return c;
  }

  // ------------------------------------------------------------------ heroes and Sentries
  function mkHero(i, pl) {
    var L = S.L;
    return { i: i, pl: pl, p: pl.p, src: pl.src, col: pl.p.color || (i ? '#ff5cb4' : '#7af7ff'), x: L.startX + i * 70, y: L.fy[L.F - 1], f: L.F - 1, vx: 0, vy: 0, st: 'floor', face: 1,
      sq: 0, run: 0, intent: 0, intentT: 0, inv: 2600, pulseCD: 0, shaft: -1, flip: 0, scarf: null, dead: 0, blink: 0, bounces: 0 };
  }
  function mkBot(k) {
    var L = S.L, f = k % Math.max(1, L.F - 2), right = k % 2 === 0;
    var x = right ? BX1 - 130 - k * 40 : BX0 + 130 + k * 40;
    if (shaftAt(x, -30) >= 0) x += right ? -SHAFT : SHAFT;
    return { x: x, y: L.fy[f], f: f, dir: right ? -1 : 1, st: 'wait', wait: 1400 + k * 1600, vy: 0, shaft: -1, target: 0, stun: 0, hop: Math.random() * 6, think: 0, lastGap: -1, eye: 0, caught: 0 };
  }
  function heroSrcOK(h, ev) { return S.heroes.length === 1 || ev.src === h.src; }
  function heldDir(h) {
    var src = S.pls.length === 1 ? null : h.src;
    var l = A.held ? A.held(src, 'L') : false, r = A.held ? A.held(src, 'R') : false;
    return l && !r ? -1 : r && !l ? 1 : 0;
  }

  // ------------------------------------------------------------------ flow
  var SONG = { track: 'mu_sh', bpm: 124, play: function () { } };
  function start(opts) {
    S = { phase: 'select', t: 0, picks: [{ src: null, idx: 0 }], opts: opts || {}, parts: [], pops: [] };
    var list = A.profiles(); if (opts && opts.pid) for (var i = 0; i < list.length; i++) if (list[i].id === opts.pid) S.picks[0].idx = i;
    A.tint([[255, 92, 180], [94, 242, 255], [120, 60, 200]]);
    if (A.soundPack) A.soundPack('sh');
    A.music(SONG, 124);
  }
  function begin() {
    var list = A.profiles(), pls = [];
    for (var i = 0; i < S.picks.length; i++) pls.push({ p: list[S.picks[i].idx], src: S.picks[i].src, score: 0, shown: 0, lives: 3, bonusLife: 20000 });
    S = { phase: 'intro', t: 0, pls: pls, level: 0, parts: [], pops: [], waves: [], picks: S.picks, shake: 0, flash: 0 };
    if (A.musicRestart) A.musicRestart();
    if (A.dj) A.dj.startFor('springheist');
    A.music(SONG, 124);
    newLevel(1);
  }
  function newLevel(n) {
    S.level = n; S.L = buildLevel(n); S.bg = paintTower();
    S.heroes = []; for (var i = 0; i < S.pls.length; i++) if (S.pls[i].lives > 0) S.heroes.push(mkHero(i, S.pls[i]));
    S.bots = []; var nb = Math.min(7, 2 + Math.floor(n * 0.7)); for (var k = 0; k < nb; k++) S.bots.push(mkBot(k));
    S.phase = 'intro'; S.introT = 2300; S.cued = 0; S.levelT = 0; S.alarm = 0; S.gold = null; S.goldT = rnd(14000, 24000); S.panic = 0; S.chain = 0; S.chainT = 0; S.catchN = 0;
    S.waves = []; S.parts = []; S.pops = []; S.phys = physics(); S.sky = null;
    S.botSpeed = Math.min(330, 175 + n * 16);
    A.musicTempo(124);
  }
  function score(pl, n, x, y, label, col) {
    var before = pl.score; pl.score += n;
    if (before < pl.bonusLife && pl.score >= pl.bonusLife) { pl.lives++; pl.bonusLife += 30000; pop(x, y - 70, 'EXTRA LIFE', '#8dff8a', 1.2); play('gold'); }
    if (label !== false) pop(x, y, label || ('+' + n), col || '#fff');
  }
  function pop(x, y, txt, col, sz) { S.pops.push({ x: x, y: y, txt: txt, col: col || '#fff', t: 0, sz: sz || 1 }); }
  function burst(x, y, col, n, sp, life) {
    for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = rnd(0.3, 1) * (sp || 600); S.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150, t: 0, life: life || rnd(400, 900), col: col, sz: rnd(2, 5), k: 'spark' }); }
  }
  function sparkle(x, y, col, n) { for (var i = 0; i < n; i++) S.parts.push({ x: x + rnd(-30, 30), y: y + rnd(-30, 20), vx: rnd(-60, 60), vy: rnd(-220, -60), t: 0, life: rnd(500, 1000), col: col, sz: rnd(6, 12), k: 'star' }); }
  function dust(x, y, n) { for (var i = 0; i < n; i++) S.parts.push({ x: x + rnd(-14, 14), y: y - 2, vx: rnd(-160, 160), vy: rnd(-90, -20), t: 0, life: rnd(300, 600), col: '#b9a8ff', sz: rnd(6, 12), k: 'puff' }); }

  // ------------------------------------------------------------------ update
  function update(dt) {
    var L = S.L, s = dt / 1000;
    S.t += dt; S.levelT += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 0.02);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt / 400);
    if (S.chainT > 0) { S.chainT -= dt; if (S.chainT <= 0) S.chain = 0; }
    for (var p = 0; p < L.pads.length; p++) {
      var pd = L.pads[p]; pd.vs += (-pd.squash * 900 - pd.vs * 18) * s; pd.squash += pd.vs * s;
      if (pd.flash > 0) pd.flash -= dt;
      if (pd.broken > 0) { pd.broken -= dt; if (pd.broken <= 0) { pd.hp = 4; burst(pd.x, PADY, '#4dffb0', 14, 300); } }
      else if (pd.hp < 4 && !heroInShaft(p)) { pd.heal += dt; if (pd.heal > 900) { pd.heal = 0; pd.hp++; } }
    }
    for (var g = 0; g < L.gates.length; g++) { var gt = L.gates[g]; gt.t += s; if (!gt.on) { gt.off -= dt; if (gt.off <= 0 && !occupied(gt)) { gt.on = 1; burst(gt.x, L.fy[gt.f] - 50, '#5ef2ff', 10, 200); } } }
    if (S.phase !== 'play') return;
    if (!S.alarm && S.levelT > 60000 + S.level * 3000) { S.alarm = 1; S.botSpeed *= 1.22; var nb = mkBot(S.bots.length); nb.wait = 600; S.bots.push(nb); pop(W / 2, 220, 'ALARM!', '#ff4d6a', 1.6); play('hit'); A.musicTempo(132); }
    if (!S.gold) { S.goldT -= dt; if (S.goldT <= 0) { var sg = L.segs[Math.floor(Math.random() * L.segs.length)]; if (sg.b - sg.a > 120) { S.gold = { f: sg.f, x: rnd(sg.a + 40, sg.b - 40), life: 11000, t: 0 }; play('door', { rate: 1.5 }); } else S.goldT = 500; } }
    else { S.gold.life -= dt; S.gold.t += s; if (S.gold.life <= 0) { S.gold = null; S.goldT = rnd(18000, 30000); } }
    if (S.panic > 0) { S.panic -= dt; if (S.panic <= 0) { S.catchN = 0; A.musicTempo(S.alarm ? 132 : 124); } }
    for (var i = S.heroes.length - 1; i >= 0; i--) if (S.heroes[i]) updHero(S.heroes[i], dt);
    if (S.phase !== 'play') return;
    for (var b = 0; b < S.bots.length; b++) updBot(S.bots[b], dt);
    collide();
    for (var w = S.waves.length - 1; w >= 0; w--) {
      var wv = S.waves[w]; if (wv.ring) continue;
      wv.x += wv.dir * 1700 * s; wv.t += dt;
      for (var bb = 0; bb < S.bots.length; bb++) { var bo = S.bots[bb]; if (bo.st === 'floor' && bo.f === wv.f && Math.abs(bo.x - wv.x) < 40 && !bo.stun) stunBot(bo, wv.pl, true); }
      if (!wv.seg || wv.x < wv.seg.a || wv.x > wv.seg.b) S.waves.splice(w, 1);
    }
    var left = 0; for (var l = 0; l < L.loot.length; l++) if (!L.loot[l].got) left++;
    if (!left) levelClear();
  }
  function heroInShaft(p) { for (var i = 0; i < S.heroes.length; i++) if (S.heroes[i].st === 'shaft' && S.heroes[i].shaft === p) return true; return false; }
  function occupied(gt) {
    for (var i = 0; i < S.heroes.length; i++) { var h = S.heroes[i]; if (h.st === 'floor' && h.f === gt.f && Math.abs(h.x - gt.x) < 30) return true; }
    for (var b = 0; b < S.bots.length; b++) { var o = S.bots[b]; if (o.st === 'floor' && o.f === gt.f && Math.abs(o.x - gt.x) < 30) return true; }
    return false;
  }
  // where an active gate stops something moving from x0 to x1 on floor f (or null)
  function gateBlock(f, x0, x1) {
    var L = S.L, hit = null;
    for (var i = 0; i < L.gates.length; i++) { var g = L.gates[i]; if (!g.on || g.f !== f) continue;
      if (x0 <= g.x - 26 && x1 > g.x - 26) hit = g.x - 26; else if (x0 >= g.x + 26 && x1 < g.x + 26) hit = g.x + 26; }
    return hit;
  }
  function updHero(h, dt) {
    var L = S.L, s = dt / 1000, ph = S.phys;
    if (h.inv > 0) h.inv -= dt; if (h.pulseCD > 0) h.pulseCD -= dt; if (h.intentT > 0) h.intentT -= dt;
    h.blink -= dt; if (h.blink < -3000) h.blink = 140;
    if (h.st === 'dead') {
      h.dead += dt; h.vy += 1800 * s; h.y += h.vy * s; h.x += h.vx * s; h.flip += s * 1.5;
      if (h.dead > 1700) respawn(h);
      return;
    }
    var dir = heldDir(h);
    if (h.st === 'floor') {
      var target = dir * RUN; h.vx += clamp(target - h.vx, -5200 * s, 5200 * s);
      if (dir) h.face = dir;
      var nx = h.x + h.vx * s, gb = gateBlock(h.f, h.x, nx);
      if (gb != null) { nx = gb; h.vx = 0; }
      nx = clamp(nx, BX0 + 26, BX1 - 26);
      h.x = nx; h.run += Math.abs(h.vx) * s * 0.034;
      if (Math.abs(h.vx) > 200 && Math.random() < 0.05) dust(h.x - h.face * 10, h.y, 1);
      var sh = shaftAt(h.x, 22);
      if (sh >= 0) { h.st = 'shaft'; h.shaft = sh; h.vy = 120; h.bounces = 0; h.intent = 0; h.intentT = 0; h.entryF = h.f; h.lock = dir; play('hop', { rate: 0.8 }); }
    } else if (h.st === 'shaft') {
      var cx = L.sx[h.shaft]; h.x += (cx - h.x) * Math.min(1, s * 14);
      // a direction still held from running in doesn't count: let go (or press the other way) to choose a floor
      if (dir !== h.lock) h.lock = 0;
      if (dir && !h.lock) { h.intent = dir; h.intentT = Math.max(h.intentT, 160); h.face = dir; }
      var py = h.y; h.vy += ph.g * s; h.y += h.vy * s;
      var pad = L.pads[h.shaft];
      if (h.y >= PADY && h.vy > 0) {
        if (pad.broken > 0 || pad.hp <= 0) { if (h.y > PADY + 60) { killHero(h, 'fell'); return; } }
        else {
          h.y = PADY; h.vy = -ph.v0; h.entryF = -1; pad.vs = 650; pad.hp--; pad.heal = 0; h.bounces++; h.sq = 1;
          play('boing', { rate: [0.8, 0.86, 0.94, 1, 1.06][pad.hp + 1] || 1 });
          dust(cx, PADY, 6);
          if (pad.hp <= 0) { pad.broken = 4200; play('break'); burst(cx, PADY, '#ff4d6a', 20, 420); S.shake = 6; pop(cx, PADY - 160, 'TORN!', '#ff4d6a'); }
          else if (pad.hp === 1) { pad.flash = 2400; pop(cx, PADY - 160, 'LAST BOUNCE', '#ffb84d', 0.8); }
          if (h.bounces % 2 === 0) h.flip = 0.0001;
        }
      }
      if (h.flip > 0) { h.flip += s * 2.6; if (h.flip >= 1) h.flip = 0; }
      if (h.intentT > 0 && h.intent) {
        for (var f = 0; f < L.F; f++) {
          var fy = L.fy[f];
          if (f !== h.entryF && (py - fy) * (h.y - fy) <= 0 && py !== h.y) {
            var ex = cx + h.intent * (SHAFT / 2 + 8);
            if (ex > BX0 + 20 && ex < BX1 - 20 && shaftAt(ex, -4) < 0 && gateBlock(f, cx, ex) == null) {
              h.st = 'floor'; h.f = f; h.y = fy; h.x = ex; h.vx = h.intent * RUN * 0.8; h.face = h.intent; h.intent = 0; h.intentT = 0; h.flip = 0; h.inv = Math.max(h.inv, 250);
              play('land'); dust(h.x, h.y, 5); break;
            }
          }
        }
      }
    }
    if (h.sq > 0) h.sq = Math.max(0, h.sq - dt / 220);
    if (h.st === 'floor') {
      for (var l = 0; l < L.loot.length; l++) { var it = L.loot[l]; if (!it.got && it.f === h.f && Math.abs(it.x - h.x) < 42) grab(h, it); }
      if (S.gold && S.gold.f === h.f && Math.abs(S.gold.x - h.x) < 44) {
        var gx = S.gold.x; S.gold = null; S.goldT = rnd(20000, 32000); S.panic = 7500; S.catchN = 0; play('gold'); sparkle(gx, L.fy[h.f] - 40, '#ffd36b', 16); S.flash = 0.6;
        score(h.pl, 500, gx, L.fy[h.f] - 90, 'OVERCLOCK!', '#ffd36b'); A.musicTempo(136);
      }
    }
    updScarf(h, dt);
  }
  function grab(h, it) {
    it.got = 1; S.chain = S.chainT > 0 ? Math.min(5, S.chain + 1) : 1; S.chainT = 2600;
    var v = LOOT[it.k].v * S.chain, y = S.L.fy[it.f] - 70;
    score(h.pl, v, it.x, y, S.chain > 1 ? '+' + v + '  ×' + S.chain : '+' + v, LOOT[it.k].col);
    play('loot', { rate: 1 + (S.chain - 1) * 0.06 }); sparkle(it.x, y + 20, LOOT[it.k].col, 8);
  }
  function killHero(h, why) {
    if (h.st === 'dead') return;
    h.st = 'dead'; h.dead = 0; h.vy = why === 'fell' ? 200 : -700; h.vx = why === 'fell' ? 0 : -h.face * 160; h.flip = 0.0001;
    play('hit'); burst(h.x, h.y - 30, h.col, 26, 520); burst(h.x, h.y - 30, '#ffffff', 10, 300); S.shake = 12; S.flash = 0.4;
  }
  function respawn(h) {
    var pl = h.pl, idx = S.heroes.indexOf(h); pl.lives--;
    if (idx < 0) return;
    if (pl.lives <= 0) { S.heroes.splice(idx, 1); if (!S.heroes.length) gameOver(); return; }
    var L = S.L, nh = mkHero(h.i, pl); nh.inv = 2800; S.heroes[idx] = nh;
    for (var b = 0; b < S.bots.length; b++) { var o = S.bots[b]; if (o.st !== 'caught' && o.f === L.F - 1 && Math.abs(o.x - nh.x) < 420) { o.st = 'wait'; o.wait = 1800; o.f = 0; o.y = L.fy[0]; o.x = nh.x < W / 2 ? BX1 - 140 : BX0 + 140; } }
  }
  function updScarf(h, dt) {
    var n = 7, s = dt / 1000;
    if (!h.scarf) { h.scarf = []; for (var i = 0; i < n; i++) h.scarf.push({ x: h.x, y: h.y - 46 }); }
    var root = h.scarf[0], sc = 1 - h.sq * 0.25;
    root.x = h.x - h.face * 6; root.y = h.y - 46 * sc;
    for (var j = 1; j < n; j++) {
      var a = h.scarf[j], b = h.scarf[j - 1];
      a.y += 60 * s; a.x += (-h.face * 60 - (h.vx || 0) * 0.05) * s + Math.sin((S.t || 0) / 140 + j) * 0.8;
      if (h.st === 'shaft' || h.st === 'sky') a.y -= (h.vy || 0) * s * 0.35;
      var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1, L = 9;
      a.x = b.x + dx / d * L; a.y = b.y + dy / d * L;
    }
  }
  function nearestHero(x, f) {
    var best = null, bd = 1e9;
    for (var i = 0; i < S.heroes.length; i++) { var h = S.heroes[i]; if (h.st === 'dead') continue; var d = Math.abs(h.x - x) + (h.f === f ? 0 : 600) + (h.st === 'shaft' ? 300 : 0); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  function updBot(o, dt) {
    var L = S.L, s = dt / 1000, ph = S.phys, sp = S.botSpeed * (S.panic > 0 ? 0.75 : 1);
    o.hop += s * (o.st === 'floor' ? 9 : 4); o.eye += s;
    if (o.st === 'wait') { o.wait -= dt; if (o.wait <= 0) { o.st = 'floor'; burst(o.x, o.y - 30, '#ff4d6a', 12, 260); play('door', { rate: 0.8, vol: 0.6 }); } return; }
    if (o.st === 'caught') { o.caught -= dt; if (o.caught <= 0) { o.st = 'wait'; o.wait = 400; o.f = 0; o.y = L.fy[0]; o.x = Math.random() < 0.5 ? BX0 + 140 : BX1 - 140; o.stun = 0; } return; }
    if (o.stun > 0) { o.stun -= dt; if (Math.random() < 0.08) burst(o.x + rnd(-12, 12), o.y - 40, '#ffe17a', 1, 160, 300); if (o.st === 'floor') return; }
    if (o.st === 'floor') {
      o.think -= dt;
      if (o.think <= 0) {
        o.think = rnd(900, 2200);
        var h = nearestHero(o.x, o.f), chase = Math.min(0.9, 0.45 + S.level * 0.06);
        if (S.panic > 0 && h) o.dir = h.x < o.x ? 1 : -1;
        else if (h && h.f === o.f && h.st === 'floor' && Math.random() < chase) o.dir = h.x < o.x ? -1 : 1;
        else if (Math.random() < 0.25) o.dir = -o.dir;
      }
      var nx = o.x + o.dir * sp * s, gb = gateBlock(o.f, o.x, nx);
      if (gb != null) { o.dir = -o.dir; nx = o.x; }
      if (nx < BX0 + 30 || nx > BX1 - 30) { o.dir = -o.dir; nx = clamp(nx, BX0 + 30, BX1 - 30); }
      var sh = shaftAt(nx, 24);
      if (sh >= 0 && o.lastGap !== sh) {
        var hh = nearestHero(o.x, o.f), wantDrop = !hh || hh.f !== o.f || hh.st !== 'floor' ? 0.75 : 0.35;
        if (S.panic > 0) wantDrop = 0.6;
        if (Math.random() < wantDrop) { o.st = 'shaft'; o.shaft = sh; o.vy = 100; o.lastGap = sh; o.target = pickFloor(o); }
        else { o.dir = -o.dir; o.lastGap = sh; nx = o.x; }
      } else if (sh < 0 && shaftAt(nx, -20) < 0) o.lastGap = -1;
      if (o.st === 'floor') o.x = nx;
    } else if (o.st === 'shaft') {
      var cx = L.sx[o.shaft]; o.x += (cx - o.x) * Math.min(1, s * 10);
      var py = o.y; o.vy += ph.g * s * 0.92; o.y += o.vy * s;
      if (o.y >= PADY && o.vy > 0) { var pd = L.pads[o.shaft]; o.y = PADY; o.vy = -ph.v0 * 0.96; pd.vs = Math.max(pd.vs, 420); if (Math.random() < 0.3) o.target = pickFloor(o); }
      if (o.stun > 0) return;
      var fy = L.fy[o.target];
      if ((py - fy) * (o.y - fy) <= 0 && py !== o.y) {
        var hh2 = nearestHero(cx, o.target), d = hh2 && hh2.f === o.target ? (hh2.x < cx ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
        if (S.panic > 0 && hh2) d = -d;
        for (var tries = 0; tries < 2; tries++) {
          var ex = cx + d * (SHAFT / 2 + 8);
          if (ex > BX0 + 30 && ex < BX1 - 30 && gateBlock(o.target, cx, ex) == null) { o.st = 'floor'; o.f = o.target; o.y = fy; o.x = ex; o.dir = d; o.lastGap = o.shaft; o.think = 600; break; }
          d = -d;
        }
      }
    }
  }
  function pickFloor(o) {
    var L = S.L, h = nearestHero(o.x, o.f);
    if (h && S.panic <= 0 && Math.random() < Math.min(0.85, 0.5 + S.level * 0.05)) return h.st === 'floor' ? h.f : Math.floor(Math.random() * L.F);
    var f, n = 0; do { f = Math.floor(Math.random() * L.F); n++; } while (f === o.f && n < 8);
    return f;
  }
  function stunBot(o, pl, chain) {
    o.stun = 3600; S.catchN = chain ? S.catchN + 1 : 1;
    var v = 200 * Math.pow(2, Math.min(4, S.catchN - 1));
    score(pl, v, o.x, o.y - 90, '+' + v, '#5ef2ff'); play('stun', { rate: 1 + Math.min(4, S.catchN) * 0.05 }); burst(o.x, o.y - 30, '#5ef2ff', 16, 380);
  }
  function collide() {
    for (var i = 0; i < S.heroes.length; i++) {
      var h = S.heroes[i]; if (!h || h.st !== 'floor') continue;
      for (var b = 0; b < S.bots.length; b++) {
        var o = S.bots[b]; if (o.st !== 'floor' || o.f !== h.f || Math.abs(o.x - h.x) > 44) continue;
        if (S.panic > 0 && !o.stun) {
          S.catchN++; var v = 800 * Math.min(8, Math.pow(2, S.catchN - 1)); o.st = 'caught'; o.caught = 4200;
          score(h.pl, v, o.x, o.y - 90, '+' + v, '#ffd36b'); play('eat', { rate: 1 + S.catchN * 0.06 }); burst(o.x, o.y - 30, '#ffd36b', 22, 420); S.shake = 5;
        } else if (!o.stun && h.inv <= 0) { killHero(h, 'bot'); break; }
      }
    }
  }
  function action(h) {
    if (S.phase !== 'play' || h.st !== 'floor') return;
    var L = S.L, best = null, bd = 80;
    for (var i = 0; i < L.gates.length; i++) { var g = L.gates[i]; if (g.on && g.f === h.f && Math.abs(g.x - h.x) < bd) { bd = Math.abs(g.x - h.x); best = g; } }
    if (best) {
      var dir = best.x >= h.x ? 1 : -1; best.on = 0; best.off = 6500; S.catchN = 0;
      S.waves.push({ f: best.f, x: best.x, dir: dir, t: 0, pl: h.pl, seg: segAt(best.f, best.x) });
      play('door'); play('pulse', { vol: 0.6, rate: 1.2 }); burst(best.x, L.fy[best.f] - 50, '#5ef2ff', 30, 600); S.shake = 7; h.vx = -dir * 200;
      return;
    }
    if (h.pulseCD > 0) { play('hop', { rate: 0.6, vol: 0.4 }); return; }
    h.pulseCD = 9000; S.waves.push({ ring: 1, x: h.x, y: h.y - 30, t: 0 });
    play('pulse'); S.catchN = 0;
    for (var b = 0; b < S.bots.length; b++) { var o = S.bots[b]; if (o.st === 'floor' && o.f === h.f && Math.abs(o.x - h.x) < 190 && !o.stun) stunBot(o, h.pl, true); }
    S.shake = 4;
  }
  function levelClear() {
    S.phase = 'clear'; S.clearT = 0; play('clear'); S.flash = 0.8;
    var tb = Math.max(0, Math.round((90000 - S.levelT) / 1000) * 50);
    S.tally = { time: tb };
    for (var i = 0; i < S.heroes.length; i++) { var h = S.heroes[i]; score(h.pl, Math.round(tb / S.heroes.length), h.x, h.y - 100, false); sparkle(h.x, h.y - 40, '#ffe17a', 20); }
    for (var b = 0; b < S.bots.length; b++) if (S.bots[b].st !== 'caught' && S.bots[b].st !== 'wait') { S.bots[b].stun = 99999; burst(S.bots[b].x, S.bots[b].y - 30, '#ffe17a', 10, 300); }
  }

  // ------------------------------------------------------------------ Skydrop bonus round
  function startSky() {
    S.phase = 'skyintro'; S.introT = 2200; S.sky = { t: 0, len: 22000, coins: [], got: 0, total: 0 };
    var sk = S.sky;
    for (var row = 0; row < 4; row++) for (var i = 0; i < 12; i++) {
      var x = 260 + i * 125 + (row % 2) * 60, y = 300 + row * 150 + Math.sin(i * 0.8 + row) * 40;
      sk.coins.push({ x: x, y: y, k: (i + row) % 7 === 0 ? 'gem' : 'coin', got: 0, t: Math.random() * 6 });
    }
    sk.total = sk.coins.length;
    S.heroes = []; for (var p = 0; p < S.pls.length; p++) if (S.pls[p].lives > 0) { var h = mkHero(p, S.pls[p]); h.x = W / 2 + (p ? 160 : -160); h.y = 700; h.st = 'sky'; h.vy = -400; h.inv = 0; S.heroes.push(h); }
    S.skyBg = paintSky(); S.parts = []; S.pops = []; S.waves = [];
    A.musicTempo(132);
  }
  function paintSky() {
    if (!CITY) CITY = paintCity();
    var c = canvas(W, H), x = c.getContext('2d'); x.drawImage(CITY, 0, 0);
    x.fillStyle = '#0d0a22'; x.fillRect(0, 1000, W, 80);
    var g = x.createLinearGradient(0, 960, 0, 1000); g.addColorStop(0, 'rgba(255,92,180,0)'); g.addColorStop(1, 'rgba(255,92,180,.3)'); x.fillStyle = g; x.fillRect(0, 960, W, 40);
    x.font = font(30, 800); x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.25)'; x.fillText('ROOFTOP  ·  SKYDROP', W / 2, 1050);
    return c;
  }
  function updSky(dt) {
    var s = dt / 1000, sk = S.sky; sk.t += dt; S.t += dt;
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt / 400);
    for (var i = 0; i < S.heroes.length; i++) {
      var h = S.heroes[i], dir = S.phase === 'sky' ? heldDir(h) : 0;
      h.blink -= dt; if (h.blink < -3000) h.blink = 140;
      h.vx += clamp(dir * 620 - h.vx, -3000 * s, 3000 * s); if (dir) h.face = dir;
      h.x = clamp(h.x + h.vx * s, 150, W - 150);
      h.vy += 1500 * s; h.y += h.vy * s;
      if (h.y >= 975 && h.vy > 0) { h.y = 975; h.vy = -1300; h.sq = 1; h.flip = 0.0001; play('boing', { rate: 1.1, vol: 0.7 }); dust(h.x, 975, 5); }
      if (h.flip > 0) { h.flip += s * 1.8; if (h.flip >= 1) h.flip = 0; }
      if (h.sq > 0) h.sq = Math.max(0, h.sq - dt / 220);
      if (S.phase === 'sky') for (var c = 0; c < sk.coins.length; c++) { var co = sk.coins[c]; if (co.got) continue; var dx = co.x - h.x, dy = co.y - (h.y - 40); if (dx * dx + dy * dy < 52 * 52) { co.got = 1; sk.got++; var v = co.k === 'gem' ? 300 : 100; score(h.pl, v, co.x, co.y - 30, '+' + v, co.k === 'gem' ? '#7af7ff' : '#ffd36b'); play('loot', { rate: 1 + (sk.got % 8) * 0.05, vol: 0.8 }); sparkle(co.x, co.y, '#ffd36b', 4); } }
      updScarf(h, dt);
    }
    if (S.phase === 'sky' && (sk.got >= sk.total || sk.t >= sk.len)) {
      S.phase = 'skyend'; S.clearT = 0;
      if (sk.got >= sk.total) { for (var p = 0; p < S.heroes.length; p++) score(S.heroes[p].pl, Math.round(5000 / S.heroes.length), S.heroes[p].x, S.heroes[p].y - 120, 'PERFECT!', '#8dff8a'); play('gold'); }
      else play('clear');
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawHero(x, h, now, scale) {
    var sq = h.sq || 0, sx = 1 + sq * 0.28, sy = 1 - sq * 0.3, col = h.col || '#7af7ff', k = scale || 1;
    if (h.inv > 0 && h.st !== 'dead' && h.inv < 2600 && Math.floor(now / 90) % 2 === 0) x.globalAlpha = 0.45;
    if (h.scarf && k === 1) {
      x.fillStyle = col; x.beginPath(); var sc = h.scarf;
      x.moveTo(sc[0].x, sc[0].y - 5);
      for (var i = 1; i < sc.length; i++) x.lineTo(sc[i].x, sc[i].y - 6 + i * 0.5);
      for (var j = sc.length - 1; j >= 0; j--) x.lineTo(sc[j].x, sc[j].y + 6 - j * 0.5);
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.beginPath(); x.moveTo(sc[0].x, sc[0].y); for (var m = 1; m < sc.length; m++) x.lineTo(sc[m].x, sc[m].y); x.stroke();
    }
    x.save(); x.translate(h.x, h.y); x.scale(sx * k, sy * k);
    var air = h.st === 'shaft' || h.st === 'sky' || h.st === 'dead', run = h.run || 0, face = h.face || 1;
    if (h.flip > 0) { x.translate(0, -40); x.rotate(face * h.flip * TAU); x.translate(0, 40); }
    var la = air ? -0.5 : Math.sin(run) * 0.75, lb = air ? 0.4 : -Math.sin(run) * 0.75, moving = Math.abs(h.vx || 0) > 30;
    if (!moving && !air) { la = 0.12; lb = -0.12; }
    var ly = air ? 0.7 : 1;
    x.strokeStyle = '#2b2f55'; x.lineCap = 'round'; x.lineWidth = 9;
    x.beginPath(); x.moveTo(-7, -18); x.lineTo(-7 + Math.sin(la) * 16, -18 + Math.cos(la) * 16 * ly); x.stroke();
    x.beginPath(); x.moveTo(7, -18); x.lineTo(7 + Math.sin(lb) * 16, -18 + Math.cos(lb) * 16 * ly); x.stroke();
    x.fillStyle = col; x.beginPath(); x.arc(-7 + Math.sin(la) * 16, -18 + Math.cos(la) * 16 * ly, 5, 0, TAU); x.fill(); x.beginPath(); x.arc(7 + Math.sin(lb) * 16, -18 + Math.cos(lb) * 16 * ly, 5, 0, TAU); x.fill();
    var bg = x.createLinearGradient(-18, -50, 18, -14); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#cdd6f6'); bg.addColorStop(1, '#8a93c4');
    x.fillStyle = bg; rr(x, -17, -48, 34, 32, 10); x.fill();
    x.fillStyle = col; rr(x, -6, -40, 12, 8, 3); x.fill();
    var aa = air ? -2.2 : (moving ? -Math.sin(run) * 0.9 : 0.2);
    x.strokeStyle = '#d9e0fa'; x.lineWidth = 7;
    x.beginPath(); x.moveTo(-15, -42); x.lineTo(-15 + Math.sin(aa) * 14 - 4, -42 + Math.cos(aa) * 14); x.stroke();
    x.beginPath(); x.moveTo(15, -42); x.lineTo(15 - Math.sin(aa) * 14 + 4, -42 + Math.cos(aa) * 14); x.stroke();
    var hg = x.createLinearGradient(-22, -84, 22, -48); hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#aab3dd');
    x.fillStyle = hg; rr(x, -22, -84, 44, 36, 14); x.fill();
    x.fillStyle = '#0a0c24'; rr(x, -17 + face * 3, -77, 34, 20, 9); x.fill();
    var eyeH = h.blink > 0 ? 1 : 7, ex = face * 5;
    if (h.st === 'dead') { x.strokeStyle = col; x.lineWidth = 2.5; x.beginPath(); x.moveTo(-9 + ex, -73); x.lineTo(-3 + ex, -67); x.moveTo(-3 + ex, -73); x.lineTo(-9 + ex, -67); x.moveTo(4 + ex, -73); x.lineTo(10 + ex, -67); x.moveTo(10 + ex, -73); x.lineTo(4 + ex, -67); x.stroke(); }
    else { x.fillStyle = col; rr(x, -9 + ex, -71 + (7 - eyeH) / 2, 6, eyeH, 3); x.fill(); rr(x, 4 + ex, -71 + (7 - eyeH) / 2, 6, eyeH, 3); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; rr(x, -14 + ex, -75, 12, 4, 2); x.fill();
    x.strokeStyle = '#8a93c4'; x.lineWidth = 3; x.beginPath(); x.moveTo(6, -84); x.lineTo(10, -98); x.stroke();
    x.fillStyle = col; x.beginPath(); x.arc(10, -100, 4.5, 0, TAU); x.fill();
    x.restore();
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'lighter';
    if (!h.flip) addGlow(x, col, h.x + 10 * k, h.y - 100 * k * (1 - sq * 0.3), 18 * k, 0.8);
    addGlow(x, col, h.x + face * 4 * k, h.y - 68 * k, 30 * k, 0.35);
    if (h.st === 'shaft' && k === 1) { x.globalAlpha = 0.25 + 0.1 * Math.sin(now / 90); x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.arc(h.x, h.y - 46, 58, 0, TAU); x.stroke(); x.globalAlpha = 1; }
    x.globalCompositeOperation = 'source-over';
  }
  function drawBot(x, o, now) {
    if (o.st === 'wait' || o.st === 'caught') {
      if (o.st === 'wait' && o.wait < 900) { x.globalCompositeOperation = 'lighter'; addGlow(x, '#ff4d6a', o.x, o.y - 50, 50 * (1 - o.wait / 900) + 10, 0.6); x.globalCompositeOperation = 'source-over'; }
      return;
    }
    var hop = o.st === 'floor' && !o.stun ? Math.abs(Math.sin(o.hop)) : 0, lift = hop * 12, comp = o.st === 'shaft' ? 0.2 : 1 - hop;
    var panic = S.panic > 0 && !o.stun, body = panic ? '#2d6bff' : '#2a2140', rim = panic ? '#9fd0ff' : '#ff4d6a';
    if (panic && S.panic < 2000 && Math.floor(now / 120) % 2) { body = '#ffffff'; rim = '#2d6bff'; }
    x.save(); x.translate(o.x, o.y);
    var legTop = -30 - lift, legLen = 18 + comp * 4 + lift;
    x.strokeStyle = '#9aa0c8'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0);
    for (var i = 1; i <= 6; i++) x.lineTo((i % 2 ? -7 : 7), -legLen * i / 6);
    x.lineTo(0, legTop); x.stroke();
    x.fillStyle = '#5a5f88'; rr(x, -10, -4, 20, 5, 2); x.fill();
    var by = legTop - 26, g = x.createRadialGradient(-8, by - 10, 4, 0, by, 32);
    g.addColorStop(0, panic ? '#bfe0ff' : '#6b5fa0'); g.addColorStop(1, body);
    x.fillStyle = g; x.beginPath(); x.arc(0, by, 28, 0, TAU); x.fill();
    x.strokeStyle = rim; x.lineWidth = 3; x.beginPath(); x.arc(0, by, 28, Math.PI * 0.15, Math.PI * 0.85); x.stroke();
    var d = o.dir || 1, ex = d * 9;
    x.fillStyle = '#0a0612'; x.beginPath(); x.arc(ex, by - 4, 12, 0, TAU); x.fill();
    if (o.stun > 0) {
      x.strokeStyle = '#ffe17a'; x.lineWidth = 2.5; x.beginPath(); for (var a = 0; a < 12; a++) { var r = a * 0.9; x.lineTo(ex + Math.cos(a * 0.9 + now / 120) * r, by - 4 + Math.sin(a * 0.9 + now / 120) * r); } x.stroke();
    } else { x.fillStyle = panic ? '#ffffff' : '#ff3355'; x.beginPath(); x.arc(ex + d * 2, by - 4, panic ? 7 : 5.5, 0, TAU); x.fill(); }
    x.fillStyle = '#5a5f88'; rr(x, -4, by - 40, 8, 12, 3); x.fill();
    x.restore();
    x.globalCompositeOperation = 'lighter';
    var sy = o.y + legTop - 30;
    if (!o.stun && !panic) {
      var cg = x.createLinearGradient(o.x, sy, o.x + d * 200, sy + 60); cg.addColorStop(0, 'rgba(255,60,90,.32)'); cg.addColorStop(1, 'rgba(255,60,90,0)');
      x.fillStyle = cg; x.beginPath(); x.moveTo(o.x + d * 12, sy); x.lineTo(o.x + d * 210, sy - 10 + Math.sin(o.eye * 2) * 20); x.lineTo(o.x + d * 210, o.y); x.closePath(); x.fill();
      addGlow(x, '#ff3355', o.x + d * 11, sy, 26, 0.9);
    } else if (panic) addGlow(x, '#7ab8ff', o.x, o.y - 60, 60, 0.5);
    else addGlow(x, '#ffe17a', o.x, o.y - 60, 40, 0.4);
    x.globalCompositeOperation = 'source-over';
  }
  var PADCOL = ['#ff4d6a', '#ff4d6a', '#ffb84d', '#b7ff4d', '#4dffb0'];
  function drawPads(x, now) {
    var L = S.L;
    for (var i = 0; i < L.pads.length; i++) {
      var p = L.pads[i], cx = p.x, w = SHAFT - 18, col = PADCOL[Math.max(0, Math.min(4, p.hp))];
      if (p.hp === 1 && Math.floor(now / 140) % 2) col = '#ffffff';
      x.fillStyle = '#3a3566'; x.fillRect(cx - w / 2 - 6, PADY - 4, 8, 40); x.fillRect(cx + w / 2 - 2, PADY - 4, 8, 40);
      x.strokeStyle = '#6a6aa0'; x.lineWidth = 2;
      for (var s = -1; s <= 1; s += 2) { x.beginPath(); for (var k = 0; k <= 5; k++) x.lineTo(cx + s * (w / 2 - 12) + (k % 2 ? 5 : -5), PADY + 6 + k * 5); x.stroke(); }
      if (p.broken > 0) {
        x.strokeStyle = '#ff4d6a'; x.lineWidth = 4; x.beginPath(); x.moveTo(cx - w / 2, PADY); x.quadraticCurveTo(cx - w / 3, PADY + 20, cx - 10, PADY + 34); x.moveTo(cx + w / 2, PADY); x.quadraticCurveTo(cx + w / 3, PADY + 20, cx + 8, PADY + 30); x.stroke();
        continue;
      }
      var dip = clamp(p.squash * 0.05, -16, 26);
      x.strokeStyle = col; x.lineWidth = 6; x.beginPath(); x.moveTo(cx - w / 2, PADY); x.quadraticCurveTo(cx, PADY + dip * 2, cx + w / 2, PADY); x.stroke();
      x.globalCompositeOperation = 'lighter'; addGlow(x, col, cx, PADY + dip, 60, 0.35 + (p.hp === 1 ? 0.3 : 0)); x.globalCompositeOperation = 'source-over';
      for (var hh = 0; hh < 4; hh++) { x.fillStyle = hh < p.hp ? col : 'rgba(255,255,255,.12)'; x.fillRect(cx - 26 + hh * 14, PADY + 40, 10, 5); }
    }
  }
  function drawGates(x, now) {
    var L = S.L;
    for (var i = 0; i < L.gates.length; i++) {
      var g = L.gates[i], y = L.fy[g.f];
      x.fillStyle = '#2b2a5a'; x.fillRect(g.x - 14, y - 8, 28, 8); x.fillRect(g.x - 14, y - 104, 28, 8);
      if (!g.on) { var r = clamp(1 - g.off / 6500, 0, 1); x.fillStyle = 'rgba(94,242,255,' + (0.18 * r) + ')'; x.fillRect(g.x - 4, y - 96, 8, 88 * r); continue; }
      x.globalCompositeOperation = 'lighter';
      var a = 0.55 + 0.2 * Math.sin(g.t * 6);
      x.fillStyle = 'rgba(94,242,255,' + (a * 0.35) + ')'; x.fillRect(g.x - 10, y - 96, 20, 88);
      x.strokeStyle = 'rgba(190,250,255,' + a + ')'; x.lineWidth = 2;
      for (var k = 0; k < 3; k++) { x.beginPath(); x.moveTo(g.x + (k - 1) * 6, y - 96); for (var j = 1; j <= 8; j++) x.lineTo(g.x + (k - 1) * 6 + Math.sin(g.t * 13 + j * 1.7 + k) * 4, y - 96 + j * 11); x.stroke(); }
      addGlow(x, '#5ef2ff', g.x, y - 52, 60, 0.35);
      x.globalCompositeOperation = 'source-over';
    }
    // a hint when a hero stands next to a gate
    for (var h = 0; h < S.heroes.length; h++) {
      var he = S.heroes[h]; if (he.st !== 'floor') continue;
      for (var q = 0; q < L.gates.length; q++) { var gg = L.gates[q]; if (gg.on && gg.f === he.f && Math.abs(gg.x - he.x) < 80) { x.font = mfont(18, 800); x.textAlign = 'center'; x.fillStyle = 'rgba(190,250,255,' + (0.6 + 0.4 * Math.sin(now / 150)) + ')'; x.fillText('OK  BLAST', gg.x, L.fy[gg.f] - 116); } }
    }
  }
  function drawLoot(x, now) {
    var L = S.L;
    for (var i = 0; i < L.loot.length; i++) {
      var it = L.loot[i]; if (it.got) continue;
      var y = L.fy[it.f] - 40 + Math.sin(now / 400 + it.t) * 5;
      x.globalCompositeOperation = 'lighter'; addGlow(x, LOOT[it.k].col, it.x, y, 46, 0.3); x.globalCompositeOperation = 'source-over';
      x.drawImage(lootImg(it.k), it.x - 30, y - 32, 60, 60);
      if (Math.sin(now / 300 + it.t * 3) > 0.96) { x.globalCompositeOperation = 'lighter'; star(x, it.x + 14, y - 14, 10, '#ffffff'); x.globalCompositeOperation = 'source-over'; }
    }
    if (S.gold) {
      var gy = L.fy[S.gold.f] - 46 + Math.sin(now / 200) * 6;
      if (S.gold.life > 3000 || Math.floor(now / 120) % 2) {
        x.globalCompositeOperation = 'lighter'; addGlow(x, '#ffd36b', S.gold.x, gy, 80, 0.6); x.globalCompositeOperation = 'source-over';
        x.save(); x.translate(S.gold.x, gy); x.rotate(now / 600);
        var gg = x.createLinearGradient(-20, -20, 20, 20); gg.addColorStop(0, '#fff6c0'); gg.addColorStop(1, '#e09a10'); x.fillStyle = gg;
        x.beginPath(); for (var k = 0; k < 6; k++) x.lineTo(Math.cos(k * TAU / 6) * 22, Math.sin(k * TAU / 6) * 22); x.closePath(); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 7, 0, TAU); x.fill(); x.restore();
      }
    }
  }
  function star(x, px, py, r, col) { x.fillStyle = col; x.beginPath(); x.moveTo(px, py - r); x.lineTo(px + r * 0.22, py - r * 0.22); x.lineTo(px + r, py); x.lineTo(px + r * 0.22, py + r * 0.22); x.lineTo(px, py + r); x.lineTo(px - r * 0.22, py + r * 0.22); x.lineTo(px - r, py); x.lineTo(px - r * 0.22, py - r * 0.22); x.closePath(); x.fill(); }
  function drawParts(x, dt) {
    var s = dt / 1000;
    x.globalCompositeOperation = 'lighter';
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i]; p.t += dt; if (p.t > p.life) { S.parts.splice(i, 1); continue; }
      var a = 1 - p.t / p.life;
      if (p.k === 'puff') { p.x += p.vx * s; p.y += p.vy * s; p.vx *= 0.92; x.globalAlpha = a * 0.25; x.fillStyle = p.col; x.beginPath(); x.arc(p.x, p.y, p.sz * (2 - a), 0, TAU); x.fill(); continue; }
      p.vy += (p.k === 'star' ? 120 : 900) * s; p.x += p.vx * s; p.y += p.vy * s;
      x.globalAlpha = a;
      if (p.k === 'star') star(x, p.x, p.y, p.sz * a, p.col);
      else { x.strokeStyle = p.col; x.lineWidth = p.sz * 0.7; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); x.stroke(); }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  function drawWaves(x, dt) {
    var L = S.L;
    x.globalCompositeOperation = 'lighter';
    for (var i = S.waves.length - 1; i >= 0; i--) {
      var w = S.waves[i];
      if (w.ring) { w.t += dt; if (w.t > 500) { S.waves.splice(i, 1); continue; } var r = 30 + w.t / 500 * 170, f = 1 - w.t / 500; x.globalAlpha = f; x.strokeStyle = '#5ef2ff'; x.lineWidth = 8 * f + 2; x.save(); x.translate(w.x, w.y); x.scale(1, 0.55); x.beginPath(); x.arc(0, 0, r, 0, TAU); x.restore(); x.stroke(); x.globalAlpha = 1; continue; }
      var y = L.fy[w.f];
      var g = x.createLinearGradient(w.x - w.dir * 160, 0, w.x, 0); g.addColorStop(0, 'rgba(94,242,255,0)'); g.addColorStop(1, 'rgba(94,242,255,.7)');
      x.fillStyle = g; x.fillRect(Math.min(w.x, w.x - w.dir * 160), y - 90, 160, 86);
      x.fillStyle = '#e8ffff'; x.fillRect(w.x - 3, y - 96, 6, 92);
    }
    x.globalCompositeOperation = 'source-over';
  }
  function drawPops(x, dt) {
    x.textAlign = 'center';
    for (var i = S.pops.length - 1; i >= 0; i--) {
      var p = S.pops[i]; p.t += dt; if (p.t > 1300) { S.pops.splice(i, 1); continue; }
      var a = p.t < 1000 ? 1 : 1 - (p.t - 1000) / 300, sc = p.t < 120 ? 0.6 + p.t / 300 : 1;
      x.globalAlpha = a; x.font = font(Math.round(30 * p.sz * sc), 800);
      x.lineWidth = 6; x.strokeStyle = 'rgba(8,6,24,.8)'; x.strokeText(p.txt, p.x, p.y - p.t * 0.05); x.fillStyle = p.col; x.fillText(p.txt, p.x, p.y - p.t * 0.05);
    }
    x.globalAlpha = 1;
  }
  function drawHud(x, now) {
    var g = x.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, 'rgba(6,5,20,.92)'); g.addColorStop(1, 'rgba(6,5,20,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, 96);
    x.fillStyle = 'rgba(255,92,180,.5)'; x.fillRect(0, 95, W, 1);
    for (var i = 0; i < S.pls.length; i++) {
      var pl = S.pls[i], left = i === 0, bx = left ? 40 : W - 40, p = pl.p;
      pl.shown += (pl.score - pl.shown) * 0.2; if (Math.abs(pl.score - pl.shown) < 1) pl.shown = pl.score;
      var av = left ? bx + 34 : bx - 34;
      if (!A.drawAvatar(x, p, av, 48, 30)) { x.fillStyle = p.color; x.beginPath(); x.arc(av, 48, 30, 0, TAU); x.fill(); x.fillStyle = '#0a0818'; x.font = font(30, 800); x.textAlign = 'center'; x.fillText((p.name || '?').charAt(0).toUpperCase(), av, 59); }
      x.textAlign = left ? 'left' : 'right'; var tx = left ? bx + 80 : bx - 80;
      x.font = mfont(20, 700); x.fillStyle = p.color; x.fillText(p.name, tx, 36);
      x.font = font(40, 800); x.fillStyle = pl.lives > 0 ? '#fff' : 'rgba(255,255,255,.4)'; x.fillText(A.fmt(Math.round(pl.shown)), tx, 78);
      for (var l = 0; l < Math.min(6, pl.lives); l++) { var lx = left ? tx + 240 + l * 30 : tx - 240 - l * 30; x.fillStyle = '#e8ecff'; rr(x, lx - 11, 54, 22, 18, 6); x.fill(); x.fillStyle = p.color; x.fillRect(lx - 6, 60, 4, 5); x.fillRect(lx + 2, 60, 4, 5); }
      var h = null; for (var k = 0; k < S.heroes.length; k++) if (S.heroes[k].pl === pl) h = S.heroes[k];
      if (h && h.st !== 'sky') { var r = h.pulseCD > 0 ? 1 - h.pulseCD / 9000 : 1, mx = left ? tx + 228 : tx - 328; x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, mx, 24, 100, 10, 5); x.fill(); x.fillStyle = r >= 1 ? '#5ef2ff' : 'rgba(94,242,255,.5)'; rr(x, mx, 24, Math.max(10, 100 * r), 10, 5); x.fill(); x.font = mfont(13, 700); x.fillStyle = 'rgba(255,255,255,.5)'; x.textAlign = left ? 'left' : 'right'; x.fillText(r >= 1 ? 'PULSE READY' : 'PULSE', left ? mx + 108 : mx - 8, 34); }
    }
    x.textAlign = 'center';
    if (S.sky) {
      x.font = mfont(18, 700); x.fillStyle = '#ffd36b'; x.fillText('S K Y D R O P', W / 2, 32);
      x.font = font(40, 800); x.fillStyle = '#fff'; x.fillText(Math.max(0, Math.ceil((S.sky.len - S.sky.t) / 1000)) + 's  ·  ' + S.sky.got + ' / ' + S.sky.total, W / 2, 76);
      return;
    }
    var L = S.L, lootLeft = 0; for (var q = 0; q < L.loot.length; q++) if (!L.loot[q].got) lootLeft++;
    x.font = mfont(18, 700); x.fillStyle = S.alarm && Math.floor(now / 300) % 2 ? '#ff4d6a' : 'rgba(255,255,255,.55)'; x.fillText(S.alarm ? 'A L A R M' : 'V A U L T   ' + S.level, W / 2, 32);
    x.font = font(40, 800); x.fillStyle = '#fff'; x.fillText(lootLeft + ' loot left', W / 2, 76);
    if (S.chain > 1 && S.chainT > 0) { x.font = font(28, 800); x.fillStyle = '#ffd36b'; x.fillText('×' + S.chain + ' CHAIN', W / 2 + 250, 72); x.fillStyle = 'rgba(255,211,107,.4)'; x.fillRect(W / 2 + 180, 82, 140 * S.chainT / 2600, 4); }
    if (S.panic > 0) { x.font = font(28, 800); x.fillStyle = Math.floor(now / 150) % 2 ? '#7ab8ff' : '#ffd36b'; x.fillText('OVERCLOCK ' + Math.ceil(S.panic / 1000), W / 2 - 270, 72); }
  }
  function banner(x, big, small, col, t, dur) {
    var a = t < 250 ? t / 250 : t > dur - 300 ? Math.max(0, (dur - t) / 300) : 1, sc = t < 250 ? 0.85 + 0.15 * t / 250 : 1;
    x.globalAlpha = a * 0.75; x.fillStyle = '#05040e'; x.fillRect(0, H / 2 - 120, W, 240); x.globalAlpha = a;
    x.fillStyle = col; x.fillRect(0, H / 2 - 120, W, 3); x.fillRect(0, H / 2 + 117, W, 3);
    x.save(); x.translate(W / 2, H / 2); x.scale(sc, sc); x.textAlign = 'center';
    x.font = font(110, 800); x.fillStyle = '#fff'; x.fillText(big, 0, 20);
    x.font = mfont(28, 600); x.fillStyle = col; x.fillText(small, 0, 80);
    x.restore(); x.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ frame
  function frame(dt, x, now) {
    if (!S) return;
    if (S.phase === 'select') return drawSelect(x, now, dt);
    if (S.phase === 'intro') { S.introT -= dt; update(dt); if (S.introT <= 0) { S.phase = 'play'; A.sfx.go(); } else if (S.introT < 1100 && !S.cued) { S.cued = 1; A.sfx.count(); } }
    else if (S.phase === 'skyintro') { S.introT -= dt; updSky(dt); if (S.introT <= 0) { S.phase = 'sky'; A.sfx.go(); } }
    else if (S.phase === 'sky') updSky(dt);
    else if (S.phase === 'skyend') { S.clearT += dt; updSky(dt); if (S.clearT > 2600) newLevel(S.level + 1); }
    else if (S.phase === 'clear') { S.clearT += dt; update(dt); if (S.clearT > 3200) { if (S.level % 3 === 0) startSky(); else newLevel(S.level + 1); } }
    else if (S.phase === 'play') update(dt);
    if (!S) return;
    drawWorld(x, now, dt);
  }
  function drawWorld(x, now, dt) {
    x.save();
    if (S.shake > 0) x.translate(rnd(-S.shake, S.shake), rnd(-S.shake, S.shake));
    if (S.sky) drawSkyWorld(x, now);
    else {
      x.drawImage(S.bg, 0, 0);
      if (S.alarm) { x.globalAlpha = 0.08 + 0.06 * Math.sin(now / 200); x.fillStyle = '#ff1f4d'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
      drawGates(x, now); drawPads(x, now); drawLoot(x, now);
      for (var b = 0; b < S.bots.length; b++) drawBot(x, S.bots[b], now);
      for (var i = 0; i < S.heroes.length; i++) drawHero(x, S.heroes[i], now);
      drawWaves(x, dt);
    }
    drawParts(x, dt); drawPops(x, dt);
    x.restore();
    if (S.flash > 0) { x.globalAlpha = S.flash * 0.35; x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
    drawHud(x, now);
    if (S.phase === 'intro') banner(x, 'Vault ' + S.level, S.L.F + ' floors  ·  ' + S.bots.length + ' Sentries  ·  ' + S.L.total + ' pieces of loot', '#ff5cb4', 2300 - S.introT, 2300);
    if (S.phase === 'clear') banner(x, 'Vault cracked', 'Time bonus  +' + A.fmt(S.tally.time), '#ffd36b', S.clearT, 3200);
    if (S.phase === 'skyintro') banner(x, 'Skydrop', 'Bonus round  ·  steer with ◀ ▶  ·  grab everything in the sky', '#ffd36b', 2200 - S.introT, 2200);
    if (S.phase === 'skyend') banner(x, S.sky.got >= S.sky.total ? 'Perfect!' : S.sky.got + ' of ' + S.sky.total, 'Next vault coming up', '#8dff8a', S.clearT, 2600);
  }
  function drawSkyWorld(x, now) {
    x.drawImage(S.skyBg, 0, 0);
    var sk = S.sky, dip = 0;
    for (var i = 0; i < S.heroes.length; i++) dip = Math.max(dip, S.heroes[i].sq * 22);
    x.strokeStyle = '#4dffb0'; x.lineWidth = 8; x.beginPath(); x.moveTo(120, 975); x.quadraticCurveTo(W / 2, 975 + dip * 2, W - 120, 975); x.stroke();
    x.globalCompositeOperation = 'lighter'; addGlow(x, '#4dffb0', W / 2, 985, 420, 0.18); x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#3a3566'; x.fillRect(110, 970, 14, 40); x.fillRect(W - 124, 970, 14, 40);
    for (var c = 0; c < sk.coins.length; c++) {
      var co = sk.coins[c]; if (co.got) continue;
      var y = co.y + Math.sin(now / 350 + co.t) * 6;
      if (co.k === 'gem') { x.globalCompositeOperation = 'lighter'; addGlow(x, '#7af7ff', co.x, y, 40, 0.4); x.globalCompositeOperation = 'source-over'; x.drawImage(lootImg('gem'), co.x - 24, y - 26, 48, 48); }
      else {
        var w = Math.abs(Math.cos(now / 300 + co.t)) * 16 + 3;
        x.globalCompositeOperation = 'lighter'; addGlow(x, '#ffd36b', co.x, y, 30, 0.35); x.globalCompositeOperation = 'source-over';
        var gg = x.createLinearGradient(co.x - w, y - 18, co.x + w, y + 18); gg.addColorStop(0, '#fff3b0'); gg.addColorStop(1, '#e0a010');
        x.fillStyle = gg; x.save(); x.translate(co.x, y); x.scale(w / 18, 1); x.beginPath(); x.arc(0, 0, 18, 0, TAU); x.restore(); x.fill();
      }
    }
    for (var h = 0; h < S.heroes.length; h++) drawHero(x, S.heroes[h], now);
  }

  // ------------------------------------------------------------------ select screen (1 or 2 players)
  var demo = null;
  function drawSelect(x, now, dt) {
    if (!CITYM) CITYM = paintCity(true);
    x.drawImage(CITYM, 0, 0);
    x.fillStyle = 'rgba(5,4,14,.45)'; x.fillRect(0, 0, W, H);
    S.t += dt;
    x.textAlign = 'center'; x.globalCompositeOperation = 'lighter'; addGlow(x, '#ff5cb4', W / 2, 190, 420, 0.25); x.globalCompositeOperation = 'source-over';
    x.font = font(140, 800); x.lineWidth = 10; x.strokeStyle = '#2a0f3a'; x.strokeText('SPRINGHEIST', W / 2, 230);
    var lg = x.createLinearGradient(0, 120, 0, 240); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#ff8fd0'); x.fillStyle = lg; x.fillText('SPRINGHEIST', W / 2, 230);
    x.font = mfont(26, 600); x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText('Bounce through the Vault Tower. Grab the loot. Don’t get scanned.', W / 2, 290);
    if (!demo) demo = [{ x: 0, y: 760, vy: -900, sq: 0, face: 1, st: 'sky', run: 0, flip: 0, blink: 0 }, { x: 0, y: 760, vy: -500, sq: 0, face: -1, st: 'sky', run: 0, flip: 0, blink: 0 }];
    var list = A.profiles(), s = dt / 1000;
    for (var i = 0; i < 2; i++) {
      var d = demo[i], cx = i === 0 ? (S.picks.length > 1 ? W / 2 - 380 : W / 2) : W / 2 + 380;
      if (i === 1 && S.picks.length < 2) {
        x.font = mfont(24, 600); x.fillStyle = 'rgba(255,255,255,.45)'; x.fillText('Two players: press A on a second controller or phone to join as Zap', W / 2, 1000);
        continue;
      }
      d.x = cx; d.vy += 1500 * s; d.y += d.vy * s; if (d.y >= 790) { d.y = 790; d.vy = -640; d.sq = 1; d.flip = 0.0001; }
      if (d.flip > 0) { d.flip += s * 1.6; if (d.flip >= 1) d.flip = 0; } if (d.sq > 0) d.sq = Math.max(0, d.sq - dt / 220);
      d.blink -= dt; if (d.blink < -2800) d.blink = 140;
      var p = list[S.picks[i].idx]; d.col = p.color; d.inv = 0; d.scarf = null;
      x.strokeStyle = '#4dffb0'; x.lineWidth = 6; x.beginPath(); x.moveTo(cx - 90, 798); x.quadraticCurveTo(cx, 798 + d.sq * 40, cx + 90, 798); x.stroke();
      x.globalCompositeOperation = 'lighter'; addGlow(x, '#4dffb0', cx, 802, 120, 0.25); x.globalCompositeOperation = 'source-over';
      drawHero(x, d, now, 1.6);
      if (!A.drawAvatar(x, p, cx, 372, 44)) { x.fillStyle = p.color; x.beginPath(); x.arc(cx, 372, 44, 0, TAU); x.fill(); x.fillStyle = '#0a0818'; x.font = font(44, 800); x.fillText((p.name || '?').charAt(0).toUpperCase(), cx, 388); }
      x.textAlign = 'center';
      x.font = font(56, 800); x.fillStyle = p.color; x.fillText('‹  ' + p.name + '  ›', cx, 890);
      x.font = mfont(22, 600); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText('Best ' + A.fmt(p.sh ? p.sh.best : 0) + (p.sh && p.sh.level ? '  ·  vault ' + p.sh.level : ''), cx, 930);
      x.font = mfont(18, 700); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillText(i === 0 ? 'PLAYER 1  ·  ZIP' : 'PLAYER 2  ·  ZAP', cx, 448);
    }
    x.font = mfont(22, 600); x.fillStyle = 'rgba(255,255,255,.5)';
    x.fillText('◀ ▶ choose player  ·  OK start  ·  ▲ how to play  ·  BACK arcade', W / 2, 1050);
  }
  function howTo() {
    A.menu({ eyebrow: 'Springheist', title: 'How to play', sub: 'Hold ◀ ▶ to run. Run into a shaft to drop onto its trampoline.<br>While bouncing you are shielded. Hold ◀ or ▶ to hop off at the next floor you pass.<br>A trampoline tears after 4 bounces in a row. Hop off and it springs back.<br>Next to a blue gate, OK blasts it outward and stuns every Sentry in its path.<br>Anywhere else, OK fires a Pulse around you. Grab loot fast to build a chain.<br>Gold core: the Sentries panic, so catch them! Every third vault: Skydrop bonus.', opts: [
      { label: 'Got it', go: true, run: function () { A.closeModal(); } }], back: function () { A.closeModal(); } });
  }

  // ------------------------------------------------------------------ input
  function input(ev) {
    if (!S) return; var a = ev.act;
    if (S.phase === 'select') {
      if (ev.repeat) return;
      var n = A.profiles().length, who = -1;
      if (S.picks.length > 1 && S.picks[1].src === ev.src) who = 1;
      else if (S.picks[0].src == null || S.picks[0].src === ev.src || ev.src === 'remote') who = 0;
      if (who < 0) {
        if (S.picks.length < 2 && (a === 'A' || a === 'X' || a === 'START')) { S.picks.push({ src: ev.src, idx: (S.picks[0].idx + 1) % n }); A.sfx.join(); }
        return;
      }
      var pk = S.picks[who];
      if (who === 0 && pk.src == null && ev.src !== 'remote' && (a === 'L' || a === 'R')) pk.src = ev.src;
      if (a === 'L') { pk.idx = (pk.idx + n - 1) % n; A.sfx.nav(); }
      else if (a === 'R') { pk.idx = (pk.idx + 1) % n; A.sfx.nav(); }
      else if (a === 'U' || a === 'Y') { if (who === 0) howTo(); }
      else if (a === 'A' || a === 'X' || a === 'START') {
        if (who !== 0) return;
        if (S.picks.length > 1) { if (S.picks[1].idx === S.picks[0].idx) S.picks[1].idx = (S.picks[1].idx + 1) % n; S.picks[0].src = S.picks[0].src || ev.src; }
        A.sfx.ok(); begin();
      }
      else if (a === 'BACK' || a === 'B') { if (who === 1) { S.picks.pop(); A.sfx.back(); } else A.exitGame('home'); }
      return;
    }
    if (a === 'BACK' || a === 'START') { if (S.phase !== 'over') pause(); return; }
    if (!S.heroes) return;
    for (var i = 0; i < S.heroes.length; i++) {
      var h = S.heroes[i]; if (!heroSrcOK(h, ev)) continue;
      if (a === 'L' || a === 'R') { var d = a === 'L' ? -1 : 1; if (h.st === 'shaft') { if (!(ev.repeat && h.lock === d)) { h.lock = 0; h.intent = d; h.intentT = 420; h.face = d; } } else h.face = d; }
      else if (!ev.repeat && (a === 'A' || a === 'X' || a === 'Y' || a === 'U')) action(h);
      if (S.heroes.length === 1) break;
    }
  }
  function pause() {
    A.musicStop();
    var resume = function () { A.closeModal(); A.music(SONG, 124); };
    A.menu({ eyebrow: 'Springheist', title: 'Paused', sub: 'Hold ◀ ▶ to run · in a shaft, hold ◀ ▶ to hop off<br>OK by a gate blasts it · OK anywhere else fires a Pulse', opts: [
      { label: 'Resume', go: true, run: resume }].concat(A.soundOpts ? A.soundOpts() : []).concat([
      { label: 'How to play', run: howTo },
      { label: 'Quit to the arcade', run: function () { A.exitGame('home'); } }]), back: resume });
  }
  function gameOver() {
    S.phase = 'over'; A.musicStop(); play('over');
    var marks = [], best = -1, title = '';
    for (var i = 0; i < S.pls.length; i++) {
      var pl = S.pls[i], p = pl.p; if (!p.sh) p.sh = { best: 0, level: 0, games: 0 };
      if (pl.score > (p.sh.best || 0)) { p.sh.best = pl.score; marks.push(p.id); }
      p.sh.level = Math.max(p.sh.level || 0, S.level); p.sh.games = (p.sh.games || 0) + 1;
      if (pl.score > best) { best = pl.score; title = (S.pls.length > 1 ? p.name + ' wins with ' : '') + A.fmt(pl.score) + ' points'; }
    }
    A.saveProfiles();
    var me = S;
    setTimeout(function () {
      if (S !== me) return;
      A.menu({ wide: true, eyebrow: 'Springheist · game over', title: (marks.length ? 'New best! ' : '') + title, sub: 'You reached vault ' + S.level, body: A.boardHtml ? A.boardHtml('springheist', marks, 5) : '', opts: [
        { label: 'Play again', go: true, run: function () { A.closeModal(); var pk = S.picks; S = { picks: pk }; begin(); } },
        { label: 'Back to the arcade', run: function () { A.exitGame('home'); } }], back: function () { A.exitGame('home'); } });
    }, 1600);
  }
  function stop() { S = null; demo = null; A.musicStop(); }

  // ------------------------------------------------------------------ the home-screen card
  function card(slot) {
    var d = { x: 0, y: 0, vy: -700, sq: 0, face: 1, st: 'sky', run: 0, flip: 0, blink: 0, col: '#7af7ff', inv: 0 }, last = 0;
    slot.draw = function (x, t, sel, w) {
      var h = 560, dt = Math.min(50, last ? t - last : 16); last = t; x.clearRect(0, 0, w, h);
      var g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(120,30,110,0.5)'); g.addColorStop(1, 'rgba(10,10,30,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      var cx = w / 2, base = 250, s = dt / 1000;
      x.fillStyle = 'rgba(94,242,255,0.07)'; x.fillRect(cx - 50, 0, 100, base + 10);
      x.fillStyle = '#ff5cb4'; x.fillRect(0, 90, cx - 50, 4); x.fillRect(cx + 50, 90, w, 4); x.fillRect(0, 175, cx - 50, 4); x.fillRect(cx + 50, 175, w, 4);
      d.x = cx; d.vy += 1500 * s; d.y += d.vy * s; if (d.y >= base) { d.y = base; d.vy = -720; d.sq = 1; d.flip = 0.0001; }
      if (d.flip > 0) { d.flip += s * 1.7; if (d.flip >= 1) d.flip = 0; } if (d.sq > 0) d.sq = Math.max(0, d.sq - dt / 220);
      d.blink -= dt; if (d.blink < -2800) d.blink = 140;
      x.strokeStyle = '#4dffb0'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx - 44, base + 4); x.quadraticCurveTo(cx, base + 4 + d.sq * 30, cx + 44, base + 4); x.stroke();
      x.drawImage(lootImg('gem'), cx + 80, 40, 44, 44); x.drawImage(lootImg('crown'), cx - 130, 125, 44, 44);
      drawHero(x, d, t, 0.9);
    };
  }
  A.register('springheist', { debug: function () { return S; }, start: start, frame: frame, input: input, stop: stop, card: card });
})();
