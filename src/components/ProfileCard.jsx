import { ListTodo, CheckCircle2 } from "./Icons.jsx";

export function EmailVerifiedBadge({ verified }) {
  return verified ? (
    <span
      className="email-verified-badge"
      role="img"
      aria-label="Email verified"
      title="Email verified"
    >
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 1.5 20 4l4.7.3 1.5 4.5L30 12l-1.2 4.5.2 4.8-4.2 2.2-2.7 4-4.6-.6-4.6 1.3-3.4-3.3-4.5-1.7-.4-4.7L2 14.3l2.6-4 1.1-4.6 4.7-1.2Z"
          fill="currentColor"
        />
        <path
          d="m10 15.7 4 4 8-8"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  ) : null;
}

export default function ProfileCard({
  name,
  avatar,
  bio,
  verified,
  active,
  completed,
  label,
  children,
  onTasks,
  tasksLabel = "View my tasks",
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <article className="panel profile-card profile-portrait-card">
      <div className={"profile-portrait " + (avatar ? "has-photo" : "")}>
        {avatar ? (
          <img src={avatar} alt={name + "'s profile photo"} />
        ) : (
          <>
            <img className="profile-clay-art" src="/art/profile.png" alt="" />
            <span className="profile-portrait-initials" aria-hidden="true">
              {initials}
            </span>
          </>
        )}
      </div>
      <div className="profile-content">
        <p className="eyebrow">{label}</p>
        <div className="profile-name-row">
          <h2>{name}</h2>
          <EmailVerifiedBadge verified={verified} />
        </div>
        <p className="profile-bio">
          {bio || "Making conversations count, one next step at a time."}
        </p>
        <div
          className="profile-card-stats"
          aria-label="Tasks in this workspace"
        >
          <div>
            <ListTodo size={20} />
            <strong>{active}</strong>
            <span>Active tasks</span>
          </div>
          <div>
            <CheckCircle2 size={20} />
            <strong>{completed}</strong>
            <span>Completed</span>
          </div>
        </div>
        {onTasks && (
          <button
            className="button primary profile-tasks-button"
            onClick={onTasks}
          >
            {tasksLabel}
          </button>
        )}
        {children}
      </div>
    </article>
  );
}
