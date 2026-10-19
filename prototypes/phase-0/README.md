# Phase 0 prototype (throwaway)

Answers three questions from `docs/konzept.md` before the real foundation is built:

1. Can a proxy in the MAIN world hand game traffic to the isolated content script reliably and fast, including the startup data?
2. Can the content script open a pop-out (Document Picture-in-Picture or `window.open`) and keep rendering and handling clicks there, with the box inside a shadow root?
3. What does a storage round trip content script → service worker → IndexedDB cost?

## Build and load

```
npm install
npm run build
```

Chrome: `chrome://extensions` → developer mode → "Load unpacked" → `prototypes/phase-0/dist`. Reload the game tab.

## Checks

- Box "Forge Toolbox Prototyp" appears top right. Message count grows, "vor Bereitschaft gepuffert" > 0 means the startup data survived.
- Pop-out (Bild-im-Bild) and Pop-out (Fenster): box moves, counter button still works, closing brings the box back.
- Speicher-Test: log shows the timings. Run it again after a minute idle to see the service worker wake-up.
- Aufnahme speichern: downloads the recorded traffic as JSON (future test fixtures, contains private game data, do not commit).
