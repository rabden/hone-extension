/**
 * This script runs in the Main World (page context) to bypass the Isolated World barrier.
 * It has direct access to the page's JavaScript context, including React Fibers.
 */

interface SlateTransactionData {
  type: "HONE_RUN_SLATE_TRANSACTION";
  targetId: string;
  replacement: string;
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "HONE_RUN_SLATE_TRANSACTION") {
    return;
  }

  const { targetId, replacement } = event.data as SlateTransactionData;
  const element = document.getElementById(targetId);

  if (!element) {
    window.postMessage({ type: "HONE_TRANSACTION_RESULT", success: false, error: "Element not found" }, "*");
    return;
  }

  try {
    const fiberKey = Object.keys(element).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );

    if (!fiberKey) {
      window.postMessage({ type: "HONE_TRANSACTION_RESULT", success: false, error: "React Fiber not found" }, "*");
      return;
    }

    const fiber = (element as any)[fiberKey];
    
    // Find Slate instance by traversing up/down the fiber tree
    const editor = findSlateEditorInFiber(fiber);

    if (editor) {
      // Apply the transformation
      if (editor.deleteFragment && typeof editor.deleteFragment === "function") {
        editor.deleteFragment();
      }
      editor.insertText(replacement);
      if (editor.onChange) editor.onChange();
      
      window.postMessage({ type: "HONE_TRANSACTION_RESULT", success: true }, "*");
    } else {
      window.postMessage({ type: "HONE_TRANSACTION_RESULT", success: false, error: "Slate editor not found in fiber" }, "*");
    }
  } catch (err: any) {
    window.postMessage({ type: "HONE_TRANSACTION_RESULT", success: false, error: err.message }, "*");
  }
});

function findSlateEditorInFiber(fiber: any): any {
  const queue: any[] = [fiber];
  const seen = new Set<any>();

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);

    const props = node.memoizedProps;
    const editor = props?.editor || props?.children?.props?.editor;

    if (editor && typeof editor.insertText === "function" && Array.isArray(editor.children)) {
      return editor;
    }

    if (node.child) queue.push(node.child);
    if (node.sibling) queue.push(node.sibling);
    if (node.return) queue.push(node.return);
  }
  return null;
}
