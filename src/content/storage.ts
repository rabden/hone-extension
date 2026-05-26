/**
 * Storage utility for config caching and history management
 * Follows MV3 best practices: no in-memory state, all config in storage
 */

export interface ShortcutConfig {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export interface CustomAction {
  id: string
  name: string
  description?: string
  icon?: string
  color?: string
  promptTemplate: string
  systemPrompt?: string
  temperature?: number
  provider?: string
  model?: string
  shortcut?: ShortcutConfig
  category?: string
  replaceMode: 'replace' | 'preview'
  enabled: boolean
  createdAt: number
}

export interface Config {
  // Shortcuts
  shortcutKey?: string;
  shortcutCtrl?: boolean;
  shortcutAlt?: boolean;
  shortcutShift?: boolean;
  shortcutMeta?: boolean;
  shortcutAction?: string;

  dropdownShortcutKey?: string;
  dropdownShortcutCtrl?: boolean;
  dropdownShortcutAlt?: boolean;
  dropdownShortcutShift?: boolean;
  dropdownShortcutMeta?: boolean;

  // UI
  hideDot?: boolean;

  // API
  googleAiStudioKey?: string;
  googleAiStudioModel?: string;
  provider?: string;

  // Note: History is NOT stored here, use IndexedDB instead
}

const CONFIG_KEYS: (keyof Config)[] = [
  'shortcutKey',
  'shortcutCtrl',
  'shortcutAlt',
  'shortcutShift',
  'shortcutMeta',
  'shortcutAction',
  'dropdownShortcutKey',
  'dropdownShortcutCtrl',
  'dropdownShortcutAlt',
  'dropdownShortcutShift',
  'dropdownShortcutMeta',
  'hideDot',
  'googleAiStudioKey',
  'googleAiStudioModel',
  'provider',
];

/**
 * Load configuration from chrome.storage.local
 * Use this instead of in-memory state in service workers
 */
export async function loadConfig(): Promise<Config> {
  return new Promise((resolve) => {
    chrome.storage.local.get(CONFIG_KEYS, (result) => {
      resolve(result as Config);
    });
  });
}

/**
 * Save configuration to chrome.storage.local
 */
export async function saveConfig(config: Partial<Config>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(config, () => {
      resolve();
    });
  });
}

/**
 * Get a single config value
 */
export async function getConfigValue<K extends keyof Config>(
  key: K
): Promise<Config[K] | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] as Config[K]);
    });
  });
}

/**
 * Watch for config changes and call callback
 */
export function onConfigChanged(
  callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    namespace: string
  ) => {
    if (namespace === 'local') {
      // Only notify if config keys changed
      const hasConfigChanges = Object.keys(changes).some((key) =>
        CONFIG_KEYS.includes(key as keyof Config)
      );
      if (hasConfigChanges) {
        callback(changes);
      }
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return cleanup function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

const CUSTOM_ACTIONS_KEY = 'customActions';

export async function loadCustomActions(): Promise<CustomAction[]> {
  const result = await chrome.storage.local.get(CUSTOM_ACTIONS_KEY);
  return (result[CUSTOM_ACTIONS_KEY] as CustomAction[]) || [];
}

export async function saveCustomAction(action: CustomAction): Promise<void> {
  const actions = await loadCustomActions();
  const idx = actions.findIndex((a) => a.id === action.id);
  if (idx >= 0) {
    actions[idx] = action;
  } else {
    actions.push(action);
  }
  await chrome.storage.local.set({ [CUSTOM_ACTIONS_KEY]: actions });
}

export async function deleteCustomAction(id: string): Promise<void> {
  const actions = await loadCustomActions();
  await chrome.storage.local.set({
    [CUSTOM_ACTIONS_KEY]: actions.filter((a) => a.id !== id),
  });
}

/**
 * IndexedDB utilities for history (keep storage.local for settings only)
 */
const DB_NAME = 'AIAssistantDB';
const HISTORY_STORE = 'history';
const DB_VERSION = 1;

export interface HistoryEntry {
  id?: number;
  action: string;
  originalText: string;
  resultText: string;
  timestamp: number;
  url: string;
}

/**
 * Open or create the IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const store = db.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

/**
 * Add history entry to IndexedDB
 */
export async function addHistoryEntry(entry: Omit<HistoryEntry, 'id'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([HISTORY_STORE], 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.add(entry);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as number);
  });
}

/**
 * Get history entries (with optional filtering)
 */
export async function getHistory(
  options?: {
    limit?: number;
    url?: string;
    startTime?: number;
  }
): Promise<HistoryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([HISTORY_STORE], 'readonly');
    const store = transaction.objectStore(HISTORY_STORE);

    let request: IDBRequest;
    if (options?.url) {
      const index = store.index('url');
      request = index.getAll(options.url);
    } else {
      request = store.getAll();
    }

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      let results = (request.result as HistoryEntry[]) || [];

      // Filter by timestamp if provided
      if (options?.startTime) {
        results = results.filter((entry) => entry.timestamp >= options.startTime!);
      }

      // Limit results
      if (options?.limit) {
        results = results.slice(-options.limit);
      }

      resolve(results);
    };
  });
}

/**
 * Clear all history from IndexedDB
 */
export async function clearHistory(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([HISTORY_STORE], 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}
