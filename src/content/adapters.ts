/**
 * EditableAdapter: Abstraction layer for different types of rich text editors
 * Supports: input/textarea, contenteditable, Monaco, CodeMirror, ProseMirror, Lexical, etc.
 */

import {
  extractPlainText,
  offsetFromDomPoint,
  setDomSelectionByOffsets,
} from "./plain-text-dom";
import { resolveEditorRoot } from "./editor-detection";
import {
  notifyEditorChange,
  replaceInContentEditable,
  type TransactionResult,
} from "./rich-editor-replace";

export interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  isSelection: boolean;
}

export interface ReplaceRangeOptions {
  /** Original text at [start, end); used to re-locate the span if indices drifted */
  expectedText?: string;
  /** Full field text when the AI action started */
  fieldSnapshot?: string;
}

export type InferredSelection = {
  text: string;
  start: number;
  end: number;
  isSelection: boolean;
  level: 'selection' | 'sentence' | 'paragraph' | 'field';
};

export interface EditableAdapter {
  /**
   * Get the DOM element this adapter wraps
   */
  getElement(): HTMLElement;

  /**
   * Get all text in the editor (selected or full content)
   */
  getText(): string;

  /**
   * Get current selection info (selected text, range, whether selection exists)
   */
  getSelection(): SelectionInfo;

  /**
   * Replace selected text or full content if no selection
   * @param text - The new text to insert
   * @param selectAll - If true, replace entire content instead of selection
   */
  replaceSelection(text: string, selectAll?: boolean): void;

  /**
   * Find-and-replace style edit: splice `replacement` into [start, end) only.
   * Returns false if the target span could not be applied safely.
   */
  replaceRange(
    start: number,
    end: number,
    replacement: string,
    options?: ReplaceRangeOptions,
  ): boolean | TransactionResult;

  /**
   * Get the bounding rect of the selected text or cursor position
   */
  getCaretRect(): DOMRect;

  /**
   * Focus the editor
   */
  focus(): void;

  /**
   * Notify the editor that content changed (triggers change/input events)
   */
  notifyChange(): void;

  /**
   * Get caret/index position (character offset) within the full text of the editor
   * For inputs/textarea this is selectionStart, for contenteditable this computes
   * the character offset from the start of the element to the caret.
   */
  getCaretIndex(): number;

  /**
   * Programmatically select a character range within the editor (start/end are
   * character offsets within the adapter.getText() string).
   */
  selectRange(start: number, end: number): void;

  /**
   * Snapshot the current selection so it can be restored later.
   * Critical for async operations where DOM may mutate before replacement.
   */
  saveSelection(): unknown;

  /**
   * Restore a previously saved selection snapshot.
   */
  restoreSelection(snapshot: unknown): void;

  /**
   * Clean up any listeners or resources held by this adapter.
   */
  destroy(): void;
}

/**
 * NativeInputAdapter: Handles <input type="text"> and <textarea>
 */
export class NativeInputAdapter implements EditableAdapter {
  private element: HTMLInputElement | HTMLTextAreaElement;

  constructor(element: HTMLInputElement | HTMLTextAreaElement) {
    this.element = element;
  }

  getElement(): HTMLElement {
    return this.element as HTMLElement;
  }

  getText(): string {
    return this.element.value;
  }

  getSelection(): SelectionInfo {
    const start = this.element.selectionStart ?? 0;
    const end = this.element.selectionEnd ?? 0;
    const selectedText = this.element.value.substring(start, end);
    const isSelection = selectedText.trim().length > 0;
    return {
      text: isSelection ? selectedText : this.element.value,
      start,
      end,
      isSelection,
    };
  }

  replaceSelection(text: string, selectAll?: boolean): void {
    if (selectAll) {
      this.element.value = text;
    } else {
      const start = this.element.selectionStart ?? 0;
      const end = this.element.selectionEnd ?? 0;
      const before = this.element.value.substring(0, start);
      const after = this.element.value.substring(end);
      this.element.value = before + text + after;
      this.element.setSelectionRange(start + text.length, start + text.length);
    }
  }

