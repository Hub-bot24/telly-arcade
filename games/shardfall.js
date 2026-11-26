/*
 * SHARDFALL: falling crystals for 1 to 4 players, on one TV.
 *
 * The twists:
 *  - Collapse: every line you clear charges your Well. When it is full, press Y (play/pause on the remote) and every
 *    crystal on your board drops straight down, filling the gaps. Any lines that completes shatter in a chain,
 *    and each chain step counts more. Saving the Collapse for a messy board is the trick.
 *  - Battle: with 2 or more players, clears send cracked obsidian rows to a rival. You can see the attack fly across
 *    the screen, and clearing lines before it lands cancels it out. Last board standing wins.
 *  - Shatter (4 lines), T-twists, combos, back-to-back and a Flawless (empty board) bonus.
 */
(function () {
  'use strict';
  var A = window.ARCADE; if (!A) return;
  var W = 1920, H = 1080, COLS = 10, ROWS = 22, HID = 2;

  // ------------------------------------------------------------------ pieces
  var SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
  };
  var TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  var CIDX = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
  // crystal palette: ice, amber, amethyst, jade, rose, sapphire, ember, obsidian
  var PAL = [null, '#5ef2ff', '#ffc94a', '#b27bff', '#57f0a0', '#ff5c8a', '#4f86ff', '#ff8a3d', '#3a4152'];
  function rotCW(m) { var n = m.length, r = []; for (var i = 0; i < n; i++) { r.push([]); for (var j = 0; j < n; j++) r[i].push(m[n - 1 - j][i]); } return r; }
  var ROT = {};
  for (var t in SHAPES) if (SHAPES.hasOwnProperty(t)) { ROT[t] = [SHAPES[t]]; for (var k = 1; k < 4; k++) ROT[t].push(rotCW(ROT[t][k - 1])); }
  // wall kicks (x right, y down)
  var KJ = { '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]] };
  var KI = { '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]], '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]], '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]] };

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  if (!Math.imul) Math.imul = function (a, b) { var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff; return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0); };

  // speed: ms per row by level
  var SPEED = [0, 900, 780, 660, 550, 450, 365, 290, 225, 170, 128, 98, 78, 62, 50, 40, 32, 26, 21, 17, 14];
  function speed(lv) { return SPEED[Math.min(lv, SPEED.length - 1)] || 14; }
  var LOCK = 520, LOCK_RESETS = 15, CLEAR_MS = 330, COLLAPSE_MS = 520;

  // ------------------------------------------------------------------ colours + sprites
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(hex, to, a) { var c = rgb(hex), d = to === 'w' ? [255, 255, 255] : [0, 0, 0]; return 'rgb(' + Math.round(c[0] + (d[0] - c[0]) * a) + ',' + Math.round(c[1] + (d[1] - c[1]) * a) + ',' + Math.round(c[2] + (d[2] - c[2]) * a) + ')'; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function rr(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r); x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h); x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r); x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py); x.closePath(); }
  var spriteCache = {};
  function sprites(c) {
    if (spriteCache[c]) return spriteCache[c];
    var out = { cell: [], glow: [], ghost: [], c: c };
    for (var i = 1; i < PAL.length; i++) {
      var col = PAL[i], s = document.createElement('canvas'); s.width = s.height = c; var x = s.getContext('2d');
      var r = Math.max(2, c * 0.16), g = x.createLinearGradient(0, 0, c, c);
      if (i === 8) { g.addColorStop(0, '#5b6478'); g.addColorStop(1, '#1d222e'); }
      else { g.addColorStop(0, mix(col, 'w', 0.42)); g.addColorStop(0.45, col); g.addColorStop(1, mix(col, 'k', 0.5)); }
      rr(x, 1, 1, c - 2, c - 2, r); x.fillStyle = g; x.fill();
      // facets: a crystal cut, light from the top-left
      x.save(); rr(x, 1, 1, c - 2, c - 2, r); x.clip();
      x.fillStyle = 'rgba(255,255,255,' + (i === 8 ? 0.06 : 0.22) + ')'; x.beginPath(); x.moveTo(1, 1); x.lineTo(c - 1, 1); x.lineTo(c * 0.62, c * 0.38); x.lineTo(c * 0.38, c * 0.38); x.closePath(); x.fill();
      x.fillStyle = 'rgba(255,255,255,' + (i === 8 ? 0.03 : 0.1) + ')'; x.beginPath(); x.moveTo(1, 1); x.lineTo(c * 0.38, c * 0.38); x.lineTo(c * 0.38, c * 0.62); x.lineTo(1, c - 1); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); x.moveTo(c - 1, c - 1); x.lineTo(1, c - 1); x.lineTo(c * 0.38, c * 0.62); x.lineTo(c * 0.62, c * 0.62); x.closePath(); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.beginPath(); x.moveTo(c - 1, 1); x.lineTo(c - 1, c - 1); x.lineTo(c * 0.62, c * 0.62); x.lineTo(c * 0.62, c * 0.38); x.closePath(); x.fill();
      var sp = x.createRadialGradient(c * 0.42, c * 0.42, 0, c * 0.42, c * 0.42, c * 0.4); sp.addColorStop(0, 'rgba(255,255,255,' + (i === 8 ? 0.05 : 0.38) + ')'); sp.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = sp; x.fillRect(0, 0, c, c);
      if (i === 8) { x.strokeStyle = 'rgba(255,120,140,.28)'; x.lineWidth = Math.max(1, c * 0.04); x.beginPath(); x.moveTo(c * 0.2, c * 0.3); x.lineTo(c * 0.45, c * 0.5); x.lineTo(c * 0.4, c * 0.75); x.moveTo(c * 0.45, c * 0.5); x.lineTo(c * 0.8, c * 0.42); x.stroke(); }
      x.restore();
      rr(x, 1.5, 1.5, c - 3, c - 3, r); x.lineWidth = 1.5; x.strokeStyle = i === 8 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.55)'; x.stroke();
      out.cell[i] = s;
      // glow (soft halo, drawn additively under the falling piece)
      var gs = document.createElement('canvas'), gw = c * 3; gs.width = gs.height = gw; var gx = gs.getContext('2d');
      var gg = gx.createRadialGradient(gw / 2, gw / 2, c * 0.2, gw / 2, gw / 2, gw / 2); gg.addColorStop(0, rgba(col, 0.55)); gg.addColorStop(0.4, rgba(col, 0.18)); gg.addColorStop(1, rgba(col, 0));
      gx.fillStyle = gg; gx.fillRect(0, 0, gw, gw); out.glow[i] = gs;
      // ghost
      var hs = document.createElement('canvas'); hs.width = hs.height = c; var hx = hs.getContext('2d');
      rr(hx, 2.5, 2.5, c - 5, c - 5, r); hx.fillStyle = rgba(col, 0.1); hx.fill(); hx.lineWidth = 2; hx.strokeStyle = rgba(col, 0.6); hx.stroke();
      out.ghost[i] = hs;
    }
    spriteCache[c] = out; return out;
  }

  // ------------------------------------------------------------------ music: dark synth pulse in A minor
  var CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  var MUSIC = { bpm: 108, intensity: 0, track: 'mu_sf_a', layer: 'mu_sf_b', play: function (step, t, spb, bus, a) {
    var bar = Math.floor(step / 16) % 4, s = step % 16, ch = CHORDS[bar], n = A.note, m = A.mtone, I = MUSIC.intensity;
    if (s % 2 === 0) m(a, bus, t, n(ch[0] - 24 + (s === 6 || s === 14 ? 12 : 0)), spb * 1.7, 'sawtooth', 0.22, 520 + I * 500);
    var arp = [0, 1, 2, 1, 2, 0, 1, 2], tone = ch[arp[s % 8]] + 12 + (s >= 8 && bar % 2 ? 12 : 0);
    if (s % 1 === 0 && (I > 0.3 || s % 2 === 0)) m(a, bus, t, n(tone), spb * 0.9, 'square', 0.035 + I * 0.02, 1600 + I * 1600);
    if (s % 4 === 0) { var o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25); }
    if (s % 4 === 2 || (I > 0.5 && s % 2 === 1)) m(a, bus, t, 7000 + Math.random() * 2000, 0.03, 'square', 0.012, 9000);
    if (s === 0) m(a, bus, t, n(ch[2] + 12), spb * 14, 'triangle', 0.03, 1200);
  } };

  // ------------------------------------------------------------------ game state
  var G = null;
  function Board(pl, idx, n, seed, solo) {
    var p = A.profile(pl.pid);
    this.pl = pl; this.p = p; this.idx = idx; this.solo = solo; this.color = p.color;
    this.rand = rng(seed); this.bag = []; this.queue = [];
    this.grid = []; for (var r = 0; r < ROWS; r++) this.grid.push(emptyRow());
    this.hold = null; this.canHold = true;
    this.score = 0; this.shownScore = 0; this.lines = 0; this.level = 1; this.combo = -1; this.b2b = false;
    this.well = 0; this.wellMax = solo ? 10 : 8; this.incoming = []; this.sent = 0;
    this.alive = true; this.place = 0; this.dirty = true;
    this.fall = 0; this.lockT = 0; this.lockResets = 0; this.lastRot = false; this.lastKick = 0;
    this.anim = null; this.pops = []; this.shake = 0; this.nudge = 0; this.flash = 0; this.lockFlash = null; this.trail = null; this.deadT = 0;
    this.stats = { pieces: 0, quads: 0, tspins: 0, maxCombo: 0, chains: 0 };
    for (var i = 0; i < 6; i++) this.queue.push(this.draw());
  }
  function emptyRow() { var r = []; for (var c = 0; c < COLS; c++) r.push(0); return r; }
  var BP = Board.prototype;
  BP.draw = function () { if (!this.bag.length) { this.bag = TYPES.slice(0); for (var i = 6; i > 0; i--) { var j = Math.floor(this.rand() * (i + 1)), t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t; } } return this.bag.pop(); };
  BP.fits = function (t, r, x, y) {
    var m = ROT[t][r];
    for (var i = 0; i < m.length; i++) for (var j = 0; j < m.length; j++) if (m[i][j]) {
      var gx = x + j, gy = y + i; if (gx < 0 || gx >= COLS || gy >= ROWS) return false; if (gy >= 0 && this.grid[gy][gx]) return false;
    }
    return true;
  };
  BP.spawn = function (type) {
    var t = type || this.queue.shift(); if (!type) this.queue.push(this.draw());
    var nn = ROT[t][0].length, x = t === 'O' ? 4 : 3, y = t === 'I' ? -1 : 0;
    this.cur = { t: t, r: 0, x: x, y: y };
    if (!this.fits(t, 0, x, y)) { this.die(); return; }
    if (this.fits(t, 0, x, y + 1)) this.cur.y++;
    this.fall = 0; this.lockT = 0; this.lockResets = 0; this.lastRot = false;
    this.stats.pieces++;
  };
  BP.move = function (dx) {
    var c = this.cur; if (!c || this.anim) return false;
    if (this.fits(c.t, c.r, c.x + dx, c.y)) { c.x += dx; this.lastRot = false; this.touch(); sfx('move'); return true; }
    return false;
  };
  BP.rotate = function (d) {
    var c = this.cur; if (!c || this.anim || c.t === 'O') return;
    var nr = (c.r + d + 4) % 4, tbl = (c.t === 'I' ? KI : KJ)[c.r + '' + nr];
    for (var i = 0; i < tbl.length; i++) {
      var kx = tbl[i][0], ky = tbl[i][1];
      if (this.fits(c.t, nr, c.x + kx, c.y + ky)) { c.x += kx; c.y += ky; c.r = nr; this.lastRot = true; this.lastKick = i; this.touch(); sfx('rotate'); return; }
    }
  };
  BP.touch = function () { if (this.grounded() && this.lockResets < LOCK_RESETS) { this.lockT = 0; this.lockResets++; } };
  BP.grounded = function () { var c = this.cur; return c && !this.fits(c.t, c.r, c.x, c.y + 1); };
  BP.ghostY = function () { var c = this.cur, y = c.y; while (this.fits(c.t, c.r, c.x, y + 1)) y++; return y; };
  BP.soft = function () { var c = this.cur; if (!c || this.anim) return; if (this.fits(c.t, c.r, c.x, c.y + 1)) { c.y++; this.fall = 0; this.addScore(1); this.lastRot = false; } };
  BP.hard = function () {
    var c = this.cur; if (!c || this.anim) return;
    var y0 = c.y, gy = this.ghostY(); this.addScore(2 * (gy - y0));
    if (gy > y0) this.lastRot = false;
    this.trail = { t: c.t, r: c.r, x: c.x, y0: y0, y1: gy, a: 1 };
    c.y = gy; this.nudge = Math.min(14, 4 + (gy - y0) * 0.7); sfx('hard', gy - y0); this.lock();
  };
  BP.doHold = function () {
    if (!this.cur || this.anim || !this.canHold) return;
    var t = this.cur.t; this.canHold = false; sfx('hold');
    if (this.hold) { var h = this.hold; this.hold = t; this.spawn(h); } else { this.hold = t; this.spawn(); }
  };
  BP.addScore = function (n) { this.score += n; };
  BP.tspin = function () {
    var c = this.cur; if (c.t !== 'T' || !this.lastRot) return 0;
    var cx = c.x + 1, cy = c.y + 1, n = 0, self = this;
    function occ(x, y) { return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && self.grid[y][x]); }
    var corners = [[cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]];
    for (var i = 0; i < 4; i++) if (occ(corners[i][0], corners[i][1])) n++;
    if (n < 3) return 0;
    // "front" corners decide full vs mini
    var front = [[0, 1], [1, 3], [3, 2], [2, 0]][c.r], f = (occ(corners[front[0]][0], corners[front[0]][1]) ? 1 : 0) + (occ(corners[front[1]][0], corners[front[1]][1]) ? 1 : 0);
    return f === 2 || this.lastKick === 4 ? 2 : 1;
  };
  BP.lock = function () {
    var c = this.cur, m = ROT[c.t][c.r], ts = this.tspin(), above = true, cells = [];
    for (var i = 0; i < m.length; i++) for (var j = 0; j < m.length; j++) if (m[i][j]) {
      var gy = c.y + i; if (gy >= HID) above = false;
      if (gy >= 0) { this.grid[gy][c.x + j] = CIDX[c.t]; cells.push([c.x + j, gy]); }
    }
    this.lockFlash = { cells: cells, a: 1 };
    this.cur = null; this.canHold = true; this.dirty = true;
    if (above) { this.die(); return; }
    sfx('lock');
    var full = this.fullRows();
    if (full.length) this.startClear(full, ts, 0);
    else { this.combo = -1; if (ts) this.pop(ts === 2 ? 'T-TWIST' : 'T-TWIST MINI', '', PAL[3]); this.addScore(ts === 2 ? 400 * this.level : ts ? 100 * this.level : 0); this.takeGarbage(); this.spawn(); }
  };
  BP.fullRows = function () { var f = []; for (var r = 0; r < ROWS; r++) { var ok = true; for (var c = 0; c < COLS; c++) if (!this.grid[r][c]) { ok = false; break; } if (ok) f.push(r); } return f; };
  BP.startClear = function (rows, ts, chain) {
    this.anim = { kind: 'clear', rows: rows, t: 0, ts: ts, chain: chain };
    var L = this.layout, s = L.c;
    for (var i = 0; i < rows.length; i++) for (var c = 0; c < COLS; c++) {
      var col = PAL[this.grid[rows[i]][c]] || '#fff';
      for (var k = 0; k < (rows.length >= 4 ? 3 : 2); k++) shard(L.bx + c * s + s / 2, L.by + (rows[i] - HID) * s + s / 2, col, rows.length >= 4 ? 1.6 : 1);
    }
    var n = rows.length;
    if (hi()) {
      for (var hr = 0; hr < rows.length; hr++) {
        var yy = L.by + (rows[hr] - HID) * s + s / 2;
        for (var hc = 0; hc < COLS; hc += (n >= 4 ? 1 : 2)) cube(L.bx + hc * s + s / 2, yy, PAL[this.grid[rows[hr]][hc]] || '#ffffff', n >= 4 ? 1.5 : 1);
        G.beams.push({ x: L.bx, y: yy, w: L.bw, h: s * 0.5, t: 0, col: n >= 4 ? '#ffffff' : this.color || '#7af7ff' });
      }
      G.warp = Math.max(G.warp || 0, n >= 4 ? 1 : n * 0.2); if (n >= 4 || ts === 2) G.punch = 1;
    }
    sfx(n >= 4 ? 'quad' : 'clear', n);
    if (n >= 4 || ts === 2) { this.shake = 18; ring(L.bx + L.bw / 2, L.by + L.bh / 2, n >= 4 ? '#ffffff' : PAL[3]); }
    else this.shake = 4 + n * 2;
  };
  BP.finishClear = function () {
    var an = this.anim, rows = an.rows, n = rows.length, ts = an.ts, chain = an.chain;
    for (var i = 0; i < rows.length; i++) { this.grid.splice(rows[i], 1); this.grid.unshift(emptyRow()); }
    this.dirty = true; this.anim = null;
    var lvl = this.level, pts = 0, atk = 0, title = '', diff = n >= 4 || ts === 2;
    if (chain) { pts = n * 250 * (chain + 1) * lvl; atk = n + chain * 2; title = chain === 1 ? 'COLLAPSE CLEAR' : 'CHAIN ×' + chain; }
    else if (ts === 2) { pts = [400, 800, 1200, 1600][n] * lvl; atk = [0, 2, 4, 6][n]; title = 'T-TWIST ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n]; this.stats.tspins++; }
    else { pts = [0, 100, 300, 500, 800][Math.min(n, 4)] * lvl; atk = [0, 0, 1, 2, 4][Math.min(n, 4)]; title = ['', '', 'DOUBLE', 'TRIPLE', 'SHATTER'][Math.min(n, 4)]; if (ts === 1) { pts += 200 * lvl; title = 'T-TWIST MINI'; } if (n >= 4) this.stats.quads++; }
    if (!chain) {
      this.combo++;
      if (diff) { if (this.b2b) { pts = Math.round(pts * 1.5); atk += 1; title += ' · BACK TO BACK'; } this.b2b = true; } else this.b2b = false;
      if (this.combo > 0) { pts += 50 * this.combo * lvl; atk += [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5][Math.min(this.combo, 10)]; }
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    }
    var empty = true; for (var r = 0; r < ROWS && empty; r++) for (var c = 0; c < COLS; c++) if (this.grid[r][c]) { empty = false; break; }
    if (empty) { pts += 3000 * lvl; atk += 6; this.pop('FLAWLESS', '+' + A.fmt(3000 * lvl), '#ffffff', 1.3); sfx('flawless'); }
    this.addScore(pts);
    this.lines += n;
    if (!chain) this.well = Math.min(this.wellMax, this.well + n);
    if (this.well >= this.wellMax && !this.wellReady) { this.wellReady = true; sfx('wellready'); this.pop('COLLAPSE READY', A.isPad(this.pl.src) ? 'press Y' : 'press ▶❚❚', PAL[3], 0.8); }
    if (title) this.pop(title, (this.combo > 0 && !chain ? 'COMBO ×' + (this.combo + 1) + '  ' : '') + '+' + A.fmt(pts), n >= 4 ? '#ffffff' : chain ? PAL[3] : this.color, n >= 4 || chain ? 1.25 : 1);
    else if (this.combo > 0) this.pop('COMBO ×' + (this.combo + 1), '+' + A.fmt(pts), this.color, 0.85);
    // levels: every 10 lines in solo; battle speeds up on a timer
    if (this.solo) { var nl = Math.floor(this.lines / 10) + G.startLevel; if (nl > this.level) { this.level = nl; this.levelUp(); } }
    // cancel incoming first, the rest flies at a rival
    while (atk > 0 && this.incoming.length) { var take = Math.min(atk, this.incoming[0].n); this.incoming[0].n -= take; atk -= take; if (!this.incoming[0].n) this.incoming.shift(); }
    if (atk > 0 && !this.solo) attack(this, atk);
    // after a Collapse, settle again and look for more lines
    if (this.chaining) {
      var moved = this.settle();
      if (moved) return;
      var more = this.fullRows(); if (more.length) { this.stats.chains = Math.max(this.stats.chains, chain + 1); this.startClear(more, 0, chain + 1); return; }
      this.chaining = false;
    }
    if (!this.cur && !this.anim) { this.takeGarbage(); this.spawn(); }
  };
  BP.levelUp = function () { this.pop('LEVEL ' + this.level, '', '#ffffff', 1.1); sfx('level'); ring(this.layout.bx + this.layout.bw / 2, this.layout.by + this.layout.bh / 2, this.color); if (G.stages) checkStage(); if (G.music) A.musicTempo(G.stages ? stageTempo(topLevel()) : Math.min(156, 104 + this.level * 4)); };
  // Collapse: every crystal drops straight down
  BP.collapse = function () {
    if (!this.wellReady || this.anim || !this.cur) return;
    this.well = 0; this.wellReady = false; this.chaining = true; this.chainN = 0;
    this.cur = null; this.canHold = true;
    sfx('collapse'); this.shake = 14; ring(this.layout.bx + this.layout.bw / 2, this.layout.by + this.layout.bh, PAL[3], true);
    this.pop('COLLAPSE', '', PAL[3], 1.35);
    if (!this.settle()) { var f = this.fullRows(); if (f.length) this.startClear(f, 0, (this.chainN = 1)); else { this.chaining = false; this.spawn(); } }
  };
  BP.settle = function () {
    var drops = [], any = false;
    for (var c = 0; c < COLS; c++) {
      var w = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) if (this.grid[r][c]) { if (w !== r) { drops.push({ c: c, from: r, to: w, v: this.grid[r][c] }); any = true; } w--; }
    }
    if (!any) return false;
    for (var i = 0; i < drops.length; i++) this.grid[drops[i].from][drops[i].c] = 0;
    this.anim = { kind: 'settle', drops: drops, t: 0 }; this.dirty = true;
    return true;
  };
  BP.finishSettle = function () {
    var d = this.anim.drops; for (var i = 0; i < d.length; i++) this.grid[d[i].to][d[i].c] = d[i].v;
    this.anim = null; this.dirty = true; sfx('settle');
    var f = this.fullRows(); var ch = this.lastChain || 0;
    if (f.length) { this.stats.chains = Math.max(this.stats.chains, 1); this.startClear(f, 0, (this.chainN = (this.chainN || 0) + 1)); return; }
    this.chaining = false; this.chainN = 0;
    if (!this.cur) { this.takeGarbage(); this.spawn(); }
  };
  BP.takeGarbage = function () {
    var now = G.time, n = 0;
    while (this.incoming.length && this.incoming[0].at <= now) {
      var g = this.incoming.shift(), hole = Math.floor(this.rand() * COLS);
      for (var i = 0; i < g.n; i++) {
        if (this.rand() < 0.3) hole = Math.floor(this.rand() * COLS);
        var row = []; for (var c = 0; c < COLS; c++) row.push(c === hole ? 0 : 8);
        this.grid.shift(); this.grid.push(row); n++;
      }
    }
    if (n) { this.dirty = true; this.shake = 6 + n; sfx('garbage', n); this.nudge = -8; }
  };
  BP.die = function () {
    this.alive = false; this.cur = null; this.anim = null; this.deadT = 0; this.dirty = true;
    G.ko++; this.place = G.boards.length - G.ko + 1;
    sfx('ko'); this.shake = 20;
    var L = this.layout; for (var i = 0; i < 40; i++) shard(L.bx + Math.random() * L.bw, L.by + Math.random() * L.bh, this.color, 1.4);
  };
  BP.pop = function (txt, sub, col, size) { this.pops.push({ txt: txt, sub: sub || '', col: col || '#fff', s: size || 1, t: 0, dur: 1500 }); if (this.pops.length > 3) this.pops.shift(); };
  BP.update = function (dt) {
    if (this.shownScore < this.score) this.shownScore = Math.min(this.score, this.shownScore + Math.max(1, (this.score - this.shownScore) * 0.18));
    this.shake *= 0.86; this.nudge *= 0.82; if (this.trail) { this.trail.a -= dt / 260; if (this.trail.a <= 0) this.trail = null; }
    if (this.lockFlash) { this.lockFlash.a -= dt / 220; if (this.lockFlash.a <= 0) this.lockFlash = null; }
    for (var i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > this.pops[i].dur) this.pops.splice(i, 1); }
    if (!this.alive) { this.deadT += dt; return; }
    if (this.anim) {
      this.anim.t += dt;
      if (this.anim.kind === 'clear' && this.anim.t >= CLEAR_MS) this.finishClear();
      else if (this.anim.kind === 'settle' && this.anim.t >= COLLAPSE_MS) this.finishSettle();
      return;
    }
    if (!this.cur) return;
    var D = this.das;
    if (D && D.go) {
      if (!A.held(D.src, D.act) || Date.now() - D.last > 220) this.das = null;
      else { D.acc += dt; var arr = D.act === 'D' ? 28 : 38; while (D.acc >= arr && this.cur) { D.acc -= arr; if (D.act === 'L') this.move(-1); else if (D.act === 'R') this.move(1); else this.soft(); } }
    }
    if (!this.cur) return;
    var sp = speed(this.level);
    if (this.grounded()) {
      this.lockT += dt; if (this.lockT >= LOCK || this.lockResets >= LOCK_RESETS && this.lockT >= 120) this.lock();
    } else {
      this.fall += dt;
      while (this.fall >= sp && this.cur && !this.grounded()) { this.fall -= sp; this.cur.y++; this.lastRot = false; }
      if (this.grounded()) this.fall = 0;
    }
  };
  BP.input = function (ev) {
    if (!this.alive) return;
    var a = ev.act, pad = ev.kind !== 'key';
    // TV remotes and keyboards repeat slowly and unevenly: once a key is clearly held, auto-shift runs on our own fast clock
    if (!pad && (a === 'L' || a === 'R' || a === 'D')) {
      if (ev.repeat) { if (this.das && this.das.act === a) { this.das.last = Date.now(); this.das.go = true; } return; }
      this.das = { act: a, src: ev.src, last: Date.now(), go: false, acc: 0 };
    }
    if (a === 'L') this.move(-1); else if (a === 'R') this.move(1);
    else if (a === 'D') this.soft();
    else if (a === 'U') { if (pad) this.hard(); else this.rotate(1); }
    else if (a === 'A') { if (pad) this.rotate(1); else this.hard(); }
    else if (a === 'X') { if (pad) this.rotate(-1); else this.hard(); }
    else if (a === 'B') this.rotate(-1);
    else if (a === 'LB' || a === 'RB') this.doHold();
    else if (a === 'Y') { if (this.wellReady) this.collapse(); else sfx('nope'); }
  };
  function ordinal(n) { return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }

  // attacks fly across the screen as comets
  function attack(from, n) {
    var alive = []; for (var i = 0; i < G.boards.length; i++) if (G.boards[i] !== from && G.boards[i].alive) alive.push(G.boards[i]);
    if (!alive.length) return;
    // aim at whoever is doing best (highest score), with a little randomness so nobody is safe
    alive.sort(function (a, b) { return b.score - a.score; });
    var to = alive.length > 1 && Math.random() < 0.35 ? alive[1 + Math.floor(Math.random() * (alive.length - 1))] : alive[0];
    var L = from.layout, M = to.layout;
    G.comets.push({ x0: L.bx + L.bw / 2, y0: L.by + L.bh * 0.6, x1: M.bx - 14, y1: M.by + M.bh - 40, t: 0, dur: 620, n: n, to: to, col: from.color });
    from.sent += n; sfx('send', n);
  }

  // ------------------------------------------------------------------ Stages: every two levels the music genre changes, and the whole look with it
  // Switch off with games.shardfallStages: false in settings.js, or "Shardfall stages" in the arcade's Sound menu.
  var STAGES = [
    { id: 'chill', name: 'Lo-fi Chill', sub: 'Rain on the window, warm keys', from: 1, track: 'mu_sf_chill', bpm: 82, q: 'lofi beats', sky: 'dusk', rim: '#ffb38a', tint: [[255, 160, 120], [120, 80, 190], [70, 190, 200]] },
    { id: 'synth', name: 'Synthwave', sub: 'Night drive to the neon sun', from: 3, track: 'mu_sf_synth', bpm: 100, q: 'synthwave', sky: 'grid', rim: '#ff4fd8', tint: [[255, 70, 200], [110, 60, 255], [255, 150, 90]] },
    { id: 'electro', name: 'Electro', sub: 'Out into deep space', from: 5, track: 'mu_sf_a', layer: 'mu_sf_b', bpm: 120, q: 'electro house', sky: 'space', rim: '#7af7ff', tint: [[122, 247, 255], [178, 123, 255], [79, 134, 255]] },
    { id: 'rock', name: 'Rock', sub: 'Lights up, amps to eleven', from: 7, track: 'mu_sf_rock', bpm: 140, q: 'rock anthems', sky: 'stage', rim: '#ff5a3c', tint: [[255, 70, 40], [255, 170, 60], [140, 20, 40]] },
    { id: 'dnb', name: 'Drum & Bass', sub: 'Full speed, hold on', from: 9, track: 'mu_sf_dnb', bpm: 174, q: 'drum and bass', sky: 'tunnel', rim: '#5effc8', tint: [[60, 255, 200], [40, 140, 255], [200, 255, 90]] }
  ];
  function stagesOn() { if ((window.DASH_SETTINGS || {}).games && DASH_SETTINGS.games.shardfallStages === false) return false; try { return localStorage.getItem('arcade.sfStages') !== 'off'; } catch (e) { return true; } }
  function stageFor(level) { var k = 0; for (var i = 0; i < STAGES.length; i++) if (level >= STAGES[i].from) k = i; return k; }
  function topLevel() { var l = 1; for (var i = 0; i < G.boards.length; i++) if (G.boards[i].alive || G.boards.length === 1) l = Math.max(l, G.boards[i].level); return l; }
  function stageTempo(level) { var st = STAGES[G.stage]; return st.bpm * (1 + (level - st.from) * 0.05); }
  function setStage(k, first) {
    var st = STAGES[k]; G.prevStage = first ? -1 : G.stage; G.stage = k; G.stageT = 0;
    MUSIC.track = st.track; MUSIC.layer = st.layer || null; MUSIC.bpm = st.bpm; MUSIC.xfade = first ? 0 : 0.9;
    A.tint(st.tint);
    if (!first) {
      G.stageBanner = { t: 0, st: st, n: k + 1 }; G.warp = 1; G.punch = 1; sfx('level');
      if (G.music && A.music) A.music(MUSIC, st.bpm);
      if (A.dj && A.dj.genre) A.dj.genre(st.q, st.name);
    }
  }
  function checkStage() {
    if (!G.stages) return;
    var k = stageFor(topLevel()); if (k !== G.stage) setStage(k, false);
  }
  // ---- skies (High effects). Each paints the whole screen; switching stages crossfades between them.
  var SKY = {};
  function skyCanvas(w, h, fn) { var c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
  function skyInit() {
    if (SKY.ready) return; SKY.ready = true;
    // lo-fi dusk city
    SKY.city = skyCanvas(1920, 520, function (c, w, h) {
      var x = 0, r = Math.random;
      while (x < w) {
        var bw = 50 + r() * 120, bh = 120 + r() * 340; c.fillStyle = 'rgb(' + (22 + r() * 10 | 0) + ',' + (16 + r() * 8 | 0) + ',' + (38 + r() * 14 | 0) + ')'; c.fillRect(x, h - bh, bw, bh);
        for (var wy = h - bh + 14; wy < h - 10; wy += 22) for (var wx = x + 8; wx < x + bw - 10; wx += 18) if (r() < 0.32) { c.fillStyle = r() < 0.8 ? 'rgba(255,190,120,' + (0.35 + r() * 0.5) + ')' : 'rgba(140,200,255,.5)'; c.fillRect(wx, wy, 9, 12); }
        x += bw + r() * 8;
      }
    });
    SKY.bokeh = []; for (var i = 0; i < 26; i++) SKY.bokeh.push({ x: Math.random() * 1920, y: 300 + Math.random() * 780, r: 18 + Math.random() * 60, v: 0.004 + Math.random() * 0.01, c: Math.random() < 0.6 ? '255,170,110' : Math.random() < 0.5 ? '255,110,140' : '120,190,255', a: 0.05 + Math.random() * 0.1 });
    SKY.rain = []; for (var j = 0; j < 120; j++) SKY.rain.push({ x: Math.random() * 1920, y: Math.random() * 1080, v: 0.9 + Math.random() * 0.8, l: 14 + Math.random() * 26 });
    // synthwave sun + mountains
    SKY.sun = skyCanvas(560, 560, function (c, w, h) {
      var g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffe36e'); g.addColorStop(0.5, '#ff7a59'); g.addColorStop(1, '#ff2aa8');
      c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'destination-out';
      for (var k = 0; k < 9; k++) { var yy = h * 0.55 + k * k * 3.2 + k * 14; c.fillRect(0, yy, w, 4 + k * 1.6); }
    });
    SKY.mtn = skyCanvas(1920, 260, function (c, w, h) {
      for (var layer = 0; layer < 2; layer++) {
        c.beginPath(); c.moveTo(0, h); var x = 0;
        while (x <= w) { c.lineTo(x, h - (layer ? 60 : 110) - Math.random() * (layer ? 90 : 150)); x += 40 + Math.random() * 90; }
        c.lineTo(w, h); c.closePath(); c.fillStyle = layer ? '#1a0630' : '#2a0b4a'; c.fill();
        c.strokeStyle = layer ? 'rgba(255,80,220,.55)' : 'rgba(120,90,255,.5)'; c.lineWidth = 2; c.stroke();
      }
    });
    // rock crowd
    SKY.crowd = []; for (var q = 0; q < 70; q++) SKY.crowd.push({ x: q * 28 + Math.random() * 14 - 20, h: 60 + Math.random() * 50, ph: Math.random() * 6, arm: Math.random() < 0.35 });
    SKY.embers = []; for (var e = 0; e < 90; e++) SKY.embers.push({ x: Math.random() * 1920, y: Math.random() * 1080, v: 0.03 + Math.random() * 0.12, s: 1 + Math.random() * 3, ph: Math.random() * 6 });
    // drum & bass tunnel rings
    SKY.rings = []; for (var t = 0; t < 22; t++) SKY.rings.push({ z: t * 110 + 60, rot: Math.random() * 6, c: t % 3 });
  }
  function drawSky(id, x, dt, pu, I) {
    var t = (G.time || 0) / 1000, cx = W / 2, cy = H / 2, i;
    if (id === 'space') return drawSpace(x, dt);
    skyInit();
    if (id === 'dusk') {
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120b2e'); g.addColorStop(0.45, '#4a2a5e'); g.addColorStop(0.75, '#c2607a'); g.addColorStop(1, '#ffb37a');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.5 + pu * 0.1; x.drawImage(SKY.city, 0, H - 520); x.globalAlpha = 1;
      x.globalCompositeOperation = 'lighter';
      for (i = 0; i < SKY.bokeh.length; i++) {
        var b = SKY.bokeh[i]; b.y -= b.v * dt * 0.3; if (b.y < -80) { b.y = H + 80; b.x = Math.random() * W; }
        var bg = x.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); bg.addColorStop(0, 'rgba(' + b.c + ',' + (b.a * (1 + pu * 0.5)) + ')'); bg.addColorStop(0.8, 'rgba(' + b.c + ',' + b.a * 0.6 + ')'); bg.addColorStop(1, 'rgba(' + b.c + ',0)');
        x.fillStyle = bg; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 6.283); x.fill();
      }
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(200,210,255,.18)'; x.lineWidth = 1.5; x.beginPath();
      for (i = 0; i < SKY.rain.length; i++) { var rn = SKY.rain[i]; rn.y += rn.v * dt; rn.x -= rn.v * dt * 0.12; if (rn.y > H) { rn.y = -30; rn.x = Math.random() * (W + 200); } x.moveTo(rn.x, rn.y); x.lineTo(rn.x + rn.l * 0.12, rn.y - rn.l); }
      x.stroke();
    } else if (id === 'grid') {
      var hz = H * 0.58, g2 = x.createLinearGradient(0, 0, 0, hz); g2.addColorStop(0, '#07021a'); g2.addColorStop(0.6, '#2b0a4f'); g2.addColorStop(1, '#8a1f78');
      x.fillStyle = g2; x.fillRect(0, 0, W, hz); x.fillStyle = '#0a0220'; x.fillRect(0, hz, W, H - hz);
      for (i = 0; i < 60; i++) { var sx = (i * 397) % W, sy = (i * 211) % (hz * 0.8); x.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.25 * Math.sin(t * 2 + i)) + ')'; x.fillRect(sx, sy, 2, 2); }
      var ss = 1 + pu * 0.02; x.save(); x.translate(cx, hz - 120); x.scale(ss, ss); x.shadowColor = '#ff4fa8'; x.shadowBlur = 80; x.drawImage(SKY.sun, -280, -280); x.restore(); x.shadowBlur = 0;
      x.drawImage(SKY.mtn, 0, hz - 250);
      x.save(); x.beginPath(); x.rect(0, hz, W, H - hz); x.clip();
      x.strokeStyle = 'rgba(255,60,210,' + (0.55 + pu * 0.4) + ')'; x.lineWidth = 2; x.shadowColor = '#ff3cd2'; x.shadowBlur = 14; x.beginPath();
      for (i = -24; i <= 24; i++) { x.moveTo(cx + i * 40, hz); x.lineTo(cx + i * 420, H); }
      var sp = (t * (0.8 + I) + (G.warp || 0)) % 1;
      for (i = 0; i < 18; i++) { var zz = (i + 1 - sp), yy = hz + (H - hz) * (1 / zz) * 0.9 - (H - hz) * 0.05; if (yy < hz || yy > H) continue; x.moveTo(0, yy); x.lineTo(W, yy); }
      x.stroke(); x.restore(); x.shadowBlur = 0;
      var hg = x.createLinearGradient(0, hz - 30, 0, hz + 60); hg.addColorStop(0, 'rgba(255,80,200,0)'); hg.addColorStop(0.4, 'rgba(255,80,200,.5)'); hg.addColorStop(1, 'rgba(255,80,200,0)');
      x.fillStyle = hg; x.fillRect(0, hz - 30, W, 90);
    } else if (id === 'stage') {
      var g3 = x.createLinearGradient(0, 0, 0, H); g3.addColorStop(0, '#060203'); g3.addColorStop(0.7, '#1c0606'); g3.addColorStop(1, '#3a0a06');
      x.fillStyle = g3; x.fillRect(0, 0, W, H);
      // truss
      x.strokeStyle = 'rgba(120,120,130,.35)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 60); x.lineTo(W, 60); x.moveTo(0, 90); x.lineTo(W, 90);
      for (i = 0; i < W; i += 60) { x.moveTo(i, 60); x.lineTo(i + 30, 90); x.lineTo(i + 60, 60); } x.stroke();
      // sweeping spotlights
      x.globalCompositeOperation = 'lighter';
      var cols = ['255,60,40', '255,170,60', '255,255,230', '255,60,40', '255,170,60', '255,255,230', '255,60,40'];
      for (i = 0; i < 7; i++) {
        var ox = 160 + i * 266, ang = Math.sin(t * (0.6 + i * 0.13) + i) * 0.55, len = 1300, wdt = 120 + pu * 40;
        var ex = ox + Math.sin(ang) * len, ey = 90 + Math.cos(ang) * len, px2 = Math.cos(ang) * wdt, py2 = -Math.sin(ang) * wdt;
        var lg = x.createLinearGradient(ox, 90, ex, ey); lg.addColorStop(0, 'rgba(' + cols[i] + ',' + (0.32 + pu * 0.25) + ')'); lg.addColorStop(1, 'rgba(' + cols[i] + ',0)');
        x.fillStyle = lg; x.beginPath(); x.moveTo(ox - 6, 90); x.lineTo(ex - px2, ey - py2); x.lineTo(ex + px2, ey + py2); x.lineTo(ox + 6, 90); x.closePath(); x.fill();
        x.fillStyle = 'rgba(' + cols[i] + ',.9)'; x.beginPath(); x.arc(ox, 92, 9, 0, 6.283); x.fill();
      }
      for (i = 0; i < SKY.embers.length; i++) {
        var em = SKY.embers[i]; em.y -= em.v * dt * (1 + I); em.x += Math.sin(t * 2 + em.ph) * 0.4; if (em.y < -10) { em.y = H + 10; em.x = Math.random() * W; }
        x.fillStyle = 'rgba(255,' + (120 + (em.ph * 20 | 0)) + ',40,' + (0.5 + 0.5 * Math.sin(t * 5 + em.ph)) + ')'; x.fillRect(em.x, em.y, em.s, em.s);
      }
      if (pu > 0.85) { x.fillStyle = 'rgba(255,230,200,' + (pu - 0.85) * 0.5 + ')'; x.fillRect(0, 0, W, H); }   // strobe on the beat
      x.globalCompositeOperation = 'source-over';
      // crowd silhouettes jumping on the beat
      x.fillStyle = '#050102';
      for (i = 0; i < SKY.crowd.length; i++) {
        var cr = SKY.crowd[i], jump = Math.max(0, Math.sin(t * 9.33 + cr.ph)) * 10 * (0.4 + I) + pu * 6, by = H - cr.h + 30 - jump;
        x.beginPath(); x.arc(cr.x, by, 15, 0, 6.283); x.fill(); x.fillRect(cr.x - 22, by + 12, 44, cr.h);
        if (cr.arm) { x.save(); x.translate(cr.x + 14, by + 16); x.rotate(-0.4 + Math.sin(t * 4 + cr.ph) * 0.3); x.fillRect(-4, -54, 9, 56); x.restore(); }
      }
    } else if (id === 'tunnel') {
      x.fillStyle = '#01060a'; x.fillRect(0, 0, W, H);
      var spd = (0.5 + I * 0.6 + (G.warp || 0) * 3) * dt;
      x.globalCompositeOperation = 'lighter'; x.lineJoin = 'round';
      var rc = ['94,255,200', '60,150,255', '200,255,90'];
      SKY.rings.sort(function (a, b) { return b.z - a.z; });
      for (i = 0; i < SKY.rings.length; i++) {
        var R = SKY.rings[i]; R.z -= spd; if (R.z < 20) { R.z += 22 * 110; R.rot = Math.random() * 6; }
        var k2 = FOC / R.z, rad = 520 * k2, wob = Math.sin(t * 0.7 + R.z * 0.004) * 90 * k2, rot = R.rot + t * 0.4 + R.z * 0.002;
        if (rad > W * 1.2) continue;
        var al = Math.min(1, (2420 - R.z) / 600) * Math.min(1, R.z / 120);
        x.strokeStyle = 'rgba(' + rc[R.c] + ',' + al * (0.55 + pu * 0.4) + ')'; x.lineWidth = Math.max(1, 5 * k2);
        x.beginPath(); for (var v = 0; v <= 6; v++) { var aa = rot + v * Math.PI / 3, px3 = cx + wob + Math.cos(aa) * rad, py3 = cy + Math.sin(aa) * rad * 0.8; if (v) x.lineTo(px3, py3); else x.moveTo(px3, py3); } x.stroke();
      }
      // speed streaks
      x.strokeStyle = 'rgba(180,255,240,.35)'; x.lineWidth = 2; x.beginPath();
      for (i = 0; i < 40; i++) { var an = i * 2.4 + t * 0.2, r0 = 200 + ((t * 900 * (1 + I) + i * 137) % 900); x.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0 * 0.8); x.lineTo(cx + Math.cos(an) * (r0 + 60 + I * 80), cy + Math.sin(an) * (r0 + 60 + I * 80) * 0.8); }
      x.stroke();
      // the odd lightning crack on a strong beat
      if (pu > 0.9 && Math.random() < 0.5) {
        x.strokeStyle = 'rgba(220,255,255,.8)'; x.lineWidth = 3; x.beginPath(); var lx = Math.random() * W, ly = 0; x.moveTo(lx, ly);
        while (ly < H) { lx += (Math.random() - 0.5) * 120; ly += 40 + Math.random() * 60; x.lineTo(lx, ly); } x.stroke();
      }
      x.globalCompositeOperation = 'source-over';
    }
    var vg = x.createRadialGradient(cx, cy, H * 0.3, cx, cy, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
  }
  // Light effects (the Samsung): each stage's sky is painted once into a still picture shown behind the game,
  // so the looks still change with the music but cost nothing per frame.
  var LSKY = {}, lskyEl = null, lskyId = null;
  function lightSky(on) {
    var want = on && G && G.stages ? STAGES[G.stage].sky : null;
    if (want === lskyId) return; lskyId = want;
    if (!lskyEl) { var cv = document.getElementById('ar-cv'); if (!cv) return; lskyEl = document.createElement('div'); lskyEl.id = 'ar-sky'; cv.parentNode.insertBefore(lskyEl, cv); }
    if (!want) { lskyEl.style.opacity = '0'; return; }
    if (!LSKY[want]) {
      try {
        var c = document.createElement('canvas'); c.width = 960; c.height = 540; var k = c.getContext('2d'); k.scale(0.5, 0.5);
        var t0 = G.time; G.time = 4000; drawSky(want, k, 16, 0.4, 0.3); G.time = t0;
        LSKY[want] = c.toDataURL('image/jpeg', 0.86);
      } catch (e) { LSKY[want] = ''; }
    }
    lskyEl.style.backgroundImage = LSKY[want] ? 'url(' + LSKY[want] + ')' : 'none'; lskyEl.style.opacity = '1';
  }
  function drawStageBanner(x, dt) {
    var B = G.stageBanner; if (!B) return; B.t += dt; var p = B.t / 3200; if (p >= 1) { G.stageBanner = null; return; }
    var a = p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1, sl = (1 - Math.min(1, p / 0.15)) * 120;
    x.save(); x.globalAlpha = a; x.textAlign = 'center';
    var g = x.createLinearGradient(0, H / 2 - 120, 0, H / 2 + 90); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, H / 2 - 140, W, 250);
    x.font = '700 28px Manrope, sans-serif'; x.fillStyle = B.st.rim; x.fillText('STAGE ' + B.n + ' OF ' + STAGES.length, W / 2 - sl, H / 2 - 70);
    x.font = font(128, 800); x.shadowColor = B.st.rim; x.shadowBlur = 40; x.fillStyle = '#fff'; x.fillText(B.st.name, W / 2 + sl, H / 2 + 40); x.shadowBlur = 0;
    x.font = '600 28px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,.7)'; x.fillText(B.st.sub, W / 2, H / 2 + 92);
    x.restore();
  }

  // ------------------------------------------------------------------ High effects (Fire TV Cube, PCs): deep space, 3D crystals, beat pulse
  function hi() { return !!(A.fxHigh && A.fxHigh()); }
  var SP = null;
  function spaceInit() {
    var nb = document.createElement('canvas'); nb.width = 640; nb.height = 360; var n = nb.getContext('2d');
    var cols = [[90, 60, 200], [30, 120, 220], [200, 60, 160], [40, 200, 220], [120, 70, 255]];
    for (var i = 0; i < 26; i++) {
      var c = cols[i % cols.length], gx = Math.random() * 640, gy = Math.random() * 360, gr = 60 + Math.random() * 170;
      var g = n.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.10 + Math.random() * 0.12) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      n.fillStyle = g; n.fillRect(0, 0, 640, 360);
    }
    var star = document.createElement('canvas'); star.width = star.height = 32; var t = star.getContext('2d');
    var sg = t.createRadialGradient(16, 16, 0, 16, 16, 16); sg.addColorStop(0, 'rgba(255,255,255,1)'); sg.addColorStop(0.18, 'rgba(200,230,255,.8)'); sg.addColorStop(1, 'rgba(120,160,255,0)');
    t.fillStyle = sg; t.fillRect(0, 0, 32, 32);
    var stars = []; for (var k = 0; k < 340; k++) stars.push({ x: (Math.random() - 0.5) * 4000, y: (Math.random() - 0.5) * 2400, z: Math.random() * 2000 + 1 });
    var crys = []; for (var m = 0; m < 13; m++) crys.push(newCrystal(true));
    SP = { neb: nb, star: star, stars: stars, crys: crys, t: 0, pulse: 0, lastBeat: 0, warp: 0 };
  }
  var CRY_COL = ['#7af7ff', '#b27bff', '#4f86ff', '#ff5c8a', '#5ef2a0', '#ffd66e'];
  function newCrystal(any) {
    var a = Math.random() * Math.PI * 2, d = 650 + Math.random() * 900;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.55, z: any ? 200 + Math.random() * 2200 : 2400, s: 40 + Math.random() * 90, rx: Math.random() * 6, ry: Math.random() * 6, vx: (Math.random() - 0.5) * 0.0012, vy: 0.0004 + Math.random() * 0.0012, col: CRY_COL[Math.floor(Math.random() * CRY_COL.length)], stretch: 1.3 + Math.random() * 0.9 };
  }
  var OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  var OCT_F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  var CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  var CUBE_F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]];
  var LIGHT = (function () { var l = [-0.45, -0.6, -0.66], m = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]); return [l[0] / m, l[1] / m, l[2] / m]; })();
  function rot(v, rx, ry, rz) {
    var x = v[0], y = v[1], z = v[2], c = Math.cos(rx), s = Math.sin(rx), t;
    t = y * c - z * s; z = y * s + z * c; y = t;
    c = Math.cos(ry); s = Math.sin(ry); t = x * c + z * s; z = -x * s + z * c; x = t;
    if (rz) { c = Math.cos(rz); s = Math.sin(rz); t = x * c - y * s; y = x * s + y * c; x = t; }
    return [x, y, z];
  }
  // draws a flat-shaded solid; P(v) maps a rotated vertex to [sx, sy]; faces facing away are skipped
  function solid(x, V, F, rx, ry, rz, sc, P, col, alpha, sx, sy, sz, amb) {
    var rv = [], i, f, base = rgb(col);
    for (i = 0; i < V.length; i++) rv.push(rot([V[i][0] * (sx || 1), V[i][1] * (sy || 1), V[i][2] * (sz || 1)], rx, ry, rz));
    for (i = 0; i < F.length; i++) {
      f = F[i]; var a = rv[f[0]], b = rv[f[1]], c = rv[f[2]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz > 0) continue;
      var nm = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1, lum = Math.max(0, -(nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nm);
      var k = (amb || 0.28) + lum * 0.95, hl = Math.max(0, lum - 0.75) * 3;
      x.fillStyle = 'rgba(' + Math.min(255, Math.round(base[0] * k + 255 * hl)) + ',' + Math.min(255, Math.round(base[1] * k + 255 * hl)) + ',' + Math.min(255, Math.round(base[2] * k + 255 * hl)) + ',' + alpha + ')';
      x.beginPath();
      for (var j = 0; j < f.length; j++) { var p = P(rv[f[j]]); if (j) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,' + (alpha * (0.15 + lum * 0.4)) + ')'; x.lineWidth = 1.2; x.stroke();
    }
  }
  var FOC = 900;
  // beat pulse from the game music: 1 on each beat, then decays (stays 0 while Spotify plays instead)
  function beatPulse(dt) {
    if (!SP) spaceInit();
    var bt = A.beat ? A.beat() : -1;
    if (bt >= 0) { if (bt < SP.lastBeat) SP.pulse = 1; SP.lastBeat = bt; }
    SP.pulse *= Math.pow(0.0045, dt / 1000);
    return SP.pulse;
  }
  function drawSpace(x, dt) {
    if (!SP) spaceInit();
    SP.t += dt;
    var I = MUSIC.intensity || 0, pu = SP.pulse, cx = W / 2, cy = H / 2;
    SP.warp += ((G.warp || 0) - SP.warp) * Math.min(1, dt / 200); if (G.warp) G.warp *= Math.pow(0.08, dt / 1000);
    x.fillStyle = '#04030c'; x.fillRect(0, 0, W, H);
    // nebula: two copies drifting against each other
    var d = SP.t / 1000;
    x.globalAlpha = 0.75 + pu * 0.25 + I * 0.2;
    x.drawImage(SP.neb, -120 + Math.sin(d * 0.05) * 80, -80 + Math.cos(d * 0.04) * 50, W + 240, H + 160);
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.35 + pu * 0.2;
    x.save(); x.translate(cx, cy); x.rotate(d * 0.012); x.scale(1.4, 1.4); x.drawImage(SP.neb, -W / 2, -H / 2, W, H); x.restore();
    // stars flying toward us; faster with level, a burst on big clears
    var spd = (0.05 + I * 0.12 + SP.warp * 1.6) * dt;
    for (var i = 0; i < SP.stars.length; i++) {
      var s = SP.stars[i], z0 = s.z; s.z -= spd;
      if (s.z < 2) { s.z = 2000; s.x = (Math.random() - 0.5) * 4000; s.y = (Math.random() - 0.5) * 2400; continue; }
      var k = FOC / s.z, px = cx + s.x * k, py = cy + s.y * k; if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
      var br = Math.min(1, (2000 - s.z) / 1200), sz = Math.min(16, 2 + k * 3.2) * (1 + pu * 0.4);
      x.globalAlpha = br * 0.9;
      if (SP.warp > 0.15) { var k0 = FOC / z0; x.strokeStyle = 'rgba(190,225,255,' + (br * 0.7) + ')'; x.lineWidth = Math.max(1, sz * 0.25); x.beginPath(); x.moveTo(cx + s.x * k0, cy + s.y * k0); x.lineTo(px, py); x.stroke(); }
      x.drawImage(SP.star, px - sz / 2, py - sz / 2, sz, sz);
    }
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    // 3D crystals tumbling through space, far ones first
    SP.crys.sort(function (a, b) { return b.z - a.z; });
    for (var j = 0; j < SP.crys.length; j++) {
      var c = SP.crys[j]; c.z -= (0.04 + I * 0.05 + SP.warp * 1.2) * dt; c.rx += c.vx * dt; c.ry += c.vy * dt;
      if (c.z < 120) { SP.crys[j] = newCrystal(false); continue; }
      var kk = FOC / c.z, sx0 = cx + c.x * kk, sy0 = cy + c.y * kk, scl = c.s * kk * (1 + pu * 0.06);
      var fade = Math.min(1, (2400 - c.z) / 500) * Math.min(1, (c.z - 120) / 200);
      solid(x, OCT_V, OCT_F, c.rx, c.ry, 0, 1, function (v) { return [sx0 + v[0] * scl, sy0 + v[1] * scl]; }, c.col, 0.72 * fade, 0.62, c.stretch, 0.62);
    }
    // soft vignette so the boards stay the star of the show
    var vg = x.createRadialGradient(cx, cy, H * 0.3, cx, cy, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);
    return pu;
  }
  // 3D cubes that burst out of cleared rows
  function cube(x0, y0, col, pow) {
    if (G.cubes.length > 260) return;
    var a = Math.random() * Math.PI * 2, v = (0.2 + Math.random() * 0.5) * pow;
    G.cubes.push({ x: x0, y: y0, z: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4 * pow, vz: 0.25 + Math.random() * 0.9 * pow, rx: Math.random() * 6, ry: Math.random() * 6, rz: 0, wx: (Math.random() - 0.5) * 0.02, wy: (Math.random() - 0.5) * 0.02, s: 7 + Math.random() * 9, life: 0, max: 900 + Math.random() * 700, col: col });
  }
  function drawCubes(x, dt) {
    if (!G.cubes || !G.cubes.length) return;
    G.cubes.sort(function (a, b) { return a.z - b.z; });
    for (var i = G.cubes.length - 1; i >= 0; i--) {
      var c = G.cubes[i]; c.life += dt; if (c.life >= c.max) { G.cubes.splice(i, 1); continue; }
      c.vy += 0.0018 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.rx += c.wx * dt; c.ry += c.wy * dt;
      var k = FOC / Math.max(200, FOC - c.z), px = W / 2 + (c.x - W / 2) * k, py = H / 2 + (c.y - H / 2) * k, sc = c.s * k;
      var a = 1 - Math.pow(c.life / c.max, 2);
      solid(x, CUBE_V, CUBE_F, c.rx, c.ry, 0, 1, function (v) { return [px + v[0] * sc, py + v[1] * sc]; }, c.col, a, 1, 1, 1, 0.62);
    }
  }
  function drawBeams(x, dt) {
    if (!G.beams || !G.beams.length) return;
    x.globalCompositeOperation = 'lighter';
    for (var i = G.beams.length - 1; i >= 0; i--) {
      var b = G.beams[i]; b.t += dt; var p = b.t / 520; if (p >= 1) { G.beams.splice(i, 1); continue; }
      var hh = b.h * (1 + p * 5), a = (1 - p) * 0.9;
      var g = x.createLinearGradient(0, b.y - hh, 0, b.y + hh); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, rgba(b.col, a)); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; var ext = b.w * (0.5 + p * 1.6); x.fillRect(b.x - ext, b.y - hh, b.w + ext * 2, hh * 2);
      x.fillStyle = 'rgba(255,255,255,' + a * 0.9 + ')'; x.fillRect(b.x - ext, b.y - 1.5, b.w + ext * 2, 3);
    }
    x.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ effects (shared, screen space)
  function shard(x, y, col, pow) {
    if (G.parts.length > 1400) return;
    var a = Math.random() * Math.PI * 2, v = (0.15 + Math.random() * 0.55) * (pow || 1);
    G.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.35 * (pow || 1), r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, s: 4 + Math.random() * 9, life: 0, max: 700 + Math.random() * 700, col: col });
  }
  function ring(x, y, col, big) { var k = G.boards.length > 1 ? 0.5 : 1; G.rings.push({ x: x, y: y, col: col, t: 0, dur: big ? 900 : 650, r: (big ? 900 : 520) * k }); }

  // ------------------------------------------------------------------ sounds
  function sfx(name, n) {
    if (A.play && A.play('sf_' + (name === 'clear' ? 'clear' + Math.max(1, Math.min(3, n || 1)) : name), { vary: name === 'move' || name === 'rotate' || name === 'lock' ? 0.03 : 0, max: name === 'move' ? 2 : 4 })) return;
    var T = A.tone, N = A.noise;
    switch (name) {
      case 'move': T(1250, 0.025, 'square', 0.025); break;
      case 'rotate': T(880, 0.04, 'triangle', 0.08, 1320); break;
      case 'hold': T(500, 0.08, 'sine', 0.12, 760); break;
      case 'lock': T(170, 0.07, 'sine', 0.2, 90); N(0.04, 0.05, 2400); break;
      case 'hard': T(240, 0.12, 'sine', 0.32, 50); N(0.09, 0.12, 900, 0, 0.8, 200); break;
      case 'clear': for (var i = 0; i < n; i++) T([1047, 1319, 1568, 2093][i], 0.32, 'triangle', 0.14, 0, i * 0.05); N(0.3, 0.12, 6000, 0, 0.6, 2500); break;
      case 'quad': [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { T(f, 0.6, 'sawtooth', 0.06, 0, i * 0.035); T(f * 2, 0.5, 'triangle', 0.08, 0, i * 0.035); }); N(0.7, 0.25, 4000, 0, 0.5, 300); T(80, 0.6, 'sine', 0.5, 30); break;
      case 'collapse': T(90, 0.9, 'sawtooth', 0.22, 30); N(1.0, 0.3, 300, 0, 0.7, 4000); T(1800, 0.8, 'sine', 0.06, 200); break;
      case 'settle': T(110, 0.18, 'sine', 0.35, 55); N(0.15, 0.1, 500); break;
      case 'wellready': [784, 988, 1175, 1568].forEach(function (f, i) { T(f, 0.25, 'sine', 0.12, 0, i * 0.07); }); break;
      case 'garbage': T(140, 0.25, 'square', 0.1, 70); N(0.25, 0.18, 300, 0, 1, 120); break;
      case 'send': T(600, 0.3, 'sawtooth', 0.05, 1800); break;
      case 'level': [659, 880, 1109, 1319].forEach(function (f, i) { T(f, 0.3, 'triangle', 0.12, 0, i * 0.06); }); break;
      case 'flawless': [1047, 1319, 1568, 2093, 2637].forEach(function (f, i) { T(f, 0.5, 'sine', 0.12, 0, i * 0.08); }); break;
      case 'ko': T(300, 0.9, 'sawtooth', 0.12, 40); N(0.8, 0.25, 800, 0, 0.6, 80); break;
      case 'nope': T(200, 0.08, 'square', 0.05); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { T(f, 0.28, 'triangle', 0.15, 0, i * 0.11); }); break;
    }
  }

  // ------------------------------------------------------------------ layout
  function layoutBoards() {
    var n = G.boards.length, c = n === 1 ? 44 : n === 2 ? 40 : n === 3 ? 37 : 33;
    var colW = W / n;
    for (var i = 0; i < n; i++) {
      var b = G.boards[i], bw = COLS * c, bh = (ROWS - HID) * c, side = Math.round(c * 2.7);
      var total = 22 + bw + 18 + side, x0 = Math.round(colW * i + (colW - total) / 2) + (n === 1 ? 60 : 0);
      var by = Math.round((H - bh) / 2 + 24);
      b.layout = { c: c, bx: x0 + 22, by: by, bw: bw, bh: bh, sx: x0 + 22 + bw + 18, side: side, pc: Math.round(c * 0.56) };
      b.cache = document.createElement('canvas'); b.cache.width = bw + 40; b.cache.height = bh + 40; b.dirty = true;
      b.spr = sprites(c); b.pspr = sprites(b.layout.pc);
    }
  }
  function drawCache(b) {
    var L = b.layout, x = b.cache.getContext('2d'), c = L.c, s = b.spr, o = 20;
    x.clearRect(0, 0, b.cache.width, b.cache.height);
    // the well of the board: dark glass with a faint grid and a coloured rim
    rr(x, o - 6, o - 6, L.bw + 12, L.bh + 12, 18); x.fillStyle = 'rgba(8,10,20,0.82)'; x.fill();
    x.lineWidth = 2; x.strokeStyle = rgba(b.color, b.alive ? 0.55 : 0.15); x.stroke();
    var g = x.createLinearGradient(0, o, 0, o + L.bh); g.addColorStop(0, 'rgba(255,255,255,0.025)'); g.addColorStop(1, rgba(b.color, 0.06));
    x.fillStyle = g; x.fillRect(o, o, L.bw, L.bh);
    x.strokeStyle = 'rgba(255,255,255,0.045)'; x.lineWidth = 1; x.beginPath();
    for (var i = 1; i < COLS; i++) { x.moveTo(o + i * c + 0.5, o); x.lineTo(o + i * c + 0.5, o + L.bh); }
    for (var j = 1; j < ROWS - HID; j++) { x.moveTo(o, o + j * c + 0.5); x.lineTo(o + L.bw, o + j * c + 0.5); }
    x.stroke();
    var skip = b.anim && b.anim.kind === 'clear' ? b.anim.rows : null;
    for (var r = HID; r < ROWS; r++) {
      if (skip && skip.indexOf(r) >= 0) continue;
      for (var k = 0; k < COLS; k++) { var v = b.grid[r][k]; if (v) x.drawImage(s.cell[v], o + k * c, o + (r - HID) * c); }
    }
    if (!b.alive) { x.fillStyle = 'rgba(4,5,10,0.55)'; x.fillRect(o, o, L.bw, L.bh); }
    b.dirty = false;
  }
  function drawMini(x, t, cx, cy, pc, spr, alpha) {
    var m = ROT[t][0], n = m.length, minr = 9, maxr = -1, minc = 9, maxc = -1;
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) if (m[i][j]) { minr = Math.min(minr, i); maxr = Math.max(maxr, i); minc = Math.min(minc, j); maxc = Math.max(maxc, j); }
    var w = (maxc - minc + 1) * pc, h = (maxr - minr + 1) * pc;
    x.globalAlpha = alpha == null ? 1 : alpha;
    for (var a = 0; a < n; a++) for (var b2 = 0; b2 < n; b2++) if (m[a][b2]) x.drawImage(spr.cell[CIDX[t]], cx - w / 2 + (b2 - minc) * pc, cy - h / 2 + (a - minr) * pc);
    x.globalAlpha = 1;
  }

  function font(sz, wt) { return (wt || 700) + ' ' + sz + 'px "Bricolage Grotesque", Manrope, sans-serif'; }
  function drawBoard(x, b, now) {
    var L = b.layout, c = L.c, s = b.spr, sh = b.shake > 0.5 ? b.shake : 0;
    var ox = sh ? (Math.random() - 0.5) * sh : 0, oy = (sh ? (Math.random() - 0.5) * sh : 0) + b.nudge;
    x.save(); x.translate(ox, oy);
    if (b.dirty) drawCache(b);
    // halo behind the board in the player's colour; red pulse when the stack is high
    var danger = 0; if (b.alive) for (var r = HID; r < HID + 5; r++) for (var k = 0; k < COLS; k++) if (b.grid[r][k]) { danger = Math.max(danger, 1 - (r - HID) / 5); }
    b.danger = danger;
    x.drawImage(b.cache, L.bx - 20, L.by - 20);
    if (danger > 0) { var pu = 0.25 + 0.25 * Math.sin(now / 140); x.strokeStyle = 'rgba(255,70,100,' + (pu * danger) + ')'; x.lineWidth = 6; rr(x, L.bx - 8, L.by - 8, L.bw + 16, L.bh + 16, 20); x.stroke(); }
    x.save(); x.beginPath(); x.rect(L.bx, L.by, L.bw, L.bh); x.clip();
    // line clear: rows flare white and pinch shut
    if (b.anim && b.anim.kind === 'clear') {
      var p = b.anim.t / CLEAR_MS;
      for (var i = 0; i < b.anim.rows.length; i++) {
        var ry = L.by + (b.anim.rows[i] - HID) * c, hgt = c * (1 - p * p);
        for (var cc = 0; cc < COLS; cc++) { var v = b.grid[b.anim.rows[i]][cc]; if (v) { x.globalAlpha = 1 - p; x.drawImage(s.cell[v], L.bx + cc * c, ry + (c - hgt) / 2, c, hgt); } }
        x.globalAlpha = Math.max(0, 1 - p * 1.3); x.fillStyle = '#fff'; x.fillRect(L.bx - p * 40, ry + (c - hgt) / 2, L.bw + p * 80, hgt); x.globalAlpha = 1;
      }
    }
    // collapse: crystals fall with a little bounce
    if (b.anim && b.anim.kind === 'settle') {
      var q = Math.min(1, b.anim.t / COLLAPSE_MS), e = q < 0.75 ? Math.pow(q / 0.75, 2) : 1 - Math.sin((q - 0.75) / 0.25 * Math.PI) * 0.06, d = b.anim.drops;
      for (var di = 0; di < d.length; di++) { var yy = d[di].from + (d[di].to - d[di].from) * e; if (yy >= HID - 1) x.drawImage(s.cell[d[di].v], L.bx + d[di].c * c, L.by + (yy - HID) * c); }
    }
    // hard-drop streak
    if (b.trail) {
      var tr = b.trail, m2 = ROT[tr.t][tr.r], col = PAL[CIDX[tr.t]];
      for (var j2 = 0; j2 < m2.length; j2++) {
        var top = 99; for (var i2 = 0; i2 < m2.length; i2++) if (m2[i2][j2]) { top = i2; break; }
        if (top === 99) continue;
        var g2 = x.createLinearGradient(0, L.by + (tr.y0 + top - HID) * c, 0, L.by + (tr.y1 + top - HID) * c);
        g2.addColorStop(0, rgba(col, 0)); g2.addColorStop(1, rgba(col, 0.5 * tr.a));
        x.fillStyle = g2; x.fillRect(L.bx + (tr.x + j2) * c + c * 0.15, L.by + (tr.y0 + top - HID) * c, c * 0.7, (tr.y1 - tr.y0) * c);
      }
    }
    // ghost + falling piece
    if (b.cur && b.alive) {
      var cu = b.cur, m = ROT[cu.t][cu.r], ci = CIDX[cu.t], gy = b.ghostY();
      for (var a = 0; a < m.length; a++) for (var bb = 0; bb < m.length; bb++) if (m[a][bb] && gy + a >= HID) x.drawImage(s.ghost[ci], L.bx + (cu.x + bb) * c, L.by + (gy + a - HID) * c);
      var fy = cu.y + (b.grounded() ? 0 : Math.min(0.9, b.fall / speed(b.level)) * 0.0);
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.55;
      for (var a2 = 0; a2 < m.length; a2++) for (var b3 = 0; b3 < m.length; b3++) if (m[a2][b3]) x.drawImage(s.glow[ci], L.bx + (cu.x + b3) * c - c, L.by + (fy + a2 - HID) * c - c);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      var lockFade = b.grounded() ? 1 - 0.35 * Math.min(1, b.lockT / LOCK) : 1;
      x.globalAlpha = lockFade;
      for (var a3 = 0; a3 < m.length; a3++) for (var b4 = 0; b4 < m.length; b4++) if (m[a3][b4]) x.drawImage(s.cell[ci], L.bx + (cu.x + b4) * c, L.by + (fy + a3 - HID) * c);
      x.globalAlpha = 1;
    }
    if (b.lockFlash) { x.globalAlpha = b.lockFlash.a * 0.6; x.fillStyle = '#fff'; for (var lf = 0; lf < b.lockFlash.cells.length; lf++) { var lc = b.lockFlash.cells[lf]; if (lc[1] >= HID) x.fillRect(L.bx + lc[0] * c + 2, L.by + (lc[1] - HID) * c + 2, c - 4, c - 4); } x.globalAlpha = 1; }
    x.restore();

    // incoming attack meter (left of the board)
    var inc = 0; for (var ii = 0; ii < b.incoming.length; ii++) inc += b.incoming[ii].n;
    if (!b.solo) {
      x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(L.bx - 20, L.by, 8, L.bh);
      if (inc) { var ih = Math.min(L.bh, inc * c), pul = 0.7 + 0.3 * Math.sin(now / 90); x.fillStyle = 'rgba(255,72,110,' + pul + ')'; x.fillRect(L.bx - 20, L.by + L.bh - ih, 8, ih); }
    }
    // header: name + score
    x.textBaseline = 'alphabetic';
    if (!A.drawAvatar(x, b.p, L.bx + 12, L.by - 58, Math.round(c * 0.5))) { x.fillStyle = b.color; x.save(); x.translate(L.bx + 9, L.by - 56); x.rotate(Math.PI / 4); x.fillRect(-7, -7, 14, 14); x.restore(); }
    x.font = font(Math.round(c * 0.7)); x.fillStyle = '#fff'; x.textAlign = 'left'; x.fillText(b.p.name, L.bx + (b.p.avatar ? Math.round(c * 0.5) + 22 : 28), L.by - 46);
    x.font = font(Math.round(c * 1.05)); x.textAlign = 'right'; x.fillText(A.fmt(Math.floor(b.shownScore)), L.bx + L.bw, L.by - 42);
    x.font = '600 ' + Math.round(c * 0.42) + 'px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.5)'; x.textAlign = 'left';
    x.fillText('LEVEL ' + b.level + '   ·   ' + b.lines + ' LINES' + (b.solo ? '' : '   ·   SENT ' + b.sent), L.bx, L.by + L.bh + c * 0.95);
    // side column: next, hold, the Well
    var sx = L.sx, pc = L.pc, sw = L.side;
    x.font = '700 ' + Math.round(c * 0.36) + 'px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.45)'; x.textAlign = 'center';
    x.fillText('NEXT', sx + sw / 2, L.by + c * 0.4);
    var nq = b.solo ? 5 : 3;
    for (var qn = 0; qn < nq; qn++) drawMini(x, b.queue[qn], sx + sw / 2, L.by + c * 1.4 + qn * pc * 3, qn === 0 ? Math.round(pc * 1.15) : pc, qn === 0 ? sprites(Math.round(pc * 1.15)) : b.pspr, qn === 0 ? 1 : 0.75);
    var hy = L.by + c * 1.4 + nq * pc * 3 + c * 0.4;
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.fillText('HOLD', sx + sw / 2, hy);
    if (b.hold) drawMini(x, b.hold, sx + sw / 2, hy + c * 1.1, pc, b.pspr, b.canHold ? 1 : 0.3);
    // the Well: a crystal tube that fills as you clear
    var wy = hy + c * 2.3, wh = L.by + L.bh - wy - c * 0.2, ww = Math.round(c * 0.75), wx = sx + sw / 2 - ww / 2;
    if (wh > c * 2) {
      rr(x, wx, wy, ww, wh, ww / 2); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fill(); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,0.12)'; x.stroke();
      var f = b.well / b.wellMax, fh = (wh - 6) * f;
      if (fh > 0) {
        var wg = x.createLinearGradient(0, wy + wh - fh, 0, wy + wh); wg.addColorStop(0, b.wellReady ? '#ffffff' : '#d7b6ff'); wg.addColorStop(1, PAL[3]);
        rr(x, wx + 3, wy + wh - 3 - fh, ww - 6, fh, (ww - 6) / 2); x.fillStyle = wg; x.fill();
        if (b.wellReady) { x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.4 + 0.35 * Math.sin(now / 120); x.drawImage(s.glow[3], wx - c, wy + wh / 2 - c * 1.5, ww + 2 * c, c * 3); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      }
      x.save(); x.translate(sx + sw / 2, wy + wh + c * 0.0); x.fillStyle = b.wellReady ? '#fff' : 'rgba(255,255,255,0.4)'; x.font = '700 ' + Math.round(c * 0.3) + 'px Manrope, sans-serif';
      x.fillText(b.wellReady ? (A.isPad(b.pl.src) ? 'Y' : '▶❚❚') : 'WELL', 0, -wh - c * 0.25); x.restore();
    }
    // pop text (rises and fades)
    for (var pi = 0; pi < b.pops.length; pi++) {
      var po = b.pops[pi], pt = po.t / po.dur, sc = pt < 0.12 ? 0.6 + 0.4 * backOut(pt / 0.12) * 1.0 : 1, al = pt > 0.7 ? 1 - (pt - 0.7) / 0.3 : 1;
      var py = L.by + L.bh * 0.38 - pt * c * 1.5 + pi * c * 1.25;
      x.save(); x.translate(L.bx + L.bw / 2, py); x.scale(sc, sc); x.globalAlpha = al; x.textAlign = 'center';
      x.font = font(Math.round(c * 0.92 * po.s)); x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.55)'; x.strokeText(po.txt, 0, 0); x.fillStyle = po.col; x.fillText(po.txt, 0, 0);
      if (po.sub) { x.font = '700 ' + Math.round(c * 0.45) + 'px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.strokeText(po.sub, 0, c * 0.7); x.fillText(po.sub, 0, c * 0.7); }
      x.restore();
    }
    // knocked out
    if (!b.alive && !b.solo) {
      var kt = Math.min(1, b.deadT / 500);
      x.save(); x.translate(L.bx + L.bw / 2, L.by + L.bh / 2); x.globalAlpha = kt; x.textAlign = 'center';
      x.font = font(Math.round(c * 2.2)); x.fillStyle = '#fff'; x.fillText(ordinal(b.place), 0, 0);
      x.font = '700 ' + Math.round(c * 0.45) + 'px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillText('KNOCKED OUT', 0, c * 0.9); x.restore();
    }
    x.restore();
  }
  function backOut(t) { var s = 1.7; t -= 1; return t * t * ((s + 1) * t + s) + 1; }

  function drawFx(x, dt) {
    x.globalCompositeOperation = 'lighter';
    for (var i = G.rings.length - 1; i >= 0; i--) {
      var r = G.rings[i]; r.t += dt; var p = r.t / r.dur; if (p >= 1) { G.rings.splice(i, 1); continue; }
      x.beginPath(); x.arc(r.x, r.y, r.r * (1 - Math.pow(1 - p, 3)), 0, Math.PI * 2); x.lineWidth = 26 * (1 - p); x.strokeStyle = rgba(r.col, 0.5 * (1 - p)); x.stroke();
    }
    for (var j = G.parts.length - 1; j >= 0; j--) {
      var s = G.parts[j]; s.life += dt; if (s.life >= s.max) { G.parts.splice(j, 1); continue; }
      s.vy += 0.0016 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.vr * dt;
      var a = 1 - s.life / s.max; x.globalAlpha = a; x.fillStyle = s.col;
      x.save(); x.translate(s.x, s.y); x.rotate(s.r); x.beginPath(); x.moveTo(0, -s.s); x.lineTo(s.s * 0.55, s.s * 0.4); x.lineTo(-s.s * 0.45, s.s * 0.6); x.closePath(); x.fill(); x.restore();
    }
    x.globalAlpha = 1;
    for (var k = G.comets.length - 1; k >= 0; k--) {
      var c = G.comets[k]; c.t += dt; var q = Math.min(1, c.t / c.dur), e = q * q * (3 - 2 * q);
      var mx = (c.x0 + c.x1) / 2, my = Math.min(c.y0, c.y1) - 260;
      for (var tr = 0; tr < 10; tr++) {
        var qq = Math.max(0, e - tr * 0.025), px = (1 - qq) * (1 - qq) * c.x0 + 2 * (1 - qq) * qq * mx + qq * qq * c.x1, py = (1 - qq) * (1 - qq) * c.y0 + 2 * (1 - qq) * qq * my + qq * qq * c.y1;
        x.globalAlpha = (1 - tr / 10) * 0.8; x.fillStyle = tr ? c.col : '#fff'; x.beginPath(); x.arc(px, py, (14 - tr) * (0.6 + c.n * 0.12), 0, Math.PI * 2); x.fill();
      }
      if (q >= 1) {
        G.comets.splice(k, 1);
        if (c.to.alive) { c.to.incoming.push({ n: c.n, at: G.time + 1100 }); c.to.shake = 8; for (var z = 0; z < 14; z++) shard(c.x1 + 10, c.y1, '#ff5c8a', 1); sfx('garbage', 1); }
      }
    }
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ the game
  function start(opts) {
    var pl = opts.players, solo = pl.length === 1, seed = Math.floor(Math.random() * 1e9);
    G = { boards: [], parts: [], rings: [], comets: [], cubes: [], beams: [], warp: 0, punch: 0, time: 0, ko: 0, phase: 'count', countT: 3600, over: false, solo: solo, opts: opts, startLevel: 1, speedT: 0, music: true, lastCount: 4 };
    for (var i = 0; i < pl.length; i++) G.boards.push(new Board(pl[i], i, pl.length, seed, solo));
    layoutBoards();
    A.tint(solo ? [[122, 247, 255], [178, 123, 255], [79, 134, 255]] : [[255, 92, 138], [178, 123, 255], [94, 242, 255]]);
    G.stages = stagesOn(); G.stage = 2; G.prevStage = -1; G.stageT = 9999;
    if (G.stages) setStage(stageFor(G.startLevel), true); else { MUSIC.track = 'mu_sf_a'; MUSIC.layer = 'mu_sf_b'; MUSIC.bpm = 108; MUSIC.xfade = 0; }
    MUSIC.intensity = 0; if (A.soundPack) { A.soundPack('sf'); A.musicRestart(); }
    if (A.dj) A.dj.startFor('shardfall', G.stages ? STAGES[G.stage].q : null, G.stages ? STAGES[G.stage].name : null);
    A.music(MUSIC, G.stages ? STAGES[G.stage].bpm : 108);
  }
  function frame(dt, x, now) {
    if (!G) return;
    x.clearRect(0, 0, W, H);
    var paused = A.modalOpen();
    if (!paused) {
      G.time += dt;
      if (G.phase === 'count') {
        G.countT -= dt; var cn = Math.ceil(G.countT / 1000);
        if (cn !== G.lastCount) { G.lastCount = cn; if (cn > 0) A.sfx.count(); else A.sfx.go(); }
        if (G.countT <= 0) { G.phase = 'play'; for (var i = 0; i < G.boards.length; i++) G.boards[i].spawn(); }
      } else if (G.phase === 'play') {
        var alive = 0, maxDanger = 0;
        for (var j = 0; j < G.boards.length; j++) { var b = G.boards[j]; b.update(dt); if (b.alive) alive++; maxDanger = Math.max(maxDanger, b.danger || 0); }
        MUSIC.intensity = Math.min(1, maxDanger * 0.8 + (G.boards[0].level - 1) / 12);
        if (!G.solo) {
          G.speedT += dt;
          if (G.speedT > 40000) { G.speedT = 0; for (var k = 0; k < G.boards.length; k++) if (G.boards[k].alive) { G.boards[k].level++; G.boards[k].pop('SPEED UP', '', '#ffffff', 0.9); } sfx('level'); if (G.stages) checkStage(); A.musicTempo(G.stages ? stageTempo(topLevel()) : Math.min(156, 108 + G.boards[0].level * 4)); }
          if (alive <= 1) { for (var w = 0; w < G.boards.length; w++) if (G.boards[w].alive) { G.boards[w].place = 1; G.winner = G.boards[w]; G.boards[w].pop('WINNER', '', '#ffd66e', 1.5); } endSoon(); }
        } else if (!alive) endSoon();
      } else if (G.phase === 'end') {
        for (var e = 0; e < G.boards.length; e++) G.boards[e].update(dt);
        G.endT -= dt; if (G.endT <= 0 && !G.over) results();
      }
    }
    var HI = hi(), fdt = paused ? 0 : dt, pulse = 0;
    lightSky(!HI);
    if (!HI && G.stages) for (var lb = 0; lb < G.boards.length; lb++) { var LL = G.boards[lb].layout; x.fillStyle = 'rgba(2,3,10,.55)'; rr(x, LL.bx - 10, LL.by - 10, LL.bw + 20, LL.bh + 20, 18); x.fill(); }
    if (HI) {
      var cur = STAGES[G.stage].sky; G.stageT += fdt;
      if (G.prevStage >= 0 && G.stageT < 1600) {
        drawSky(STAGES[G.prevStage].sky, x, fdt, SP ? SP.pulse : 0, MUSIC.intensity || 0);
        x.globalAlpha = Math.min(1, G.stageT / 1600); x.save(); drawSky(cur, x, fdt, SP ? SP.pulse : 0, MUSIC.intensity || 0); x.restore(); x.globalAlpha = 1;
      } else drawSky(cur, x, fdt, SP ? SP.pulse : 0, MUSIC.intensity || 0);
      pulse = beatPulse(fdt);
      G.punch *= Math.pow(0.004, fdt / 1000);
      if (G.punch > 0.01) { var zp = 1 + G.punch * 0.035; x.save(); x.translate(W / 2, H / 2); x.scale(zp, zp); x.translate(-W / 2, -H / 2); }
      // a dark glass panel behind each board so busy skies never fight the pieces
      for (var bk = 0; bk < G.boards.length; bk++) { var KL = G.boards[bk].layout; x.fillStyle = 'rgba(2,3,10,.62)'; rr(x, KL.bx - 10, KL.by - 10, KL.bw + 20, KL.bh + 20, 18); x.fill(); }
      // board rims breathe with the beat
      x.globalCompositeOperation = 'lighter';
      for (var bi = 0; bi < G.boards.length; bi++) {
        var BL = G.boards[bi].layout, bc = G.stages && G.solo ? STAGES[G.stage].rim : (G.boards[bi].color || '#7af7ff'), gl = 0.18 + pulse * 0.35 + (G.boards[bi].danger || 0) * 0.2;
        x.shadowColor = rgba(bc, Math.min(1, gl * 2)); x.shadowBlur = 40 + pulse * 30; x.strokeStyle = rgba(bc, gl); x.lineWidth = 3;
        rr(x, BL.bx - 10, BL.by - 10, BL.bw + 20, BL.bh + 20, 18); x.stroke();
      }
      x.shadowBlur = 0; x.shadowColor = 'rgba(0,0,0,0)'; x.globalCompositeOperation = 'source-over';
    }
    for (var d = 0; d < G.boards.length; d++) drawBoard(x, G.boards[d], now);
    if (HI) { drawBeams(x, fdt); drawCubes(x, fdt); }
    drawFx(x, fdt);
    if (HI && G.punch > 0.01) x.restore();
    drawStageBanner(x, fdt);
    if (G.phase === 'count') {
      var t = G.countT / 1000, num = Math.ceil(t), fr = num - t;
      x.save(); x.translate(W / 2, H / 2); var sc = 1.5 - fr * 0.5; x.scale(sc, sc); x.globalAlpha = Math.min(1, (1 - fr) * 3);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = font(220); x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,0.5)';
      var label = num > 3 ? '' : String(num); if (label) { x.strokeText(label, 0, 0); x.fillStyle = '#fff'; x.fillText(label, 0, 0); }
      x.restore(); x.textBaseline = 'alphabetic';
      if (G.countT > 3000) { x.textAlign = 'center'; x.font = font(64); x.fillStyle = '#fff'; x.fillText((G.solo ? 'Shardfall' : 'Battle') + (G.stages ? ' · ' + STAGES[G.stage].name : ''), W / 2, H / 2 - 20); x.font = '600 26px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,.6)'; x.fillText(G.solo ? 'Clear lines, fill the Well, pull the Collapse' : 'Clears attack a rival · last board standing wins', W / 2, H / 2 + 34); }
    }
    if (G.phase === 'play' && G.time < 4500 + 3600 && G.time > 3600) {
      x.globalAlpha = Math.min(1, (4500 + 3600 - G.time) / 600); x.textAlign = 'center'; x.font = '600 21px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,.55)';
      x.fillText('Remote: ◀ ▶ move · ▲ turn · ▼ drop · OK slam · CH hold · ▶❚❚ Collapse      Controller: A/B turn · ▲ slam · LB hold · Y Collapse', W / 2, 36); x.globalAlpha = 1;
    }
  }
  function endSoon() { if (G.phase === 'end') return; G.phase = 'end'; G.endT = G.solo ? 1800 : 2600; A.musicStop(); if (!G.solo) sfx('win'); }
  function results() {
    G.over = true;
    var bs = G.boards.slice(0).sort(function (a, b) { return G.solo ? b.score - a.score : (a.place || 99) - (b.place || 99); });
    var rows = '';
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], p = b.p, nb = b.score > (p.sf.best || 0) && b.score > 0;
      if (nb) { p.sf.best = b.score; } if (b.lines > (p.sf.bestLines || 0)) p.sf.bestLines = b.lines;
      p.sf.games = (p.sf.games || 0) + 1;
      if (!G.solo) { p.sf.battles = (p.sf.battles || 0) + 1; if (b === G.winner) p.sf.wins = (p.sf.wins || 0) + 1; }
      rows += '<div class="ar-rr"><span class="ar-rk">' + (G.solo ? '' : ordinal(b.place || i + 1)) + '</span><span class="ar-rn" style="color:' + p.color + '">' + A.esc(p.name) + (nb ? '<span class="ar-nb">NEW BEST</span>' : '') + '</span>' +
        '<span class="ar-rx">' + b.lines + ' lines · level ' + b.level + (b.stats.quads ? ' · ' + b.stats.quads + ' shatter' + (b.stats.quads > 1 ? 's' : '') : '') + (G.solo ? '' : ' · sent ' + b.sent) + '</span><span class="ar-rs" style="width:220px;text-align:right">' + A.fmt(b.score) + '</span></div>';
    }
    A.saveProfiles();
    var title = G.solo ? (bs[0].score >= bs[0].p.sf.best ? 'New best!' : 'Game over') : A.esc(G.winner ? G.winner.p.name : bs[0].p.name) + ' wins';
    if (G.solo && bs[0].score < bs[0].p.sf.best) title = 'Game over';
    var best = G.solo ? '<div class="ar-sub">Your best: ' + A.fmt(bs[0].p.sf.best) + '</div>' : '', marks = []; for (var mi = 0; mi < bs.length; mi++) if (bs[mi].score >= bs[mi].p.sf.best && bs[mi].score > 0) marks.push(bs[mi].p.id);
    A.menu({ wide: true, eyebrow: 'Shardfall', title: title, body: best + '<div class="ar-res">' + rows + '</div>' + (G.solo ? A.boardHtml('shardfall', marks, 4) : ''), opts: [
      { label: 'Play again', go: true, run: function () { A.closeModal(); start(G.opts); } },
      { label: 'Change players', run: function () { A.exitGame('sfLobby'); } },
      { label: 'Back to the arcade', run: function () { A.exitGame('home'); } }], back: function () { A.exitGame('home'); } });
  }
  function input(ev) {
    if (!G) return;
    if (ev.act === 'BACK' || ev.act === 'START') { if (!G.over) pause(); return; }
    if (G.phase !== 'play') return;
    for (var i = 0; i < G.boards.length; i++) if (G.boards[i].pl.src === ev.src) { G.boards[i].input(ev); return; }
    // a controller that isn't playing does nothing (so a stray press can't hurt a game)
  }
  function pause() {
    A.musicStop();
    A.menu({ eyebrow: 'Shardfall', title: 'Paused', sub: 'Remote: ◀ ▶ move · ▲ turn · ▼ soft drop · OK slam down · CH +/− hold · ▶❚❚ Collapse<br>Controller: A / B turn · D-pad ▲ slam · LB / RB hold · Y Collapse', opts: [
      { label: 'Resume', go: true, run: function () { A.closeModal(); A.music(MUSIC, Math.min(156, 104 + G.boards[0].level * 4)); } },
      { label: 'Restart', run: function () { A.closeModal(); start(G.opts); } },
      { label: 'Quit to the arcade', run: function () { A.exitGame('home'); } }], back: function () { A.closeModal(); A.music(MUSIC, 108); } });
  }
  function stop() { lightSky(false); G = null; A.musicStop(); }

  // home-screen card: crystals drifting down and stacking
  function card(slot) {
    // a little synthwave scene: neon sun over the grid, crystals tumbling down in front
    var st = { pieces: [], spr: null, last: 0 };
    function spawn(w, y) { st.pieces.push({ t: TYPES[Math.floor(Math.random() * 7)], r: Math.floor(Math.random() * 4), x: 10 + Math.random() * (w - 110), y: y, v: 0.035 + Math.random() * 0.05, s: 0.55 + Math.random() * 0.8, rot: (Math.random() - 0.5) * 0.4, vr: (Math.random() - 0.5) * 0.0006 }); }
    slot.draw = function (x, t, sel, w) {
      var h = 560, dt = Math.min(50, t - (st.last || t)); st.last = t;
      if (!st.spr) { st.spr = sprites(34); skyInit(); for (var k = 0; k < 6; k++) spawn(w, Math.random() * 260 - 80); }
      var hz = 196, g = x.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#0a0322'); g.addColorStop(0.65, '#3a0d5c'); g.addColorStop(1, '#a3247f');
      x.fillStyle = g; x.fillRect(0, 0, w, hz); x.fillStyle = '#0b0220'; x.fillRect(0, hz, w, h - hz);
      for (var i = 0; i < 30; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.2 + 0.2 * Math.sin(t / 500 + i)) + ')'; x.fillRect((i * 137) % w, (i * 71) % 150, 2, 2); }
      x.save(); x.shadowColor = '#ff4fa8'; x.shadowBlur = 50; x.drawImage(SKY.sun, w / 2 - 95, hz - 150, 190, 190); x.restore();
      x.drawImage(SKY.mtn, 0, 0, 1920, 260, -w * 0.1, hz - 56, w * 1.6, 64);
      x.save(); x.beginPath(); x.rect(0, hz, w, h - hz); x.clip(); x.strokeStyle = 'rgba(255,60,210,.6)'; x.lineWidth = 1.5; x.beginPath();
      for (i = -12; i <= 12; i++) { x.moveTo(w / 2 + i * 24, hz); x.lineTo(w / 2 + i * 200, h); }
      var sp = (t / 1400) % 1; for (i = 0; i < 12; i++) { var yy = hz + (h - hz) * (1 / (i + 1 - sp)) * 0.5; if (yy > hz && yy < h) { x.moveTo(0, yy); x.lineTo(w, yy); } }
      x.stroke(); x.restore();
      var hg = x.createLinearGradient(0, hz - 14, 0, hz + 24); hg.addColorStop(0, 'rgba(255,80,200,0)'); hg.addColorStop(0.5, 'rgba(255,80,200,.55)'); hg.addColorStop(1, 'rgba(255,80,200,0)'); x.fillStyle = hg; x.fillRect(0, hz - 14, w, 38);
      if (st.pieces.length < 6 && Math.random() < 0.04) spawn(w, -130);
      for (var j = st.pieces.length - 1; j >= 0; j--) {
        var p = st.pieces[j]; p.y += p.v * dt * (sel ? 1.8 : 1); p.rot += p.vr * dt; if (p.y > 300) { st.pieces.splice(j, 1); continue; }
        var m = ROT[p.t][p.r], c = 34 * p.s; x.globalAlpha = Math.min(1, p.s);
        x.save(); x.translate(p.x + c * 1.5, p.y + c * 1.5); x.rotate(p.rot);
        for (var a = 0; a < m.length; a++) for (var bb = 0; bb < m.length; bb++) if (m[a][bb]) x.drawImage(st.spr.cell[CIDX[p.t]], (bb - 1.5) * c, (a - 1.5) * c, c, c);
        x.restore();
      }
      x.globalAlpha = 1;
    };
  }

  A.register('shardfall', { debug: function () { return G; }, Board: Board, start: start, frame: frame, input: input, stop: stop, card: card });
})();
