/* Injected at document start by the native viewer. It observes readiness only;
   it cannot start, stop or replay agent work. */
(() => {
  'use strict';
  window.__STARNET_NATIVE__ = true;
  let observer, sent = false, scheduled = false;
  window.addEventListener('error', event => {
    if (sent || !['SCRIPT', 'LINK'].includes(event.target?.tagName)) return;
    window.webkit?.messageHandlers?.stationStartup?.postMessage({ event: 'load-error', generation: '__STARNET_STARTUP_ID__' });
  }, true);
  function check() {
    if (sent || scheduled || document.readyState === 'loading') return;
    const screen = document.querySelector('.screen.active:not(#screen-boot)');
    if (!screen || !screen.getBoundingClientRect().width) return;
    scheduled = true;
    // Two frames ensure the chosen screen has reached a paint opportunity.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduled = false;
      if (!screen.classList.contains('active')) return check();
      const result = { event: 'ready', generation: '__STARNET_STARTUP_ID__' };
      sent = true; observer?.disconnect();
      window.webkit?.messageHandlers?.stationStartup?.postMessage(result);
    }));
  }
  observer = new MutationObserver(check);
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', check, { once: true });
})();
