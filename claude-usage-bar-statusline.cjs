// Run by Claude Code's status line to share subscription usage with VS Code.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STATE_DIR = path.join(os.homedir(), '.claude-usage-bar');
const STATE_FILE = path.join(STATE_DIR, 'usage.json');
const MAX_INPUT_BYTES = 1024 * 1024;

function normalizeWindow(window) {
  const used = window?.used_percentage;
  const reset = window?.resets_at;
  if (!Number.isFinite(used) || used < 0 || used > 100) return null;
  if (!Number.isSafeInteger(reset) || reset <= 0 || reset > 8640000000000) return null;
  return { used_percentage: used, resets_at: reset };
}

function writeSnapshot(snapshot) {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const dir = fs.lstatSync(STATE_DIR);
  if (!dir.isDirectory() || (process.getuid && (dir.uid !== process.getuid() || (dir.mode & 0o077)))) {
    throw new Error('Usage cache directory must be private.');
  }

  // Replace the directory entry rather than writing through an existing link.
  const stagingDir = fs.mkdtempSync(path.join(STATE_DIR, '.write-'));
  const staged = path.join(stagingDir, 'usage.json');
  try {
    fs.writeFileSync(staged, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
    fs.renameSync(staged, STATE_FILE);
  } finally {
    try { fs.unlinkSync(staged); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.rmdirSync(stagingDir);
  }
}

async function main() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) return;
    chunks.push(chunk);
  }

  let limits;
  try { limits = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.rate_limits; }
  catch { return; }
  const five_hour = normalizeWindow(limits?.five_hour);
  const seven_day = normalizeWindow(limits?.seven_day);
  if (!five_hour && !seven_day) return;

  const summary = [
    five_hour && `5h ${Math.round(five_hour.used_percentage)}%`,
    seven_day && `7d ${Math.round(seven_day.used_percentage)}%`,
  ].filter(Boolean).join('  |  ');
  console.log(summary);
  writeSnapshot({ updated_at: Math.floor(Date.now() / 1000), five_hour, seven_day });
}

function run() {
  main().catch(() => {
    console.error('Claude Usage Bar could not update its local usage file.');
    process.exitCode = 1;
  });
}

if (require.main === module) run();

module.exports = { STATE_FILE, normalizeWindow, run };
