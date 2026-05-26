/** Prevent a keyboard event from reaching the page (e.g. editable fields). */
export function consumeKeyboardEvent(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

const SUPPRESS_KEYS = new Set(["Enter", " ", "Spacebar"]);

export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function shouldSuppressActivationKey(
  e: KeyboardEvent,
  suppressUntil: number,
): boolean {
  if (performance.now() > suppressUntil) return false;
  return SUPPRESS_KEYS.has(e.key);
}
