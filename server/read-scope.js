import { AsyncLocalStorage } from "node:async_hooks";

// Only reuse reads within one HTTP request, never between users or requests.
const scope = new AsyncLocalStorage();
export const runReadScope = (operation) => scope.run(new Map(), operation);
export function collectionReads(store, id, revision, fresh = false) {
  const context = scope.getStore();
  if (!context || !revision) return new Map();
  let workspaces = context.get(store);
  if (!workspaces) context.set(store, (workspaces = new Map()));
  let entry = workspaces.get(id);
  if (fresh || !entry || entry.revision !== revision) {
    entry = { revision, reads: new Map() };
    workspaces.set(id, entry);
  }
  return entry.reads;
}
export function invalidateReads(store, id) {
  scope.getStore()?.get(store)?.delete(id);
}
