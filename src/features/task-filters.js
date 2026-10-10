import { isAssignedTo } from "../../shared/identity.js";
import { waitingOn } from "../../shared/productivity.js";
export { isAssignedTo } from "../../shared/identity.js";
export const defaultFilters = {
  search: "",
  dependency: "All",
  status: "All",
  priority: "All",
  owner: "All",
  project: "All",
  due: "All",
  from: "",
  to: "",
  source: "All",
  sort: "newest",
};
export function filterTasks(tasks, f, actor, date) {
  const end = new Date(date + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 7);
  const nextWeek = end.toISOString().slice(0, 10);
  return tasks
    .filter((t) => {
      const search =
        `${t.title} ${t.description} ${t.owner} ${t.meetingTitle}`.toLowerCase();
      if (f.search && !search.includes(f.search.trim().toLowerCase()))
        return false;
      if (f.status === "Active" && t.status === "Completed") return false;
      if (f.status !== "All" && f.status !== "Active" && t.status !== f.status)
        return false;
      if (f.dependency === "waiting" && !waitingOn(t, tasks).length)
        return false;
      if (f.dependency === "ready" && waitingOn(t, tasks).length) return false;
      if (f.priority !== "All" && t.priority !== f.priority) return false;
      if (f.owner === "Me" && !isAssignedTo(t, actor)) return false;
      if (f.owner !== "All" && f.owner !== "Me" && t.owner !== f.owner)
        return false;
      if (
        f.project !== "All" &&
        (f.project === "None"
          ? Boolean(t.projectId)
          : t.projectId !== f.project)
      )
        return false;
      if (
        f.source !== "All" &&
        (t.meetingId ? "meeting" : "manual") !== f.source
      )
        return false;
      if (
        f.due === "Overdue" &&
        (!t.dueDate || t.dueDate >= date || t.status === "Completed")
      )
        return false;
      if (f.due === "Today" && t.dueDate !== date) return false;
      if (
        f.due === "Next 7 days" &&
        (!t.dueDate ||
          t.dueDate < date ||
          t.dueDate > nextWeek ||
          t.status === "Completed")
      )
        return false;
      if (f.due === "No deadline" && t.dueDate) return false;
      if (
        f.due === "Custom range" &&
        (!t.dueDate ||
          (f.from && t.dueDate < f.from) ||
          (f.to && t.dueDate > f.to))
      )
        return false;
      return true;
    })
    .sort((a, b) => {
      if (f.sort === "due")
        return (a.dueDate || "9999-99-99").localeCompare(
          b.dueDate || "9999-99-99",
        );
      if (f.sort === "priority")
        return (
          { High: 0, Med: 1, Low: 2 }[a.priority] -
          { High: 0, Med: 1, Low: 2 }[b.priority]
        );
      if (f.sort === "title") return a.title.localeCompare(b.title);
      return b.createdAt.localeCompare(a.createdAt);
    });
}
