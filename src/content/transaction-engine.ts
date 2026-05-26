/**
 * Commits AI text into framework editors as a transaction (not raw DOM writes).
 * Discord/Slate: editor.insertText only — execCommand causes ghost DOM state.
 * WhatsApp/Lexical: insertReplacementText beforeinput.
 */

import { detectEditorFramework, resolveEditorRoot } from "./editor-detection";
import {
  extractPlainText,
  selectPlainTextRange,
  setDomSelectionByOffsets,
} from "./plain-text-dom";

export interface TransactionContext {
  root: HTMLElement;
  replacement: string;
  start: number;
  end: number;
  beforeText: string;
  expectedSlice: string;
  framework: ReturnType<typeof detectEditorFramework>;
}

export interface TransactionResult {
  committed: boolean;
  /** 0–1 — low means DOM looks ok but commit may not persist (e.g. Discord) */
  confidence: number;
  /** Copy to clipboard and ask user to Ctrl+V */
  suggestClipboardPaste: boolean;
}

type SlateEditor = {
  insertText: (text: string) => void;
  deleteFragment?: () => void;
  onChange?: () => void;
  children?: unknown[];
};

function getReactFiber(dom: Element): unknown | null {
  const el = dom as unknown as Record<string, unknown>;
  const key = Object.keys(el).find(
    (k) =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$"),
  );
  return key ? el[key] : null;
}

export function findSlateEditor(host: HTMLElement): {
  editor: SlateEditor;
  slateRoot: HTMLElement;
} | null {
  const slateRoot =
    (host.closest("[data-slate-editor='true']") as HTMLElement | null) ??
    (host.querySelector("[data-slate-editor='true']") as HTMLElement | null);

  if (!slateRoot) return null;

  const fiber = getReactFiber(slateRoot);
  if (!fiber || typeof fiber !== "object") return null;

  const queue: unknown[] = [fiber];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);

    const f = node as Record<string, unknown>;
    const props = f.memoizedProps as Record<string, unknown> | undefined;
    const candidate =
      (props?.editor as SlateEditor | undefined) ??
      ((props?.children as Record<string, unknown> | undefined)?.props as
        | Record<string, unknown>
        | undefined)?.editor as SlateEditor | undefined;

    if (
      candidate &&
      typeof candidate.insertText === "function" &&
      Array.isArray(candidate.children)
    ) {
      return { editor: candidate, slateRoot };
    }

    if (f.child) queue.push(f.child);
    if (f.sibling) queue.push(f.sibling);
    if (f.return) queue.push(f.return);
  }

  return null;
}

function syncSelectionChange(): void {
  document.dispatchEvent(new Event("selectionchange"));
}

function normalizePlain(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

async function verifyDomReplace(ctx: TransactionContext, maxWaitMs = 150): Promise<boolean> {
  const startTime = performance.now();

  while (performance.now() - startTime < maxWaitMs) {
    const after = extractPlainText(ctx.root);
    const expected =
      ctx.beforeText.substring(0, ctx.start) +
      ctx.replacement +
      ctx.beforeText.substring(ctx.end);
    const oldPart = ctx.expectedSlice;

    if (after === expected || normalizePlain(after) === normalizePlain(expected)) {
      return true;
    }

    if (
      oldPart.length > 0 &&
      ctx.replacement.length > 0 &&
      after.includes(oldPart) &&
      after.includes(ctx.replacement)
    ) {
      // Still showing old part AND new replacement? 
      // This might mean it was appended instead of replaced.
    }

    const probe = ctx.replacement.trim().slice(0, Math.min(48, ctx.replacement.length));
    if (!probe) return true;

    if (after.includes(probe) && (!oldPart || !after.includes(oldPart))) {
      return true;
    }

    // Yield execution to allow the host page's renderer to update the DOM
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  return false;
}

function prepareDomSelection(ctx: TransactionContext): void {
  const { root, start, end, expectedSlice } = ctx;
  root.focus({ preventScroll: true });

  if (
    !selectPlainTextRange(root, start, end, expectedSlice, { focus: true }) &&
    !setDomSelectionByOffsets(root, start, end, { focus: true })
  ) {
    setDomSelectionByOffsets(root, start, end, { focus: true });
  }

  syncSelectionChange();
}

/** Slate/React: commit via internal editor API (Discord). No execCommand here. */
async function commitViaSlateApi(ctx: TransactionContext): Promise<boolean> {
  const found = findSlateEditor(ctx.root);
  if (!found) return false;

  const { editor, slateRoot } = found;
  prepareDomSelection({ ...ctx, root: slateRoot });

  try {
    if (
      ctx.end > ctx.start &&
      typeof editor.deleteFragment === "function"
    ) {
      editor.deleteFragment();
    }
    editor.insertText(ctx.replacement);
    editor.onChange?.();
    syncSelectionChange();
    return await verifyDomReplace({ ...ctx, root: slateRoot });
  } catch {
    return false;
  }
}

/** 
 * Slate/React: Bridge to Main World to access React Fiber.
 * Necessary because Content Scripts are in an Isolated World.
 */
async function commitViaMainWorldSlate(ctx: TransactionContext): Promise<boolean> {
  const slateRoot =
    (ctx.root.closest("[data-slate-editor='true']") as HTMLElement | null) ??
    (ctx.root.querySelector("[data-slate-editor='true']") as HTMLElement | null);

  if (!slateRoot) return false;

  // Ensure it has an ID so we can find it in the Main World
  if (!slateRoot.id) {
    slateRoot.id = `hone-slate-${Math.random().toString(36).slice(2, 11)}`;
  }

  return new Promise((resolve) => {
    const handleResult = (event: MessageEvent) => {
      if (event.source !== window || event.data?.type !== "HONE_TRANSACTION_RESULT") return;
      
      window.removeEventListener("message", handleResult);
      if (event.data.success) {
        // Even if the bridge says success, verify the DOM update from our side
        verifyDomReplace({ ...ctx, root: slateRoot }).then(resolve);
      } else {
        resolve(false);
      }
    };

    window.addEventListener("message", handleResult);
    
    window.postMessage({
      type: "HONE_RUN_SLATE_TRANSACTION",
      targetId: slateRoot.id,
      replacement: ctx.replacement
    }, "*");

    // Safety timeout
    setTimeout(() => {
      window.removeEventListener("message", handleResult);
      resolve(false);
    }, 1000);
  });
}

/** Lexical / many CE: one beforeinput with insertReplacementText */
async function commitViaBeforeInput(ctx: TransactionContext): Promise<boolean> {
  prepareDomSelection(ctx);

  try {
    const evt = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: ctx.replacement,
    });
    ctx.root.dispatchEvent(evt);
    syncSelectionChange();
    return await verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

/** Simulated paste — editors often commit this as a real transaction */
async function commitViaPasteEvent(ctx: TransactionContext): Promise<boolean> {
  prepareDomSelection(ctx);

  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", ctx.replacement);
    ctx.root.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      }),
    );
    syncSelectionChange();
    return await verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

