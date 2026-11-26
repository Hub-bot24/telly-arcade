/*
 * ARCADE: the games overlay for the Ambient Dashboard.
 * Games: Shardfall (falling crystals, 1 to 4 players) and Tidewar (sonar fleet battle, vs computer or 2 players).
 *
 * Self-contained: it adds its own #arcade layer to the stage and takes the keys only while it is open.
 * Open it from Settings (OK on the remote) > Play games, or press Start / A on any Bluetooth controller.
 * Switch it off in Settings > "Games arcade".
 *
 * Controllers: the TV remote is player 1. Bluetooth game controllers (Xbox, PlayStation, 8BitDo...) paired
 * to the TV are players 2 to 4 (or all four). In a desktop browser, arrows+Enter+Space are the "remote" and
 * W A S D + F are a second player for testing.
 */
(function () {
  'use strict';
  var W = 1920, H = 1080;
  var A = window.ARCADE = { games: {}, W: W, H: H };
  var NOPHOTO = !!(((window.DASH_SETTINGS || {}).games || {}).noPhoto);
  var BASE = (function () { var c = document.currentScript; return c && c.src ? c.src.replace(/[^\/]*$/, '') : 'games/'; })();
  var imgCache = {};
  A.avatarImg = function (p) { if (!p || !p.avatar) return null; var u = A.asset(p.avatar), im = imgCache[u]; if (!im) { im = imgCache[u] = new Image(); im.src = u; } return im.complete && im.naturalWidth ? im : null; };
  A.drawAvatar = function (x, p, cx, cy, r) { var im = A.avatarImg(p); if (!im) return false; x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.closePath(); x.clip(); x.drawImage(im, cx - r, cy - r, r * 2, r * 2); x.restore(); x.lineWidth = 3; x.strokeStyle = p.color; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.stroke(); return true; };
  A.asset = function (rel) { return rel ? BASE + String(rel).replace(/^games\//, '') : ''; };
  var root, bg, bgx, cv, ctx, ui, modalEl, toastEl, opened = false, raf = 0, last = 0;
  var screen = 'home', active = null, modal = null;

  // ------------------------------------------------------------------ storage
  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { } }
  A.enabled = function () {
    try { var f = JSON.parse(get('dash.features') || '{}'); if (f.hasOwnProperty('games')) return !!f.games; } catch (e) { }
    var d = (window.DASH_SETTINGS || {}).features || {}; return d.games !== false;
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  A.esc = esc;

  // ------------------------------------------------------------------ player profiles + scores
  var COLORS = ['#7af7ff', '#ff7ad9', '#ffd66e', '#8dff8a', '#b48cff', '#ff9a5c', '#6ea8ff', '#ff6b7a'];
  A.COLORS = COLORS;
  var P = null;
  function blankStats() { return { sf: { best: 0, bestLines: 0, games: 0, wins: 0, battles: 0 }, tw: { wins: 0, losses: 0, best: 0, shots: 0, hits: 0 } }; }
  function loadProfiles() {
    try { P = JSON.parse(get('arcade.profiles') || 'null'); } catch (e) { P = null; }
    if (!P || !P.list || !P.list.length) {
      P = { list: [], seq: 1 };
      for (var i = 0; i < 4; i++) newProfile('Player ' + (i + 1), COLORS[i]);
      if (!NOPHOTO) { P.list[0].name = 'Dad'; P.list[0].avatar = 'games/avatars/dad.jpg'; }
    }
    if (!P.dadSet && !NOPHOTO) { P.dadSet = 1; var hasDad = false; for (var d = 0; d < P.list.length; d++) if (P.list[d].avatar) hasDad = true; if (!hasDad && /^Player 1$/.test(P.list[0].name)) { P.list[0].name = 'Dad'; P.list[0].avatar = 'games/avatars/dad.jpg'; } }
    for (var j = 0; j < P.list.length; j++) { var b = blankStats(), p = P.list[j]; if (!p.sf) p.sf = b.sf; if (!p.tw) p.tw = b.tw; }
    saveProfiles();
  }
  function newProfile(name, color) {
    var s = blankStats(), p = { id: 'p' + (P.seq++), name: name, color: color || COLORS[P.list.length % COLORS.length], sf: s.sf, tw: s.tw };
    P.list.push(p); return p;
  }
  function saveProfiles() { put('arcade.profiles', JSON.stringify(P)); }
  A.profiles = function () { return P.list; };
  A.profile = function (id) { for (var i = 0; i < P.list.length; i++) if (P.list[i].id === id) return P.list[i]; return null; };
  A.saveProfiles = saveProfiles;
  // Leaderboards. Built-in games keep their own fields; any other game (the quiz) uses A.record(game, pid, score, won).
  var BOARD = {
    shardfall: { get: function (p) { return p.sf.best; }, note: function (p) { return p.sf.bestLines ? p.sf.bestLines + ' lines · ' + (p.sf.wins || 0) + ' battle wins' : ''; } },
    tidewar: { get: function (p) { return p.tw.wins; }, note: function (p) { return p.tw.wins + ' won · ' + p.tw.losses + ' lost' + (p.tw.best ? ' · fastest ' + p.tw.best + ' shots' : ''); }, unit: 'wins' },
    springheist: { get: function (p) { return p.sh ? p.sh.best : 0; }, note: function (p) { return p.sh && p.sh.level ? 'reached level ' + p.sh.level : ''; } }
  };
  A.record = function (game, pid, score, won) {
    var p = A.profile(pid); if (!p) return false;
    var g = (p.games = p.games || {})[game] = (p.games || {})[game] || { best: 0, played: 0, wins: 0 };
    g.played++; if (won) g.wins++; var nb = score > g.best; if (nb) g.best = score; saveProfiles(); return nb;
  };
  A.board = function (game) {
    var B = BOARD[game] || { get: function (p) { return p.games && p.games[game] ? p.games[game].best : 0; }, note: function (p) { var g = p.games && p.games[game]; return g ? g.played + ' played' + (g.wins ? ' · ' + g.wins + ' wins' : '') : ''; } };
    return P.list.filter(function (p) { return B.get(p) > 0; }).sort(function (a, b) { return B.get(b) - B.get(a); }).map(function (p) { return { p: p, score: B.get(p), note: B.note(p), unit: B.unit || '' }; });
  };
  A.boardHtml = function (game, mark, n) {
    var b = A.board(game).slice(0, n || 5), h = '<div class="ar-eyebrow" style="margin:6px 0 10px;text-align:left">Leaderboard</div><div class="ar-res" style="margin-bottom:24px">';
    if (!b.length) return '';
    for (var i = 0; i < b.length; i++) h += '<div class="ar-rr" style="height:62px;font-size:24px"><span class="ar-rk">' + (i + 1) + '</span><span class="ar-rn" style="font-size:30px;color:' + b[i].p.color + '">' + esc(b[i].p.name) + (mark && mark.indexOf(b[i].p.id) >= 0 ? '<span class="ar-nb">NEW</span>' : '') + '</span><span class="ar-rx" style="width:420px">' + esc(b[i].note) + '</span><span class="ar-rs" style="width:160px;text-align:right;font-size:32px">' + fmt(b[i].score) + (b[i].unit ? ' <small style="font-size:16px;opacity:.5">' + b[i].unit + '</small>' : '') + '</span></div>';
    return h + '</div>';
  };

  // ------------------------------------------------------------------ sound (all synthesised, no files)
  var ac = null, master = null, musicGain = null, sfxGain = null;
  var soundOn = get('arcade.sound') !== '0', musicMode = get('arcade.musicmode') || 'auto', spotifyOn = false;
  function musicWanted() { return musicMode === 'on' || (musicMode === 'auto' && !spotifyOn); }
  function audio() {
    if (ac) return ac;
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
      ac = new C(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      var comp = ac.createDynamicsCompressor(); comp.connect(master);
      sfxGain = ac.createGain(); sfxGain.gain.value = soundOn ? 0.55 : 0; sfxGain.connect(comp);
      musicGain = ac.createGain(); musicGain.gain.value = musicWanted() ? MVOL[mvol] : 0; musicGain.connect(comp);
      // a little room on the music
      var dl = ac.createDelay(); dl.delayTime.value = 0.27; var fb = ac.createGain(); fb.gain.value = 0.32; var wet = ac.createGain(); wet.gain.value = 0.5;
      musicGain.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(comp);
      A.musicBus = musicGain;
    } catch (e) { ac = null; }
    return ac;
  }
  var noiseBuf = null;
  function tone(f, dur, type, vol, to, delay, bus) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxGain); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, delay, q, to) {
    var a = audio(); if (!a) return;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var t = a.currentTime + (delay || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.setValueAtTime(freq || 1200, t); f.Q.value = q || 1;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t + dur + 0.05);
  }
  A.tone = tone; A.noise = noise; A.audio = audio;
  var SFX = {
    nav: function () { tone(660, 0.07, 'triangle', 0.18); },
    ok: function () { tone(520, 0.09, 'triangle', 0.2); tone(1040, 0.14, 'sine', 0.16, 0, 0.05); },
    back: function () { tone(440, 0.1, 'triangle', 0.18, 300); },
    join: function () { tone(392, 0.12, 'sine', 0.22); tone(587, 0.12, 'sine', 0.2, 0, 0.07); tone(784, 0.25, 'sine', 0.2, 0, 0.14); },
    count: function () { tone(880, 0.12, 'square', 0.08); },
    go: function () { tone(1320, 0.35, 'square', 0.08); tone(660, 0.4, 'sawtooth', 0.06); }
  };
  A.sfx = SFX;
  A.muted = !soundOn;
  A.setSound = function (on) { soundOn = on; A.muted = !on; put('arcade.sound', on ? '1' : '0'); if (sfxGain) sfxGain.gain.value = on ? 0.55 : 0; };
  var MVOL = { low: 0.12, mid: 0.22, high: 0.34 }, MVL = ['low', 'mid', 'high'], mvol = MVOL[get('arcade.mvol')] ? get('arcade.mvol') : 'mid';
  function applyMusic() { if (musicGain) musicGain.gain.value = musicWanted() ? MVOL[mvol] : 0; }
  A.setMusicMode = function (m) { musicMode = m; put('arcade.musicmode', m); applyMusic(); };
  A.soundOn = function () { return soundOn; };
  // Spotify DJ (games/spotify.js) tells us the moment it starts music, so game music steps aside at once
  A.spotifyNow = function (on) { spotifyOn = !!on; applyMusic(); };
  // ---- visual effects: High (Fire TV Cube, PCs, phones) or Light (the Samsung's slower chip). Auto picks by device.
  var fxMode = get('arcade.fx') || 'auto';
  function fxAutoHigh() { var D = window.TELLY_DEVICE; if (D && D.platform) return !!D.hifx; return !window.tizen && !/Tizen|SMART-TV|Web0S|NetCast/i.test(navigator.userAgent); }
  A.fxHigh = function () { return fxMode === 'high' || (fxMode === 'auto' && fxAutoHigh()); };
  A.setFx = function (m) { fxMode = m; put('arcade.fx', m); applyBloom(); };
  var FXM = ['auto', 'high', 'light'];
  function fxLabel() { return fxMode === 'auto' ? 'Auto · ' + (fxAutoHigh() ? 'High' : 'Light') : fxMode === 'high' ? 'High (glow, 3D)' : 'Light (faster)'; }
  // where we are in the current musical beat (0..1), or -1 when no track is playing; games pulse with it
  A.beat = function () {
    if (!ac || !mus.srcs.length || !MUSLEN || !MUSLEN[mus.name]) return -1;
    var bpm = MUSLEN[mus.name].bpm || 120, pos = (ac.currentTime - mus.startAt) * mus.rate;
    if (pos < 0) return -1; var b = pos * bpm / 60; return b - Math.floor(b);
  };
  var MM = ['auto', 'on', 'off'], MML = { auto: 'Auto (off when Spotify plays)', on: 'On', off: 'Off' };
  // Two option rows every pause menu shares
  A.soundOpts = function () {
    var rows = [{ label: 'Game music', value: function () { return MML[musicMode] + (musicMode === 'auto' && spotifyOn ? ' · Spotify on' : ''); }, change: function (d) { A.setMusicMode(MM[(MM.indexOf(musicMode) + (d || 1) + 3) % 3]); } },
      { label: 'Sound effects', value: function () { return soundOn ? 'On' : 'Off'; }, change: function () { A.setSound(!soundOn); } }];
    if ((((window.DASH_SETTINGS || {}).games) || {}).shardfallStages !== false) rows.push({ label: 'Shardfall stages', value: function () { return get('arcade.sfStages') === 'off' ? 'Off' : 'On · chill to drum & bass'; }, change: function () { put('arcade.sfStages', get('arcade.sfStages') === 'off' ? 'on' : 'off'); } });
    rows.push({ label: 'Music volume', value: function () { return { low: 'Low', mid: 'Medium', high: 'High' }[mvol]; }, change: function (d) { mvol = MVL[Math.max(0, Math.min(2, MVL.indexOf(mvol) + (d || 1)))]; put('arcade.mvol', mvol); applyMusic(); } });
    rows.push({ label: 'Visual effects', value: fxLabel, change: function (d) { A.setFx(FXM[(FXM.indexOf(fxMode) + (d || 1) + 3) % 3]); } });
    return A.dj ? rows.concat(A.dj.opts()) : rows;
  };
  // Spotify: if the dashboard can see something playing, game music steps aside
  function checkSpotify() {
    var M = window.MEDIA; if (!opened || !M || !M.spotifyReady || !M.spotifyReady()) return;
    try { M.nowPlaying(function (e, t) {
      if (e) return; var was = spotifyOn; spotifyOn = !!(t && t.playing); applyMusic();
      A.track = spotifyOn ? t : null; renderTrack();
      if (spotifyOn && !was && musicMode === 'auto') A.toast('Spotify is playing · game music off, sound effects on');
    }); } catch (er) { }
  }
  setInterval(checkSpotify, 15000);
  function renderTrack() { var el = document.getElementById('ar-track'); if (!el) return; el.innerHTML = A.track ? '<i></i>' + esc(A.track.title) + ' <span>' + esc(A.track.artist) + '</span>' : ''; el.className = A.track ? 'on' : ''; }

  // ------------------------------------------------------------------ the sound pack (games/snd/*.mp3, made by games-source/audio)
  // Sounds load per game so the TV never holds more than it needs. A.play() returns false until a sound is ready,
  // so callers can fall back to the old synth for the first split second.
  var SND = {}, SNDL = {}, MUSLEN = null, live = {};
  function xget(url, type, cb) {
    try { var x = new XMLHttpRequest(); x.open('GET', url, true); x.responseType = type;
      x.onload = function () { cb(x.status === 0 || (x.status >= 200 && x.status < 300) ? x.response : null); }; x.onerror = function () { cb(null); }; x.send(); } catch (e) { cb(null); }
  }
  function loadSnd(name, cb) {
    if (SND[name]) { if (cb) cb(SND[name]); return; }
    if (SNDL[name]) { if (cb) SNDL[name].push(cb); return; }
    var a = audio(); if (!a) return; SNDL[name] = cb ? [cb] : [];
    xget(A.asset('games/snd/' + name + '.mp3'), 'arraybuffer', function (buf) {
      var done = function (b) { var q = SNDL[name] || []; delete SNDL[name]; if (b) SND[name] = b; for (var i = 0; i < q.length; i++) q[i](b); };
      if (!buf) return done(null);
      try { var p = a.decodeAudioData(buf, done, function () { done(null); }); if (p && p.catch) p.catch(function () { done(null); }); } catch (e) { done(null); }
    });
  }
  var PACKS = {
    ui: ['ui_nav', 'ui_ok', 'ui_back', 'ui_join', 'ui_count', 'ui_go'],
    sf: ['sf_move', 'sf_rotate', 'sf_hold', 'sf_lock', 'sf_hard', 'sf_clear1', 'sf_clear2', 'sf_clear3', 'sf_quad', 'sf_collapse', 'sf_settle', 'sf_wellready', 'sf_garbage', 'sf_send', 'sf_level', 'sf_flawless', 'sf_ko', 'sf_nope', 'sf_win'],
    tw: ['tw_ping', 'tw_whistle', 'tw_splash', 'tw_boom', 'tw_sink', 'tw_move', 'tw_weapon', 'tw_win', 'tw_lose'],
    sh: ['sh_boing', 'sh_loot', 'sh_pulse', 'sh_stun', 'sh_hit', 'sh_break', 'sh_hop', 'sh_gold', 'sh_eat', 'sh_clear', 'sh_over', 'sh_land', 'sh_door'],
    qz: ['qz_move', 'qz_lock', 'qz_tick', 'qz_right', 'qz_wrong', 'qz_spin', 'qz_fanfare']
  };
  var packOn = {};
  // Load one game's sounds and let the others go (keeps memory low on the TV).
  A.soundPack = function (id) {
    for (var k in packOn) if (packOn.hasOwnProperty(k) && k !== 'ui' && k !== id) { for (var i = 0; i < PACKS[k].length; i++) delete SND[PACKS[k][i]]; delete packOn[k]; }
    var list = (PACKS.ui).concat(PACKS[id] || []); packOn.ui = packOn[id] = true;
    for (var j = 0; j < list.length; j++) loadSnd(list[j]);
  };
  // opts: { vol, rate, pan, delay, vary (random pitch spread, e.g. 0.04), max (voices of this sound at once) }
  A.play = function (name, opts) {
    var b = SND[name]; if (!b) { loadSnd(name); return false; }
    if (!soundOn || !ac) return true;
    opts = opts || {};
    try {
      var t = ac.currentTime + (opts.delay || 0), s = ac.createBufferSource(), g = ac.createGain(), out = g;
      s.buffer = b; var r = (opts.rate || 1) * (opts.vary ? 1 + (Math.random() * 2 - 1) * opts.vary : 1); s.playbackRate.value = r;
      g.gain.value = opts.vol == null ? 1 : opts.vol;
      s.connect(g);
      if (opts.pan && ac.createStereoPanner) { var p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, opts.pan)); g.connect(p); out = p; }
      out.connect(sfxGain); s.start(t);
      var L = live[name] || (live[name] = []); L.push({ s: s, g: g, t: t });
      var max = opts.max || 4; while (L.length > max) { var o = L.shift(); try { o.g.gain.setTargetAtTime(0, ac.currentTime, 0.015); o.s.stop(ac.currentTime + 0.08); } catch (e) { } }
      s.onended = function () { for (var i = 0; i < L.length; i++) if (L[i].s === s) { L.splice(i, 1); break; } };
    } catch (e) { }
    return true;
  };
  // The shared UI sounds go through the pack too, with the synth as a fallback
  (function () { for (var k in SFX) if (SFX.hasOwnProperty(k)) (function (k, f) { SFX[k] = function () { if (!A.play('ui_' + k)) f(); }; })(k, SFX[k]); })();

  // ---- music: seamless loops from the pack (a game passes { track: 'mu_x', layer: 'mu_y' }), else the little sequencer
  var mus = { name: null, srcs: [], gains: [], startAt: 0, rate: 1, pos: {}, stoppedAt: 0, pat: null, want: 0 };
  function musicLen(cb) { if (MUSLEN) return cb(MUSLEN); xget(A.asset('games/snd/music.json'), 'text', function (t) { try { MUSLEN = JSON.parse(t); } catch (e) { MUSLEN = {}; } cb(MUSLEN); }); }
  // where the loop really starts in the decoded file (decoders can add a few ms of silence up front)
  // The file is the loop plus its first 1.5 s again, so the first offset where the two copies match is where the loop begins.
  function loopStart(b, L) {
    if (b._ls != null) return b._ls;
    var d = b.getChannelData(0), n = Math.round(L * b.sampleRate), W = 1024, best = 0, bestE = 1e18, maxK = Math.min(6000, d.length - n - W - 1);
    for (var k = 0; k <= maxK; k++) {
      var e = 0, en = 0; for (var j = 0; j < W; j += 2) { var q = d[k + j] - d[k + n + j]; e += q * q; en += d[k + n + j] * d[k + n + j]; }
      if (en > 1e-6 && e < en * 0.002) { best = k; break; }
      if (e < bestE) { bestE = e; best = k; }
    }
    b._ls = best / b.sampleRate; return b._ls;
  }
  function stopTrack(fade) {
    if (!ac) return;
    if (mus.name && mus.srcs.length) { var L = (MUSLEN && MUSLEN[mus.name] && MUSLEN[mus.name].len) || 1; mus.pos[mus.name] = ((ac.currentTime - mus.startAt) * mus.rate) % L; mus.stoppedAt = Date.now(); }
    for (var i = 0; i < mus.srcs.length; i++) { try { mus.gains[i].gain.setTargetAtTime(0, ac.currentTime, fade || 0.12); mus.srcs[i].stop(ac.currentTime + (fade || 0.12) * 6); } catch (e) { } }
    mus.srcs = []; mus.gains = [];
  }
  function startTrack(pat) {
    var name = pat.track, names = [name].concat(pat.layer ? [pat.layer] : []), want = ++mus.want;
    musicLen(function (M) {
      var got = 0, bufs = [];
      names.forEach(function (nm, i) { loadSnd(nm, function (b) { bufs[i] = b; if (++got < names.length || want !== mus.want || !seqOnTrack()) return; go(); }); });
      function go() {
        if (!bufs[0] || !M[name]) return;
        var xf = pat.xfade || 0; stopTrack(xf ? xf / 3 : 0.05);
        var L = M[name].len, resume = (Date.now() - mus.stoppedAt < 90000 && mus.pos[name]) || 0;
        var t0 = ac.currentTime + 0.06; mus.name = name; mus.rate = mus.rate || 1; mus.startAt = t0 - resume / mus.rate;
        for (var i = 0; i < bufs.length; i++) {
          if (!bufs[i]) continue;
          var s = ac.createBufferSource(), g = ac.createGain(), ls = loopStart(bufs[0], L);
          s.buffer = bufs[i]; s.loop = true; s.loopStart = ls; s.loopEnd = ls + L; s.playbackRate.value = mus.rate;
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(i === 0 ? 1 : layerGain(), t0 + (xf || (resume ? 0.6 : 0.05)));
          s.connect(g); g.connect(musicGain); s.start(t0, ls + resume);
          mus.srcs.push(s); mus.gains.push(g);
        }
      }
    });
  }
  function seqOnTrack() { return seq.trackOn; }
  function layerGain() { var I = seq.pat && seq.pat.intensity != null ? seq.pat.intensity : 1; return Math.min(1.6, 0.25 + I * 1.6); }
  setInterval(function () { if (ac && mus.gains[1]) mus.gains[1].gain.setTargetAtTime(layerGain(), ac.currentTime, 0.8); }, 250);

  var HOME_MUSIC = { track: 'mu_home', bpm: 96, play: function () { } };
  var seq = { on: false, pat: null, step: 0, next: 0, bpm: 110, timer: 0, trackOn: false };
  A.music = function (pat, bpm) {
    var a = audio(); seq.pat = pat; if (!a || !pat) { seq.on = false; return; }
    seq.bpm = bpm || pat.bpm || 110;
    if (pat.track) {
      seq.on = false; seq.trackOn = true; mus.pat = pat; mus.rate = rateFor(seq.bpm, pat);
      if (mus.name === pat.track && mus.srcs.length) return;
      if (mus.name !== pat.track) { mus.pos = {}; }
      startTrack(pat); return;
    }
    seq.trackOn = false; stopTrack();
    seq.step = 0; seq.next = a.currentTime + 0.1; seq.on = true;
    if (!seq.timer) seq.timer = setInterval(schedule, 40);
  };
  function rateFor(bpm, pat) { var b = pat.bpm || bpm; return Math.max(1, Math.min(1.12, 1 + (bpm / b - 1) * 0.3)); }
  A.musicTempo = function (bpm) {
    seq.bpm = bpm;
    if (seq.trackOn && mus.pat && ac) { var r = rateFor(bpm, mus.pat); if (Math.abs(r - mus.rate) > 0.001) { var L = (MUSLEN && MUSLEN[mus.name] && MUSLEN[mus.name].len) || 1, pos = ((ac.currentTime - mus.startAt) * mus.rate) % L; mus.rate = r; mus.startAt = ac.currentTime - pos / r; for (var i = 0; i < mus.srcs.length; i++) mus.srcs[i].playbackRate.setTargetAtTime(r, ac.currentTime, 0.3); } }
  };
  A.musicStop = function () { seq.on = false; seq.trackOn = false; mus.want++; stopTrack(); };
  A._audioDebug = function () { return { track: mus.name, playing: mus.srcs.length, rate: mus.rate, loaded: Object.keys(SND).length, ctx: ac && ac.state, layer: mus.gains[1] ? +mus.gains[1].gain.value.toFixed(2) : null }; };
  A.musicRestart = function () { mus.pos = {}; mus.stoppedAt = 0; };
  function schedule() {
    if (!seq.on || !ac || !seq.pat) return;
    var spb = 60 / seq.bpm / 4;
    while (seq.next < ac.currentTime + 0.12) {
      seq.pat.play(seq.step, seq.next, spb, musicGain, ac);
      seq.step++; seq.next += spb;
    }
  }
  A.note = function (midi) { return 440 * Math.pow(2, (midi - 69) / 12); };
  A.mtone = function (a, bus, t, f, dur, type, vol, cut) {
    var o = a.createOscillator(), g = a.createGain(), fl = a.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, t); fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut || 2400, t); fl.frequency.exponentialRampToValueAtTime(Math.max(200, (cut || 2400) / 5), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  };

  // ------------------------------------------------------------------ input: remote, keyboards, up to 4 gamepads
  // Every press becomes { src, kind: 'key'|'pad', act } with act one of L R U D A B X Y LB RB START BACK.
  var KEYMAP = {
    37: ['remote', 'L'], 39: ['remote', 'R'], 38: ['remote', 'U'], 40: ['remote', 'D'], 13: ['remote', 'A'], 32: ['remote', 'X'],
    27: ['remote', 'BACK'], 10009: ['remote', 'BACK'], 8: ['remote', 'BACK'], 90: ['remote', 'B'], 67: ['remote', 'LB'], 16: ['remote', 'Y'], 80: ['remote', 'START'],
    10252: ['remote', 'Y'], 415: ['remote', 'Y'], 19: ['remote', 'Y'], 427: ['remote', 'LB'], 428: ['remote', 'RB'], 403: ['remote', 'Y'], 404: ['remote', 'LB'], 405: ['remote', 'RB'], 406: ['remote', 'START'],
    10182: ['remote', 'BACK'],
    65: ['kb2', 'L'], 68: ['kb2', 'R'], 87: ['kb2', 'U'], 83: ['kb2', 'D'], 70: ['kb2', 'A'], 81: ['kb2', 'B'], 69: ['kb2', 'LB'], 82: ['kb2', 'Y'], 9: ['kb2', 'BACK']
  };
  var TV_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'];
  function tvKeys(on) {
    try { var t = window.tizen.tvinputdevice; for (var i = 0; i < TV_KEYS.length; i++) { try { if (on) t.registerKey(TV_KEYS[i]); else if (TV_KEYS[i] !== 'ColorF0Red') t.unregisterKey(TV_KEYS[i]); } catch (e) { } } } catch (e) { }
  }
  // which buttons are held right now (games that need "hold to run" ask A.held)
  var keyDown = {};
  A.held = function (src, act) {
    var kc, now = Date.now();
    for (kc in keyDown) if (keyDown.hasOwnProperty(kc)) {
      var m = KEYMAP[kc]; if (!m || m[1] !== act || (src && m[0] !== src)) continue;
      // a TV remote can drop a key-up now and then; a held key repeats, so a long silence means it was let go
      if (now - keyDown[kc] < 1500) return true;
    }
    for (var s in padState) if (padState.hasOwnProperty(s) && (!src || s === src) && padState[s].down[act]) return true;
    return false;
  };
  window.addEventListener('blur', function () { keyDown = {}; });
  function onKeyDown(e) {
    if (!opened) {
      if (e.keyCode === 71 && !e.ctrlKey && !e.metaKey && document.activeElement === document.body && A.enabled()) { A.open(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var m = KEYMAP[e.keyCode]; if (!m) return;
    keyDown[e.keyCode] = Date.now();
    audio(); if (ac && ac.state === 'suspended' && ac.resume) ac.resume();
    dispatch({ src: m[0], kind: 'key', act: m[1], repeat: !!e.repeat });
  }
  // gamepads
  var PADBTN = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LB', 7: 'RB', 8: 'BACK', 9: 'START', 12: 'U', 13: 'D', 14: 'L', 15: 'R' };
  var padState = {}, REP = { L: [165, 42], R: [165, 42], D: [0, 32], U: [260, 90] };
  A.padRepeatUp = false;
  function readPads(now, closed) {
    var list; try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { list = []; }
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var gp = list[i]; if (!gp || !gp.connected) continue;
      var src = 'pad' + gp.index, st = padState[src] || (padState[src] = { down: {}, t: {} }), cur = {};
      for (var b in PADBTN) if (PADBTN.hasOwnProperty(b) && gp.buttons[b]) { var bt = gp.buttons[b]; if (bt.pressed || bt.value > 0.5) cur[PADBTN[b]] = true; }
      var ax = gp.axes || [];
      if (ax[0] < -0.55) cur.L = true; if (ax[0] > 0.55) cur.R = true; if (ax[1] < -0.65) cur.U = true; if (ax[1] > 0.55) cur.D = true;
      if (ax.length > 7 && gp.mapping !== 'standard') { if (ax[6] < -0.5) cur.L = true; if (ax[6] > 0.5) cur.R = true; if (ax[7] < -0.5) cur.U = true; if (ax[7] > 0.5) cur.D = true; }
      feed(src, cur, now, closed);
    }
    for (var ph in phoneHeld) if (phoneHeld.hasOwnProperty(ph)) feed(ph, phoneHeld[ph], now, closed);
  }
  // phones (games/phone.js) set A.phoneHeld[src] = { act: true } while a button is held
  var phoneHeld = A.phoneHeld = {};
  function feed(src, cur, now, closed) {
    var st = padState[src] || (padState[src] = { down: {}, t: {} });
    for (var act in cur) if (cur.hasOwnProperty(act) && cur[act]) {
      if (!st.down[act]) {
        st.down[act] = now; st.t[act] = now + (REP[act] ? REP[act][0] : 1e9);
        if (closed) { if ((act === 'START' || act === 'A') && A.enabled()) A.open(); }
        else dispatch({ src: src, kind: 'pad', act: act });
      } else if (!closed && REP[act] && (act !== 'U' || A.padRepeatUp) && now >= st.t[act]) {
        st.t[act] = now + REP[act][1]; dispatch({ src: src, kind: 'pad', act: act, repeat: true });
      }
    }
    for (var d in st.down) if (st.down.hasOwnProperty(d) && !cur[d]) delete st.down[d];
  }
  A.padCount = function () { var n = 0, l; try { l = navigator.getGamepads(); } catch (e) { l = []; } if (l) for (var i = 0; i < l.length; i++) if (l[i] && l[i].connected) n++; return n; };
  A.srcLabel = function (src) {
    if (src === 'remote') return 'TV remote'; if (src === 'kb2') return 'Keyboard W A S D';
    if (src.indexOf('ph') === 0) return 'Phone' + (A.phoneName && A.phoneName(src) ? ' · ' + A.phoneName(src) : '');
    var l; try { l = navigator.getGamepads(); } catch (e) { } var gp = l && l[+src.slice(3)], id = gp ? gp.id : '';
    if (/xbox|xinput|045e/i.test(id)) return 'Xbox controller ' + (+src.slice(3) + 1);
    if (/sony|playstation|dualshock|dualsense|054c/i.test(id)) return 'PlayStation controller ' + (+src.slice(3) + 1);
    return 'Controller ' + (+src.slice(3) + 1);
  };
  A.isPad = function (src) { return src.indexOf('pad') === 0 || src.indexOf('ph') === 0; };

  function dispatch(ev) {
    if (modal) { modal.input(ev); return; }
    if (screen === 'game' && active) { active.input(ev); return; }
    var h = SCREENS[screen]; if (h && h.input) h.input(ev);
  }

  // ------------------------------------------------------------------ background: slow drifting colour in the dark
  var tint = [[122, 247, 255], [180, 140, 255], [255, 122, 217]];
  A.tint = function (t) { tint = t; };
  var bgT = 0, bgSkip = 0;
  function drawBg(dt) {
    bgT += dt; if ((bgSkip = (bgSkip + 1) % 2)) return;
    var w = 480, h = 270; bgx.fillStyle = '#04050a'; bgx.fillRect(0, 0, w, h);
    for (var i = 0; i < 3; i++) {
      var c = tint[i], t = bgT / 1000 * (0.05 + i * 0.017) + i * 2.1;
      var x = w * (0.5 + 0.42 * Math.sin(t * 1.3 + i)), y = h * (0.5 + 0.4 * Math.cos(t * 0.9 + i * 1.7)), r = 240 + 60 * Math.sin(t * 2 + i);
      var g = bgx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.16)'); g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      bgx.fillStyle = g; bgx.fillRect(0, 0, w, h);
    }
  }

  // ------------------------------------------------------------------ main loop (only runs while open)
  // ---- bloom: a quarter-size copy of the bright parts, blurred and screened over the game (High effects only)
  var bloomCv = null, bloomX = null, bloomOn = false, bloomFilter = false; var bloomSlow = false, slowAcc = 0;
  function applyBloom() {
    bloomOn = A.fxHigh() && screen === 'game' && !bloomSlow;
    if (bloomCv) bloomCv.style.display = bloomOn ? 'block' : 'none';
  }
  function drawBloom() {
    if (!bloomOn) return;
    if (!bloomCv) {
      bloomCv = document.createElement('canvas'); bloomCv.width = 480; bloomCv.height = 270; bloomCv.id = 'ar-bloom';
      cv.parentNode.insertBefore(bloomCv, cv.nextSibling); bloomX = bloomCv.getContext('2d');
      bloomFilter = 'filter' in bloomX; bloomCv.style.display = 'block';
    }
    bloomX.globalCompositeOperation = 'copy';
    if (bloomFilter) bloomX.filter = 'brightness(0.62) contrast(2.4) saturate(1.3)';
    bloomX.drawImage(cv, 0, 0, 480, 270);
    if (bloomFilter) bloomX.filter = 'none';
    bloomX.globalCompositeOperation = 'source-over';
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(50, now - (last || now)); last = now;
    readPads(now, false);
    drawBg(dt);
    if (bloomOn && fxMode === 'auto' && !bloomSlow) { slowAcc = slowAcc * 0.98 + (dt > 24 ? 1 : 0) * 0.02; if (slowAcc > 0.5) { bloomSlow = true; A.toast('Glow turned down a notch to keep things smooth'); } }
    var wasOn = bloomOn; bloomOn = A.fxHigh() && screen === 'game' && !bloomSlow; if (wasOn !== bloomOn) applyBloom();
    if (screen === 'game' && active) active.frame(dt, ctx, now);
    else { ctx.clearRect(0, 0, W, H); var h = SCREENS[screen]; if (h && h.frame) h.frame(dt, now); }
    drawBloom();
  }
  setInterval(function () { if (!opened && A.enabled()) readPads(Date.now(), true); }, 400);

  // ------------------------------------------------------------------ UI helpers
  function $(id) { return document.getElementById(id); }
  function show(id) {
    var s = ui.querySelectorAll('.ar-scr');
    for (var i = 0; i < s.length; i++) s[i].className = s[i].id === id ? 'ar-scr on' : 'ar-scr';
  }
  A.toast = function (html) { toastEl.innerHTML = '<span>' + html + '</span>'; toastEl.className = 'on'; clearTimeout(A._tt); A._tt = setTimeout(function () { toastEl.className = ''; }, 2600); };
  function setScreen(name, arg) {
    screen = name;
    if (name !== 'game') { ctx.clearRect(0, 0, W, H); }
    var h = SCREENS[name]; if (h && h.enter) h.enter(arg);
  }
  A.setScreen = setScreen;

  // modal: { html, input(ev) } plus optional simple option list
  A.modal = function (m) { modal = m; modalEl.innerHTML = m.html; modalEl.className = 'on'; if (m.after) m.after(modalEl); };
  A.closeModal = function () { modal = null; modalEl.className = ''; modalEl.innerHTML = ''; };
  A.modalOpen = function () { return !!modal; };
  // Option menu in a modal: opts = [{label, run}] ; title, sub, eyebrow
  A.menu = function (o) {
    o.opts = o.opts.filter(function (op) { return !op.hide; });
    var idx = o.idx || 0;
    function html() {
      var h = '<div class="ar-box' + (o.wide ? ' ar-wide' : '') + '">' + (o.eyebrow ? '<div class="ar-eyebrow">' + o.eyebrow + '</div>' : '') +
        '<div class="ar-title">' + o.title + '</div>' + (o.sub ? '<div class="ar-sub">' + o.sub + '</div>' : '') + (o.body || '');
      for (var i = 0; i < o.opts.length; i++) {
        var op = o.opts[i], v = op.value ? '<span class="ar-ov"><em>‹</em>' + op.value() + '<em>›</em></span>' : '';
        h += '<div class="ar-opt' + (op.go ? ' go' : '') + (i === idx ? ' sel' : '') + '"><span class="ar-ol">' + op.label + '</span>' + v + '</div>';
      }
      return h + '</div>';
    }
    A.modal({ html: html(), input: function (ev) {
      var a = ev.act, op = o.opts[idx];
      if (a === 'U') { idx = (idx - 1 + o.opts.length) % o.opts.length; SFX.nav(); }
      else if (a === 'D') { idx = (idx + 1) % o.opts.length; SFX.nav(); }
      else if ((a === 'L' || a === 'R') && op.change) { op.change(a === 'R' ? 1 : -1); SFX.nav(); }
      else if (a === 'A' || a === 'X' || a === 'START') { SFX.ok(); if (op.change && !op.run) op.change(1); else { op.run(); return; } }
      else if (a === 'BACK' || a === 'B') { SFX.back(); if (o.back) { o.back(); return; } }
      else return;
      if (modal) modalEl.innerHTML = html();
    } });
  };

  // On-screen keyboard for names
  A.keyboard = function (title, start, done) {
    var rows = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ-', '0123456789'], name = start || '', r = 0, c = 0, nrow = rows.length;
    function html() {
      var h = '<div class="ar-box ar-wide"><div class="ar-eyebrow">' + title + '</div><div class="ar-kb-name">' + esc(name) + '<i></i></div>';
      for (var i = 0; i < nrow; i++) {
        h += '<div class="ar-kb-row">'; for (var j = 0; j < rows[i].length; j++) h += '<span class="ar-kb-k' + (i === r && j === c ? ' sel' : '') + '">' + rows[i][j] + '</span>'; h += '</div>';
      }
      var sp = ['SPACE', 'DELETE', 'DONE'];
      h += '<div class="ar-kb-row">'; for (var k = 0; k < 3; k++) h += '<span class="ar-kb-k w' + (r === nrow && c === k ? ' sel' : '') + '">' + sp[k] + '</span>'; h += '</div>';
      return h + '<div class="ar-sub" style="margin:26px 0 0">Arrows to pick · OK to type · Back to delete</div></div>';
    }
    A.modal({ html: html(), input: function (ev) {
      var a = ev.act, rl = r === nrow ? 3 : rows[r].length;
      if (a === 'L') c = (c - 1 + rl) % rl; else if (a === 'R') c = (c + 1) % rl;
      else if (a === 'U') { r = (r - 1 + nrow + 1) % (nrow + 1); } else if (a === 'D') { r = (r + 1) % (nrow + 1); }
      else if (a === 'A' || a === 'X') {
        if (r < nrow) { if (name.length < 12) name += (name.length && rows[r][c] !== '-' && rows[r][c] < 'A' === false ? rows[r][c].toLowerCase() : rows[r][c]); }
        else if (c === 0) { if (name.length < 12) name += ' '; } else if (c === 1) name = name.slice(0, -1);
        else { var n = name.replace(/^\s+|\s+$/g, ''); if (!n) return; SFX.ok(); A.closeModal(); done(n); return; }
        SFX.ok();
      } else if (a === 'BACK' || a === 'B') { if (name.length) name = name.slice(0, -1); else { SFX.back(); A.closeModal(); done(null); return; } }
      else if (a === 'START') { var n2 = name.replace(/^\s+|\s+$/g, ''); if (n2) { A.closeModal(); done(n2); } return; }
      else return;
      if (r === nrow) c = Math.min(c, 2); else c = Math.min(c, rows[r].length - 1);
      SFX.nav(); modalEl.innerHTML = html();
    } });
  };

  // ------------------------------------------------------------------ screens
  var SCREENS = {};
  // HOME: three cards
  var homeIdx = 0, cardCv = [], cardT = 0;
  SCREENS.home = {
    enter: function () { show('ar-home'); A.tint([[122, 247, 255], [180, 140, 255], [255, 122, 217]]); A.soundPack('ui'); A.music(HOME_MUSIC, 96); renderHome(); },
    input: function (ev) {
      var a = ev.act;
      var nc = CARDS.length;
      if (a === 'L') { homeIdx = (homeIdx + nc - 1) % nc; SFX.nav(); } else if (a === 'R') { homeIdx = (homeIdx + 1) % nc; SFX.nav(); }
      else if (a === 'A' || a === 'X' || a === 'START') {
        SFX.ok(); var id = CARDS[homeIdx].id;
        if (id === 'shardfall') setScreen('sfLobby', ev); else if (id === 'tidewar') setScreen('twSetup'); else if (id === 'players') setScreen('players'); else A.launch(id, {});
        return;
      }
      else if (a === 'BACK' || a === 'B') { A.close(); return; }
      else if (a === 'Y' || a === 'U' || a === 'D') { A.menu({ eyebrow: 'Arcade', title: 'Sound', sub: 'Play Spotify on your phone and game music steps aside by itself.', opts: A.soundOpts().concat([
        { label: 'Done', go: true, run: A.closeModal }]), back: A.closeModal }); return; }
      else return;
      renderHome();
    },
    frame: function (dt) { cardT += dt; for (var i = 0; i < cardCv.length; i++) if (cardCv[i].draw) { var cx = cardCv[i].x; cx.clearRect(0, 0, cardCv[i].w, 560); cx.save(); cx.beginPath(); cx.rect(0, 0, cardCv[i].w, 280); cx.clip(); cardCv[i].draw(cx, cardT, i === homeIdx, cardCv[i].w); cx.restore(); var fg = cx.createLinearGradient(0, 200, 0, 280); fg.addColorStop(0, 'rgba(14,14,24,0)'); fg.addColorStop(1, 'rgba(14,14,24,1)'); cx.globalCompositeOperation = 'destination-out'; cx.fillStyle = fg; cx.fillRect(0, 200, cardCv[i].w, 80); cx.globalCompositeOperation = 'source-over'; } }
  };
  function renderHome() {
    var c = ui.querySelectorAll('#ar-home .ar-card');
    for (var i = 0; i < c.length; i++) c[i].className = 'ar-card' + (i === homeIdx ? ' sel' : '');
    var row = $('ar-cards'), total = 0, left = 0, M = 36;
    for (var j = 0; j < CARDS.length; j++) { if (j === homeIdx) left = total; total += CARDS[j].w + M; }
    var off = total <= W - 80 ? (W - total) / 2 : Math.max(W - 50 - total, Math.min(50, W / 2 - left - (CARDS[homeIdx] ? CARDS[homeIdx].w : 0) / 2));
    row.style.webkitTransform = row.style.transform = 'translateX(' + Math.round(off) + 'px)';
    var pads = A.padCount();
    $('ar-padline').innerHTML = pads ? pads + ' controller' + (pads > 1 ? 's' : '') + ' connected, plus the TV remote' : 'TV remote is player 1 · pair Bluetooth controllers to the TV for players 2 to 4';
  }

  // SHARDFALL LOBBY: up to 4 seats, join with OK / A
  var seats = [null, null, null, null], countT = 0;
  SCREENS.sfLobby = {
    enter: function (ev) {
      show('ar-sflobby'); A.tint([[122, 247, 255], [180, 140, 255], [60, 90, 255]]);
      seats = [null, null, null, null]; countT = 0;
      if (ev && ev.src) join(ev.src);
      renderSeats();
    },
    input: function (ev) {
      var s = seatOf(ev.src), a = ev.act;
      if (s < 0) {
        if (a === 'A' || a === 'X' || a === 'START') { join(ev.src); SFX.join(); }
        else if ((a === 'BACK' || a === 'B') && !anySeated()) { SFX.back(); setScreen('home'); return; }
        else if (a === 'BACK' && ev.src === 'remote') { SFX.back(); setScreen('home'); return; }
      } else {
        var st = seats[s];
        if (a === 'L' || a === 'R') { if (!st.ready) { cycleProfile(s, a === 'R' ? 1 : -1); SFX.nav(); } }
        else if (a === 'A' || a === 'X' || a === 'START') { if (!st.ready) { st.ready = true; SFX.ok(); } else if (allReady()) countT = 1; }
        else if (a === 'Y' || a === 'U') { if (!st.ready) { renameSeat(s); return; } }
        else if (a === 'BACK' || a === 'B') { if (st.ready) st.ready = false; else seats[s] = null; SFX.back(); }
        else return;
      }
      countT = allReady() ? (countT || 3200) : 0;
      renderSeats();
    },
    frame: function (dt) {
      if (countT > 0) {
        var before = Math.ceil(countT / 1000); countT -= dt;
        if (countT <= 200) { countT = 0; startShardfall(); return; }
        var after = Math.ceil(countT / 1000); if (after !== before) { SFX.count(); renderSeats(); }
      }
    }
  };
  function anySeated() { for (var i = 0; i < 4; i++) if (seats[i]) return true; return false; }
  function seatOf(src) { for (var i = 0; i < 4; i++) if (seats[i] && seats[i].src === src) return i; return -1; }
  function allReady() { var n = 0; for (var i = 0; i < 4; i++) if (seats[i]) { if (!seats[i].ready) return false; n++; } return n > 0; }
  function usedBy(pid, except) { for (var i = 0; i < 4; i++) if (i !== except && seats[i] && seats[i].pid === pid) return true; return false; }
  function join(src) {
    var s = seatOf(src); if (s >= 0) return;
    for (var i = 0; i < 4; i++) if (!seats[i]) {
      var pl = P.list, pid = null, pn = src.indexOf('ph') === 0 && A.phoneName ? A.phoneName(src) : '';
      // a phone brings its owner's name: use their profile, or make one
      if (pn) { for (var q = 0; q < pl.length; q++) if (pl[q].name.toLowerCase() === pn.toLowerCase() && !usedBy(pl[q].id, i)) pid = pl[q].id; if (!pid && pl.length < 8) { pid = newProfile(pn).id; saveProfiles(); } }
      if (!pid && pl[i] && !usedBy(pl[i].id, i)) pid = pl[i].id;
      for (var j = 0; !pid && j < pl.length; j++) if (!usedBy(pl[j].id, i)) pid = pl[j].id;
      if (!pid) pid = newProfile('Player ' + (pl.length + 1)).id, saveProfiles();
      seats[i] = { src: src, pid: pid, ready: false }; return;
    }
  }
  function cycleProfile(s, d) {
    var pl = P.list, cur = 0;
    for (var i = 0; i < pl.length; i++) if (pl[i].id === seats[s].pid) cur = i;
    for (var k = 1; k <= pl.length; k++) { var n = pl[(cur + d * k + pl.length * 4) % pl.length]; if (!usedBy(n.id, s)) { seats[s].pid = n.id; return; } }
  }
  function renameSeat(s) {
    var p = A.profile(seats[s].pid);
    A.keyboard('Name for ' + esc(p.name), p.name, function (n) { if (n) { p.name = n; saveProfiles(); } renderSeats(); });
  }
  function renderSeats() {
    var h = '', any = false;
    for (var i = 0; i < 4; i++) {
      var st = seats[i], p = st && A.profile(st.pid);
      if (!st) { h += '<div class="ar-seat"><div class="ar-sn">PLAYER ' + (i + 1) + '</div><div class="ar-join">' + (i === 0 ? 'Press <b>OK</b> on the remote<br>or <b>A</b> on a controller' : 'Press <b>A</b> on a controller<br>to join') + '</div></div>'; continue; }
      any = true;
      h += '<div class="ar-seat in' + (st.ready ? ' ready' : '') + '" style="--pc:' + p.color + '"><div class="ar-sn">PLAYER ' + (i + 1) + '</div>' +
        (p.avatar ? '<div class="ar-av ph" style="background-image:url(' + A.asset(p.avatar) + ');border-color:' + p.color + ';box-shadow:0 0 70px ' + p.color + '"></div>' : '<div class="ar-av" style="background:' + p.color + ';box-shadow:0 0 70px ' + p.color + '"><span>' + esc(p.name.charAt(0).toUpperCase()) + '</span></div>') +
        '<div class="ar-pn">' + (st.ready ? '' : '<em>‹</em>') + esc(p.name) + (st.ready ? '' : '<em>›</em>') + '</div>' +
        '<div class="ar-ps">Best ' + fmt(p.sf.best) + (p.sf.wins ? ' · ' + p.sf.wins + ' win' + (p.sf.wins > 1 ? 's' : '') : '') + '</div>' +
        '<div class="ar-ctl">' + esc(A.srcLabel(st.src)) + (st.ready ? '' : ' · Up to rename') + '</div>' +
        '<div class="ar-rd">' + (st.ready ? 'READY' : 'OK WHEN READY') + '</div></div>';
    }
    $('ar-seats').innerHTML = h;
    var n = 0; for (var j = 0; j < 4; j++) if (seats[j]) n++;
    $('ar-sfmode').innerHTML = n <= 1 ? 'Solo · climb the levels, beat your best' : n + '-player battle · clears crack your rivals’ boards';
    $('ar-count').innerHTML = countT > 0 ? 'Starting in <b>' + Math.ceil(countT / 1000) + '</b>' : (any ? 'Everyone presses OK when ready' : '');
  }
  function fmt(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  A.fmt = fmt;
  function startShardfall() {
    var pl = []; for (var i = 0; i < 4; i++) if (seats[i]) pl.push({ src: seats[i].src, pid: seats[i].pid, seat: i });
    A.launch('shardfall', { players: pl });
  }

  // TIDEWAR SETUP
  var tw = { mode: 0, p1: 0, p2: 1, diff: 1, idx: 0, think: get('arcade.twThink') !== 'off', again: get('arcade.twAgain') !== 'off' };
  var DIFF = ['Cadet · easy', 'Captain · medium', 'Admiral · hard'];
  SCREENS.twSetup = {
    enter: function () { show('ar-twsetup'); A.tint([[40, 220, 200], [30, 90, 160], [90, 255, 220]]); tw.idx = 0; if (tw.p1 >= P.list.length) tw.p1 = 0; if (tw.p2 >= P.list.length) tw.p2 = Math.min(1, P.list.length - 1); renderTw(); },
    input: function (ev) {
      var a = ev.act, rows = twRows();
      if (a === 'U') { tw.idx = (tw.idx - 1 + rows.length) % rows.length; SFX.nav(); }
      else if (a === 'D') { tw.idx = (tw.idx + 1) % rows.length; SFX.nav(); }
      else if (a === 'L' || a === 'R') { var r = rows[tw.idx]; if (r.ch) { r.ch(a === 'R' ? 1 : -1); SFX.nav(); } }
      else if (a === 'A' || a === 'X' || a === 'START') { var r2 = rows[tw.idx]; SFX.ok(); if (r2.go) { startTidewar(); return; } if (r2.ch) r2.ch(1); }
      else if (a === 'BACK' || a === 'B') { SFX.back(); setScreen('home'); return; }
      else return;
      renderTw();
    }
  };
  function pnext(cur, d, avoid) { var n = P.list.length, i = cur; for (var k = 0; k < n; k++) { i = (i + d + n) % n; if (i !== avoid) return i; } return cur; }
  function twRows() {
    var r = [{ l: 'Mode', v: tw.mode ? 'Two players' : 'Versus the computer', ch: function () { tw.mode = 1 - tw.mode; if (tw.mode && tw.p2 === tw.p1) tw.p2 = pnext(tw.p1, 1, tw.p1); } },
      { l: tw.mode ? 'Player 1' : 'Admiral', v: esc(P.list[tw.p1].name), ch: function (d) { tw.p1 = pnext(tw.p1, d, tw.mode ? tw.p2 : -1); } }];
    if (tw.mode) r.push({ l: 'Player 2', v: esc(P.list[tw.p2].name), ch: function (d) { tw.p2 = pnext(tw.p2, d, tw.p1); } });
    else r.push({ l: 'Computer', v: DIFF[tw.diff], ch: function (d) { tw.diff = (tw.diff + d + 3) % 3; } });
    if (!tw.mode) r.push({ l: 'Show its thinking', v: tw.think ? 'On' : 'Off', ch: function () { tw.think = !tw.think; put('arcade.twThink', tw.think ? 'on' : 'off'); } });
    r.push({ l: 'A hit earns another shot', v: tw.again ? 'On' : 'Off', ch: function () { tw.again = !tw.again; put('arcade.twAgain', tw.again ? 'on' : 'off'); } });
    r.push({ l: 'SET SAIL', go: true });
    return r;
  }
  function renderTw() {
    var rows = twRows(), h = '';
    if (tw.idx >= rows.length) tw.idx = rows.length - 1;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      h += r.go ? '<div class="ar-opt go' + (i === tw.idx ? ' sel' : '') + '">' + r.l + '</div>'
        : '<div class="ar-opt' + (i === tw.idx ? ' sel' : '') + '"><span class="ar-ol">' + r.l + '</span><span class="ar-ov"><em>‹</em>' + r.v + '<em>›</em></span></div>';
    }
    $('ar-twopts').innerHTML = h;
    var p = P.list[tw.p1];
    $('ar-twrec').innerHTML = esc(p.name) + ': ' + p.tw.wins + ' won · ' + p.tw.losses + ' lost' + (p.tw.best ? ' · fastest win ' + p.tw.best + ' shots' : '');
  }
  function startTidewar() {
    A.launch('tidewar', { mode: tw.mode, p1: P.list[tw.p1].id, p2: tw.mode ? P.list[tw.p2].id : null, diff: tw.diff, think: tw.think, again: tw.again });
  }

  // PLAYERS & SCORES
  var plIdx = 0;
  SCREENS.players = {
    enter: function () { show('ar-players'); A.tint([[255, 214, 110], [180, 140, 255], [255, 122, 217]]); renderPlayers(); },
    input: function (ev) {
      var a = ev.act, n = P.list.length + 1;
      if (a === 'U') { plIdx = (plIdx - 1 + n) % n; SFX.nav(); }
      else if (a === 'D') { plIdx = (plIdx + 1) % n; SFX.nav(); }
      else if (a === 'A' || a === 'X') { SFX.ok(); if (plIdx === P.list.length) addPlayer(); else editPlayer(P.list[plIdx]); return; }
      else if (a === 'BACK' || a === 'B') { SFX.back(); setScreen('home'); return; }
      else return;
      renderPlayers();
    }
  };
  function addPlayer() {
    if (P.list.length >= 8) { A.toast('Eight players is the limit. Rename or delete one.'); return; }
    A.keyboard('New player', '', function (n) { if (n) { newProfile(n); saveProfiles(); } renderPlayers(); });
  }
  function editPlayer(p) {
    var ci = Math.max(0, COLORS.indexOf(p.color));
    A.menu({ eyebrow: 'Player', title: esc(p.name), opts: [
      { label: 'Rename', run: function () { A.keyboard('Rename ' + esc(p.name), p.name, function (n) { if (n) { p.name = n; saveProfiles(); } renderPlayers(); editPlayer(p); }); } },
      { label: 'Colour', value: function () { return '<span class="ar-sw sel" style="background:' + COLORS[ci] + ';width:34px;height:34px;vertical-align:middle;border:0"></span>'; }, change: function (d) { ci = (ci + d + COLORS.length) % COLORS.length; p.color = COLORS[ci]; saveProfiles(); renderPlayers(); } },
      { hide: NOPHOTO, label: 'Picture', value: function () { return p.avatar ? 'Dad\u2019s photo' : 'Letter'; }, change: function () { p.avatar = p.avatar ? null : 'games/avatars/dad.jpg'; saveProfiles(); renderPlayers(); } },
      { label: 'Clear their scores', run: function () { var b = blankStats(); p.sf = b.sf; p.tw = b.tw; p.sh = null; saveProfiles(); renderPlayers(); A.closeModal(); A.toast('Scores cleared for ' + esc(p.name)); } },
      { label: 'Delete player', run: function () { if (P.list.length <= 1) { A.toast('Keep at least one player'); return; } P.list.splice(P.list.indexOf(p), 1); saveProfiles(); plIdx = 0; renderPlayers(); A.closeModal(); } },
      { label: 'Done', go: true, run: function () { A.closeModal(); renderPlayers(); } }], back: function () { A.closeModal(); renderPlayers(); } });
  }
  function renderPlayers() {
    var h = '<div class="ar-prow head"><span class="ar-dot" style="opacity:0"></span><span class="ar-pnm"></span><span class="ar-st">Shardfall best</span><span class="ar-st">Battles won</span><span class="ar-st">Tidewar record</span><span class="ar-st">Fastest sinking</span><span class="ar-st">Springheist best</span></div>';
    var list = P.list.slice(0), top = 0;
    for (var i = 0; i < list.length; i++) top = Math.max(top, list[i].sf.best);
    for (var j = 0; j < list.length; j++) {
      var p = list[j];
      h += '<div class="ar-prow' + (j === plIdx ? ' sel' : '') + '">' + (p.avatar ? '<span class="ar-dot ph" style="background-image:url(' + A.asset(p.avatar) + ');border-color:' + p.color + '"></span>' : '<span class="ar-dot" style="background:' + p.color + ';box-shadow:0 0 24px ' + p.color + '"></span>') +
        '<span class="ar-pnm">' + esc(p.name) + (top && p.sf.best === top ? ' <span style="font-size:22px">👑</span>' : '') + '</span>' +
        '<span class="ar-st"><b>' + fmt(p.sf.best) + '</b>' + (p.sf.bestLines ? p.sf.bestLines + ' lines' : 'no games yet') + '</span>' +
        '<span class="ar-st"><b>' + (p.sf.wins || 0) + '</b>of ' + (p.sf.battles || 0) + ' battles</span>' +
        '<span class="ar-st"><b>' + p.tw.wins + ' – ' + p.tw.losses + '</b>won – lost</span>' +
        '<span class="ar-st"><b>' + (p.tw.best ? p.tw.best : '–') + '</b>' + (p.tw.best ? 'shots' : '') + (p.tw.shots ? ' · ' + Math.round(100 * p.tw.hits / p.tw.shots) + '% aim' : '') + '</span>' +
        '<span class="ar-st"><b>' + fmt(p.sh ? p.sh.best : 0) + '</b>' + (p.sh && p.sh.level ? 'level ' + p.sh.level : '') + '</span></div>';
    }
    h += '<div class="ar-prow add' + (plIdx === P.list.length ? ' sel' : '') + '">+ ADD A PLAYER</div>';
    $('ar-plist').innerHTML = h;
  }

  // ------------------------------------------------------------------ launching games
  A.register = function (id, g) { A.games[id] = g; };
  A.launch = function (id, opts) {
    var g = A.games[id]; if (!g) return;
    if (active && active.stop) active.stop();
    active = g; show('ar-none'); screen = 'game'; ctx.clearRect(0, 0, W, H);
    g.start(opts, ctx);
  };
  A.exitGame = function (to) { if (active && active.stop) active.stop(); active = null; A.musicStop(); A.closeModal(); setScreen(to || 'home'); };

  // ------------------------------------------------------------------ open / close
  function build() {
    var stage = document.getElementById('stage') || document.body;
    root = document.createElement('div'); root.id = 'arcade';
    root.innerHTML =
      '<canvas id="ar-bg" width="480" height="270"></canvas><canvas id="ar-cv" width="1920" height="1080"></canvas>' +
      '<div id="ar-ui">' +
      '<div class="ar-scr" id="ar-none"></div>' +
      '<div class="ar-scr" id="ar-home"><div class="ar-top"><div class="ar-eyebrow">The telly arcade</div><div class="ar-title ar-h">Play <i>something</i> brilliant</div><div class="ar-eyebrow" id="ar-padline" style="letter-spacing:.08em;text-transform:none;font-weight:400;margin-top:18px;font-size:23px"></div></div>' +
      '<div class="ar-cards" id="ar-cards"></div>' +
      '<div class="ar-hints"><b>◀ ▶</b>choose<b>OK</b>play<b>▲ ▼</b>sound<b>BACK</b>to the dashboard</div><div id="ar-track"></div><div id="ar-phone"></div></div>' +
      '<div class="ar-scr" id="ar-sflobby"><div class="ar-lob-top"><div class="ar-eyebrow">Shardfall</div><div class="ar-title ar-h">Who’s playing?</div><div class="ar-eyebrow" id="ar-sfmode" style="letter-spacing:.06em;text-transform:none;font-weight:400;font-size:24px;margin-top:14px"></div></div>' +
      '<div class="ar-seats" id="ar-seats"></div><div class="ar-count" id="ar-count"></div><div class="ar-hints"><b>OK / A</b>join, then ready<b>◀ ▶</b>change player<b>BACK / B</b>leave</div></div>' +
      '<div class="ar-scr" id="ar-twsetup"><div class="ar-lob-top"><div class="ar-eyebrow">Tidewar</div><div class="ar-title ar-h">Ready the fleet</div><div class="ar-eyebrow" id="ar-twrec" style="letter-spacing:.06em;text-transform:none;font-weight:400;font-size:24px;margin-top:14px"></div></div>' +
      '<div class="ar-opts" id="ar-twopts"></div><div class="ar-hints"><b>▲ ▼</b>move<b>◀ ▶</b>change<b>OK</b>set sail<b>BACK</b>arcade</div></div>' +
      '<div class="ar-scr" id="ar-players"><div class="ar-lob-top" style="top:70px"><div class="ar-eyebrow">The leaderboard</div><div class="ar-title ar-h">Players &amp; scores</div></div><div class="ar-plist" id="ar-plist"></div><div class="ar-hints"><b>▲ ▼</b>choose<b>OK</b>rename, colour, delete<b>BACK</b>arcade</div></div>' +
      '</div><div id="ar-modal"></div><div id="ar-toast"></div>';
    stage.appendChild(root);
    bg = $('ar-bg'); bgx = bg.getContext('2d'); bg.style.width = W + 'px'; bg.style.height = H + 'px';
    cv = $('ar-cv'); ctx = cv.getContext('2d'); ui = $('ar-ui'); modalEl = $('ar-modal'); toastEl = $('ar-toast');
    buildCards();
  }
  var CARDS = [];
  function buildCards() {
    CARDS = [{ id: 'shardfall', w: 500, name: 'Shardfall', desc: 'Falling crystals. Stack, shatter, and pull the Collapse to bring the whole board down.', tag: '1 – 4 players', glow: 'rgba(160,120,255,.45)' },
      { id: 'tidewar', w: 340, name: 'Tidewar', desc: 'Hunt a hidden fleet by sonar, then unleash a barrage.', tag: '1 – 2 players', glow: 'rgba(60,240,210,.4)' },
      { id: 'springheist', w: 340, name: 'Springheist', desc: 'Bounce two little robot thieves through a neon vault tower. Grab the loot, blast the gates.', tag: '1 – 2 players', glow: 'rgba(255,92,180,.4)' }];
    var Q = window.GAMES_QUIZ;
    if (Q) CARDS.push({ id: 'quiz', w: 340, name: Q.title || 'Quiz', desc: Q.blurb || 'Quick-fire trivia for the whole room.', tag: Q.players || '1 – 4 players', glow: 'rgba(255,214,110,.4)' });
    // extra games add themselves to window.ARCADE_EXTRA (Passport Quest does): { id, w, name, desc, tag, glow, enabled() }
    var X = window.ARCADE_EXTRA || []; for (var xi = 0; xi < X.length; xi++) if (A.games[X[xi].id] && (!X[xi].enabled || X[xi].enabled())) CARDS.push(X[xi]);
    CARDS.push({ id: 'players', w: 280, name: 'Players &amp; scores', desc: 'Names, colours and everyone\u2019s best.', glow: 'rgba(255,214,110,.35)', small: true });
    var h = '';
    // one row that slides sideways to keep the chosen card in view, however many games there are
    for (var k = 0; k < CARDS.length; k++) CARDS[k].w = k === 0 ? 480 : 380;
    for (var i = 0; i < CARDS.length; i++) { var c = CARDS[i];
      h += '<div class="ar-card" style="width:' + c.w + 'px;--glow:' + c.glow + '"><canvas width="' + c.w + '" height="560" style="width:' + c.w + 'px"></canvas><div class="ar-cap"><div class="ar-name ar-h"' + (c.small || c.w < 400 ? ' style="font-size:' + (c.small ? 40 : 46) + 'px"' : '') + '>' + c.name + '</div><div class="ar-desc">' + A.esc(c.desc) + '</div>' + (c.tag ? '<span class="ar-tag">' + A.esc(c.tag) + '</span>' : '') + '</div></div>'; }
    $('ar-cards').innerHTML = h;
    var cs = root.querySelectorAll('.ar-card canvas'); cardCv = [];
    for (var j = 0; j < cs.length; j++) {
      var slot = { x: cs[j].getContext('2d'), draw: null, w: CARDS[j].w }; cardCv.push(slot);
      var g = A.games[CARDS[j].id]; if (g && g.card) g.card(slot);
      else if (CARDS[j].id === 'quiz') slot.draw = drawQuizArt;
    }
    cardCv[cardCv.length - 1].draw = drawTrophy;
    if (homeIdx >= CARDS.length) homeIdx = 0;
  }
  // Telly Trivia card: a game-show stage with spotlights and the four answer tiles
  function drawQuizArt(x, t, sel, w) {
    var h = 560, g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a0f3d'); g.addColorStop(0.6, '#0c0820'); g.addColorStop(1, '#07050f');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var ox = w * (0.2 + i * 0.3), ang = Math.sin(t / (1300 + i * 300) + i * 2) * 0.35, len = 520, bw = 70;
      var ex = ox + Math.sin(ang) * len, ey = Math.cos(ang) * len;
      var lg = x.createLinearGradient(ox, 0, ex, ey); lg.addColorStop(0, ['rgba(255,214,110,.35)', 'rgba(122,247,255,.3)', 'rgba(255,92,180,.3)'][i]); lg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = lg; x.beginPath(); x.moveTo(ox - 5, 0); x.lineTo(ex - Math.cos(ang) * bw, ey + Math.sin(ang) * bw); x.lineTo(ex + Math.cos(ang) * bw, ey - Math.sin(ang) * bw); x.lineTo(ox + 5, 0); x.closePath(); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    // big glowing question mark
    var bob = Math.sin(t / 700) * 6;
    x.save(); x.translate(w / 2, 82 + bob); x.rotate(Math.sin(t / 1100) * 0.08);
    x.font = '800 140px "Bricolage Grotesque", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#ffd66e'; x.shadowBlur = sel ? 60 : 36; x.fillStyle = '#ffe9a8'; x.fillText('?', 0, 0); x.restore();
    // answer tiles
    var cols = ['#ff5c8a', '#5ef2d0', '#ffd66e', '#7a8cff'], L = ['A', 'B', 'C', 'D'], tw = (w - 70) / 2;
    for (var k = 0; k < 4; k++) {
      var tx = 25 + (k % 2) * (tw + 20), ty = 158 + Math.floor(k / 2) * 50 + Math.sin(t / 500 + k) * 2, lit = Math.floor(t / 900) % 4 === k;
      x.fillStyle = lit ? cols[k] : 'rgba(255,255,255,.07)'; rrect(x, tx, ty, tw, 40, 12); x.fill();
      x.strokeStyle = cols[k]; x.lineWidth = 2; x.stroke();
      x.font = '800 22px Manrope, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = lit ? '#120a24' : cols[k]; x.fillText(L[k], tx + 16, ty + 21);
      x.fillStyle = lit ? 'rgba(18,10,36,.5)' : 'rgba(255,255,255,.18)'; rrect(x, tx + 44, ty + 16, tw - 64, 8, 4); x.fill();
    }
    x.textBaseline = 'alphabetic';
  }
  function rrect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  function drawTrophy(x, t, sel, w) {
    var h = 560; x.clearRect(0, 0, w, h);
    var list = P.list.slice(0).sort(function (a, b) { return b.sf.best - a.sf.best; }).slice(0, 4);
    for (var i = 0; i < list.length; i++) {
      var y = 30 + i * 52, p = list[i], wob = Math.sin(t / 600 + i) * 3;
      x.globalAlpha = 0.9 - i * 0.15; x.fillStyle = p.color; x.save(); x.translate(46, y + 18 + wob); x.rotate(Math.PI / 4); x.fillRect(-11, -11, 22, 22); x.restore();
      x.font = '700 28px "Bricolage Grotesque", sans-serif'; x.fillStyle = '#fff'; x.fillText(p.name.slice(0, 9), 74, y + 28);
      x.font = '600 22px Manrope, sans-serif'; x.fillStyle = 'rgba(255,255,255,.55)'; x.textAlign = 'right'; x.fillText(fmt(p.sf.best), w - 30, y + 28); x.textAlign = 'left';
    }
    x.globalAlpha = 1;
  }

  A.open = function () {
    if (opened) return;
    if (!root) { loadProfiles(); build(); }
    opened = true; root.className = 'open';
    var b = document.body; if (b.className.indexOf('arcade-on') < 0) b.className += ' arcade-on';
    tvKeys(true); audio(); try { if (ac && ac.resume) ac.resume(); } catch (e) { }
    homeIdx = 0; buildCards(); setScreen('home'); last = 0; raf = requestAnimationFrame(loop); checkSpotify();
  };
  A.close = function () {
    if (!opened) return;
    if (active && active.stop) active.stop(); active = null; A.closeModal(); A.musicStop();
    opened = false; root.className = ''; cancelAnimationFrame(raf);
    document.body.className = document.body.className.replace(/\s*arcade-on/g, '');
    tvKeys(false);
  };
  A.isOpen = function () { return opened; };

  // The quiz (made in the dashboard thread) plugs in through window.GAMES_QUIZ
  var quizEl = null;
  A.register('quiz', {
    start: function () {
      var Q = window.GAMES_QUIZ; if (!Q) { A.exitGame('home'); return; }
      quizEl = document.createElement('div'); quizEl.id = 'ar-quiz'; quizEl.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:1080px';
      root.insertBefore(quizEl, modalEl);
      try { Q.start(quizEl, function () { A.exitGame('home'); }, { profiles: A.profiles, sfx: A.sfx, tone: A.tone, arcade: A, saveProfiles: saveProfiles }); } catch (e) { A.exitGame('home'); }
    },
    frame: function (dt, x) { x.clearRect(0, 0, W, H); },
    input: function (ev) { try { window.GAMES_QUIZ.input(ev); } catch (e) { } },
    stop: function () { try { window.GAMES_QUIZ.stop(); } catch (e) { } if (quizEl && quizEl.parentNode) quizEl.parentNode.removeChild(quizEl); quizEl = null; }
  });

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', function (e) { delete keyDown[e.keyCode]; if (opened) { e.preventDefault(); e.stopPropagation(); } }, true);
})();
