const fs = require('node:fs');
const path = require('node:path');
const { STATE_FILE, normalizeWindow } = require('../claude-usage-bar-statusline.cjs');
const { nowSec, duration, clamp } = require('./format');

const MAX_STATE_BYTES = 4096;

const HOUR = 3600;
const DAY = 24 * HOUR;

/** The two headline windows, in display order. */
const WINDOWS = [
  { key: 'five_hour', short: '5h', title: '5-hour', subtitle: 'Session limit · rolling 5 hours', icon: 'clock', length: 5 * HOUR },
  { key: 'seven_day', short: '7d', title: '7-day', subtitle: 'Weekly limit · rolling 7 days', icon: 'calendar', length: 7 * DAY },
];

function readState() {
  let fd;
  try {
    if (!fs.lstatSync(path.dirname(STATE_FILE)).isDirectory() ||
        !fs.lstatSync(STATE_FILE).isFile()) return null;
    const { O_RDONLY, O_NOFOLLOW = 0, O_NONBLOCK = 0 } = fs.constants;
    fd = fs.openSync(STATE_FILE, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    if (!fs.fstatSync(fd).isFile()) return null;
    const buffer = Buffer.alloc(MAX_STATE_BYTES + 1);
    const bytes = fs.readSync(fd, buffer);
    if (bytes > MAX_STATE_BYTES) return null;
    const snapshot = JSON.parse(buffer.toString('utf8', 0, bytes));
    const updated_at = snapshot?.updated_at;
    return {
      updated_at: Number.isSafeInteger(updated_at) && updated_at > 0 && updated_at <= nowSec() ? updated_at : null,
      five_hour: normalizeWindow(snapshot?.five_hour),
      seven_day: normalizeWindow(snapshot?.seven_day),
    };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Turn a raw window into everything the UI needs to explain it.
 *
 * level: how full the window is   -> 'none' | 'ok' | 'warn' | 'critical'
 * pace:  whether it will last     -> 'none' | 'idle' | 'early' | 'under' | 'over' | 'limit'
 */
function analyze(win, length, thresholds) {
  const { warn = 70, critical = 90 } = thresholds || {};
  const now = nowSec();

  if (!win || win.used_percentage == null || !Number.isFinite(win.used_percentage)) {
    return { hasData: false, level: 'none', pace: 'none', pct: null, headline: 'No data yet', detail: 'Send a message in Claude Code. This fills in after Claude replies.' };
  }

  const expired = win.resets_at <= now;
  const pct = expired ? 0 : clamp(win.used_percentage, 0, 100);
  const resetsAt = expired ? null : win.resets_at;
  const resetsIn = resetsAt ? resetsAt - now : null;
  const elapsed = resetsAt ? clamp(length - resetsIn, 0, length) : null;
  const elapsedPct = elapsed != null ? (elapsed / length) * 100 : null;

  const level = pct >= critical ? 'critical' : pct >= warn ? 'warn' : 'ok';
  const base = { hasData: true, expired, pct, resetsAt, resetsIn, elapsedPct, level, runsOutIn: null };

  if (pct >= 100) {
    return { ...base, pace: 'limit', headline: 'Limit reached',
      detail: resetsIn != null ? `You can use Claude again in ${duration(resetsIn)}.` : 'Wait for the window to reset.' };
  }
  if (!resetsAt) {
    return { ...base, pace: 'idle', headline: expired ? 'Window has reset' : 'Not started',
      detail: 'A new window starts with your next message.' };
  }
  // Too early in the window to extrapolate meaningfully.
  if (elapsed < Math.max(10 * 60, length * 0.03) || pct <= 0) {
    return { ...base, pace: 'early', headline: 'Plenty of room',
      detail: `${Math.round(100 - pct)}% left, ${duration(resetsIn)} until reset.` };
  }

  const ratePerSec = pct / elapsed;
  const runsOutIn = (100 - pct) / ratePerSec;
  if (runsOutIn < resetsIn) {
    return { ...base, runsOutIn, pace: 'over', headline: 'Ahead of pace',
      detail: `At this rate you'll hit the limit in ~${duration(runsOutIn)}, about ${duration(resetsIn - runsOutIn)} before it resets.` };
  }
  return { ...base, runsOutIn, pace: 'under', headline: 'On track',
    detail: `At this rate your usage lasts until the reset in ${duration(resetsIn)}.` };
}

module.exports = { STATE_FILE, WINDOWS, readState, analyze };
