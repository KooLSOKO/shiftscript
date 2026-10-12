import { CheckCircle2, Building, LogOut } from "./Icons.jsx";
import ProfileCard from "./ProfileCard.jsx";
import ProfileSettings from "./ProfileSettings.jsx";
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
  onTutorial,
  personal,
  remindersReady,
  onProfileSaved,
}) {
  const name = actor.name || user?.displayName || "Workspace member";
  const email = user?.email || actor.email;
  const assigned = tasks.filter((task) => isAssignedTo(task, actor));
  const active = assigned.filter((task) => task.status !== "Completed");
  return (
    <section className="profile-layout" aria-label="Personal profile">
      <ProfileCard
        name={name}
        avatar={personal?.avatar || user?.photoURL || ""}
        bio={personal?.bio}
        verified={Boolean(user && personal?.emailVerified)}
        active={active.length}
        completed={assigned.length - active.length}
        label="YOUR ACCOUNT"
        onTasks={onMyWork}
      >
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
              ) : personal?.emailVerified ? (
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
      </ProfileCard>
      <div className="profile-side">
        <ProfileSettings
          key={actor.uid}
          personal={personal}
          actor={actor}
          user={user}
          remindersReady={remindersReady}
          onSaved={onProfileSaved}
        />
        <section className="panel profile-section">
          <h2>Make yourself at home</h2>
          <p className="muted">
            Replay the walkthrough and practice board controls.
            <span className="desktop-keyboard-controls">
              {" "}
              Learn the Mac and Windows shortcuts.
            </span>
          </p>
          <button className="button" onClick={onTutorial}>
            Replay workspace tutorial
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
            Switch or join a workspace
          </button>
        </section>
      </div>
    </section>
  );
}
