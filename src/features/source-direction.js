// A small dead zone and a wider axis-switch threshold keep mouse drags steady.
export function mouseDirection(dx, dy, previous = null) {
  if (Math.hypot(dx, dy) < 12) return null;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const next = horizontal
    ? dx > 0
      ? "voice"
      : "previous"
    : dy > 0
      ? "google"
      : "text";
  if (previous && ["voice", "previous"].includes(previous) !== horizontal) {
    const dominant = Math.max(Math.abs(dx), Math.abs(dy));
    const minor = Math.min(Math.abs(dx), Math.abs(dy));
    if (dominant < minor * 1.35 + 6) return previous;
  }
  return next;
}
