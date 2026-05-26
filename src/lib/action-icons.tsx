import type { LucideIcon } from "lucide-react";
import {
  AlignLeft,
  BookOpen,
  Briefcase,
  Check,
  Feather,
  FileText,
  Globe,
  Hash,
  Heart,
  Languages,
  Lightbulb,
  List,
  Mail,
  Maximize2,
  MessageSquare,
  Minimize2,
  PenLine,
  Quote,
  RefreshCw,
  Search,
  Smile,
  Sparkles,
  Type,
  Wand2,
  Zap,
} from "lucide-react";

export const DEFAULT_ACTION_ICON = "Sparkles";

export const ACTION_ICON_OPTIONS = [
  { name: "Sparkles", label: "AI / Magic" },
  { name: "Wand2", label: "Transform" },
  { name: "Feather", label: "Writing" },
  { name: "PenLine", label: "Edit" },
  { name: "RefreshCw", label: "Rewrite" },
  { name: "Check", label: "Grammar" },
  { name: "Languages", label: "Translate" },
  { name: "FileText", label: "Document" },
  { name: "MessageSquare", label: "Message" },
  { name: "Mail", label: "Email" },
  { name: "Type", label: "Typography" },
  { name: "AlignLeft", label: "Format" },
  { name: "List", label: "List" },
  { name: "Quote", label: "Quote" },
  { name: "BookOpen", label: "Reading" },
  { name: "Lightbulb", label: "Ideas" },
  { name: "Search", label: "Refine" },
  { name: "Globe", label: "Web" },
  { name: "Hash", label: "Tags" },
  { name: "Briefcase", label: "Professional" },
  { name: "Heart", label: "Friendly" },
  { name: "Smile", label: "Casual" },
  { name: "Zap", label: "Energetic" },
  { name: "Minimize2", label: "Shorter" },
  { name: "Maximize2", label: "Longer" },
] as const;

export type ActionIconName = (typeof ACTION_ICON_OPTIONS)[number]["name"];

const ICON_COMPONENTS: Record<ActionIconName, LucideIcon> = {
  Sparkles,
  Wand2,
  Feather,
  PenLine,
  RefreshCw,
  Check,
  Languages,
  FileText,
  MessageSquare,
  Mail,
  Type,
  AlignLeft,
  List,
  Quote,
  BookOpen,
  Lightbulb,
  Search,
  Globe,
  Hash,
  Briefcase,
  Heart,
  Smile,
  Zap,
  Minimize2,
  Maximize2,
};

export function isActionIconName(name: string): name is ActionIconName {
  return name in ICON_COMPONENTS;
}

export function normalizeActionIconName(
  icon: string | undefined,
): ActionIconName {
  if (icon && isActionIconName(icon)) return icon;
  return DEFAULT_ACTION_ICON;
}

export function getActionIconComponent(
  icon: string | undefined,
): LucideIcon {
  const name = normalizeActionIconName(icon);
  return ICON_COMPONENTS[name];
}

export function renderActionIcon(
  icon: string | undefined,
  options?: { size?: number; color?: string; className?: string },
) {
  const Icon = getActionIconComponent(icon);
  const size = options?.size ?? 12;
  return (
    <Icon
      className={options?.className}
      style={{
        width: size,
        height: size,
        color: options?.color,
        flexShrink: 0,
      }}
      strokeWidth={2}
      aria-hidden
    />
  );
}
