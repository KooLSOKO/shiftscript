import { useState } from "react";
import {
  api,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "../lib.js";
import {
  preferGoogleRedirect,
  startGoogleReturn,
  clearGoogleReturn,
} from "../auth-flow.js";
import { RefreshCw } from "./Icons.jsx";
import Modal from "./Modal.jsx";
import PolicyLinks from "./PolicyLinks.jsx";

export function AccountFrame({ children }) {
  return (
    <main className="login">
      <div className="login-art">
        <img src="/art/meeting-blue.png" alt="Colleagues planning together" />
        <h1>
          Talk it through.
          <br />
          Put it in motion.
        </h1>
        <p>
          Turn meeting transcripts into clear summaries, decisions and reviewed
          tasks for your team.
        </p>
      </div>
      <section className="login-form">
        <a className="brand mb-8" href="/" aria-label="ShiftScript home">
          <img src="/favicon.svg" alt="" />
          ShiftScript
        </a>
        {children}
        <PolicyLinks />
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
  "auth/popup-blocked":
    "Your browser blocked the Google sign-in window. Allow pop-ups for ShiftScript and try again. If you opened this inside another app, use Safari or Chrome.",
  "auth/unauthorized-domain":
    "This website is not authorised for Google sign-in yet. Ask Earny to add this domain in Firebase Authentication settings.",
  "auth/account-exists-with-different-credential":
    "This email uses a different sign-in method. Sign in with your existing method first, or contact meetings@earny.co.za for help. Your existing workspace has not been replaced.",
  "auth/operation-not-supported-in-this-environment":
    "Open ShiftScript in Safari or Chrome to use Google sign-in.",
};

export default function AccountAccess({
  config,
  error,
  setError,
  setRegistering,
  onAuthenticated,
}) {
  const [mode, setMode] = useState(() =>
      new URLSearchParams(window.location.search).get("mode") === "signup" &&
      config.signupEnabled
        ? "signup"
        : "login",
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [googleBusy, setGoogleBusy] = useState(false),
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
  async function googleSignIn() {
    if (!auth || busy) return;
    setBusy(true);
    setGoogleBusy(true);
    setRegistering(true);
    setError("");
    setNotice("");
    let leaving = false;
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      // Basic Firebase identity only. Meet permissions belong to the separate connection flow.
      if (preferGoogleRedirect()) {
        startGoogleReturn();
        leaving = true;
        await signInWithRedirect(auth, provider);
        return;
      }
      const result = await signInWithPopup(auth, provider);
      await result.user.getIdToken(true);
      onAuthenticated?.();
    } catch (e) {
      leaving = false;
      clearGoogleReturn();
      if (
        ["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(
          e.code,
        )
      ) {
        setNotice(
          "Google sign-in was cancelled. You can try again or use your email.",
        );
      } else {
        setError(
          e.code === "auth/operation-not-allowed"
            ? "Google sign-in is not enabled yet. Enable the Google provider in Firebase Authentication → Sign-in method."
            : messages[e.code] ||
                (!e.code ? e.message : null) ||
                "Google sign-in couldn't finish. Please try again.",
        );
      }
    } finally {
      if (!leaving) {
        setRegistering(false);
        setBusy(false);
        setGoogleBusy(false);
      }
    }
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
    if (!reset) setRegistering(true);
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
        onAuthenticated?.();
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        onAuthenticated?.();
      }
    } catch (e) {
      setError(
        messages[e.code] ||
          "We couldn't complete this request. Please try again.",
      );
    } finally {
      setBusy(false);
      if (!reset) setRegistering(false);
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
      {auth && !reset && (
        <>
          <button
            type="button"
            className="button google-sign-in w-full"
            disabled={busy}
            onClick={googleSignIn}
          >
            <img src="/icons/Google.svg" width="20" height="20" alt="" />
            {googleBusy ? "Opening Google…" : "Continue with Google"}
          </button>
          <p className="hint google-identity-hint">
            Sign in or create your account. Connect Meet separately inside your
            workspace.
          </p>
          <div className="account-divider" aria-hidden="true">
            <span>or use email</span>
          </div>
        </>
      )}
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
      {!reset && (
        <p className="hint account-policy-note">
          By creating an account, you agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>
          . Read our{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>{" "}
          for how your information is handled.
        </p>
      )}
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
      {auth?.currentUser && (
        <button className="text-button mt-6" onClick={() => signOut(auth)}>
          Sign out
        </button>
      )}
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

export function WorkspaceLoading({ error, onRetry, message }) {
  return (
    <AccountFrame>
      <h2>
        {error
          ? "We couldn't open your workspace."
          : message || "Opening your workspace…"}
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
      {auth?.currentUser && (
        <button className="text-button mt-6" onClick={() => signOut(auth)}>
          Sign out
        </button>
      )}
    </AccountFrame>
  );
}
