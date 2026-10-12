import { z } from "zod";
import { authorize, fail } from "./collaboration.js";
import { isAssignedTo } from "../shared/identity.js";

const uid = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export function installMemberProfileRoutes(
  app,
  { read, profiles, lookupIdentity },
) {
  app.get("/api/members/:uid/profile", async (req, res) => {
    const targetUid = uid.parse(req.params.uid);
    const initial = await read(req.workspaceId);
    authorize(initial, req.actor, req.workspaceId);
    if (!initial.workspace?.members.some((member) => member.uid === targetUid))
      fail(404, "This person is not a member of this workspace.");
    const profile = await profiles.getProfile(targetUid);
    let identity = targetUid === req.uid ? req.actor : null;
    if (targetUid !== req.uid) {
      try {
        identity = await lookupIdentity(targetUid);
      } catch {
        /* No badge without confirmation. */
      }
    }
    // Check both memberships again after the asynchronous identity lookup.
    const current = await read(req.workspaceId);
    authorize(current, req.actor, req.workspaceId);
    const member = current.workspace?.members.find(
      (item) => item.uid === targetUid,
    );
    if (!member) fail(404, "This person is no longer in this workspace.");
    const name =
      profile.name || identity?.name || identity?.displayName || member.name;
    const actor = {
      uid: targetUid,
      name,
      email: member.email,
      aliases: profile.aliases || member.aliases || [],
    };
    const tasks = current.tasks.filter((task) => isAssignedTo(task, actor));
    const photo = identity?.photoURL;
    const avatar =
      profile.avatar ||
      (typeof photo === "string" && /^https:\/\//.test(photo) ? photo : "");
    res.json({
      profile: {
        uid: targetUid,
        name,
        bio: profile.bio || "",
        avatar,
        email: member.email || "",
        role: member.role,
        joinedAt: member.joinedAt || null,
        workspace: { id: current.workspace.id, name: current.workspace.name },
        emailVerified: Boolean(
          targetUid !== "local-demo" &&
          identity?.emailVerified &&
          identity?.email?.toLowerCase() === member.email?.toLowerCase(),
        ),
        verificationAvailable: Boolean(identity),
        stats: {
          active: tasks.filter((task) => task.status !== "Completed").length,
          completed: tasks.filter((task) => task.status === "Completed").length,
        },
      },
    });
  });
}
