const projectName = (id, projects) =>
  projects.find((p) => p.id === id)?.name || "No project";
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function tasksCsv(tasks, projects = []) {
  const headers = [
    "Task",
    "Description",
    "Owner",
    "Due date",
    "Original deadline",
    "Priority",
    "Status",
    "Project",
    "Source",
    "Meeting",
    "Checklist",
    "Created at",
  ];
  const rows = tasks.map((t) => [
    t.title,
    t.description,
    t.owner,
    t.dueDate,
    t.deadline,
    t.priority,
    t.status,
    projectName(t.projectId, projects),
    t.meetingId ? "Meeting" : "Manual",
    t.meetingTitle,
    (t.checklist || [])
      .map((c) => `${c.done ? "[x]" : "[ ]"} ${c.text}`)
      .join("\n"),
    t.createdAt,
  ]);
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const exportCsv = (tasks, projects) =>
  downloadBlob(
    "shiftscript-tasks.csv",
    new Blob([tasksCsv(tasks, projects)], { type: "text/csv;charset=utf-8" }),
  );
let fontPromise;
async function loadFonts() {
  if (!fontPromise)
    fontPromise = Promise.all(
      ["DejaVuSans", "DejaVuSans-Bold"].map(async (name) => {
        const response = await fetch(`/fonts/${name}.ttf`);
        if (!response.ok)
          throw new Error("Couldn't load the report font. Please try again.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 16384)
          text += String.fromCharCode(...bytes.subarray(i, i + 16384));
        return btoa(text);
      }),
    ).catch((e) => {
      fontPromise = null;
      throw e;
    });
  return fontPromise;
}
export function meetingReport(meeting, workspace, projects = []) {
  return {
    title: meeting.title,
    subtitle: `${workspace?.name || "ShiftScript"} · ${meeting.date} · ${meeting.type} · ${projectName(meeting.projectId, projects)}`,
    sections: [
      { title: "Meeting summary", items: [meeting.summary] },
      { title: "Discussion", items: meeting.discussionPoints },
      { title: "Decisions", items: meeting.decisions },
      { title: "Follow-ups", items: meeting.followUps },
      {
        title: "Action proposals",
        items: meeting.proposals.map(
          (p) =>
            `${p.title}\n${p.reviewStatus.toUpperCase()} · ${p.owner} · ${p.dueDate || p.deadline} · ${p.priority === "Med" ? "Medium" : p.priority}\n${p.description}\nEvidence: ${p.evidence}`,
        ),
      },
    ],
  };
}
export function taskReport(tasks, workspace, projects = []) {
  return {
    title: "Task progress report",
    subtitle: `${workspace?.name || "ShiftScript"} · ${tasks.length} tasks · Exported ${new Date().toISOString().slice(0, 10)}`,
    sections: [
      {
        title: "Tasks in this view",
        items: tasks.map(
          (t) =>
            `${t.title}\n${t.status} · ${t.owner} · ${t.dueDate || t.deadline} · ${t.priority === "Med" ? "Medium" : t.priority}\n${projectName(t.projectId, projects)} · ${t.meetingId ? "Meeting: " + t.meetingTitle : "Added manually"}\n${t.description}${t.checklist?.length ? "\n" + t.checklist.map((c) => `${c.done ? "[x]" : "[ ]"} ${c.text}`).join("\n") : ""}`,
        ),
      },
    ],
  };
}
export async function buildPdf(report, fonts) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const [normal, bold] = fonts || (await loadFonts());
  doc.addFileToVFS("DejaVuSans.ttf", normal);
  doc.addFont("DejaVuSans.ttf", "ShiftSans", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans-Bold.ttf", "ShiftSans", "bold");
  let y = 20;
  const brand = () => {
    doc.setFillColor(36, 88, 232);
    doc.roundedRect(18, 14, 8, 8, 2, 2, "F");
    doc.setFont("ShiftSans", "bold");
    doc.setFontSize(11);
    doc.setTextColor(24, 43, 82);
    doc.text("ShiftScript", 30, 20);
    y = 32;
  };
  const ensure = (height) => {
    if (y + height > 275) {
      doc.addPage();
      brand();
    }
  };
  const text = (value, size = 10, style = "normal", color = [49, 65, 93]) => {
    doc.setFont("ShiftSans", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(value || ""), 174),
      lineHeight = size * 0.48;
    for (const line of lines) {
      ensure(lineHeight);
      doc.setFont("ShiftSans", style);
      doc.setFontSize(size);
      doc.setTextColor(...color);
      doc.text(line, 18, y);
      y += lineHeight;
    }
  };
  brand();
  text(report.title, 20, "bold", [24, 43, 82]);
  y += 3;
  text(report.subtitle, 8, "normal", [102, 116, 143]);
  y += 10;
  const itemHeight = (item) => {
    doc.setFont("ShiftSans", "normal");
    doc.setFontSize(10);
    return doc.splitTextToSize(String(item), 174).length * 4.8 + 7;
  };
  for (const section of report.sections) {
    const sectionHeight =
      20 + section.items.reduce((height, item) => height + itemHeight(item), 0);
    ensure(sectionHeight <= 243 ? sectionHeight : 20);
    text(section.title, 12, "bold", [36, 88, 232]);
    y += 4;
    if (!section.items.length) {
      text("None identified.");
      y += 7;
    } else
      for (const [index, item] of section.items.entries()) {
        const height = itemHeight(`${index + 1}. ${item}`);
        ensure(height <= 243 ? height : 15);
        text(`${index + 1}. ${item}`);
        y += 7;
      }
    y += 3;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(224, 231, 243);
    doc.line(18, 281, 192, 281);
    doc.setFont("ShiftSans", "normal");
    doc.setFontSize(7);
    doc.setTextColor(102, 116, 143);
    doc.text("ShiftScript · Meeting proposals require human review", 18, 287);
    doc.text(`${page} / ${pages}`, 192, 287, { align: "right" });
  }
  return doc;
}
export async function exportPdf(report) {
  const doc = await buildPdf(report);
  doc.save(
    "shiftscript-" +
      report.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 65) +
      ".pdf",
  );
}
