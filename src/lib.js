import { firebaseWebConfig } from "./firebase-config.js";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
const config = {
  ...firebaseWebConfig,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseWebConfig.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseWebConfig.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseWebConfig.projectId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseWebConfig.appId,
};
export const auth =
  config.apiKey && config.appId ? getAuth(initializeApp(config)) : null;
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
};
let selectedWorkspace = null;
export const setApiWorkspace = (value) => {
  selectedWorkspace = value;
};
export async function api(path, options = {}) {
  const { workspace = selectedWorkspace, ...requestOptions } = options;
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 65000);
  try {
    const res = await fetch("/api" + path, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(workspace ? { "X-Workspace-Id": workspace } : {}),
        ...options.headers,
      },
    });
    const data = await res.json().catch(() => ({
      error:
        "The server returned an unexpected response. Check the API deployment.",
    }));
    if (!res.ok)
      throw Object.assign(new Error(data.error || "Request failed."), {
        status: res.status,
      });
    return data;
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error("The request timed out. Please try again.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export const statuses = [
  "To Do",
  "In Progress",
  "Blocked",
  "In Review",
  "Completed",
];
export const priorities = ["Low", "Med", "High"];
export const types = [
  "Project review",
  "Planning",
  "Client meeting",
  "Development",
  "Internal",
  "Other",
];
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const formatDate = (v) =>
  v
    ? new Date(v + "T12:00:00Z").toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not specified";
export const overdue = (t) =>
  Boolean(t.dueDate && t.dueDate < today() && t.status !== "Completed");
export const fields = (t) => ({
  title: t.title,
  description: t.description,
  owner: t.owner,
  deadline: t.deadline,
  dueDate: t.dueDate,
  priority: t.priority,
  ...(t.ownerUid !== undefined ? { ownerUid: t.ownerUid } : {}),
});
export function exportFile(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
