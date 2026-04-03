export interface RdevInteractionFrame {
  translateX: number;
  translateY: number;
  filterOffsetX: number;
  filterOffsetY: number;
  scaleX: number;
  scaleY: number;
  highlightX: number;
  highlightY: number;
  highlightAngle: number;
  highlightOpacity: number;
  glowOpacity: number;
  rimOpacity: number;
  pressed: number;
}

export interface RdevInteractionController {
  destroy(): void;
  updateElasticity(elasticity: number): void;
}

interface InteractionState {
  currentX: number;
  currentY: number;
  currentPressed: number;
  targetX: number;
  targetY: number;
  targetPressed: number;
  inside: boolean;
  elasticity: number;
  rafId: number | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createRestInteractionFrame(): RdevInteractionFrame {
  return {
    translateX: 0,
    translateY: 0,
    filterOffsetX: 0,
    filterOffsetY: 0,
    scaleX: 1,
    scaleY: 1,
    highlightX: 50,
    highlightY: 16,
    highlightAngle: 138,
    highlightOpacity: 0.1,
    glowOpacity: 0.08,
    rimOpacity: 0.5,
    pressed: 0,
  };
}

export function createRdevInteractionController(
  hostEl: HTMLElement,
  elasticity: number,
  onFrame: (frame: RdevInteractionFrame) => void,
): RdevInteractionController {
  const state: InteractionState = {
    currentX: 0,
    currentY: 0,
    currentPressed: 0,
    targetX: 0,
    targetY: 0,
    targetPressed: 0,
    inside: false,
    elasticity: clamp(elasticity, 0, 1),
    rafId: null,
  };

  const scheduleFrame = (): void => {
    if (state.rafId !== null) {
      return;
    }

    state.rafId = window.requestAnimationFrame(() => {
      state.rafId = null;

      const easing = state.inside ? 0.18 : 0.14;
      state.currentX += (state.targetX - state.currentX) * easing;
      state.currentY += (state.targetY - state.currentY) * easing;
      state.currentPressed += (state.targetPressed - state.currentPressed) * 0.24;

      const magnitude = Math.min(1, Math.hypot(state.currentX, state.currentY));
      const response = magnitude * state.elasticity;
      const stretch = response * 0.05;
      const pressDepth = state.currentPressed * (0.008 + state.elasticity * 0.006);

      const frame: RdevInteractionFrame = {
        translateX: clamp(state.currentX * response * 10, -4, 4),
        translateY: clamp(state.currentY * response * 8, -3, 3),
        filterOffsetX: clamp(state.currentX * response * 16, -6, 6),
        filterOffsetY: clamp(state.currentY * response * 12, -5, 5),
        scaleX: clamp(
          1 + Math.abs(state.currentX) * stretch - Math.abs(state.currentY) * stretch * 0.42 - pressDepth,
          0.96,
          1.04,
        ),
        scaleY: clamp(
          1 + Math.abs(state.currentY) * stretch - Math.abs(state.currentX) * stretch * 0.42 - pressDepth,
          0.96,
          1.04,
        ),
        highlightX: 50 + state.currentX * 18,
        highlightY: 16 + state.currentY * 10,
        highlightAngle: 138 + state.currentX * 24 - state.currentY * 18,
        highlightOpacity: clamp(0.1 + response * 0.9 + state.currentPressed * 0.12, 0.1, 1),
        glowOpacity: clamp(0.08 + response * 0.72 + state.currentPressed * 0.08, 0.08, 0.9),
        rimOpacity: clamp(0.5 + response * 0.6, 0.5, 1),
        pressed: state.currentPressed,
      };

      onFrame(frame);

      const shouldContinue =
        Math.abs(state.currentX - state.targetX) > 0.001 ||
        Math.abs(state.currentY - state.targetY) > 0.001 ||
        Math.abs(state.currentPressed - state.targetPressed) > 0.001;

      if (shouldContinue) {
        scheduleFrame();
      }
    });
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const rect = hostEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    state.inside = true;
    state.targetX = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    state.targetY = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    scheduleFrame();
  };

  const handlePointerEnter = (): void => {
    state.inside = true;
    scheduleFrame();
  };

  const handlePointerLeave = (): void => {
    state.inside = false;
    state.targetX = 0;
    state.targetY = 0;
    state.targetPressed = 0;
    scheduleFrame();
  };

  const handlePointerDown = (): void => {
    state.targetPressed = 1;
    scheduleFrame();
  };

  const handlePointerUp = (): void => {
    state.targetPressed = 0;
    scheduleFrame();
  };

  hostEl.addEventListener('pointerenter', handlePointerEnter);
  hostEl.addEventListener('pointermove', handlePointerMove, { passive: true });
  hostEl.addEventListener('pointerleave', handlePointerLeave);
  hostEl.addEventListener('pointerdown', handlePointerDown, { passive: true });
  hostEl.addEventListener('pointerup', handlePointerUp, { passive: true });
  hostEl.addEventListener('pointercancel', handlePointerUp, { passive: true });

  return {
    destroy(): void {
      hostEl.removeEventListener('pointerenter', handlePointerEnter);
      hostEl.removeEventListener('pointermove', handlePointerMove);
      hostEl.removeEventListener('pointerleave', handlePointerLeave);
      hostEl.removeEventListener('pointerdown', handlePointerDown);
      hostEl.removeEventListener('pointerup', handlePointerUp);
      hostEl.removeEventListener('pointercancel', handlePointerUp);

      if (state.rafId !== null) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
    },
    updateElasticity(nextElasticity: number): void {
      state.elasticity = clamp(nextElasticity, 0, 1);
      scheduleFrame();
    },
  };
}
