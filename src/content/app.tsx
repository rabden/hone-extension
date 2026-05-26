import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronUp,
  Sparkles,
  RefreshCw,
  Feather,
  Check,
  AlertCircle,
  Briefcase,
  MessageSquare,
  Zap,
  Heart,
  Minimize2,
  Maximize2,
} from "lucide-react";
import {
  createAdapter,
  isEditableElement,
  computeInferenceOptions,
  resolveReplacementSpan,
  resolveActiveContext,
  type InferredSelection,
  type ActiveContext,
} from "./adapters";
import { copyForManualPaste } from "./rich-editor-replace";
import { autoPositionElement, type VirtualElement } from "./positioning";
import { ActionRegistry, type ActionHandler } from "./actions";
import { renderActionIcon } from "@/lib/action-icons";
import { PreviewPanel } from "./preview-panel";
import type { PendingPreview } from "./preview-types";
import {
  consumeKeyboardEvent,
  isActivationKey,
  shouldSuppressActivationKey,
} from "./keyboard-guard";

interface Toast {
  message: string;
  type: "success" | "error";
}

interface Shortcut {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  action: string;
}

export default function App({
  portalContainer: _portalContainer,
}: {
  portalContainer?: HTMLElement;
}) {
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(
    null,
  );
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [shortcut, setShortcut] = useState<Shortcut | null>(null);
  const [dropdownShortcut, setDropdownShortcut] = useState<Shortcut>({
    key: "d",
    ctrl: false,
    alt: true,
    shift: true,
    meta: false,
    action: "toggle_menu",
  });
  const [hideDot, setHideDot] = useState(false);
  const [inferenceOptions, setInferenceOptions] = useState<any | null>(null);
  const [selectedInferenceLevel, setSelectedInferenceLevel] = useState<
    "selection" | "sentence" | "paragraph" | "field" | null
  >(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [previewPos, setPreviewPos] = useState({ top: 0, left: 0 });
  const [focusedActionIdx, setFocusedActionIdx] = useState(0);
  const [customActions, setCustomActions] = useState<ActionHandler[]>([]);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(
    null,
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const registryRef = useRef<ActionRegistry | null>(null);
  const focusedActionIdxRef = useRef(0);
  const suppressKeysUntilRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);
  const isInsideShadow = useRef(false);
  const isMenuOpenRef = useRef(false);
  const pendingPreviewRef = useRef(false);
  const editorElementRef = useRef<HTMLElement | null>(null);
  const savedSelectionRef = useRef<unknown>(null);
  const activeContextRef = useRef<ActiveContext | null>(null);
  const anchorRectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef(0);
  const blurTimeoutRef = useRef(0);

  // Sync refs synchronously
  useEffect(() => {
    activeContextRef.current = activeContext;
  }, [activeContext]);
  useEffect(() => {
    anchorRectRef.current = anchorRect;
  }, [anchorRect]);

  // ── Load custom actions from registry ──
  useEffect(() => {
    const load = async () => {
      const registry = new ActionRegistry();
      await registry.loadCustoms();
      registryRef.current = registry;
      setCustomActions(registry.getByCategory("custom"));
    };
    load();

    // Reload on storage changes
    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.customActions) {
        load();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const saveEditorFocus = useCallback(() => {
    const adapter = activeContextRef.current?.adapter;
    if (!adapter) return;
    editorElementRef.current = adapter.getElement();
    savedSelectionRef.current = adapter.saveSelection();
  }, []);

  const restoreEditorFocus = useCallback(() => {
    const el = editorElementRef.current;
    if (!el || !document.contains(el)) return;
    el.focus({ preventScroll: true });
    const adapter = createAdapter(el);
    if (adapter && savedSelectionRef.current != null) {
      try {
        adapter.restoreSelection(savedSelectionRef.current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const applyPendingPreview = useCallback(() => {
    const preview = pendingPreview;
    if (!preview) return;

    let ctx = activeContextRef.current;
    if (!ctx?.adapter) {
      const resolved = resolveActiveContext();
      if (resolved?.adapter) {
        ctx = resolved;
        activeContextRef.current = resolved;
        setActiveContext(resolved);
      }
    }

    if (!ctx?.adapter) {
      showToast("Cannot apply — focus the field again first.", "error");
      setPendingPreview(null);
      return;
    }

    const applyResult = async () => {
      const tx = await ctx.adapter!.replaceRange(
        preview.span.start,
        preview.span.end,
        preview.resultText,
        {
          expectedText: preview.span.text,
          fieldSnapshot: preview.fieldSnapshot,
        },
      );

      const committed = typeof tx === "boolean" ? tx : tx.committed;
      const suggestClipboard =
        typeof tx === "object" && tx.suggestClipboardPaste;

      if (!committed) {
        if (suggestClipboard) {
          const copied = await copyForManualPaste(preview.resultText);
          showToast(
            copied
              ? "Copied to clipboard — press Ctrl+V in the field to apply."
              : "Could not apply automatically. Copy the result and paste manually.",
            copied ? "success" : "error",
          );
        } else {
          showToast(
            "Could not apply — the field changed while you were reviewing.",
            "error",
          );
        }
        setPendingPreview(null);
        return;
      }

      setPendingPreview(null);
      suppressKeysUntilRef.current = performance.now() + 250;
      showToast(`Applied (${preview.span.level})`, "success");
    };

    void applyResult();
  }, [pendingPreview, showToast]);

  const discardPendingPreview = useCallback(() => {
    setPendingPreview(null);
  }, []);

  // Load config from storage
  useEffect(() => {
    const loadConfig = async () => {
      const res = (await chrome.storage.local.get([
        "shortcutKey",
        "shortcutCtrl",
        "shortcutAlt",
        "shortcutShift",
        "shortcutMeta",
        "shortcutAction",
        "dropdownShortcutKey",
        "dropdownShortcutCtrl",
        "dropdownShortcutAlt",
        "dropdownShortcutShift",
        "dropdownShortcutMeta",
        "hideDot",
      ])) as any;

      if (res.shortcutKey) {
        setShortcut({
          key: (res.shortcutKey as string).toLowerCase(),
          ctrl: !!res.shortcutCtrl,
          alt: !!res.shortcutAlt,
          shift: !!res.shortcutShift,
          meta: !!res.shortcutMeta,
          action: res.shortcutAction || "fix_spelling",
        });
      }

      setDropdownShortcut({
        key: (res.dropdownShortcutKey || "d").toLowerCase(),
        ctrl: !!res.dropdownShortcutCtrl,
        alt:
          res.dropdownShortcutAlt !== undefined
            ? !!res.dropdownShortcutAlt
            : true,
        shift:
          res.dropdownShortcutShift !== undefined
            ? !!res.dropdownShortcutShift
            : true,
        meta: !!res.dropdownShortcutMeta,
        action: "toggle_menu",
      });

      setHideDot(!!res.hideDot);
    };
    loadConfig();

    const onChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (
        changes.shortcutKey ||
        changes.shortcutCtrl ||
        changes.shortcutAlt ||
        changes.shortcutShift ||
        changes.shortcutMeta ||
        changes.shortcutAction ||
        changes.dropdownShortcutKey ||
        changes.dropdownShortcutCtrl ||
        changes.dropdownShortcutAlt ||
        changes.dropdownShortcutShift ||
        changes.dropdownShortcutMeta ||
        changes.hideDot
      ) {
        loadConfig();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  // ── AI action dispatcher ──
  const triggerAIAction = useCallback(
    (action: string, overrideInference?: InferredSelection) => {
      const ctx = activeContextRef.current;
      const adapter = ctx?.adapter;
      if (!adapter) {
        showToast("No editable text found", "error");
        return;
      }

      const span = resolveReplacementSpan(adapter, overrideInference);

      if (!span.text.trim()) {
        showToast("No text selected or input is empty!", "error");
        return;
      }

      setIsMenuOpen(false);
      suppressKeysUntilRef.current = performance.now() + 250;

      const fieldSnapshot = adapter.getText();

      chrome.runtime.sendMessage(
        { type: "PROCESS_TEXT", action, text: span.text },
        async (response: { success: boolean; text?: string; error?: string }) => {
          if (chrome.runtime.lastError) {
            showToast(
              "Could not reach Hone. Is the extension service worker running?",
              "error",
            );
            return;
          }

          if (response?.success && response.text) {
            const handler = registryRef.current?.get(action);
            const usePreview =
              handler?.type === "custom" && handler.replaceMode === "preview";

            if (usePreview) {
              setPendingPreview({
                actionName: handler.name,
                icon: handler.icon,
                color: handler.color,
                originalText: span.text,
                resultText: response.text,
                fieldSnapshot,
                span: {
                  start: span.start,
                  end: span.end,
                  text: span.text,
                  level: span.level,
                },
              });
              return;
            }

            const tx = await adapter.replaceRange(
              span.start,
              span.end,
              response.text,
              { expectedText: span.text, fieldSnapshot },
            );

            const committed =
              typeof tx === "boolean" ? tx : tx.committed;
            const suggestClipboard =
              typeof tx === "object" && tx.suggestClipboardPaste;

            if (!committed) {
              if (suggestClipboard) {
                const copied = await copyForManualPaste(response.text);
                showToast(
                  copied
                    ? "Copied to clipboard — press Ctrl+V in the field to apply."
                    : "Could not apply automatically. Copy the result and paste manually.",
                  copied ? "success" : "error",
                );
              } else {
                showToast(
                  "Could not apply edit — the field changed while waiting for AI.",
                  "error",
                );
              }
              return;
            }

            showToast(`Done! (${span.level})`, "success");
          } else {
            showToast(response?.error || "AI request failed.", "error");
          }
        },
      );
    },
    [showToast],
  );

  // ── Unified entry point: resolve context and open the assistant ──
  const openAssistant = useCallback(
    (immediateAction?: string) => {
      const ctx = resolveActiveContext();
      if (!ctx) {
        showToast("Focus an editable field or select text first", "error");
        return;
      }

      activeContextRef.current = ctx;
      setActiveContext(ctx);
      anchorRectRef.current = ctx.rect;
      setAnchorRect(ctx.rect);
      setIsMenuOpen(true);

      if (ctx.adapter) {
        try {
          const opts = computeInferenceOptions(ctx.adapter);
          setInferenceOptions(opts);
          setSelectedInferenceLevel(opts.best?.level ?? null);
        } catch (_err) {
          setInferenceOptions(null);
          setSelectedInferenceLevel(null);
        }
      } else {
        setInferenceOptions(null);
        setSelectedInferenceLevel(null);
      }

      // If an immediate action was requested and we have an adapter, execute it
      if (immediateAction && ctx.adapter) {
        triggerAIAction(immediateAction);
      }
    },
    [showToast, triggerAIAction],
  );

  // ── Keyboard shortcut listener ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Direct action shortcut
      if (shortcut && shortcut.key) {
        if (
          e.ctrlKey === shortcut.ctrl &&
          e.altKey === shortcut.alt &&
          e.shiftKey === shortcut.shift &&
          e.metaKey === shortcut.meta &&
          e.key.toLowerCase() === shortcut.key
        ) {
          e.preventDefault();
          openAssistant(shortcut.action);
          return;
        }
      }

      // 2. Dropdown menu toggle shortcut
      if (dropdownShortcut && dropdownShortcut.key) {
        if (
          e.ctrlKey === dropdownShortcut.ctrl &&
          e.altKey === dropdownShortcut.alt &&
          e.shiftKey === dropdownShortcut.shift &&
          e.metaKey === dropdownShortcut.meta &&
          e.key.toLowerCase() === dropdownShortcut.key
        ) {
          e.preventDefault();
          if (isMenuOpen) {
            setIsMenuOpen(false);
          } else {
            openAssistant();
          }
          return;
        }
      }

      // 3. Escape key to close menu
      if (e.key === "Escape" && isMenuOpen) {
        setIsMenuOpen(false);
        const el = activeContextRef.current?.adapter?.getElement();
        if (el) el.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [shortcut, dropdownShortcut, isMenuOpen, openAssistant]);

  // ── Chrome command shortcuts (manifest commands) ──
  useEffect(() => {
    const handleCommand = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "COMMAND_TRIGGERED" && message.action) {
        if (message.action === "toggle_menu") {
          if (isMenuOpen) {
            setIsMenuOpen(false);
          } else {
            openAssistant();
          }
        } else {
          openAssistant(message.action);
        }
        sendResponse({ success: true });
      }
    };

    chrome.runtime.onMessage.addListener(handleCommand);
    return () => chrome.runtime.onMessage.removeListener(handleCommand);
  }, [isMenuOpen, openAssistant]);

  // ── Focus tracking ──
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      // Cancel pending blur timeout (handles tab-switch race)
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = 0;
      }

      const target = e.target as Element;
      if (isEditableElement(target)) {
        const adapter = createAdapter(target);
        if (adapter) {
          const ctx: ActiveContext = {
            type: "input",
            adapter,
            text: adapter.getSelection().text || adapter.getText(),
            rect: adapter.getCaretRect(),
          };
          activeContextRef.current = ctx;
          setActiveContext(ctx);
          anchorRectRef.current = ctx.rect;
          setAnchorRect(ctx.rect);
          setIsMenuOpen(false);
          try {
            const opts = computeInferenceOptions(adapter);
            setInferenceOptions(opts);
            setSelectedInferenceLevel(opts.best?.level ?? null);
          } catch (_err) {
            setInferenceOptions(null);
            setSelectedInferenceLevel(null);
          }
        }
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      if (isInsideShadow.current) return;
      if (isMenuOpenRef.current || pendingPreviewRef.current) return;

      const relatedTarget = e.relatedTarget as Element | null;
      if (relatedTarget && isEditableElement(relatedTarget)) return;

      blurTimeoutRef.current = window.setTimeout(() => {
        if (isInsideShadow.current) return;
        if (isMenuOpenRef.current || pendingPreviewRef.current) return;
        activeContextRef.current = null;
        setActiveContext(null);
        anchorRectRef.current = null;
        setAnchorRect(null);
        setIsMenuOpen(false);
      }, 120);
    };

    const handleRestoreFocus = () => {
      const ctx = resolveActiveContext();
      if (ctx) {
        activeContextRef.current = ctx;
        setActiveContext(ctx);
        anchorRectRef.current = ctx.rect;
        setAnchorRect(ctx.rect);
      }
    };

    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("focus", handleRestoreFocus);
    document.addEventListener("visibilitychange", handleRestoreFocus);

    handleRestoreFocus();

    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("focus", handleRestoreFocus);
      document.removeEventListener("visibilitychange", handleRestoreFocus);
    };
  }, []);

  // ── Throttled rect updater (input type only) ──
  const updateRect = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const ctx = activeContextRef.current;
      if (ctx?.type === "input" && ctx.adapter) {
        const newRect = ctx.adapter.getCaretRect();
        anchorRectRef.current = newRect;
        setAnchorRect(newRect);
      }
    });
  }, []);

  // Re-attach scroll/input listeners when the input element changes
  const trackedElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el =
      activeContext?.type === "input" && activeContext.adapter
        ? activeContext.adapter.getElement()
        : null;

    if (el === trackedElRef.current) return;
    trackedElRef.current = el;

    if (!el) return;

    updateRect();

    window.addEventListener("scroll", updateRect, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", updateRect, { passive: true });
    el.addEventListener("input", updateRect);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      el.removeEventListener("input", updateRect);
    };
  }, [activeContext, updateRect]);

  // ── Floating-ui auto-positioning ──
  useEffect(() => {
    if (!isMenuOpen || !menuRef.current || !anchorRectRef.current) return;

    const virtualEl: VirtualElement = {
      getBoundingClientRect: () => anchorRectRef.current!,
    };

    return autoPositionElement(virtualEl, menuRef.current, setMenuPos, {
      placement: "top",
      gap: 6,
    });
  }, [isMenuOpen]);

  // ── Click outside to close ──
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (_e: MouseEvent) => {
      if (!isInsideShadow.current) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [isMenuOpen]);

  // ── MutationObserver: detect removed active element ──
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const ctx = activeContextRef.current;
      if (ctx?.adapter) {
        const el = ctx.adapter.getElement();
        if (!document.contains(el)) {
          activeContextRef.current = null;
          setActiveContext(null);
          anchorRectRef.current = null;
          setAnchorRect(null);
          setIsMenuOpen(false);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // ── Menu keyboard-nav indices (primary → custom → tone → length) ──
  const PRIMARY_ACTION_COUNT = 3;
  const TONE_ACTION_COUNT = 4;
  const LENGTH_ACTION_COUNT = 2;
  const customActionCount = customActions.length;
  const toneActionStartIdx = PRIMARY_ACTION_COUNT + customActionCount;
  const lengthActionStartIdx = toneActionStartIdx + TONE_ACTION_COUNT;
  const actionItemCount =
    lengthActionStartIdx + LENGTH_ACTION_COUNT;

  useEffect(() => {
    isMenuOpenRef.current = isMenuOpen;
  }, [isMenuOpen]);

  useEffect(() => {
    pendingPreviewRef.current = !!pendingPreview;
  }, [pendingPreview]);

  useEffect(() => {
    if (!pendingPreview) return;
    saveEditorFocus();
    requestAnimationFrame(() => restoreEditorFocus());
  }, [pendingPreview, saveEditorFocus, restoreEditorFocus]);

  // ── Keep editor focused while menu is open; restore when it closes ──
  useEffect(() => {
    if (isMenuOpen) {
      setFocusedActionIdx(0);
      saveEditorFocus();
      requestAnimationFrame(() => restoreEditorFocus());
    } else {
      requestAnimationFrame(() => restoreEditorFocus());
    }
  }, [isMenuOpen, saveEditorFocus, restoreEditorFocus]);

  useEffect(() => {
    focusedActionIdxRef.current = focusedActionIdx;
  }, [focusedActionIdx]);

  // Keep focus index valid when custom actions load or change while menu is open
  useEffect(() => {
    if (!isMenuOpen || actionItemCount === 0) return;
    setFocusedActionIdx((prev) =>
      prev >= actionItemCount ? actionItemCount - 1 : prev,
    );
  }, [isMenuOpen, actionItemCount]);

  const activateMenuActionAtIndex = useCallback(
    (idx: number) => {
      const override =
        inferenceOptions && selectedInferenceLevel
          ? inferenceOptions[selectedInferenceLevel]
          : undefined;

      const primary = ["improve", "paraphrase", "fix_spelling"] as const;
      const tones = [
        "tone_professional",
        "tone_casual",
        "tone_exciting",
        "tone_friendly",
      ] as const;
      const lengths = ["length_shorter", "length_longer"] as const;

      let actionId: string | null = null;
      if (idx < PRIMARY_ACTION_COUNT) {
        actionId = primary[idx] ?? null;
      } else if (idx < PRIMARY_ACTION_COUNT + customActions.length) {
        actionId = customActions[idx - PRIMARY_ACTION_COUNT]?.id ?? null;
      } else if (
        idx <
        PRIMARY_ACTION_COUNT + customActions.length + TONE_ACTION_COUNT
      ) {
        actionId =
          tones[idx - PRIMARY_ACTION_COUNT - customActions.length] ?? null;
      } else {
        const lenIdx =
          idx -
          PRIMARY_ACTION_COUNT -
          customActions.length -
          TONE_ACTION_COUNT;
        actionId = lengths[lenIdx] ?? null;
      }

      if (actionId) {
        suppressKeysUntilRef.current = performance.now() + 250;
        triggerAIAction(actionId, override);
      }
    },
    [
      inferenceOptions,
      selectedInferenceLevel,
      customActions,
      triggerAIAction,
    ],
  );

  // ── Preview floating position ──
  useEffect(() => {
    if (!pendingPreview || !previewRef.current || !anchorRectRef.current) {
      return;
    }

    const virtualEl: VirtualElement = {
      getBoundingClientRect: () => anchorRectRef.current!,
    };

    return autoPositionElement(virtualEl, previewRef.current, setPreviewPos, {
      placement: "top",
      gap: 6,
    });
  }, [pendingPreview]);

  // ── Capture keyboard so Enter/Space never reach the field behind ──
  useEffect(() => {
    if (!isMenuOpen && !pendingPreview) return;

    const armSuppression = () => {
      suppressKeysUntilRef.current = performance.now() + 250;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldSuppressActivationKey(e, suppressKeysUntilRef.current)) {
        consumeKeyboardEvent(e);
        return;
      }

      if (pendingPreview) {
        if (isActivationKey(e.key)) {
          consumeKeyboardEvent(e);
          applyPendingPreview();
          armSuppression();
          return;
        }
        if (e.key === "Escape") {
          consumeKeyboardEvent(e);
          discardPendingPreview();
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          consumeKeyboardEvent(e);
        }
        return;
      }

      if (!isMenuOpen || actionItemCount === 0) return;

      switch (e.key) {
        case "ArrowDown":
          consumeKeyboardEvent(e);
          setFocusedActionIdx(
            (prev) => (prev + 1) % actionItemCount,
          );
          break;
        case "ArrowUp":
          consumeKeyboardEvent(e);
          setFocusedActionIdx(
            (prev) => (prev - 1 + actionItemCount) % actionItemCount,
          );
          break;
        case "Enter":
        case " ":
        case "Spacebar":
          consumeKeyboardEvent(e);
          activateMenuActionAtIndex(focusedActionIdxRef.current);
          break;
        case "Escape":
          consumeKeyboardEvent(e);
          setIsMenuOpen(false);
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        shouldSuppressActivationKey(e, suppressKeysUntilRef.current) ||
        (isMenuOpen && isActivationKey(e.key)) ||
        (pendingPreview && isActivationKey(e.key))
      ) {
        consumeKeyboardEvent(e);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [
    isMenuOpen,
    pendingPreview,
    actionItemCount,
    activateMenuActionAtIndex,
    applyPendingPreview,
    discardPendingPreview,
  ]);

  const handleShadowEnter = () => {
    isInsideShadow.current = true;
  };
  const handleShadowLeave = () => {
    isInsideShadow.current = false;
  };

  // ── Render ──
  if (!pendingPreview && (!anchorRect || !activeContext)) return null;

  const rect = anchorRect;
  const showFieldChrome =
    !!activeContext && !!rect && rect.height >= 5;

  const menuWidth = 240;
  const showDot =
    showFieldChrome && !hideDot && activeContext!.type === "input";
  const dotSize = 16;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 2147483647,
      }}
      onMouseEnter={handleShadowEnter}
      onMouseLeave={handleShadowLeave}
    >
      {/* ── Preview dialog (custom actions with preview replace mode) ── */}
      {pendingPreview && (
        <PreviewPanel
          panelRef={previewRef}
          preview={pendingPreview}
          top={previewPos.top}
          left={previewPos.left}
          width={menuWidth}
          onApply={() => {
            suppressKeysUntilRef.current = performance.now() + 250;
            applyPendingPreview();
          }}
          onDiscard={discardPendingPreview}
          onPointerEnter={handleShadowEnter}
          onPointerLeave={handleShadowLeave}
        />
      )}

      {/* ── Dot trigger (input type only) ── */}
      {showDot && (() => {
        const el = activeContext!.adapter?.getElement();
        if (!el) return null;
        const elRect = el.getBoundingClientRect();
        return (
          <div
            ref={dotRef}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              saveEditorFocus();
              if (!isMenuOpen) {
                const ctx = resolveActiveContext();
                if (ctx) {
                  activeContextRef.current = ctx;
                  setActiveContext(ctx);
                  anchorRectRef.current = ctx.rect;
                  setAnchorRect(ctx.rect);
                  if (ctx.adapter) {
                    try {
                      const opts = computeInferenceOptions(ctx.adapter);
                      setInferenceOptions(opts);
                      setSelectedInferenceLevel(opts.best?.level ?? null);
                    } catch (_err) {
                      setInferenceOptions(null);
                      setSelectedInferenceLevel(null);
                    }
                  }
                }
              }
              setIsMenuOpen((prev) => !prev);
            }}
            style={{
              position: "fixed",
              bottom: `${window.innerHeight - elRect.bottom + 4}px`,
              right: `${window.innerWidth - elRect.right + 4}px`,
              width: `${dotSize}px`,
              height: `${dotSize}px`,
              pointerEvents: "auto",
              zIndex: 2147483647,
              background: "#8B5CF6",
              borderRadius: "50%",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 12px rgba(139, 92, 246, 0.6)",
            }}
          >
            <ChevronUp size={10} color="white" strokeWidth={3} style={{ pointerEvents: "none" }} />
          </div>
        );
      })()}

      {/* ── Floating Action Menu ── */}
      {showFieldChrome && isMenuOpen && (
        <div
          ref={menuRef}
          onMouseDownCapture={(e) => {
            e.preventDefault();
            isInsideShadow.current = true;
            restoreEditorFocus();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          style={{
            outline: "none",
            position: "fixed",
            top: `${menuPos.top}px`,
            left: `${menuPos.left}px`,
            width: `${menuWidth}px`,
            pointerEvents: "auto",
            zIndex: 2147483646,
            background: "#09090b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            padding: "5px",
            boxShadow:
              "0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 1px 3px rgba(255, 255, 255, 0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            fontFamily: "Geist, 'Outfit', -apple-system, sans-serif",
            animation: "fadeInUp 0.1s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "6px 8px 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles style={{ width: 11, height: 11, color: "#fafafa" }} />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#71717a",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                HONE
              </span>
            </div>
            {shortcut && shortcut.key && (
              <span
                style={{
                  fontSize: 8,
                  color: "#52525b",
                  fontWeight: 600,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                  padding: "2px 4px",
                  borderRadius: 3,
                  fontFamily: "monospace",
                }}
              >
                {shortcut.alt ? "⌥" : ""}
                {shortcut.shift ? "⇧" : ""}
                {shortcut.ctrl ? "⌃" : ""}
                {shortcut.key.toUpperCase()}
              </span>
            )}
          </div>

          <div style={{ height: 1, background: "#27272a", margin: "4px 0" }} />

          {/* Inference chooser */}
          {inferenceOptions && selectedInferenceLevel && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
              }}
            >
              <button
                onClick={() => {
                  const order: Array<
                    "selection" | "sentence" | "paragraph" | "field"
                  > = ["selection", "sentence", "paragraph", "field"];
                  const idx = order.indexOf(selectedInferenceLevel);
                  const next = order[(idx - 1 + order.length) % order.length];
                  setSelectedInferenceLevel(next);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #27272a",
                  color: "#a1a1aa",
                  padding: "4px",
                  borderRadius: 4,
                }}
                title="Previous inference level"
              >
                ‹
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{ fontSize: 11, color: "#e6e6e9", fontWeight: 700 }}
                >
                  {(selectedInferenceLevel || "").toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#a1a1aa",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {(() => {
                    const opt =
                      inferenceOptions[
                        selectedInferenceLevel as string as keyof typeof inferenceOptions
                      ];
                    if (!opt) return "";
                    const t = (opt.text || "").replace(/\s+/g, " ").trim();
                    return t.length > 80 ? t.slice(0, 77) + "..." : t;
                  })()}
                </div>
              </div>

              <button
                onClick={() => {
                  const order: Array<
                    "selection" | "sentence" | "paragraph" | "field"
                  > = ["selection", "sentence", "paragraph", "field"];
                  const idx = order.indexOf(selectedInferenceLevel);
                  const next = order[(idx + 1) % order.length];
                  setSelectedInferenceLevel(next);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #27272a",
                  color: "#a1a1aa",
                  padding: "4px",
                  borderRadius: 4,
                }}
                title="Next inference level"
              >
                ›
              </button>
            </div>
          )}

          {/* Primary actions (only when adapter exists) */}
          {activeContext?.adapter && (
            <>
              {[
                {
                  action: "improve",
                  icon: <Feather style={{ width: 12, height: 12 }} />,
                  label: "Improve writing",
                },
                {
                  action: "paraphrase",
                  icon: <RefreshCw style={{ width: 12, height: 12 }} />,
                  label: "Paraphrase text",
                },
                {
                  action: "fix_spelling",
                  icon: <Check style={{ width: 12, height: 12 }} />,
                  label: "Fix spelling & grammar",
                },
              ].map((item, i) => (
                <button
                  key={item.action}
                  data-action-idx={i}
                  onClick={() => {
                    const override =
                      inferenceOptions && selectedInferenceLevel
                        ? inferenceOptions[selectedInferenceLevel]
                        : undefined;
                    triggerAIAction(item.action, override);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: focusedActionIdx === i
                      ? "rgba(255, 255, 255, 0.04)"
                      : "none",
                    border: "none",
                    padding: "6px 8px",
                    borderRadius: 4,
                    color: focusedActionIdx === i ? "#ffffff" : "#a1a1aa",
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "all 0.1s ease",
                  }}
                  onMouseEnter={() => setFocusedActionIdx(i)}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: "#71717a",
                      transition: "color 0.1s",
                    }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}

              {/* ── Custom Actions ── */}
              {customActions.length > 0 && (
                <>
                  <div
                    style={{
                      height: 1,
                      background: "#27272a",
                      margin: "4px 0",
                    }}
                  />
                  <div
                    style={{
                      padding: "2px 8px",
                      fontSize: 8.5,
                      fontWeight: 700,
                      color: "#71717a",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Custom Actions
                  </div>
                  {customActions.map((ca, i) => {
                    const idx = PRIMARY_ACTION_COUNT + i;
                    const isFocused = focusedActionIdx === idx;
                    return (
                      <button
                        key={ca.id}
                        data-action-idx={idx}
                        onClick={() => {
                          const override =
                            inferenceOptions && selectedInferenceLevel
                              ? inferenceOptions[selectedInferenceLevel]
                              : undefined;
                          triggerAIAction(ca.id, override);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          background: isFocused
                            ? "rgba(255, 255, 255, 0.04)"
                            : "none",
                          border: "none",
                          padding: "6px 8px",
                          borderRadius: 4,
                          color: isFocused ? "#ffffff" : "#a1a1aa",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                          transition: "all 0.1s ease",
                        }}
                        onMouseEnter={() => setFocusedActionIdx(idx)}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            color: "#71717a",
                          }}
                        >
                          {renderActionIcon(ca.icon, {
                            size: 12,
                            color: ca.color || "#8B5CF6",
                          })}
                        </span>
                        {ca.name}
                      </button>
                    );
                  })}
                </>
              )}

              <div
                style={{ height: 1, background: "#27272a", margin: "4px 0" }}
              />

              {/* Change Tone */}
              <div
                style={{
                  padding: "2px 8px",
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: "#71717a",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Change Tone
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                  padding: "2px 4px 4px",
                }}
              >
                {[
                  {
                    action: "tone_professional",
                    icon: <Briefcase style={{ width: 11, height: 11 }} />,
                    label: "Professional",
                  },
                  {
                    action: "tone_casual",
                    icon: <MessageSquare style={{ width: 11, height: 11 }} />,
                    label: "Casual",
                  },
                  {
                    action: "tone_exciting",
                    icon: <Zap style={{ width: 11, height: 11 }} />,
                    label: "Exciting",
                  },
                  {
                    action: "tone_friendly",
                    icon: <Heart style={{ width: 11, height: 11 }} />,
                    label: "Friendly",
                  },
                ].map((item, i) => {
                  const idx = toneActionStartIdx + i;
                  const isFocused = focusedActionIdx === idx;
                  return (
                    <button
                      key={item.action}
                      data-action-idx={idx}
                      onClick={() => {
                        const override =
                          inferenceOptions && selectedInferenceLevel
                            ? inferenceOptions[selectedInferenceLevel]
                            : undefined;
                        triggerAIAction(item.action, override);
                      }}
                      style={{
                        background: isFocused
                          ? "rgba(255, 255, 255, 0.04)"
                          : "transparent",
                        border: `1px solid ${isFocused ? "#3f3f46" : "#27272a"}`,
                        borderRadius: 4,
                        padding: "5px 8px",
                        color: isFocused ? "#ffffff" : "#a1a1aa",
                        fontSize: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: "all 0.1s ease",
                      }}
                      onMouseEnter={() => setFocusedActionIdx(idx)}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          color: "#71717a",
                          transition: "color 0.1s",
                        }}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{ height: 1, background: "#27272a", margin: "4px 0" }}
              />

              {/* Change Length */}
              <div
                style={{
                  padding: "2px 8px",
                  fontSize: 8.5,
                  fontWeight: 700,
                  color: "#71717a",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Change Length
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                  padding: "2px 4px 6px",
                }}
              >
                {[
                  {
                    action: "length_shorter",
                    icon: <Minimize2 style={{ width: 11, height: 11 }} />,
                    label: "Shorter",
                  },
                  {
                    action: "length_longer",
                    icon: <Maximize2 style={{ width: 11, height: 11 }} />,
                    label: "Longer",
                  },
                ].map((item, i) => {
                  const idx = lengthActionStartIdx + i;
                  const isFocused = focusedActionIdx === idx;
                  return (
                    <button
                      key={item.action}
                      data-action-idx={idx}
                      onClick={() => {
                        const override =
                          inferenceOptions && selectedInferenceLevel
                            ? inferenceOptions[selectedInferenceLevel]
                            : undefined;
                        triggerAIAction(item.action, override);
                      }}
                      style={{
                        background: isFocused
                          ? "rgba(255, 255, 255, 0.04)"
                          : "transparent",
                        border: `1px solid ${isFocused ? "#3f3f46" : "#27272a"}`,
                        borderRadius: 4,
                        padding: "5px 8px",
                        color: isFocused ? "#ffffff" : "#a1a1aa",
                        fontSize: 10,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        transition: "all 0.1s ease",
                      }}
                      onMouseEnter={() => setFocusedActionIdx(idx)}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          color: "#71717a",
                          transition: "color 0.1s",
                        }}
                      >
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Read-only selection: limited options */}
          {!activeContext?.adapter && (
            <div
              style={{
                padding: "8px",
                color: "#a1a1aa",
                fontSize: 11,
                textAlign: "center",
              }}
            >
              Text selected (read-only)
            </div>
          )}
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            pointerEvents: "auto",
            zIndex: 2147483647,
            background: "rgba(9,12,22,0.95)",
            border:
              toast.type === "success"
                ? "1px solid rgba(34,197,94,0.3)"
                : "1px solid rgba(239,68,68,0.3)",
            color: toast.type === "success" ? "#4ade80" : "#f87171",
            animation: "fadeInUp 0.15s ease-out",
          }}
        >
          {toast.type === "success" ? (
            <Check style={{ width: 13, height: 13, color: "#22c55e" }} />
          ) : (
            <AlertCircle style={{ width: 13, height: 13, color: "#ef4444" }} />
          )}
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
