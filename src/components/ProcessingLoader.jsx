// Shared noninteractive processing status; real request state controls its lifetime.
export default function ProcessingLoader({
  label = "Reading the conversation…",
}) {
  return (
    <div
      className="processing-status"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <ul className="ss-wave-loader" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <li key={index} />
        ))}
      </ul>
      <p>{label}</p>
    </div>
  );
}
