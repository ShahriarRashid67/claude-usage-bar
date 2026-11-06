# Changelog

## 1.2.0

- Install the VSIX and click **Connect** to set up the bundled helper from VS Code.
- **Connect** checks for Node.js first and explains how to get it if it's missing, instead of leaving the bars empty.
- Replacing a custom Claude Code status line requires approval. **Disconnect Claude Code** restores it.
- If the saved copy of your previous status line is missing, **Disconnect** can still remove the Claude Usage Bar status line.
- Connect keeps your other Claude Code settings as they are. On Windows, the settings file keeps its existing permissions.
- Requires VS Code 1.82 or newer.
- GitHub Releases now provide a single `claude-usage-bar.vsix` with a download link that always points to the newest version.

## 1.1.0

- The extension displays usage reported by Claude Code's documented status-line integration.
- The helper stores only usage percentages and reset times in a local cache. The extension reads the cache and updates the bars automatically.
- GitHub Releases provide the VSIX and the standalone helper together.
