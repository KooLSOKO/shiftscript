import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { firebase } from "./firebase.js";
import { invitationExpired } from "./invitation-email.js";
export const collections = ["meetings", "tasks", "projects", "drafts"];
export function hydrate(record = {}, id) {
  const s = { ...record, quota: record.quota || {} };
  for (const key of collections) s[key] = record[key] || [];
  s.workspace = record.workspace || null;
  if (s.workspace) {
    const w = { ...s.workspace, id, ownerUid: s.workspace.ownerUid || id };
    w.members = w.members || [
      {
        uid: w.ownerUid,
        name: w.ownerName || "Workspace owner",
        email: w.ownerEmail || "",
        role: "owner",
        joinedAt: w.createdAt || null,
      },
    ];
    w.invites = w.invites || [];
    w.memberUids = w.members.map((m) => m.uid);
    w.inviteEmails = w.invites.map((i) => i.email);
    s.workspace = w;
  }
  return s;
}
export function catalogFrom(records, actor) {
  const workspaces = [],
    invitations = [];
  for (const [id, raw] of records) {
    const w = hydrate(raw, id).workspace;
    if (!w) continue;
    const member = w.members.find((m) => m.uid === actor.uid);
    if (member || w.ownerUid === actor.uid)
      workspaces.push({
        id,
        name: w.name,
        role: w.ownerUid === actor.uid ? "owner" : member.role,
        ownerName: w.ownerName,
      });
    if (actor.emailVerified)
      for (const i of w.invites.filter(
        (i) => i.email === actor.email && !invitationExpired(i),
      ))
        invitations.push({ ...i, workspaceId: id, workspaceName: w.name });
  }
  return { workspaces, invitations };
}
export class LocalStore {
  constructor(path = resolve(".data/workspace.json")) {
    this.path = path;
    this.queue = Promise.resolve();
  }
  async readDatabase() {
    try {
      const data = JSON.parse(await readFile(this.path, "utf8"));
      return data.schemaVersion === 2
        ? data
        : { schemaVersion: 2, workspaces: { "local-demo": data } };
    } catch (e) {
      if (e.code === "ENOENT") return { schemaVersion: 2, workspaces: {} };
      throw e;
    }
  }
  async mutate(id, operation) {
    const run = this.queue.then(async () => {
      const db = await this.readDatabase(),
        s = hydrate(db.workspaces[id], id),
        result = operation(s);
      db.workspaces[id] = s;
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(db, null, 2), {
        mode: 0o600,
      });
      await rename(this.path + ".tmp", this.path);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async list(id = "local-demo") {
    await this.queue;
    return hydrate((await this.readDatabase()).workspaces[id], id);
  }
  async catalog(actor) {
    await this.queue;
    return catalogFrom(
      Object.entries((await this.readDatabase()).workspaces),
      actor,
    );
  }
}
export class FirebaseStore {
  constructor(services = firebase) {
    this.services = services;
  }
  refs(id) {
    const root = this.services().db.collection("workspaces").doc(id);
    return {
      root,
      ...Object.fromEntries(
        collections.map((name) => [name, root.collection(name)]),
      ),
    };
  }
  async list(id) {
    const r = this.refs(id),
      [root, ...snapshots] = await Promise.all([
        r.root.get(),
        ...collections.map((name) => r[name].get()),
      ]);
    return hydrate(
      {
        workspace: root.data()?.workspace,
        quota: root.data()?.quota,
        ...Object.fromEntries(
          collections.map((name, i) => [
            name,
            snapshots[i].docs.map((d) => d.data()),
          ]),
        ),
      },
      id,
    );
  }
  async catalog(actor) {
    const db = this.services().db,
      personal = await db.collection("workspaces").doc(actor.uid).get();
    // Lazily add membership metadata to the existing UID path; never move documents.
    if (personal.data()?.workspace && !personal.data().workspace.memberUids) {
      await this.mutate(actor.uid, (s) => {
        const owner = s.workspace.members.find((m) => m.uid === actor.uid);
        if (owner) {
          owner.email = actor.email;
          owner.name = actor.name || owner.name;
        }
      });
    }
    const [joined, invited] = await Promise.all([
      db
        .collection("workspaces")
        .where("workspace.memberUids", "array-contains", actor.uid)
        .limit(30)
        .get(),
      actor.emailVerified
        ? db
            .collection("workspaces")
            .where("workspace.inviteEmails", "array-contains", actor.email)
            .limit(30)
            .get()
        : Promise.resolve({ docs: [] }),
    ]);
    const records = new Map(
      [...joined.docs, ...invited.docs].map((d) => [d.id, d.data()]),
    );
    return catalogFrom(records, actor);
  }
  async mutate(id, operation) {
    const r = this.refs(id);
    return this.services().db.runTransaction(async (tx) => {
      const [root, ...snapshots] = await Promise.all([
        tx.get(r.root),
        ...collections.map((name) => tx.get(r[name])),
      ]);
      const rawWorkspace = root.data()?.workspace || null;
      const s = hydrate(
        {
          workspace: rawWorkspace,
          quota: root.data()?.quota,
          ...Object.fromEntries(
            collections.map((name, i) => [
              name,
              snapshots[i].docs.map((d) => d.data()),
            ]),
          ),
        },
        id,
      );
      const before = structuredClone(s),
        result = operation(s);
      if (s.workspace) {
        s.workspace = hydrate(s, id).workspace;
        s.workspace.memberUids = s.workspace.members.map((m) => m.uid);
        s.workspace.inviteEmails = s.workspace.invites.map((i) => i.email);
      }
      for (const name of collections) {
        const old = new Map(before[name].map((i) => [i.id, JSON.stringify(i)])),
          ids = new Set(s[name].map((i) => i.id));
        for (const i of s[name])
          if (old.get(i.id) !== JSON.stringify(i)) tx.set(r[name].doc(i.id), i);
        for (const i of before[name])
          if (!ids.has(i.id)) tx.delete(r[name].doc(i.id));
      }
      const patch = {};
      if (JSON.stringify(before.quota) !== JSON.stringify(s.quota))
        patch.quota = s.quota;
      if (JSON.stringify(rawWorkspace) !== JSON.stringify(s.workspace))
        patch.workspace = s.workspace;
      if (Object.keys(patch).length) tx.set(r.root, patch, { merge: true });
      return result;
    });
  }
}
