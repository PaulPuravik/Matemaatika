import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { LessonHistory } from "@/components/LessonHistory";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Grade, Profile, PublicSession, Test } from "@/lib/types";

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

  const nextSession =
    [...allSessions]
      .reverse()
      .find(
        (s) => s.status === "upcoming" && new Date(s.scheduled_at).getTime() >= now,
      ) ?? null;

  const pastLessons = allSessions.filter(
    (s) => s.status === "done" || new Date(s.scheduled_at).getTime() < now,
  );
  const withHomework = pastLessons.find((s) => s.homework) ?? null;
  const currentHomework = withHomework?.homework ?? null;
  const currentHomeworkDue = withHomework?.homework_due ?? null;

  const { data: tests } = await supabase
    .from("tests")
    .select("*")
    .eq("student_id", profile.parent_of)
    .gte("test_date", new Date().toISOString().slice(0, 10))
    .order("test_date", { ascending: true });

  const { data: grades } = await supabase
    .from("grades")
    .select("*")
    .eq("student_id", profile.parent_of)
    .order("received_on", { ascending: false });

  let focusText: string | null = null;
  if (nextSession) {
    const { data: focus } = await supabase
      .from("session_focus")
      .select("focus_text")
      .eq("session_id", nextSession.id)
      .maybeSingle();
    focusText = focus?.focus_text ?? null;
  }

  return (
    <>
      <PageHeader profile={profile} />

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
        <Card title={(child as Profile | null)?.full_name ?? "Õpilane"}>
          <Empty>Ülevaade. Muudatusi saab teha õpilane ise.</Empty>
        </Card>

        <Card title="Järgmine tund">
          {nextSession ? (
            <p className="text-lg font-medium">
              {formatDateTime(nextSession.scheduled_at)}
            </p>
          ) : (
            <Empty>Järgmist tundi pole veel planeeritud.</Empty>
          )}
        </Card>

        {currentHomework && (
          <Card title="Kodutöö">
            <p className="whitespace-pre-line text-sm">{currentHomework}</p>
            {currentHomeworkDue && (
              <p className="mt-2 text-sm text-slate-500">
                Tähtaeg: {formatDate(currentHomeworkDue)}
              </p>
            )}
          </Card>
        )}

        <Card title="Mida soovib harjutada">
          {focusText ? (
            <p className="whitespace-pre-line text-sm">{focusText}</p>
          ) : (
            <Empty>Pole veel kirjutatud.</Empty>
          )}
        </Card>

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
