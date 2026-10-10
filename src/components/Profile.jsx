import {
  CheckCircle2,
  Building,
  ListTodo,
  ArrowRight,
  LogOut,
} from "./Icons.jsx";
import { isAssignedTo } from "../features/task-filters.js";

export default function Profile({
  user,
  actor,
  catalog,
  workspace,
  role,
  tasks,
  onWorkspaces,
  onMyWork,
  onSignOut,
}) {
  const name = user?.displayName || actor.name || "Workspace member";
  const email = user?.email || actor.email;
  const assigned = tasks.filter((task) => isAssignedTo(task, actor));
  const active = assigned.filter((task) => task.status !== "Completed");
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <section className="profile-layout" aria-label="Personal profile">
      <article className="panel profile-card">
        <div className="profile-cover">
          <img src="/art/profile.webp" alt="" width="800" height="400" />
        </div>
        <div className="profile-content">
          <span className="avatar profile-avatar" aria-hidden="true">
            {initials}
          </span>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h2>{name}</h2>
          <dl className="profile-details">
            <div>
              <dt>Email address</dt>
              <dd>{user ? email || "Not available" : "Local demo account"}</dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>
                {!user ? (
                  "Demo mode"
                ) : user.emailVerified ? (
                  <>
                    <CheckCircle2 size={16} /> Verified
                  </>
                ) : (
                  "Not verified"
                )}
              </dd>
            </div>
            <div>
              <dt>Current workspace</dt>
              <dd>{workspace?.name || "Your workspace"}</dd>
            </div>
            <div>
              <dt>Your role here</dt>
              <dd className="profile-role">{role}</dd>
            </div>
          </dl>
          {user && (
            <button className="button" onClick={onSignOut}>
              <LogOut size={17} />
              Sign out
            </button>
          )}
        </div>
      </article>
      <div className="profile-side">
        <section className="panel profile-section">
          <h2>
            <ListTodo size={20} /> Your work
          </h2>
          <p className="muted">
            Tasks linked to your account or matching your name in this
            workspace.
          </p>
          <div className="profile-work">
            <div>
              <strong>{active.length}</strong>
              <span>Active tasks</span>
            </div>
            <div>
              <strong>{assigned.length - active.length}</strong>
              <span>Completed</span>
            </div>
          </div>
          <button className="button primary" onClick={onMyWork}>
            View my tasks <ArrowRight size={17} />
          </button>
        </section>
        <section className="panel profile-section">
          <h2>
            <Building size={20} /> Your workspaces
          </h2>
          <ul className="profile-workspaces">
            {catalog.workspaces.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.name}</strong>
                  <small className="profile-role">
                    {item.role}
                    {item.id === workspace?.id ? " · Current workspace" : ""}
                  </small>
                </span>
                <Building size={20} />
              </li>
            ))}
          </ul>
          <button className="button" onClick={onWorkspaces}>
            Switch or join a workspace <ArrowRight size={17} />
          </button>
        </section>
      </div>
    </section>
  );
}
