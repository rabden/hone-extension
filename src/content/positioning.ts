import {
  computePosition,
  flip,
  shift,
  offset,
  autoUpdate,
  type Middleware,
  type Placement,
} from '@floating-ui/dom';

export interface PositionResult {
  top: number;
  left: number;
  isFlipped: boolean;
}

export type VirtualElement = { getBoundingClientRect(): DOMRect };

/**
 * Position a floating element relative to a reference element or virtual element.
 * Handles transforms, scroll containers, zoom, viewport edges, iframe offsets.
 */
export async function positionElement(
  referenceEl: Element | VirtualElement,
  floatingEl: HTMLElement,
  options: {
    placement?: Placement;
    gap?: number;
    fallbackPlacement?: boolean;
  } = {}
): Promise<PositionResult> {
  const {
    placement = 'top',
    gap = 12,
    fallbackPlacement = true,
  } = options;

  const middleware: Middleware[] = [
    offset(gap),
  ];

  if (fallbackPlacement) {
    middleware.push(flip({ padding: 8 }));
  }

  middleware.push(shift({ padding: 8 }));

  const result = await computePosition(referenceEl, floatingEl, {
    placement,
    middleware,
  });

  return {
    top: result.y,
    left: result.x,
    isFlipped: result.placement !== placement,
  };
}

/**
 * Auto-update positioning on scroll, resize, or layout changes.
 * Returns a cleanup function.
 */
export function autoPositionElement(
  referenceEl: Element | VirtualElement,
  floatingEl: HTMLElement,
  onPosition: (pos: PositionResult) => void,
  options: {
    placement?: Placement;
    gap?: number;
    fallbackPlacement?: boolean;
  } = {}
): () => void {
  const cleanup = autoUpdate(referenceEl as any, floatingEl, async () => {
    const pos = await positionElement(referenceEl, floatingEl, options);
    onPosition(pos);
  });

  return cleanup;
}
