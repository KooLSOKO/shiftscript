import { createHash } from "node:crypto";
import { z } from "zod";
import { fail } from "./collaboration.js";

// Firestore and local JSON may return object keys in different orders.
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export function meetingDeletionVersion(meeting, tasks) {
  const { deletionVersion, ...stored } = meeting;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({
          meeting: stored,
          tasks: tasks
            .filter((task) => task.meetingId === meeting.id)
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      ),
    )
    .digest("hex");
}
const stamp = (previous) =>
  new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
export function installDeletionRoutes(app, { mutate }) {
  app.delete("/api/meetings/:id", async (req, res) => {
    const input = z
      .object({
        confirm: z.literal(true),
        expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(req.body);
    const result = await mutate(
      req,
      (s) => {
        const meeting = s.meetings.find((item) => item.id === req.params.id);
        if (!meeting)
          fail(404, "Meeting not found. It may already have been deleted.");
        if (meeting.emailSends?.some((send) => send.status === "sending"))
          fail(
            409,
            "A recap email is being sent. Wait until sending finishes before deleting this meeting.",
          );
        if (input.expectedVersion !== meetingDeletionVersion(meeting, s.tasks))
          fail(
            409,
            "This meeting or its tasks changed. Refresh the workspace and review the deletion again.",
          );
        const removed = new Set(
          s.tasks
            .filter((task) => task.meetingId === meeting.id)
            .map((task) => task.id),
        );
        s.meetings = s.meetings.filter((item) => item.id !== meeting.id);
        s.tasks = s.tasks.filter((task) => !removed.has(task.id));
        for (const task of s.tasks) {
          const dependencies = (task.dependencyIds || []).filter(
            (id) => !removed.has(id),
          );
          if (dependencies.length !== (task.dependencyIds || []).length) {
            task.dependencyIds = dependencies;
            task.updatedAt = stamp(task.updatedAt);
            task.updatedBy = req.uid;
          }
        }
        // Keep original notes, agendas and follow-up meetings; remove stale links.
        for (const note of s.notes) {
          const processed = (note.processed || []).filter(
            (item) => item.meetingId !== meeting.id,
          );
          if (
            note.meetingId === meeting.id ||
            processed.length !== (note.processed || []).length
          ) {
            if (note.meetingId === meeting.id) note.meetingId = null;
            note.processed = processed;
            note.version = (note.version || 0) + 1;
            note.updatedAt = stamp(note.updatedAt);
            note.updatedBy = req.uid;
          }
        }
        for (const agenda of s.agendas) {
          if (agenda.meetingId === meeting.id) agenda.meetingId = null;
          if (agenda.parentMeetingId === meeting.id)
            agenda.parentMeetingId = null;
        }
        for (const followUp of s.meetings) {
          if (followUp.preparation?.parentMeetingId === meeting.id) {
            followUp.preparation.parentMeetingId = null;
            followUp.updatedAt = stamp(followUp.updatedAt);
          }
        }
        // Invalidate entire undo groups so an earlier undo cannot recreate orphaned work.
        const invalidGroups = new Set(
          s.undoRecords
            .filter(
              (record) =>
                record.snapshot?.meetingId === meeting.id ||
                removed.has(record.taskId) ||
                record.snapshot?.dependencyIds?.some((id) => removed.has(id)),
            )
            .map((record) => record.group),
        );
        s.undoRecords = s.undoRecords.filter(
          (record) => !invalidGroups.has(record.group),
        );
        return {
          deleted: true,
          meetingId: meeting.id,
          deletedTaskIds: [...removed],
          deletedTaskCount: removed.size,
        };
      },
      "write",
      { undo: false },
    );
    res.json(result);
  });
}
