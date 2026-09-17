/**
 * Brand mark.
 *
 * The logo supplied with the project (a rounded card with the Rachana wordmark
 * and gradient glyph). Rendered inline so it can pick up the current colour
 * scheme and be sized by the caller.
 */

import logoUrl from "@/assets/logo.svg";
import iconUrl from "@/assets/icon.svg";

export function WelcomeLogo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="Rachana Designer" className={className} draggable={false} />;
}

export function BrandIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <img
      src={iconUrl}
      alt=""
      width={size}
      height={size}
      className={className}
      draggable={false}
      aria-hidden="true"
    />
  );
}
