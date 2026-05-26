/**
 * Plain-text offsets for contenteditable elements.
 * Uses the same Range.toString() model everywhere so indices stay aligned.
 */

export function extractPlainText(root: HTMLElement): string {
  const range = document.createRange();
  try {
    range.selectNodeContents(root);
    return range.toString();
  } catch {
    return root.innerText || root.textContent || "";
  }
}

export function offsetFromDomPoint(
  root: HTMLElement,
  node: Node,
  offset: number,
): number {
  const probe = document.createRange();
  try {
    probe.selectNodeContents(root);
    probe.setEnd(node, offset);
    return probe.toString().length;
  } catch {
    return 0;
  }
}

export function domPointFromOffset(
  root: HTMLElement,
  charIndex: number,
): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  let last: Text | null = null;

  // Use a range to verify character counts as we go.
  // This is more robust than manual accumulation because it matches range.toString() logic.
  const range = document.createRange();
  range.setStart(root, 0);

  while (node) {
    const textNode = node as Text;
    range.setEnd(textNode, textNode.data.length);
    const currentFullLength = range.toString().length;

    if (currentFullLength >= charIndex) {
      // It's in this node. Find the exact offset.
      range.setEnd(textNode, 0);
      const lengthBeforeNode = range.toString().length;
      const offsetInNode = charIndex - lengthBeforeNode;
      return { node: textNode, offset: Math.max(0, Math.min(offsetInNode, textNode.data.length)) };
    }

    last = textNode;
    node = walker.nextNode();
  }

  if (last) {
    return { node: last, offset: last.data.length };
  }

  return { node: root, offset: 0 };
}

export function setDomSelectionByOffsets(
  root: HTMLElement,
  start: number,
  end: number,
  options?: { focus?: boolean },
): boolean {
  const startPair = domPointFromOffset(root, Math.max(0, start));
  const endPair = domPointFromOffset(root, Math.max(0, end));

  const range = document.createRange();
  try {
    range.setStart(startPair.node, startPair.offset);
    range.setEnd(endPair.node, endPair.offset);
  } catch {
    return false;
  }

  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  if (options?.focus !== false) {
    root.focus({ preventScroll: true });
  }
  return true;
}

/** Select a substring, searching text nodes if offset-based selection fails. */
export function selectPlainTextRange(
  root: HTMLElement,
  start: number,
  end: number,
  expectedSlice: string,
  options?: { focus?: boolean },
): boolean {
  if (setDomSelectionByOffsets(root, start, end, options)) {
    if (start === end) return true;
    const selected = window.getSelection()?.toString() ?? "";
    if (selected === expectedSlice) return true;
  }

  if (!expectedSlice) return start === end;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = walker.nextNode() as Text | null;
  while (textNode) {
    const idx = textNode.data.indexOf(expectedSlice);
    if (idx !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNode, idx);
        range.setEnd(textNode, idx + expectedSlice.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        if (options?.focus !== false) {
          root.focus({ preventScroll: true });
        }
        return true;
      } catch {
        /* try next node */
      }
    }
    textNode = walker.nextNode() as Text | null;
  }

  return false;
}

export function plainTextContains(
  root: HTMLElement,
  fragment: string,
): boolean {
  if (!fragment) return true;
  return extractPlainText(root).includes(fragment);
}
