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

    // ---- Фоновая музыка (мягкий пентатонический луп) ----
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
      const STEP = 0.3;
      const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33];
      const MEL = [0, 2, 3, 4, 3, 2, 0, -1, 1, 3, 4, 5, 4, 2, 1, -1];
      const BASS = [130.81, 110.00, 87.31, 98.00]; // C Am F G (по тактам)
      while (this._nextTime < this.ctx.currentTime + 0.25) {
        const s = this._step % MEL.length;
        const t = this._nextTime;
        const m = MEL[s];
        if (m >= 0) this.tone(SCALE[m], t, 0.26, 'sine', 0.5, this.musicGain);
        if (s % 4 === 0) {
          const bar = Math.floor(s / 4) % BASS.length;
          this.tone(BASS[bar], t, 0.5, 'triangle', 0.6, this.musicGain);
        }
        this._nextTime += STEP;
        this._step++;
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
