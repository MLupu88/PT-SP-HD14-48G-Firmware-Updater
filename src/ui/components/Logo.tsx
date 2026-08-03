interface LogoProps {
  readonly size?: number;
  readonly className?: string;
}

/**
 * Original mark: one signal entering a hub, four signals fanning out —
 * a geometric nod to the device's HDMI distribution without copying any
 * manufacturer's branding. Uses currentColor so it can be recolored and
 * themed from CSS; see public/logo.svg for the fixed-color favicon variant.
 */
export function Logo({ size, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      className={className}
      role="img"
      aria-label="Firmware Updater"
    >
      <circle cx="6" cy="20" r="3" fill="currentColor" />
      <line x1="10" y1="20" x2="15" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="15" y="8" width="9" height="24" rx="4" fill="currentColor" />
      <line x1="24" y1="11" x2="36" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="17" x2="36" y2="15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="23" x2="36" y2="25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="29" x2="36" y2="35" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="36" cy="5" r="2.2" fill="currentColor" />
      <circle cx="36" cy="15" r="2.2" fill="currentColor" />
      <circle cx="36" cy="25" r="2.2" fill="currentColor" />
      <circle cx="36" cy="35" r="2.2" fill="currentColor" />
    </svg>
  );
}
