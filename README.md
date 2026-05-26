# Hone — AI Writing Assistant for the Web

Hone is a Chrome Extension (Manifest V3) that provides AI-powered writing tools (grammar fix, tone change, expansion, etc.) for any text input or textarea on any website. It features a sophisticated editor abstraction layer and a robust transaction engine to support both native HTML inputs and complex rich-text frameworks.

---

## 🏗️ Architecture Overview

The project is structured into three main execution environments, coordinated via Chrome's messaging system and shared storage.

### 1. Content Script (`src/content/`)
Injected into every webpage. It handles UI rendering, user interaction, and editor manipulation.
- **Shadow DOM Isolation**: The UI is encapsulated in a Shadow Root to prevent style leaks. See [index.tsx](file:///disk2/desktop/extensions-A/src/content/index.tsx).
- **Adapter Pattern**: Abstracted interface for different editor types. See [adapters.ts](file:///disk2/desktop/extensions-A/src/content/adapters.ts).
- **Transaction Engine**: Sophisticated logic to inject text into rich-text editors (Slate, Lexical, etc.) without breaking their internal state. See [transaction-engine.ts](file:///disk2/desktop/extensions-A/src/content/transaction-engine.ts).
- **Positioning**: Calculates floating UI placement relative to the text caret. See [positioning.ts](file:///disk2/desktop/extensions-A/src/content/positioning.ts).

### 2. Background Service Worker (`src/background/`)
The extension's central nervous system.
- **AI Orchestration**: Routes prompts to OpenAI, Anthropic, Gemini, or OpenRouter. See [service-worker.ts](file:///disk2/desktop/extensions-A/src/background/service-worker.ts).
- **Retry Strategy**: Implements a cycle-based fallback for OpenRouter Free models.
- **Global Commands**: Listens for manifest-defined keyboard shortcuts.

### 3. Extension Pages (`src/popup/` & `src/options/`)
- **Popup**: Quick status view and toggle for the "Hone Dot". See [popup.tsx](file:///disk2/desktop/extensions-A/src/popup/popup.tsx).
- **Options**: Advanced configuration for API keys, Custom Actions, and Shortcut mapping. See [options.tsx](file:///disk2/desktop/extensions-A/src/options/options.tsx).

---

## 🛠️ Key Technical Deep-Dives

### **Editor Interaction (The "Nooks and Crannies")**
Interacting with web editors is the project's biggest challenge. Hone uses a tiered approach:
1. **Framework Detection**: [editor-detection.ts](file:///disk2/desktop/extensions-A/src/content/editor-detection.ts) identifies if an element is native, Lexical, Slate, or generic `contenteditable`.
2. **React Fiber Traversal**: To support editors like Discord (Slate), Hone traverses the React Fiber tree to find the internal `editor` instance. See `findSlateEditor` in [transaction-engine.ts](file:///disk2/desktop/extensions-A/src/content/transaction-engine.ts).
3. **Event Simulation**: Uses `beforeinput` with `insertReplacementText` or simulated `paste` events to ensure editors record the change in their undo/redo history.

### **AI Action System**
Actions are managed by the [ActionRegistry](file:///disk2/desktop/extensions-A/src/content/actions.ts).
- **Built-in Actions**: *Improve*, *Paraphrase*, *Fix Spelling*, *Tone Adjustments*, and *Length Adjustments*.
- **Custom Actions**: Users can define their own prompt templates (using `{{input}}` placeholders), models, and icons. These are stored in `chrome.storage.local`.

### **Data Persistence**
See [storage.ts](file:///disk2/desktop/extensions-A/src/content/storage.ts) for implementation.
- **Settings**: Stored in `chrome.storage.local`.
- **History**: Stored in **IndexedDB** to handle large volumes of previous rewrites efficiently.

---

## 🚀 Development & Build

### **Prerequisites**
- Node.js & npm
- Chrome/Edge browser

### **Scripts**
- `npm run dev`: Starts Vite dev server.
- `npm run build`: Full build of all entries (pages, background, content).
- `npm run build:background`: Build only the service worker.
- `npm run build:content`: Build only the content script.

### **Vite Multi-Entry Configuration**
The project uses a custom [vite.config.ts](file:///disk2/desktop/extensions-A/vite.config.ts) that handles different build targets (popup, options, background, content) using environment variables (e.g., `ENTRY=background`).

---

## 🎨 Design System
- **UI Components**: Built with [Radix UI](https://www.radix-ui.com/) and [Shadcn UI](https://ui.shadcn.com/).
- **Theming**: Tailwind CSS 4 with a "Dark Mode" first approach.
- **Icons**: [Lucide React](https://lucide.dev/).
- **Typography**: [Geist](https://vercel.com/font) and [Outfit](https://fonts.google.com/specimen/Outfit).

---

## 📂 Directory Map
- `src/assets/`: Static assets and icons.
- `src/components/`: Shared React components.
- `src/lib/`: Utility functions, icon rendering, and shortcut helpers.
- `src/content/`:
  - `app.tsx`: Main React controller for the injected UI.
  - `adapters.ts`: Editor-specific logic.
  - `transaction-engine.ts`: DOM/Framework mutation logic.
  - `keyboard-guard.ts`: Intercepts keys to prevent host-page interference.
- `src/background/`: Service worker logic.
