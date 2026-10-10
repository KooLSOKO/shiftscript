import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { firebase } from "./firebase.js";
import { fail } from "./collaboration.js";

// Separate from workspace data. No token or preview is exposed in workspace APIs.
export class IntegrationVault {
  constructor({
    storage = "local",
    secret = process.env.INTEGRATION_ENCRYPTION_KEY,
    path = resolve(".data/integrations.json"),
    services = firebase,
  } = {}) {
    this.storage = storage;
    this.path = path;
    this.services = services;
    this.key = /^[a-f0-9]{64}$/i.test(secret || "")
      ? Buffer.from(secret, "hex")
      : null;
    this.queue = Promise.resolve();
  }
  seal(value) {
    if (!this.key)
      fail(
        503,
        "Google connection needs an integration encryption key. Contact your administrator.",
      );
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
  }
  open(value) {
    if (!this.key) fail(503, "Integration encryption is not configured.");
    const b = Buffer.from(value, "base64url"),
      cipher = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    cipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString(
        "utf8",
      ),
    );
  }
  async database() {
    try {
      return JSON.parse(await readFile(this.path, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  }
  async get(uid) {
    if (this.storage === "firebase") {
      const d = await this.services()
        .db.collection("privateIntegrations")
        .doc(uid)
        .get();
      return d.exists ? this.open(d.data().payload) : {};
    }
    await this.queue;
    const db = await this.database();
    return db[uid] ? this.open(db[uid]) : {};
  }
  async mutate(uid, operation) {
    if (this.storage === "firebase") {
      const db = this.services().db,
        ref = db.collection("privateIntegrations").doc(uid);
      return db.runTransaction(async (tx) => {
        const d = await tx.get(ref),
          value = d.exists ? this.open(d.data().payload) : {};
        const result = operation(value);
        tx.set(ref, { payload: this.seal(value) });
        return result;
      });
    }
    const run = this.queue.then(async () => {
      const db = await this.database(),
        value = db[uid] ? this.open(db[uid]) : {};
      const result = operation(value);
      db[uid] = this.seal(value);
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + ".tmp", JSON.stringify(db), { mode: 0o600 });
      await rename(this.path + ".tmp", this.path);
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
