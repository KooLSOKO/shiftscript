// Board order is independent of task-list sorting; old tasks need no migration.
export const boardStatuses = [
  "To Do",
  "In Progress",
  "Blocked",
  "In Review",
  "Completed",
];
export const boardRank = (task) =>
  Number.isFinite(task.boardRank)
    ? task.boardRank
    : -(Date.parse(task.createdAt) || 0);
export const boardSort = (a, b) =>
  boardRank(a) - boardRank(b) || a.id.localeCompare(b.id);
export function placeOnBoard(tasks, task, { status, position, anchorId }) {
  const column = tasks
    .filter((item) => item.id !== task.id && item.status === status)
    .sort(boardSort);
  let index = position === "start" ? 0 : column.length;
  if (position === "before" || position === "after") {
    index = column.findIndex((item) => item.id === anchorId);
    if (index < 0)
      throw new Error("The destination card is no longer in this column.");
    if (position === "after") index++;
  }
  column.splice(index, 0, task);
  return { column, index };
}
