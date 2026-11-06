// Runs when the extension is uninstalled (package.json "vscode:uninstall").
// Puts Claude Code's previous status line back so nothing is left pointing at
// a helper the user no longer wants. If the saved copy of that line is gone,
// the managed line is removed anyway. Never throws: uninstall must not fail.
try {
  require('./lib/connect.js').disconnect({ force: true });
} catch {}
