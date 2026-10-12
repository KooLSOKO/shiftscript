import { z } from "zod";
import { boardStatuses, boardPlacement } from "../shared/board.js";
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
    const result = await mutate(req, (s) => {
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
      assertCompletion({ ...task, status: input.status }, s.tasks, previous);
      const changed = [];
      for (const patch of boardPlacement(s.tasks, task.id, input)) {
        const item = s.tasks.find((item) => item.id === patch.id);
        if (item.id !== task.id && item.boardRank === patch.boardRank) continue;
        Object.assign(item, patch, {
          updatedAt: stamp(item.updatedAt),
          updatedBy: req.uid,
        });
        changed.push(item);
      }
      s.activity ||= [];
      return { task, tasks: changed, activity: s.activity };
    });
    res.json({
      ...result,
      activity: result.activity.slice(-200),
      undoToken: req.undoToken,
    });
  });
}
