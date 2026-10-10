export const normalizeName = (value) =>
  typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    : "";
export function nameAliases(person) {
  const name = normalizeName(person?.name);
  const values = (person?.aliases || []).map(normalizeName).filter(Boolean);
  if (name && !name.includes("@")) {
    const parts = name.split(" ");
    values.push(name, parts[0], parts.at(-1), `${parts[0]} ${parts.at(-1)}`);
  }
  return new Set(values);
}
export function isAssignedTo(task, actor) {
  if (!actor?.uid) return false;
  return task.ownerUid
    ? task.ownerUid === actor.uid
    : nameAliases(actor).has(normalizeName(task.owner));
}
export function ownerCandidates(owner, members = []) {
  const name = normalizeName(owner);
  return name ? members.filter((member) => nameAliases(member).has(name)) : [];
}
