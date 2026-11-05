// Small, dependency-free formatting helpers shared by the status bar,
// the tooltip and the details panel.

const nowSec = () => Math.floor(Date.now() / 1000);

const BAR_STYLES = {
  blocks: ['▰', '▱'],
  shades: ['█', '░'],
  dots: ['●', '○'],
  squares: ['■', '□'],
};

/** Text progress bar, e.g. "▰▰▰▱▱▱". Returns '' for the "none" style. */
function bar(pct, width, style = 'blocks') {
  const glyphs = typeof style === 'string' && Object.hasOwn(BAR_STYLES, style)
    ? BAR_STYLES[style]
    : null;
  if (!glyphs) return '';
  const filled = Math.round((clamp(pct, 0, 100) / 100) * width);
  return glyphs[0].repeat(filled) + glyphs[1].repeat(width - filled);
}

/** Compact duration: "3d 4h", "2h 13m", "45m", "<1m". */
function duration(sec) {
  let s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return '<1m';
}

/** Spoken duration for screen readers: "2 hours 13 minutes". */
function durationLong(sec) {
  let s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86400);
  s %= 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const part = (n, unit) => (n ? `${n} ${unit}${n === 1 ? '' : 's'}` : '');
  return [part(d, 'day'), part(h, 'hour'), d ? '' : part(m, 'minute')].filter(Boolean).join(' ') || 'less than a minute';
}

function timeAgo(epoch) {
  const s = Math.max(0, nowSec() - epoch);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Friendly wall-clock time: "today 4:30 PM", "tomorrow 9:00 AM", "Fri 9:00 AM". */
function friendlyTime(epoch) {
  const d = new Date(epoch * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (dayDiff === 0) return `today ${time}`;
  if (dayDiff === 1) return `tomorrow ${time}`;
  if (dayDiff > 1 && dayDiff < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

module.exports = { nowSec, bar, duration, durationLong, timeAgo, friendlyTime, clamp };
