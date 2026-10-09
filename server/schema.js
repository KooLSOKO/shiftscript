import { z } from "zod";
import { createHash } from "node:crypto";
export const statuses = [
  "To Do",
  "In Progress",
  "Blocked",
  "In Review",
  "Completed",
];
export const priorities = ["Low", "Med", "High"];
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid calendar date");
export const meetingInput = z
  .object({
    title: z.string().trim().min(3).max(120),
    date,
    type: z.enum([
      "Project review",
      "Planning",
      "Client meeting",
      "Development",
      "Internal",
      "Other",
    ]),
    transcript: z.string().trim().min(40).max(15000),
    source:z.object({kind:z.enum(["audio","text"]),name:z.string().max(160)}).strict().optional(),
  })
  .strict();
export const actionSchema = z
  .object({
    title: z.string().min(3).max(160),
    description: z.string().max(1500),
    owner: z.string().max(100).nullable(),
    deadline: z.string().max(150).nullable(),
    priority: z.enum(priorities),
    evidence: z.string().min(10).max(1500),
  })
  .strict();
export const analysisSchema = z
  .object({
    summary: z.string().min(10).max(3000),
    discussionPoints: z.array(z.string().max(700)).max(15),
    decisions: z.array(z.string().max(700)).max(15),
    followUps: z.array(z.string().max(700)).max(15),
    actions: z.array(actionSchema).max(20),
  })
  .strict();
export const reviewSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    title: z.string().trim().min(3).max(160),
    description: z.string().max(1500),
    owner: z.string().trim().max(100),
    deadline: z.string().max(150),
    dueDate: date.nullable(),
    priority: z.enum(priorities),
  })
  .strict();
export const taskPatch = reviewSchema
  .omit({ decision: true })
  .extend({ status: z.enum(statuses) })
  .strict();
export const noteInput = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();
export const hash = (v) =>
  createHash("sha256").update(v).digest("hex").slice(0, 28);
export const normalize = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
export const meetingId = (i) =>
  hash(
    JSON.stringify([
      normalize(i.title),
      i.date,
      i.type,
      normalize(i.transcript),
    ]),
  );
export function resolveDeadline(wording, meetingDate) {
  if (!wording) return null;
  const exact = wording.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (exact && date.safeParse(exact[0]).success) return exact[0];
  if (/^(?:by\s+)?today$/i.test(wording.trim())) return meetingDate;
  if (/^(?:by\s+)?tomorrow$/i.test(wording.trim())) {
    const d = new Date(meetingDate + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return null; // Ambiguous weekdays, partial dates and next week stay for human review.
}
export function groundAnalysis(raw, input) {
  const result = analysisSchema.parse(raw),
    transcript = normalize(input.transcript),
    seen = new Set();
  result.actions = result.actions.filter((a) => {
    if (!transcript.includes(normalize(a.evidence)))
      throw Object.assign(
        new Error(
          "Analysis contained an excerpt that could not be verified. Please try again.",
        ),
        { status: 502 },
      );
    if (a.owner && !transcript.includes(normalize(a.owner))) a.owner = null;
    if (a.deadline && !normalize(a.evidence).includes(normalize(a.deadline)))
      a.deadline = null;
    const key = hash(normalize(a.title) + normalize(a.evidence));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return result;
}
