import {
  initializeApp,
  getApps,
  cert,
  applicationDefault,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
export function firebase() {
  if (!getApps().length) {
    let credential;
    try {
      credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
        : applicationDefault();
    } catch {
      throw Object.assign(
        new Error(
          "Firebase credentials are invalid. Check server environment variables.",
        ),
        { status: 503 },
      );
    }
    initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID || "shiftscriptza",
    });
  }
  return { db: getFirestore(), auth: getAuth() };
}
