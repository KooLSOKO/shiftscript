import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  tasksCsv,
  csvCell,
  buildPdf,
  meetingReport,
  taskReport,
} from "../src/features/exports.js";
import { defaultFilters, filterTasks } from "../src/features/task-filters.js";
const tasks = [
  {
    id: "t1",
    title: 'Portfolio, "launch"',
    description: "Review café layout",
    owner: "Kopano",
    ownerUid: "kopano",
    dueDate: "2026-10-08",
    deadline: "Thursday",
    priority: "High",
    status: "To Do",
    projectId: "p1",
    meetingId: "m1",
    meetingTitle: "Review",
    createdAt: "2026-10-08",
    checklist: [{ text: "Check mobile", done: true }],
  },
  {
    id: "t2",
    title: "Design",
    description: "Icons",
    owner: "Soko",
    ownerUid: "soko",
    dueDate: "2026-10-10",
    priority: "Med",
    status: "Completed",
    projectId: "p2",
    meetingId: null,
    createdAt: "2026-10-09",
    checklist: [],
  },
  {
    id: "t3",
    title: "Send notes",
    description: "Follow-up",
    owner: "Soko",
    ownerUid: "soko",
    dueDate: null,
    priority: "Low",
    status: "Blocked",
    projectId: null,
    meetingId: null,
    createdAt: "2026-10-10",
    checklist: [],
  },
];
const view = (f = {}) =>
  filterTasks(
    tasks,
    { ...defaultFilters, ...f },
    { uid: "soko" },
    "2026-10-09",
  ).map((t) => t.id);
test("task filters combine ownership, project, priority, source, date range and stable sorting", () => {
  assert.deepEqual(view(), ["t3", "t2", "t1"]);
  assert.deepEqual(view({ owner: "Me", source: "manual" }), ["t3", "t2"]);
  assert.deepEqual(view({ due: "Overdue" }), ["t1"]);
  assert.deepEqual(view({ project: "None", status: "Blocked" }), ["t3"]);
  assert.deepEqual(view({ project: "p1", priority: "High" }), ["t1"]);
  assert.deepEqual(view({ search: "café" }), ["t1"]);
  assert.deepEqual(
    view({ due: "Custom range", from: "2026-10-09", to: "2026-10-11" }),
    ["t2"],
  );
  assert.deepEqual(view({ sort: "due" }), ["t1", "t2", "t3"]);
  assert.deepEqual(view({ sort: "priority" }), ["t1", "t2", "t3"]);
  assert.deepEqual(view({ due: "Next 7 days" }), []);
});
test("CSV quotes commas, accents, checklists and rejects spreadsheet formula execution", () => {
  const csv = tasksCsv(tasks, [{ id: "p1", name: "Portfolio" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Portfolio, ""launch"""'));
  assert.ok(csv.includes("Review café layout"));
  assert.ok(csv.includes("[x] Check mobile"));
  for (const v of [
    "=SUM(1,2)",
    "+cmd",
    "-1+2",
    "@danger",
    "  =formula",
    "\tbad",
  ])
    assert.ok(csvCell(v).startsWith("\"'"));
  assert.equal(csvCell("Normal"), '"Normal"');
});
test("PDF uses embedded fonts and paginates long reports; report builders preserve evidence and statuses", async () => {
  const fonts = await Promise.all(
    ["DejaVuSans", "DejaVuSans-Bold"].map(async (n) =>
      (
        await readFile(
          new URL("../public/fonts/" + n + ".ttf", import.meta.url),
        )
      ).toString("base64"),
    ),
  );
  const report = taskReport(
    Array.from({ length: 40 }, (_, i) => ({
      ...tasks[0],
      title: "Café portfolio task " + i,
    })),
    { name: "Studio" },
    [{ id: "p1", name: "Portfolio" }],
  );
  const pdf = await buildPdf(report, fonts);
  assert.ok(pdf.getNumberOfPages() > 3);
  const buffer = Buffer.from(pdf.output("arraybuffer"));
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(buffer.includes(Buffer.from("/FontFile2")));
  const summary = meetingReport(
    {
      title: "Review",
      date: "2026-10-09",
      type: "Client meeting",
      summary: "Good discussion",
      discussionPoints: [],
      decisions: [],
      followUps: [],
      proposals: [
        {
          ...tasks[0],
          reviewStatus: "pending",
          evidence: "Kopano will launch the website.",
        },
      ],
    },
    { name: "Studio" },
    [],
  );
  assert.ok(summary.sections.at(-1).items[0].includes("PENDING"));
  assert.ok(
    summary.sections.at(-1).items[0].includes("Evidence: Kopano will launch"),
  );
});
