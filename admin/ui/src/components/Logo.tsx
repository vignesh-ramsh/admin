export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-label="ARC">
      <rect width="40" height="40" rx="9" fill="var(--accent)" />
      <path
        d="M12 28 L20 12 L28 28"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M15.5 22 H24.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
