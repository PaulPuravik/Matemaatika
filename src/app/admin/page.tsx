import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCalendarConfigured } from "@/lib/google-calendar";
import { Card, Empty } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  approveAccount,
  deleteAccount,
  deleteMaterial,
  unlinkParent,
} from "@/app/actions/admin";
import SessionForm from "./SessionForm";
import MaterialUploader from "./MaterialUploader";
import MaterialAudience from "./MaterialAudience";
import CalendarSync from "./CalendarSync";
import type { Material, Profile, Question, TutorSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The overview. One student at a time lives under /admin/opilane/[id]. */
export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: profiles }, { data: sessions }, { data: materials }, { data: questions }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("sessions").select("*").order("scheduled_at"),
      supabase
        .from("materials")
        .select("*, material_recipients(student_id)")
        .order("created_at", { ascending: false }),
      supabase.from("questions").select("*").is("answered_at", null),
    ]);

  const everyone = (profiles as Profile[]) ?? [];
  const pending = everyone.filter((p) => !p.approved && p.role !== "admin");
  const students = everyone.filter((p) => p.role === "student" && p.approved);
  const parents = everyone.filter((p) => p.role === "parent" && p.approved);
  const emails = await accountEmails();

  const allSessions = (sessions as TutorSession[]) ?? [];
  const unanswered = (questions as Question[]) ?? [];
  const now = Date.now();

  const allMaterials =
    (materials as (Material & { material_recipients: { student_id: string }[] })[]) ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
      {pending.length > 0 && (
        <Card title={`Ootab kinnitust (${pending.length})`}>
          <ul className="divide-y divide-slate-100">
            {pending.map((account) => (
              <li
                key={account.id}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{account.full_name}</p>
                  <p className="text-sm text-slate-500">
                    {[
                      account.role === "parent" ? "lapsevanem" : "õpilane",
                      account.grade,
                      account.school,
                      emails.get(account.id),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <form action={approveAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">
                      Kinnita
                    </button>
                  </form>
                  <form action={deleteAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <button className="text-sm text-slate-500 underline hover:text-red-600">
                      Kustuta
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Õpilased">
        {students.length === 0 ? (
          <Empty>Ühtegi õpilast pole veel registreerunud.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.map((student) => {
              const next = allSessions.find(
                (s) =>
                  s.student_id === student.id &&
                  s.status === "upcoming" &&
                  new Date(s.scheduled_at).getTime() >= now,
              );
              const waiting = unanswered.filter((q) => q.student_id === student.id).length;

              return (
                <li key={student.id} className="py-3">
                  <Link
                    href={`/admin/opilane/${student.id}`}
                    className="flex items-center justify-between gap-3 hover:opacity-80"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {student.full_name}
                      </span>
                      <span className="block truncate text-sm text-slate-500">
                        {next ? formatDateTime(next.scheduled_at) : "Tund planeerimata"}
                      </span>
                    </span>
                    {waiting > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        {waiting} küsimust
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {isCalendarConfigured() && (
        <Card title="Google Kalender">
          <CalendarSync />
        </Card>
      )}

      <Card title="Uus tund">
        <SessionForm students={students} />
      </Card>

      <Card title="Materjalid">
        <div className="space-y-5">
          <MaterialUploader students={students} />
          {allMaterials.length === 0 ? (
            <Empty>Materjale pole lisatud.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {allMaterials.map((material) => (
                <li key={material.id} className="space-y-2 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{material.title}</p>
                      <p className="text-sm text-slate-500">
                        {[material.grade, material.topic].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <form action={deleteMaterial}>
                      <input type="hidden" name="id" value={material.id} />
                      <input type="hidden" name="path" value={material.file_path} />
                      <button className="shrink-0 text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta
                      </button>
                    </form>
                  </div>
                  <MaterialAudience
                    materialId={material.id}
                    students={students}
                    selected={(material.material_recipients ?? []).map((r) => r.student_id)}
                    audience={material.audience}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {parents.length > 0 && (
        <Card title="Lapsevanemad">
          <ul className="divide-y divide-slate-100">
            {parents.map((parent) => {
              const child = students.find((st) => st.id === parent.parent_of);
              return (
                <li
                  key={parent.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{parent.full_name}</p>
                    <p className="text-sm text-slate-500">
                      {[emails.get(parent.id), child ? `laps: ${child.full_name}` : "pole seotud"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {parent.parent_of && (
                      <form action={unlinkParent}>
                        <input type="hidden" name="id" value={parent.id} />
                        <button className="text-sm text-slate-500 underline hover:text-red-600">
                          Eemalda seos
                        </button>
                      </form>
                    )}
                    <form action={deleteAccount}>
                      <input type="hidden" name="id" value={parent.id} />
                      <button className="text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta konto
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </main>
  );
}

/** Addresses live in auth.users, which only the service role can read. */
async function accountEmails(): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return emails;

  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email) emails.set(user.id, user.email);
    }
  } catch (error) {
    console.error("Could not load account emails:", error);
  }
  return emails;
}
