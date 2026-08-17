import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { FileLink } from "@/components/FileLink";
import { LessonHistory } from "@/components/LessonHistory";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  Grade,
  Profile,
  PublicSession,
  SessionFile,
  SessionFocus,
  Test,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** Read-only view of the linked child. Every query here is a plain select. */
export default async function ParentPage() {
  const profile = await requireRole("parent");
  const supabase = await createClient();

  if (!profile.parent_of) {
    return (
      <>
        <PageHeader profile={profile} />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <Card>
            <Empty>
              Sinu kontoga pole veel õpilast seotud. Palun võta õpetajaga ühendust.
            </Empty>
          </Card>
        </main>
      </>
    );
  }

  const { data: child } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", profile.parent_of)
    .single();

  const { data: sessions } = await supabase
    .from("sessions_public")
    .select("*")
    .eq("student_id", profile.parent_of)
    .order("scheduled_at", { ascending: false });

  const allSessions = (sessions as PublicSession[]) ?? [];
  const now = Date.now();

  const upcoming = allSessions
    .filter((s) => s.status === "upcoming" && new Date(s.scheduled_at).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  const pastLessons = allSessions.filter(
    (s) => s.status === "done" || new Date(s.scheduled_at).getTime() < now,
  );

  const [{ data: tests }, { data: grades }, { data: focusRows }, { data: files }] =
    await Promise.all([
      supabase
        .from("tests")
        .select("*")
        .eq("student_id", profile.parent_of)
        .gte("test_date", new Date().toISOString().slice(0, 10))
        .order("test_date", { ascending: true }),
      supabase
        .from("grades")
        .select("*")
        .eq("student_id", profile.parent_of)
        .order("received_on", { ascending: false }),
      supabase.from("session_focus").select("*").eq("student_id", profile.parent_of),
      supabase
        .from("session_files")
        .select("*")
        .eq("student_id", profile.parent_of)
        .order("uploaded_at", { ascending: false }),
    ]);

  const focus = (focusRows as SessionFocus[]) ?? [];
  const tutorFiles = ((files as SessionFile[]) ?? []).filter((f) => f.from_tutor);

  const withHomework = pastLessons.find(
    (s) => s.homework || tutorFiles.some((f) => f.session_id === s.id),
  );
  const homeworkFiles = withHomework
    ? tutorFiles.filter((f) => f.session_id === withHomework.id)
    : [];

  return (
    <>
      <PageHeader profile={profile} />

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
        <Card title={(child as Profile | null)?.full_name ?? "Õpilane"}>
          <Empty>Ülevaade. Muudatusi saab teha õpilane ise.</Empty>
        </Card>

        <Card title={upcoming.length > 1 ? "Planeeritud tunnid" : "Järgmine tund"}>
          {upcoming.length === 0 ? (
            <Empty>Järgmist tundi pole veel planeeritud.</Empty>
          ) : (
            <ul className="space-y-4">
              {upcoming.map((session) => {
                const text =
                  focus.find((f) => f.session_id === session.id)?.focus_text ?? null;

                return (
                  <li
                    key={session.id}
                    className="border-t border-slate-100 pt-4 first:border-0 first:pt-0"
                  >
                    <p className="text-lg font-medium">
                      {formatDateTime(session.scheduled_at)}
                    </p>
                    {text ? (
                      <>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Soovib harjutada
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">
                          {text}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">
                        Pole veel kirjutanud, mida soovib harjutada.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {withHomework && (
          <Card title="Kodutöö">
            {withHomework.homework && (
              <p className="whitespace-pre-line text-sm">{withHomework.homework}</p>
            )}
            {withHomework.homework_due && (
              <p className="mt-2 text-sm text-slate-500">
                Tähtaeg: {formatDate(withHomework.homework_due)}
              </p>
            )}
            {homeworkFiles.length > 0 && (
              <ul className="mt-3 space-y-1">
                {homeworkFiles.map((file) => (
                  <li key={file.id}>
                    <FileLink path={file.file_path} label={file.original_name} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card title="Toimunud tunnid">
          <LessonHistory lessons={pastLessons} />
        </Card>

        <Card title="Hinded">
          {grades && grades.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {(grades as Grade[]).map((grade) => (
                <li key={grade.id} className="flex items-start gap-3 py-2">
                  <span className="min-w-8 rounded-md bg-slate-100 px-2 py-1 text-center text-sm font-semibold">
                    {grade.mark}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{grade.subject}</p>
                    <p className="text-sm text-slate-500">
                      {formatDate(grade.received_on)}
                    </p>
                    {grade.notes && (
                      <p className="mt-1 text-sm text-slate-600">{grade.notes}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ühtegi hinnet pole lisatud.</Empty>
          )}
        </Card>

        <Card title="Tulevased kontrolltööd">
          {tests && tests.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {(tests as Test[]).map((test) => (
                <li key={test.id} className="py-2">
                  <p className="text-sm font-medium">{test.subject}</p>
                  <p className="text-sm text-slate-500">{formatDate(test.test_date)}</p>
                  {test.notes && (
                    <p className="mt-1 text-sm text-slate-600">{test.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Ühtegi kontrolltööd pole lisatud.</Empty>
          )}
        </Card>
      </main>
    </>
  );
}
