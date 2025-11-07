/* ==== Polyfill for browser API ==== */
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  window.browser = chrome;
}


// background.js
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.to !== 'background') return;
  const { command, repetition = 1 } = msg;

  const repeat = Number(repetition) || 1;

  if (command === 'activateNextTab') {
    browser.tabs.query({ currentWindow: true }).then(tabs => {
      const idx = tabs.findIndex(t => t.active);
      const next = (idx + repeat) % tabs.length;
      browser.tabs.update(tabs[next].id, { active: true });
    });
  } else if (command === 'activatePreviousTab') {
    browser.tabs.query({ currentWindow: true }).then(tabs => {
      const idx = tabs.findIndex(t => t.active);
      let prev = idx - repeat;
      while (prev < 0) prev += tabs.length;
      browser.tabs.update(tabs[prev % tabs.length].id, { active: true });
    });
  }
});
