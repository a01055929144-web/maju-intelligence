export const DRIVER_UNDO_WINDOW_MS = 5_000;

export function canUndoDriverAction(completedAt: number, now: number) {
  return now >= completedAt && now - completedAt <= DRIVER_UNDO_WINDOW_MS;
}
