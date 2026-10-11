import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { fail } from "./collaboration.js";
import { calendarRange } from "../shared/scheduling.js";
import { dateInZone, addDays } from "../shared/productivity.js";

const calendarId = z.string().min(1).max(300);
export function safeCalendarLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "calendar.google.com" ||
        (url.hostname === "www.google.com" &&
          url.pathname.startsWith("/calendar/")))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function availableSlots(
  busy,
  zone,
  instant = new Date(),
  duration = 60,
) {
  const slots = [],
    today = dateInZone(instant, zone);
  for (let day = 0; day < 7 && slots.length < 12; day++) {
    const date = addDays(today, day);
    if ([0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay())) continue;
    for (
      let minute = 8 * 60;
      minute + duration <= 17 * 60 && slots.length < 12;
      minute += 30
    ) {
      const time =
        String(Math.floor(minute / 60)).padStart(2, "0") +
        ":" +
        String(minute % 60).padStart(2, "0");
      let range;
      try {
        range = calendarRange({ date, time, duration, timeZone: zone });
      } catch {
        continue;
      }
      if (range.start <= new Date(instant.getTime() + 15 * 60000)) continue;
      if (
        busy.some(
          (b) => range.start < new Date(b.end) && range.end > new Date(b.start),
        )
      )
        continue;
      slots.push({
        date,
        time,
        duration,
        timeZone: zone,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });
      minute += duration - 30;
    }
  }
  return slots;
}

