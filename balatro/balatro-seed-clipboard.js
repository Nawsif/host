(function installBalatroSeedClipboard() {
  "use strict";

  const MAX_SEED_LENGTH = 8;
  let pasteSequence = 0;

  function normalizeSeed(value) {
    const text = String(value ?? "").trim().toUpperCase();
    if (/^[A-Z0-9]{1,8}$/.test(text)) return text;

    const tokens = text.match(/[A-Z0-9]+/g) || [];
    const fullSeed = tokens.find(token => token.length === MAX_SEED_LENGTH);
    if (fullSeed) return fullSeed;
    if (tokens.length === 1 && tokens[0].length <= MAX_SEED_LENGTH) return tokens[0];
    return "";
  }

  function keyboardEvent(type, key, code, keyCode, printable) {
    const event = new KeyboardEvent(type, {
      key,
      code,
      keyCode,
      charCode: type === "keypress" && printable ? keyCode : 0,
      which: keyCode,
      bubbles: true,
      cancelable: true
    });

    // Chromium does not consistently populate these legacy properties from
    // the constructor. love.js/SDL still reads them for keyboard input.
    for (const [name, value] of Object.entries({
      keyCode,
      which: keyCode,
      charCode: type === "keypress" && printable ? keyCode : 0
    })) {
      try {
        Object.defineProperty(event, name, { configurable: true, get: () => value });
      } catch {}
    }
    return event;
  }

  function sendKey(key, code, keyCode, printable = false) {
    const target = document.getElementById("canvas") || document;
    target.dispatchEvent(keyboardEvent("keydown", key, code, keyCode, printable));
    if (printable) target.dispatchEvent(keyboardEvent("keypress", key, code, keyCode, true));
    target.dispatchEvent(keyboardEvent("keyup", key, code, keyCode, printable));
  }

  function pasteSeed(value) {
    const seed = normalizeSeed(value);
    if (!seed) return false;

    const canvas = document.getElementById("canvas");
    if (canvas) {
      canvas.setAttribute("tabindex", "-1");
      canvas.focus({ preventScroll: true });
    }

    // Clear either side of the seed field's cursor. Outside an active Balatro
    // text field these synthetic editing keys have no browser default action.
    for (let index = 0; index < MAX_SEED_LENGTH; index++) {
      sendKey("Backspace", "Backspace", 8);
      sendKey("Delete", "Delete", 46);
    }
    for (const character of seed) {
      const digit = /[0-9]/.test(character);
      sendKey(character, `${digit ? "Digit" : "Key"}${character}`, character.charCodeAt(0), true);
    }

    window.dispatchEvent(new CustomEvent("balatroseedpaste", { detail: { seed } }));
    return true;
  }

  async function readClipboard() {
    if (!navigator.clipboard?.readText) return "";
    try {
      return normalizeSeed(await navigator.clipboard.readText());
    } catch {
      return "";
    }
  }

  document.addEventListener("paste", event => {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && active.id !== "canvas" && /^(INPUT|TEXTAREA)$/.test(active.tagName)) return;

    const text = event.clipboardData?.getData("text/plain") || "";
    if (!normalizeSeed(text)) return;
    pasteSequence++;
    event.preventDefault();
    event.stopImmediatePropagation();
    pasteSeed(text);
  }, true);

  window.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || String(event.key).toLowerCase() !== "v") return;
    const sequence = pasteSequence;
    setTimeout(async () => {
      if (sequence !== pasteSequence) return;
      const text = await readClipboard();
      if (sequence === pasteSequence && pasteSeed(text)) pasteSequence++;
    }, 0);
  }, true);

  window.BalatroSeedClipboard = Object.freeze({
    normalizeSeed,
    pasteSeed,
    readClipboard
  });
})();
