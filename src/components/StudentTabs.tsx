"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Ülevaade" },
  { href: "/dashboard/kodutoo", label: "Kodutöö" },
  { href: "/dashboard/materjalid", label: "Materjalid" },
  { href: "/dashboard/kysimused", label: "Küsimused" },
];

/** Scrolls sideways on a phone rather than wrapping into two rows. */
export default function StudentTabs() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                "shrink-0 border-b-2 px-3 py-3 text-sm font-medium " +
                (active
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