export class CalendarIntegration {
  constructor(google) {
    this.google = google;
  }
  get ready() {
    return this.google.ready;
  }
  async status(uid) {
    if (!this.ready) return { ready: false, connected: false };
    const c = (await this.google.vault.get(uid)).calendarConnection;
    return {
      ready: true,
      connected: Boolean(c),
      connectedAt: c?.connectedAt || null,
      selectedIds: c?.selectedIds || ["primary"],
      focusCalendar: Boolean(c?.focusCalendarId),
    };
  }
  async connection(uid) {
    this.google.requireReady();
    const c = (await this.google.vault.get(uid)).calendarConnection;
    if (!c) fail(409, "Connect Google Calendar in the assistant first.");
    return c;
  }
  async request(
    uid,
    path,
    { method = "GET", params = {}, body, connectionId } = {},
  ) {
    const url = new URL("https://www.googleapis.com/calendar/v3/" + path);
    url.search = new URLSearchParams(params).toString();
    try {
      const token = await this.google.access(uid, "calendar");
      if (connectionId && (await this.connection(uid)).id !== connectionId)
        fail(409, "Your Calendar connection changed. Refresh and try again.");
      return await this.google.request(url.href, {
        method,
        headers: {
          Authorization: "Bearer " + token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      if (e.status === 403)
        fail(
          403,
          "Calendar access was denied. Enable Google Calendar API in your Cloud project, then reconnect Calendar and approve the requested permissions.",
        );
      if (e.status === 404)
        fail(
          404,
          "This calendar or event is no longer available. Refresh your calendar selection.",
        );
      throw e;
    }
  }
  async calendars(uid) {
    const connection = await this.connection(uid);
    const result = [];
    let cursor;
    for (let page = 0; page < 3; page++) {
      const data = await this.request(uid, "users/me/calendarList", {
        connectionId: connection.id,
        params: { maxResults: "100", ...(cursor ? { pageToken: cursor } : {}) },
      });
      result.push(
        ...(data.items || [])
          .filter((c) =>
            [
              "owner",
              "writer",
              "reader",
              "writerWithoutPrivateAccess",
            ].includes(c.accessRole),
          )
          .map((c) => ({
            id: c.id,
            name: String(c.summary || "Calendar").slice(0, 120),
            primary: Boolean(c.primary),
            timeZone: c.timeZone || "UTC",
          })),
      );
      cursor = data.nextPageToken;
      if (!cursor) break;
    }
    if ((await this.connection(uid)).id !== connection.id)
      fail(409, "Your Calendar connection changed. Refresh and try again.");
    return { calendars: result, truncated: Boolean(cursor) };
  }
  async select(uid, ids) {
    ids = z.array(calendarId).min(1).max(5).parse(ids);
    const connection = await this.connection(uid);
    const { calendars } = await this.calendars(uid);
    const primary = calendars.find((c) => c.primary)?.id;
    if (
      ids.some(
        (id) =>
          !calendars.some((c) => c.id === id) && !(id === "primary" && primary),
      )
    )
      fail(400, "Choose calendars belonging to your connected Google account.");
    const selected = [
      ...new Set(ids.map((id) => (id === "primary" ? primary : id))),
    ];
    await this.google.vault.mutate(uid, (s) => {
      if (s.calendarConnection?.id !== connection.id)
        fail(409, "Your Calendar connection changed. Reconnect first.");
      s.calendarConnection.selectedIds = selected;
    });
    return this.status(uid);
  }
  async disconnect(uid) {
    this.google.requireReady();
    await this.google.vault.mutate(uid, (s) => {
      delete s.calendarConnection;
    });
  }
  async busy(uid, start, end, connectionId) {
    const c = await this.connection(uid);
    if (connectionId && c.id !== connectionId)
      fail(409, "Your Calendar connection changed. Refresh and try again.");
    const ids = [
      ...new Set([
        ...(c.selectedIds || ["primary"]),
        ...(c.focusCalendarId ? [c.focusCalendarId] : []),
      ]),
    ];
    const data = await this.request(uid, "freeBusy", {
      connectionId: c.id,
      method: "POST",
      body: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: ids.map((id) => ({ id })),
      },
    });
    const intervals = [];
    for (const id of ids) {
      const calendar = data.calendars?.[id];
      if (!calendar || calendar.errors?.length)
        fail(
          409,
          "Availability could not be checked for every selected calendar. Refresh the selection and try again.",
        );
      for (const b of calendar.busy || []) {
        if (
          !Number.isFinite(Date.parse(b.start)) ||
          !Number.isFinite(Date.parse(b.end)) ||
          new Date(b.end) <= new Date(b.start)
        )
          fail(502, "Google returned invalid availability information.");
        intervals.push({ start: b.start, end: b.end });
      }
    }
    if ((await this.connection(uid)).id !== c.id)
      fail(409, "Your Calendar connection changed. Refresh and try again.");
    return intervals;
  }
  async context(uid, zone, instant = new Date()) {
    const c = await this.connection(uid),
      start = instant,
      end = new Date(start.getTime() + 14 * 86400000);
    const ids = [
      ...new Set([
        ...(c.selectedIds || ["primary"]),
        ...(c.focusCalendarId ? [c.focusCalendarId] : []),
      ]),
    ];
    const [collections, busy] = await Promise.all([
      Promise.all(
        ids.map(async (id) => {
          const data = await this.request(
            uid,
            `calendars/${encodeURIComponent(id)}/events`,
            {
              connectionId: c.id,
              params: {
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: "true",
                orderBy: "startTime",
                maxResults: "60",
                timeZone: zone,
              },
            },
          );
          return {
            truncated: Boolean(data.nextPageToken),
            events: (data.items || [])
              .filter(
                (e) =>
                  e.status !== "cancelled" &&
                  !e.attendees?.some(
                    (a) => a.self && a.responseStatus === "declined",
                  ),
              )
              .map((e) => ({
                id: e.id,
                calendarId: id,
                title: String(e.summary || "Busy / private event").slice(
                  0,
                  160,
                ),
                description: String(e.description || "")
                  .replace(/<[^>]*>/g, " ")
                  .slice(0, 700),
                start: e.start?.dateTime || e.start?.date,
                end: e.end?.dateTime || e.end?.date,
                allDay: Boolean(e.start?.date),
                timeZone: e.start?.timeZone || data.timeZone || zone,
                href: safeCalendarLink(e.htmlLink),
                location: String(e.location || "").slice(0, 180),
              })),
          };
        }),
      ),
      this.busy(uid, start, end, c.id),
    ]);
    if ((await this.connection(uid)).id !== c.id)
      fail(409, "Your Calendar connection changed. Refresh and try again.");
    const events = collections
      .flatMap((c) => c.events)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    return {
      connected: true,
      checkedAt: new Date().toISOString(),
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      selectedCount: ids.length,
      events: events.slice(0, 60),
      truncated: events.length > 60 || collections.some((c) => c.truncated),
      freeSlots: availableSlots(busy, zone, instant),
      workingHours: "08:00–17:00, Monday–Friday",
      timeZone: zone,
    };
  }
  async focusCalendar(uid, zone, connectionId) {
    const c = await this.connection(uid);
    if (connectionId && c.id !== connectionId)
      fail(409, "Your Calendar connection changed. Refresh and try again.");
    if (c.focusCalendarId) return c.focusCalendarId;
    const claim = randomUUID();
    await this.google.vault.mutate(uid, (s) => {
      const current = s.calendarConnection;
      if (current?.id !== c.id)
        fail(409, "Your Calendar connection changed. Try again.");
      if (current.focusCalendarId)
        fail(409, "The task calendar was just created. Try again.");
      if (current.calendarCreation)
        fail(
          409,
          "Task calendar creation is in progress or could not be confirmed. Check Google Calendar before reconnecting.",
        );
      current.calendarCreation = {
        id: claim,
        at: new Date().toISOString(),
        status: "creating",
      };
    });
    try {
      const calendar = await this.request(uid, "calendars", {
        connectionId: c.id,
        method: "POST",
        body: {
          summary: "ShiftScript · Task blocks",
          description:
            "Task blocks you review and confirm in ShiftScript by Earny.",
          timeZone: zone,
        },
      });
      if (!calendar.id)
        fail(502, "Google did not confirm task calendar creation.");
      await this.google.vault.mutate(uid, (s) => {
        if (s.calendarConnection?.id !== c.id)
          fail(
            409,
            "Calendar connection changed during creation. Check your Google calendars.",
          );
        s.calendarConnection.focusCalendarId = calendar.id;
        delete s.calendarConnection.calendarCreation;
      });
      return calendar.id;
    } catch (e) {
      await this.google.vault.mutate(uid, (s) => {
        if (s.calendarConnection?.calendarCreation?.id === claim)
          s.calendarConnection.calendarCreation.status = "uncertain";
      });
      throw e;
    }
  }
  async createTaskBlock(
    uid,
    actionId,
    task,
    schedule,
    workspaceId,
    origin,
    checkPermission,
  ) {
    const { start, end } = calendarRange(schedule);
    const connection = await this.connection(uid);
    if (start <= new Date() || start > new Date(Date.now() + 90 * 86400000))
      fail(400, "Choose a future time within the next 90 days.");
    const busy = await this.busy(uid, start, end, connection.id);
    if (busy.some((b) => start < new Date(b.end) && end > new Date(b.start)))
      fail(
        409,
        "That time overlaps a selected calendar event. Choose a different time.",
      );
    await checkPermission();
    const calendarId = await this.focusCalendar(
      uid,
      schedule.timeZone,
      connection.id,
    );
    await checkPermission();
    const eventId = createHash("sha256")
      .update(uid + ":" + actionId)
      .digest("hex");
    const event = await this.request(
      uid,
      `calendars/${encodeURIComponent(calendarId)}/events`,
      {
        connectionId: connection.id,
        method: "POST",
        params: { sendUpdates: "none" },
        body: {
          id: eventId,
          summary: task.title,
          description: [
            "ShiftScript task block",
            task.description || "",
            task.dueDate
              ? "Task deadline: " + task.dueDate
              : "Task deadline: not set",
            origin ? "Open ShiftScript: " + origin + "/app" : "",
          ].join("\n"),
          start: { dateTime: start.toISOString(), timeZone: schedule.timeZone },
          end: { dateTime: end.toISOString(), timeZone: schedule.timeZone },
          extendedProperties: {
            private: {
              shiftscriptTask: task.id,
              shiftscriptWorkspace: workspaceId,
            },
          },
          reminders: { useDefault: true },
        },
      },
    );
    if (!event.id)
      fail(
        502,
        "Google did not confirm event creation. Check your calendar before trying again.",
      );
    return {
      eventId: event.id,
      href: safeCalendarLink(event.htmlLink),
      start: start.toISOString(),
      end: end.toISOString(),
      calendarName: "ShiftScript · Task blocks",
    };
  }
}
