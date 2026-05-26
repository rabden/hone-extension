import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ACTION_ICON_OPTIONS,
  DEFAULT_ACTION_ICON,
  normalizeActionIconName,
  renderActionIcon,
} from "@/lib/action-icons";
import { cn } from "@/lib/utils";

interface ActionIconSelectProps {
  value?: string;
  onValueChange: (iconName: string) => void;
  accentColor?: string;
  className?: string;
}

export function ActionIconSelect({
  value,
  onValueChange,
  accentColor = "#8B5CF6",
  className,
}: ActionIconSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedIcon = normalizeActionIconName(value);
  const selectedLabel =
    ACTION_ICON_OPTIONS.find((o) => o.name === selectedIcon)?.label ?? "Icon";

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-2",
          "text-xs transition-colors hover:bg-muted/40",
          open && "border-foreground/25 ring-2 ring-ring/30",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {renderActionIcon(selectedIcon, { size: 14, color: accentColor })}
          <span className="truncate text-muted-foreground">{selectedLabel}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose action icon"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-full min-w-[10.75rem] rounded-lg border border-border bg-card p-1 shadow-md"
        >
          <div className="grid grid-cols-5 gap-0.5">
            {ACTION_ICON_OPTIONS.map(({ name, label }) => {
              const isSelected = selectedIcon === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  title={label}
                  onClick={() => {
                    onValueChange(name);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors",
                    "hover:bg-muted/80",
                    isSelected && "bg-foreground/[0.06]",
                  )}
                  style={
                    isSelected
                      ? { outline: `1.5px solid ${accentColor}`, outlineOffset: 0 }
                      : undefined
                  }
                >
                  {renderActionIcon(name, { size: 13, color: accentColor })}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export { DEFAULT_ACTION_ICON };
