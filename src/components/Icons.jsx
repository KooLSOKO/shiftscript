// Original ShiftScript vector icon set. Rounded outlines with an ice-blue second tone.
const soft = "var(--icon-soft, #dbe8ff)";
function frame(draw) {
  return function Icon({ size = 20, className = "", ...props }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={"shift-icon " + className}
        aria-hidden="true"
        {...props}
      >
        {draw}
      </svg>
    );
  };
}
export const LayoutDashboard = frame(
  <>
    <rect x="3" y="3" width="8" height="8" rx="2" fill={soft} />
    <rect x="15" y="3" width="6" height="12" rx="2" />
    <rect x="3" y="15" width="8" height="6" rx="2" />
    <rect x="15" y="19" width="6" height="2" rx="1" fill={soft} />
  </>,
);
export const UserCircle = frame(
  <>
    <circle cx="12" cy="12" r="9" fill={soft} />
    <circle cx="12" cy="9" r="3" />
    <path d="M5.5 18a7 7 0 0 1 13 0" />
  </>,
);
export const NotebookPen = frame(
  <>
    <rect x="4" y="3" width="13" height="18" rx="3" fill={soft} />
    <path d="M8 7h5M8 11h3m4 6 6-7-2-2-6 7-.5 3z" />
    <path d="M4 7H2m2 5H2m2 5H2" />
  </>,
);
export const Columns3 = frame(
  <>
    <rect x="2" y="4" width="6" height="16" rx="2" fill={soft} />
    <rect x="9" y="4" width="6" height="11" rx="2" />
    <rect x="16" y="4" width="6" height="14" rx="2" fill={soft} />
  </>,
);
export const ListTodo = frame(
  <>
    <rect x="3" y="3" width="18" height="18" rx="4" fill={soft} />
    <path d="m6 8 1 1 2-3m3 2h5m-11 6 1 1 2-3m3 2h5" />
  </>,
);
export const Plus = frame(<path d="M12 5v14M5 12h14" />);
export const ArrowUpRight = frame(<path d="M6 18 18 6M7 6h11v11" />);
export const ArrowRight = frame(<path d="M4 12h16m-6-6 6 6-6 6" />);
export const Check = frame(<path d="m5 12 4 4L19 6" />);
export const Clock = frame(
  <>
    <circle cx="12" cy="12" r="9" fill={soft} />
    <path d="M12 6v6l4 2" />
  </>,
);
export const Flag = frame(
  <>
    <path d="M5 22V3m0 1c6-4 9 4 15 0v10c-6 4-9-4-15 0" fill={soft} />
    <path d="M5 22v-8" />
  </>,
);
export const Upload = frame(
  <>
    <path d="M3 16v4h18v-4" />
    <path d="M12 16V3m-5 5 5-5 5 5" />
  </>,
);
export const Download = frame(
  <>
    <path d="M3 17v4h18v-4" />
    <path d="M12 3v13m-5-5 5 5 5-5" />
  </>,
);
export const Search = frame(
  <>
    <circle cx="10" cy="10" r="6" fill={soft} />
    <path d="m15 15 6 6" />
  </>,
);
export const RefreshCw = frame(
  <>
    <path d="M20 5v5h-5M4 19v-5h5" />
    <path d="M19 9a7 7 0 0 0-12-4L4 8m1 7a7 7 0 0 0 12 4l3-3" />
  </>,
);
export const LogOut = frame(
  <>
    <path d="M10 4H4v16h6m1-8h10m-4-4 4 4-4 4" />
  </>,
);
export const Menu = frame(<path d="M4 6h16M4 12h16M4 18h16" />);
export const X = frame(<path d="m6 6 12 12M18 6 6 18" />);
export const CheckCircle2 = frame(
  <>
    <circle cx="12" cy="12" r="9" fill={soft} />
    <path d="m7 12 3 3 7-7" />
  </>,
);
export const AlertCircle = frame(
  <>
    <path
      d="M10 4a2.3 2.3 0 0 1 4 0l7 13a2.3 2.3 0 0 1-2 3H5a2.3 2.3 0 0 1-2-3z"
      fill={soft}
    />
    <path d="M12 8v5m0 3v.2" />
  </>,
);
export const FileText = frame(
  <>
    <path d="M5 3h10l5 5v13H5z" fill={soft} />
    <path d="M15 3v5h5M9 12h7m-7 4h6" />
  </>,
);
export const CalendarDays = frame(
  <>
    <rect x="3" y="5" width="18" height="16" rx="3" fill={soft} />
    <path d="M3 10h18M8 3v4m8-4v4m-9 7h2m4 0h2m-8 4h2" />
  </>,
);
export const MessageSquare = frame(
  <>
    <path d="M3 4h18v14H9l-6 4z" fill={soft} />
    <path d="M7 9h10m-10 4h7" />
  </>,
);
export const ChevronDown = frame(<path d="m6 9 6 6 6-6" />);
export const Quote = frame(
  <>
    <path
      d="M4 6h6v7c0 3-2 5-5 5v-2c2 0 3-1 3-3H4zm10 0h6v7c0 3-2 5-5 5v-2c2 0 3-1 3-3h-4z"
      fill={soft}
    />
  </>,
);
export const Mic = frame(
  <>
    <rect x="8" y="2" width="8" height="13" rx="4" fill={soft} />
    <path d="M5 11v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" />
  </>,
);
export const Square = frame(
  <rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" />,
);
export const Headphones = frame(
  <>
    <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="12" width="5" height="8" rx="2" fill={soft} />
    <rect x="16" y="12" width="5" height="8" rx="2" fill={soft} />
  </>,
);
export const Folder = frame(
  <>
    <path d="M3 6h7l2 3h9v11H3z" fill={soft} />
    <path d="M3 6V4h7l2 2h9v3" />
    <path d="m10 14 2 2 4-4" />
  </>,
);
export const Users = frame(
  <>
    <circle cx="9" cy="7" r="3" fill={soft} />
    <path d="M3 20v-3a6 6 0 0 1 12 0v3z" fill={soft} />
    <path d="M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" />
  </>,
);
export const Building = frame(
  <>
    <rect x="4" y="3" width="16" height="18" rx="2" fill={soft} />
    <path d="M8 7h2m4 0h2m-8 4h2m4 0h2m-6 10v-6h4v6" />
  </>,
);
export const Save = frame(
  <>
    <path d="M4 3h13l4 4v14H3V3z" fill={soft} />
    <path d="M7 3v6h10V3M7 21v-7h10v7" />
    <path d="M14 5v2" />
  </>,
);
export const Filter = frame(
  <>
    <path d="M3 4h18l-7 8v7l-4 2v-9z" fill={soft} />
  </>,
);
export const FilePdf = frame(
  <>
    <path d="M4 3h10l6 6v12H4z" fill={soft} />
    <path d="M14 3v6h6M7 14h10m-10 4h6" />
    <path d="m7 10 1-3 1 3" />
  </>,
);
export const FileCsv = frame(
  <>
    <rect x="3" y="3" width="18" height="18" rx="3" fill={soft} />
    <path d="M3 9h18M3 15h18M9 3v18m6-18v18" />
  </>,
);
export const Layers = frame(
  <>
    <path d="m3 8 9-5 9 5-9 5z" fill={soft} />
    <path d="m3 13 9 5 9-5M3 18l9 5 9-5" />
  </>,
);
export const Shield = frame(
  <>
    <path d="m12 2 8 4v7c0 5-8 9-8 9s-8-4-8-9V6z" fill={soft} />
    <path d="m8 12 3 3 5-6" />
  </>,
);
export const Link = frame(
  <>
    <path d="m9 7 3-3a5 5 0 0 1 7 7l-3 3m-1 3-3 3a5 5 0 0 1-7-7l3-3" />
    <path d="m8 16 8-8" />
  </>,
);
export const Copy = frame(
  <>
    <rect x="8" y="8" width="13" height="13" rx="2" fill={soft} />
    <path d="M16 8V3H3v13h5" />
  </>,
);
export const Mail = frame(
  <>
    <rect x="3" y="5" width="18" height="14" rx="3" fill={soft} />
    <path d="m4 7 8 6 8-6" />
  </>,
);
export const Edit = frame(
  <>
    <path d="m4 16 11-11 4 4-11 11-5 1z" fill={soft} />
    <path d="m13 7 4 4m-2-6 2-2 4 4-2 2" />
  </>,
);
export const Trash = frame(
  <>
    <path d="M5 7h14l-1 14H6z" fill={soft} />
    <path d="M3 7h18M9 7V3h6v4m-5 4v6m4-6v6" />
  </>,
);
export const Briefcase = frame(
  <>
    <rect x="3" y="7" width="18" height="14" rx="3" fill={soft} />
    <path d="M8 7V3h8v4M3 12l9 3 9-3m-9 1v4" />
  </>,
);

export const Video = frame(
  <>
    <rect x="3" y="6" width="12" height="12" rx="3" fill={soft} />
    <path d="m15 10 6-3v10l-6-3M7 10h4M7 14h2" />
  </>,
);

export const Bell = frame(
  <>
    <path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z" fill={soft} />
    <path d="M10 21h4M12 2v2" />
  </>,
);
export const History = frame(
  <>
    <circle cx="12" cy="12" r="9" fill={soft} />
    <path d="M12 7v5l4 2M3 3v5h5" />
  </>,
);
