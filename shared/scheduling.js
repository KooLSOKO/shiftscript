export const calendarDurations = [15, 30, 45, 60, 90, 120];
export const deviceTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function calendarRange({
  date,
  time,
  duration,
  timeZone = deviceTimeZone(),
}) {
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
  const base = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(base.getTime()) || base.toISOString().slice(0, 10) !== date)
    throw new Error("Choose a valid calendar date.");
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("Choose a valid time zone.");
  }
  const wall = (value) => {
    const fields = Object.fromEntries(
      formatter.formatToParts(value).map((part) => [part.type, part.value]),
    );
    return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}Z`;
  };
  const offsets = new Set(
    [-36, -12, 0, 12, 36].map((hours) => {
      const instant = new Date(base.getTime() + hours * 3600000);
      return new Date(wall(instant)).getTime() - instant.getTime();
    }),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(base.getTime() - offset))
    .filter((value) => wall(value) === `${date}T${time}:00Z`)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(
      "This time is unavailable because the clocks change. Choose another start time.",
    );
  const start = candidates[0],
    end = new Date(start.getTime() + Number(duration) * 60000);
  if (end.getUTCFullYear() > 9999)
    throw new Error("Choose an earlier calendar date.");
  return { start, end };
}
