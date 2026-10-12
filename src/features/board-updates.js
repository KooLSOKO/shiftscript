import { boardPlacement } from "../../shared/board.js";
export function previewBoardMove(tasks, id, target) {
  return boardPlacement(tasks, id, target).map((patch) => {
    const task = tasks.find((task) => task.id === patch.id);
    return {
      patch,
      before: { status: task.status, boardRank: task.boardRank },
      version: task.updatedAt,
    };
  });
}
export function overlayBoardMove(tasks, changes) {
  const byId = new Map(changes.map((change) => [change.patch.id, change]));
  return tasks.map((task) => {
    const change = byId.get(task.id);
    return change && task.updatedAt === change.version
      ? { ...task, ...change.patch }
      : task;
  });
}
export function rollbackBoardMove(tasks, changes) {
  const byId = new Map(changes.map((change) => [change.patch.id, change]));
  return tasks.map((task) => {
    const change = byId.get(task.id);
    if (
      !change ||
      task.updatedAt !== change.version ||
      task.status !== change.patch.status ||
      task.boardRank !== change.patch.boardRank
    )
      return task;
    const restored = { ...task, ...change.before };
    if (change.before.boardRank === undefined) delete restored.boardRank;
    return restored;
  });
}
export function mergeSavedBoardTasks(tasks, saved) {
  const byId = new Map(saved.map((task) => [task.id, task]));
  return tasks.map((task) => {
    const next = byId.get(task.id);
    return next && (!task.updatedAt || next.updatedAt >= task.updatedAt)
      ? next
      : task;
  });
}
