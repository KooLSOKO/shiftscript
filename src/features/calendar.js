export const calendarDurations = [15, 30, 45, 60, 90, 120];
export const deviceTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function calendarRange({ date, time, duration }) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
    Number(date.slice(0, 4)) < 1000
  )
    throw new Error("Choose a valid calendar date.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ""))
    throw new Error(
      "Choose a start time before adding this task to your calendar.",
    );
  if (!calendarDurations.includes(Number(duration)))
    throw new Error("Choose an event duration between 15 minutes and 2 hours.");
  // Interpret the chosen wall-clock time in this device's zone, including DST.
  const start = new Date(`${date}T${time}:00`);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (
    Number.isNaN(start.getTime()) ||
    start.getFullYear() !== year ||
    start.getMonth() + 1 !== month ||
    start.getDate() !== day
  )
    throw new Error("Choose a valid calendar date.");
  if (start.getHours() !== hour || start.getMinutes() !== minute)
    throw new Error(
      "This time is unavailable because the clocks change. Choose another start time.",
    );
  const end = new Date(start.getTime() + Number(duration) * 60000);
  if (end.getFullYear() > 9999)
    throw new Error("Choose an earlier calendar date.");
  return { start, end };
}

export function calendarEventUrl(task, schedule, origin) {
  if (!task?.id || !task.title?.trim())
    throw new Error("Save the task before adding it to your calendar.");
  const { start, end } = calendarRange(schedule);
  const stamp = (value) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const zone = deviceTimeZone();
  const details = [
    task.description,
    `Owner: ${task.owner || "Unassigned"}`,
    `Priority: ${task.priority || "Not specified"}`,
    task.dueDate ? `Task due date: ${task.dueDate}` : null,
    task.meetingTitle
      ? `Source meeting: ${task.meetingTitle}`
      : "Added manually in ShiftScript",
  ].filter(Boolean);
  if (origin) {
    const app = new URL(origin);
    if (!["https:", "http:"].includes(app.protocol))
      throw new Error("Invalid ShiftScript address.");
    details.push(`Open ShiftScript: ${app.origin}/`);
  }
  const url = new URL("https://calendar.google.com/calendar/r/eventedit");
  url.search = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title,
    dates: `${stamp(start)}/${stamp(end)}`,
    stz: zone,
    etz: zone,
    ctz: zone,
    details: details.join("\n\n"),
  }).toString();
  return url.toString();
}
