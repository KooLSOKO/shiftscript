import { z } from "zod";
import { boardStatuses, boardRank, placeOnBoard } from "../shared/board.js";
import { fail } from "./collaboration.js";
import { stamp, assertCompletion } from "./productivity.js";
const moveInput = z
  .object({
    status: z.enum(boardStatuses),
    position: z.enum(["start", "end", "before", "after"]),
    anchorId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .nullable()
      .default(null),
    anchorUpdatedAt: z.string().nullable().default(null),
    expectedUpdatedAt: z.string(),
  })
  .strict()
  .refine(
    (v) =>
      ["before", "after"].includes(v.position)
        ? Boolean(v.anchorId && v.anchorUpdatedAt)
        : !v.anchorId && !v.anchorUpdatedAt,
    "Choose a valid destination card",
  );
export function installBoardRoutes(app, { mutate }) {
  app.post("/api/tasks/:id/move", async (req, res) => {
    const input = moveInput.parse(req.body);
    const task = await mutate(req, (s) => {
      const task = s.tasks.find((t) => t.id === req.params.id);
      if (!task)
        fail(404, "This task is no longer available. Refresh the board.");
      if (task.updatedAt !== input.expectedUpdatedAt)
        fail(
          409,
          "This task changed. Refresh the board before moving it again.",
        );
      if (input.anchorId) {
        const anchor = s.tasks.find((t) => t.id === input.anchorId);
        if (
          !anchor ||
          anchor.id === task.id ||
          anchor.status !== input.status ||
          anchor.updatedAt !== input.anchorUpdatedAt
        )
          fail(
            409,
            "The destination card changed. Refresh the board and choose its position again.",
          );
      }
      const previous = structuredClone(task);
      const { column, index } = placeOnBoard(s.tasks, task, input);
      task.status = input.status;
      assertCompletion(task, s.tasks, previous);
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
        task.boardRank = rank;
      else
        for (let i = 0; i < column.length; i++) {
          const item = column[i];
          if (item.boardRank !== i * 1024) {
            item.boardRank = i * 1024;
            item.updatedAt = stamp(item.updatedAt);
            item.updatedBy = req.uid;
          }
        }
      task.updatedAt = stamp(task.updatedAt);
      task.updatedBy = req.uid;
      return task;
    });
    res.json({ task, undoToken: req.undoToken });
  });
}