  replaceRange(
    start: number,
    end: number,
    replacement: string,
    options?: ReplaceRangeOptions,
  ): boolean {
    const full = this.element.value;
    const located = locateTextSpan(full, start, end, options?.expectedText);
    if (!located) return false;

    const { start: s, end: e } = located;
    this.element.value =
      full.substring(0, s) + replacement + full.substring(e);
    const caret = s + replacement.length;
    this.element.setSelectionRange(caret, caret);
    this.element.focus();
    return true;
  }

  getCaretRect(): DOMRect {
    const elRect = this.element.getBoundingClientRect();
    const idx = this.element.selectionStart ?? 0;
    const cs = getComputedStyle(this.element);
    const padLeft = parseFloat(cs.paddingLeft) || 0;
    const padTop = parseFloat(cs.paddingTop) || 0;

    if (idx === 0) {
      return new DOMRect(elRect.left + padLeft, elRect.top + padTop, 0, parseFloat(cs.lineHeight) || elRect.height);
    }

    let mirror = _inputCaretMirror;
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.style.cssText = 'position:fixed;top:-9999px;left:-9999px;overflow:hidden;visibility:hidden';
      _inputCaretMirror = mirror;
      document.body.appendChild(mirror);
    }

    const isTextarea = this.element instanceof HTMLTextAreaElement;
    mirror.style.font = cs.font;
    mirror.style.fontFamily = cs.fontFamily;
    mirror.style.fontSize = cs.fontSize;
    mirror.style.fontWeight = cs.fontWeight;
    mirror.style.fontStyle = cs.fontStyle;
    mirror.style.fontVariant = cs.fontVariant;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.wordSpacing = cs.wordSpacing;
    mirror.style.width = isTextarea ? `${elRect.width - padLeft - (parseFloat(cs.paddingRight) || 0)}px` : 'auto';
    mirror.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre';

    const textBefore = this.element.value.slice(0, idx);
    mirror.textContent = textBefore;

    if (isTextarea) {
      mirror.style.position = 'fixed';
      mirror.style.top = `${elRect.top}px`;
      mirror.style.left = `${elRect.left}px`;
      mirror.style.height = 'auto';
      const lineHeight = parseFloat(cs.lineHeight) || 16;
      const lines = textBefore.split('\n');
      const y = elRect.top + padTop + (lines.length - 1) * lineHeight;

      const lastLine = lines[lines.length - 1] || '';
      const span = document.createElement('span');
      span.textContent = lastLine;
      mirror.textContent = '';
      mirror.appendChild(span);
      const x = elRect.left + padLeft + span.offsetWidth;

      return new DOMRect(x, y, 0, lineHeight);
    }

    const x = elRect.left + padLeft + mirror.offsetWidth;
    return new DOMRect(x, elRect.top + padTop, 0, parseFloat(cs.lineHeight) || elRect.height);
  }

  focus(): void {
    this.element.focus();
  }

  notifyChange(): void {
    this.element.dispatchEvent(new Event('input', { bubbles: true }));
    this.element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  getCaretIndex(): number {
    return this.element.selectionStart ?? 0;
  }

  selectRange(start: number, end: number): void {
    this.element.setSelectionRange(start, end);
    this.element.focus();
  }

  saveSelection(): { start: number; end: number } {
    return {
      start: this.element.selectionStart ?? 0,
      end: this.element.selectionEnd ?? 0,
    };
  }

  restoreSelection(snapshot: unknown): void {
    const { start, end } = snapshot as { start: number; end: number };
    this.element.setSelectionRange(start, end);
  }

  destroy(): void {
    // Nothing to clean up for native inputs
  }
}

let _inputCaretMirror: HTMLDivElement | null = null;

/**
 * ContentEditableAdapter: Handles contenteditable divs and elements
 * Works with: Gmail, Notion, Twitter, Discord, Slack, LinkedIn, etc.
 */
export class ContentEditableAdapter implements EditableAdapter {
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getText(): string {
    return extractPlainText(this.element);
  }

  getSelection(): SelectionInfo {
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? '';
    const isSelection = selectedText.length > 0;

    if (isSelection && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (this.element.contains(range.commonAncestorContainer)) {
        const start = this.getOffsetAtPoint(
          range.startContainer,
          range.startOffset,
        );
        const end = this.getOffsetAtPoint(range.endContainer, range.endOffset);
        const s = Math.min(start, end);
        const e = Math.max(start, end);
        return {
          text: selectedText,
          start: s,
          end: e,
          isSelection: true,
        };
      }
    }

    const caret = this.getCaretIndex();
    const fullText = this.getText();
    return {
      text: fullText,
      start: caret,
      end: caret,
      isSelection: false,
    };
  }

