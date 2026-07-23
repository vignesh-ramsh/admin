/* Phosphor icons (loaded via CDN in index.html, matching AgniUI's own
   convention) — same export names/signatures as the old hand-rolled inline
   SVGs, so no call site needed touching. */
type P = { size?: number };

function Ph({ name, size }: { name: string; size: number }) {
  return <i className={`ph ph-${name}`} style={{ fontSize: size, lineHeight: 1 }} />;
}

export const IconHealth = ({ size = 18 }: P) => <Ph name="heartbeat" size={size} />;
export const IconData = ({ size = 18 }: P) => <Ph name="database" size={size} />;
export const IconUsers = ({ size = 18 }: P) => <Ph name="users" size={size} />;
export const IconRoles = ({ size = 18 }: P) => <Ph name="shield-check" size={size} />;
export const IconSessions = ({ size = 18 }: P) => <Ph name="desktop" size={size} />;
export const IconKeys = ({ size = 18 }: P) => <Ph name="key" size={size} />;
export const IconSchema = ({ size = 18 }: P) => <Ph name="squares-four" size={size} />;
export const IconLogout = ({ size = 18 }: P) => <Ph name="sign-out" size={size} />;
export const IconRefresh = ({ size = 16 }: P) => <Ph name="arrow-clockwise" size={size} />;
export const IconPlus = ({ size = 16 }: P) => <Ph name="plus" size={size} />;
export const IconSearch = ({ size = 16 }: P) => <Ph name="magnifying-glass" size={size} />;
export const IconChevron = ({ size = 16, direction = "right" }: P & { direction?: "left" | "right" }) => (
  <Ph name={direction === "left" ? "caret-left" : "caret-right"} size={size} />
);
export const IconSettings = ({ size = 18 }: P) => <Ph name="gear" size={size} />;
export const IconEye = ({ size = 16 }: P) => <Ph name="eye" size={size} />;
export const IconEyeOff = ({ size = 16 }: P) => <Ph name="eye-slash" size={size} />;
export const IconJobs = ({ size = 18 }: P) => <Ph name="clock" size={size} />;
export const IconFiles = ({ size = 18 }: P) => <Ph name="folder" size={size} />;
export const IconDownload = ({ size = 16 }: P) => <Ph name="download-simple" size={size} />;
export const IconFile = ({ size = 16 }: P) => <Ph name="file" size={size} />;
