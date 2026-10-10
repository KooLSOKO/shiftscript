import { useState } from "react";
import { api, auth, sendEmailVerification } from "../lib.js";
import { Save, Upload } from "./Icons.jsx";
async function photoData(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Choose a PNG, JPG or WebP photo smaller than 5 MB.");
  const image = await createImageBitmap(file),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 160;
  const context = canvas.getContext("2d"),
    size = Math.min(image.width, image.height);
  context.drawImage(
    image,
    (image.width - size) / 2,
    (image.height - size) / 2,
    size,
    size,
    0,
    0,
    160,
    160,
  );
  image.close();
  const data = canvas.toDataURL("image/webp", 0.82);
  if (data.length > 100000)
    throw new Error("Choose a simpler photo to keep your profile fast.");
  return data;
}
export default function ProfileSettings({
  personal,
  actor,
  user,
  remindersReady,
  onSaved,
}) {
  const [name, setName] = useState(actor.name),
    [aliases, setAliases] = useState((personal?.aliases || []).join(", ")),
    [avatar, setAvatar] = useState(personal?.avatar || ""),
    [preferences, setPreferences] = useState(
      personal?.preferences || {
        inAppNotifications: true,
        emailReminders: false,
        remindBeforeDays: 1,
        timeZone: "Africa/Johannesburg",
      },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/profile", {
        workspace: false,
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          aliases: [
            ...new Set(
              aliases
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ],
          avatar,
          preferences,
        }),
      });
      await onSaved(result.profile);
      setNotice("Your profile and preferences are saved.");
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-section">
      <h2>Your profile & preferences</h2>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <label className="block mb-4">
            Profile name
            <input
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block mb-4">
            Names people call you
            <input
              maxLength={650}
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
              placeholder="Soko, Victor"
            />
            <span className="hint">
              Comma-separated nicknames, up to eight. Used for My tasks and
              owner suggestions.
            </span>
          </label>
          <div className="profile-photo-editor">
            {avatar && <img src={avatar} alt="New profile photo preview" />}
            <label className="button upload">
              <Upload size={16} />
              Choose profile photo
              <input
                type="file"
                aria-label="Profile photo"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    setAvatar(await photoData(file));
                  } catch (error) {
                    setError(error.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {avatar && (
              <button
                type="button"
                className="text-button"
                onClick={() => setAvatar("")}
              >
                Remove photo
              </button>
            )}
          </div>
          <h3 className="mt-5 mb-3">Reminder preferences</h3>
          <label className="check-option">
            <input
              type="checkbox"
              checked={preferences.inAppNotifications}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  inAppNotifications: event.target.checked,
                })
              }
            />
            In-app notifications
          </label>
          <label className="check-option">
            <input
              type="checkbox"
              checked={preferences.emailReminders}
              disabled={!remindersReady || !user?.emailVerified}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  emailReminders: event.target.checked,
                })
              }
            />
            Daily email reminders
          </label>
          {!remindersReady && (
            <p className="hint">
              Daily emails need administrator setup. In-app notifications are
              available now.
            </p>
          )}
          {user && !user.emailVerified && (
            <button
              type="button"
              className="text-button mt-2"
              onClick={async () => {
                try {
                  await sendEmailVerification(auth.currentUser);
                  setNotice(
                    "Verification email requested. Verify your address, then sign in again.",
                  );
                } catch (error) {
                  setError(error.message);
                }
              }}
            >
              Verify your email for reminders
            </button>
          )}
          <div className="field-grid mt-4">
            <label>
              Remind me before the deadline
              <select
                aria-label="Reminder lead time"
                value={preferences.remindBeforeDays}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    remindBeforeDays: Number(event.target.value),
                  })
                }
              >
                {[0, 1, 2, 3, 7].map((days) => (
                  <option key={days} value={days}>
                    {days === 0
                      ? "On the due date"
                      : days + " day" + (days > 1 ? "s" : "") + " before"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reminder time zone
              <input
                value={preferences.timeZone}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    timeZone: event.target.value,
                  })
                }
                placeholder="Africa/Johannesburg"
              />
            </label>
          </div>
          <p className="hint mt-3">
            The daily digest includes upcoming and overdue tasks assigned to
            you. You can turn it off here at any time.
          </p>
          <button className="button primary mt-4" disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : "Save profile & preferences"}
          </button>
        </fieldset>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-text" role="status">
          {notice}
        </p>
      )}
      {personal?.emailAttempts?.length > 0 && (
        <p className="hint mt-3">
          Last email run: {personal.emailAttempts.at(-1).day} ·{" "}
          {personal.emailAttempts.at(-1).status === "accepted"
            ? "Accepted by mail server"
            : personal.emailAttempts.at(-1).status}
        </p>
      )}
    </section>
  );
}
