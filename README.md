# Claude Usage Bar

See how much of your Claude Code 5-hour and 7-day limits you've used in the VS Code status bar. Hover over either bar for reset times, or click it to see how your usage pace compares with the time left.

![Claude Usage Bar in VS Code at normal, high, and critical usage levels](images/states.png)

**[Download the latest release](https://github.com/ShahriarRashid67/claude-usage-bar/releases/latest)**

## Install

You need VS Code 1.80 or newer, [Claude Code](https://code.claude.com/docs/en/setup) signed in with a subscription that reports usage limits, and [Node.js](https://nodejs.org/) available in your terminal. Claude Code and VS Code should run under the same local user account.

### 1. Install the VS Code extension

Under **Assets** on the release page, download `claude-usage-bar-*.vsix` and `claude-usage-bar-statusline.cjs`.

In VS Code, open **Extensions**, choose **⋯ → Install from VSIX…**, then select the downloaded VSIX.

If you installed the old 1.0.0 local build, uninstall it first. The GitHub release has a new publisher ID, so VS Code treats it as a separate extension.

### 2. Connect Claude Code

1. Move `claude-usage-bar-statusline.cjs` to your home folder. That's `%USERPROFILE%` on Windows and `~` on macOS and Linux.
2. Open Claude Code's user settings file in a text editor. The default location is `%USERPROFILE%\.claude\settings.json` on Windows or `~/.claude/settings.json` on macOS and Linux. Create the file if needed.
3. If the file is empty, paste the JSON below. If it already has settings, add the `statusLine` entry inside the existing outer braces and separate it from the other entries with a comma. If you already use a custom status line, keep a copy of that entry before switching. This helper becomes the status line and shows the usage percentages there too.

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/claude-usage-bar-statusline.cjs"
  }
}
```

4. Start a new Claude Code terminal session, send a message, and wait for the response. When Claude Code reports your limits, the two bars in VS Code update automatically.

### 3. Read the bars

- **5h** is your short-term usage window. **7d** is your weekly window. The percentages show how much of each limit you've used.
- The default warnings are yellow at **70%** and red at **90%**. Search VS Code settings for **Claude Usage Bar** to change the thresholds or how the bars look.
- **Ahead of pace** means the current rate of use would reach the limit before the window resets. The estimate changes as your usage changes.

## If a bar shows `--`

| What you see | What to check |
| --- | --- |
| Both bars show `--` | Run `node --version` in the terminal where you launch Claude Code. Check the helper filename and home folder, then send a message in a new Claude Code terminal session. |
| One bar shows `--` | Claude Code can report either usage window independently. The missing bar fills in when Claude Code supplies its numbers. |
| The numbers look old | Send a message in the terminal session with the helper enabled. **Reload Local Usage** in VS Code rereads the last snapshot. New usage comes from Claude Code. |

The helper uses Claude Code's [documented status-line usage fields](https://code.claude.com/docs/en/statusline#rate-limit-usage). Claude Code supplies them after an API response on eligible plans. A chat-only session that doesn't run the status line won't update the bars.

## Privacy

The helper keeps only the usage percentages, reset times, and last update time in `~/.claude-usage-bar/usage.json`. The extension reads that file. The extension and helper run locally, make no network requests, and never read Claude credentials.

## Update or uninstall

To update, install the latest VSIX and replace the helper in your home folder with the one from the same release.

To uninstall, remove the extension in VS Code. Remove the `statusLine` entry from Claude Code settings or restore your previous entry, then delete the helper and `~/.claude-usage-bar/usage.json`.

## Build from source

With Node.js 22 or newer, open a terminal in the repository folder and run these commands.

```sh
npm ci --ignore-scripts
npm exec -- vsce package --no-dependencies --allow-missing-repository --no-rewrite-relative-links
```

Install the generated VSIX and use the copy of `claude-usage-bar-statusline.cjs` from this repository. For maintainers, pushing a version tag that matches `package.json` triggers the GitHub release workflow. For this version, use `v1.1.0`.

Unofficial community project. MIT licensed.
