// Claude Usage Bar: always-on 5h / 7d Claude usage in the VS Code status bar,
// with a rich hover and a details panel that explains whether you're on pace.

const vscode = require('vscode');
const fs = require('fs');
const { STATE_FILE, WINDOWS, readState, analyze } = require('./lib/usage');
const { bar, clamp, duration, durationLong, timeAgo, friendlyTime } = require('./lib/format');
const { UsagePanel } = require('./lib/panel');
const connection = require('./lib/connect');

const CMD = {
  refresh: 'claudeUsageBar.refresh',
  details: 'claudeUsageBar.showDetails',
  settings: 'claudeUsageBar.openSettings',
  click: 'claudeUsageBar.click',
  connect: 'claudeUsageBar.connect',
  disconnect: 'claudeUsageBar.disconnect',
};

const LEVEL_ICON = { ok: 'pass', warn: 'warning', critical: 'error', none: 'circle-outline' };
const PACE_ICON = { under: 'pass', early: 'pass', idle: 'info', over: 'warning', limit: 'error', none: 'info' };
const PROMPT_DISMISSED_KEY = 'connectPromptDismissed';

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('claudeUsageBar');

  // After an extension update, keep the copied helper in sync with the bundled one.
  try { connection.refreshHelperIfInstalled(); }
  catch (error) { vscode.window.showWarningMessage(`Couldn't update the Claude Usage Bar helper. Run Connect Claude Code to retry. ${error.message}`); }

  // One status bar item per window. Users can hide either one by right-clicking the status bar.
  const items = WINDOWS.map((w, i) => {
    const item = vscode.window.createStatusBarItem(`claudeUsageBar.${w.key}`, vscode.StatusBarAlignment.Right, 101 - i);
    item.name = `Claude ${w.title} usage`;
    return item;
  });

  // ---------- view model ----------

  function boundedSetting(key, fallback, min, max) {
    const value = cfg().get(key, fallback);
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
  }

  function thresholds() {
    const warn = boundedSetting('warningThreshold', 70, 1, 100);
    const critical = Math.max(warn, boundedSetting('criticalThreshold', 90, 1, 100));
    return { warn, critical };
  }

  function buildModel() {
    const state = readState();
    const th = thresholds();
    const windows = WINDOWS.map((w) => {
      const a = analyze(state && state[w.key], w.length, th);
      return { ...w, ...a, resetsAtLabel: a.resetsAt ? friendlyTime(a.resetsAt) : null };
    });
    const conn = connection.status();
    const connected = conn.state === 'connected' || (conn.state === 'legacy' && conn.ready);
    return { updatedAt: state?.updated_at ?? null, windows, connected, connection: conn.state };
  }

  // ---------- status bar ----------

  function renderItem(item, w, model) {
    const width = Math.round(boundedSetting('barWidth', 8, 3, 20));
    const style = cfg().get('barStyle', 'blocks');
    const showReset = cfg().get('showResetTime', false);
    item.command = CMD.click;

    if (!w.hasData) {
      const blank = style === 'none' ? '' : ` ${bar(0, width, style)}`;
      item.text = `$(${w.icon}) ${w.short}${blank} --`;
      item.backgroundColor = undefined;
      item.accessibilityInformation = { label: `Claude ${w.title} usage: no data yet`, role: 'button' };
    } else {
      const pct = Math.round(w.pct);
      const barText = style === 'none' ? '' : ` ${bar(w.pct, width, style)}`;
      const reset = showReset && w.resetsIn != null ? ` · ${duration(w.resetsIn)}` : '';
      item.text = `$(${w.icon}) ${w.short}${barText} ${pct}%${reset}`;
      item.backgroundColor =
        w.level === 'critical' ? new vscode.ThemeColor('statusBarItem.errorBackground') :
        w.level === 'warn' ? new vscode.ThemeColor('statusBarItem.warningBackground') :
        undefined;
      const resetSpoken = w.resetsIn != null ? `, resets in ${durationLong(w.resetsIn)}` : '';
      item.accessibilityInformation = { label: `Claude ${w.title} usage ${pct} percent${resetSpoken}. ${w.headline}.`, role: 'button' };
    }
    item.tooltip = buildTooltip(model);
    item.show();
  }

  /** Before setup: one clear call to action instead of two empty bars. */
  function renderConnectPrompt(model) {
    const [first, second] = items;
    first.text = '$(plug) Connect Claude usage';
    first.command = CMD.connect;
    first.backgroundColor = undefined;
    first.accessibilityInformation = { label: 'Connect Claude Usage Bar to Claude Code', role: 'button' };
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: [CMD.connect] };
    md.supportThemeIcons = true;
    md.appendMarkdown(`**$(pulse) Claude Usage Bar**\n\n`);
    md.appendMarkdown(model.connection === 'error'
      ? `$(warning) Claude Usage Bar can't update Claude Code's \`settings.json\` yet. Click Connect to see why.\n\n`
      : `One click to finish setup: this adds a status-line entry to Claude Code's settings so it can share your usage with VS Code.\n\n`);
    md.appendMarkdown(`[$(plug) Connect Claude Code](command:${CMD.connect})`);
    first.tooltip = md;
    first.show();
    second.hide();
  }

  function buildTooltip(model) {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: [CMD.refresh, CMD.details, CMD.settings, CMD.connect] };
    md.supportThemeIcons = true;

    md.appendMarkdown(`**$(pulse) Claude usage**\n\n`);
    md.appendMarkdown(`| | Used | | Resets in |\n|:--|:--|--:|:--|\n`);
    for (const w of model.windows) {
      const meter = '`' + bar(w.hasData ? w.pct : 0, 10, 'blocks') + '`';
      const pct = w.hasData ? `**${Math.round(w.pct)}%**` : '--';
      const reset = w.resetsIn != null ? `${duration(w.resetsIn)} _(${w.resetsAtLabel})_` : '—';
      md.appendMarkdown(`| $(${LEVEL_ICON[w.level]}) ${w.title} | ${meter} | ${pct} | ${reset} |\n`);
    }
    // One plain-language line per headline window.
    const verdicts = model.windows.filter((w) => w.hasData)
      .map((w) => `$(${PACE_ICON[w.pace]}) **${w.title}: ${w.headline}.** ${w.detail}`);
    if (verdicts.length) md.appendMarkdown(`\n${verdicts.join('  \n')}\n`);

    if (!model.updatedAt && model.connected) {
      md.appendMarkdown(`\n$(check) Connected. Send a message in a Claude Code terminal session; the bars fill in after Claude replies.\n`);
    } else if (!model.connected) {
      md.appendMarkdown(`\n$(info) Not connected to Claude Code, so these numbers won't update. [Connect](command:${CMD.connect})\n`);
    }

    const updated = model.updatedAt ? `Updated ${timeAgo(model.updatedAt)}` : 'Waiting for Claude Code';
    md.appendMarkdown(`\n---\n\n${updated} &nbsp;·&nbsp; [$(refresh) Reload](command:${CMD.refresh} "Read the latest local usage snapshot")`
      + ` &nbsp;·&nbsp; [$(dashboard) Details](command:${CMD.details} "Open the usage details panel")`
      + ` &nbsp;·&nbsp; [$(gear) Settings](command:${CMD.settings} "Open Claude Usage Bar settings")`);
    return md;
  }

  function render() {
    const model = buildModel();
    const anyData = model.windows.some((w) => w.hasData);
    if (!anyData && !model.connected) renderConnectPrompt(model);
    else model.windows.forEach((w, i) => renderItem(items[i], w, model));
    if (UsagePanel.current) UsagePanel.current.update(model);
  }

  // ---------- connect / disconnect ----------

  /** Claude Code runs the helper with Node.js. Without it, connecting would only blank Claude Code's status line. */
  async function nodeReady() {
    const node = await connection.checkNode();
    if (node.ok) return true;
    const pick = await vscode.window.showWarningMessage(
      node.version
        ? `Claude Usage Bar needs Node.js 16 or newer, but found ${node.version}.`
        : 'Claude Usage Bar needs Node.js, and VS Code couldn\'t find it.',
      {
        modal: true,
        detail: 'Claude Code uses Node.js to run the small helper that reports your usage. Install Node.js, restart VS Code, then click Connect again.\n\n'
          + 'If `node --version` already works in the terminal you use for Claude Code, you can connect anyway.',
      },
      'Install Node.js', 'Connect Anyway');
    if (pick === 'Install Node.js') vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/en/download'));
    return pick === 'Connect Anyway';
  }

  async function connect() {
    const current = connection.status();

    if (current.state === 'error') {
      const open = await vscode.window.showErrorMessage(
        `Claude Usage Bar can't update Claude Code's settings.json, so nothing was changed. ${current.error}`,
        ...(connection.SETTINGS_FILE ? ['Open settings.json'] : []));
      if (open === 'Open settings.json') await vscode.window.showTextDocument(vscode.Uri.file(connection.SETTINGS_FILE));
      return;
    }

    if (current.state !== 'connected' && !(await nodeReady())) return;

    if (current.state === 'other') {
      const choice = await vscode.window.showWarningMessage(
        'You already have a custom Claude Code status line.',
        { modal: true, detail: 'Claude Usage Bar will save your current status line before replacing it. You can restore it with Disconnect Claude Code.' },
        'Replace');
      if (choice !== 'Replace') return;
    }

    try {
      connection.connect(current.state === 'other' ? current.line : undefined);
    } catch (e) {
      vscode.window.showErrorMessage(`Couldn't connect to Claude Code: ${e.message}`);
      return;
    }
    render();

    vscode.window.showInformationMessage(
      'Connected. Use Claude Code in your terminal. The bars fill in after Claude reports usage.');
  }

  async function disconnect() {
    const choice = await vscode.window.showWarningMessage(
      'Disconnect Claude Usage Bar from Claude Code?',
      { modal: true, detail: 'This removes its status-line entry from Claude Code\'s settings and restores your previous status line, if you had one. The bars stop updating.' },
      'Disconnect');
    if (choice !== 'Disconnect') return;

    let result;
    try {
      result = connection.disconnect();
    } catch (e) {
      if (e.code !== 'NO_RECORD') return void vscode.window.showErrorMessage(`Couldn't disconnect: ${e.message}`);
      const force = await vscode.window.showWarningMessage(
        'Remove the Claude Usage Bar status line anyway?',
        { modal: true, detail: `${e.message} If you had your own status line before, you'll need to set it up again in Claude Code.` },
        'Remove Anyway');
      if (force !== 'Remove Anyway') return;
      try { result = connection.disconnect({ force: true }); }
      catch (e2) { return void vscode.window.showErrorMessage(`Couldn't disconnect: ${e2.message}`); }
    }
    render();
    vscode.window.showInformationMessage(
      result === 'restored' ? 'Disconnected. Your previous Claude Code status line is back.'
        : result === 'removed' ? 'Disconnected from Claude Code.'
          : 'Claude Usage Bar wasn\'t connected, so nothing changed.');
  }

  /** Offer setup once, right after install. "Not now" is remembered; the status bar button stays. */
  async function maybePromptToConnect() {
    const model = buildModel();
    if (model.connected) return;
    if (context.globalState.get(PROMPT_DISMISSED_KEY)) return;
    const pick = await vscode.window.showInformationMessage(
      'Connect Claude Usage Bar? This lets the extension set up a status line in your Claude Code settings.',
      'Connect', 'Not now');
    if (pick === 'Connect') connect();
    else if (pick === 'Not now') context.globalState.update(PROMPT_DISMISSED_KEY, true);
  }

  // ---------- wiring ----------

  const showDetails = () => UsagePanel.show(buildModel, {
    refresh: render,
    connect,
    openSettings: () => vscode.commands.executeCommand(CMD.settings),
  });

  fs.watchFile(STATE_FILE, { interval: 2000 }, render);
  if (connection.SETTINGS_FILE) fs.watchFile(connection.SETTINGS_FILE, { interval: 5000 }, render);
  const timer = setInterval(render, 15000);

  context.subscriptions.push(
    ...items,
    vscode.commands.registerCommand(CMD.refresh, render),
    vscode.commands.registerCommand(CMD.details, showDetails),
    vscode.commands.registerCommand(CMD.connect, connect),
    vscode.commands.registerCommand(CMD.disconnect, disconnect),
    vscode.commands.registerCommand(CMD.settings, () => vscode.commands.executeCommand('workbench.action.openSettings', 'claudeUsageBar')),
    vscode.commands.registerCommand(CMD.click, () => (cfg().get('clickAction', 'details') === 'refresh' ? render() : showDetails())),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('claudeUsageBar')) render(); }),
    { dispose: () => {
      clearInterval(timer);
      fs.unwatchFile(STATE_FILE, render);
      if (connection.SETTINGS_FILE) fs.unwatchFile(connection.SETTINGS_FILE, render);
      UsagePanel.current?.panel.dispose();
    } }
  );

  render();
  maybePromptToConnect();
}

module.exports = { activate };
