/* =========================================================================
   GameAudio — общий звук для всех игр.
   Музыка и эффекты генерируются через Web Audio API (без файлов —
   мгновенная загрузка, ничего не весит). Есть переключатель вкл/выкл
   с сохранением в localStorage.
   ========================================================================= */
(function () {
  'use strict';

  const KEY = 'game_sound_on';

  const GA = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    on: true,
    started: false,
    _btn: null,
    _schedTimer: null,
    _step: 0,
    _nextTime: 0,

    init() {
      try { const v = localStorage.getItem(KEY); this.on = v === null ? true : v === '1'; } catch (e) {}
      injectStyle();
      // Запуск аудио-контекста только после первого касания (политика браузеров)
      const kick = () => { this.ensure(); if (this.on) this.startMusic(); };
      window.addEventListener('pointerdown', kick, { once: true });
      window.addEventListener('keydown', kick, { once: true });
    },

    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.on ? 0.14 : 0;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.on ? 0.33 : 0;
        this.sfxGain.connect(this.master);
      } catch (e) { this.ctx = null; }
    },

    // ---- Переключатель ----
    attachButton(btn) {
      this._btn = btn;
      this.updateBtn();
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.toggle(); });
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    },
    updateBtn() { if (this._btn) this._btn.textContent = this.on ? '🔊' : '🔇'; },
    toggle() { this.setOn(!this.on); },
    setOn(v) {
      this.on = v;
      try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
      this.ensure();
      if (this.ctx) {
        this.musicGain.gain.value = v ? 0.14 : 0;
        this.sfxGain.gain.value = v ? 0.33 : 0;
      }
      if (v) this.startMusic(); else this.stopMusic();
      this.updateBtn();
    },

    // Временно приглушить на время рекламы (не меняя выбор игрока)
    platformMute(muted) {
      if (!this.ctx) return;
      try {
        if (muted) this.ctx.suspend();
        else if (this.on && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {}
    },

    // ---- Эффекты ----
    tone(freq, start, dur, type, vol, dest) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(start); o.stop(start + dur + 0.03);
    },
    slide(f1, f2, start, dur, type, vol) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(f1, start);
      o.frequency.exponentialRampToValueAtTime(f2, start + dur);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(start); o.stop(start + dur + 0.03);
    },

    sfx(name, param) {
      if (!this.on) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'click':
          this.tone(520, t, 0.08, 'triangle', 0.5); break;
        case 'move':
          this.tone(300, t, 0.07, 'sine', 0.35); break;
        case 'place': // стук блока
          this.tone(180, t, 0.12, 'square', 0.5);
          this.tone(90, t, 0.14, 'sine', 0.4); break;
        case 'merge': { // выше по значению
          const n = Math.min(param || 0, 11);
          const f = 300 * Math.pow(1.06, n);
          this.tone(f, t, 0.12, 'triangle', 0.45);
          this.tone(f * 1.5, t + 0.04, 0.1, 'sine', 0.3); break;
        }
        case 'perfect': // дзынь
          this.tone(880, t, 0.12, 'sine', 0.5);
          this.tone(1320, t + 0.06, 0.16, 'sine', 0.4); break;
        case 'clear': // искристо
          [0, 0.05, 0.1, 0.15].forEach((d, i) => this.tone(600 + i * 180, t + d, 0.12, 'triangle', 0.4));
          break;
        case 'coin':
          this.tone(980, t, 0.08, 'square', 0.4);
          this.tone(1300, t + 0.05, 0.1, 'square', 0.35); break;
        case 'power':
          this.slide(400, 900, t, 0.25, 'sawtooth', 0.35); break;
        case 'fail':
          this.slide(400, 80, t, 0.5, 'sawtooth', 0.45); break;
        case 'win':
          [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.1, 0.25, 'sine', 0.45));
          break;
      }
    },

    // ---- Фоновая музыка (бодрый трек раннера) ----
    startMusic() {
      this.ensure();
      if (!this.ctx || this._schedTimer || !this.on) return;
      this._step = 0;
      this._nextTime = this.ctx.currentTime + 0.1;
      this._schedTimer = setInterval(() => this._schedule(), 60);
    },
    stopMusic() {
      if (this._schedTimer) { clearInterval(this._schedTimer); this._schedTimer = null; }
    },
    _schedule() {
      if (!this.ctx) return;
      const STEP = 60 / 128 / 4; // шестнадцатые при 128 BPM
      while (this._nextTime < this.ctx.currentTime + 0.25) {
        this._playStep(this._step, this._nextTime);
        this._nextTime += STEP;
        this._step++;
      }
    },

    // ---- Трек раннера: 6 частей по 4 такта (~45 сек до повтора) ----
    _noiseBuf() {
      if (this._nb) return this._nb;
      const len = this.ctx.sampleRate * 0.3, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return (this._nb = b);
    },
    _noise(t, dur, vol, ftype, freq) {
      const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
      src.buffer = this._noiseBuf(); f.type = ftype; f.frequency.value = freq;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.musicGain); src.start(t); src.stop(t + dur + 0.02);
    },
    _kick(t) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.22);
    },
    _playStep(step, t) {
      const hz = (semi) => 440 * Math.pow(2, semi / 12); // 0 = A4
      const CH = { Am: [0, 3, 7], F: [-4, 0, 3], C: [3, 7, 10], G: [-2, 2, 5], Em: [-5, -2, 2] };
      const P1 = ['Am', 'F', 'C', 'G'], P2 = ['F', 'G', 'Em', 'Am'];
      const L1 = [
        [[0, 12, 2], [2, 10, 2], [4, 7, 2], [6, 10, 2], [8, 12, 3], [12, 15, 4]],
        [[0, 12, 2], [2, 10, 2], [4, 8, 2], [6, 7, 2], [8, 8, 3], [12, 3, 4]],
        [[0, 7, 2], [2, 10, 2], [4, 12, 2], [6, 15, 2], [8, 14, 3], [12, 12, 2], [14, 10, 2]],
        [[0, 14, 3], [4, 10, 2], [6, 7, 2], [8, 10, 6]],
      ];
      const L2 = [
        [[0, 15, 2], [3, 15, 1], [4, 14, 2], [6, 12, 2], [8, 8, 4], [12, 12, 2], [14, 14, 2]],
        [[0, 14, 2], [3, 14, 1], [4, 12, 2], [6, 10, 2], [8, 7, 4], [12, 10, 2], [14, 12, 2]],
        [[0, 12, 2], [2, 10, 2], [4, 7, 2], [6, 10, 2], [8, 14, 4], [12, 12, 4]],
        [[0, 12, 6], [8, 15, 2], [10, 14, 2], [12, 12, 4]],
      ];
      // части: прогрессия, мелодия, что играет
      const SEC = [
        { p: P1, lead: null, kick: 1, snare: 0, arp: 1 },
        { p: P1, lead: L1, kick: 1, snare: 1, arp: 0 },
        { p: P2, lead: L2, kick: 1, snare: 1, arp: 0 },
        { p: P1, lead: L1, kick: 1, snare: 1, arp: 1 },
        { p: P2, lead: null, kick: 0, snare: 0, arp: 1, fill: 1 },
        { p: P2, lead: L2, kick: 1, snare: 1, arp: 1 },
      ];
      const s16 = step % 16, bar = Math.floor(step / 16), sec = SEC[Math.floor(bar / 4) % SEC.length], b4 = bar % 4;
      const chord = CH[sec.p[b4]], root = chord[0] < -3 ? chord[0] : chord[0] - 12;
      const STEP = 60 / 128 / 4, m = this.musicGain;
      // барабаны
      if (sec.kick && s16 % 4 === 0) this._kick(t);
      if (!sec.kick && s16 === 0 && b4 === 0) this._kick(t);
      if (s16 % 4 === 2) this._noise(t, 0.05, 0.35, 'highpass', 7000);
      else if (sec.kick && s16 % 2 === 1) this._noise(t, 0.025, 0.12, 'highpass', 8000);
      if (sec.snare && (s16 === 4 || s16 === 12)) { this._noise(t, 0.14, 0.5, 'bandpass', 1800); this.tone(190, t, 0.08, 'triangle', 0.35, m); }
      if (sec.fill && b4 === 3 && s16 >= 8) this._noise(t, 0.08, 0.2 + (s16 - 8) * 0.05, 'bandpass', 1500 + s16 * 60);
      // бас восьмыми: корень / октава
      if (s16 % 2 === 0) this.tone(hz(root - 12 + (s16 % 4 === 2 ? 12 : 0)), t, STEP * 1.8, 'triangle', 0.75, m);
      // арпеджио
      if (sec.arp) this.tone(hz(chord[s16 % 3] + 12 * (s16 % 6 < 3 ? 0 : 1)), t, STEP * 0.9, 'sine', 0.22, m);
      // мелодия
      if (sec.lead) {
        const n = sec.lead[b4].find((x) => x[0] === s16);
        if (n) {
          const d = n[2] * STEP * 0.95;
          this.tone(hz(n[1]), t, d, 'square', 0.16, m);
          this.tone(hz(n[1] + 12), t, d * 0.7, 'sine', 0.12, m);
        }
      }
    },
  };

  function injectStyle() {
    if (document.getElementById('ga-style')) return;
    const st = document.createElement('style');
    st.id = 'ga-style';
    st.textContent =
      '.ga-shake{animation:ga-shake .28s ease;}' +
      '@keyframes ga-shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-5px);}40%{transform:translateX(5px);}60%{transform:translateX(-3px);}80%{transform:translateX(3px);}}' +
      '.sound-btn{border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#fff;font-size:18px;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:transform .08s ease;}' +
      '.sound-btn:active{transform:scale(0.9);}';
    document.head.appendChild(st);
  }

  // Утилита тряски элемента
  GA.shake = function (el) {
    if (!el) return;
    el.classList.remove('ga-shake');
    void el.offsetWidth;
    el.classList.add('ga-shake');
  };

  window.GameAudio = GA;
  GA.init();
})();
