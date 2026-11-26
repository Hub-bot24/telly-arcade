/*
 * Telly Trivia: a game-show quiz for the arcade.
 *  - Everyone with their own controller (remote, gamepad or phone) answers the same question at once; quicker right answers score more.
 *  - Or pass the remote: up to 4 players take turns on one remote.
 *  - 180 questions across 9 categories (games/quiz-questions.js), never repeated until the bank runs out.
 * The arcade shell (games/arcade.js) owns the keys and calls GAMES_QUIZ.input({src, act}).
 */
(function () {
  'use strict';
  var COLORS = ['#ff4f7b', '#3fa9ff', '#ffc83d', '#38e8a0'];
  var NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
  var TILE = ['#ff3d6e', '#3d8bff', '#ffb52e', '#25d98f'];
  var LETTER = ['A', 'B', 'C', 'D'];
  var SECS = 20;
  var CAT_ICON = { 'Aussie': '🦘', 'Sport': '🏉', 'Science': '🔬', 'Geography': '🌏', 'Movies & TV': '🎬', 'Music': '🎸', 'History': '🏛️', 'Food & Drink': '🍍', 'Brain Teasers': '🧠' };

  var root = null, onExit = null, ctx = null, st = null, timers = [], raf = null;
  var used = {};   // questions already asked this session

  function $(sel) { return root.querySelector(sel); }
  function initial(n) { var m = /^Player (\d)$/.exec(n); return m ? m[1] : esc(n.charAt(0).toUpperCase()); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { for (var i = 0; i < timers.length; i++) { clearTimeout(timers[i]); clearInterval(timers[i]); } timers = []; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- sound: tiny synth, quiet, never required ----------
  var ac = null;
  function tone(freq, dur, type, vol, when) {
    try {
      if (window.ARCADE && ARCADE.muted) return;
      if (!ac) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ac = new AC(); }
      var t0 = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) { }
  }
  var SFX = {
    move: function () { tone(660, 0.07, 'triangle', 0.05); },
    lock: function () { tone(520, 0.1, 'square', 0.05); tone(780, 0.12, 'square', 0.05, 0.08); },
    tick: function () { tone(1200, 0.05, 'square', 0.04); },
    right: function () { tone(523, 0.18, 'triangle', 0.12); tone(659, 0.18, 'triangle', 0.12, 0.12); tone(784, 0.35, 'triangle', 0.12, 0.24); },
    wrong: function () { tone(180, 0.45, 'sawtooth', 0.07); },
    spin: function () { tone(900 + Math.random() * 300, 0.04, 'square', 0.03); },
    fanfare: function () { var n = [523, 659, 784, 1046, 784, 1046]; for (var i = 0; i < n.length; i++) tone(n[i], 0.3, 'triangle', 0.12, i * 0.14); }
  };
  // the arcade's sound pack, when it is there, replaces these beeps
  (function () { for (var k in SFX) if (SFX.hasOwnProperty(k)) (function (k, f) { SFX[k] = function () { var A = window.ARCADE; if (A && A.play && A.play('qz_' + k, { vary: k === 'spin' ? 0.05 : 0 })) return; f(); }; })(k, SFX[k]); })();

  // ---------- questions ----------
  function pickQuestions(n) {
    var bank = window.QUIZ_QUESTIONS || {}, cats = [], c, i, out = [], pool = [];
    for (c in bank) if (bank.hasOwnProperty(c)) cats.push(c);
    for (i = 0; i < cats.length; i++) for (var j = 0; j < bank[cats[i]].length; j++) {
      var key = cats[i] + '|' + j;
      if (!used[key]) pool.push({ cat: cats[i], q: bank[cats[i]][j], key: key });
    }
    if (pool.length < n) { used = {}; return pickQuestions(n); }
    shuffle(pool);
    // spread categories: never the same category twice in a row if it can be helped
    while (out.length < n && pool.length) {
      var k = 0;
      while (k < pool.length - 1 && out.length && pool[k].cat === out[out.length - 1].cat) k++;
      var it = pool.splice(k, 1)[0]; used[it.key] = 1;
      var ans = shuffle([0, 1, 2, 3]);
      out.push({ cat: it.cat, text: it.q[0], answers: [it.q[1 + ans[0]], it.q[1 + ans[1]], it.q[1 + ans[2]], it.q[1 + ans[3]]], right: ans.indexOf(0) });
    }
    return out;
  }

  // ---------- screens ----------
  function frame(inner) {
    root.innerHTML = '<div class="qz"><div class="qz-beams"><i></i><i></i><i></i><i></i></div><div class="qz-floor"></div>' +
      '<div class="qz-top"><div class="qz-logo">TELLY<b>TRIVIA</b></div><div class="qz-count"></div></div>' + inner + '</div>';
  }

  // Lobby: anyone presses OK or A to join. The first to join runs the menu.
  function lobby(keepPlayers) {
    clearTimers();
    st = { screen: 'lobby', players: keepPlayers || [], row: 0, nq: st && st.nq || 10, shared: st && st.shared || 1, host: null };
    if (keepPlayers) { st.host = keepPlayers[0].src; for (var i = 0; i < keepPlayers.length; i++) { keepPlayers[i].score = 0; keepPlayers[i].streak = 0; } }
    frame('<div class="qz-lobby"><h1>Telly<span>Trivia</span></h1><p class="qz-sub">180 questions · 9 categories · quicker answers score more</p>' +
      '<div class="qz-slots"></div><div class="qz-menu"></div><p class="qz-hint"></p></div>');
    drawLobby();
  }
  function profile(i) {
    var p = null;
    try { var ps = ctx && ctx.profiles && ctx.profiles(); p = ps && ps[i]; } catch (e) { }
    return { id: p && p.id, name: (p && p.name) || NAMES[i], color: (p && p.color) || COLORS[i] };
  }
  function drawLobby() {
    var html = '', i, P = st.players;
    for (i = 0; i < 4; i++) {
      var p = P[i];
      html += p ? '<div class="qz-slot on" style="--c:' + p.color + '"><div class="qz-av">' + initial(p.name) + '</div><b>' + esc(p.name) + '</b><span>' + srcName(p.src) + '</span></div>'
        : '<div class="qz-slot"><div class="qz-av">+</div><b>Join</b><span>Press OK or A</span></div>';
    }
    $('.qz-slots').innerHTML = html;
    var rows = menuRows(), m = '';
    for (i = 0; i < rows.length; i++) m += '<div class="qz-row' + (i === st.row ? ' sel' : '') + '">' + rows[i].html + '</div>';
    $('.qz-menu').innerHTML = P.length ? m : '';
    $('.qz-hint').textContent = !P.length ? 'Each person with a remote, controller or phone presses OK or A to join. One remote? Join, then choose how many share it.' :
      'More players can still join. Arrows to change, OK to choose. Back to leave.';
  }
  function srcName(s) { return s === 'remote' ? 'TV remote' : /^pad/.test(s) ? 'Controller' : /^phone/.test(s) ? 'Phone' : /^kb/.test(s) ? 'Keyboard' : 'Controller'; }
  function menuRows() {
    var rows = [];
    if (st.players.length === 1) rows.push({ id: 'shared', html: 'Players on this ' + (st.players[0].src === 'remote' ? 'remote' : 'controller') + '<em>‹ ' + st.shared + ' ›</em>' });
    rows.push({ id: 'nq', html: 'Questions<em>‹ ' + st.nq + ' ›</em>' });
    rows.push({ id: 'go', html: '<strong>Start the show</strong>' });
    return rows;
  }
  function lobbyInput(ev) {
    var P = st.players, i;
    var joined = false; for (i = 0; i < P.length; i++) if (P[i].src === ev.src) joined = true;
    if (!joined) {
      if (ev.act === 'A' && P.length < 4 && st.shared === 1) {
        var pr = profile(P.length);
        P.push({ src: ev.src, id: pr.id, name: pr.name, color: pr.color, score: 0, streak: 0 });
        if (!st.host) st.host = ev.src;
        SFX.lock(); st.row = menuRows().length - 1; drawLobby();
      } else if (ev.act === 'B' && !P.length) quit();
      return;
    }
    if (ev.src !== st.host) return;
    var rows = menuRows(), row = rows[st.row];
    if (ev.act === 'U') st.row = Math.max(0, st.row - 1);
    else if (ev.act === 'D') st.row = Math.min(rows.length - 1, st.row + 1);
    else if ((ev.act === 'L' || ev.act === 'R') && row.id === 'nq') { var o = [5, 10, 15, 20, 30], k = o.indexOf(st.nq); st.nq = o[Math.max(0, Math.min(o.length - 1, k + (ev.act === 'R' ? 1 : -1)))]; }
    else if ((ev.act === 'L' || ev.act === 'R') && row.id === 'shared') st.shared = Math.max(1, Math.min(4, st.shared + (ev.act === 'R' ? 1 : -1)));
    else if (ev.act === 'A' || ev.act === 'START') { if (row.id === 'go' || ev.act === 'START') return startGame(); }
    else if (ev.act === 'B') { if (P.length > 1) { P.pop(); } else { P.length = 0; st.host = null; st.shared = 1; } st.row = 0; }
    else return;
    SFX.move(); drawLobby();
  }

  function startGame() {
    var P = st.players;
    if (P.length === 1 && st.shared > 1) {   // pass the remote: one source, several people taking turns
      var src = P[0].src; P.length = 0;
      for (var i = 0; i < st.shared; i++) { var pr = profile(i); P.push({ src: src, id: pr.id, name: pr.name, color: pr.color, score: 0, streak: 0 }); }
      st.turns = true;
    } else st.turns = false;
    // in turns mode everyone gets the same number of goes
    var n = st.turns ? Math.ceil(st.nq / P.length) * P.length : st.nq;
    st.qs = pickQuestions(n); st.qi = -1; st.screen = 'play';
    frame('<div class="qz-cat"><span class="qz-cat-ico"></span><span class="qz-cat-name"></span></div>' +
      '<div class="qz-turn"></div><div class="qz-q"><div class="qz-qtext"></div></div>' +
      '<div class="qz-timer"><i></i><b></b></div><div class="qz-ans"></div><div class="qz-chips"></div><div class="qz-pause"></div>');
    nextQuestion();
  }

  function chips() {
    var P = st.players, html = '';
    for (var i = 0; i < P.length; i++) {
      var p = P[i], status = '';
      if (st.phase === 'answer') status = st.turns ? (i === st.active ? 'Your turn' : '') : (p.locked ? 'Locked in' : 'Thinking…');
      if (st.phase === 'reveal' && p.gain != null) status = p.gain > 0 ? '+' + p.gain + (p.bonus ? ' 🔥' : '') : (p.answered ? 'Wrong' : st.turns && i !== st.active ? '' : 'Too slow');
      html += '<div class="qz-chip' + (st.turns && i === st.active ? ' act' : '') + (p.locked && st.phase === 'answer' ? ' locked' : '') +
        (st.phase === 'reveal' && p.gain > 0 ? ' good' : '') + (st.phase === 'reveal' && p.gain === 0 ? ' bad' : '') + '" style="--c:' + p.color + '">' +
        '<div class="qz-av">' + initial(p.name) + '</div><div class="qz-cn"><b>' + esc(p.name) + '</b><span>' + status + '</span></div><div class="qz-sc">' + p.score + '</div></div>';
    }
    $('.qz-chips').innerHTML = html;
  }

  function nextQuestion() {
    clearTimers();
    st.qi++;
    if (st.qi >= st.qs.length) return finale();
    var Q = st.qs[st.qi], P = st.players, i;
    st.active = st.turns ? st.qi % P.length : -1;
    for (i = 0; i < P.length; i++) { P[i].locked = false; P[i].choice = -1; P[i].cursor = 0; P[i].gain = null; P[i].answered = false; P[i].bonus = false; }
    st.phase = 'spin';
    $('.qz-count').textContent = 'Question ' + (st.qi + 1) + ' of ' + st.qs.length;
    $('.qz-q').className = 'qz-q'; $('.qz-ans').innerHTML = ''; $('.qz-timer').className = 'qz-timer';
    $('.qz-qtext').textContent = '';
    var turn = $('.qz-turn');
    if (st.turns) { var ap = P[st.active]; turn.innerHTML = '<span style="color:' + ap.color + '">' + esc(ap.name) + '</span>, you\'re up'; turn.className = 'qz-turn show'; }
    else turn.className = 'qz-turn';
    chips();
    // category reel: flicks through the categories and lands on this question's
    var cats = []; for (var c in window.QUIZ_QUESTIONS) cats.push(c);
    var cat = $('.qz-cat'), n = 0, steps = 10;
    cat.className = 'qz-cat spin';
    (function flick() {
      var name = n < steps ? cats[(Math.floor(Math.random() * cats.length))] : Q.cat;
      cat.querySelector('.qz-cat-ico').textContent = CAT_ICON[name] || '★';
      cat.querySelector('.qz-cat-name').textContent = name;
      SFX.spin();
      if (n++ < steps) later(flick, 40 + n * n * 1.5);
      else { cat.className = 'qz-cat landed'; later(showQuestion, 700); }
    })();
  }

  function showQuestion() {
    var Q = st.qs[st.qi];
    st.phase = 'answer';
    $('.qz-turn').className = 'qz-turn';
    var qt = $('.qz-qtext'); qt.textContent = Q.text;
    qt.style.fontSize = Q.text.length > 70 ? '54px' : Q.text.length > 45 ? '62px' : '70px';
    $('.qz-q').className = 'qz-q in';
    var html = '';
    for (var i = 0; i < 4; i++) html += '<div class="qz-a" style="--t:' + TILE[i] + ';-webkit-transition-delay:' + (0.2 + i * 0.09) + 's;transition-delay:' + (0.2 + i * 0.09) + 's"><div class="qz-l">' + LETTER[i] + '</div><div class="qz-at">' + esc(Q.answers[i]) + '</div><div class="qz-dots"></div></div>';
    $('.qz-ans').innerHTML = html;
    var tiles = root.querySelectorAll('.qz-a');
    for (i = 0; i < 4; i++) { var t = tiles[i].querySelector('.qz-at'); if (Q.answers[i].length > 22) t.style.fontSize = '36px'; }
    st.t0 = Date.now() + 600; st.lastTick = SECS;
    $('.qz-timer').className = 'qz-timer run';
    chips();
    later(function () { cursors(); }, 40);
    later(function () { for (var k = 0; k < tiles.length; k++) { tiles[k].style.webkitTransitionDelay = '0s'; tiles[k].style.transitionDelay = '0s'; } }, 1100);
    var iv = setInterval(tickTimer, 100); timers.push(iv);
  }

  function tickTimer() {
    var left = Math.max(0, SECS - (Date.now() - st.t0) / 1000), tm = $('.qz-timer');
    tm.querySelector('i').style.width = (Math.min(1, left / SECS) * 100).toFixed(2) + '%';
    tm.querySelector('b').textContent = Math.ceil(left);
    if (left <= 5) tm.className = 'qz-timer run hurry';
    var s = Math.ceil(left); if (s < st.lastTick && s <= 5 && s > 0) { st.lastTick = s; SFX.tick(); }
    if (left <= 0) reveal();
  }

  function cursors() {
    var tiles = root.querySelectorAll('.qz-a'), P = st.players, i, j;
    for (i = 0; i < tiles.length; i++) {
      var dots = '', sel = false;
      for (j = 0; j < P.length; j++) {
        var p = P[j];
        if (st.turns) { if (j === st.active && p.cursor === i && !p.locked) sel = true; if (j === st.active && p.locked && p.choice === i) tiles[i].className = 'qz-a in chosen'; continue; }
        if (!p.locked && p.cursor === i) dots += '<i style="background:' + p.color + '"></i>';
      }
      if (st.turns) { if (!/chosen/.test(tiles[i].className)) tiles[i].className = 'qz-a in' + (sel ? ' sel' : ''); }
      else {
        tiles[i].className = 'qz-a in' + (P.length === 1 && !P[0].locked && P[0].cursor === i ? ' sel' : '') + (P.length === 1 && P[0].locked && P[0].choice === i ? ' chosen' : '');
        tiles[i].querySelector('.qz-dots').innerHTML = P.length > 1 ? dots : '';
      }
    }
  }

  function playInput(ev) {
    if (st.phase === 'final') { if (ev.act === 'A' || ev.act === 'START') lobby(st.players.slice(0, st.turns ? 1 : 4)); else if (ev.act === 'B') quit(); return; }
    if (st.paused) {
      if (ev.act === 'A') return quit();
      if (ev.act === 'B' || ev.act === 'START') { st.paused = false; $('.qz-pause').className = 'qz-pause'; st.t0 += Date.now() - st.pausedAt; }
      return;
    }
    if (ev.act === 'B' || ev.act === 'BACK' || ev.act === 'START') {
      if (ev.act === 'B' && st.phase === 'answer' && !isHost(ev.src)) return;
      st.paused = true; st.pausedAt = Date.now();
      $('.qz-pause').innerHTML = '<div><h2>Paused</h2><p><b>OK</b> leave the game · <b>Back</b> keep playing</p></div>';
      $('.qz-pause').className = 'qz-pause show'; return;
    }
    if (st.phase !== 'answer') return;
    var p = null, P = st.players, i;
    if (st.turns) p = P[st.active];
    else for (i = 0; i < P.length; i++) if (P[i].src === ev.src) p = P[i];
    if (!p || p.locked) return;
    var c = p.cursor;
    if (ev.act === 'L' || ev.act === 'R') c = (c % 2 === 0 ? c + 1 : c - 1);
    else if (ev.act === 'U' || ev.act === 'D') c = (c + 2) % 4;
    else if (ev.act === 'X') c = 0; else if (ev.act === 'Y') c = 1;
    else if (ev.act === 'A') { p.locked = true; p.choice = c; p.answered = true; p.at = Date.now(); SFX.lock(); chips(); cursors(); checkAllIn(); return; }
    else return;
    p.cursor = c; SFX.move(); cursors();
  }
  function isHost(src) { return st.turns || src === st.players[0].src; }
  function checkAllIn() {
    var P = st.players;
    if (st.turns) { if (P[st.active].locked) later(reveal, 500); return; }
    for (var i = 0; i < P.length; i++) if (!P[i].locked) return;
    later(reveal, 500);
  }

  function reveal() {
    if (st.phase !== 'answer') return;
    clearTimers();
    st.phase = 'reveal';
    var Q = st.qs[st.qi], P = st.players, tiles = root.querySelectorAll('.qz-a'), i, anyRight = false;
    $('.qz-timer').className = 'qz-timer';
    for (i = 0; i < 4; i++) { tiles[i].className = 'qz-a in ' + (i === Q.right ? 'right' : 'dim'); tiles[i].querySelector('.qz-dots').innerHTML = ''; }
    for (i = 0; i < P.length; i++) {
      var p = P[i];
      if (st.turns && i !== st.active) { p.gain = null; continue; }
      if (p.locked && p.choice !== Q.right) tiles[p.choice].className = 'qz-a in wrong';
      if (p.locked && p.choice === Q.right) {
        var left = Math.max(0, SECS - (p.at - st.t0) / 1000);
        p.gain = 500 + Math.round(500 * left / SECS / 10) * 10;
        p.streak++; p.bonus = p.streak >= 3; if (p.bonus) p.gain += 200;
        p.score += p.gain; anyRight = true;
      } else { p.gain = 0; p.streak = 0; }
    }
    // show who picked what on the tiles
    for (i = 0; i < P.length; i++) if (P[i].locked && (!st.turns || i === st.active) && P.length > 1 && !st.turns) {
      tiles[P[i].choice].querySelector('.qz-dots').innerHTML += '<i style="background:' + P[i].color + '"></i>';
    }
    if (anyRight) SFX.right(); else SFX.wrong();
    chips();
    later(nextQuestion, 3600);
  }

  // ---------- the end: podium and confetti ----------
  function finale() {
    clearTimers();
    st.phase = 'final';
    var P = st.players.slice().sort(function (a, b) { return b.score - a.score; });
    var w = P[0], tie = P.length > 1 && P[1].score === w.score, html = '';
    var best = 0; try { best = +localStorage.getItem('quiz.best') || 0; } catch (e) { }
    var newBest = w.score > best; if (newBest) try { localStorage.setItem('quiz.best', w.score); } catch (e) { }
    // the arcade keeps the shared leaderboard
    var marks = [], board = '', AR = window.ARCADE;
    if (AR && AR.record) {
      for (var r = 0; r < P.length; r++) if (P[r].id) { try { if (AR.record('quiz', P[r].id, P[r].score, P[r] === w && !tie)) marks.push(P[r].id); } catch (e) { } }
      try { board = AR.boardHtml('quiz', marks, 4) || ''; } catch (e) { board = ''; }
    }
    var order = P.length >= 3 ? [1, 0, 2, 3] : P.length === 2 ? [1, 0] : [0];
    for (var k = 0; k < order.length; k++) {
      var p = P[order[k]]; if (!p) continue;
      var place = order[k];
      html += '<div class="qz-pod p' + place + '" style="--c:' + p.color + '"><div class="qz-av">' + initial(p.name) + '</div><b>' + esc(p.name) + '</b><span>' + p.score + '</span><div class="qz-step">' + (place + 1) + '</div></div>';
    }
    frame('<canvas class="qz-confetti" width="1920" height="1080"></canvas><div class="qz-final' + (board ? ' qz-wb' : '') + '"><h2>' + (P.length === 1 ? (newBest ? 'New high score!' : 'Final score') : tie ? 'It\'s a tie!' : esc(w.name) + ' wins!') + '</h2>' +
      '<div class="qz-podium">' + html + '</div><div class="qz-board">' + board + '</div><p class="qz-hint">' + (P.length === 1 && !newBest && best ? 'Best ever: ' + best + ' · ' : '') + '<b>OK</b> play again · <b>Back</b> games menu</p></div><div class="qz-pause"></div>');
    $('.qz-count').textContent = '';
    SFX.fanfare(); confetti(w.color);
  }
  function confetti(main) {
    var cv = $('.qz-confetti'); if (!cv) return;
    var g = cv.getContext('2d'), bits = [], cols = [main, '#ffffff', '#ffc83d', '#3fa9ff', '#ff4f7b', '#38e8a0'], t0 = Date.now();
    for (var i = 0; i < 220; i++) bits.push({ x: Math.random() * 1920, y: -Math.random() * 1080, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 5, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 10 + Math.random() * 12, h: 6 + Math.random() * 8, c: cols[i % cols.length] });
    (function draw() {
      if (!root || !cv.parentNode) return;
      g.clearRect(0, 0, 1920, 1080);
      var alive = Date.now() - t0 < 9000;
      for (var i = 0; i < bits.length; i++) {
        var b = bits[i]; b.x += b.vx + Math.sin((Date.now() / 600) + i) * 0.8; b.y += b.vy; b.r += b.vr;
        if (b.y > 1100 && alive) { b.y = -20; b.x = Math.random() * 1920; }
        g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2))); g.restore();
      }
      raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 33); })(draw);
    })();
  }

  function quit() { var cb = onExit; window.GAMES_QUIZ.stop(); if (cb) cb(); }

  window.GAMES_QUIZ = {
    title: 'Telly Trivia',
    blurb: 'A game show for the lounge room. 180 questions, quicker answers score more.',
    players: '1 – 4 players',
    start: function (rootEl, exitCb, context) { if (window.ARCADE && ARCADE.soundPack) ARCADE.soundPack('qz'); root = rootEl; onExit = exitCb; ctx = context || null; st = null; lobby(); },
    input: function (ev) {
      if (!root || !st || !ev) return;
      if (ev.act === 'BACK') ev = { src: ev.src, act: 'B' };
      if (st.screen === 'lobby') lobbyInput(ev); else playInput(ev);
    },
    stop: function () {
      clearTimers(); if (raf) (window.cancelAnimationFrame || clearTimeout)(raf); raf = null;
      if (root) root.innerHTML = ''; root = null; st = null; onExit = null;
    }
  };
})();
