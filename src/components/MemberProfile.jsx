import { useEffect, useState } from "react";
import { api } from "../lib.js";
import Modal from "./Modal.jsx";
import ProfileCard from "./ProfileCard.jsx";

export default function MemberProfile({ uid, workspaceId, onClose }) {
  const [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError("");
    api(`/members/${encodeURIComponent(uid)}/profile`, {
      workspace: workspaceId,
    })
      .then((result) => {
        if (active) setProfile(result.profile);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [uid, workspaceId, attempt]);
  return (
    <Modal title="Workspace member profile" onClose={onClose}>
      <div className="member-profile-view">
        {error ? (
          <div role="alert">
            <p className="form-error">{error}</p>
            <button
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : !profile ? (
          <p role="status">Opening member profile…</p>
        ) : (
          <>
            <ProfileCard
              name={profile.name}
              avatar={profile.avatar}
              bio={profile.bio}
              verified={profile.emailVerified}
              active={profile.stats.active}
              completed={profile.stats.completed}
              label="WORKSPACE MEMBER"
            >
              <dl className="profile-details">
                <div>
                  <dt>Shared workspace</dt>
                  <dd>{profile.workspace.name}</dd>
                </div>
                <div>
                  <dt>Role here</dt>
                  <dd className="profile-role">{profile.role}</dd>
                </div>
                <div>
                  <dt>Email address</dt>
                  <dd>{profile.email || "Not available"}</dd>
                </div>
              </dl>
              <p className="hint">Task counts are for this shared workspace.</p>
              <button className="button primary" onClick={onClose}>
                Back to team
              </button>
            </ProfileCard>
          </>
        )}
      </div>
    </Modal>
  );
}
