// The "Claude Usage" details panel: a themed webview with ring gauges,
// a usage-vs-time pace bar and live reset countdowns.

const vscode = require('vscode');
const crypto = require('crypto');

class UsagePanel {
  /** @type {UsagePanel | undefined} */
  static current;

  /**
   * Show (or focus) the singleton panel.
   * @param {() => object} getModel  returns the latest view model
   * @param {{ refresh: () => void, openSettings: () => void }} actions
   */
  static show(getModel, actions) {
    if (UsagePanel.current) {
      UsagePanel.current.panel.reveal(undefined, false);
      UsagePanel.current.update(getModel());
      return UsagePanel.current;
    }
    const panel = vscode.window.createWebviewPanel('claudeUsageBar.details', 'Claude Usage', vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [],
    });
    UsagePanel.current = new UsagePanel(panel, getModel, actions);
    return UsagePanel.current;
  }

  constructor(panel, getModel, actions) {
    this.panel = panel;
    this.getModel = getModel;
    this.disposables = [];
    panel.iconPath = new vscode.ThemeIcon('pulse');
    panel.webview.html = html(crypto.randomBytes(16).toString('base64'));

    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'ready') this.update(this.getModel());
      else if (msg?.type === 'refresh') actions.refresh();
      else if (msg?.type === 'settings') actions.openSettings();
      else if (msg?.type === 'connect') actions.connect();
    }, null, this.disposables);

    panel.onDidChangeViewState(() => { if (panel.visible) this.update(this.getModel()); }, null, this.disposables);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  update(model) {
    if (this.panel.visible) this.panel.webview.postMessage({ type: 'model', model });
  }

  dispose() {
    UsagePanel.current = undefined;
    while (this.disposables.length) this.disposables.pop().dispose();
  }
}