  private getOffsetAtPoint(node: Node, offset: number): number {
    return offsetFromDomPoint(this.element, node, offset);
  }

  replaceSelection(text: string, selectAll?: boolean): void {
    const full = this.getText();

    if (selectAll) {
      replaceInContentEditable(this.element, 0, full.length, text);
      return;
    }

    const sel = this.getSelection();
    if (sel.end > sel.start) {
      replaceInContentEditable(
        this.element,
        sel.start,
        sel.end,
        text,
        { expectedText: sel.text },
      );
      return;
    }

    const caret = this.getCaretIndex();
    replaceInContentEditable(this.element, caret, caret, text);
  }

  replaceRange(
    start: number,
    end: number,
    replacement: string,
    options?: ReplaceRangeOptions,
  ): TransactionResult {
    return replaceInContentEditable(this.element, start, end, replacement, {
      expectedText: options?.expectedText,
      fieldSnapshot: options?.fieldSnapshot,
    });
  }

  getCaretRect(): DOMRect {
    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      if (rects.length > 0) {
        return rects[0];
      }
    }

    // Fallback to element's bounding rect
    return this.element.getBoundingClientRect();
  }

  focus(): void {
    this.element.focus();
  }

  notifyChange(): void {
    notifyEditorChange(this.element);
  }

  getCaretIndex(): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    if (!this.element.contains(range.commonAncestorContainer)) {
      return 0;
    }

    return offsetFromDomPoint(
      this.element,
      range.startContainer,
      range.startOffset,
    );
  }

  selectRange(startIndex: number, endIndex: number): void {
    setDomSelectionByOffsets(
      this.element,
      Math.max(0, startIndex),
      Math.max(0, endIndex),
    );
  }

  saveSelection(): Range | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    return sel.getRangeAt(0).cloneRange();
  }

  restoreSelection(snapshot: unknown): void {
    const range = snapshot as Range;
    if (!range) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  destroy(): void {
    // Nothing to clean up for contenteditable adapters
  }
}

// --- Selection inference helpers ---

/** Re-locate [start,end) when the field changed slightly during an async AI call */
function locateTextSpan(
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

  return null;
}

/**
 * Resolve the exact character span to send to AI and replace afterward.
 */
export function resolveReplacementSpan(
  adapter: EditableAdapter,
  override?: Pick<InferredSelection, 'text' | 'start' | 'end' | 'level'>,
): InferredSelection {
  if (override) {
    const start = override.start;
    const end = override.end;
    const fullText = adapter.getText();
    const text =
      end > start ? fullText.substring(start, end) : override.text;
    return {
      text,
      start,
      end,
      isSelection: override.level === 'selection',
      level: override.level,
    };
  }

  const selection = adapter.getSelection();
  const fullText = adapter.getText();

  if (selection.isSelection && selection.end > selection.start) {
    return {
      text: fullText.substring(selection.start, selection.end),
      start: selection.start,
      end: selection.end,
      isSelection: true,
      level: 'selection',
    };
  }

  if (selection.isSelection && selection.text.length > 0) {
    const idx = fullText.indexOf(selection.text);
    if (idx !== -1) {
      return {
        text: selection.text,
        start: idx,
        end: idx + selection.text.length,
        isSelection: true,
        level: 'selection',
      };
    }
  }

  return inferSelection(adapter);
}

function findSentenceBoundaries(text: string, index: number): { start: number; end: number } {
  // Split into sentences using a simple regex; preserves punctuation
  const regex = /[^.!?]+[.!?]*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const s = match.index;
    const e = match.index + match[0].length;
    if (index >= s && index <= e) {
      return { start: s, end: e };
    }
  }

  // Fallback: use the current line (split by newline)
  const before = text.lastIndexOf('\n', Math.max(0, index - 1));
  const after = text.indexOf('\n', index);
  return { start: before === -1 ? 0 : before + 1, end: after === -1 ? text.length : after };
}

