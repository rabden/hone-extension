import type { RefObject } from "react";
import { renderActionIcon } from "@/lib/action-icons";
import type { PendingPreview } from "./preview-types";

export type { PendingPreview } from "./preview-types";

interface PreviewPanelProps {
  preview: PendingPreview;
  top: number;
  left: number;
  width: number;
  panelRef: RefObject<HTMLDivElement | null>;
  onApply: () => void;
  onDiscard: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function PreviewPanel({
  preview,
  top,
  left,
  width,
  panelRef,
  onApply,
  onDiscard,
  onPointerEnter,
  onPointerLeave,
}: PreviewPanelProps) {
  const accent = preview.color || "#8B5CF6";

  const truncate = (text: string, max: number) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max - 1)}…`;
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="hone-preview-title"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        outline: "none",
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        pointerEvents: "auto",
        zIndex: 2147483647,
        background: "#09090b",
        border: `1px solid ${accent}55`,
        borderRadius: 6,
        padding: "5px",
        boxShadow:
          "0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 0 20px rgba(139, 92, 246, 0.15)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily: "Geist, 'Outfit', -apple-system, sans-serif",
        animation: "fadeInUp 0.1s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          padding: "4px 6px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {renderActionIcon(preview.icon, { size: 12, color: accent })}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            id="hone-preview-title"
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#fafafa",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {preview.actionName}
          </div>
          <div style={{ fontSize: 9, color: "#71717a" }}>
            {preview.span.level} · review before apply
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: "#27272a" }} />

      <div style={{ padding: "4px 6px", display: "flex", flexDirection: "column", gap: 6 }}>
        <PreviewSnippet label="Was" text={truncate(preview.originalText, 120)} />
        <PreviewSnippet
          label="Suggested"
          text={truncate(preview.resultText, 160)}
          accent={accent}
        />
      </div>

      <div style={{ height: 1, background: "#27272a" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          padding: "4px 6px 2px",
        }}
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDiscard}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 4,
            border: "1px solid #27272a",
            background: "transparent",
            color: "#a1a1aa",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Discard
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onApply}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 4,
            border: "none",
            background: accent,
            color: "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: `0 0 12px ${accent}44`,
          }}
        >
          Apply
        </button>
      </div>

      <div
        style={{
          padding: "0 6px 4px",
          fontSize: 8.5,
          color: "#52525b",
          textAlign: "center",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        ↵ or Space · apply · Esc · discard
      </div>
    </div>
  );
}

function PreviewSnippet({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 8,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#71717a",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 10,
          lineHeight: 1.45,
          color: accent ? "#fafafa" : "#a1a1aa",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 56,
          overflow: "hidden",
          padding: "4px 6px",
          borderRadius: 4,
          border: `1px solid ${accent ? `${accent}66` : "#27272a"}`,
          background: accent ? `${accent}12` : "rgba(255,255,255,0.02)",
        }}
      >
        {text || "(empty)"}
      </div>
    </div>
  );
}
