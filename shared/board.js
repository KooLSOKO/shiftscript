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
export function boardPlacement(tasks, id, target) {
  const original = tasks.find((task) => task.id === id);
  if (!original) throw new Error("This task is no longer available.");
  const task = { ...original, status: target.status };
  const { column, index } = placeOnBoard(tasks, task, target);
  const before = column[index - 1],
    after = column[index + 1];
  const rank =
    before && after
      ? (boardRank(before) + boardRank(after)) / 2
      : before
        ? boardRank(before) + 1024
        : after
          ? boardRank(after) - 1024
          : 0;
  if (
    Number.isFinite(rank) &&
    (!before || rank > boardRank(before)) &&
    (!after || rank < boardRank(after))
  )
    return [{ id, status: target.status, boardRank: rank }];
  return column.map((item, i) => ({
    id: item.id,
    status: item.id === id ? target.status : item.status,
    boardRank: i * 1024,
  }));
}
