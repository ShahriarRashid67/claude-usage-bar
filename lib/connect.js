const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');

const HELPER_SOURCE = path.join(__dirname, '..', 'claude-usage-bar-statusline.cjs');
const HELPER_DIR = path.join(os.homedir(), '.claude-usage-bar');
const HELPER_PATH = path.join(HELPER_DIR, 'statusline.cjs');
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.isAbsolute(CLAUDE_DIR) ? path.join(CLAUDE_DIR, 'settings.json') : null;
const LEGACY_COMMAND = 'node ~/claude-usage-bar-statusline.cjs';
// Resolve the home folder in Node. Windows PowerShell passes ~ literally to native commands.
const MANAGED_COMMAND = `node -e "require(require('node:os').homedir()+'/.claude-usage-bar/statusline.cjs').run()"`;
const MANAGED_ID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX_FILE_BYTES = 1024 * 1024;
// The helper uses `node:` imports and optional chaining, which need Node.js 16 or newer.
const MIN_NODE_MAJOR = 16;

// On POSIX the folder must be owned by this user and closed to everyone else. On Windows
// it lives in the user profile and inherits its permissions, which keep other users out.
function isPrivateDir(stat) {
  if (!stat?.isDirectory()) return false;
  return !process.getuid || (stat.uid === process.getuid() && !(stat.mode & 0o077));
}

function ensurePrivateDir() {
  fs.mkdirSync(HELPER_DIR, { recursive: true, mode: 0o700 });
  if (!isPrivateDir(fs.lstatSync(HELPER_DIR))) {
    throw new Error('The Claude Usage Bar folder must be a private folder owned by your user account.');
  }
}

