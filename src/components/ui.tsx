import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import type { Profile } from "@/lib/types";

export function Card({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

export function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base sm:text-sm shadow-sm " +
  "focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

export const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 " +
  "text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>
  );
}

export function PageHeader({ profile }: { profile: Profile }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
        <div>
          <Link href="/" className="text-lg font-semibold">
            Matemaatika
          </Link>
          <p className="truncate text-sm text-slate-500">{profile.full_name}</p>
        </div>
        <form action={signOut} className="shrink-0">
          <button className="text-sm text-slate-600 underline hover:text-slate-900">
            Logi välja
          </button>
        </form>
      </div>
    </header>
  );
}