function findParagraphBoundaries(text: string, index: number): { start: number; end: number } {
  const lines = text.split('\n');
  let pos = 0;
  let lineIndex = 0;
  for (lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const start = pos;
    const end = pos + line.length;
    if (index >= start && index <= end) break;
    pos = end + 1; // account for newline
  }

  if (lineIndex >= lines.length) {
    return { start: 0, end: text.length };
  }

  let startLine = lineIndex;
  while (startLine > 0 && lines[startLine - 1].trim() !== '') startLine--;
  let endLine = lineIndex;
  while (endLine < lines.length - 1 && lines[endLine + 1].trim() !== '') endLine++;

  let startIdx = 0;
  for (let i = 0; i < startLine; i++) startIdx += lines[i].length + 1;
  let endIdx = startIdx;
  for (let i = startLine; i <= endLine; i++) {
    endIdx += lines[i].length;
    if (i < endLine) endIdx += 1;
  }

  return { start: startIdx, end: endIdx };
}

export function inferSelection(adapter: EditableAdapter): InferredSelection {
  const current = adapter.getSelection();
  const fullText = adapter.getText() || '';

  if (current.isSelection && current.text.trim().length > 0) {
    if (current.end > current.start) {
      return {
        text: fullText.substring(current.start, current.end),
        start: current.start,
        end: current.end,
        isSelection: true,
        level: 'selection',
      };
    }
    const idx = fullText.indexOf(current.text);
    if (idx !== -1) {
      return {
        text: current.text,
        start: idx,
        end: idx + current.text.length,
        isSelection: true,
        level: 'selection',
      };
    }
  }

  const caret = adapter.getCaretIndex() ?? 0;

  // Try sentence
  const sentence = findSentenceBoundaries(fullText, caret);
  const sentenceText = fullText.substring(sentence.start, sentence.end).trim();
  if (sentenceText.length > 0 && sentenceText.length < fullText.trim().length) {
    return { text: sentenceText, start: sentence.start, end: sentence.end, isSelection: false, level: 'sentence' };
  }

  // Try paragraph
  const paragraph = findParagraphBoundaries(fullText, caret);
  const paragraphText = fullText.substring(paragraph.start, paragraph.end).trim();
  if (paragraphText.length > 0 && paragraphText.length < fullText.trim().length) {
    return { text: paragraphText, start: paragraph.start, end: paragraph.end, isSelection: false, level: 'paragraph' };
  }

  // Fallback to whole field
  return { text: fullText, start: 0, end: fullText.length, isSelection: false, level: 'field' };
}

/**
 * Compute inference options for different levels (selection, sentence, paragraph, field)
 * Returns an object containing each option and a chosen "best" option
 */
export function computeInferenceOptions(adapter: EditableAdapter) {
  const fullText = adapter.getText() || '';
  const current = adapter.getSelection();
  const caret = adapter.getCaretIndex() ?? 0;

  const selectionOpt =
    current.isSelection && current.end > current.start
      ? {
          text: fullText.substring(current.start, current.end),
          start: current.start,
          end: current.end,
          isSelection: true,
          level: 'selection' as const,
        }
      : current.isSelection && current.text.trim().length > 0
        ? (() => {
            const idx = fullText.indexOf(current.text);
            if (idx === -1) return undefined;
            return {
              text: current.text,
              start: idx,
              end: idx + current.text.length,
              isSelection: true,
              level: 'selection' as const,
            };
          })()
        : undefined;

  const sentenceBounds = findSentenceBoundaries(fullText, caret);
  const sentenceOpt = {
    text: fullText.substring(sentenceBounds.start, sentenceBounds.end),
    start: sentenceBounds.start,
    end: sentenceBounds.end,
    isSelection: false,
    level: 'sentence' as const,
  };

  const paragraphBounds = findParagraphBoundaries(fullText, caret);
  const paragraphOpt = {
    text: fullText.substring(paragraphBounds.start, paragraphBounds.end),
    start: paragraphBounds.start,
    end: paragraphBounds.end,
    isSelection: false,
    level: 'paragraph' as const,
  };

  const fieldOpt = {
    text: fullText,
    start: 0,
    end: fullText.length,
    isSelection: false,
    level: 'field' as const,
  };

  // Choose best: prefer explicit selection, else sentence if meaningful, else paragraph, else field
  let best: InferredSelection = fieldOpt;
  if (selectionOpt) best = selectionOpt;
  else if (sentenceOpt.text.trim().length > 0 && sentenceOpt.text.trim().length < fullText.trim().length) best = sentenceOpt;
  else if (paragraphOpt.text.trim().length > 0 && paragraphOpt.text.trim().length < fullText.trim().length) best = paragraphOpt;

  return {
    selection: selectionOpt,
    sentence: sentenceOpt,
    paragraph: paragraphOpt,
    field: fieldOpt,
    best,
  };
}

