/*
 * Обёртка над Yandex Games SDK.
 * Работает и внутри Яндекс Игр, и локально (при локальном запуске реклама
 * просто пропускается, а награда за rewarded выдаётся сразу — удобно для тестов).
 */
(function () {
  const YSDK = {
    ysdk: null,
    ready: false,
    _adInProgress: false,

    async init() {
      try {
        if (typeof YaGames === 'undefined') {
          console.warn('[YSDK] YaGames не найден — локальный режим (без рекламы).');
          return;
        }
        this.ysdk = await YaGames.init();
        this.ready = true;
        console.log('[YSDK] Инициализирован.');
      } catch (e) {
        console.warn('[YSDK] Ошибка инициализации:', e);
      }
    },

    // Сообщить Яндексу, что игра загрузилась (убирает прелоадер площадки).
    gameReady() {
      try {
        this.ysdk && this.ysdk.features.LoadingAPI &&
          this.ysdk.features.LoadingAPI.ready();
      } catch (e) {}
    },

    // Полноэкранная (межстраничная) реклама — между партиями.
    showFullscreen(onDone) {
      if (!this.ready || this._adInProgress) { onDone && onDone(); return; }
      this._adInProgress = true;
      try {
        this.ysdk.adv.showFullscreenAdv({
          callbacks: {
            onClose: () => { this._adInProgress = false; onDone && onDone(); },
            onError: () => { this._adInProgress = false; onDone && onDone(); },
          },
        });
      } catch (e) {
        this._adInProgress = false;
        onDone && onDone();
      }
    },

    // Реклама за награду. onReward вызывается ТОЛЬКО если ролик досмотрен.
    showRewarded(onReward, onClose) {
      // Локальный режим: сразу выдаём награду, чтобы можно было тестировать.
      if (!this.ready) { onReward && onReward(); onClose && onClose(); return; }
      if (this._adInProgress) { onClose && onClose(); return; }
      this._adInProgress = true;
      let rewarded = false;
      try {
        this.ysdk.adv.showRewardedVideo({
          callbacks: {
            onRewarded: () => { rewarded = true; onReward && onReward(); },
            onClose: () => { this._adInProgress = false; onClose && onClose(); },
            onError: () => { this._adInProgress = false; onClose && onClose(); },
          },
        });
      } catch (e) {
        this._adInProgress = false;
        onClose && onClose();
      }
    },
  };

  window.YSDK = YSDK;
})();
