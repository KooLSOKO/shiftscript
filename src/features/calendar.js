import { calendarRange, deviceTimeZone } from "../../shared/scheduling.js";
export {
  calendarRange,
  calendarDurations,
  deviceTimeZone,
} from "../../shared/scheduling.js";
export function calendarEventUrl(task, schedule, origin) {
  if (!task?.id || !task.title?.trim())
    throw new Error("Save the task before adding it to your calendar.");
  const { start, end } = calendarRange(schedule);
  const stamp = (value) =>
    value
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const zone = schedule.timeZone || deviceTimeZone();
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
    details.push(`Open ShiftScript: ${app.origin}/app`);
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
