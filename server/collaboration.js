import { randomUUID } from "node:crypto";
export const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const now = () => new Date().toISOString();
export const id = (prefix) => prefix + randomUUID().replaceAll("-", "");
export function roleFor(workspace, actor, workspaceId) {
  if (!workspace) return workspaceId === actor.uid ? "owner" : null;
  if (workspace.ownerUid === actor.uid) return "owner";
  return workspace.members?.find((m) => m.uid === actor.uid)?.role || null;
}
export function authorize(s, actor, workspaceId, permission = "read") {
  const role = roleFor(s.workspace, actor, workspaceId);
  if (!role) fail(403, "You do not have access to this workspace.");
  if (permission === "owner" && role !== "owner")
    fail(
      403,
      "Only the workspace owner can manage the workspace and its members.",
    );
  if (permission === "write" && role === "viewer")
    fail(403, "This workspace is read-only for your account.");
  return role;
}
export function newWorkspace(workspaceId, input, actor) {
  const createdAt = now();
  return {
    ...input,
    id: workspaceId,
    ownerUid: actor.uid,
    ownerEmail: actor.email,
    createdAt,
    updatedAt: createdAt,
    members: [
      {
        uid: actor.uid,
        name: input.ownerName || actor.name,
        email: actor.email,
        role: "owner",
        joinedAt: createdAt,
      },
    ],
    invites: [],
    memberUids: [actor.uid],
    inviteEmails: [],
  };
}
export function checkProject(s, projectId) {
  if (projectId && !s.projects.some((p) => p.id === projectId))
    fail(400, "That project is not in this workspace. Choose another project.");
}
export function checkAssignee(s, ownerUid) {
  if (ownerUid && !s.workspace?.members.some((m) => m.uid === ownerUid))
    fail(400, "The selected assignee is no longer a workspace member.");
}
export function taskFields(input, s, previous) {
  checkProject(s, input.projectId);
  if (!previous || input.ownerUid !== previous.ownerUid)
    checkAssignee(s, input.ownerUid);
  const fields = {
    ...input,
    owner: input.owner || "Unassigned",
    deadline: input.deadline || "Not specified",
  };
  if (fields.ownerUid)
    fields.owner =
      s.workspace.members.find((m) => m.uid === fields.ownerUid)?.name ||
      previous?.owner ||
      fields.owner;
  delete fields.expectedUpdatedAt;
  delete fields.clientId;
  return fields;
}
