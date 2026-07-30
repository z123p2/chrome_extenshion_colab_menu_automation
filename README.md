# Colab Menu Automation

🌐 **English** | [Русский](README.ru.md)

Chrome extension that automates Google Colab menu actions: delete runtime, switch to T4 GPU, open notebooks, and run all cells - with a single click.

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome_extenshion_colab_menu_automation` folder

## Toolbar buttons

After loading a Colab notebook, the extension adds buttons to the top toolbar:

| Button | What it does |
|---|---|
| 🗑 **Откл+удалить** | Runtime → Disconnect & delete → Confirm |
| 🟢 **Открыть+** | File → Upload notebook → Select file → **after reload**: switch to T4 → Run all |
| 🔄 **T4 GPU** | Runtime → Change runtime type → T4 GPU → Save |
| 📂 **Открыть** | File → Upload notebook → Select file |
| ▶ **T4 + Вып. всё** | Switch to T4 GPU → Run all cells |
| ⬇ **Скачать .ipynb** | File → Download → Download .ipynb |

Hover over any button to see its full menu path.

### Cross-reload automation

The **Open+** button survives a page reload. After you select a file in the system dialog, Colab reloads the page with the new notebook. The extension detects this, switches the runtime to T4, and executes all cells - fully automatic.

## Popup features

Click the extension icon in the toolbar to open the popup:

- **Scan menus** - recursively scans all Colab menus, dialogs, and submenus; exports to JSON
- **Inject/remove toolbar buttons** - toggle the custom toolbar on and off
- **Close menus** - close any open menu with Escape
- **Logs** - download, clear, and toggle logging on/off
- **DOM snapshot** - dump visible element tree for debugging
- **Theme** - choose Light, Dark, or System theme

## Project structure

```
├── manifest.json     - Chrome Extension manifest (Manifest V3)
├── content.js        - main automation logic (menu navigation, dialog handling, toolbar)
├── popup.html        - popup UI
├── popup.js          - popup logic (scan, logs, themes, messaging)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── README.ru.md
└── LICENSE
```

## How it works

- **Menu navigation**: opens a top menu (e.g. "Файл"), then uses keyboard simulation (ArrowDown + Enter) to select items. Submenus use a click-to-open + polling approach.
- **Dialog detection**: probes 18+ CSS selectors including shadow DOM (`mwc-dialog`, `jp-dialog`, etc.) with polling up to 5 seconds.
- **MWC radio selection**: traverses shadow roots to find native `<input type="radio">` and toggles it directly.
- **File dialog**: uses native `.click()` only - no synthetic events - which prevents the dialog from reopening.
- **Persistence**: `chrome.storage.local` stores a pending action flag for cross-reload automation. The flag expires after 60 seconds and is deleted immediately after reading.
- **No background activity**: all observers are short-lived (max 5s) and disconnect after use. No `setInterval`, no background polling, no DOM watchers outside automation runs.

## License

[MIT](LICENSE)
