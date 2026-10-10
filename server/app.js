import "dotenv/config";
import express from "express";
import { z } from "zod";
import { GoogleIntegration } from "./google.js";
import { RecapMailer, recap, emailInput } from "./recap-email.js";
import {
  invitationOrigin,
  invitationMessage,
  invitationExpired,
  INVITATION_DAYS,
} from "./invitation-email.js";
import { LocalStore, FirebaseStore, hydrate } from "./store.js";
import { ownerCandidates } from "../shared/identity.js";
import { firebase } from "./firebase.js";
import { analyze, sampleTranscript } from "./analyze.js";
import { transcribe, validateAudio, MAX_AUDIO_BYTES } from "./audio.js";
import { defaultModel } from "./gemini.js";
import {
  MemoryProfiles,
  installPersonalRoutes,
  installWorkspaceRoutes,
  installReminderRoute,
  recordChanges,
  validateDependencies,
  assertCompletion,
  stamp,
} from "./productivity.js";
import {
  meetingInput,
  meetingId,
  reviewSchema,
  bulkReviewInput,
  taskPatch,
  manualTaskInput,
  projectInput,
  draftInput,
  noteInput,
  hash,
  resolveDeadline,
} from "./schema.js";
import {
  fail,
  now,
  id,
  authorize,
  newWorkspace,
  checkProject,
  taskFields,
} from "./collaboration.js";
const key = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const workspaceInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    ownerName: z.string().trim().min(2).max(80),
  })
  .strict();
