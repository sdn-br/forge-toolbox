// Isolated world. Receives game traffic from the proxy, renders a test box with lit-html
// inside a shadow root, and runs the three prototype checks.
import { html, render } from 'lit-html';
import { TAG, type ContentMessage, type ProxyMessage, type StorageRequest, type Traffic } from './protocol';

type GameEntry = { requestClass?: string; requestMethod?: string };

const recording: (Traffic & { receivedAt: number })[] = [];
const counts = new Map<string, number>();
const state = {
  messages: 0,
  bytes: 0,
  latencies: [] as number[],
  bufferedAtStart: 0,
  clicks: 0,
  log: [] as string[],
};

function log(line: string) {
  state.log.unshift(`${new Date().toLocaleTimeString()} ${line}`);
  scheduleRender();
}

// --- Check 1: proxy hand-off ------------------------------------------------

function entriesOf(traffic: Traffic): GameEntry[] {
  try {
    const parsed = JSON.parse(traffic.kind === 'xhr' ? traffic.response : traffic.data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const readyAt = performance.now();

window.addEventListener('message', (event: MessageEvent<ProxyMessage>) => {
  if (event.source !== window || event.data?.tag !== TAG || event.data.from !== 'proxy') return;
  if (event.data.type === 'hello') return sendReady();
  const { traffic } = event.data;
  const receivedAt = performance.now();
  recording.push({ ...traffic, receivedAt });
  state.messages++;
  state.bytes += traffic.kind === 'xhr' ? traffic.response.length : traffic.data.length;
  if (traffic.sentAt < readyAt) state.bufferedAtStart++;
  else state.latencies.push(receivedAt - traffic.sentAt);
  for (const entry of entriesOf(traffic)) {
    const key = `${traffic.kind} ${entry.requestClass}.${entry.requestMethod}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  scheduleRender();
});

function sendReady() {
  const message: ContentMessage = { tag: TAG, from: 'content', type: 'ready' };
  window.postMessage(message, location.origin);
}
sendReady();

function saveRecording() {
  const blob = new Blob([JSON.stringify(recording, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `forge-toolbox-recording-${Date.now()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  log(`Aufnahme gespeichert: ${recording.length} Nachrichten`);
}

// --- Check 2: pop-out from the content script --------------------------------

const host = document.createElement('div');
host.style.cssText = 'position:fixed;top:80px;right:20px;z-index:2147483647;';
const shadow = host.attachShadow({ mode: 'open' });

async function popOutPip() {
  const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } })
    .documentPictureInPicture;
  log(`documentPictureInPicture im Content Script: ${dpip ? 'vorhanden' : 'fehlt'}`);
  if (!dpip) return;
  try {
    const pip = await dpip.requestWindow({ width: 460, height: 520 });
    moveTo(pip);
    log('Bild-im-Bild geöffnet');
  } catch (error) {
    log(`Bild-im-Bild fehlgeschlagen: ${error}`);
  }
}

function popOutWindow() {
  const win = window.open('', 'forge-toolbox-proto', 'width=460,height=560');
  log(`window.open: ${win ? 'Fenster da' : 'blockiert'}`);
  if (win) moveTo(win);
}

function moveTo(win: Window) {
  host.style.cssText = '';
  win.document.body.style.margin = '0';
  win.document.body.append(host);
  win.addEventListener('pagehide', () => {
    host.style.cssText = 'position:fixed;top:80px;right:20px;z-index:2147483647;';
    document.documentElement.append(host);
    log('Pop-out geschlossen, Box zurück im Spiel');
  });
}

// --- Check 3: storage round trips through the service worker -----------------

async function call(req: StorageRequest): Promise<unknown> {
  const res = await chrome.runtime.sendMessage(req);
  if (!res?.ok) throw new Error(res?.error ?? 'no response');
  return res.data;
}

async function storageTest() {
  try {
    let t = performance.now();
    await call({ op: 'get', key: 'wake' });
    log(`Erste Nachricht (ggf. Aufwecken): ${(performance.now() - t).toFixed(1)} ms`);

    const n = 200;
    t = performance.now();
    for (let i = 0; i < n; i++) await call({ op: 'put', key: `p${i}`, value: { id: i, name: `Spieler ${i}`, points: i * 1000 } });
    log(`${n}× kleines put nacheinander: ${((performance.now() - t) / n).toFixed(2)} ms je Aufruf`);

    t = performance.now();
    for (let i = 0; i < n; i++) await call({ op: 'get', key: `p${i}` });
    log(`${n}× kleines get nacheinander: ${((performance.now() - t) / n).toFixed(2)} ms je Aufruf`);

    const rows = Array.from({ length: 5000 }, (_, i) => ({
      key: `s${i}`,
      value: { date: Date.now() - i * 3600_000, goods: i % 50, amount: i * 7, era: 'SpaceAgeTitan' },
    }));
    t = performance.now();
    await call({ op: 'bulkPut', rows });
    log(`5000 Zeilen schreiben (eine Nachricht): ${(performance.now() - t).toFixed(1)} ms`);

    t = performance.now();
    const all = (await call({ op: 'getAll' })) as unknown[];
    log(`${all.length} Zeilen lesen (eine Nachricht): ${(performance.now() - t).toFixed(1)} ms`);

    await call({ op: 'clear' });
  } catch (error) {
    log(`Speicher-Test fehlgeschlagen: ${error}`);
  }
}

// --- View ---------------------------------------------------------------------

const style = html`<style>
  :host { all: initial; }
  .box { width: 420px; max-height: 500px; overflow: auto; background: #2b1d10; color: #f3e3c3;
    font: 12px/1.4 system-ui, sans-serif; border: 2px solid #8a6a3a; border-radius: 6px; padding: 8px; }
  h1 { font-size: 14px; margin: 0 0 6px; }
  button { margin: 2px 2px 6px 0; font: inherit; cursor: pointer; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 1px 4px; border-bottom: 1px solid #4a3620; }
  td.n { text-align: right; }
  .log { white-space: pre-wrap; color: #cfe3a0; }
</style>`;

function view() {
  const sorted = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const avg = state.latencies.length ? state.latencies.reduce((a, b) => a + b, 0) / state.latencies.length : 0;
  const max = state.latencies.length ? Math.max(...state.latencies) : 0;
  return html`${style}
    <div class="box">
      <h1>Forge Toolbox Prototyp (Phase 0)</h1>
      <button @click=${popOutPip}>Pop-out (Bild-im-Bild)</button>
      <button @click=${popOutWindow}>Pop-out (Fenster)</button>
      <button @click=${() => { state.clicks++; scheduleRender(); }}>Klick-Zähler: ${state.clicks}</button>
      <button @click=${storageTest}>Speicher-Test</button>
      <button @click=${saveRecording}>Aufnahme speichern</button>
      <div>
        Nachrichten: ${state.messages} (vor Bereitschaft gepuffert: ${state.bufferedAtStart}),
        ${(state.bytes / 1024 / 1024).toFixed(2)} MB,
        Übergabe Ø ${avg.toFixed(2)} ms / max ${max.toFixed(1)} ms
      </div>
      <table>${sorted.map(([key, n]) => html`<tr><td>${key}</td><td class="n">${n}</td></tr>`)}</table>
      <div class="log">${state.log.slice(0, 20).join('\n')}</div>
    </div>`;
}

let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    render(view(), shadow);
  });
}

function mount() {
  document.documentElement.append(host);
  scheduleRender();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
