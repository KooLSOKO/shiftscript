import test from "node:test";
import assert from "node:assert/strict";
import { calendarRange, calendarEventUrl } from "../src/features/calendar.js";
function zone(name, operation) {
  const previous = process.env.TZ;
  process.env.TZ = name;
  try {
    return operation();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
const task = {
  id: "portfolio",
  title: "Review Kopano’s portfolio & mobile layout",
  description: "Check colour, spacing & forms.\nConfirm navigation.",
  owner: "Kiya",
  priority: "High",
  dueDate: "2026-10-12",
  meetingTitle: "Portfolio launch",
};
test("calendar export preserves South African time and crosses midnight and year boundaries correctly", () =>
  zone("Africa/Johannesburg", () => {
    const url = new URL(
      calendarEventUrl(
        task,
        { date: "2026-12-31", time: "23:45", duration: 30 },
        "https://shiftscript.earny.co.za/somewhere",
      ),
    );
    assert.equal(
      url.origin + url.pathname,
      "https://calendar.google.com/calendar/r/eventedit",
    );
    assert.equal(
      url.searchParams.get("dates"),
      "20261231T214500Z/20261231T221500Z",
    );
    assert.equal(url.searchParams.get("stz"), "Africa/Johannesburg");
    assert.equal(url.searchParams.get("etz"), "Africa/Johannesburg");
    assert.equal(url.searchParams.get("text"), task.title);
    assert(url.searchParams.get("details").includes(task.description));
    assert(
      url.searchParams
        .get("details")
        .includes("Source meeting: Portfolio launch"),
    );
    assert(
      url.searchParams
        .get("details")
        .includes("https://shiftscript.earny.co.za/"),
    );
    assert.equal(
      task.dueDate,
      "2026-10-12",
      "Scheduling must not mutate task deadlines",
    );
    const utc = zone("UTC", () =>
      calendarRange({ date: "2026-12-31", time: "23:45", duration: 30 }),
    );
    assert.equal(utc.end.toISOString(), "2027-01-01T00:15:00.000Z");
  }));
test("calendar requires a real date, explicit time, valid duration and saved task", () =>
  zone("UTC", () => {
    for (const date of [
      "",
      "2026-02-30",
      "2026-13-10",
      "01/10/2026",
      "0001-01-01",
    ])
      assert.throws(
        () => calendarRange({ date, time: "09:00", duration: 30 }),
        /date/,
      );
    for (const time of ["", "24:00", "09:60", "9am", null])
      assert.throws(
        () => calendarRange({ date: "2026-10-12", time, duration: 30 }),
        /time/,
      );
    assert.throws(
      () => calendarRange({ date: "2026-10-12", time: "09:00", duration: -1 }),
      /duration/,
    );
    assert.throws(
      () =>
        calendarEventUrl(
          { title: "Unsaved task" },
          { date: "2026-10-12", time: "09:00", duration: 30 },
        ),
      /Save/,
    );
    assert.throws(
      () =>
        calendarEventUrl(
          task,
          { date: "2026-10-12", time: "09:00", duration: 30 },
          "javascript:alert(1)",
        ),
      /address/,
    );
  }));
test("calendar detects unavailable daylight-saving times and adjusts valid times to UTC", () =>
  zone("America/New_York", () => {
    assert.throws(
      () => calendarRange({ date: "2026-03-08", time: "02:30", duration: 30 }),
      /clocks change/,
    );
    assert.equal(
      calendarRange({
        date: "2026-03-08",
        time: "03:30",
        duration: 60,
      }).start.toISOString(),
      "2026-03-08T07:30:00.000Z",
    );
  }));
