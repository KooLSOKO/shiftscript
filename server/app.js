import "dotenv/config";
import express from "express";
import { z } from "zod";
import { LocalStore, FirebaseStore } from "./store.js";
import { firebase } from "./firebase.js";
import { analyze, sampleTranscript } from "./analyze.js";
import { transcribe, validateAudio, MAX_AUDIO_BYTES } from "./audio.js";
import { defaultModel } from "./gemini.js";
import {
  meetingInput,
  meetingId,
  reviewSchema,
  taskPatch,
  noteInput,
  hash,
  resolveDeadline,
} from "./schema.js";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const now = () => new Date().toISOString();
export function createApp({
  store,
  analyzer = analyze,
  transcriber = transcribe,
  storage = process.env.STORAGE_MODE || "local",
  provider = process.env.AI_PROVIDER || "sample",
  signupEnabled = process.env.PUBLIC_SIGNUP_ENABLED === "true",
  verifyToken = (token) => firebase().auth.verifyIdToken(token, true),
} = {}) {
  const app = express(),
    production =
      process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL),
    repo =
      store ||
      (storage === "firebase" ? new FirebaseStore() : new LocalStore());
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
      model:process.env.GEMINI_MODEL || defaultModel,
      maxAudioBytes:MAX_AUDIO_BYTES,
      aiReady:provider === "sample" || Boolean(process.env.GEMINI_API_KEY),
    }),
  );
  app.use("/api", async (req, res, next) => {
    try {
      if (production && storage !== "firebase")
        fail(
          503,
          "Production requires STORAGE_MODE=firebase. Local files are not durable on Vercel.",
        );
      if (storage === "local") {
        req.uid = "local-demo";
        return next();
      }
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) fail(401, "Please sign in to your ShiftScript workspace.");
      let decoded;
      try {
        decoded = await verifyToken(token);
      } catch {
        fail(401, "Your session could not be verified. Sign in again.");
      }
      const allowed = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
      if (!signupEnabled && production && !allowed.length)
        fail(503, "Configure ALLOWED_EMAILS before using the deployed app.");
      if (!signupEnabled && allowed.length && !allowed.includes(decoded.email?.toLowerCase()))
        fail(403, "This account does not have access to this workspace.");
      req.uid = decoded.uid;
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/workspace", async (req, res) => {
    const d = await repo.list(req.uid);
    res.json({
      workspace: d.workspace || null,
      meetings: d.meetings.sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
      tasks: d.tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  });
  const workspaceInput = z.object({
    name: z.string().trim().min(2).max(80),
    ownerName: z.string().trim().min(2).max(80),
  }).strict();
  app.post("/api/workspace", async (req, res) => {
    const input = workspaceInput.parse(req.body);
    const workspace = await repo.mutate(req.uid, (s) => {
      if (s.workspace) fail(409, "You already have a workspace. Open workspace settings to rename it.");
      s.workspace = { ...input, id: req.uid, ownerUid: req.uid, createdAt: now(), updatedAt: now() };
      return s.workspace;
    });
    res.status(201).json({ workspace });
  });
  app.patch("/api/workspace", async (req, res) => {
    const input = workspaceInput.parse(req.body);
    const workspace = await repo.mutate(req.uid, (s) => {
      if (!s.workspace) fail(404, "Create your workspace first.");
      Object.assign(s.workspace, input, { updatedAt: now() });
      return s.workspace;
    });
    res.json({ workspace });
  });
  async function claimQuota(uid) {
    await repo.mutate(uid,s=>{
      const date=now().slice(0,10), count=s.quota.date===date?s.quota.count:0;
      if(count>=Number(process.env.MAX_ANALYSES_PER_DAY || 20))fail(429,"Daily AI-request limit reached. Try again tomorrow (UTC).");
      s.quota={date,count:count+1};
    });
  }
  app.post("/api/transcribe",async(req,res)=>{
    const audio=validateAudio(req.body);
    if(provider!=="gemini")fail(422,"Voice transcription needs Gemini. Set AI_PROVIDER=gemini and add GEMINI_API_KEY.");
    await claimQuota(req.uid);
    const transcript=await transcriber(audio,provider);
    res.json({transcript,source:{kind:"audio",name:audio.name},provider});
  });
  app.post("/api/meetings", async (req, res) => {
    const input = meetingInput.parse(req.body),
      id = meetingId(input),
      existing = (await repo.list(req.uid)).meetings.find((m) => m.id === id);
    if (existing) return res.json({ meeting: existing, cached: true });
    if ((await repo.list(req.uid)).meetings.length >= 50) fail(409,"Prototype limit: 50 meetings per workspace.");
    await claimQuota(req.uid);
    const result = await analyzer(input, provider),
      createdAt = now();
    const meeting = {
      ...input,
      id,
      createdAt,
      provider,
      summary: result.summary,
      discussionPoints: result.discussionPoints,
      decisions: result.decisions,
      followUps: result.followUps,
      proposals: result.actions.map((a, i) => ({
        ...a,
        id: hash(id + ":" + i),
        owner: a.owner || "Unassigned",
        deadline: a.deadline || "Not specified",
        dueDate: resolveDeadline(a.deadline, input.date),
        reviewStatus: "pending",
        taskId: null,
      })),
    };
    const saved = await repo.mutate(req.uid, (s) => {
      const current = s.meetings.find((m) => m.id === id);
      if (current) return current;
      if (s.meetings.length >= 50)
        fail(409, "Workspace meeting limit reached.");
      s.meetings.push(meeting);
      return meeting;
    });
    res.status(201).json({ meeting: saved, cached: false });
  });
  app.post(
    "/api/meetings/:meetingId/proposals/:proposalId/review",
    async (req, res) => {
      const input = reviewSchema.parse(req.body);
      const result = await repo.mutate(req.uid, (s) => {
        const m = s.meetings.find((m) => m.id === req.params.meetingId);
        if (!m) fail(404, "Meeting not found.");
        const p = m.proposals.find((p) => p.id === req.params.proposalId);
        if (!p) fail(404, "Proposal not found.");
        if (p.reviewStatus !== "pending")
          return { meeting: m, alreadyReviewed: true };
        const { decision, ...fields } = input;
        if (decision === "approved") {
          if (s.tasks.length >= 250)
            fail(409, "Prototype limit: 250 tasks per workspace.");
          const id = hash(m.id + ":" + p.id);
          if (!s.tasks.some((t) => t.id === id))
            s.tasks.push({
              ...fields,
              owner: fields.owner || "Unassigned",
              deadline: fields.deadline || "Not specified",
              id,
              meetingId: m.id,
              meetingTitle: m.title,
              proposalId: p.id,
              evidence: p.evidence,
              status: "To Do",
              createdAt: now(),
              updatedAt: now(),
              notes: [],
            });
          p.taskId = id;
        }
        Object.assign(p, fields, {
          owner: fields.owner || "Unassigned",
          deadline: fields.deadline || "Not specified",
          reviewStatus: decision,
        });
        return { meeting: m, alreadyReviewed: false };
      });
      res.json(result);
    },
  );
  app.patch("/api/tasks/:id", async (req, res) => {
    const patch = taskPatch.parse(req.body);
    const task = await repo.mutate(req.uid, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) fail(404, "Task not found.");
      Object.assign(t, patch, {
        owner: patch.owner || "Unassigned",
        deadline: patch.deadline || "Not specified",
        updatedAt: now(),
      });
      return t;
    });
    res.json({ task });
  });
  app.post("/api/tasks/:id/notes", async (req, res) => {
    const note = noteInput.parse(req.body);
    const task = await repo.mutate(req.uid, (s) => {
      const t = s.tasks.find((t) => t.id === req.params.id);
      if (!t) fail(404, "Task not found.");
      if (t.notes.length >= 50)
        fail(409, "Maximum 50 progress updates per task.");
      t.notes.push({
        id: hash(now() + note.text),
        text: note.text,
        createdAt: now(),
      });
      t.updatedAt = now();
      return t;
    });
    res.status(201).json({ task });
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
