import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import { FileLink } from "@/components/FileLink";
import { formatDate, formatDateTime } from "@/lib/format";
import type { PublicSession, SessionFile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Homework, newest first, with how long is left to do it. */
export default async function HomeworkPage() {
  const profile = await requireRole("student");
  const supabase = await createClient();

  const [{ data }, { data: files }] = await Promise.all([
    supabase
      .from("sessions_public")
      .select("*")
      .eq("student_id", profile.id)
      .order("scheduled_at", { ascending: false }),
    supabase
      .from("session_files")
      .select("*")
      .order("uploaded_at", { ascending: false }),
  ]);

  const tutorFiles = ((files as SessionFile[]) ?? []).filter((f) => f.from_tutor);

  // A lesson belongs here if there is homework written, files attached, or both.
  const lessons = ((data as PublicSession[]) ?? []).filter(
    (s) => s.homework || tutorFiles.some((f) => f.session_id === s.id),
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
      {lessons.length === 0 ? (
        <Card title="Kodutöö">
          <Empty>Kodutöid pole veel antud.</Empty>
        </Card>
      ) : (
        lessons.map((session) => {
          const due = session.homework_due;
          const overdue = due ? due < today : false;
          const dueToday = due === today;
          const attached = tutorFiles.filter((f) => f.session_id === session.id);

          return (
            <Card key={session.id} title={formatDateTime(session.scheduled_at) + " tunnist"}>
              <div className="space-y-3">
                {due && (
                  <p
                    className={
                      "inline-block rounded-lg px-3 py-1.5 text-sm font-medium " +
                      (overdue
                        ? "bg-red-50 text-red-700"
                        : dueToday
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-100 text-slate-700")
                    }
                  >
                    {overdue ? "Tähtaeg möödas: " : dueToday ? "Tähtaeg täna: " : "Tähtaeg: "}
                    {formatDate(due)}
                  </p>
                )}

                {session.homework && (
                  <p className="whitespace-pre-line text-sm">{session.homework}</p>
                )}

                {attached.length > 0 && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Õpetaja lisatud failid
                    </p>
                    <ul className="mt-1 space-y-1">
                      {attached.map((file) => (
                        <li key={file.id}>
                          <FileLink path={file.file_path} label={file.original_name} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {session.summary && (
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tunnis tegime
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                      {session.summary}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          );
        })
      )}
    </main>
  );
}
