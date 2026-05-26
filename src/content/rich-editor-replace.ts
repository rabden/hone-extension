/**
 * Rich-editor replace — delegates to transaction-engine for framework commits.
 */

import { resolveEditorRoot } from "./editor-detection";
import { extractPlainText, setDomSelectionByOffsets } from "./plain-text-dom";
import {
  applyEditorTransaction,
  buildTransactionContext,
  type TransactionResult,
} from "./transaction-engine";

export type { TransactionResult } from "./transaction-engine";
export { copyForManualPaste } from "./transaction-engine";

export interface ReplaceInEditorOptions {
  expectedText?: string;
  fieldSnapshot?: string;
}

export function locatePlainTextSpan(
  fullText: string,
  start: number,
  end: number,
  expectedText?: string,
): { start: number; end: number } | null {
  const len = fullText.length;
  let s = Math.max(0, Math.min(start, len));
  let e = Math.max(s, Math.min(end, len));

  if (expectedText === undefined) {
    return { start: s, end: e };
  }

  if (fullText.substring(s, e) === expectedText) {
    return { start: s, end: e };
  }

  const searchFrom = Math.max(0, s - expectedText.length);
  const near = fullText.indexOf(expectedText, searchFrom);
  if (near !== -1) {
    return { start: near, end: near + expectedText.length };
  }

  const anywhere = fullText.indexOf(expectedText);
  if (anywhere !== -1) {
    return { start: anywhere, end: anywhere + expectedText.length };
  }

  if (s < len && e <= len && e > s) {
    return { start: s, end: e };
  }

  return null;
}

export function replaceInContentEditable(
  element: HTMLElement,
  start: number,
  end: number,
  replacement: string,
  options?: ReplaceInEditorOptions,
): TransactionResult {
  const root = resolveEditorRoot(element);
  const currentText = extractPlainText(root);
  const snapshot = options?.fieldSnapshot;
  const locateIn =
    snapshot &&
    options?.expectedText &&
    snapshot.includes(options.expectedText)
      ? snapshot
      : currentText;

  let resolved = locatePlainTextSpan(
    locateIn,
    start,
    end,
    options?.expectedText,
  );
  if (!resolved) {
    resolved = locatePlainTextSpan(
      currentText,
      start,
      end,
      options?.expectedText,
    );
  }

  if (!resolved) {
    return {
      committed: false,
      confidence: 0,
      suggestClipboardPaste: true,
    };
  }

  const beforeText = snapshot ?? currentText;
  const expectedSlice =
    options?.expectedText ??
    beforeText.substring(resolved.start, resolved.end);

  const ctx = buildTransactionContext(
    element,
    resolved.start,
    resolved.end,
    replacement,
    beforeText,
    expectedSlice,
  );

  return applyEditorTransaction(ctx);
}

export function notifyEditorChange(_element: HTMLElement): void {}

export { extractPlainText, setDomSelectionByOffsets };
