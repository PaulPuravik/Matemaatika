import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Profile, PublicSession, Test } from "@/lib/types";

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
    .eq("status", "upcoming")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const nextSession = (sessions?.[0] as PublicSession) ?? null;

  const { data: tests } = await supabase
    .from("tests")
    .select("*")
    .eq("student_id", profile.parent_of)
    .gte("test_date", new Date().toISOString().slice(0, 10))
    .order("test_date", { ascending: true });

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

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
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

        <Card title="Mida soovib harjutada">
          {focusText ? (
            <p className="whitespace-pre-line text-sm">{focusText}</p>
          ) : (
            <Empty>Pole veel kirjutatud.</Empty>
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
