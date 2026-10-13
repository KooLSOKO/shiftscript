// A route may still opt into the complete snapshot when its invariants need it.
// Scope by the matched Express route, not by an untrusted URL substring.
export function mutationReadPlan(req) {
  const route = req.route?.path;
  const method = req.method;
  let collections;
  if (
    route === "/api/tasks" ||
    (route === "/api/tasks/:id" && method === "PATCH")
  )
    collections = ["tasks", "projects", "meetings"];
  else if (["/api/tasks/:id/move", "/api/tasks/schedules"].includes(route))
    collections = ["tasks", "meetings"];
  else if (route === "/api/tasks/bulk")
    collections = ["tasks", "projects", "meetings"];
  else if (route === "/api/tasks/:id" && method === "DELETE")
    collections = ["tasks", "meetings"];
  else if (route === "/api/tasks/:id/notes")
    collections = ["tasks", "meetings"];
  else if (["/api/projects", "/api/projects/:id"].includes(route))
    collections = ["projects"];
  else if (route === "/api/drafts/current")
    collections = method === "DELETE" ? ["drafts"] : ["drafts", "projects"];
  else if (route === "/api/notes")
    collections = ["notes", "projects", "meetings"];
  else if (route === "/api/notes/:id")
    collections =
      method === "DELETE" ? ["notes"] : ["notes", "projects", "meetings"];
  else if (route === "/api/agendas")
    collections = ["agendas", "projects", "meetings"];
  else if (
    route === "/api/workspace" ||
    route === "/api/members/invitations" ||
    route === "/api/members/invitations/:inviteId" ||
    route === "/api/members/invitations/:inviteId/email"
  )
    collections = [];
  else if (route === "/api/members/:uid")
    collections = method === "DELETE" ? ["drafts"] : [];
  else if (
    [
      "/api/meetings/:meetingId/proposals/:proposalId/review",
      "/api/meetings/:meetingId/reviews",
      "/api/meetings/:id/project",
    ].includes(route)
  )
    collections = ["meetings", "tasks", "projects"];
  else if (
    ["/api/meetings", "/api/google/import", "/api/notes/:id/process"].includes(
      route,
    )
  )
    collections = ["meetings", "projects", "notes", "agendas"];
  else if (route === "/api/assistant/actions/:id/approve")
    collections = ["tasks", "meetings"];
  else if (route === "/api/meetings/:id/email")
    collections = ["meetings", "tasks"];
  else if (route === "/api/undo/:token")
    return {
      collections: ["tasks", "meetings", "projects", "activity", "undoRecords"],
      appendOnly: ["activity"],
    };
  // Complex deletion and unknown operations keep their complete transactional
  // snapshot. This preserves unlinking, dependencies and future route behavior.
  if (!collections) return {};
  return {
    collections: [...collections, "activity", "undoRecords"],
    appendOnly: ["activity", "undoRecords"],
  };
}
