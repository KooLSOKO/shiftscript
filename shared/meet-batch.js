export const MAX_MEET_BATCH = 3;
export function sameMeetSource(a, b) {
  return Boolean(
    (a?.artifact && a.artifact === b?.artifact) ||
    (a?.documentId && a.documentId === b?.documentId),
  );
}
export const sourceLabel = (source) =>
  source?.kind === "google-transcript"
    ? "Speaker-labelled transcript"
    : source?.kind === "google-notes"
      ? "Meet Gemini notes"
      : "Google document";
export function batchCandidates(items) {
  if (!Array.isArray(items) || items.length > MAX_MEET_BATCH)
    throw Error("Choose up to three meeting sources.");
  const ready = items.filter((item) =>
    ["ready", "failed"].includes(item.status),
  );
  if (
    items.some((item, i) =>
      items
        .slice(0, i)
        .some((previous) =>
          sameMeetSource(item.preview?.source, previous.preview?.source),
        ),
    )
  )
    throw Error("Each source can appear only once in a batch.");
  for (const item of ready) {
    const date = item.form?.date || "";
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date;
    if (
      !item.form?.title?.trim() ||
      item.form.title.trim().length < 3 ||
      item.form.title.trim().length > 120 ||
      !validDate
    )
      throw Object.assign(
        Error(
          `Meeting ${items.indexOf(item) + 1} needs a title of 3–120 characters and a valid date before processing.`,
        ),
        { itemId: item.id },
      );
  }
  return ready;
}
// Separate bounded requests retain existing source permissions, duplicate protection and task review.
export async function processMeetBatch({
  items,
  request,
  onUpdate,
  isActive = () => true,
  shouldStop = () => false,
}) {
  const ready = batchCandidates(items),
    results = [];
  let paused = false;
  for (const item of ready) {
    if (!isActive() || shouldStop()) {
      paused = true;
      break;
    }
    try {
      onUpdate(item.id, { status: "reading", error: "", changedPreview: null });
      const preview = await request("/google/preview", {
        method: "POST",
        body: JSON.stringify(item.selection),
      });
      if (!isActive()) {
        paused = true;
        break;
      }
      if (
        !sameMeetSource(preview.source, item.preview.source) ||
        preview.transcript !== item.preview.transcript
      ) {
        onUpdate(item.id, {
          status: "changed",
          changedPreview: preview,
          error:
            "This source changed since you selected it. Review the new text before processing.",
        });
        continue;
      }
      onUpdate(item.id, { status: "processing", preview });
      const result = await request("/google/import", {
        method: "POST",
        body: JSON.stringify({
          ...item.form,
          title: item.form.title.trim(),
          projectId: item.form.projectId || null,
          previewId: preview.previewId,
        }),
      });
      results.push(result);
      if (isActive()) onUpdate(item.id, { status: "done", result, error: "" });
    } catch (error) {
      if (isActive())
        onUpdate(item.id, {
          status: "failed",
          error: error.message || "Could not process this source. Try again.",
        });
      if ([401, 429].includes(error.status)) {
        paused = true;
        break;
      }
    }
  }
  return { results, paused };
}