/**
 * Resolve the editor root for Lexical/Slate/nested contenteditables.
 */
export function resolveContentEditableRoot(
  element: HTMLElement,
): HTMLElement | null {
  const lexical = element.closest(
    '[data-lexical-editor="true"]',
  ) as HTMLElement | null;
  if (lexical) return lexical;

  const slate = element.closest(
    '[data-slate-editor="true"]',
  ) as HTMLElement | null;
  if (slate) return slate;

  let node: HTMLElement | null = null;
  if (element.isContentEditable) {
    node = element;
  } else {
    node = element.closest(
      '[contenteditable="true"], [contenteditable=""]',
    ) as HTMLElement | null;
  }

  if (!node) return null;

  const ce = node.getAttribute("contenteditable");
  if (ce !== "true" && ce !== "") return null;

  while (node.parentElement?.isContentEditable) {
    node = node.parentElement;
  }

  return node;
}

/**
 * Detect and create the appropriate adapter for an element
 * @param element - The element to adapt
 * @returns An EditableAdapter instance, or null if not adaptable
 */
export function createAdapter(element: Element | null): EditableAdapter | null {
  if (!element) return null;

  // Native input/textarea
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea') {
    return new NativeInputAdapter(element as HTMLTextAreaElement);
  }
  if (tag === 'input') {
    const type = (element as HTMLInputElement).type?.toLowerCase() || 'text';
    if (['text', 'search', 'url', 'tel', 'email', 'password'].includes(type)) {
      return new NativeInputAdapter(element as HTMLInputElement);
    }
  }

  const el = element as HTMLElement;
  if (
    el.isContentEditable ||
    el.closest('[contenteditable="true"], [contenteditable=""], [data-lexical-editor="true"], [data-slate-editor="true"]')
  ) {
    return new ContentEditableAdapter(resolveEditorRoot(el));
  }

  // TODO: Add adapters for Monaco, CodeMirror, ProseMirror, Lexical, etc.
  // For now, return null for unsupported editors

  return null;
}

/**
 * Check if an element is editable (can create an adapter for it)
 */
export function isEditableElement(element: Element | null): boolean {
  return createAdapter(element) !== null;
}

// ── Active Context Resolver ──

export interface ActiveContext {
  /** Distinguishes a raw text selection vs a focused editable input */
  type: 'input' | 'selection';
  /** Adapter when inside an editable element; null for read-only selections */
  adapter: EditableAdapter | null;
  /** The text (selection text for 'selection' type, selected/full text for 'input') */
  text: string;
  /** Bounding rect to anchor the menu near (caret, selection, or input) */
  rect: DOMRect;
}

/**
 * Resolve the current editing context from the page state.
 *
 * Priority:
 *  1. Text selection anywhere (even outside editables)
 *  2. Focused editable element (input, textarea, contenteditable)
 *
 * Returns null when nothing useful is active.
 */
export function resolveActiveContext(): ActiveContext | null {
  const sel = window.getSelection();

  // 1 — Text selection anywhere on the page
  if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect() || range.getClientRects()?.[0];
    if (rect && rect.width > 0 && rect.height > 0) {
      // Check whether the selection lives inside an editable element
      const container = range.commonAncestorContainer;
      const editableEl = container?.nodeType === Node.ELEMENT_NODE
        ? (container as Element).closest('textarea, input, [contenteditable], [contenteditable=""]')
        : container?.parentElement?.closest('textarea, input, [contenteditable], [contenteditable=""]');

      const adapter = editableEl ? createAdapter(editableEl) : null;

      return {
        type: 'selection',
        adapter,
        text: sel.toString(),
        rect,
      };
    }
  }

  // 2 — Focused editable element
  const active = document.activeElement;
  if (active && isEditableElement(active)) {
    const adapter = createAdapter(active);
    if (adapter) {
      const selection = adapter.getSelection();
      return {
        type: 'input',
        adapter,
        text: selection.text || adapter.getText(),
        rect: adapter.getCaretRect(),
      };
    }
  }

  return null;
}
