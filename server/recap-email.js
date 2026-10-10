import nodemailer from "nodemailer";
import { createHash } from "node:crypto";
import { z } from "zod";
import { fail } from "./collaboration.js";
import { MAX_RECAP_RECIPIENTS } from "../shared/limits.js";
export const emailInput = z
  .object({
    recipients: z.array(z.email().max(254)).min(1).max(MAX_RECAP_RECIPIENTS),
    requestId: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const escapeEmail = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function recap(s, meetingId) {
  const m = s.meetings.find((v) => v.id === meetingId);
  if (!m) fail(404, "Meeting not found.");
  const tasks = s.tasks.filter(
    (t) =>
      t.meetingId === m.id &&
      m.proposals.some(
        (p) => p.taskId === t.id && p.reviewStatus === "approved",
      ),
  );
  const pending = m.proposals.filter(
    (p) => p.reviewStatus === "pending",
  ).length;
  const section = (title, items) =>
    "\n" +
    title +
    "\n" +
    (items.length ? items.map((v) => "• " + v).join("\n") : "None recorded.");
  const text =
    `Earny | ShiftScript\n${m.title}\n${m.date} · ${m.type}\n\nMeeting summary\n${m.summary}` +
    section("Decisions", m.decisions) +
    section(
      "Approved tasks",
      tasks.map(
        (t) =>
          `${t.title}\n  Owner: ${t.owner || "Unassigned"} · Due: ${t.dueDate || t.deadline || "Not specified"} · Priority: ${t.priority} · Status: ${t.status}\n  ${t.description || ""}`,
      ),
    ) +
    section("Follow-ups (not approved tasks)", m.followUps) +
    `\n\nSource: ${m.source?.kind?.startsWith("google-") ? m.source.name : "Meeting transcript"}` +
    (m.source?.url ? "\n" + m.source.url : "") +
    `\n\n${pending} pending proposal(s) excluded.\nSent from Earny using ShiftScript.`;
  const fingerprint = createHash("sha256").update(text).digest("hex");
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#182b52"><h1 style="font-size:22px;color:#2458e8">Earny · ShiftScript</h1><div style="white-space:pre-wrap;line-height:1.7">${escapeEmail(text)}</div></div>`;
  return {
    text,
    html,
    fingerprint,
    approvedCount: tasks.length,
    pendingCount: pending,
    subject: ("Meeting recap: " + m.title).replace(/[\r\n]/g, " "),
  };
}
export class RecapMailer {
  constructor({ env = process.env, transport } = {}) {
    this.env = env;
    this.transport = transport;
  }
  get ready() {
    const e = this.env;
    return Boolean(
      /^[a-z0-9.-]+$/i.test(e.SMTP_HOST || "") &&
      ["465", "587"].includes(e.SMTP_PORT) &&
      z.email().safeParse(e.SMTP_USER).success &&
      e.SMTP_PASSWORD &&
      z.email().safeParse(e.SMTP_FROM || e.SMTP_USER).success,
    );
  }
  async send(recipients, message) {
    if (!this.ready)
      fail(
        503,
        "Earny email is not configured yet. Contact your administrator.",
      );
    const e = this.env;
    const transport =
      this.transport ||
      nodemailer.createTransport({
        host: e.SMTP_HOST,
        port: Number(e.SMTP_PORT),
        secure: e.SMTP_PORT === "465",
        requireTLS: e.SMTP_PORT === "587",
        auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
        tls: { minVersion: "TLSv1.2" },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 15000,
      });
    // Bcc keeps recipient addresses private from each other. Sender must be a Zoho mailbox or authorised alias.
    const result = await transport.sendMail({
      from: {
        name: "Earny · ShiftScript",
        address: e.SMTP_FROM || e.SMTP_USER,
      },
      to: e.SMTP_FROM || e.SMTP_USER,
      bcc: recipients,
      subject: message.subject,
      text: message.text,
      html: message.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    const accepted = recipients.filter((v) =>
      (result.accepted || []).some((a) => String(a).toLowerCase() === v),
    );
    return {
      accepted,
      rejected: recipients.filter((v) => !accepted.includes(v)),
    };
  }
}
