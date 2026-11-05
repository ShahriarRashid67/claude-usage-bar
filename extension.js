// Claude Usage Bar: always-on 5h / 7d Claude usage in the VS Code status bar,
// with a rich hover and a details panel that explains whether you're on pace.

const vscode = require('vscode');
const fs = require('fs');
const { STATE_FILE, WINDOWS, readState, analyze } = require('./lib/usage');
const { bar, clamp, duration, durationLong, timeAgo, friendlyTime } = require('./lib/format');
const { UsagePanel } = require('./lib/panel');

const CMD = {
  refresh: 'claudeUsageBar.refresh',
  details: 'claudeUsageBar.showDetails',
  settings: 'claudeUsageBar.openSettings',
  click: 'claudeUsageBar.click',
};

const LEVEL_ICON = { ok: 'pass', warn: 'warning', critical: 'error', none: 'circle-outline' };
const PACE_ICON = { under: 'pass', early: 'pass', idle: 'info', over: 'warning', limit: 'error', none: 'info' };

function activate(context) {
  const cfg = () => vscode.workspace.getConfiguration('claudeUsageBar');

  // One status bar item per window. Users can hide either one by right-clicking the status bar.
  const items = WINDOWS.map((w, i) => {
    const item = vscode.window.createStatusBarItem(`claudeUsageBar.${w.key}`, vscode.StatusBarAlignment.Right, 101 - i);
    item.name = `Claude ${w.title} usage`;
    item.command = CMD.click;
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
    return { updatedAt: state?.updated_at ?? null, windows };
  }

  // ---------- status bar ----------

  function renderItem(item, w, model) {
    const width = Math.round(boundedSetting('barWidth', 8, 3, 20));
    const style = cfg().get('barStyle', 'blocks');
    const showReset = cfg().get('showResetTime', false);
    const iconName = w.icon;

    if (!w.hasData) {
      const blank = style === 'none' ? '' : ` ${bar(0, width, style)}`;
      item.text = `$(${iconName}) ${w.short}${blank} --`;
      item.backgroundColor = undefined;
      item.accessibilityInformation = { label: `Claude ${w.title} usage: no data yet`, role: 'button' };
    } else {
      const pct = Math.round(w.pct);
      const barText = style === 'none' ? '' : ` ${bar(w.pct, width, style)}`;
      const reset = showReset && w.resetsIn != null ? ` · ${duration(w.resetsIn)}` : '';
      item.text = `$(${iconName}) ${w.short}${barText} ${pct}%${reset}`;
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

  function buildTooltip(model) {
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = { enabledCommands: [CMD.refresh, CMD.details, CMD.settings] };
    md.supportThemeIcons = true;

    md.appendMarkdown(`**$(pulse) Claude usage**\n\n`);
    md.appendMarkdown(`| | Used | | Resets in |\n|:--|:--|--:|:--|\n`);
    for (const w of model.windows) {
      const meter = w.hasData ? `\`${bar(w.pct, 10, 'blocks')}\`` : '`' + bar(0, 10, 'blocks') + '`';
      const pct = w.hasData ? `**${Math.round(w.pct)}%**` : '--';
      const reset = w.resetsIn != null ? `${duration(w.resetsIn)} _(${w.resetsAtLabel})_` : '—';
      md.appendMarkdown(`| $(${LEVEL_ICON[w.level]}) ${w.title} | ${meter} | ${pct} | ${reset} |\n`);
    }
    // One plain-language line per headline window.
    const verdicts = model.windows.filter((w) => w.hasData)
      .map((w) => `$(${PACE_ICON[w.pace]}) **${w.title}: ${w.headline}.** ${w.detail}`);
    if (verdicts.length) md.appendMarkdown(`\n${verdicts.join('  \n')}\n`);

    const updated = model.updatedAt ? `Updated ${timeAgo(model.updatedAt)}` : 'Waiting for Claude Code status-line data';
    md.appendMarkdown(`\n---\n\n${updated} &nbsp;·&nbsp; [$(refresh) Reload](command:${CMD.refresh} "Read the latest local usage snapshot")`
      + ` &nbsp;·&nbsp; [$(dashboard) Details](command:${CMD.details} "Open the usage details panel")`
      + ` &nbsp;·&nbsp; [$(gear) Settings](command:${CMD.settings} "Open Claude Usage Bar settings")`);
    return md;
  }

  function render() {
    const model = buildModel();
    model.windows.forEach((w, i) => renderItem(items[i], w, model));
    if (UsagePanel.current) UsagePanel.current.update(model);
  }

  const showDetails = () => UsagePanel.show(buildModel, {
    refresh: render,
    openSettings: () => vscode.commands.executeCommand(CMD.settings),
  });

  fs.watchFile(STATE_FILE, { interval: 2000 }, render);
  const timer = setInterval(render, 15000);

  context.subscriptions.push(
    ...items,
    vscode.commands.registerCommand(CMD.refresh, render),
    vscode.commands.registerCommand(CMD.details, showDetails),
    vscode.commands.registerCommand(CMD.settings, () => vscode.commands.executeCommand('workbench.action.openSettings', 'claudeUsageBar')),
    vscode.commands.registerCommand(CMD.click, () => (cfg().get('clickAction', 'details') === 'refresh' ? render() : showDetails())),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('claudeUsageBar')) render(); }),
    { dispose: () => { clearInterval(timer); fs.unwatchFile(STATE_FILE, render); UsagePanel.current?.panel.dispose(); } }
  );

  render();
}

module.exports = { activate };
