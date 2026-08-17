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
 * because undo may restore them. They are disposed when their action is evicted past
 * HISTORY_DEPTH, or when the history is cleared — without that, erased geometry would
 * live for the whole session.
 */
export class ActionHistory {
  private actions: Action[] = [];

  /**
   * Precondition for erase actions: the strokes must ALREADY have been removed from
   * StrokeManager.finished. If they are still live there, eviction-time disposal here
   * would free geometry the user is still looking at.
   */
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
   * Drops all history, disposing the strokes the history OWNS.
   *
   * Only erase actions own their strokes: an erased stroke was removed from
   * StrokeManager.finished, so the history action is its last reference and nothing
   * else will ever free it. A draw action's stroke is still live in `finished` and is
   * disposed by StrokeManager.clear() itself — disposing it here too would be
   * redundant (Stroke.dispose() is idempotent) and would misrepresent ownership.
   */
  clear(): void {
    for (const action of this.actions) {
      if (action.type === "erase") {
        for (const stroke of action.strokes) stroke.dispose();
      }
    }
    this.actions = [];
  }
}
