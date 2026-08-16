"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";

/**
 * Hamburger list of students. On a phone it is the only practical way to move
 * between them; on a wide screen it behaves the same, so there is one thing to
 * learn rather than two.
 */
export default function StudentMenu({
  students,
  pendingCount,
}: {
  students: Profile[];
  pendingCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const link = (href: string, label: string, badge?: number) => {
    const active = pathname === href;
    return (
      <Link
        key={href}
        href={href}
        onClick={() => setOpen(false)}
        className={
          "flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm " +
          (active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100")
        }
      >
        <span className="truncate">{label}</span>
        {badge ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ava õpilaste menüü"
        className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-50"
      >
        <span aria-hidden className="flex flex-col gap-[3px]">
          <span className="block h-0.5 w-4 bg-slate-900" />
          <span className="block h-0.5 w-4 bg-slate-900" />
          <span className="block h-0.5 w-4 bg-slate-900" />
        </span>
        Õpilased
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            {pendingCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex">
          <button
            aria-label="Sulge menüü"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <nav className="relative flex h-full w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Vaated</span>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Sulge
              </button>
            </div>

            {link("/admin", "Ülevaade", pendingCount)}

            <p className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Õpilased
            </p>
            {students.length === 0 ? (
              <p className="px-3 text-sm text-slate-500">Ühtegi õpilast veel.</p>
            ) : (
              students.map((student) =>
                link(`/admin/opilane/${student.id}`, student.full_name),
              )
            )}
          </nav>
        </div>
      )}
    </>
  );
}
