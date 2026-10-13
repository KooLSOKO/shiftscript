import assert from "node:assert/strict";

// Count document/query reads and emulate read-before-write and optimistic
// transaction conflicts. No Firebase project, credentials or quota is used.
export function countingFirestore(initial = []) {
  const docs = new Map(initial),
    versions = new Map(),
    reads = [],
    writes = [];
  let sequence = 0,
    beforeCommit = null;
  const version = (path) => versions.get(path) || 0;
  function put(path, value, merge = false) {
    docs.set(
      path,
      structuredClone(merge ? { ...docs.get(path), ...value } : value),
    );
    versions.set(path, ++sequence);
    versions.set(path.slice(0, path.lastIndexOf("/")), ++sequence);
  }
  function remove(path) {
    docs.delete(path);
    versions.set(path, ++sequence);
    versions.set(path.slice(0, path.lastIndexOf("/")), ++sequence);
  }
  const field = (value, key) =>
    key.split(".").reduce((current, part) => current?.[part], value);
  function doc(path) {
    return {
      path,
      kind: "document",
      id: path.split("/").at(-1),
      collection: (name) => query(path + "/" + name),
      get: async () => {
        reads.push({ kind: "document", path, count: 1 });
        const saved = structuredClone(docs.get(path));
        return {
          id: path.split("/").at(-1),
          data: () => structuredClone(saved),
        };
      },
    };
  }
  function query(path, filters = [], ordering = null, maximum = Infinity) {
    return {
      path,
      kind: "query",
      doc: (id) => doc(path + "/" + id),
      where: (key, operator, value) =>
        query(path, [...filters, [key, operator, value]], ordering, maximum),
      orderBy: (key, direction = "asc") =>
        query(path, filters, [key, direction], maximum),
      limit: (number) => query(path, filters, ordering, number),
      get: async () => {
        let entries = [...docs].filter(
          ([key, value]) =>
            key.startsWith(path + "/") &&
            !key.slice(path.length + 1).includes("/") &&
            filters.every(([key, operator, expected]) => {
              const actual = field(value, key);
              return operator === "array-contains"
                ? actual?.includes(expected)
                : operator === ">"
                  ? actual > expected
                  : actual === expected;
            }),
        );
        entries.sort(([a, av], [b, bv]) =>
          ordering
            ? String(field(av, ordering[0])).localeCompare(
                String(field(bv, ordering[0])),
              ) * (ordering[1] === "desc" ? -1 : 1) || a.localeCompare(b)
            : a.localeCompare(b),
        );
        entries = entries.slice(0, maximum);
        reads.push({ kind: "query", path, count: Math.max(entries.length, 1) });
        return {
          docs: entries.map(([path, saved]) => ({
            id: path.split("/").at(-1),
            data: () => structuredClone(saved),
          })),
        };
      },
    };
  }
  const db = {
    collection: (name) => query(name),
    async runTransaction(operation) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const staged = [],
          observed = new Map();
        const result = await operation({
          async get(ref) {
            assert.equal(
              staged.length,
              0,
              "Firestore transactions read before writing",
            );
            observed.set(ref.path, version(ref.path));
            return ref.get();
          },
          set(ref, value, options) {
            staged.push({
              path: ref.path,
              value: structuredClone(value),
              merge: options?.merge,
            });
          },
          delete(ref) {
            staged.push({ path: ref.path, remove: true });
          },
        });
        if (beforeCommit) {
          const hook = beforeCommit;
          beforeCommit = null;
          await hook();
        }
        if (
          [...observed].some(([path, recorded]) => recorded !== version(path))
        )
          continue;
        for (const item of staged) {
          writes.push(item);
          if (item.remove) remove(item.path);
          else put(item.path, item.value, item.merge);
        }
        return result;
      }
      throw Error("Transaction conflict");
    },
  };
  return {
    db,
    docs,
    reads,
    writes,
    put,
    reset() {
      reads.length = 0;
      writes.length = 0;
    },
    conflictOnce(hook) {
      beforeCommit = hook;
    },
    count() {
      return reads.reduce((sum, read) => sum + read.count, 0);
    },
  };
}
