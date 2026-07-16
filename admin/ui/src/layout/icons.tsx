/* Minimal inline stroke icons (Lucide-style geometry), no icon dependency. */
type P = { size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconHealth = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
export const IconData = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </svg>
);
export const IconUsers = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
export const IconRoles = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </svg>
);
export const IconSessions = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
export const IconKeys = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
  </svg>
);
export const IconSchema = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);
export const IconLogout = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </svg>
);
export const IconRefresh = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
  </svg>
);
export const IconPlus = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSearch = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
export const IconChevron = ({ size = 16, direction = "right" }: P & { direction?: "left" | "right" }) => (
  <svg {...base(size)}>
    <path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>
);
export const IconSettings = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
export const IconEye = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IconEyeOff = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M6.61 6.61A18.5 18.5 0 0 0 2 12s3.5 8 10 8a10.94 10.94 0 0 0 5.39-1.61M2 2l20 20" />
  </svg>
);
export const IconJobs = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9 2h6" />
  </svg>
);
