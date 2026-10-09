import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { firebase } from "./firebase.js";
const empty = () => ({ meetings: [], tasks: [], quota: {}, workspace: null });
export class LocalStore {
  constructor(path = resolve(".data/workspace.json")) {
    this.path = path;
    this.queue = Promise.resolve();
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return empty();
      throw e;
    }
  }
  async mutate(uid, operation) {
    const run = this.queue.then(async () => {
      const s = await this.read(),
        result = operation(s);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(s, null, 2), {
        mode: 0o600,
      });
      await rename(this.path + ".tmp", this.path);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
  async list() {
    await this.queue;
    return this.read();
  }
}
export class FirebaseStore {
  constructor(services = firebase) { this.services = services; }
  refs(uid) {
    const root = this.services().db.collection("workspaces").doc(uid);
    return {
      root,
      meetings: root.collection("meetings"),
      tasks: root.collection("tasks"),
    };
  }
  async list(uid) {
    const r = this.refs(uid);
    const [root, m, t] = await Promise.all([r.root.get(), r.meetings.get(), r.tasks.get()]);
    return {
      meetings: m.docs.map((d) => d.data()),
      tasks: t.docs.map((d) => d.data()),
      workspace: root.data()?.workspace || null,
    };
  }
  async mutate(uid, operation) {
    const r = this.refs(uid);
    return this.services().db.runTransaction(async (tx) => {
      // Read all documents first. This is a small bounded prototype workspace.
      const [root, m, t] = await Promise.all([
        tx.get(r.root),
        tx.get(r.meetings),
        tx.get(r.tasks),
      ]);
      const s = {
          meetings: m.docs.map((d) => d.data()),
          tasks: t.docs.map((d) => d.data()),
          quota: root.data()?.quota || {},
          workspace: root.data()?.workspace || null,
        },
        before = structuredClone(s),
        result = operation(s);
      for (const name of ["meetings", "tasks"]) {
        const old = new Map(before[name].map((i) => [i.id, JSON.stringify(i)]));
        for (const i of s[name])
          if (old.get(i.id) !== JSON.stringify(i)) tx.set(r[name].doc(i.id), i);
      }
      if (JSON.stringify(before.quota) !== JSON.stringify(s.quota))
        tx.set(r.root, { quota: s.quota }, { merge: true });
      if (JSON.stringify(before.workspace) !== JSON.stringify(s.workspace))
        tx.set(r.root, { workspace: s.workspace }, { merge: true });
      return result;
    });
  }
}
