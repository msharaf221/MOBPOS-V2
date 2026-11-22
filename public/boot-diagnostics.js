/* Runs before the module entry. No dependencies and Chromium 108 syntax only. */
(function () {
  var root = document.getElementById('root');
  if (!root) return;
  var settled = false;
  var timer;
  var observer;
  function stop() {
    settled = true;
    clearTimeout(timer);
    if (observer) observer.disconnect();
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
  }
  function failed(code) {
    if (settled) return;
    stop();
    // A plain inline-styled message still works if the stylesheet or module
    // failed. Never clear storage or expose license/customer data in errors.
    root.textContent = '';
    var panel = document.createElement('div');
    panel.setAttribute('dir', 'rtl');
    panel.style.cssText = 'min-height:100vh;box-sizing:border-box;padding:48px;background:#0c1f4d;color:#fff;font:18px Tahoma,sans-serif;line-height:1.8';
    var title = document.createElement('h1');
    title.textContent = 'تعذر تشغيل واجهة MOBPOS';
    var text = document.createElement('p');
    text.textContent = 'بياناتك لم تُحذف. تأكد من تثبيت نسخة Windows 7 المناسبة (32 أو 64 بت)، ثم أعد تشغيل البرنامج. لو تكررت المشكلة، أرسل صورة هذه الرسالة للدعم.';
    var detail = document.createElement('p');
    detail.textContent = 'رمز التشخيص: ' + code;
    panel.appendChild(title);
    panel.appendChild(text);
    panel.appendChild(detail);
    root.appendChild(panel);
  }
  function onError(event) {
    if (event.target === window || (event.target && event.target.tagName === 'SCRIPT')) failed('UI-START');
  }
  function onRejection() { failed('UI-PROMISE'); }
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  observer = new MutationObserver(function () {
    if (root.children.length && !root.querySelector('.mobpos-splash')) stop();
  });
  observer.observe(root, { childList: true, subtree: true });
  timer = setTimeout(function () { failed('UI-TIMEOUT'); }, 30000);
})();
