import Image from "next/image";

interface PotongFeedLogoProps {
  className?: string;
}

/** Satu sumber SVG untuk logo navbar, favicon, dan ikon aplikasi. */
export function PotongFeedLogo({ className = "h-9 w-9" }: PotongFeedLogoProps) {
  return (
    <Image
      src="/icons/icon.svg"
      alt=""
      aria-hidden="true"
      width={36}
      height={36}
      unoptimized
      className={className}
    />
  );
}
