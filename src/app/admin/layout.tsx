import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { APP_NAME } from "@/lib/branding";
import StudentMenu from "@/components/StudentMenu";
import Link from "next/link";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const { data } = await supabase.from("profiles").select("*").order("full_name");
  const everyone = (data as Profile[]) ?? [];
  const students = everyone.filter((p) => p.role === "student" && p.approved);
  const pending = everyone.filter((p) => !p.approved && p.role !== "admin").length;

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <StudentMenu students={students} pendingCount={pending} />
            <Link href="/admin" className="hidden truncate font-semibold sm:block">
              {APP_NAME}
            </Link>
          </div>
          <form action={signOut} className="shrink-0">
            <button className="text-sm text-slate-600 underline hover:text-slate-900">
              Logi välja
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