function atomicWrite(file, contents, beforeReplace) {
  const staged = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(staged, contents, { flag: 'wx', mode: 0o600 });
  try {
    beforeReplace?.();
    fs.renameSync(staged, file);
  } finally {
    try { fs.unlinkSync(staged); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

/** Rewrite a file's contents without replacing the file, so it keeps its permissions and attributes. */
function overwriteInPlace(file, contents) {
  const bytes = Buffer.from(contents, 'utf8');
  const fd = fs.openSync(file, 'r+');
  try {
    fs.writeSync(fd, bytes, 0, bytes.length, 0);
    fs.ftruncateSync(fd, bytes.length);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function installHelper() {
  ensurePrivateDir();
  const source = fs.readFileSync(HELPER_SOURCE);
  const current = fs.lstatSync(HELPER_PATH, { throwIfNoEntry: false });
  if (current?.isFile() && current.size === source.length && fs.readFileSync(HELPER_PATH).equals(source)) return;
  atomicWrite(HELPER_PATH, source);
}

function readSettings() {
  if (!SETTINGS_FILE) throw new Error('CLAUDE_CONFIG_DIR must be an absolute path.');
  const file = fs.lstatSync(SETTINGS_FILE, { throwIfNoEntry: false });
  if (!file) return { text: null, data: {} };
  if (file.isSymbolicLink()) {
    throw new Error('Claude Code settings.json is a link, for example one made by a dotfiles tool. Claude Usage Bar only edits regular files.');
  }
  if (!file.isFile() || file.size > MAX_FILE_BYTES) {
    throw new Error('Claude Code settings must be a regular JSON file under 1 MB.');
  }
  const text = fs.readFileSync(SETTINGS_FILE, 'utf8');
  const json = text.replace(/^﻿/, '').trim();
  if (!json) return { text, data: {} };

  let data;
  try { data = JSON.parse(json); }
  catch { throw new Error('Claude Code settings contain invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Claude Code settings must contain a JSON object.');
  }
  return { text, data };
}

function writeSettings(snapshot, data) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true, mode: 0o700 });
  const contents = JSON.stringify(data, null, 2) + '\n';
  const unchanged = () => {
    if (readSettings().text !== snapshot.text) {
      throw new Error('Claude Code settings changed during setup. Try again.');
    }
  };
  // On Windows, renaming a new file over settings.json would drop the old file's
  // permissions and attributes, so an existing file is rewritten in place instead.
  if (process.platform === 'win32' && snapshot.text !== null) {
    unchanged();
    overwriteInPlace(SETTINGS_FILE, contents);
  } else {
    atomicWrite(SETTINGS_FILE, contents, unchanged);
  }
}

function managedId(line) {
  const prefix = MANAGED_COMMAND + ' ';
  if (line?.type !== 'command' || typeof line.command !== 'string' || !line.command.startsWith(prefix)) return;
  const id = line.command.slice(prefix.length);
  if (id.length === 36 && MANAGED_ID_PATTERN.test(id)) return id;
}

function isLegacy(line) {
  return line?.type === 'command' && line.command === LEGACY_COMMAND;
}

function status() {
  try {
    const line = readSettings().data.statusLine;
    if (managedId(line)) return { state: 'connected' };
    if (isLegacy(line)) return { state: 'legacy', ready: fs.existsSync(path.join(os.homedir(), 'claude-usage-bar-statusline.cjs')) };
    return line == null ? { state: 'none' } : { state: 'other', line };
  } catch (error) {
    return { state: 'error', error: error.message };
  }
}

/**
 * Claude Code runs the helper with `node`, so check that VS Code can find a recent one.
 * Resolves to { ok, version }, where version is null when no node was found.
 */
function checkNode() {
  return new Promise((resolve) => {
    execFile('node', ['--version'], { cwd: os.homedir(), windowsHide: true, timeout: 5000 }, (error, stdout) => {
      const version = error ? null : String(stdout).trim();
      const major = Number(/^v(\d+)\./.exec(version || '')?.[1]);
      resolve({ ok: major >= MIN_NODE_MAJOR, version });
    });
  });
}

function refreshHelperIfInstalled() {
  if (status().state === 'connected') installHelper();
}

function connect(approvedLine) {
  const snapshot = readSettings();
  const line = snapshot.data.statusLine;
  if (managedId(line)) {
    installHelper();
    return;
  }

  if (line != null && !isLegacy(line) && JSON.stringify(line) !== JSON.stringify(approvedLine)) {
    throw new Error('The current Claude Code status line needs your approval before it can be replaced. Try Connect again.');
  }

  installHelper();
  const id = randomUUID();
  const backup = path.join(HELPER_DIR, id + '.json');
  const previous = isLegacy(line) ? undefined : line;
  fs.writeFileSync(backup, JSON.stringify({ settingsFile: SETTINGS_FILE, previous }), { flag: 'wx', mode: 0o600 });
  try {
    const statusLine = { type: 'command', command: MANAGED_COMMAND + ' ' + id };
    if (isLegacy(line) && line.padding != null) statusLine.padding = line.padding;
    writeSettings(snapshot, { ...snapshot.data, statusLine });
  } catch (error) {
    fs.unlinkSync(backup);
    throw error;
  }
}

/** The saved copy of the status line that Connect replaced, or null if it's missing or can't be trusted. */
function readRecord(file) {
  try {
    if (!isPrivateDir(fs.lstatSync(HELPER_DIR, { throwIfNoEntry: false }))) return null;
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return saved?.settingsFile === SETTINGS_FILE ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Remove the managed status line and restore the one it replaced.
 * If the saved copy is missing, throws an error with code 'NO_RECORD' unless `force` is
 * set, in which case the status line is simply removed.
 */
function disconnect({ force = false } = {}) {
  const snapshot = readSettings();
  const id = managedId(snapshot.data.statusLine);
  if (!id) return 'not-connected';

  const backup = path.join(HELPER_DIR, id + '.json');
  const saved = readRecord(backup);
  if (!saved && !force) {
    const error = new Error('The saved copy of your previous Claude Code status line is missing, so it can\'t be restored.');
    error.code = 'NO_RECORD';
    throw error;
  }

  const data = { ...snapshot.data };
  if (saved && Object.hasOwn(saved, 'previous')) data.statusLine = saved.previous;
  else delete data.statusLine;
  writeSettings(snapshot, data);
  try { fs.unlinkSync(backup); } catch {}
  return saved?.previous == null ? 'removed' : 'restored';
}

module.exports = { SETTINGS_FILE, status, checkNode, connect, disconnect, refreshHelperIfInstalled };
