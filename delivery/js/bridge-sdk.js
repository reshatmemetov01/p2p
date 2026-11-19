/* =========================================================================
   Playgama Bridge — мультиплатформенная обёртка.
   Экспортирует window.YSDK с тем же интерфейсом, что игры используют
   (init / gameReady / showFullscreen / showRewarded), но под капотом —
   Playgama Bridge. Одна сборка работает на Playgama, CrazyGames,
   GameDistribution, Poki, VK, Telegram, Y8, Яндекс и других площадках.

   Вне площадки (локальный запуск, SDK не загрузился) — мягкий режим:
   реклама пропускается, награда за rewarded выдаётся сразу (удобно для тестов).
   ========================================================================= */
(function () {
  'use strict';

  const YSDK = {
    b: null,
    ready: false,
    _reward: null,
    _close: null,
    _inter: null,

    async init() {
      try {
        if (typeof bridge === 'undefined') {
          console.warn('[Bridge] не найден — локальный режим (без рекламы).');
          return;
        }
        this.b = bridge;
        await bridge.initialize();
        this.ready = true;

        // Реклама за награду: награда только при состоянии 'rewarded'
        bridge.advertisement.on(bridge.EVENT_NAME.REWARDED_STATE_CHANGED, (state) => {
          if (state === 'rewarded') {
            const cb = this._reward; this._reward = null; cb && cb();
          } else if (state === 'closed' || state === 'failed') {
            this._reward = null;
            const cb = this._close; this._close = null; cb && cb();
          }
        });

        // Межстраничная: продолжаем игру, когда реклама закрылась
        bridge.advertisement.on(bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, (state) => {
          if (state === 'loading' || state === 'opened') this._interStarted = true;
          if (state === 'closed' || state === 'failed') {
            const cb = this._inter; this._inter = null; cb && cb();
          }
        });

        // Платформа просит заглушить звук (во время рекламы) — приостановим музыку
        bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, (enabled) => {
          if (window.GameAudio) window.GameAudio.platformMute(!enabled);
        });

        console.log('[Bridge] платформа:', bridge.platform.id);
      } catch (e) {
        console.warn('[Bridge] ошибка инициализации:', e);
      }
    },

    // Сообщить площадке, что игра загрузилась
    gameReady() {
      try { this.b && this.b.platform.sendMessage('game_ready'); } catch (e) {}
    },

    // Сообщить площадке о ходе игры: level_started / level_completed / level_failed / level_paused / level_resumed
    event(name, level) {
      try { if (this.b) { if (level != null) this.b.platform.sendMessage(name, { world: 'main', level: String(level) }); else this.b.platform.sendMessage(name); } } catch (e) {}
    },

    // Полноэкранная (межстраничная) реклама
    showFullscreen(onDone) {
      if (!this.ready || !this.b.advertisement.isInterstitialSupported) { onDone && onDone(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; onDone && onDone(); };
      this._inter = finish; this._interStarted = false;
      try { this.b.advertisement.showInterstitial(); }
      catch (e) { this._inter = null; finish(); return; }
      // Площадка могла пропустить показ (лимит раз в минуту) и ничего не прислать — не держим игрока
      setTimeout(() => { if (this._inter === finish && !this._interStarted) { this._inter = null; finish(); } }, 1200);
      setTimeout(() => { if (this._inter === finish) { this._inter = null; finish(); } }, 45000);
    },

    // Реклама за награду. onReward — только если ролик досмотрен.
    showRewarded(onReward, onClose) {
      if (!this.ready || !this.b.advertisement.isRewardedSupported) {
        onReward && onReward(); onClose && onClose(); return; // локальный режим: выдаём сразу
      }
      this._reward = onReward;
      this._close = onClose;
      try { this.b.advertisement.showRewarded(); }
      catch (e) { this._reward = null; this._close = null; onReward && onReward(); onClose && onClose(); }
    },
  };

  window.YSDK = YSDK;
})();
