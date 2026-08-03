interface LogoProps {
  /** Fixed pixel width for small, non-responsive placements (header, result icon). Height follows automatically. */
  readonly width?: number;
  /** For responsive placements (the Connect stage hero), size via a CSS class instead of `width`. */
  readonly className?: string;
}

/**
 * Application logo: the bearded, HDMI-cable-bearded mark trimmed from the
 * original generated artwork (docs/branding/bald-bearded-hdmi-logo-source.png)
 * into public/logo-mark.png, the transparent asset actually used here.
 * Adjacent text always carries the accessible name (the page title, or
 * nothing critical for the small header/result placements), so this image
 * is decorative (`alt=""`).
 */
export function Logo({ width, className }: LogoProps) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      width={width}
      className={["logo-img", className].filter(Boolean).join(" ")}
    />
  );
}
