// Apply only the records committed by this save. Keep the last complete
// snapshot revision so background sync still notices other people's changes.
export function applyTaskPatch(previous, patch, workspaceId) {
  if (!patch || patch.workspaceId !== workspaceId) return previous;
  const removed = new Map(
    (patch.deletedTasks || []).map((task) => [task.id, task.expectedUpdatedAt]),
  );
  const created = new Set(patch.createdTaskIds || []);
  const tasks = new Map(
    previous.tasks
      .filter(
        (task) =>
          !removed.has(task.id) || removed.get(task.id) !== task.updatedAt,
      )
      .map((task) => [task.id, task]),
  );
  for (const task of patch.tasks || []) {
    const current = tasks.get(task.id);
    const deletedAfterSave = previous.activity.some(
      (entry) =>
        entry.targetType === "task" &&
        entry.targetId === task.id &&
        entry.action === "deleted a task" &&
        entry.createdAt >= task.updatedAt,
    );
    if (
      current
        ? !current.updatedAt || task.updatedAt >= current.updatedAt
        : created.has(task.id) && !deletedAfterSave
    )
      tasks.set(task.id, task);
  }
  const activity = new Map(previous.activity.map((item) => [item.id, item]));
  for (const item of patch.activity || []) activity.set(item.id, item);
  const meetings = new Map(
    (patch.meetings || []).map((change) => [change.meeting.id, change]),
  );
  const versions = new Map(
    (patch.meetingVersions || []).map((change) => [change.id, change]),
  );
  return {
    ...previous,
    tasks: [...tasks.values()].sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    ),
    activity: [...activity.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200),
    meetings: previous.meetings.map((meeting) => {
      const change = meetings.get(meeting.id),
        version = versions.get(meeting.id);
      if (change && meeting.deletionVersion === change.previousVersion)
        return change.meeting;
      if (version && meeting.deletionVersion === version.previousVersion)
        return { ...meeting, deletionVersion: version.version };
      return meeting;
    }),
  };
}
