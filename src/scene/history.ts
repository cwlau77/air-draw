import type { Stroke } from "./stroke";
import { HISTORY_DEPTH } from "../config";

export type Action =
  | { type: "draw"; stroke: Stroke }
  | { type: "erase"; strokes: Stroke[] };

/**
 * Ordered stack of reversible actions.
 *
 * Undo must cover erasures, not just drawings: erase is triggered by a gesture with no
 * mode to arm it, so an accidental fist near the drawing would otherwise be permanent.
 *
 * Strokes belonging to an erase action are removed from the scene but NOT disposed,
 * because undo may restore them. They are disposed only when their action is evicted
 * past HISTORY_DEPTH — without that, erased geometry would live for the whole session.
 */
export class ActionHistory {
  private actions: Action[] = [];

  push(action: Action): void {
    this.actions.push(action);
    while (this.actions.length > HISTORY_DEPTH) {
      const evicted = this.actions.shift();
      // Only erased strokes are owned by the history. A "draw" action's stroke is still
      // live in the scene and owned by StrokeManager, so evicting it must not dispose it.
      if (evicted?.type === "erase") {
        for (const stroke of evicted.strokes) stroke.dispose();
      }
    }
  }

  /** Removes and returns the most recent action, or null if there is nothing to undo. */
  undo(): Action | null {
    return this.actions.pop() ?? null;
  }

  /**
   * Drops all history without disposing anything. The caller is responsible for the
   * strokes — StrokeManager.clear() disposes everything itself, so a double-dispose here
   * would be wrong even though Stroke.dispose() is idempotent.
   */
  clear(): void {
    this.actions = [];
  }
}
