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

function verifyDomReplace(ctx: TransactionContext): boolean {
  const after = extractPlainText(ctx.root);
  const expected =
    ctx.beforeText.substring(0, ctx.start) +
    ctx.replacement +
    ctx.beforeText.substring(ctx.end);
  const oldPart = ctx.expectedSlice;

  if (after === expected) return true;
  if (normalizePlain(after) === normalizePlain(expected)) return true;

  if (
    oldPart.length > 0 &&
    ctx.replacement.length > 0 &&
    after.includes(oldPart) &&
    after.includes(ctx.replacement)
  ) {
    return false;
  }

  const probe = ctx.replacement.trim().slice(0, Math.min(48, ctx.replacement.length));
  if (!probe) return true;

  return after.includes(probe) && (!oldPart || !after.includes(oldPart));
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
function commitViaSlateApi(ctx: TransactionContext): boolean {
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
    return verifyDomReplace({ ...ctx, root: slateRoot });
  } catch {
    return false;
  }
}

/** Lexical / many CE: one beforeinput with insertReplacementText */
function commitViaBeforeInput(ctx: TransactionContext): boolean {
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
    return verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

/** Simulated paste — editors often commit this as a real transaction */
function commitViaPasteEvent(ctx: TransactionContext): boolean {
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
    return verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

/** Last resort for generic CE — can desync Slate (ghost state on Discord) */
function commitViaExecCommand(ctx: TransactionContext): boolean {
  prepareDomSelection(ctx);

  try {
    if (!document.execCommand("insertText", false, ctx.replacement)) {
      return false;
    }
    syncSelectionChange();
    return verifyDomReplace(ctx);
  } catch {
    return false;
  }
}

function runStrategies(
  ctx: TransactionContext,
  strategies: Array<(ctx: TransactionContext) => boolean>,
): boolean {
  for (const strategy of strategies) {
    const before = extractPlainText(ctx.root);
    if (strategy(ctx)) {
      return true;
    }
    const after = extractPlainText(ctx.root);
    if (
      ctx.replacement &&
      after !== before &&
      after.includes(ctx.replacement.slice(0, 32)) &&
      !verifyDomReplace(ctx)
    ) {
      return false;
    }
  }
  return false;
}

/**
 * Commit replacement into the editor. Picks framework-appropriate strategies only.
 */
export function applyEditorTransaction(
  ctx: TransactionContext,
): TransactionResult {
  const framework = ctx.framework;

  if (framework === "slate") {
    if (commitViaSlateApi(ctx)) {
      return { committed: true, confidence: 0.9, suggestClipboardPaste: false };
    }
    if (commitViaPasteEvent(ctx)) {
      return { committed: true, confidence: 0.75, suggestClipboardPaste: false };
    }
    return {
      committed: false,
      confidence: 0,
      suggestClipboardPaste: true,
    };
  }

  if (framework === "lexical") {
    if (commitViaBeforeInput(ctx)) {
      return { committed: true, confidence: 0.9, suggestClipboardPaste: false };
    }
    if (commitViaPasteEvent(ctx)) {
      return { committed: true, confidence: 0.8, suggestClipboardPaste: false };
    }
    if (commitViaExecCommand(ctx)) {
      return { committed: true, confidence: 0.6, suggestClipboardPaste: false };
    }
    return {
      committed: false,
      confidence: 0,
      suggestClipboardPaste: true,
    };
  }

  const ok = runStrategies(ctx, [
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
