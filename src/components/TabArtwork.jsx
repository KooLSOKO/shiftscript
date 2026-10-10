const scenes = {
  meetings: [
    "meetings",
    "Every conversation has a next chapter.",
    "Keep the context, decisions and next steps together.",
  ],
  google: [
    "google-meet",
    "Bring the meeting with you.",
    "Import available Google Meet notes or transcripts, then review the next steps.",
  ],
  tasks: [
    "tasks",
    "Small steps. Clear ownership.",
    "Know what needs doing, who owns it and when it is due.",
  ],
  board: [
    "tasks",
    "See the work moving.",
    "Follow each task from a first step to a finished one.",
  ],
  projects: [
    "projects",
    "Give good work a home.",
    "Connect the meetings and tasks that move your projects forward.",
  ],
  team: [
    "team",
    "Make space for your people.",
    "Invite your team and keep everyone working from the same page.",
  ],
};
export default function TabArtwork({ tab }) {
  const scene = scenes[tab];
  if (!scene) return null;
  return (
    <section className="tab-artwork">
      <div>
        <p className="eyebrow">CONVERSATION → ACTION</p>
        <h2>{scene[1]}</h2>
        <p>{scene[2]}</p>
      </div>
      <img
        src={"/art/" + scene[0] + ".png"}
        alt=""
        width="800"
        height="400"
        decoding="async"
      />
    </section>
  );
}
