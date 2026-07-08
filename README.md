# LECTURA Extension

A Chrome/Edge browser extension for language learners. Select, save, and review vocabulary words and sentences from any webpage — **fully offline, no API keys needed**.

## Features

- **Instant Local Dictionary**: ~50,000 words from [ECDICT](https://github.com/skywind3000/ECDICT) (MIT License), covering CET-4/6, TOEFL, IELTS, GRE, and more
- **Smart Selection**: Select any text — words (≤6 words) get dictionary lookup, sentences (≥7 words) saved as-is
- **Inflection Handling**: Automatically resolves past tense, plural, and other word forms to their base form
- **Frosted Glass Popup**: Beautiful semi-transparent popup with dictionary results
- **Persistent Highlighting**: All saved words are highlighted across all webpages you visit
- **Macaron Color Coding**: Assign one of 6 macaron colors to categorize your vocabulary
- **Mastered Tracking**: Mark words as mastered — their highlight style changes to a subtle underline
- **Side Panel**: Browse, edit, reorder, and export your collection in a clean card-based interface
- **Export**: Export as JSON, CSV, or Anki-compatible CSV
- **100% Local**: All data stays on your computer. Works completely offline.

## Setup

### 1. Build the Dictionary

First, generate the local dictionary file:

```bash
cd LECTURA-extension
node scripts/build-dict.js
```

This downloads the ECDICT CSV (~80MB), filters to ~50,000 commonly-used and exam-relevant words, and outputs a compact JSON file (~2-3MB) to `shared/ecdict-filtered.json`.

### 2. Load the Extension

#### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `LECTURA-extension` folder

#### Edge
1. Open `edge://extensions/`
2. Enable "Developer mode" (bottom left)
3. Click "Load unpacked"
4. Select the `LECTURA-extension` folder

### 3. Start Learning

1. Browse the web as normal
2. **Select** a word you want to learn
3. A frosted glass popup appears with instant dictionary results
4. Click **☆** to save, optionally pick a macaron color
5. Click the extension icon to open the **Side Panel** and review your collection

## Dictionary Data

LECTURA uses the [ECDICT](https://github.com/skywind3000/ECDICT) open-source English-Chinese dictionary:

| Field | Description |
|-------|-------------|
| Word + Phonetic | UK IPA notation |
| Part of Speech | `n.`, `v.`, `adj.`, `adv.`, etc. |
| Chinese Definitions | One per line |
| Exam Tags | `CET-4`, `CET-6`, `TOEFL`, `IELTS`, `GRE`, `中考`, `高考` |
| Collins Stars | 1-5 star word frequency rating |
| Oxford 3000 | Core English vocabulary indicator |
| Word Forms | Past tense, plural, comparative, etc. |

## Usage Tips

| Action | How |
|--------|-----|
| Select text | Mouse drag or double-click any word on a webpage |
| Save | Click ☆ in the popup (pick a color first if desired) |
| Mark mastered | Click ✅ in the popup or ○ in the side panel card |
| View collection | Click the LECTURA icon in the toolbar |
| Edit a card | Right-click a card → Edit |
| Change card color | Right-click a card → pick a color |
| Delete a card | Right-click a card → Delete |
| Reorder cards | Drag the ⋮⋮ handle on the left of each card |
| Batch operations | Click ☑ in the toolbar, select cards, use batch bar |
| Export data | Click 📤 in the toolbar, choose format |
| Toggle definitions | Click 👁 in the toolbar to hide/show definitions |
| Font size | Use A- / A+ buttons in the toolbar |

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save your word collection locally |
| `unlimitedStorage` | Room for the dictionary database and your vocabulary |
| `activeTab` | Detect text selection on the current tab |
| `sidePanel` | Show the card collection in the browser sidebar |
| `<all_urls>` | Highlight saved words on all webpages |

## Privacy

- **No network requests** — all dictionary lookups are local (IndexedDB)
- **No accounts**, no analytics, no tracking
- All data stored in your browser using `chrome.storage.local` and IndexedDB
- No external servers involved at all

## Project Structure

```
LECTURA-extension/
├── manifest.json
├── scripts/
│   └── build-dict.js         # Build script: CSV → filtered JSON
├── background/
│   ├── service-worker.js     # Message router + dictionary init
│   ├── dictionary.js         # IndexedDB dictionary engine
│   └── storage.js            # chrome.storage.local CRUD
├── content/
│   ├── content.js            # Main content script entry
│   ├── content.css
│   ├── popup/                # Frosted glass popup (Shadow DOM)
│   ├── highlight/            # Trie-based text highlighting
│   └── selection/            # Text selection + XPath anchoring
├── sidepanel/                # Side panel (cards, toolbar, export)
├── settings/                 # Options page (preferences, data mgmt)
├── shared/                   # Utilities (Trie, colors, constants)
│   ├── ecdict-filtered.json  # Generated dictionary data
│   └── ecdict-inflections.json
└── icons/
```

## License

MIT
