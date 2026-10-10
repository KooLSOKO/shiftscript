import { MAX_RECAP_RECIPIENTS } from "./limits.js";
// Mirrors the server's Zod email format without shipping its full validator to phones.
const email =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
export function parseRecipients(text) {
  const recipients = [
    ...new Set(
      text
        .split(/[,;\n]/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const invalid = recipients.filter(
    (value) => value.length > 254 || !email.test(value),
  );
  return {
    recipients,
    error: invalid.length
      ? "Check these email addresses: " + invalid.join(", ")
      : recipients.length > MAX_RECAP_RECIPIENTS
        ? `Use up to ${MAX_RECAP_RECIPIENTS} different email addresses per send.`
        : "",
  };
}
