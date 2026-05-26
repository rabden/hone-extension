import honeLogoUrl from "@/assets/hone-logo.svg";
import { cn } from "@/lib/utils";

interface HoneLogoProps {
  size?: number;
  className?: string;
  alt?: string;
}

export function HoneLogo({
  size = 32,
  className,
  alt = "Hone",
}: HoneLogoProps) {
  return (
    <img
      src={honeLogoUrl}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      draggable={false}
    />
  );
}
