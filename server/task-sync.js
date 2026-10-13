import { meetingDeletionVersion } from "./deletion.js";

export function committedTaskPatch(before, saved, workspaceId) {
  const oldTasks = new Map(before.tasks.map((task) => [task.id, task]));
  const oldActivity = new Set(before.activity.map((entry) => entry.id));
  const oldMeetings = new Map(
    before.meetings.map((meeting) => [meeting.id, meeting]),
  );
  return {
    workspaceId,
    tasks: saved.tasks.filter(
      (task) => JSON.stringify(oldTasks.get(task.id)) !== JSON.stringify(task),
    ),
    createdTaskIds: saved.tasks
      .filter((task) => !oldTasks.has(task.id))
      .map((task) => task.id),
    deletedTasks: before.tasks
      .filter((task) => !saved.tasks.some((current) => current.id === task.id))
      .map((task) => ({ id: task.id, expectedUpdatedAt: task.updatedAt })),
    activity: saved.activity.filter((entry) => !oldActivity.has(entry.id)),
    meetings: saved.meetings
      .filter(
        (meeting) =>
          JSON.stringify(oldMeetings.get(meeting.id)) !==
          JSON.stringify(meeting),
      )
      .map((meeting) => ({
        meeting: {
          ...meeting,
          deletionVersion: meetingDeletionVersion(meeting, saved.tasks),
        },
        previousVersion: oldMeetings.has(meeting.id)
          ? meetingDeletionVersion(oldMeetings.get(meeting.id), before.tasks)
          : null,
      })),
    meetingVersions: saved.meetings.map((meeting) => ({
      id: meeting.id,
      previousVersion: oldMeetings.has(meeting.id)
        ? meetingDeletionVersion(oldMeetings.get(meeting.id), before.tasks)
        : null,
      version: meetingDeletionVersion(meeting, saved.tasks),
    })),
  };
}