export function createApp({
  store,
  google,
  mailer = new RecapMailer(),
  appUrl = process.env.APP_URL || process.env.GOOGLE_REDIRECT_URI,
  analyzer = analyze,
  transcriber = transcribe,
  storage = process.env.STORAGE_MODE || "local",
  provider = process.env.AI_PROVIDER || "sample",
  signupEnabled = process.env.PUBLIC_SIGNUP_ENABLED === "true",
  verifyToken = (token) => firebase().auth.verifyIdToken(token, true),
  profileStore,
  cronSecret = process.env.CRON_SECRET,
  reminderIdentity = (uid) => firebase().auth.getUser(uid),
} = {}) {
  const app = express(),
    production =
      process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const repo =
    store || (storage === "firebase" ? new FirebaseStore() : new LocalStore());
  const googleClient = google || new GoogleIntegration({ storage });
  const publicOrigin = invitationOrigin(appUrl);
  const profiles =
    profileStore ||
    (typeof repo.getProfile === "function" ? repo : new MemoryProfiles());
  const remindersReady = Boolean(cronSecret && publicOrigin && mailer.ready);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "3.5mb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      storage,
      provider,
      authRequired: storage === "firebase",
      signupEnabled: storage === "firebase" && signupEnabled,
      sampleTranscript,
      model: process.env.GEMINI_MODEL || defaultModel,
      maxAudioBytes: MAX_AUDIO_BYTES,
      aiReady: provider === "sample" || Boolean(process.env.GEMINI_API_KEY),
      googleReady: googleClient.ready,
      emailReady: mailer.ready,
      invitationEmailReady: Boolean(mailer.ready && publicOrigin),
      remindersReady,
      version: "3.0.3",
    }),
  );
  installReminderRoute(app, {
    profiles,
    repo,
    mailer,
    secret: cronSecret,
    origin: publicOrigin,
    lookupIdentity: reminderIdentity,
  });
  // OAuth returns through a top-level navigation, without a Firebase bearer header.
  app.get("/api/google/callback", async (req, res) => {
    if (!googleClient.ready)
      return res
        .status(503)
        .send("Google connection is not configured. Return to ShiftScript.");
    const cookie = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("shiftscript-google="))
      ?.split("=")
      .slice(1)
      .join("=");
    let status = "connected";
    try {
      await googleClient.callback(req.query, cookie);
    } catch {
      status = "error";
    }
    res.clearCookie("shiftscript-google", googleClient.cookieOptions());
    res.set("Referrer-Policy", "no-referrer");
    res.redirect(303, googleClient.redirect.origin + "/app?google=" + status);
  });
  app.use("/api", async (req, _res, next) => {
    try {
      if (production && storage !== "firebase")
        fail(
          503,
          "Production requires STORAGE_MODE=firebase. Local files are not durable on Vercel.",
        );
      if (storage === "local") {
        req.actor = {
          uid: "local-demo",
          email: "demo@example.invalid",
          name: "ShiftScript demo",
          emailVerified: true,
        };
      } else {
        const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if (!token) fail(401, "Please sign in to your ShiftScript workspace.");
        let decoded;
        try {
          decoded = await verifyToken(token);
        } catch (e) {
          if (e.status === 503) throw e;
          console.error("Firebase verification:", e.code || e.name);
          fail(401, "Your session could not be verified. Sign in again.");
        }
        const allowed = (process.env.ALLOWED_EMAILS || "")
          .split(",")
          .map((v) => v.trim().toLowerCase())
          .filter(Boolean);
        if (!signupEnabled && production && !allowed.length)
          fail(
            503,
            "Configure ALLOWED_EMAILS or enable PUBLIC_SIGNUP_ENABLED before using the deployed app.",
          );
        if (
          !signupEnabled &&
          allowed.length &&
          !allowed.includes(decoded.email?.toLowerCase())
        )
          fail(403, "This account does not have access to this workspace.");
        req.actor = {
          uid: decoded.uid,
          email: (decoded.email || "").toLowerCase(),
          name: decoded.name || decoded.email || "Workspace member",
          emailVerified: Boolean(decoded.email_verified),
        };
      }
      req.uid = req.actor.uid;
      const personal = await profiles.getProfile(req.uid);
      req.actor.name = personal.name || req.actor.name;
      req.actor.aliases = personal.aliases || [];
      next();
    } catch (e) {
      next(e);
    }
  });
  const read = async (workspaceId) =>
    hydrate(await repo.list(workspaceId), workspaceId);
  const mutate = (req, operation, permission = "write", options = {}) =>
    repo.mutate(req.workspaceId, (raw) => {
      // Check permissions again within the transaction so revocation cannot race a write.
      const s = hydrate(raw, req.workspaceId);
      authorize(s, req.actor, req.workspaceId, permission);
      const before = structuredClone(s);
      const result = operation(s);
      req.undoToken = recordChanges(
        s,
        before,
        req.actor,
        options.undo !== false,
      );
      Object.assign(raw, s);
      return result;
    });
  async function catalog(actor) {
    if (repo.catalog) return repo.catalog(actor);
    const own = await read(actor.uid);
    return {
      workspaces: own.workspace ? [{ ...own.workspace, role: "owner" }] : [],
      invitations: [],
    };
  }
  installPersonalRoutes(app, {
    profiles,
    repo,
    catalog,
    mailer,
    remindersReady,
  });
  app.get("/api/workspaces", async (req, res) => {
    const d = await catalog(req.actor);
    if (storage === "local" && !d.workspaces.some((w) => w.id === "local-demo"))
      d.workspaces.unshift({
        id: "local-demo",
        name: "Your workspace",
        role: "owner",
        ownerName: "ShiftScript demo",
      });
    res.json({ ...d, actor: req.actor });
  });
  app.post("/api/workspace", async (req, res) => {
    const input = workspaceInput.parse(req.body);
    const workspace = await repo.mutate(req.uid, (raw) => {
      const s = hydrate(raw, req.uid);
      if (s.workspace)
        fail(
          409,
          "You already have a workspace. Open workspace settings to rename it.",
        );
      s.workspace = newWorkspace(req.uid, input, req.actor);
      Object.assign(raw, s);
      return s.workspace;
    });
    res.status(201).json({ workspace });
  });
  app.post("/api/workspaces", async (req, res) => {
    const input = workspaceInput.parse(req.body),
      c = await catalog(req.actor);
    if (c.workspaces.length >= 20)
      fail(409, "You can belong to at most 20 workspaces.");
    const workspaceId = id("w_");
    const workspace = await repo.mutate(workspaceId, (s) => {
      s.workspace = newWorkspace(workspaceId, input, req.actor);
      return s.workspace;
    });
    res.status(201).json({ workspace });
  });
  app.post(
    "/api/workspaces/:workspaceId/invitations/:inviteId/accept",
    async (req, res) => {
      key.parse(req.params.workspaceId);
      key.parse(req.params.inviteId);
      if (!req.actor.emailVerified)
        fail(
          403,
          "Verify your email address before accepting a workspace invitation.",
        );
      const c = await catalog(req.actor);
      if (
        c.workspaces.length >= 20 &&
        !c.workspaces.some((w) => w.id === req.params.workspaceId)
      )
        fail(409, "You can belong to at most 20 workspaces.");
      const workspace = await repo.mutate(req.params.workspaceId, (raw) => {
        const s = hydrate(raw, req.params.workspaceId),
          w = s.workspace;
        if (!w) fail(404, "Invitation not found or no longer available.");
        const invitation = w.invites.find(
          (i) => i.id === req.params.inviteId && i.email === req.actor.email,
        );
        if (!invitation)
          fail(404, "Invitation not found or no longer available.");
        if (invitationExpired(invitation))
          fail(
            410,
            "This invitation expired. Ask the workspace owner for a new one.",
          );
        if (w.members.length >= 20 && !w.members.some((m) => m.uid === req.uid))
          fail(409, "This workspace has reached its 20-member limit.");
        if (!w.members.some((m) => m.uid === req.uid))
          w.members.push({
            uid: req.uid,
            name: req.actor.name,
            aliases: req.actor.aliases || [],
            email: req.actor.email,
            role: invitation.role,
            joinedAt: now(),
          });
        w.invites = w.invites.filter((i) => i.id !== invitation.id);
        w.memberUids = w.members.map((m) => m.uid);
        w.inviteEmails = w.invites.map((i) => i.email);
        w.updatedAt = now();
        Object.assign(raw, s);
        return {
          id: w.id,
          name: w.name,
          role: w.members.find((m) => m.uid === req.uid).role,
        };
      });
      res.json({ workspace });
    },
  );
  app.use("/api", async (req, _res, next) => {
    try {
      req.workspaceId = key.parse(req.get("X-Workspace-Id") || req.uid);
      const s = await read(req.workspaceId);
      req.role = authorize(s, req.actor, req.workspaceId);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/workspace", async (req, res) => {
    const d = await read(req.workspaceId),
      role = authorize(d, req.actor, req.workspaceId);
    const workspace = d.workspace && {
      ...d.workspace,
      invites: role === "owner" ? d.workspace.invites : [],
      inviteEmails: role === "owner" ? d.workspace.inviteEmails : [],
    };
    res.json({
      workspace,
      role,
      projects: d.projects,
      draft: d.drafts.find((d) => d.ownerUid === req.uid) || null,
      meetings: d.meetings.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      tasks: d.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      activity: d.activity.slice().reverse(),
      agendas: d.agendas.slice().reverse(),
    });
  });
  installWorkspaceRoutes(app, { read, mutate, profiles });
  app.patch("/api/workspace", async (req, res) => {
    const input = workspaceInput.parse(req.body);
    const workspace = await mutate(
      req,
      (s) => {
        if (!s.workspace) fail(404, "Create your workspace first.");
        Object.assign(s.workspace, input, { updatedAt: now() });
        const owner = s.workspace.members.find((m) => m.uid === req.uid);
        if (owner) owner.name = input.ownerName;
        return s.workspace;
      },
      "owner",
    );
    res.json({ workspace });
  });
  app.post("/api/members/invitations", async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
        role: z.enum(["member", "viewer"]),
        clientId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body);
    const invitation = await mutate(
      req,
      (s) => {
        if (!s.workspace)
          fail(400, "Name your workspace before inviting members.");
        const w = s.workspace;
        const prior =
          input.clientId &&
          w.invites.find((i) => i.clientId === input.clientId);
        if (prior) {
          if (prior.email !== input.email || prior.role !== input.role)
            fail(
              409,
              "This invitation request was already used. Start a new invitation.",
            );
          return prior;
        }
        w.invites = w.invites.filter((i) => !invitationExpired(i));
        if (
          input.email === req.actor.email ||
          w.members.some((m) => m.email === input.email)
        )
          fail(409, "This person is already in the workspace.");
        if (w.invites.some((i) => i.email === input.email))
          fail(409, "There is already a pending invitation for this email.");
        if (w.members.length + w.invites.length >= 20)
          fail(
            409,
            "A workspace can have at most 20 members and pending invitations.",
          );
        const invitation = {
          ...input,
          id: id("i_"),
          createdAt: now(),
          expiresAt: new Date(
            Date.now() + INVITATION_DAYS * 86400000,
          ).toISOString(),
          invitedBy: req.uid,
        };
        w.invites.push(invitation);
        w.inviteEmails = w.invites.map((i) => i.email);
        w.updatedAt = now();
        return invitation;
      },
      "owner",
    );
    res.status(201).json({ invitation });
  });
  app.post("/api/members/invitations/:inviteId/email", async (req, res) => {
    key.parse(req.params.inviteId);
    const { requestId } = z
      .object({ requestId: z.string().uuid() })
      .strict()
      .parse(req.body);
    const reservation = await mutate(
      req,
      (s) => {
        if (!mailer.ready || !publicOrigin)
          fail(
            503,
            "Invitation email needs Zoho SMTP and APP_URL (or GOOGLE_REDIRECT_URI) configured. The invitation link is still available to copy.",
          );
        const invite = s.workspace.invites.find(
          (i) => i.id === req.params.inviteId,
        );
        if (!invite) fail(404, "Invitation not found or no longer available.");
        if (invitationExpired(invite))
          fail(410, "This invitation expired. Revoke it and create a new one.");
        const previous = (invite.emailSends || []).find(
          (v) => v.id === requestId,
        );
        if (previous) {
          if (["accepted", "rejected"].includes(previous.status))
            return { previous };
          fail(
            409,
            "This send is already in progress or its result is uncertain. Check Zoho Sent mail before resending.",
          );
        }
        const last = invite.emailSends?.at(-1);
        if (last && Date.now() - Date.parse(last.at) < 60000)
          fail(429, "Wait one minute before resending this invitation.");
        if ((invite.emailSends || []).length >= 20)
          fail(
            429,
            "This invitation reached its email limit. Use the copy link option.",
          );
        const day = now().slice(0, 10);
        const quota = s.quota.invitationMail || {};
        const count = quota.date === day ? quota.count : 0;
        if (count >= 20)
          fail(
            429,
            "Daily workspace invitation email limit reached (20). Use the copy link option or try tomorrow (UTC).",
          );
        s.quota.invitationMail = { date: day, count: count + 1 };
        const send = {
          id: requestId,
          status: "sending",
          at: now(),
          by: req.uid,
        };
        invite.emailSends = [...(invite.emailSends || []), send];
        return {
          send,
          email: invite.email,
          message: invitationMessage(
            s.workspace,
            invite,
            publicOrigin,
            req.actor.name,
          ),
        };
      },
      "owner",
    );
    if (reservation.previous)
      return res.json({ send: reservation.previous, cached: true });
    async function finish(outcome) {
      return repo.mutate(req.workspaceId, (s) => {
        const attempt = s.workspace?.invites
          .find((i) => i.id === req.params.inviteId)
          ?.emailSends?.find((v) => v.id === requestId);
        // The owner may revoke the invitation, or its recipient may join, during SMTP.
        if (attempt) Object.assign(attempt, outcome);
        return { ...reservation.send, ...outcome };
      });
    }
    let result;
    try {
      const fresh = await read(req.workspaceId);
      authorize(fresh, req.actor, req.workspaceId, "owner");
      if (!fresh.workspace.invites.some((i) => i.id === req.params.inviteId))
        fail(409, "Invitation was revoked.");
      result = await mailer.send([reservation.email], reservation.message);
    } catch {
      await finish({ status: "uncertain" });
      fail(
        502,
        "Invitation saved, but sending could not be confirmed. Check Zoho Sent mail before resending. You can still copy its link.",
      );
    }
    const send = await finish({
      ...result,
      status: result.accepted.includes(reservation.email)
        ? "accepted"
        : "rejected",
    });
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "owner");
    res.json({ send, cached: false });
  });
  app.delete("/api/members/invitations/:inviteId", async (req, res) => {
    await mutate(
      req,
      (s) => {
        s.workspace.invites = s.workspace.invites.filter(
          (i) => i.id !== req.params.inviteId,
        );
        s.workspace.inviteEmails = s.workspace.invites.map((i) => i.email);
      },
      "owner",
    );
    res.json({ removed: true });
  });
  app.patch("/api/members/:uid", async (req, res) => {
    const { role } = z
      .object({ role: z.enum(["member", "viewer"]) })
      .strict()
      .parse(req.body);
    await mutate(
      req,
      (s) => {
        const w = s.workspace,
          member = w?.members.find((m) => m.uid === req.params.uid);
        if (!member) fail(404, "Member not found.");
        if (member.uid === w.ownerUid)
          fail(400, "The workspace owner cannot be demoted.");
        member.role = role;
        w.updatedAt = now();
      },
      "owner",
    );
    res.json({ saved: true });
  });
  app.delete("/api/members/:uid", async (req, res) => {
    await mutate(
      req,
      (s) => {
        if (req.params.uid === s.workspace.ownerUid)
          fail(400, "The workspace owner cannot be removed.");
        s.workspace.members = s.workspace.members.filter(
          (m) => m.uid !== req.params.uid,
        );
        s.workspace.memberUids = s.workspace.members.map((m) => m.uid);
        s.drafts = s.drafts.filter((d) => d.ownerUid !== req.params.uid);
      },
      "owner",
    );
    res.json({ removed: true });
  });
  app.post("/api/projects", async (req, res) => {
    const input = projectInput.parse(req.body);
    const project = await mutate(req, (s) => {
      if (s.projects.length >= 50)
        fail(409, "Workspace project limit reached (50).");
      const p = {
        ...input,
        id: id("p_"),
        createdBy: req.uid,
        createdAt: now(),
        updatedAt: now(),
      };
      s.projects.push(p);
      return p;
    });
    res.status(201).json({ project });
  });
  app.patch("/api/projects/:id", async (req, res) => {
    const input = projectInput.parse(req.body);
    const project = await mutate(req, (s) => {
      const p = s.projects.find((p) => p.id === req.params.id);
      if (!p) fail(404, "Project not found.");
      Object.assign(p, input, { updatedAt: now() });
      return p;
    });
    res.json({ project });
  });
  app.put("/api/drafts/current", async (req, res) => {
    const { expectedVersion, ...input } = draftInput.parse(req.body);
    const draft = await mutate(req, (s) => {
      checkProject(s, input.projectId);
      const current = s.drafts.find((d) => d.ownerUid === req.uid);
      if (
        expectedVersion !== undefined &&
        expectedVersion !== (current?.version || 0)
      )
        fail(
          409,
          "This draft changed in another tab or device. Reopen it before saving again. Your local copy is retained.",
        );
      const d = {
        ...input,
        id: req.uid,
        ownerUid: req.uid,
        version: (current?.version || 0) + 1,
        updatedAt: now(),
      };
      s.drafts = s.drafts.filter((d) => d.ownerUid !== req.uid);
      s.drafts.push(d);
      return d;
    });
    res.json({ draft });
  });
  app.delete("/api/drafts/current", async (req, res) => {
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().nonnegative() })
      .strict()
      .parse(req.body);
    await mutate(req, (s) => {
      const current = s.drafts.find((d) => d.ownerUid === req.uid);
      if ((current?.version || 0) !== expectedVersion)
        fail(409, "The draft changed in another tab. It has been kept.");
      s.drafts = s.drafts.filter((d) => d.ownerUid !== req.uid);
    });
    res.json({ removed: true });
  });
  async function claimQuota(req) {
    await mutate(req, (s) => {
      const date = now().slice(0, 10),
        count = s.quota.date === date ? s.quota.count : 0;
      if (count >= Number(process.env.MAX_ANALYSES_PER_DAY || 20))
        fail(
          429,
          "Daily workspace AI-request limit reached. Try again tomorrow (UTC).",
        );
      s.quota = { ...s.quota, date, count: count + 1 };
    });
  }
  app.post("/api/transcribe", async (req, res) => {
    const audio = validateAudio(req.body);
    if (provider !== "gemini")
      fail(
        422,
        "Voice transcription needs Gemini. Set AI_PROVIDER=gemini and add GEMINI_API_KEY.",
      );
    await claimQuota(req);
    const transcript = await transcriber(audio, provider);
    // Recheck access after an external request; don't return private results after revocation.
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "write");
    res.json({
      transcript,
      source: { kind: "audio", name: audio.name },
      provider,
    });
  });
  async function processMeeting(req, res, body, trustedSource) {
    const input = meetingInput.parse(body),
      meetingKey = meetingId(input),
      data = await read(req.workspaceId);
    authorize(data, req.actor, req.workspaceId, "write");
    checkProject(data, input.projectId);
    if (
      input.preparation?.parentMeetingId &&
      !data.meetings.some(
        (meeting) => meeting.id === input.preparation.parentMeetingId,
      )
    )
      fail(400, "The previous meeting is not in this workspace.");
    if (
      input.preparation?.agendaId &&
      !data.agendas.some((agenda) => agenda.id === input.preparation.agendaId)
    )
      fail(400, "This agenda is not in this workspace.");
    const existing = data.meetings.find((m) => m.id === meetingKey);
    if (existing) return res.json({ meeting: existing, cached: true });
    if (data.meetings.length >= 50)
      fail(409, "Workspace meeting limit reached (50).");
    await claimQuota(req);
    const result = await analyzer(
        trustedSource ? { ...input, source: trustedSource } : input,
        provider,
      ),
      createdAt = now();
    const meeting = {
      ...input,
      ...(trustedSource ? { source: trustedSource } : {}),
      projectId: input.projectId || null,
      id: meetingKey,
      createdAt,
      createdBy: req.uid,
      provider,
      summary: result.summary,
      discussionPoints: result.discussionPoints,
      decisions: result.decisions,
      followUps: result.followUps,
      proposals: result.actions.map((a, i) => ({
        ...a,
        id: hash(meetingKey + ":" + i),
        owner: a.owner || "Unassigned",
        ownerUid: null,
        deadline: a.deadline || "Not specified",
        dueDate: resolveDeadline(a.deadline, input.date),
        reviewStatus: "pending",
        taskId: null,
      })),
    };
    const saved = await mutate(req, (s) => {
      checkProject(s, meeting.projectId);
      const current = s.meetings.find((m) => m.id === meetingKey);
      if (current) return current;
      if (s.meetings.length >= 50)
        fail(409, "Workspace meeting limit reached.");
      if (meeting.preparation?.agendaId) {
        const agenda = s.agendas.find(
          (item) => item.id === meeting.preparation.agendaId,
        );
        if (!agenda) fail(409, "The agenda is no longer available.");
        agenda.meetingId = meeting.id;
      }
      s.meetings.push(meeting);
      return meeting;
    });
    res.status(201).json({ meeting: saved, cached: false });
  }
  app.post("/api/meetings", async (req, res) =>
    processMeeting(req, res, req.body),
  );
  app.get("/api/google/status", async (req, res) =>
    res.json(await googleClient.status(req.uid)),
  );
  app.post("/api/google/connect", async (req, res) => {
    const result = await googleClient.start(req.uid);
    res.cookie(
      "shiftscript-google",
      result.binding,
      googleClient.cookieOptions(),
    );
    res.json({ url: result.url });
  });
  app.delete("/api/google/connection", async (req, res) => {
    await googleClient.disconnect(req.uid);
    res.json({ disconnected: true });
  });
  app.get("/api/google/meetings", async (req, res) =>
    res.json(await googleClient.list(req.uid, req.query.cursor)),
  );
  app.get("/api/google/artifacts", async (req, res) =>
    res.json(await googleClient.artifacts(req.uid, req.query.name)),
  );
  app.post("/api/google/preview", async (req, res) => {
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "write");
    const result = await googleClient.preview(
      req.uid,
      req.workspaceId,
      req.body,
    );
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "write");
    res.json(result);
  });
  app.post("/api/google/import", async (req, res) => {
    if (provider !== "gemini")
      fail(422, "Google imports require live Gemini analysis.");
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "write");
    const { previewId, ...fields } = meetingInput
      .omit({ transcript: true, source: true })
      .extend({ previewId: z.string().min(20).max(100) })
      .strict()
      .parse(req.body);
    const imported = await googleClient.imported(
      req.uid,
      req.workspaceId,
      previewId,
    );
    await processMeeting(
      req,
      res,
      { ...fields, transcript: imported.transcript },
      imported.source,
    );
  });
  app.get("/api/meetings/:id/email-preview", async (req, res) => {
    const data = await read(req.workspaceId);
    authorize(data, req.actor, req.workspaceId, "write");
    const { html, subject, ...preview } = recap(data, req.params.id);
    res.json(preview);
  });
  app.post("/api/meetings/:id/email", async (req, res) => {
    if (!mailer.ready)
      fail(
        503,
        "Earny email is not configured yet. Contact your administrator.",
      );
    const input = emailInput.parse(req.body),
      recipients = [...new Set(input.recipients.map((v) => v.toLowerCase()))];
    const reservation = await mutate(req, (s) => {
      const m = s.meetings.find((v) => v.id === req.params.id);
      if (!m) fail(404, "Meeting not found.");
      const previous = (m.emailSends || []).find(
        (v) => v.id === input.requestId,
      );
      if (previous) {
        if (previous.status === "accepted" || previous.status === "partial")
          return { previous };
        fail(
          409,
          "This email attempt is already in progress or its result is uncertain. Check your mailbox before trying a new send.",
        );
      }
      const date = now().slice(0, 10);
      if (
        s.meetings
          .flatMap((v) => v.emailSends || [])
          .filter((v) => v.at.slice(0, 10) === date).length >= 10
      )
        fail(
          429,
          "Daily workspace email limit reached (10). Try again tomorrow (UTC).",
        );
      if ((m.emailSends || []).length >= 100)
        fail(409, "This meeting reached its email history limit.");
      const message = recap(s, m.id);
      if (message.fingerprint !== input.fingerprint)
        fail(
          409,
          "The recap changed since your preview. Reopen the email preview before sending.",
        );
      m.emailSends = [
        ...(m.emailSends || []),
        {
          id: input.requestId,
          status: "sending",
          recipients,
          at: now(),
          by: req.uid,
        },
      ];
      return { message };
    });
    if (reservation.previous)
      return res.json({ send: reservation.previous, cached: true });
    let result;
    try {
      authorize(
        await read(req.workspaceId),
        req.actor,
        req.workspaceId,
        "write",
      );
      result = await mailer.send(recipients, reservation.message);
    } catch {
      await repo.mutate(req.workspaceId, (s) => {
        s.meetings
          .find((v) => v.id === req.params.id)
          .emailSends.find((v) => v.id === input.requestId).status =
          "uncertain";
      });
      fail(
        502,
        "Email sending could not be confirmed. Check Zoho Sent mail before retrying to avoid duplicates.",
      );
    }
    // Record the external outcome even if membership changed during SMTP sending.
    const send = await repo.mutate(req.workspaceId, (raw) => {
      const m = raw.meetings.find((v) => v.id === req.params.id),
        send = m.emailSends.find((v) => v.id === input.requestId);
      Object.assign(send, {
        status: result.rejected.length
          ? result.accepted.length
            ? "partial"
            : "rejected"
          : "accepted",
        ...result,
      });
      return send;
    });
    authorize(await read(req.workspaceId), req.actor, req.workspaceId, "write");
    res.json({ send, cached: false });
  });
  app.patch("/api/meetings/:id/project", async (req, res) => {
    const { projectId } = z
      .object({ projectId: key.nullable() })
      .strict()
      .parse(req.body);
    await mutate(req, (s) => {
      checkProject(s, projectId);
      const m = s.meetings.find((m) => m.id === req.params.id);
      if (!m) fail(404, "Meeting not found.");
      m.projectId = projectId;
      m.updatedAt = now();
      for (const t of s.tasks.filter((t) => t.meetingId === m.id)) {
        t.projectId = projectId;
        t.updatedAt = now();
      }
    });
    res.json({ saved: true });
  });
  function review(s, meeting, proposalId, input, actor) {
    const p = meeting.proposals.find((p) => p.id === proposalId);
    if (!p) fail(404, "Proposal not found.");
    if (p.reviewStatus !== "pending") return false;
    const { decision, ...value } = input,
      fields = taskFields(value, s);
    if (decision === "approved") {
      if (
        !fields.ownerUid &&
        ownerCandidates(fields.owner, s.workspace?.members || []).length > 1
      )
        fail(
          400,
          "More than one member matches this owner. Choose the correct account before approval.",
        );
      if (s.tasks.length >= 250)
        fail(409, "Workspace task limit reached (250).");
      const taskId = hash(meeting.id + ":" + p.id);
      if (!s.tasks.some((t) => t.id === taskId))
        s.tasks.push({
          ...fields,
          id: taskId,
          projectId: meeting.projectId || null,
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          proposalId: p.id,
          evidence: p.evidence,
          sourceType: "meeting",
          status: "To Do",
          createdAt: now(),
          updatedAt: now(),
          createdBy: actor.uid,
          notes: [],
          checklist: [],
        });
      p.taskId = taskId;
    }
    Object.assign(p, fields, {
      reviewStatus: decision,
      reviewedBy: actor.uid,
      reviewedAt: now(),
    });
    return true;
  }
  app.post(
    "/api/meetings/:meetingId/proposals/:proposalId/review",
    async (req, res) => {
      const input = reviewSchema.parse(req.body);
      const result = await mutate(req, (s) => {
        const m = s.meetings.find((m) => m.id === req.params.meetingId);
        if (!m) fail(404, "Meeting not found.");
        const changed = review(s, m, req.params.proposalId, input, req.actor);
        return { meeting: m, alreadyReviewed: !changed };
      });
      res.json(result);
    },
  );
  app.post("/api/meetings/:meetingId/reviews", async (req, res) => {
    const { reviews } = bulkReviewInput.parse(req.body);
    if (new Set(reviews.map((r) => r.proposalId)).size !== reviews.length)
      fail(400, "Select each proposal only once.");
    const result = await mutate(req, (s) => {
      const m = s.meetings.find((m) => m.id === req.params.meetingId);
      if (!m) fail(404, "Meeting not found.");
      let reviewed = 0;
      for (const { proposalId, ...input } of reviews)
        if (review(s, m, proposalId, input, req.actor)) reviewed++;
      return { meeting: m, reviewed };
    });
    res.json(result);
  });
  app.post("/api/tasks", async (req, res) => {
    const input = manualTaskInput.parse(req.body);
    const task = await mutate(req, (s) => {
      const taskId = input.clientId
        ? hash("manual:" + input.clientId)
        : id("t_");
      const existing = s.tasks.find((t) => t.id === taskId);
      if (existing) return existing;
      if (s.tasks.length >= 250)
        fail(409, "Workspace task limit reached (250).");
      const task = {
        ...taskFields(input, s),
        id: taskId,
        projectId: input.projectId || null,
        ownerUid: input.ownerUid || null,
        sourceType: "manual",
        meetingId: null,
        meetingTitle: "Added manually",
        proposalId: null,
        evidence: null,
        notes: [],
        checklist: input.checklist || [],
        createdAt: now(),
        updatedAt: now(),
        createdBy: req.uid,
      };
      s.tasks.push(task);
      validateDependencies(s.tasks);
      assertCompletion(task, s.tasks);
      return task;
    });
    res.status(201).json({ task });
  });
  app.patch("/api/tasks/:id", async (req, res) => {
    const input = taskPatch.parse(req.body);
    if (
      input.checklist &&
      new Set(input.checklist.map((i) => i.id)).size !== input.checklist.length
    )
      fail(400, "Checklist items must have unique IDs.");
    const task = await mutate(req, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) fail(404, "Task not found.");
      if (input.expectedUpdatedAt && t.updatedAt !== input.expectedUpdatedAt)
        fail(
          409,
          "This task changed since you opened it. Close and reopen it to load the latest version.",
        );
      const previous = structuredClone(t);
      Object.assign(t, taskFields(input, s, t), {
        updatedAt: stamp(t.updatedAt),
        updatedBy: req.uid,
      });
      validateDependencies(s.tasks);
      assertCompletion(t, s.tasks, previous);
      return t;
    });
    res.json({ task, undoToken: req.undoToken });
  });
  app.post("/api/tasks/:id/notes", async (req, res) => {
    const note = noteInput.parse(req.body);
    const task = await mutate(req, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) fail(404, "Task not found.");
      if (t.notes.length >= 50)
        fail(409, "Maximum 50 progress updates per task.");
      t.notes.push({
        id: id("n_"),
        text: note.text,
        createdAt: now(),
        authorUid: req.uid,
        authorName: req.actor.name,
      });
      t.updatedAt = stamp(t.updatedAt);
      return t;
    });
    res.status(201).json({ task, undoToken: req.undoToken });
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  app.use((e, _req, res, _next) => {
    const status =
      e instanceof z.ZodError
        ? 400
        : e.status >= 400 && e.status < 600
          ? e.status
          : 500;
    const message =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : status === 500
          ? "The server could not complete this request. Check the server setup and try again."
          : e.message;
    console.error("API error:", status, e.name);
    res.status(status).json({ error: message });
  });
  return app;
}
export default createApp();
