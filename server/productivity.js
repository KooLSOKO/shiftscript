import { z } from "zod";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { fail, now, authorize, taskFields } from "./collaboration.js";
import {
  taskPatch,
  scheduleInput,
  meetingInput,
  date,
  hash,
} from "./schema.js";
import { isAssignedTo } from "../shared/identity.js";
import {
  waitingOn,
  taskNotifications,
  dateInZone,
} from "../shared/productivity.js";
import { escapeEmail } from "./recap-email.js";

export const stamp = (previous) =>
  new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
const key = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const defaults = {
  inAppNotifications: true,
  emailReminders: false,
  remindBeforeDays: 1,
  timeZone: "Africa/Johannesburg",
};
const timeZone = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone");
const preferencesSchema = z
  .object({
    inAppNotifications: z.boolean(),
    emailReminders: z.boolean(),
    remindBeforeDays: z.number().int().min(0).max(7),
    timeZone,
  })
  .strict();
const avatar = z
  .string()
  .max(100000)
  .refine((value) => {
    if (!value) return true;
    const match = value.match(
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) return false;
    const buffer = Buffer.from(match[2], "base64");
    return match[1] === "png"
      ? buffer
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? buffer[0] === 255 && buffer[1] === 216
        : buffer.toString("ascii", 0, 4) === "RIFF" &&
          buffer.toString("ascii", 8, 12) === "WEBP";
  }, "Choose a small PNG, JPG or WebP profile photo");
const profilePatch = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    aliases: z.array(z.string().trim().min(2).max(80)).max(8).optional(),
    avatar: avatar.optional(),
    preferences: preferencesSchema.optional(),
  })
  .strict();