/** Last resort for generic CE — can desync Slate (ghost state on Discord) */
async function commitViaExecCommand(ctx: TransactionContext): Promise<boolean> {
  prepareDomSelection(ctx);

  try {
    if (!document.execCommand("insertText", false, ctx.replacement)) {
      return false;
    }
    syncSelectionChange();
    return await verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

async function runStrategies(
  ctx: TransactionContext,
  strategies: Array<(ctx: TransactionContext) => Promise<boolean>>,
): Promise<boolean> {
  for (const strategy of strategies) {
    const before = extractPlainText(ctx.root);
    if (await strategy(ctx)) {
      return true;
    }
    const after = extractPlainText(ctx.root);
    if (
      ctx.replacement &&
      after !== before &&
      after.includes(ctx.replacement.slice(0, 32)) &&
      !(await verifyDomReplace(ctx))
    ) {
      return false;
    }
  }
  return false;
}

/**
 * Commit replacement into the editor. Picks framework-appropriate strategies only.
 */
export async function applyEditorTransaction(
  ctx: TransactionContext,
): Promise<TransactionResult> {
  const framework = ctx.framework;

  if (framework === "slate") {
    // Try Main World bridge first as it's most reliable for Slate
    if (await commitViaMainWorldSlate(ctx)) {
      return { committed: true, confidence: 0.95, suggestClipboardPaste: false };
    }
    // Fallback to Isolated World attempt (likely fails in production but good for dev)
    if (await commitViaSlateApi(ctx)) {
      return { committed: true, confidence: 0.9, suggestClipboardPaste: false };
    }
    if (await commitViaPasteEvent(ctx)) {
      return { committed: true, confidence: 0.75, suggestClipboardPaste: false };
    }
    return {
      committed: false,
      confidence: 0,
      suggestClipboardPaste: true,
    };
  }

  if (framework === "lexical") {
    if (await commitViaBeforeInput(ctx)) {
      return { committed: true, confidence: 0.9, suggestClipboardPaste: false };
    }
    if (await commitViaPasteEvent(ctx)) {
      return { committed: true, confidence: 0.8, suggestClipboardPaste: false };
    }
    if (await commitViaExecCommand(ctx)) {
      return { committed: true, confidence: 0.6, suggestClipboardPaste: false };
    }
    return {
      committed: false,
      confidence: 0,
      suggestClipboardPaste: true,
    };
  }

  const ok = await runStrategies(ctx, [
    commitViaBeforeInput,
    commitViaExecCommand,
    commitViaPasteEvent,
  ]);

  if (ok) {
    return { committed: true, confidence: 0.7, suggestClipboardPaste: false };
  }

  return {
    committed: false,
    confidence: 0,
    suggestClipboardPaste: true,
  };
}

export async function copyForManualPaste(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function buildTransactionContext(
  element: HTMLElement,
  start: number,
  end: number,
  replacement: string,
  beforeText: string,
  expectedSlice: string,
): TransactionContext {
  const root = resolveEditorRoot(element);
  return {
    root,
    replacement,
    start,
    end,
    beforeText,
    expectedSlice,
    framework: detectEditorFramework(element),
  };
}
