import { isAssignedTo } from "./identity.js";
export function dateInZone(value = new Date(), zone = "Africa/Johannesburg") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
export function addDays(date, amount) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export function quickDates(date = dateInZone()) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return [
    ["Today", date],
    ["Tomorrow", addDays(date, 1)],
    ["Friday", addDays(date, (5 - day + 7) % 7 || 7)],
    ["Next week", addDays(date, 7)],
  ];
}
export function waitingOn(task, tasks) {
  return (task.dependencyIds || []).filter(
    (id) => tasks.find((item) => item.id === id)?.status !== "Completed",
  );
}
export function taskNotifications(
  tasks,
  actor,
  preferences = {},
  date = dateInZone(new Date(), preferences.timeZone),
) {
  if (preferences.inAppNotifications === false) return [];
  const until = addDays(date, preferences.remindBeforeDays ?? 1);
  return tasks
    .filter((task) => task.status !== "Completed" && isAssignedTo(task, actor))
    .flatMap((task) => {
      const result = [
        {
          id: `assigned:${task.id}:${task.assignedAt || task.createdAt}`,
          taskId: task.id,
          title: task.title,
          text: "Assigned to you",
          kind: "assigned",
        },
      ];
      if (task.dueDate && task.dueDate <= until)
        result.unshift({
          id: `due:${task.id}:${task.dueDate}:${date}`,
          taskId: task.id,
          title: task.title,
          text:
            task.dueDate < date
              ? "Overdue since " + task.dueDate
              : task.dueDate === date
                ? "Due today"
                : "Due " + task.dueDate,
          kind: task.dueDate < date ? "overdue" : "due",
        });
      return result;
    })
    .sort(
      (a, b) =>
        ({ overdue: 0, due: 1, assigned: 2 })[a.kind] -
        { overdue: 0, due: 1, assigned: 2 }[b.kind],
    );
}
export function followUpReport(previous, tasks, current) {
  const source = tasks.filter((task) => task.meetingId === previous?.id);
  const words = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3);
  const discussion = new Set(
    words(
      [
        current?.summary,
        ...(current?.discussionPoints || []),
        ...(current?.decisions || []),
      ].join(" "),
    ),
  );
  return {
    completed: source.filter((task) => task.status === "Completed"),
    open: source.filter((task) => task.status !== "Completed"),
    decisions: (previous?.decisions || []).map((text) => {
      const tokens = words(text);
      return {
        text,
        discussed:
          tokens.length > 0 &&
          tokens.filter((word) => discussion.has(word)).length >=
            Math.max(1, Math.ceil(tokens.length * 0.6)),
      };
    }),
    followUps: previous?.followUps || [],
  };
}
