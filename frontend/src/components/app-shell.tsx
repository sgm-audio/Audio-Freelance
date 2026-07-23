"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { FirstBootDetector } from "@/app/first-boot";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === "/outreach" || pathname.startsWith("/outreach/");

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <FirstBootDetector />
        {children}
      </main>
    </>
  );
}

function Sidebar() {
  return (
    <nav className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col h-dvh sticky top-0">
      <div className="p-4 pb-0">
        <Link href="/" prefetch={true} className="text-sm font-semibold tracking-tight flex items-center gap-2">
          <span className="text-lg">◆</span> aquire
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-1 text-sm">
        <NavItem href="/" label="Dashboard" />
        <NavItem href="/outreach" label="SGM Outreach" />
        <NavItem href="/leads" label="Leads" />
        <NavItem href="/cold-leads" label="Cold Leads" />
        <NavItem href="/tracking" label="Tracking" />
        <NavItem href="/market" label="Market" />
        <NavItem href="/opportunities" label="Opportunities" />
        <div className="pt-4 mt-4 border-t border-border">
          <p className="text-xs text-muted-foreground px-3 pb-1">System</p>
          <NavItem href="/preferences" label="Preferences" />
          <NavItem href="/api/v1/health" label="API Health" external />
          <NavItem href="/api/v1/debug" label="Diagnostics" external />
          <NavItem href="/briefing" label="Daily Briefing" external />
        </div>
      </div>
      <div className="p-4 border-t border-border">
        <ThemeToggle />
      </div>
    </nav>
  );
}

function NavItem({ href, label, external }: { href: string; label: string; external?: boolean }) {
  const cls =
    "flex items-center rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";
  if (external) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener">
        {label}
        <span className="ml-auto text-xs opacity-50">↗</span>
      </a>
    );
  }
  return (
    <Link href={href} prefetch={true} className={cls}>
      {label}
    </Link>
  );
}
