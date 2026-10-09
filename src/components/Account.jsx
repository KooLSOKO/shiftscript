import { useState } from "react";
import {
  api,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
} from "../lib.js";
import { ArrowRight, RefreshCw } from "./Icons.jsx";
import Modal from "./Modal.jsx";

export function AccountFrame({ children }) {
  return (
    <main className="login">
      <div className="login-art">
        <img src="/art/meeting-blue.webp" alt="Colleagues planning together" />
        <h1>
          Talk it through.
          <br />
          Put it in motion.
        </h1>
        <p>Your next steps deserve a place to land.</p>
      </div>
      <section className="login-form">
        <div className="brand mb-8">
          <img src="/favicon.svg" alt="" />
          ShiftScript
        </div>
        {children}
      </section>
    </main>
  );
}

const messages = {
  "auth/email-already-in-use":
    "This email already has an account. Sign in instead.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/weak-password":
    "Choose a stronger password that meets your Firebase password policy.",
  "auth/password-does-not-meet-requirements":
    "This password does not meet the required password policy.",
  "auth/invalid-credential": "Check your email and password and try again.",
  "auth/wrong-password": "Check your email and password and try again.",
  "auth/user-not-found": "Check your email and password and try again.",
  "auth/too-many-requests":
    "Too many attempts. Please wait a little before trying again.",
  "auth/network-request-failed":
    "Couldn't connect. Check your internet connection and try again.",
  "auth/operation-not-allowed":
    "Email/password accounts are not enabled yet. Contact the workspace administrator.",
};

export default function AccountAccess({
  config,
  error,
  setError,
  setRegistering,
}) {
  const [mode, setMode] = useState("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const signup = mode === "signup",
    reset = mode === "reset";
  function changeMode(value) {
    setMode(value);
    setError("");
    setNotice("");
    setPassword("");
    setConfirm("");
  }
  async function submit(e) {
    e.preventDefault();
    if (!auth || busy) return;
    setError("");
    setNotice("");
    if (signup && name.trim().length < 2)
      return setError("Enter your full name.");
    if (signup && password !== confirm)
      return setError("Your passwords don't match.");
    setBusy(true);
    if (signup) setRegistering(true);
    try {
      if (reset) {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice(
          "If this email has an account, you'll receive a password reset link.",
        );
      } else if (signup) {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        await credential.user.getIdToken(true);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e) {
      setError(
        messages[e.code] ||
          "We couldn't complete this request. Please try again.",
      );
    } finally {
      setBusy(false);
      if (signup) setRegistering(false);
    }
  }
  return (
    <AccountFrame>
      <h2>
        {signup
          ? "Your next chapter starts here."
          : reset
            ? "Let's get you back in."
            : "Welcome to your workspace."}
      </h2>
      <p className="muted mb-6">
        {signup
          ? "Create an account, then give your workspace a name."
          : reset
            ? "We'll email you a link to choose a new password."
            : "Sign in to keep the conversation moving."}
      </p>
      {auth ? (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            {signup && (
              <label className="block mb-4">
                Full name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Victor Soko"
                />
              </label>
            )}
            <label className="block mb-4">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {!reset && (
              <label className="block mb-4">
                Password
                <input
                  type="password"
                  aria-describedby={signup ? "password-hint" : undefined}
                  autoComplete={signup ? "new-password" : "current-password"}
                  required
                  minLength={signup ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {signup && (
              <p id="password-hint" className="hint mb-4">
                At least 8 characters.
              </p>
            )}
            {signup && (
              <label className="block mb-6">
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
            )}
            <button className="button primary w-full" disabled={busy}>
              {busy
                ? "Just a moment…"
                : signup
                  ? "Create account"
                  : reset
                    ? "Send reset link"
                    : "Open workspace"}
              <ArrowRight size={17} />
            </button>
          </fieldset>
        </form>
      ) : (
        <p role="alert" className="form-error">
          The sign-in service hasn't been configured yet.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-text">
          {notice}
        </p>
      )}
      <div className="account-links">
        {mode === "login" ? (
          <>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => changeMode("reset")}
            >
              Forgot password?
            </button>
            {config.signupEnabled && (
              <p>
                New to ShiftScript?{" "}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => changeMode("signup")}
                >
                  Create an account
                </button>
              </p>
            )}
          </>
        ) : (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => changeMode("login")}
          >
            Back to sign in
          </button>
        )}
      </div>
      <p className="hint mt-6">
        Your meetings and tasks stay in the workspace you choose.
      </p>
    </AccountFrame>
  );
}

export function WorkspaceForm({ user, workspace, onSaved }) {
  const [name, setName] = useState(workspace?.name || ""),
    [ownerName, setOwnerName] = useState(
      workspace?.ownerName || user?.displayName || "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2 || ownerName.trim().length < 2)
      return setError(
        "Enter your name and a workspace name (at least 2 characters each).",
      );
    setBusy(true);
    setError("");
    try {
      if (auth?.currentUser)
        await updateProfile(auth.currentUser, {
          displayName: ownerName.trim(),
        });
      await api("/workspace", {
        method: workspace ? "PATCH" : "POST",
        body: JSON.stringify({
          name: name.trim(),
          ownerName: ownerName.trim(),
        }),
      });
      await onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="block mb-4">
          Your full name
          <input
            autoComplete="name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="block mb-4">
          Workspace name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            placeholder="Earny Studio"
          />
        </label>
        <p className="hint mb-6">
          A private place for your meetings, decisions and tasks.
        </p>
        <button className="button primary w-full" disabled={busy}>
          {busy ? "Saving…" : workspace ? "Save changes" : "Create workspace"}
          <ArrowRight size={17} />
        </button>
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function WorkspaceSetup({ user, onSaved }) {
  return (
    <AccountFrame>
      <p className="eyebrow mb-4">MAKE YOURSELF AT HOME</p>
      <h2>Give your work a place to land.</h2>
      <p className="muted mb-6">
        Name your workspace. Any meetings you already have will stay right here.
      </p>
      <WorkspaceForm user={user} onSaved={onSaved} />
      <button className="text-button mt-6" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </AccountFrame>
  );
}

export function WorkspaceSettings({ user, workspace, onSaved, onClose }) {
  return (
    <Modal title="Workspace settings" onClose={onClose}>
      <WorkspaceForm user={user} workspace={workspace} onSaved={onSaved} />
    </Modal>
  );
}

export function WorkspaceLoading({ error, onRetry }) {
  return (
    <AccountFrame>
      <h2>
        {error ? "We couldn't open your workspace." : "Opening your workspace…"}
      </h2>
      {error ? (
        <>
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="button primary mt-6" onClick={onRetry}>
            Try again
          </button>
        </>
      ) : (
        <RefreshCw className="spin" />
      )}
      <button className="text-button mt-6" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </AccountFrame>
  );
}