export function profileView(profile, actor) {
  return {
    name: profile.name || actor.name,
    customName: Boolean(profile.name),
    aliases: profile.aliases || [],
    avatar: profile.avatar || "",
    preferences: { ...defaults, ...profile.preferences },
    savedViews: profile.savedViews || [],
    calendarMarks: profile.calendarMarks || [],
    readNotifications: profile.readNotifications || [],
    emailAttempts: (profile.emailAttempts || []).slice(-7),
    updatedAt: profile.updatedAt || null,
  };
}
export class MemoryProfiles {
  constructor() {
    this.items = new Map();
    this.queue = Promise.resolve();
  }
  async getProfile(uid) {
    await this.queue;
    return structuredClone(this.items.get(uid) || {});
  }
  async mutateProfile(uid, operation) {
    const work = this.queue.then(() => {
      const record = structuredClone(this.items.get(uid) || {}),
        result = operation(record);
      this.items.set(uid, record);
      return result;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  async reminderProfiles() {
    return [...this.items]
      .filter(([, p]) => p.preferences?.emailReminders)
      .map(([uid, p]) => ({ ...p, uid }));
  }
}
export function validateDependencies(tasks) {
  const map = new Map(tasks.map((task) => [task.id, task])),
    visiting = new Set(),
    done = new Set();
  function visit(task) {
    if (visiting.has(task.id))
      fail(400, "These dependencies create a cycle. Choose a different task.");
    if (done.has(task.id)) return;
    visiting.add(task.id);
    const dependencies = task.dependencyIds || [];
    if (new Set(dependencies).size !== dependencies.length)
      fail(400, "Choose each dependency only once.");
    for (const id of dependencies) {
      const dependency = map.get(id);
      if (!dependency)
        fail(400, "A dependency is missing or belongs to another workspace.");
      visit(dependency);
    }
    visiting.delete(task.id);
    done.add(task.id);
  }
  tasks.forEach(visit);
}
export function assertCompletion(task, tasks, previous) {
  if (
    task.status === "Completed" &&
    (previous?.status !== "Completed" ||
      JSON.stringify(task.dependencyIds || []) !==
        JSON.stringify(previous.dependencyIds || [])) &&
    waitingOn(task, tasks).length
  )
    fail(
      409,
      "Complete the tasks this work is waiting on before marking it completed.",
    );
}
export function recordChanges(s, before, actor, withUndo = true) {
  const at = now(),
    group = randomUUID().replaceAll("-", ""),
    changed = [];
  s.activity ||= [];
  s.undoRecords ||= [];
  const log = (action, targetType, targetId, title) =>
    s.activity.push({
      id: randomUUID().replaceAll("-", ""),
      action,
      targetType,
      targetId,
      title,
      actorUid: actor.uid,
      actorName: actor.name,
      createdAt: at,
    });
  const old = new Map(before.tasks.map((task) => [task.id, task]));
  for (const task of s.tasks) {
    const prior = old.get(task.id);
    old.delete(task.id);
    if (
      !prior ||
      prior.ownerUid !== task.ownerUid ||
      prior.owner !== task.owner
    )
      task.assignedAt = at;
    if (!prior) log("created a task", "task", task.id, task.title);
    else if (JSON.stringify(prior) !== JSON.stringify(task)) {
      log(
        prior.status !== task.status
          ? `changed status to ${task.status}`
          : prior.ownerUid !== task.ownerUid || prior.owner !== task.owner
            ? "changed the assignee"
            : "updated a task",
        "task",
        task.id,
        task.title,
      );
      changed.push({ prior, afterUpdatedAt: task.updatedAt });
    }
  }
  for (const prior of old.values()) {
    log("deleted a task", "task", prior.id, prior.title);
    changed.push({ prior, afterUpdatedAt: null });
  }
  for (const meeting of s.meetings) {
    const prior = before.meetings.find((item) => item.id === meeting.id);
    if (!prior)
      log("processed a meeting", "meeting", meeting.id, meeting.title);
    else
      for (const proposal of meeting.proposals || []) {
        const was = prior.proposals.find((item) => item.id === proposal.id);
        if (
          was?.reviewStatus === "pending" &&
          proposal.reviewStatus !== "pending"
        )
          log(
            `${proposal.reviewStatus} a proposed task`,
            "meeting",
            meeting.id,
            proposal.title,
          );
      }
  }
  for (const project of s.projects) {
    const prior = before.projects.find((item) => item.id === project.id);
    if (!prior || JSON.stringify(prior) !== JSON.stringify(project))
      log(
        prior ? "updated a project" : "created a project",
        "project",
        project.id,
        project.name,
      );
  }
  s.activity = s.activity.slice(-200);
  s.undoRecords = s.undoRecords
    .filter((record) => record.expires > Date.now())
    .slice(-100);
  if (withUndo && changed.length && changed.length <= 25) {
    for (const { prior, afterUpdatedAt } of changed)
      s.undoRecords.push({
        id: group + "_" + hash(prior.id),
        group,
        actorUid: actor.uid,
        taskId: prior.id,
        snapshot: prior,
        afterUpdatedAt,
        expires: Date.now() + 300000,
      });
    return group;
  }
  return null;
}
const validFilters = z
  .object({
    search: z.string().max(160),
    dependency: z.enum(["All", "waiting", "ready"]).default("All"),
    status: z.enum([
      "All",
      "Active",
      "To Do",
      "In Progress",
      "Blocked",
      "In Review",
      "Completed",
    ]),
    priority: z.enum(["All", "Low", "Med", "High"]),
    owner: z.string().max(100),
    project: z.string().max(128),
    due: z.enum([
      "All",
      "Overdue",
      "Today",
      "Next 7 days",
      "No deadline",
      "Custom range",
    ]),
    from: z.union([date, z.literal("")]),
    to: z.union([date, z.literal("")]),
    source: z.enum(["All", "manual", "meeting"]),
    sort: z.enum(["newest", "due", "priority", "title"]),
  })
  .strict();

export function installPersonalRoutes(
  app,
  { profiles, repo, catalog, mailer, remindersReady },
) {
  app.get("/api/profile", async (req, res) =>
    res.json({
      profile: profileView(await profiles.getProfile(req.uid), req.actor),
      remindersReady,
    }),
  );
  app.patch("/api/profile", async (req, res) => {
    const input = profilePatch.parse(req.body);
    if (
      input.preferences?.emailReminders &&
      (!req.actor.emailVerified || !remindersReady)
    )
      fail(
        400,
        "Verify your email and ask the administrator to enable daily reminders first.",
      );
    const profile = await profiles.mutateProfile(req.uid, (p) => {
      Object.assign(p, input, {
        email: req.actor.email,
        emailVerified: req.actor.emailVerified,
        updatedAt: now(),
      });
      return profileView(p, req.actor);
    });
    if (input.name || input.aliases) {
      const c = await catalog(req.actor);
      for (const workspace of c.workspaces) {
        try {
          await repo.mutate(workspace.id, (s) => {
            authorize(s, req.actor, workspace.id);
            const member = s.workspace?.members.find(
              (member) => member.uid === req.uid,
            );
            if (member) {
              member.name = profile.name;
              member.aliases = profile.aliases;
              if (s.workspace.ownerUid === req.uid)
                s.workspace.ownerName = profile.name;
            }
          });
        } catch (error) {
          if (error.status !== 403) throw error;
        }
      }
    }
    res.json({ profile });
  });
}
export function installWorkspaceRoutes(app, { read, mutate, profiles }) {
  app.post("/api/views", async (req, res) => {
    const input = z
      .object({ name: z.string().trim().min(2).max(40), filters: validFilters })
      .strict()
      .parse(req.body);
    const views = await profiles.mutateProfile(req.uid, (p) => {
      p.savedViews ||= [];
      const existing = p.savedViews.find(
        (view) =>
          view.workspaceId === req.workspaceId && view.name === input.name,
      );
      if (!existing && p.savedViews.length >= 12)
        fail(409, "You can save up to 12 views. Remove an unused view first.");
      const view = {
        id: existing?.id || randomUUID(),
        workspaceId: req.workspaceId,
        ...input,
      };
      p.savedViews = [
        ...p.savedViews.filter((item) => item.id !== view.id),
        view,
      ];
      return p.savedViews;
    });
    res.json({ views });
  });
  app.delete("/api/views/:id", async (req, res) => {
    const views = await profiles.mutateProfile(req.uid, (p) => {
      p.savedViews = (p.savedViews || []).filter(
        (view) =>
          view.id !== req.params.id || view.workspaceId !== req.workspaceId,
      );
      return p.savedViews;
    });
    res.json({ views });
  });
  app.post("/api/notifications/read", async (req, res) => {
    const { ids } = z
      .object({ ids: z.array(z.string().max(300)).max(100) })
      .strict()
      .parse(req.body);
    const readNotifications = await profiles.mutateProfile(req.uid, (p) => {
      p.readNotifications = [
        ...new Set([
          ...(p.readNotifications || []),
          ...ids.map((id) => req.workspaceId + ":" + id),
        ]),
      ].slice(-300);
      return p.readNotifications;
    });
    res.json({ readNotifications });
  });
  app.post("/api/calendar/mark", async (req, res) => {
    const input = z
      .object({
        taskId: key,
        fingerprint: z.string().max(200),
        saved: z.boolean(),
      })
      .strict()
      .parse(req.body);
    const s = await read(req.workspaceId);
    if (!s.tasks.some((task) => task.id === input.taskId))
      fail(404, "Task not found.");
    const calendarMarks = await profiles.mutateProfile(req.uid, (p) => {
      p.calendarMarks = (p.calendarMarks || []).filter(
        (mark) =>
          mark.workspaceId !== req.workspaceId || mark.taskId !== input.taskId,
      );
      if (input.saved)
        p.calendarMarks.push({
          ...input,
          workspaceId: req.workspaceId,
          markedAt: now(),
        });
      p.calendarMarks = p.calendarMarks.slice(-100);
      return p.calendarMarks;
    });
    res.json({ calendarMarks });
  });
  app.post("/api/agendas", async (req, res) => {
    const input = meetingInput
      .pick({ title: true, date: true, type: true, projectId: true })
      .extend({
        parentMeetingId: key.nullable(),
        agenda: z.string().trim().min(1).max(4000),
        clientId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const agenda = await mutate(req, (s) => {
      if (input.projectId && !s.projects.some((p) => p.id === input.projectId))
        fail(400, "Choose a project in this workspace.");
      if (
        input.parentMeetingId &&
        !s.meetings.some((m) => m.id === input.parentMeetingId)
      )
        fail(400, "Choose a previous meeting in this workspace.");
      const existing = s.agendas.find(
        (item) =>
          item.clientId === input.clientId && item.createdBy === req.uid,
      );
      if (existing) return existing;
      if (s.agendas.length >= 50)
        fail(
          409,
          "This workspace has 50 saved agendas. Reuse an existing agenda.",
        );
      const item = {
        ...input,
        id: randomUUID().replaceAll("-", ""),
        createdAt: now(),
        createdBy: req.uid,
        meetingId: null,
      };
      s.agendas.push(item);
      return item;
    });
    res.status(201).json({ agenda });
  });
  app.post("/api/tasks/schedules", async (req, res) => {
    const input = z
      .object({
        tasks: z
          .array(
            z
              .object({
                id: key,
                expectedUpdatedAt: z.string(),
                schedule: scheduleInput.nullable(),
              })
              .strict(),
          )
          .min(1)
          .max(25),
      })
      .strict()
      .parse(req.body);
    if (new Set(input.tasks.map((task) => task.id)).size !== input.tasks.length)
      fail(400, "Choose each task once.");
    await mutate(req, (s) => {
      for (const selected of input.tasks) {
        const task = s.tasks.find((item) => item.id === selected.id);
        if (!task) fail(404, "A selected task is missing.");
        if (task.updatedAt !== selected.expectedUpdatedAt)
          fail(409, "A task changed. Refresh before saving schedules.");
        Object.assign(task, {
          schedule: selected.schedule,
          updatedAt: stamp(task.updatedAt),
          updatedBy: req.uid,
        });
      }
    });
    res.json({ updated: input.tasks.length, undoToken: req.undoToken });
  });
  app.post("/api/tasks/bulk", async (req, res) => {
    const input = z
      .object({
        tasks: z
          .array(z.object({ id: key, expectedUpdatedAt: z.string() }).strict())
          .min(1)
          .max(25),
        changes: taskPatch
          .partial()
          .omit({
            expectedUpdatedAt: true,
            title: true,
            description: true,
            deadline: true,
            checklist: true,
            dependencyIds: true,
            schedule: true,
          })
          .strict(),
      })
      .strict()
      .parse(req.body);
    if (
      new Set(input.tasks.map((task) => task.id)).size !== input.tasks.length ||
      !Object.keys(input.changes).length
    )
      fail(400, "Choose tasks and at least one change.");
    await mutate(req, (s) => {
      const before = structuredClone(s.tasks);
      for (const selected of input.tasks) {
        const task = s.tasks.find((task) => task.id === selected.id);
        if (!task) fail(404, "A selected task is no longer available.");
        if (task.updatedAt !== selected.expectedUpdatedAt)
          fail(
            409,
            "A selected task changed. Refresh and select the tasks again.",
          );
        Object.assign(
          task,
          taskFields({ ...task, ...input.changes }, s, task),
          { updatedAt: stamp(task.updatedAt), updatedBy: req.uid },
        );
      }
      validateDependencies(s.tasks);
      for (const task of s.tasks)
        assertCompletion(
          task,
          s.tasks,
          before.find((item) => item.id === task.id),
        );
    });
    res.json({ updated: input.tasks.length, undoToken: req.undoToken });
  });
  app.delete("/api/tasks/:id", async (req, res) => {
    const { expectedUpdatedAt } = z
      .object({ expectedUpdatedAt: z.string() })
      .strict()
      .parse(req.body);
    await mutate(req, (s) => {
      const task = s.tasks.find((task) => task.id === req.params.id);
      if (!task) fail(404, "Task not found.");
      if (task.updatedAt !== expectedUpdatedAt)
        fail(409, "This task changed. Reopen it before deleting.");
      if (s.tasks.some((item) => item.dependencyIds?.includes(task.id)))
        fail(
          409,
          "Other tasks depend on this work. Remove their dependency first.",
        );
      s.tasks = s.tasks.filter((item) => item.id !== task.id);
      const proposal = s.meetings
        .find((meeting) => meeting.id === task.meetingId)
        ?.proposals.find((proposal) => proposal.id === task.proposalId);
      if (proposal) proposal.taskId = null;
    });
    res.json({ deleted: true, undoToken: req.undoToken });
  });
  app.post("/api/undo/:token", async (req, res) => {
    await mutate(
      req,
      (s) => {
        const records = s.undoRecords.filter(
          (record) =>
            record.group === req.params.token && record.actorUid === req.uid,
        );
        if (
          !records.length ||
          records.some((record) => record.expires <= Date.now())
        )
          fail(
            410,
            "This undo has expired. Changes can be undone for five minutes.",
          );
        for (const record of records) {
          const task = s.tasks.find((task) => task.id === record.taskId);
          if (
            record.afterUpdatedAt
              ? !task || task.updatedAt !== record.afterUpdatedAt
              : task
          )
            fail(
              409,
              "Someone changed this task after your action. Undo would overwrite their work.",
            );
        }
        const previous = structuredClone(s.tasks);
        for (const record of records) {
          s.tasks = s.tasks.filter((task) => task.id !== record.taskId);
          const restored = {
            ...record.snapshot,
            updatedAt: stamp(
              record.afterUpdatedAt || record.snapshot.updatedAt,
            ),
            updatedBy: req.uid,
          };
          s.tasks.push(restored);
          const proposal = s.meetings
            .find((meeting) => meeting.id === restored.meetingId)
            ?.proposals.find((proposal) => proposal.id === restored.proposalId);
          if (proposal) proposal.taskId = restored.id;
        }
        validateDependencies(s.tasks);
        for (const task of s.tasks)
          assertCompletion(
            task,
            s.tasks,
            previous.find((item) => item.id === task.id),
          );
        s.undoRecords = s.undoRecords.filter(
          (record) => record.group !== req.params.token,
        );
      },
      "write",
      { undo: false },
    );
    res.json({ undone: true });
  });
}

export function installReminderRoute(
  app,
  { profiles, repo, mailer, secret, origin, lookupIdentity },
) {
  app.get("/api/reminders", async (req, res) => {
    if (!secret || !mailer.ready || !origin)
      fail(503, "Daily email reminders are not configured.");
    const supplied = Buffer.from(req.get("authorization") || ""),
      expected = Buffer.from("Bearer " + secret);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      fail(401, "Not authorized.");
    const candidates = (await profiles.reminderProfiles()).sort((a, b) =>
      (a.emailAttempts?.at(-1)?.day || "").localeCompare(
        b.emailAttempts?.at(-1)?.day || "",
      ),
    );
    let sent = 0,
      skipped = 0,
      failed = 0,
      cursor = 0;
    const deadline = Date.now() + 240000;
    async function runOne(profile) {
      let identity;
      try {
        identity = await lookupIdentity(profile.uid);
      } catch {
        skipped++;
        return;
      }
      if (
        !identity?.emailVerified ||
        identity.disabled ||
        identity.email?.toLowerCase() !== profile.email?.toLowerCase()
      ) {
        skipped++;
        return;
      }
      const day = dateInZone(
        new Date(),
        profile.preferences?.timeZone || "Africa/Johannesburg",
      );
      const claimed = await profiles.mutateProfile(profile.uid, (p) => {
        if (
          !p.preferences?.emailReminders ||
          (p.emailAttempts || []).some((item) => item.day === day)
        )
          return false;
        p.emailAttempts = [
          ...(p.emailAttempts || []).slice(-13),
          { day, status: "sending", startedAt: now() },
        ];
        return true;
      });
      if (!claimed) {
        skipped++;
        return;
      }
      let status = "skipped";
      try {
        const fresh = await profiles.getProfile(profile.uid);
        if (!fresh.preferences?.emailReminders) {
          skipped++;
          return;
        }
        const actor = {
          uid: profile.uid,
          name: fresh.name || identity.displayName || identity.email,
          aliases: fresh.aliases || [],
          email: identity.email.toLowerCase(),
          emailVerified: true,
        };
        const catalog = await repo.catalog(actor),
          lines = [];
        for (const workspace of catalog.workspaces) {
          const s = await repo.list(workspace.id);
          try {
            authorize(s, actor, workspace.id);
          } catch {
            continue;
          }
          const notices = taskNotifications(
            s.tasks,
            actor,
            { ...fresh.preferences, inAppNotifications: true },
            day,
          ).filter((item) => item.kind !== "assigned");
          const newAssignments = (s.activity || [])
            .filter(
              (item) =>
                item.targetType === "task" &&
                /created a task|changed the assignee/.test(item.action) &&
                dateInZone(
                  new Date(item.createdAt),
                  fresh.preferences?.timeZone,
                ) === day,
            )
            .map((item) => s.tasks.find((task) => task.id === item.targetId))
            .filter(
              (task) =>
                task &&
                task.status !== "Completed" &&
                isAssignedTo(task, actor),
            );
          for (const task of newAssignments)
            if (!notices.some((item) => item.taskId === task.id))
              notices.push({ title: task.title, text: "New assignment today" });
          if (notices.length)
            lines.push(
              workspace.name,
              ...notices
                .slice(0, 30)
                .map((item) => "• " + item.title + " — " + item.text),
              "",
            );
        }
        if (!lines.length) {
          skipped++;
          return;
        }
        const text = `Earny · ShiftScript\nYour task reminders for ${day}\n\n${lines.join("\n")}\nOpen ShiftScript: ${origin}/app\n\nManage email reminders in Profile → Reminder preferences.`;
        // Consent is checked again immediately before the external send.
        if (
          !(await profiles.getProfile(profile.uid)).preferences?.emailReminders
        ) {
          skipped++;
          return;
        }
        const outcome = await mailer.send([actor.email], {
          subject: "ShiftScript: your task reminders",
          text,
          html: `<div style="font-family:Arial;color:#182b52;white-space:pre-wrap">${escapeEmail(text)}</div>`,
        });
        status = outcome.accepted?.some(
          (email) => email.toLowerCase() === actor.email,
        )
          ? "accepted"
          : "rejected";
        status === "accepted" ? sent++ : failed++;
      } catch {
        status = "uncertain";
        failed++;
      } finally {
        await profiles.mutateProfile(profile.uid, (p) => {
          const attempt = p.emailAttempts?.find((item) => item.day === day);
          if (attempt) Object.assign(attempt, { status, completedAt: now() });
        });
      }
    }
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (
          cursor < Math.min(candidates.length, 20) &&
          Date.now() < deadline
        ) {
          const profile = candidates[cursor++];
          await runOne(profile);
        }
      }),
    );
    res.json({
      sent,
      skipped,
      failed,
      remaining: Math.max(0, candidates.length - cursor),
    });
  });
}
