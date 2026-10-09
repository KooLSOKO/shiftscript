import { useState } from "react";
import { api, auth, sendEmailVerification } from "../lib.js";
import {
  Users,
  Building,
  Plus,
  Shield,
  Copy,
  Mail,
  Trash,
  Check,
} from "./Icons.jsx";
import Modal from "./Modal.jsx";
import { WorkspaceForm } from "./Account.jsx";
export function WorkspaceSwitcher({
  catalog,
  selected,
  user,
  onSelect,
  onRefresh,
  onClose,
}) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api("/workspaces", {
        workspace: false,
        method: "POST",
        body: JSON.stringify({
          name,
          ownerName:
            user?.displayName || catalog.actor?.name || "ShiftScript demo",
        }),
      });
      await onRefresh();
      await onSelect(result.workspace.id);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function join(invite) {
    setBusy(true);
    setError("");
    try {
      const result = await api(
        `/workspaces/${invite.workspaceId}/invitations/${invite.id}/accept`,
        { workspace: false, method: "POST", body: "{}" },
      );
      await onRefresh();
      await onSelect(result.workspace.id);
      window.history.replaceState({}, "", window.location.pathname);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    setBusy(true);
    setError("");
    try {
      await sendEmailVerification(auth.currentUser, {
        url: window.location.origin,
      });
      setMessage(
        "Verification email sent. Open the link, then check verification here.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setError("");
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      await onRefresh();
      setMessage(
        auth.currentUser.emailVerified
          ? "Email verified. Your invitations are listed below."
          : "Your email is not verified yet. Open the link in your verification email.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const requested = new URLSearchParams(window.location.search).get(
    "workspaceInvite",
  );
  return (
    <Modal
      title="Your workspaces"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted mb-4">
        Separate spaces for different teams and clients.
      </p>
      <div className="workspace-list">
        {catalog.workspaces.map((w) => (
          <button
            key={w.id}
            className={
              "workspace-option " + (selected === w.id ? "active" : "")
            }
            disabled={busy}
            onClick={async () => {
              try {
                await onSelect(w.id);
                onClose();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <Building size={22} />
            <span>
              <strong>{w.name}</strong>
              <small>
                {w.role} · {w.ownerName}
              </small>
            </span>
            {selected === w.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <section className="note-section">
        <h3 className="flex gap-2 items-center">
          <Mail size={18} />
          Workspace invitations
        </h3>
        {user && !catalog.actor?.emailVerified ? (
          <>
            <p className="hint mt-2">
              Verify your email to see and accept invitations sent to{" "}
              {user.email}.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button className="button small" disabled={busy} onClick={verify}>
                Send verification email
              </button>
              <button className="button small" disabled={busy} onClick={check}>
                Check verification
              </button>
            </div>
          </>
        ) : catalog.invitations.length ? (
          catalog.invitations.map((i) => (
            <div className="member-row" key={i.id}>
              <span>
                <strong>{i.workspaceName}</strong>
                <small>
                  {i.role} access · {i.email}
                </small>
              </span>
              <button
                className="button primary small"
                disabled={busy}
                onClick={() => join(i)}
              >
                Join workspace
              </button>
            </div>
          ))
        ) : (
          <p className="hint mt-2">
            {requested
              ? "This invitation is unavailable for this account. Check the invited email, or ask the owner for a new invitation."
              : "No pending invitations."}
          </p>
        )}
      </section>
      <form onSubmit={create} className="note-section">
        <h3 className="flex gap-2 items-center">
          <Plus size={18} />
          Create another workspace
        </h3>
        <label className="block mt-3">
          Workspace name
          <input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kopano Studio"
          />
        </label>
        <button className="button primary mt-3" disabled={busy}>
          Create workspace
        </button>
      </form>
      {message && (
        <p className="success-text" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function Team({
  workspace,
  role,
  user,
  reload,
  onRefresh,
  onError,
  onToast,
}) {
  const [email, setEmail] = useState(""),
    [inviteRole, setInviteRole] = useState("member"),
    [busy, setBusy] = useState(false);
  const owner = role === "owner";
  async function action(path, method, body) {
    setBusy(true);
    try {
      const result = await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await reload();
      await onRefresh();
      return result;
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function invite(e) {
    e.preventDefault();
    const result = await action("/members/invitations", "POST", {
      email,
      role: inviteRole,
    });
    if (result) {
      setEmail("");
      onToast(
        "Invitation created. Copy the link and share it with your teammate.",
      );
    }
  }
  async function copy(i) {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set("workspaceInvite", workspace.id);
    url.searchParams.set("invite", i.id);
    try {
      await navigator.clipboard.writeText(url.href);
      onToast(
        "Invitation link copied. Only the invited verified email can accept it.",
      );
    } catch {
      window.prompt("Copy this invitation link", url.href);
    }
  }
  return (
    <div className="team-grid">
      <section className="panel">
        <div className="section-heading">
          <h2 className="flex items-center gap-2">
            <Users size={21} />
            People in this workspace
          </h2>
          <span className="badge">
            {workspace?.members.length || 1} members
          </span>
        </div>
        {(workspace?.members || []).map((m) => (
          <div className="member-row" key={m.uid}>
            <span className="avatar">{m.name.slice(0, 2).toUpperCase()}</span>
            <span>
              <strong>
                {m.name}
                {m.uid === user?.uid ? " (you)" : ""}
              </strong>
              <small>{m.email || "Workspace owner"}</small>
            </span>
            {owner && m.role !== "owner" ? (
              <>
                <select
                  aria-label={"Role for " + m.name}
                  disabled={busy}
                  value={m.role}
                  onChange={(e) =>
                    action("/members/" + m.uid, "PATCH", {
                      role: e.target.value,
                    })
                  }
                >
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={"Remove " + m.name}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Remove " +
                          m.name +
                          " from this workspace? Their existing tasks will remain.",
                      )
                    )
                      action("/members/" + m.uid, "DELETE");
                  }}
                >
                  <Trash size={16} />
                </button>
              </>
            ) : (
              <span className="badge">{m.role}</span>
            )}
          </div>
        ))}
        <div className="role-guide">
          <Shield size={20} />
          <p>
            <strong>Owner</strong> manages the workspace and invitations.{" "}
            <strong>Members</strong> create and update work.{" "}
            <strong>Viewers</strong> can read and export.
          </p>
        </div>
        {owner && workspace && (
          <>
            <form className="note-section" onSubmit={invite}>
              <h3>Invite a teammate</h3>
              <p className="hint mt-2">
                Create an invitation, then copy and share the link. ShiftScript
                does not send invitation emails.
              </p>
              <div className="field-grid mt-4">
                <label>
                  Email address
                  <input
                    required
                    type="email"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Access
                  <select
                    aria-label="Access"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
              </div>
              <button className="button primary mt-3" disabled={busy}>
                <Mail size={16} />
                Create invitation
              </button>
            </form>
            <section className="note-section">
              <h3>Pending invitations</h3>
              {workspace.invites.length ? (
                workspace.invites.map((i) => (
                  <div className="member-row invite-row" key={i.id}>
                    <span>
                      <strong>{i.email}</strong>
                      <small>{i.role} access</small>
                    </span>
                    <button
                      className="button small"
                      aria-label={"Copy invitation for " + i.email}
                      onClick={() => copy(i)}
                    >
                      <Copy size={15} />
                      Copy link
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={"Revoke invitation for " + i.email}
                      disabled={busy}
                      onClick={() =>
                        action("/members/invitations/" + i.id, "DELETE")
                      }
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="hint mt-2">No pending invitations.</p>
              )}
            </section>
          </>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2 className="flex items-center gap-2">
            <Building size={21} />
            Workspace details
          </h2>
        </div>
        {owner ? (
          <WorkspaceForm
            user={user}
            workspace={workspace}
            onSaved={async () => {
              await reload();
              await onRefresh();
              onToast("Workspace settings saved.");
            }}
          />
        ) : (
          <>
            <h3>{workspace?.name}</h3>
            <p className="muted mt-2">
              Owned by {workspace?.ownerName}. Your access: {role}.
            </p>
            <p className="hint mt-4">
              Ask the owner to update workspace settings or invite people.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
