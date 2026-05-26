export const BUILTIN_ACTION_LABELS: Record<string, string> = {
  paraphrase: "Paraphrase text",
  improve: "Improve writing",
  fix_spelling: "Fix spelling & grammar",
  tone_professional: "Tone: Professional",
  tone_casual: "Tone: Casual",
  tone_exciting: "Tone: Exciting",
  tone_friendly: "Tone: Friendly",
  length_shorter: "Make shorter",
  length_longer: "Make longer",
  toggle_menu: "Open actions menu",
};

/** Built-in actions available for the quick keyboard shortcut */
export const BUILTIN_SHORTCUT_ACTIONS = [
  { id: "fix_spelling", label: "Fix spelling & grammar" },
  { id: "improve", label: "Improve writing" },
  { id: "paraphrase", label: "Paraphrase text" },
  { id: "tone_professional", label: "Tone: Professional" },
  { id: "tone_casual", label: "Tone: Casual" },
  { id: "tone_exciting", label: "Tone: Exciting" },
  { id: "tone_friendly", label: "Tone: Friendly" },
  { id: "length_shorter", label: "Make shorter" },
  { id: "length_longer", label: "Make longer" },
] as const;

export const CUSTOM_ACTION_PLACEHOLDERS = {
  name: "e.g. Summarize selection",
  description: "Short note about what this action does",
  promptTemplate:
    "Transform the text below according to your instructions. Return only the rewritten text with no preamble or explanation.\n\n{{input}}",
  systemPrompt:
    "You are a helpful writing assistant. Follow the user prompt template exactly.",
  testInput: "Paste sample text here to try this action…",
} as const;

export function formatShortcutCombo(parts: {
  key?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}): string | null {
  if (!parts.key) return null;

  const keys: string[] = [];
  if (parts.ctrl) keys.push("Ctrl");
  if (parts.alt) keys.push("Alt");
  if (parts.shift) keys.push("Shift");
  if (parts.meta) keys.push("⌘");
  keys.push(parts.key.length === 1 ? parts.key.toUpperCase() : parts.key);

  return keys.join("+");
}

export function getActionLabel(
  actionId: string,
  customActions?: { id: string; name: string }[],
): string {
  if (BUILTIN_ACTION_LABELS[actionId]) {
    return BUILTIN_ACTION_LABELS[actionId];
  }
  const custom = customActions?.find((a) => a.id === actionId);
  if (custom) return custom.name;
  return actionId;
}
