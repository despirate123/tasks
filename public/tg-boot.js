/**
 * Вызывается до гидрации React. Telegram рисует compact-sheet в момент
 * первого кадра — если expand/requestFullscreen приходят из useEffect,
 * Mini App уже открыта «половинкой».
 */
(function bootTelegramViewport() {
  var attempts = 0;

  function apply() {
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app) return false;

    try {
      app.ready();
    } catch (error) {
      /* SDK ещё не готов */
    }
    try {
      app.expand();
    } catch (error) {
      /* старые клиенты */
    }
    try {
      if (typeof app.requestFullscreen === "function") {
        app.requestFullscreen();
      }
    } catch (error) {
      /* Bot API < 8.0 или платформа без fullscreen */
    }
    try {
      if (app.disableVerticalSwipes) app.disableVerticalSwipes();
    } catch (error) {
      /* no-op */
    }
    try {
      if (app.setHeaderColor) app.setHeaderColor("#0b0f1a");
      if (app.setBackgroundColor) app.setBackgroundColor("#0b0f1a");
    } catch (error) {
      /* no-op */
    }
    try {
      var sys = app.safeAreaInset || {};
      var content = app.contentSafeAreaInset || {};
      var root = document.documentElement;
      function set(name, value) {
        if (value > 0) root.style.setProperty(name, value + "px");
      }
      function num(obj, key) {
        var n = Number(obj[key]);
        return n > 0 ? n : 0;
      }
      set("--tg-safe-area-inset-top", num(sys, "top"));
      set("--tg-safe-area-inset-bottom", num(sys, "bottom"));
      set("--tg-safe-area-inset-left", num(sys, "left"));
      set("--tg-safe-area-inset-right", num(sys, "right"));
      set("--tg-content-safe-area-inset-top", num(content, "top"));
      set("--tg-content-safe-area-inset-bottom", num(content, "bottom"));
      set("--safe-top", num(sys, "top") + num(content, "top"));
      set("--safe-bottom", num(sys, "bottom") + num(content, "bottom"));
      if (app.viewportStableHeight) {
        root.style.setProperty(
          "--tg-viewport-stable-height",
          app.viewportStableHeight + "px",
        );
      }
    } catch (error) {
      /* no-op */
    }
    return true;
  }

  if (apply()) return;

  var timer = setInterval(function () {
    attempts += 1;
    if (apply() || attempts > 40) clearInterval(timer);
  }, 25);
})();
