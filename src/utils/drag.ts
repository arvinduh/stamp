/**
 * @fileoverview Single-axis pointer drags that coexist with taps and with a
 * drag on the other axis.
 *
 * A drag locks to its axis only after the pointer travels a few pixels; if
 * the movement is mostly along the other axis it bows out, so a horizontal
 * and a vertical tracker can listen to the same pointer. Listeners live on
 * the window only for the duration of a gesture.
 */

/** Movement (px) before a press counts as a drag rather than a tap. */
const LOCK_DISTANCE = 6;

/** What a drag reports while it is locked to its axis. */
export interface DragCallbacks {
  /** Each move, with the offset (px) from where the press started. */
  onMove: (offset: number) => void;
  /** On release, with the final offset and release velocity (px/ms). */
  onEnd: (offset: number, velocity: number) => void;
}

/**
 * Tracks one press from `e` as a drag along `axis`.
 *
 * Side effects: adds window listeners until the press ends; after a real
 * drag, swallows the click that follows so it cannot stamp a slot.
 */
export function trackDrag(
  e: PointerEvent,
  axis: "x" | "y",
  callbacks: DragCallbacks,
): void {
  if (e.button !== 0) {
    return;
  }
  const along = (ev: PointerEvent) => (axis === "x" ? ev.clientX : ev.clientY);
  const start = along(e);
  let locked = false;
  let offset = 0;
  let lastPos = start;
  let lastTime = e.timeStamp;
  let velocity = 0;

  function move(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) {
      return;
    }
    if (!locked) {
      const dx = ev.clientX - e.clientX;
      const dy = ev.clientY - e.clientY;
      if (Math.hypot(dx, dy) < LOCK_DISTANCE) {
        return;
      }
      if (Math.abs(dx) > Math.abs(dy) !== (axis === "x")) {
        stop();
        return;
      }
      locked = true;
    }
    const pos = along(ev);
    const dt = ev.timeStamp - lastTime;
    if (dt > 0) {
      velocity = (pos - lastPos) / dt;
    }
    lastPos = pos;
    lastTime = ev.timeStamp;
    offset = pos - start;
    callbacks.onMove(offset);
  }

  function end(ev: PointerEvent) {
    if (ev.pointerId !== e.pointerId) {
      return;
    }
    stop();
    if (!locked) {
      return;
    }
    if (ev.type === "pointercancel") {
      callbacks.onEnd(0, 0);
      return;
    }
    suppressNextClick();
    callbacks.onEnd(offset, velocity);
  }

  function stop() {
    removeEventListener("pointermove", move);
    removeEventListener("pointerup", end);
    removeEventListener("pointercancel", end);
  }

  addEventListener("pointermove", move);
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
}

/** Cancels the click a browser fires right after a drag's pointerup. */
function suppressNextClick(): void {
  function block(ev: Event) {
    ev.stopPropagation();
    ev.preventDefault();
  }
  addEventListener("click", block, { capture: true, once: true });
  // The click, if any, fires in the same task as pointerup.
  setTimeout(() => removeEventListener("click", block, { capture: true }), 0);
}
