import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { IntegrationVault } from "./integration-vault.js";
import { fail } from "./collaboration.js";
const scopes = [
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
];
const digest = (s) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const record = z.string().regex(/^conferenceRecords\/[A-Za-z0-9_-]{1,200}$/);
const artifact = z
  .string()
  .regex(
    /^conferenceRecords\/[A-Za-z0-9_-]{1,200}\/(smartNotes|transcripts)\/[A-Za-z0-9_-]{1,200}$/,
  );
export const selectionSchema = z.union([
  z.object({ kind: z.literal("document"), url: z.string().max(600) }).strict(),
  z.object({ kind: z.literal("artifact"), name: artifact }).strict(),
]);
export function documentId(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    fail(400, "Paste a Google Docs document link.");
  }
  const match = u.pathname.match(
    /^\/document\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/,
  );
  if (
    u.protocol !== "https:" ||
    u.hostname !== "docs.google.com" ||
    u.port ||
    !match
  )
    fail(400, "Use a https://docs.google.com/document/d/... link.");
  return match[1];
}
export function extractDocument(doc) {
  function content(elements = []) {
    return elements
      .map((e) =>
        e.paragraph
          ? (e.paragraph.elements || [])
              .map((v) => v.textRun?.content || "")
              .join("")
          : e.table
            ? e.table.tableRows
                .map((r) =>
                  r.tableCells.map((c) => content(c.content)).join("\t"),
                )
                .join("\n")
            : e.tableOfContents
              ? content(e.tableOfContents.content)
              : "",
      )
      .join("");
  }
  function tabs(list = []) {
    return list
      .map(
        (t) => content(t.documentTab?.body?.content) + "\n" + tabs(t.childTabs),
      )
      .join("\n");
  }
  return (
    doc.tabs?.length ? tabs(doc.tabs) : content(doc.body?.content)
  ).trim();
}
export class GoogleIntegration {
  constructor({ storage, vault, env = process.env, fetcher = fetch } = {}) {
    this.env = env;
    this.fetcher = fetcher;
    this.vault = vault || new IntegrationVault({ storage });
    try {
      this.redirect = new URL(env.GOOGLE_REDIRECT_URI);
      const local =
        this.redirect.hostname === "localhost" ||
        this.redirect.hostname === "127.0.0.1";
      if (
        this.redirect.pathname !== "/api/google/callback" ||
        this.redirect.search ||
        this.redirect.hash ||
        this.redirect.username ||
        this.redirect.password ||
        (this.redirect.protocol !== "https:" &&
          !(local && this.redirect.protocol === "http:"))
      )
        this.redirect = null;
    } catch {
      this.redirect = null;
    }
  }
  get ready() {
    return Boolean(
      this.env.GOOGLE_CLIENT_ID &&
      this.env.GOOGLE_CLIENT_SECRET &&
      this.redirect &&
      this.vault.key,
    );
  }
  requireReady() {
    if (!this.ready)
      fail(
        503,
        "Google connection is not configured yet. Contact your administrator.",
      );
  }
  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.redirect?.protocol === "https:",
      sameSite: "lax",
      path: "/api/google/callback",
      maxAge: 600000,
    };
  }
  async request(url, options = {}) {
    let response;
    try {
      response = await this.fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(12000),
        redirect: "error",
      });
    } catch {
      fail(502, "Google did not respond. Try again shortly.");
    }
    const text = await response.text();
    if (text.length > 2000000)
      fail(413, "Google returned a document too large to import.");
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      fail(502, "Google returned an unreadable response.");
    }
    if (!response.ok) {
      if (body.error === "invalid_grant" || response.status === 401)
        fail(
          401,
          "Your Google connection expired. Disconnect and connect again.",
        );
      if (response.status === 403)
        fail(
          403,
          "Google did not grant access. Check the selected account, document sharing and Meet eligibility. You can try a Google Docs notes link instead.",
        );
      if (response.status === 404)
        fail(
          404,
          "Google could not find this meeting or document. Check access and try again.",
        );
      if (response.status === 429)
        fail(429, "Google's request limit was reached. Try again later.");
      fail(
        502,
        "Google could not complete the request. Try reconnecting your account.",
      );
    }
    return body;
  }
  token(params) {
    return this.request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID,
        client_secret: this.env.GOOGLE_CLIENT_SECRET,
        ...params,
      }),
    });
  }
  async start(uid) {
    this.requireReady();
    const nonce = random(),
      binding = random(),
      verifier = random(),
      expires = Date.now() + 600000;
    await this.vault.mutate(uid, (s) => {
      s.states = (s.states || []).filter((v) => v.expires > Date.now());
      if (s.states.length >= 5)
        fail(429, "Too many Google connection attempts. Wait ten minutes.");
      s.states.push({ nonce, binding: digest(binding), verifier, expires });
    });
    const state = this.vault.seal({ uid, nonce, expires });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID,
      redirect_uri: this.redirect.href,
      response_type: "code",
      scope: scopes.join(" "),
      access_type: "offline",
      prompt: "select_account consent",
      state,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    }).toString();
    return { url: url.href, binding };
  }
  async callback(query, binding) {
    this.requireReady();
    let state;
    try {
      state = this.vault.open(z.string().max(2500).parse(query.state));
    } catch {
      fail(
        400,
        "Invalid Google connection attempt. Start again in ShiftScript.",
      );
    }
    if (!state.uid || state.expires < Date.now() || !binding)
      fail(
        400,
        "Google connection attempt expired. Start again in ShiftScript.",
      );
    const saved = await this.vault.mutate(state.uid, (s) => {
      const value = (s.states || []).find(
        (v) =>
          v.nonce === state.nonce &&
          v.binding === digest(binding) &&
          v.expires > Date.now(),
      );
      if (!value)
        fail(
          400,
          "Google connection attempt already used or belongs to another browser.",
        );
      s.states = s.states.filter((v) => v.nonce !== state.nonce);
      return value;
    });
    if (query.error) fail(400, "Google access was declined.");
    const tokens = await this.token({
      grant_type: "authorization_code",
      code: z.string().min(1).max(3000).parse(query.code),
      redirect_uri: this.redirect.href,
      code_verifier: saved.verifier,
    });
    if (
      !tokens.access_token ||
      !tokens.refresh_token ||
      (tokens.scope && scopes.some((s) => !tokens.scope.split(" ").includes(s)))
    )
      fail(
        403,
        "Google did not grant the required permissions. Reconnect and approve Meet and Docs read access.",
      );
    await this.vault.mutate(state.uid, (s) => {
      s.connection = {
        access: tokens.access_token,
        refresh: tokens.refresh_token,
        expires: Date.now() + Number(tokens.expires_in || 3600) * 1000,
        id: random(),
        connectedAt: new Date().toISOString(),
      };
      s.previews = [];
    });
  }
  async status(uid) {
    if (!this.ready) return { ready: false, connected: false };
    const { connection } = await this.vault.get(uid);
    return {
      ready: true,
      connected: Boolean(connection),
      connectedAt: connection?.connectedAt || null,
    };
  }
  async disconnect(uid) {
    this.requireReady();
    await this.vault.mutate(uid, (s) => {
      delete s.connection;
      s.previews = [];
      s.states = [];
    });
  }
  async access(uid) {
    this.requireReady();
    const { connection: c } = await this.vault.get(uid);
    if (!c) fail(409, "Connect your Google account first.");
    if (c.expires > Date.now() + 60000) return c.access;
    const token = await this.token({
      grant_type: "refresh_token",
      refresh_token: c.refresh,
    });
    if (!token.access_token) fail(502, "Reconnect your Google account.");
    return this.vault.mutate(uid, (s) => {
      if (s.connection?.id !== c.id)
        fail(409, "Google connection changed. Try again.");
      s.connection.access = token.access_token;
      s.connection.expires =
        Date.now() + Number(token.expires_in || 3600) * 1000;
      if (token.refresh_token) s.connection.refresh = token.refresh_token;
      return s.connection.access;
    });
  }
  async limit(uid) {
    await this.vault.mutate(uid, (s) => {
      const minute = Math.floor(Date.now() / 60000);
      if (s.rate?.minute !== minute) s.rate = { minute, count: 0 };
      if (s.rate.count >= 30)
        fail(429, "Please wait a minute before importing again.");
      s.rate.count++;
    });
  }
  async get(uid, path, params = {}, docs = false) {
    const url = new URL(
      path,
      docs
        ? "https://docs.googleapis.com/v1/"
        : "https://meet.googleapis.com/v2/",
    );
    url.search = new URLSearchParams(params).toString();
    return this.request(url.href, {
      headers: { Authorization: "Bearer " + (await this.access(uid)) },
    });
  }
  async list(uid, cursor) {
    this.requireReady();
    await this.limit(uid);
    const params = { pageSize: "20" };
    if (cursor) params.pageToken = z.string().max(2000).parse(cursor);
    const data = await this.get(uid, "conferenceRecords", params);
    return {
      meetings: (data.conferenceRecords || []).map((v) => ({
        name: v.name,
        startTime: v.startTime,
        endTime: v.endTime,
      })),
      cursor: data.nextPageToken || null,
    };
  }
  async pages(uid, path, property) {
    const values = [];
    let cursor;
    for (let i = 0; i < 10; i++) {
      const data = await this.get(uid, path, {
        pageSize: "100",
        ...(cursor ? { pageToken: cursor } : {}),
      });
      values.push(...(data[property] || []));
      cursor = data.nextPageToken;
      if (!cursor) return values;
    }
    fail(
      413,
      "This meeting has too much content for one import. Use a shorter notes document.",
    );
  }
  async artifacts(uid, name) {
    this.requireReady();
    record.parse(name);
    await this.limit(uid);
    const [notes, transcripts] = await Promise.all([
      this.pages(uid, name + "/smartNotes", "smartNotes"),
      this.pages(uid, name + "/transcripts", "transcripts"),
    ]);
    return {
      artifacts: [
        ...notes.map((v) => ({
          name: v.name,
          kind: "notes",
          ready: v.state === "FILE_GENERATED",
        })),
        ...transcripts.map((v) => ({
          name: v.name,
          kind: "transcript",
          ready: v.state === "FILE_GENERATED",
        })),
      ],
    };
  }
  async preview(uid, workspaceId, input) {
    this.requireReady();
    const selection = selectionSchema.parse(input);
    await this.limit(uid);
    const connectionId = (await this.vault.get(uid)).connection?.id;
    if (!connectionId) fail(409, "Connect your Google account first.");
    let transcript, source, title;
    if (selection.kind === "document") {
      const docId = documentId(selection.url),
        doc = await this.get(
          uid,
          "documents/" + docId,
          { includeTabsContent: "true" },
          true,
        );
      transcript = extractDocument(doc);
      title = doc.title;
      source = {
        kind: "google-document",
        name: doc.title || "Google document",
        documentId: docId,
        url: "https://docs.google.com/document/d/" + docId + "/edit",
      };
    } else {
      const item = await this.get(uid, selection.name),
        parent = selection.name.split("/").slice(0, 2).join("/");
      if (item.state !== "FILE_GENERATED")
        fail(
          409,
          "Google is still preparing this file. Try again once it is ready.",
        );
      if (selection.name.includes("/smartNotes/")) {
        const docId = z
          .string()
          .regex(/^[A-Za-z0-9_-]{10,200}$/)
          .parse(item.docsDestination?.document);
        const doc = await this.get(
          uid,
          "documents/" + docId,
          { includeTabsContent: "true" },
          true,
        );
        transcript = extractDocument(doc);
        title = doc.title;
        source = {
          kind: "google-notes",
          name: doc.title || "Meet Gemini notes",
          artifact: selection.name,
          documentId: docId,
          url: "https://docs.google.com/document/d/" + docId + "/edit",
        };
      } else {
        const [entries, participants] = await Promise.all([
          this.pages(uid, selection.name + "/entries", "transcriptEntries"),
          this.pages(uid, parent + "/participants", "participants"),
        ]);
        const names = new Map(
          participants.map((p) => [
            p.name,
            p.signedinUser?.displayName ||
              p.anonymousUser?.displayName ||
              p.phoneUser?.displayName,
          ]),
        );
        const unknown = new Map();
        transcript = entries
          .sort((a, b) =>
            String(a.startTime || "").localeCompare(String(b.startTime || "")),
          )
          .map((e) => {
            if (!names.get(e.participant) && !unknown.has(e.participant))
              unknown.set(
                e.participant,
                "Unknown speaker " + (unknown.size + 1),
              );
            return (
              (names.get(e.participant) || unknown.get(e.participant)) +
              ": " +
              e.text
            );
          })
          .join("\n");
        title = "Google Meet transcript";
        source = {
          kind: "google-transcript",
          name: title,
          artifact: selection.name,
        };
      }
    }
    if (transcript.length < 40)
      fail(422, "This source does not contain enough text to process.");
    if (transcript.length > 15000)
      fail(
        413,
        "This source exceeds the 15,000-character processing limit. Copy a shorter section into New meeting, or import a shorter notes document.",
      );
    const previewId = random(),
      expires = Date.now() + 900000;
    await this.vault.mutate(uid, (s) => {
      if (s.connection?.id !== connectionId)
        fail(409, "Your Google connection changed. Import again.");
      s.previews = (s.previews || [])
        .filter((v) => v.expires > Date.now())
        .slice(-3);
      s.previews.push({
        id: previewId,
        workspaceId,
        connectionId,
        transcript,
        source,
        expires,
      });
    });
    return {
      previewId,
      transcript,
      source,
      title: (title || "Google meeting notes").slice(0, 120),
      expires,
    };
  }
  async imported(uid, workspaceId, previewId) {
    this.requireReady();
    const s = await this.vault.get(uid);
    const p = (s.previews || []).find(
      (v) =>
        v.id === previewId &&
        v.workspaceId === workspaceId &&
        v.connectionId === s.connection?.id &&
        v.expires > Date.now(),
    );
    if (!p)
      fail(
        409,
        "This preview expired or belongs to another workspace. Import the source again.",
      );
    return { transcript: p.transcript, source: p.source };
  }
}
