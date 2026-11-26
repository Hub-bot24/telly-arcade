/*
 * TIDEWAR: a sonar fleet battle. Versus the computer (Cadet, Captain or Admiral) or two players on one TV.
 *
 * Twists:
 *  - A hit earns another shot, so a good run can swing the game.
 *  - Sonar (once per game): ping a 3x3 patch and learn how many ship sections hide in it.
 *  - Barrage (earned each time you sink a ship): five shells in a plus shape.
 * Two players pass the remote (or each use a controller); a curtain hides the boards between turns.
 */
(function () {
  'use strict';
  var A = window.ARCADE; if (!A) return;
  var W = 1920, H = 1080, N = 10;
  var FLEET = [{ n: 'Dreadnought', l: 5 }, { n: 'Cruiser', l: 4 }, { n: 'Destroyer', l: 3 }, { n: 'Submarine', l: 3 }, { n: 'Corvette', l: 2 }];
  var LET = 'ABCDEFGHIJ';
  var T = null;

  function rr(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.lineTo(px + w - r, py); x.quadraticCurveTo(px + w, py, px + w, py + r); x.lineTo(px + w, py + h - r); x.quadraticCurveTo(px + w, py + h, px + w - r, py + h); x.lineTo(px + r, py + h); x.quadraticCurveTo(px, py + h, px, py + h - r); x.lineTo(px, py + r); x.quadraticCurveTo(px, py, px + r, py); x.closePath(); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function font(sz, wt) { return (wt || 700) + ' ' + sz + 'px "Bricolage Grotesque", Manrope, sans-serif'; }
  function mfont(sz, wt) { return (wt || 600) + ' ' + sz + 'px Manrope, sans-serif'; }

  // ------------------------------------------------------------------ fleets
  function placeFleet() {
    for (var tries = 0; tries < 200; tries++) {
      var occ = [], ships = [], ok = true;
      for (var i = 0; i < N * N; i++) occ.push(-1);
      for (var s = 0; s < FLEET.length && ok; s++) {
        var L = FLEET[s].l, placed = false;
        for (var k = 0; k < 300 && !placed; k++) {
          var hz = Math.random() < 0.5, x = Math.floor(Math.random() * (hz ? N - L + 1 : N)), y = Math.floor(Math.random() * (hz ? N : N - L + 1)), fit = true;
          for (var j = 0; j < L && fit; j++) {
            var cx = x + (hz ? j : 0), cy = y + (hz ? 0 : j);
            // keep a one-cell gap between ships (diagonals allowed) so fleets look tidy
            for (var dy = -1; dy <= 1 && fit; dy++) for (var dx = -1; dx <= 1 && fit; dx++) {
              if (dx && dy) continue; var nx = cx + dx, ny = cy + dy;
              if (nx >= 0 && ny >= 0 && nx < N && ny < N && occ[ny * N + nx] >= 0) fit = false;
            }
          }
          if (!fit) continue;
          var cells = [];
          for (var m = 0; m < L; m++) { var px = x + (hz ? m : 0), py = y + (hz ? 0 : m); occ[py * N + px] = s; cells.push(py * N + px); }
          ships.push({ n: FLEET[s].n, l: L, x: x, y: y, hz: hz, cells: cells, hits: 0, sunk: false, sunkT: 0 });
          placed = true;
        }
        if (!placed) ok = false;
      }
      if (ok) return { occ: occ, ships: ships };
    }
    return placeFleet();
  }
  function Side(pid, ai) {
    var p = pid ? A.profile(pid) : null;
    this.p = p; this.name = p ? p.name : ['Cadet', 'Captain', 'Admiral'][ai - 1] + ' Vex'; this.color = p ? p.color : '#ff6b7a';
    this.ai = ai || 0; var f = placeFleet(); this.occ = f.occ; this.ships = f.ships;
    this.shots = []; for (var i = 0; i < N * N; i++) this.shots.push(0); // shots fired AT this side: 0 none, 1 miss, 2 hit
    this.sonar = []; // sonar readings taken ON this side
    this.fired = 0; this.hitsMade = 0; this.sonarLeft = 1; this.barrages = 0; this.weapon = 0;
    this.cursor = 44; this.burn = {};
  }
  Side.prototype.reshuffle = function () { var f = placeFleet(); this.occ = f.occ; this.ships = f.ships; };
  Side.prototype.alive = function () { for (var i = 0; i < this.ships.length; i++) if (!this.ships[i].sunk) return true; return false; };

  // ------------------------------------------------------------------ computer commander
  // The computer plays fair: it only ever sees what you would see on its screen (its own hits and misses,
  // which ships it has sunk, and which ship types are still afloat). It never reads where your ships are.
  function publicView(foe) {
    var v = { shots: foe.shots.slice(0), sunk: [], left: [] }, i;
    for (i = 0; i < N * N; i++) v.sunk.push(false);
    for (var s = 0; s < foe.ships.length; s++) {
      var sh = foe.ships[s];
      if (sh.sunk) { for (i = 0; i < sh.cells.length; i++) v.sunk[sh.cells[i]] = true; }   // sunk ships are revealed to both players
      else v.left.push(sh.l);                                                                    // the fleet list is public
    }
    return v;
  }
  function aiPick(me, foe) {
    var V = publicView(foe), shots = V.shots, lvl = me.ai, open = [], i;
    for (i = 0; i < N * N; i++) if (!shots[i]) open.push(i);
    var live = [];   // hits that aren't part of a sunk ship yet
    for (i = 0; i < N * N; i++) if (shots[i] === 2 && !V.sunk[i]) live.push(i);
    if (lvl === 1 && Math.random() < 0.45) live = [];   // the Cadet forgets about its hits half the time
    var pick;
    if (lvl >= 3 || (lvl === 2 && live.length)) {
      var d = density(V, live); T.aiHeat = d;
      if (lvl === 3 && !live.length && me.sonarLeft && me.fired > 6) { var best = bestPatch(d, V); if (best >= 0) return { kind: 'sonar', cell: best }; }
      if (lvl >= 2 && !live.length && me.barrages > 0) { var bp = bestPlus(d, V); if (bp >= 0) return { kind: 'barrage', cell: bp }; }
      var top = -1, bi = open[0];
      for (i = 0; i < open.length; i++) { var v = d[open[i]] + Math.random() * 0.01; if (v > top) { top = v; bi = open[i]; } }
      return { kind: 'shot', cell: bi };
    }
    var heat = []; for (i = 0; i < N * N; i++) heat.push(0);
    if (live.length) {
      var nb = [];
      for (i = 0; i < live.length; i++) { var x = live[i] % N, y = Math.floor(live[i] / N), cand = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]; for (var k = 0; k < 4; k++) { var cx = cand[k][0], cy = cand[k][1]; if (cx >= 0 && cy >= 0 && cx < N && cy < N && !shots[cy * N + cx]) nb.push(cy * N + cx); } }
      if (nb.length) { for (i = 0; i < nb.length; i++) heat[nb[i]] = 1; T.aiHeat = heat; return { kind: 'shot', cell: nb[Math.floor(Math.random() * nb.length)] }; }
    }
    var par = []; for (i = 0; i < open.length; i++) if (lvl > 1 ? ((open[i] % N) + Math.floor(open[i] / N)) % 2 === 0 : true) par.push(open[i]);
    var pool = par.length ? par : open;
    for (i = 0; i < pool.length; i++) heat[pool[i]] = 1; T.aiHeat = heat;
    return { kind: 'shot', cell: pool[Math.floor(Math.random() * pool.length)] };
  }
  // how many ways each remaining ship could still fit over each square, given only the shots so far
  function density(V, live) {
    var d = [], shots = V.shots, i; for (i = 0; i < N * N; i++) d.push(0);
    for (var s = 0; s < V.left.length; s++) {
      var L = V.left[s];
      for (var hz = 0; hz < 2; hz++) for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
        if (hz ? x + L > N : y + L > N) continue;
        var ok = true, hitsIn = 0;
        for (var j = 0; j < L; j++) { var c = (y + (hz ? 0 : j)) * N + x + (hz ? j : 0); if (shots[c] === 1 || V.sunk[c]) { ok = false; break; } if (shots[c] === 2) hitsIn++; }
        if (!ok) continue;
        var w = live.length ? (hitsIn ? 1 + hitsIn * 30 : 1) : 1;
        for (var m = 0; m < L; m++) { var cc = (y + (hz ? 0 : m)) * N + x + (hz ? m : 0); if (!shots[cc]) d[cc] += w; }
      }
    }
    return d;
  }
  function bestPatch(d, V) { var foe = V; var b = -1, bv = 0; for (var y = 1; y < N - 1; y++) for (var x = 1; x < N - 1; x++) { var v = 0, open = 0; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { v += d[(y + dy) * N + x + dx]; if (!foe.shots[(y + dy) * N + x + dx]) open++; } if (open >= 7 && v > bv) { bv = v; b = y * N + x; } } return b; }
  function bestPlus(d, V) { var foe = V; var b = -1, bv = 0; for (var y = 1; y < N - 1; y++) for (var x = 1; x < N - 1; x++) { var c = plus(y * N + x), v = 0; for (var i = 0; i < c.length; i++) if (!foe.shots[c[i]]) v += d[c[i]]; if (v > bv) { bv = v; b = y * N + x; } } return b; }
  function plus(c) { var x = c % N, y = Math.floor(c / N), out = [c]; if (x > 0) out.push(c - 1); if (x < N - 1) out.push(c + 1); if (y > 0) out.push(c - N); if (y < N - 1) out.push(c + N); return out; }
  function patch(c) { var x = c % N, y = Math.floor(c / N), out = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(ny * N + nx); } return out; }

  // ------------------------------------------------------------------ sound
  function sfx(n) {
    if (A.play && A.play('tw_' + n, { vary: n === 'move' ? 0.04 : 0 })) return;
    var t = A.tone, z = A.noise;
    if (n === 'ping') { t(1180, 1.6, 'sine', 0.2); t(1180, 1.2, 'sine', 0.06, 0, 0.32); t(1180, 0.8, 'sine', 0.025, 0, 0.64); }
    else if (n === 'whistle') { t(1900, 0.5, 'sine', 0.05, 500); }
    else if (n === 'splash') { z(0.6, 0.25, 1400, 0, 0.7, 300); t(300, 0.2, 'sine', 0.1, 120); }
    else if (n === 'boom') { z(0.9, 0.45, 500, 0, 0.6, 60); t(90, 0.7, 'sine', 0.5, 30); t(180, 0.3, 'sawtooth', 0.08, 50); }
    else if (n === 'sink') { z(2.2, 0.35, 300, 0, 0.8, 50); t(140, 2, 'sawtooth', 0.08, 40); t(70, 2.2, 'sine', 0.4, 25); t(620, 1.4, 'triangle', 0.04, 380, 0.4); }
    else if (n === 'move') { t(900, 0.03, 'sine', 0.05); }
    else if (n === 'weapon') { t(700, 0.08, 'square', 0.05, 1100); }
    else if (n === 'win') { [392, 523, 659, 784, 1047].forEach(function (f, i) { t(f, 0.5, 'triangle', 0.14, 0, i * 0.13); }); }
    else if (n === 'lose') { [392, 349, 311, 262].forEach(function (f, i) { t(f, 0.5, 'triangle', 0.12, 0, i * 0.18); }); }
  }
  var MUSIC = { bpm: 70, track: 'mu_tw', play: function (step, tt, spb, bus, a) {
    var s = step % 32, m = A.mtone, n = A.note, roots = [38, 38, 41, 36];
    var r = roots[Math.floor(step / 32) % 4];
    if (s === 0) { m(a, bus, tt, n(r), spb * 30, 'sawtooth', 0.12, 380); m(a, bus, tt, n(r + 7), spb * 30, 'triangle', 0.06, 700); m(a, bus, tt, n(r + 15), spb * 30, 'sine', 0.04, 1200); }
    if (s === 16) m(a, bus, tt, n(r + 36 + 7), spb * 6, 'sine', 0.035, 3000);
    if (s % 8 === 4) m(a, bus, tt, n(r + 24 + [0, 3, 7, 10][(step / 8 | 0) % 4]), spb * 3, 'triangle', 0.025, 2000);
  } };

  // ------------------------------------------------------------------ layout
  var C = 60, GL = { x: 160, y: 300 }, GR = { x: 1160, y: 300 }, GS = N * C;
  function cellXY(g, c) { return { x: g.x + (c % N) * C, y: g.y + Math.floor(c / N) * C }; }

  // ------------------------------------------------------------------ effects
  function boom(x, y, big) {
    for (var i = 0; i < (big ? 70 : 34); i++) { var a = Math.random() * 6.28, v = Math.random() * (big ? 0.55 : 0.35); T.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.15, life: 0, max: 400 + Math.random() * 700, s: 4 + Math.random() * 10, k: 'fire' }); }
    for (var j = 0; j < (big ? 20 : 8); j++) T.parts.push({ x: x + (Math.random() - 0.5) * 30, y: y, vx: (Math.random() - 0.5) * 0.05, vy: -0.04 - Math.random() * 0.05, life: 0, max: 1500 + Math.random() * 1500, s: 14 + Math.random() * 20, k: 'smoke' });
    T.flash = big ? 0.5 : 0.25; T.shake = big ? 22 : 10;
  }
  function splash(x, y) {
    T.rip.push({ x: x, y: y, t: 0, dur: 700, r: C * 0.8 });
    for (var i = 0; i < 46; i++) { var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, v = 0.15 + Math.random() * 0.35; T.parts.push({ x: x, y: y, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, life: 0, max: 500 + Math.random() * 500, s: 2 + Math.random() * 4, k: 'drop' }); }
    T.rip.push({ x: x, y: y, t: 0, dur: 1100, r: C * 1.3 });
  }

  // ------------------------------------------------------------------ game flow
  function start(opts) {
    T = { opts: opts, sides: [new Side(opts.p1, 0), opts.mode ? new Side(opts.p2, 0) : new Side(null, opts.diff + 1)], turn: 0, phase: 'place', placeFor: 0, placeIdx: 0,
      parts: [], rip: [], shells: [], banners: [], flash: 0, shake: 0, t: 0, busy: false, aiT: 0, aiCursor: 44, aiTarget: null, curtain: null, over: false, sweep: 0, extra: false };
    A.tint([[30, 200, 190], [20, 70, 140], [60, 255, 210]]);
    if (A.soundPack) { A.soundPack('tw'); A.musicRestart(); } if (A.dj) A.dj.startFor('tidewar'); A.music(MUSIC, 70);
  }
  function me() { return T.sides[T.turn]; }
  function foe() { return T.sides[1 - T.turn]; }
  function human(s) { return !s.ai; }

  function banner(txt, sub, col, dur) { T.banners.push({ txt: txt, sub: sub || '', col: col || '#fff', t: 0, dur: dur || 1800 }); if (T.banners.length > 2) T.banners.shift(); }

  function fire(kind, cell) {
    var a = me(), d = foe(), cells;
    if (kind === 'sonar') {
      if (!a.sonarLeft) return; a.sonarLeft = 0; a.weapon = 0;
      cells = patch(cell); var cnt = 0; for (var i = 0; i < cells.length; i++) if (d.occ[cells[i]] >= 0 && d.shots[cells[i]] !== 2) cnt++;
      d.sonar.push({ c: cell, n: cnt, t: 0 }); sfx('ping');
      var g = gridOf(d), pt = cellXY(g, cell); T.rip.push({ x: pt.x + C / 2, y: pt.y + C / 2, t: 0, dur: 1600, r: C * 2.2, sonar: true });
      banner(cnt ? cnt + ' contact' + (cnt > 1 ? 's' : '') : 'Nothing there', 'Sonar sweep', '#5ef2d0', 1600);
      T.busy = true; setTimeout(function () { T && (T.busy = false, afterShot(true)); }, 1500);
      return;
    }
    if (kind === 'barrage') { if (a.barrages <= 0) return; a.barrages--; a.weapon = 0; cells = plus(cell).filter(function (c) { return !d.shots[c]; }); if (!cells.length) cells = [cell]; }
    else { if (d.shots[cell]) { A.sfx.back(); return; } cells = [cell]; }
    T.busy = true;
    var g2 = gridOf(d), res = { hit: false, n: cells.length, done: 0 };
    cells.forEach(function (c, i) {
      var to = cellXY(g2, c), fromG = gridOf(a), from = { x: fromG.x + GS / 2, y: fromG.y + GS + 40 };
      T.shells.push({ x0: from.x, y0: from.y, x1: to.x + C / 2, y1: to.y + C / 2, t: -i * 160, dur: 560, cell: c, res: res });
    });
    sfx('whistle');
  }
  function land(sh) {
    var a = me(), d = foe(), c = sh.cell, s = d.occ[c];
    a.fired++;
    if (s >= 0) {
      d.shots[c] = 2; a.hitsMade++; sh.res.hit = true;
      var ship = d.ships[s]; ship.hits++;
      boom(sh.x1, sh.y1, false); sfx('boom');
      if (ship.hits >= ship.l) {
        ship.sunk = true; ship.sunkT = 0; a.barrages++;
        setTimeout(function () { if (!T) return; var g = gridOf(d), p0 = cellXY(g, ship.cells[0]), p1 = cellXY(g, ship.cells[ship.l - 1]); boom((p0.x + p1.x) / 2 + C / 2, (p0.y + p1.y) / 2 + C / 2, true); sfx('sink'); }, 250);
        banner(ship.n + ' sunk', human(a) ? 'Barrage ready' : '', '#ff8a5c', 2200);
      }
    } else { d.shots[c] = 1; splash(sh.x1, sh.y1); sfx('splash'); }
    sh.res.done++;
    if (sh.res.done >= sh.res.n) setTimeout(function () { if (T) { T.busy = false; afterShot(sh.res.hit); } }, sh.res.hit ? 900 : 650);
  }
  function afterShot(again) {
    var a = me(), d = foe();
    if (!d.alive()) { finish(a, d); return; }
    if (again && T.opts.again !== false) { if (a.ai) T.aiT = 900; return; } // hits (and sonar) keep the turn, unless switched off
    // turn passes
    T.turn = 1 - T.turn;
    if (me().ai) { T.aiT = 1100; banner(me().name + ' is hunting', '', me().color, 1200); }
    else if (T.opts.mode) { T.curtain = { to: me(), t: 0 }; }
    else banner('Your shot', '', me().color, 900);
  }
  function finish(win, lose) {
    T.over = true; T.phase = 'end';
    A.musicStop();
    var humanWon = !win.ai;
    sfx(humanWon ? 'win' : 'lose');
    setTimeout(function () {
      if (!T) return;
      var shots = win.fired;
      if (win.p) { win.p.tw.wins++; if (!win.p.tw.best || shots < win.p.tw.best) { win.newBest = true; win.p.tw.best = shots; } }
      if (lose.p) lose.p.tw.losses++;
      for (var i = 0; i < 2; i++) { var s = T.sides[i]; if (s.p) { s.p.tw.shots += s.fired; s.p.tw.hits += s.hitsMade; } }
      A.saveProfiles();
      var rows = '';
      [win, lose].forEach(function (s, i) {
        rows += '<div class="ar-rr"><span class="ar-rk">' + (i ? '' : '★') + '</span><span class="ar-rn" style="color:' + s.color + '">' + A.esc(s.name) + (s.newBest ? '<span class="ar-nb">FASTEST WIN</span>' : '') + '</span>' +
          '<span class="ar-rx">' + s.fired + ' shots · ' + (s.fired ? Math.round(100 * s.hitsMade / s.fired) : 0) + '% hit</span><span class="ar-rs" style="width:200px;text-align:right">' + (i ? 'sunk' : 'victory') + '</span></div>';
      });
      A.menu({ wide: true, eyebrow: 'Tidewar', title: humanWon ? A.esc(win.name) + ' rules the waves' : 'Your fleet is lost', body: '<div class="ar-res">' + rows + '</div>' + A.boardHtml('tidewar', [], 4), opts: [
        { label: 'Play again', go: true, run: function () { A.closeModal(); start(T.opts); } },
        { label: 'Change settings', run: function () { A.exitGame('twSetup'); } },
        { label: 'Back to the arcade', run: function () { A.exitGame('home'); } }], back: function () { A.exitGame('home'); } });
    }, 2400);
  }
  function gridOf(side) {
    // the side whose turn it is (or the human in 1-player) sits on the left
    var left = T.opts.mode ? me() : T.sides[0];
    return side === left ? GL : GR;
  }

  // ------------------------------------------------------------------ input
  function input(ev) {
    if (!T) return;
    var a = ev.act;
    if (a === 'BACK' || a === 'START') { if (!T.over) pause(); return; }
    if (T.phase === 'place') { placeInput(a); return; }
    if (T.curtain) { if (a === 'A' || a === 'X') { T.curtain = null; A.sfx.ok(); banner(me().name + ', your shot', '', me().color, 1000); } return; }
    if (T.phase !== 'battle' || T.busy || me().ai || T.over) return;
    var s = me(), c = s.cursor, x = c % N, y = Math.floor(c / N);
    if (a === 'L') x = (x + N - 1) % N; else if (a === 'R') x = (x + 1) % N; else if (a === 'U') y = (y + N - 1) % N; else if (a === 'D') y = (y + 1) % N;
    else if (a === 'Y' || a === 'LB' || a === 'RB' || a === 'B') { cycleWeapon(s, a === 'LB' ? -1 : 1); return; }
    else if (a === 'A' || a === 'X') { fire(['shot', 'sonar', 'barrage'][s.weapon], c); return; }
    else return;
    s.cursor = y * N + x; sfx('move');
  }
  function cycleWeapon(s, d) {
    var ok = [true, s.sonarLeft > 0, s.barrages > 0], w = s.weapon;
    for (var k = 0; k < 3; k++) { w = (w + d + 3) % 3; if (ok[w]) break; }
    if (w === s.weapon && !ok[(s.weapon + d + 3) % 3]) { A.toast(s.sonarLeft ? 'Sink a ship to earn a Barrage' : 'Sonar used · sink a ship to earn a Barrage'); }
    s.weapon = w; sfx('weapon');
  }
  function placeInput(a) {
    var s = T.sides[T.placeFor];
    if (a === 'U' || a === 'D') { T.placeIdx = 1 - T.placeIdx; A.sfx.nav(); }
    else if (a === 'L' || a === 'R' || a === 'Y') { s.reshuffle(); sfx('weapon'); }
    else if (a === 'A' || a === 'X') {
      if (T.placeIdx === 0) { s.reshuffle(); sfx('weapon'); return; }
      A.sfx.ok();
      if (T.opts.mode && T.placeFor === 0) { T.placeFor = 1; T.placeIdx = 0; T.curtain = { to: T.sides[1], t: 0, place: true }; return; }
      T.phase = 'battle'; T.turn = 0;
      if (T.opts.mode) T.curtain = { to: T.sides[0], t: 0 }; else banner('Find the enemy fleet', 'Hits earn another shot', '#5ef2d0', 2000);
    }
  }
  function pause() {
    A.menu({ eyebrow: 'Tidewar', title: 'Paused', sub: 'Arrows aim · OK fires · ▶❚❚ / CH / Y switch weapon (Shot, Sonar, Barrage)<br>A hit earns another shot. Sinking a ship earns a Barrage.', opts: [
      { label: 'Resume', go: true, run: A.closeModal },
      { label: 'Restart', run: function () { A.closeModal(); start(T.opts); } },
      { label: 'Quit to the arcade', run: function () { A.exitGame('home'); } }], back: A.closeModal });
  }

  // ------------------------------------------------------------------ drawing
  function drawGrid(x, g, side, fog, active, now, title, sub) {
    // panel
    x.save();
    rr(x, g.x - 22, g.y - 22, GS + 44, GS + 44, 26); x.fillStyle = 'rgba(4,20,28,0.78)'; x.fill();
    x.lineWidth = 2; x.strokeStyle = active ? 'rgba(94,242,208,0.7)' : 'rgba(94,242,208,0.18)'; x.stroke();
    // water: slow caustic shimmer
    x.save(); rr(x, g.x, g.y, GS, GS, 8); x.clip();
    var wg = x.createLinearGradient(g.x, g.y, g.x + GS, g.y + GS); wg.addColorStop(0, '#062a33'); wg.addColorStop(1, '#03141c'); x.fillStyle = wg; x.fillRect(g.x, g.y, GS, GS);
    x.globalAlpha = 0.07; x.strokeStyle = '#7ff7e4'; x.lineWidth = 2;
    for (var w = 0; w < 14; w++) { x.beginPath(); var yy = g.y + w * 48 + ((now / 60) % 48); for (var xx = 0; xx <= GS; xx += 24) x.lineTo(g.x + xx, yy + Math.sin(xx / 60 + now / 900 + w) * 8); x.stroke(); }
    x.globalAlpha = 1;
    // sonar sweep on the enemy grid
    if (fog) {
      var cx = g.x + GS / 2, cy = g.y + GS / 2, ang = (now / 2600) * Math.PI * 2;
      for (var k = 0; k < 24; k++) { x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, GS * 0.75, ang - (k + 1) * 0.03, ang - k * 0.03); x.closePath(); x.fillStyle = 'rgba(94,242,208,' + (0.12 * (1 - k / 24)) + ')'; x.fill(); }
      x.strokeStyle = 'rgba(94,242,208,0.12)'; x.lineWidth = 1.5; for (var ring = 1; ring <= 3; ring++) { x.beginPath(); x.arc(cx, cy, ring * GS / 6.5, 0, 6.29); x.stroke(); }
    }
    // grid lines
    x.strokeStyle = 'rgba(127,247,228,0.13)'; x.lineWidth = 1; x.beginPath();
    for (var i = 1; i < N; i++) { x.moveTo(g.x + i * C + 0.5, g.y); x.lineTo(g.x + i * C + 0.5, g.y + GS); x.moveTo(g.x, g.y + i * C + 0.5); x.lineTo(g.x + GS, g.y + i * C + 0.5); }
    x.stroke();
    // ships (own waters, or revealed when sunk)
    for (var s = 0; s < side.ships.length; s++) { var sh = side.ships[s]; if (!fog || sh.sunk) drawShip(x, g, sh, side, fog, now); }
    // sonar readings
    for (var r = 0; r < side.sonar.length; r++) {
      var so = side.sonar[r], p = cellXY(g, so.c);
      x.strokeStyle = 'rgba(94,242,208,0.55)'; x.setLineDash([6, 6]); x.lineWidth = 2; x.strokeRect(p.x - C + 3, p.y - C + 3, C * 3 - 6, C * 3 - 6); x.setLineDash([]);
      x.fillStyle = 'rgba(94,242,208,0.08)'; x.fillRect(p.x - C + 3, p.y - C + 3, C * 3 - 6, C * 3 - 6);
      x.font = font(40); x.fillStyle = '#9ffbe8'; x.textAlign = 'center'; x.fillText(String(so.n), p.x + C / 2, p.y + C / 2 + 14);
    }
    // shot markers
    for (var c = 0; c < N * N; c++) {
      var v = side.shots[c]; if (!v) continue; var q = cellXY(g, c), mx = q.x + C / 2, my = q.y + C / 2;
      if (v === 1) {
        // a miss: searched water goes dark, with a white marker peg and a slow ripple
        x.fillStyle = 'rgba(0,8,14,0.45)'; x.fillRect(q.x + 1, q.y + 1, C - 2, C - 2);
        var rp = ((now / 2400) + c * 0.37) % 1;
        x.strokeStyle = 'rgba(200,240,255,' + (0.35 * (1 - rp)) + ')'; x.lineWidth = 1.5; x.beginPath(); x.arc(mx, my, C * (0.18 + rp * 0.28), 0, 6.29); x.stroke();
        var pg = x.createRadialGradient(mx - 3, my - 3, 1, mx, my, C * 0.15); pg.addColorStop(0, '#ffffff'); pg.addColorStop(1, '#9fb8c8');
        x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.arc(mx + 2, my + 3, C * 0.15, 0, 6.29); x.fill();
        x.fillStyle = pg; x.beginPath(); x.arc(mx, my, C * 0.14, 0, 6.29); x.fill();
      }
      else {
        // a hit: the square glows red under the fire, with a red peg
        x.fillStyle = 'rgba(255,50,40,0.22)'; x.fillRect(q.x + 1, q.y + 1, C - 2, C - 2);
        x.strokeStyle = 'rgba(255,90,70,0.65)'; x.lineWidth = 2; x.strokeRect(q.x + 3, q.y + 3, C - 6, C - 6);
        var fl = 0.75 + 0.25 * Math.sin(now / 70 + c * 1.7) * Math.sin(now / 113 + c);
        var rg = x.createRadialGradient(mx, my, 0, mx, my, C * 0.62); rg.addColorStop(0, 'rgba(255,240,200,' + fl + ')'); rg.addColorStop(0.25, 'rgba(255,140,60,' + (0.85 * fl) + ')'); rg.addColorStop(1, 'rgba(255,60,40,0)');
        x.globalCompositeOperation = 'lighter'; x.fillStyle = rg; x.fillRect(q.x - C * 0.2, q.y - C * 0.2, C * 1.4, C * 1.4); x.globalCompositeOperation = 'source-over';
        var hp = x.createRadialGradient(mx - 3, my - 3, 1, mx, my, C * 0.15); hp.addColorStop(0, '#ffd0c0'); hp.addColorStop(1, '#e0301e');
        x.fillStyle = hp; x.beginPath(); x.arc(mx, my, C * 0.13, 0, 6.29); x.fill();
        // drifting smoke from burning cells
        if (Math.random() < 0.025 && T.parts.length < 900) T.parts.push({ x: mx + (Math.random() - 0.5) * 12, y: my, vx: 0.01, vy: -0.03 - Math.random() * 0.02, life: 0, max: 1800, s: 10 + Math.random() * 10, k: 'smoke' });
      }
    }
    x.restore();
    // coordinates
    x.font = mfont(19, 700); x.fillStyle = 'rgba(160,240,230,0.45)'; x.textAlign = 'center';
    for (var j = 0; j < N; j++) { x.fillText(String(j + 1), g.x + j * C + C / 2, g.y - 32); x.fillText(LET[j], g.x - 40, g.y + j * C + C / 2 + 7); }
    // titles
    x.textAlign = 'left'; x.font = font(40); x.fillStyle = '#fff'; x.fillText(title, g.x - 20, g.y - 108);
    x.font = mfont(21); x.fillStyle = 'rgba(200,245,240,0.55)'; x.fillText(sub, g.x - 20, g.y - 74);
    x.restore();
  }
  function drawShip(x, g, sh, side, fog, now) {
    var p = cellXY(g, sh.cells[0]), len = sh.l * C, wd = C * 0.62, pad = C * 0.12;
    x.save(); x.translate(p.x + C / 2, p.y + C / 2);
    if (!sh.hz) x.rotate(Math.PI / 2);
    var L0 = -C / 2 + pad, L1 = -C / 2 + len - pad, hw = wd / 2;
    // hull: pointed bow, square-ish stern
    x.beginPath(); x.moveTo(L0 + C * 0.1, -hw); x.lineTo(L1 - C * 0.55, -hw); x.quadraticCurveTo(L1 - C * 0.1, -hw * 0.6, L1, 0); x.quadraticCurveTo(L1 - C * 0.1, hw * 0.6, L1 - C * 0.55, hw); x.lineTo(L0 + C * 0.1, hw); x.quadraticCurveTo(L0, hw, L0, hw * 0.6); x.lineTo(L0, -hw * 0.6); x.quadraticCurveTo(L0, -hw, L0 + C * 0.1, -hw); x.closePath();
    var hg = x.createLinearGradient(0, -hw, 0, hw);
    if (sh.sunk) { hg.addColorStop(0, '#5a2a22'); hg.addColorStop(1, '#1d0d0a'); } else { hg.addColorStop(0, '#9fb3c3'); hg.addColorStop(0.5, '#5d7286'); hg.addColorStop(1, '#2c3946'); }
    x.fillStyle = hg; x.fill(); x.lineWidth = 2; x.strokeStyle = sh.sunk ? 'rgba(255,120,80,0.7)' : 'rgba(190,240,255,0.65)'; x.stroke();
    // deck detail: centre line, superstructure, turrets
    x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(L0 + C * 0.25, 0); x.lineTo(L1 - C * 0.45, 0); x.stroke();
    var mid = (L0 + L1) / 2;
    x.fillStyle = sh.sunk ? '#3a1a14' : '#c9d7e2'; rr(x, mid - C * 0.32, -hw * 0.5, C * 0.64, hw, 4); x.fill();
    x.fillStyle = sh.sunk ? '#2a110d' : '#425566';
    var tur = sh.l >= 4 ? [L0 + C * 0.45, L1 - C * 0.9] : sh.l === 3 ? [L1 - C * 0.75] : [];
    for (var i = 0; i < tur.length; i++) { x.beginPath(); x.arc(tur[i], 0, hw * 0.38, 0, 6.29); x.fill(); x.fillRect(tur[i], -2, C * 0.35, 4); }
    if (sh.n === 'Submarine') { x.fillStyle = sh.sunk ? '#2a110d' : '#2e3c48'; rr(x, mid - C * 0.18, -hw * 0.75, C * 0.36, hw * 1.5, 6); x.fill(); }
    // wake behind living ships
    if (!sh.sunk && !fog) { x.strokeStyle = 'rgba(200,250,255,' + (0.12 + 0.06 * Math.sin(now / 300)) + ')'; x.lineWidth = 2; x.beginPath(); x.moveTo(L0 - 4, -hw * 0.5); x.lineTo(L0 - C * 0.35, -hw * 0.9); x.moveTo(L0 - 4, hw * 0.5); x.lineTo(L0 - C * 0.35, hw * 0.9); x.stroke(); }
    x.restore();
  }
  function drawHud(x, now) {
    if (T.phase !== 'battle') return;
    var s = me(), g = gridOf(foe()), y = g.y + GS + 46;
    var names = ['Shot', 'Sonar', 'Barrage'], avail = [true, s.sonarLeft > 0, s.barrages > 0], extra = ['', s.sonarLeft ? '×1' : 'used', s.barrages ? '×' + s.barrages : 'sink a ship'];
    if (!s.ai) {
      for (var i = 0; i < 3; i++) {
        var bx = g.x - 20 + i * 196, sel = s.weapon === i;
        rr(x, bx, y, 180, 62, 31); x.fillStyle = sel ? '#5ef2d0' : 'rgba(255,255,255,0.06)'; x.fill();
        x.textAlign = 'center'; x.font = font(25); x.fillStyle = sel ? '#03201c' : avail[i] ? '#fff' : 'rgba(255,255,255,0.3)'; x.fillText(names[i], bx + 90, y + 32);
        x.font = mfont(14, 700); x.fillStyle = sel ? 'rgba(3,32,28,0.7)' : 'rgba(255,255,255,0.4)'; x.fillText(extra[i].toUpperCase(), bx + 90, y + 51);
      }
      x.textAlign = 'center'; x.font = mfont(17); x.fillStyle = 'rgba(200,245,240,0.5)'; x.fillText('▶❚❚ / CH / Y', (GL.x + GS + GR.x) / 2, y + 26); x.fillText('switch weapon', (GL.x + GS + GR.x) / 2, y + 50);
    }
    // middle column: whose turn, and the enemy fleet
    var mx = (GL.x + GS + GR.x) / 2, my = GL.y + 10, enemy = foe();
    x.textAlign = 'center'; x.font = mfont(16, 800); x.fillStyle = 'rgba(200,245,240,0.45)'; x.fillText(s.ai ? 'INCOMING' : T.opts.mode ? A.esc(s.name).toUpperCase() + '’S SHOT' : 'YOUR SHOT', mx, my);
    x.font = font(46); x.fillStyle = s.ai ? '#ff6b7a' : '#5ef2d0'; x.fillText(s.ai ? '◀' : '▶', mx, my + 54);
    var ey = my + 140; x.font = mfont(15, 800); x.fillStyle = 'rgba(200,245,240,0.45)'; x.fillText(T.opts.mode ? 'THEIR FLEET' : 'ENEMY FLEET', mx, ey);
    for (var k = 0; k < enemy.ships.length; k++) {
      var sh = enemy.ships[k], yy = ey + 30 + k * 66, w = sh.l * 24 - 6;
      for (var m = 0; m < sh.l; m++) { x.fillStyle = sh.sunk ? 'rgba(255,110,80,0.85)' : 'rgba(200,245,240,0.3)'; rr(x, mx - w / 2 + m * 24, yy, 18, 12, 4); x.fill(); }
      x.font = mfont(17, 600); x.fillStyle = sh.sunk ? 'rgba(255,140,110,0.85)' : 'rgba(200,245,240,0.6)'; x.fillText(sh.sunk ? sh.n + ' · sunk' : sh.n, mx, yy + 38);
    }
  }
  function drawAim(x, now) {
    var s = me(); if (T.phase !== 'battle') return;
    var g = gridOf(foe()), c = s.ai ? T.aiCursor : s.cursor, p = cellXY(g, c), pul = 0.6 + 0.4 * Math.sin(now / 160);
    var cells = s.weapon === 1 && !s.ai ? patch(c) : s.weapon === 2 && !s.ai ? plus(c) : [c];
    x.save();
    x.fillStyle = 'rgba(94,242,208,0.07)'; x.fillRect(g.x, p.y, GS, C); x.fillRect(p.x, g.y, C, GS);
    for (var i = 0; i < cells.length; i++) { var q = cellXY(g, cells[i]); x.fillStyle = s.ai ? 'rgba(255,107,122,' + (0.18 * pul) + ')' : 'rgba(94,242,208,' + ((cells.length > 1 ? 0.3 : 0.16) * pul) + ')'; x.fillRect(q.x + 2, q.y + 2, C - 4, C - 4); }
    var col = s.ai ? '#ff6b7a' : '#5ef2d0', k = C * 0.28, o = 3 + pul * 3;
    x.strokeStyle = col; x.lineWidth = 4; x.beginPath();
    x.moveTo(p.x - o, p.y - o + k); x.lineTo(p.x - o, p.y - o); x.lineTo(p.x - o + k, p.y - o);
    x.moveTo(p.x + C + o - k, p.y - o); x.lineTo(p.x + C + o, p.y - o); x.lineTo(p.x + C + o, p.y - o + k);
    x.moveTo(p.x - o, p.y + C + o - k); x.lineTo(p.x - o, p.y + C + o); x.lineTo(p.x - o + k, p.y + C + o);
    x.moveTo(p.x + C + o - k, p.y + C + o); x.lineTo(p.x + C + o, p.y + C + o); x.lineTo(p.x + C + o, p.y + C + o - k); x.stroke();
    x.font = mfont(18, 800); x.fillStyle = col; x.textAlign = 'center'; x.fillText(LET[Math.floor(c / N)] + (c % N + 1), p.x + C / 2, p.y - 14 - o);
    x.restore();
  }
  function drawFx(x, dt) {
    for (var i = T.rip.length - 1; i >= 0; i--) {
      var r = T.rip[i]; r.t += dt; var p = r.t / r.dur; if (p >= 1) { T.rip.splice(i, 1); continue; }
      for (var k = 0; k < (r.sonar ? 3 : 2); k++) { var pp = Math.max(0, p - k * 0.15); x.strokeStyle = r.sonar ? 'rgba(94,242,208,' + (0.8 * (1 - pp)) + ')' : 'rgba(220,250,255,' + (0.6 * (1 - pp)) + ')'; x.lineWidth = 3 * (1 - pp); x.beginPath(); x.arc(r.x, r.y, r.r * pp, 0, 6.29); x.stroke(); }
    }
    for (var j = T.shells.length - 1; j >= 0; j--) {
      var s = T.shells[j]; s.t += dt; if (s.t < 0) continue; var q = Math.min(1, s.t / s.dur);
      var hx = s.x0 + (s.x1 - s.x0) * q, hy = s.y0 + (s.y1 - s.y0) * q - Math.sin(q * Math.PI) * 260;
      // target reticle closing in on the landing square
      var rr2 = C * (0.9 - 0.45 * q); x.strokeStyle = 'rgba(255,120,90,' + (0.4 + 0.5 * q) + ')'; x.lineWidth = 2.5;
      for (var cn = 0; cn < 4; cn++) { var an = cn * Math.PI / 2 + q * 1.2; x.beginPath(); x.arc(s.x1, s.y1, rr2, an + 0.25, an + 1.3); x.stroke(); }
      // its shadow skimming the water
      var sx = s.x0 + (s.x1 - s.x0) * q, sy = s.y0 + (s.y1 - s.y0) * q;
      x.fillStyle = 'rgba(0,0,0,' + (0.15 + 0.25 * q) + ')'; x.beginPath(); x.ellipse ? x.ellipse(sx, sy, 10 + 8 * (1 - Math.sin(q * Math.PI)), 5, 0, 0, 6.29) : x.arc(sx, sy, 8, 0, 6.29); x.fill();
      // smoke trail and a hot glowing shell
      x.lineCap = 'round';
      for (var tr = 14; tr >= 1; tr--) {
        var q0 = Math.max(0, q - tr * 0.018), q1 = Math.max(0, q - (tr - 1) * 0.018);
        var ax = s.x0 + (s.x1 - s.x0) * q0, ay = s.y0 + (s.y1 - s.y0) * q0 - Math.sin(q0 * Math.PI) * 260, bx = s.x0 + (s.x1 - s.x0) * q1, by = s.y0 + (s.y1 - s.y0) * q1 - Math.sin(q1 * Math.PI) * 260;
        x.strokeStyle = 'rgba(255,' + (200 - tr * 8) + ',' + (140 - tr * 8) + ',' + (0.55 * (1 - tr / 15)) + ')'; x.lineWidth = 9 * (1 - tr / 16); x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      }
      x.globalCompositeOperation = 'lighter';
      var hg = x.createRadialGradient(hx, hy, 0, hx, hy, 26); hg.addColorStop(0, 'rgba(255,255,240,1)'); hg.addColorStop(0.3, 'rgba(255,190,110,.7)'); hg.addColorStop(1, 'rgba(255,120,60,0)');
      x.fillStyle = hg; x.beginPath(); x.arc(hx, hy, 26, 0, 6.29); x.fill();
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      if (q >= 1) { T.shells.splice(j, 1); land(s); }
    }
    for (var m = T.parts.length - 1; m >= 0; m--) {
      var pa = T.parts[m]; pa.life += dt; if (pa.life >= pa.max) { T.parts.splice(m, 1); continue; }
      var a = 1 - pa.life / pa.max; pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      if (pa.k === 'fire') { pa.vy += 0.0006 * dt; x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,' + Math.round(120 + 120 * a) + ',' + Math.round(60 * a) + ',' + a + ')'; x.beginPath(); x.arc(pa.x, pa.y, pa.s * (0.4 + a * 0.6), 0, 6.29); x.fill(); x.globalCompositeOperation = 'source-over'; }
      else if (pa.k === 'drop') { pa.vy += 0.0012 * dt; x.fillStyle = 'rgba(210,250,255,' + a + ')'; x.fillRect(pa.x, pa.y, pa.s, pa.s * 1.6); }
      else { x.fillStyle = 'rgba(40,46,52,' + (0.4 * a) + ')'; x.beginPath(); x.arc(pa.x, pa.y, pa.s * (1.6 - a * 0.6), 0, 6.29); x.fill(); }
    }
  }
  function drawBanners(x, dt) {
    for (var i = T.banners.length - 1; i >= 0; i--) {
      var b = T.banners[i]; b.t += dt; var p = b.t / b.dur; if (p >= 1) { T.banners.splice(i, 1); continue; }
      var a = p < 0.1 ? p / 0.1 : p > 0.8 ? (1 - p) / 0.2 : 1;
      x.save(); x.globalAlpha = a; x.textAlign = 'center';
      x.font = font(58); x.fillStyle = b.col; x.fillText(b.txt, W / 2, 92); if (b.sub) { x.font = mfont(22, 700); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText(b.sub.toUpperCase(), W / 2, 130); }
      x.restore();
    }
  }

  function frame(dt, x, now) {
    if (!T) return;
    x.clearRect(0, 0, W, H);
    var paused = A.modalOpen(); if (paused) dt = 0;
    T.t += dt;
    if (T.flash > 0) T.flash = Math.max(0, T.flash - dt / 600); T.shake *= 0.88;
    // computer turn: glide the crosshair, then fire
    if (T.phase === 'battle' && me().ai && !T.busy && !T.over && !T.curtain && !paused) {
      if (!T.aiTarget) T.aiTarget = aiPick(me(), foe());
      var tc = T.aiTarget.cell, cx = T.aiCursor % N, cy = Math.floor(T.aiCursor / N), tx = tc % N, ty = Math.floor(tc / N);
      T.aiT -= dt;
      if (T.aiT <= 0) {
        if (cx !== tx || cy !== ty) { cx += tx > cx ? 1 : tx < cx ? -1 : 0; cy += ty > cy ? 1 : ty < cy ? -1 : 0; T.aiCursor = cy * N + cx; sfx('move'); T.aiT = 70; }
        else { var tg = T.aiTarget; T.aiTarget = null; T.aiT = 0; if (tg.kind !== 'shot') banner(me().name + (tg.kind === 'sonar' ? ' pings sonar' : ' fires a barrage'), '', '#ff6b7a', 1200); fire(tg.kind, tg.cell); }
      }
    }
    var sh = T.shake > 0.5 ? T.shake : 0;
    x.save(); if (sh) x.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    if (T.phase === 'place') drawPlace(x, now);
    else {
      var left = gridOf(T.sides[0]) === GL ? T.sides[0] : T.sides[1], right = left === T.sides[0] ? T.sides[1] : T.sides[0];
      var myTurnLeft = me() === left;
      drawGrid(x, GL, left, false, !myTurnLeft, now, T.opts.mode ? A.esc(left.name) + '’s fleet' : 'Your fleet', left.ships.filter(function (s) { return !s.sunk; }).length + ' of 5 ships afloat');
      drawGrid(x, GR, right, true, myTurnLeft, now, T.opts.mode ? A.esc(right.name) + '’s waters' : 'Enemy waters · ' + A.esc(right.name), right.fired + ' shots · ' + right.hitsMade + ' hits  /  you: ' + left.fired + ' shots · ' + left.hitsMade + ' hits');
      if (!T.opts.mode && T.opts.think !== false && me().ai && T.aiTarget && T.aiHeat) drawThinking(x, gridOf(foe()), now);
      if (!T.curtain) drawAim(x, now);
      drawHud(x, now);
    }
    drawFx(x, dt);
    x.restore();
    if (T.flash > 0) { x.fillStyle = 'rgba(255,200,150,' + T.flash * 0.35 + ')'; x.fillRect(0, 0, W, H); }
    drawBanners(x, dt);
    if (T.curtain) drawCurtain(x, now, dt);
  }
  // "Show its thinking": the computer's guesses, drawn over your fleet while it aims. Brighter = where it thinks a ship could be.
  function drawThinking(x, g, now) {
    var h = T.aiHeat, mx = 0, i; for (i = 0; i < h.length; i++) if (h[i] > mx) mx = h[i]; if (!mx) return;
    var pu = 0.75 + 0.25 * Math.sin(now / 220);
    x.save(); x.globalCompositeOperation = 'lighter';
    for (i = 0; i < h.length; i++) {
      if (!h[i] || foe().shots[i]) continue;
      var q = h[i] / mx, p = cellXY(g, i);
      x.fillStyle = 'rgba(' + Math.round(255 * q) + ',' + Math.round(90 + 60 * (1 - q)) + ',' + Math.round(140 * (1 - q)) + ',' + (0.07 + 0.28 * q * pu) + ')';
      rr(x, p.x + 4, p.y + 4, C - 8, C - 8, 8); x.fill();
    }
    x.restore();
    x.textAlign = 'left'; x.font = mfont(19); x.fillStyle = 'rgba(255,190,170,0.75)';
    x.fillText(A.esc(me().name) + '’s guesswork: it only knows its own hits and misses', g.x, g.y + GS + 64);
  }
  function drawPlace(x, now) {
    var s = T.sides[T.placeFor], g = { x: 330, y: 230 };
    drawGrid(x, g, s, false, true, now, A.esc(s.name) + ', ready your fleet', 'Shuffle until you like it. Keep it secret.');
    var ox = 1160, oy = 380, opts = ['Shuffle the fleet', 'Ready · ' + (T.opts.mode && T.placeFor === 0 ? 'next player' : 'set sail')];
    for (var i = 0; i < 2; i++) {
      var sel = T.placeIdx === i; rr(x, ox, oy + i * 120, 520, 92, 28); x.fillStyle = sel ? (i ? '#5ef2d0' : 'rgba(255,255,255,0.14)') : 'rgba(255,255,255,0.05)'; x.fill();
      if (sel) { x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.5)'; x.stroke(); }
      x.textAlign = 'center'; x.font = font(32); x.fillStyle = sel && i ? '#03201c' : '#fff'; x.fillText(opts[i], ox + 260, oy + i * 120 + 57);
    }
    x.textAlign = 'left'; x.font = mfont(22); x.fillStyle = 'rgba(200,245,240,0.6)';
    var lines = ['Your fleet: Dreadnought (5), Cruiser (4),', 'Destroyer (3), Submarine (3), Corvette (2).', '', T.opts.again === false ? 'One shot per turn, hit or miss.' : 'A hit earns another shot.', 'Sonar: once a game, count ships in a 3x3 patch.', 'Sink a ship to earn a Barrage: five shells in a plus.'];
    for (var j = 0; j < lines.length; j++) x.fillText(lines[j], ox, oy + 330 + j * 34);
  }
  function drawCurtain(x, now, dt) {
    var c = T.curtain; c.t += dt; var a = Math.min(1, c.t / 300);
    x.globalAlpha = a; x.fillStyle = '#021014'; x.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 - 40;
    for (var r = 0; r < 4; r++) { var pr = ((now / 2200) + r / 4) % 1; x.strokeStyle = 'rgba(94,242,208,' + (0.4 * (1 - pr)) + ')'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, 60 + pr * 520, 0, 6.29); x.stroke(); }
    x.textAlign = 'center'; x.font = mfont(22, 700); x.fillStyle = 'rgba(200,245,240,0.6)'; x.fillText('EYES OFF THE SCREEN', cx, cy - 70);
    x.font = font(84); x.fillStyle = c.to.color; x.fillText('Pass to ' + c.to.name, cx, cy + 20);
    x.font = mfont(26); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillText(c.place ? 'Press OK to set up your fleet' : 'Press OK when only you are looking', cx, cy + 80);
    x.globalAlpha = 1;
  }
  function stop() { T = null; A.musicStop(); }

  // home card: a sonar sweep finding blips
  function card(slot) {
    var blips = [];
    slot.draw = function (x, t, sel, w) {
      var h = 560, cx = w / 2, cy = 150, R = Math.min(130, w / 2 - 30), ang = t / 1600 * Math.PI * 2;
      x.clearRect(0, 0, w, h);
      var g = x.createRadialGradient(cx, cy, 0, cx, cy, R + 60); g.addColorStop(0, 'rgba(10,70,70,0.55)'); g.addColorStop(1, 'rgba(0,20,30,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(94,242,208,0.18)'; x.lineWidth = 1.5; for (var r = 1; r <= 4; r++) { x.beginPath(); x.arc(cx, cy, R * r / 4, 0, 6.29); x.stroke(); }
      x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
      for (var k = 0; k < 30; k++) { x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, ang - (k + 1) * 0.035, ang - k * 0.035); x.closePath(); x.fillStyle = 'rgba(94,242,208,' + (0.28 * (1 - k / 30)) + ')'; x.fill(); }
      if (Math.random() < 0.02 && blips.length < 6) { var ba = Math.random() * 6.28, br = 40 + Math.random() * (R - 50); blips.push({ x: cx + Math.cos(ba) * br, y: cy + Math.sin(ba) * br, a: ba, life: 0 }); }
      for (var i = blips.length - 1; i >= 0; i--) {
        var b = blips[i], diff = ((ang - b.a) % 6.283 + 6.283) % 6.283; if (diff < 0.1) b.life = 1;
        b.life *= 0.985; if (b.life < 0.02 && b.seen) { blips.splice(i, 1); continue; } if (b.life > 0.5) b.seen = true;
        x.fillStyle = 'rgba(160,255,230,' + b.life + ')'; x.beginPath(); x.arc(b.x, b.y, 7, 0, 6.29); x.fill();
        x.strokeStyle = 'rgba(160,255,230,' + b.life * 0.5 + ')'; x.beginPath(); x.arc(b.x, b.y, 7 + (1 - b.life) * 26, 0, 6.29); x.stroke();
      }
    };
  }

  A.register('tidewar', { debug: function () { return T; }, start: start, frame: frame, input: input, stop: stop, card: card });
})();