function html(nonce) {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Usage</title>
<style>
  :root {
    --ok: var(--vscode-charts-green, #3fb950);
    --warn: var(--vscode-charts-yellow, #d29922);
    --critical: var(--vscode-charts-red, #f85149);
    --none: var(--vscode-disabledForeground, #8b949e);
    --time: var(--vscode-descriptionForeground, #8b949e);
    --fg: var(--vscode-foreground, #ccc);
    --muted: var(--vscode-descriptionForeground, #9da5b4);
    --bg: var(--vscode-editor-background, #1e1e1e);
    --card: var(--vscode-sideBar-background, var(--vscode-editorWidget-background, #252526));
    --border: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.25)));
    --track: color-mix(in srgb, var(--fg) 12%, transparent);
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  .connect {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 14px 16px; margin-bottom: 20px; border-radius: 10px;
    background: color-mix(in srgb, var(--vscode-button-background, #0078d4) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--vscode-button-background, #0078d4) 45%, transparent);
  }
  .connect > div { flex: 1; min-width: 220px; }
  .connect strong { display: block; margin-bottom: 2px; }
  body {
    margin: 0; padding: 28px 32px 40px;
    background: var(--bg); color: var(--fg);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    line-height: 1.5;
  }
  .wrap { max-width: 920px; margin: 0 auto; }
  .muted { color: var(--muted); }
  .num { font-variant-numeric: tabular-nums; }

  /* header */
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo {
    width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center;
    background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok);
  }
  h1 { font-size: 1.45em; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  header p { margin: 0; font-size: .92em; }
  .actions { display: flex; gap: 8px; }
  button {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid transparent;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--fg));
    border-color: var(--border);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, var(--track)); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }

  /* cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px; }
  .card {
    --accent: var(--none);
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 20px; display: flex; flex-direction: column; gap: 18px;
    border-top: 3px solid var(--accent);
  }
  .card.ok { --accent: var(--ok); }
  .card.warn { --accent: var(--warn); }
  .card.critical { --accent: var(--critical); }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .card h2 { font-size: 1.1em; margin: 0; font-weight: 600; }
  .card-head p { margin: 2px 0 0; font-size: .9em; }
  .chip {
    flex: none; font-size: .8em; font-weight: 600; padding: 2px 10px; border-radius: 999px;
    color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
    white-space: nowrap;
  }

  .body { display: flex; gap: 22px; align-items: center; }
  .gauge { position: relative; width: 128px; height: 128px; flex: none; }
  .gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .gauge .track { stroke: var(--track); }
  .gauge .fill { stroke: var(--accent); transition: stroke-dasharray .6s cubic-bezier(.2,.8,.2,1); }
  .gauge .center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .gauge .pct { font-size: 2.2em; font-weight: 650; line-height: 1; letter-spacing: -.02em; }
  .gauge .pct small { font-size: .45em; font-weight: 500; margin-left: 1px; color: var(--muted); }
  .gauge .lbl { font-size: .8em; margin-top: 4px; }

  dl { margin: 0; display: grid; gap: 10px; flex: 1; min-width: 0; }
  dl div { display: flex; flex-direction: column; }
  dt { font-size: .78em; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  dd { margin: 0; font-size: 1.05em; font-weight: 500; }

  /* pace bar */
  .pace-bar { display: grid; gap: 6px; }
  .pace-bar .row { display: flex; justify-content: space-between; font-size: .85em; }
  .rail { position: relative; height: 8px; border-radius: 99px; background: var(--track); }
  .rail .used { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--accent); transition: width .6s cubic-bezier(.2,.8,.2,1); }
  .rail .now {
    position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 2px;
    background: var(--fg); box-shadow: 0 0 0 2px var(--card); transition: left .6s cubic-bezier(.2,.8,.2,1);
  }
  .legend { display: flex; gap: 14px; font-size: .8em; color: var(--muted); flex-wrap: wrap; }
  .legend i { display: inline-block; vertical-align: middle; margin-right: 5px; }
  .legend .sw-used { width: 10px; height: 6px; border-radius: 3px; background: var(--accent); }
  .legend .sw-now { width: 2px; height: 10px; background: var(--fg); }

  .verdict {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px; border-radius: 8px;
    background: color-mix(in srgb, var(--v) 10%, transparent);
  }
  .verdict svg { flex: none; color: var(--v); margin-top: 2px; }
  .verdict strong { display: block; }
  .verdict span { color: var(--muted); font-size: .92em; }
  .v-under, .v-early, .v-idle { --v: var(--ok); }
  .v-over { --v: var(--warn); }
  .v-limit { --v: var(--critical); }
  .v-none { --v: var(--none); }

  /* help */
  details.help { margin-top: 28px; border: 1px solid var(--border); border-radius: var(--radius); padding: 0 16px; }
  details.help summary { cursor: pointer; padding: 12px 0; font-weight: 500; }
  details.help ul { margin: 0 0 14px; padding-left: 18px; color: var(--muted); }
  details.help li { margin: 4px 0; }
  details.help b { color: var(--fg); font-weight: 600; }
  footer { margin-top: 20px; font-size: .85em; text-align: center; }
  a { color: var(--vscode-textLink-foreground); }

  .empty { text-align: center; padding: 48px 16px; }
  @media (max-width: 420px) {
    body { padding: 18px 16px 32px; }
    .body { flex-direction: column; align-items: stretch; }
    .gauge { margin: 0 auto; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo" aria-hidden="true">${icon('gauge', 22)}</div>
      <div>
        <h1>Claude usage</h1>
        <p class="muted" id="updated">Loading…</p>
      </div>
    </div>
    <div class="actions">
      <button id="refresh" title="Read the latest local usage snapshot">${icon('refresh')}<span>Reload</span></button>
      <button id="settings" class="secondary" title="Open Claude Usage Bar settings">${icon('gear')}<span>Settings</span></button>
    </div>
  </header>

  <div id="connect" class="connect" hidden>
    <div>
      <strong>Finish setup: connect Claude Code</strong>
      <span class="muted">Adds one status-line entry to Claude Code's settings so it can share your usage with VS Code. Your current status line, if any, is saved and can be restored.</span>
    </div>
    <button id="connectBtn">Connect Claude Code</button>
  </div>
  <main id="cards" class="cards" aria-live="polite"></main>
  <details class="help">
    <summary>How to read this</summary>
    <ul>
      <li><b>5-hour</b> is your short-term session limit. It resets 5 hours after the window starts.</li>
      <li><b>7-day</b> is your weekly limit across all of Claude Code.</li>
      <li>On the bar, the <b>colored fill</b> is how much you've used, and the <b>thin marker</b> is how far through the window you are. If the fill is left of the marker, you're using less than an even pace.</li>
      <li><b>Ahead of pace</b> means that if you keep going at the same rate, you'll hit the limit before it resets.</li>
      <li>Colors turn yellow and red at the thresholds set in <a href="#" id="settingsLink">settings</a>.</li>
    </ul>
  </details>
  <footer class="muted">Updates when Claude Code reports usage through its status line.</footer>
</div>

<script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const ICONS = ${JSON.stringify({ check: icon('check'), warning: icon('warning'), error: icon('error'), clock: icon('clock'), info: icon('info') })};
  const CHIP = { ok: 'Low usage', warn: 'High usage', critical: 'Almost out', none: 'No data' };
  const VERDICT_ICON = { under: 'check', early: 'check', idle: 'info', over: 'warning', limit: 'error', none: 'info' };
  const RING_R = 52, RING_C = 2 * Math.PI * RING_R;
  let model = null;
  let firstRender = true;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function duration(sec) {
    let s = Math.max(0, Math.round(sec));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    if (m) return m + 'm';
    return '<1m';
  }
  function ago(epoch) {
    const s = Math.max(0, Date.now() / 1000 - epoch);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function card(w) {
    const level = w.hasData ? w.level : 'none';
    const pct = w.hasData ? Math.round(w.pct) : null;
    const chip = w.pace === 'limit' ? 'Limit reached' : CHIP[level];
    const resets = Number.isSafeInteger(w.resetsAt) ? '<span class="num" data-countdown="' + w.resetsAt + '">' + duration(w.resetsAt - Date.now() / 1000) + '</span>' : '—';
    const left = w.hasData ? Math.max(0, 100 - pct) + '%' : '—';
    const paceBar = w.elapsedPct != null ? \`
      <div class="pace-bar">
        <div class="row"><span class="muted">Usage vs. time</span><span class="num">\${pct}% used · \${Math.round(w.elapsedPct)}% of window passed</span></div>
        <div class="rail" role="img" aria-label="\${pct} percent used, \${Math.round(w.elapsedPct)} percent of the window has passed">
          <div class="used" data-w="\${Math.min(100, w.pct)}"></div>
          <div class="now" data-l="\${w.elapsedPct}"></div>
        </div>
        <div class="legend"><span><i class="sw-used"></i>Used</span><span><i class="sw-now"></i>Now</span></div>
      </div>\` : '';

    return \`
      <article class="card \${level}" aria-label="\${esc(w.title)} window">
        <div class="card-head">
          <div><h2>\${esc(w.title)} window</h2><p class="muted">\${esc(w.subtitle)}</p></div>
          <span class="chip">\${chip}</span>
        </div>
        <div class="body">
          <div class="gauge" role="img" aria-label="\${pct == null ? 'No data' : pct + ' percent used'}">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="\${RING_R}" fill="none" stroke-width="10"/>
              <circle class="fill" cx="60" cy="60" r="\${RING_R}" fill="none" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="0 \${RING_C}" data-p="\${w.hasData ? Math.min(100, w.pct) : 0}"/>
            </svg>
            <div class="center">
              <span class="pct num">\${pct == null ? '--' : pct}<small>%</small></span>
              <span class="lbl muted">used</span>
            </div>
          </div>
          <dl>
            <div><dt>Remaining</dt><dd class="num">\${left}</dd></div>
            <div><dt>Resets in</dt><dd>\${resets}</dd></div>
            <div><dt>Resets at</dt><dd>\${esc(w.resetsAtLabel || '—')}</dd></div>
          </dl>
        </div>
        \${paceBar}
        <div class="verdict v-\${w.pace}">
          \${ICONS[VERDICT_ICON[w.pace] || 'info']}
          <div><strong>\${esc(w.headline)}</strong><span>\${esc(w.detail)}</span></div>
        </div>
      </article>\`;
  }

  function render() {
    if (!model) return;
    $('updated').textContent = model.updatedAt
      ? 'Updated ' + ago(model.updatedAt) : 'Waiting for Claude Code status-line data';
    $('connect').hidden = !!model.connected;
    $('cards').innerHTML = model.windows.map(card).join('');

    // Sizes are set via CSSOM so the CSP can stay strict. Only the first render
    // animates in; later updates apply instantly so nothing replays every tick.
    if (firstRender) { firstRender = false; requestAnimationFrame(applySizes); }
    else applySizes();
  }

  function applySizes() {
    document.querySelectorAll('.gauge .fill').forEach((el) => {
      const p = Number(el.dataset.p) / 100;
      el.style.strokeDasharray = (RING_C * p) + 'px ' + RING_C + 'px';
      if (p === 0) el.style.opacity = '0';
    });
    document.querySelectorAll('[data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
    document.querySelectorAll('[data-l]').forEach((el) => { el.style.left = el.dataset.l + '%'; });
  }

  function tickCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      el.textContent = duration(Number(el.dataset.countdown) - Date.now() / 1000);
    });
    if (model?.updatedAt) $('updated').textContent = 'Updated ' + ago(model.updatedAt);
  }

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'model') { model = e.data.model; render(); }
  });
  $('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  $('settings').addEventListener('click', () => vscode.postMessage({ type: 'settings' }));
  $('connectBtn').addEventListener('click', () => vscode.postMessage({ type: 'connect' }));
  $('settingsLink').addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ type: 'settings' }); });
  setInterval(tickCountdowns, 15000);
  vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}

// Minimal inline icons (codicon-style, 16px grid) so the webview needs no assets.
function icon(name, size = 16) {
  const paths = {
    refresh: '<path d="M13.45 5.17A6 6 0 1 0 14 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M14 2.5v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    gear: '<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    warning: '<path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6v3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".85" fill="currentColor"/>',
    error: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m5.6 5.6 4.8 4.8m0-4.8-4.8 4.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    check: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m5.2 8.2 1.9 1.9 3.8-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".85" fill="currentColor"/>',
    clock: '<circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    gauge: '<path d="M3.2 12.6a6 6 0 1 1 9.6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 9.2 10.6 6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="9.4" r="1.3" fill="currentColor"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">${paths[name] || ''}</svg>`;
}

module.exports = { UsagePanel };
