import test from "node:test";
import assert from "node:assert/strict";
import { MemoryProfiles } from "../server/productivity.js";
import { FirebaseStore } from "../server/store.js";

test("Memory chat transactions serialize profile reservations with private per-user chats and roll back failures", async () => {
  const store = new MemoryProfiles();
  await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      store.mutateAssistantChat("soko", "chat" + i, (p, c) => {
        p.count = (p.count || 0) + 1;
        c.title = "Private " + i;
        c.messages = [{ text: "saved" }];
      }),
    ),
  );
  assert.equal((await store.getProfile("soko")).count, 4);
  assert.equal(await store.getAssistantChat("other", "chat0"), null);
  await assert.rejects(
    store.mutateAssistantChat("soko", "chat0", (p, c) => {
      p.count = 90;
      c.title = "lost";
      throw Error("Rollback");
    }),
  );
  assert.equal((await store.getProfile("soko")).count, 4);
  assert.equal(
    (await store.getAssistantChat("soko", "chat0")).title,
    "Private 0",
  );
});

test("Firestore chat messages stay in private subcollections with atomic profile/catalog writes and all reads before writes", async () => {
  const data = new Map(),
    writes = [];
  const ref = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => ref(path + "/" + name + "/" + id) }),
    get: async () => ({ data: () => structuredClone(data.get(path)) }),
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name + "/" + id) }),
    runTransaction: async (fn) => {
      const staged = [];
      let written = false;
      const result = await fn({
        get: async (r) => {
          assert.equal(written, false);
          return { data: () => structuredClone(data.get(r.path)) };
        },
        set: (r, value) => {
          written = true;
          staged.push([r.path, structuredClone(value)]);
        },
      });
      staged.forEach(([path, value]) => {
        writes.push(path);
        data.set(path, value);
      });
      return result;
    },
  };
  const store = new FirebaseStore(() => ({ db }));
  await store.mutateAssistantChat("soko", "chat1", (p, c) => {
    p.assistantChatIndex = [{ id: "chat1", title: "Plan" }];
    c.messages = [{ text: "Private discussion" }];
  });
  assert.deepEqual(writes, [
    "privateProfiles/soko",
    "privateProfiles/soko/assistantChats/chat1",
  ]);
  assert.equal(data.get("privateProfiles/soko").messages, undefined);
  assert.equal(
    (await store.getAssistantChat("soko", "chat1")).messages[0].text,
    "Private discussion",
  );
  assert.equal(await store.getAssistantChat("kopano", "chat1"), null);
  await assert.rejects(
    store.mutateAssistantChat("soko", "chat1", (p, c) => {
      c.messages = [];
      p.assistantChatIndex = [];
      throw Error("Conflict");
    }),
  );
  assert.equal(
    (await store.getAssistantChat("soko", "chat1")).messages.length,
    1,
  );
  assert.equal((await store.getProfile("soko")).assistantChatIndex.length, 1);
});
