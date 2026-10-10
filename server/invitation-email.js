import { fail } from "./collaboration.js";
import { escapeEmail } from "./recap-email.js";

export const INVITATION_DAYS = 7;
export const invitationExpired = (invite, at = Date.now()) =>
  Boolean(invite.expiresAt && Date.parse(invite.expiresAt) <= at);

export function invitationOrigin(value) {
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function invitationMessage(workspace, invite, origin, inviter) {
  if (!origin)
    fail(
      503,
      "Set APP_URL to your ShiftScript website before sending invitation emails.",
    );
  const url = new URL("/", origin);
  url.searchParams.set("workspaceInvite", workspace.id);
  url.searchParams.set("invite", invite.id);
  const subject = `Join ${workspace.name} on ShiftScript`.replace(
    /[\r\n]/g,
    " ",
  );
  const access =
    invite.role === "viewer"
      ? "Viewer — read meetings and export reports"
      : "Member — create meetings and update tasks";
  const expiry = invite.expiresAt
    ? `This invitation expires on ${new Date(invite.expiresAt).toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" })}.`
    : "The workspace owner can revoke this invitation.";
  const text = `Earny | ShiftScript\n\n${inviter} invited you to ${workspace.name}.\n\nAccess: ${access}\n\nOpen your invitation:\n${url.href}\n\nSign up or sign in using ${invite.email}. Verify that email address, then select Join workspace.\n${expiry}\n\nThis link only works for the invited, verified email address.\nSent from Earny using ShiftScript.`;
  const e = escapeEmail;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#182b52;line-height:1.7"><p style="color:#2458e8;font-weight:bold">Earny · ShiftScript</p><h1 style="font-size:24px">You’re invited to ${e(workspace.name)}</h1><p>${e(inviter)} invited you to collaborate.</p><p><strong>Access:</strong> ${e(access)}</p><p style="margin:28px 0"><a href="${e(url.href)}" style="background:#2458e8;color:white;text-decoration:none;padding:14px 22px;border-radius:8px;display:inline-block">Open invitation</a></p><p>Sign up or sign in using <strong>${e(invite.email)}</strong>. Verify that email address, then select <strong>Join workspace</strong>.</p><p>${e(expiry)}</p><p style="font-size:12px;color:#657492">Only the invited, verified email address can join. If the button does not work, copy this link:<br>${e(url.href)}</p></div>`;
  return { subject, text, html };
}
