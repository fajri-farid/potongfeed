import Link from "next/link";
import type { ReactNode } from "react";
import { PotongFeedLogo } from "@/components/PotongFeedLogo";
import { APP_NAME } from "@/lib/constants";

interface AppHeaderProps {
  children: ReactNode;
  context?: ReactNode;
  subnav?: ReactNode;
}

/** Identitas dan navbar bersama untuk beranda dan ruang kerja editor. */
export function AppHeader({ children, context, subnav }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="app-header-identity">
          <Link href="/" className="app-brand" aria-label={`${APP_NAME}, halaman utama`}>
            <PotongFeedLogo className="app-brand-logo" />
            <span>{APP_NAME}</span>
          </Link>
          {context}
        </div>
        <div className="app-header-actions">{children}</div>
      </div>
      {subnav}
    </header>
  );
}
