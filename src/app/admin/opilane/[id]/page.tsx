import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCalendarConfigured } from "@/lib/google-calendar";
import { Card, Empty } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  deleteAccount,
  deleteSession,
  setCalendarAlias,
  unlinkParent,
} from "@/app/actions/admin";
import SessionForm from "../../SessionForm";
import MaterialUploader from "../../MaterialUploader";
import QuestionThread from "@/components/QuestionThread";
import type {
  Grade,
  Material,
  Profile,
  Question,
  QuestionReply,
  SessionFile,
  SessionFocus,
  Test,
  TutorSession,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** Everything about one student, on its own page. */
export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!student) notFound();
  const s = student as Profile;

  const [
    { data: sessions },
    { data: focus },
    { data: files },
    { data: tests },
    { data: grades },
    { data: materials },
    { data: questions },
    { data: replies },
    { data: parents },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("student_id", id).order("scheduled_at", { ascending: false }),
    supabase.from("session_focus").select("*").eq("student_id", id),
    supabase.from("session_files").select("*").eq("student_id", id).order("uploaded_at", { ascending: false }),
    supabase.from("tests").select("*").eq("student_id", id).order("test_date"),
    supabase.from("grades").select("*").eq("student_id", id).order("received_on", { ascending: false }),
    supabase.from("materials").select("*, material_recipients(student_id)").order("created_at", { ascending: false }),
    supabase.from("questions").select("*").eq("student_id", id).order("created_at", { ascending: false }),
    supabase.from("question_replies").select("*").order("created_at"),
    supabase.from("profiles").select("*").eq("parent_of", id),
  ]);

  const mySessions = (sessions as TutorSession[]) ?? [];
  const myFiles = (files as SessionFile[]) ?? [];
  const myQuestions = (questions as Question[]) ?? [];
  const allReplies = (replies as QuestionReply[]) ?? [];
  const parent = ((parents as Profile[]) ?? [])[0] ?? null;
  const now = Date.now();

  const nextSession = [...mySessions]
    .reverse()
    .find((x) => x.status === "upcoming" && new Date(x.scheduled_at).getTime() >= now);

  const myMaterials = ((materials as (Material & {
    material_recipients: { student_id: string }[];
  })[]) ?? []).filter(
    (m) => m.audience === "all" || m.material_recipients?.some((r) => r.student_id === id),
  );

  const email = await studentEmail(id);
  const unanswered = myQuestions.filter((q) => !q.answered_at).length;

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold">{s.full_name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {[s.grade, s.school, s.textbook, email, parent ? `vanem: ${parent.full_name}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {unanswered > 0 && (
        <Card title={`Vastamata küsimusi: ${unanswered}`}>
          <Empty>Allpool küsimuste all.</Empty>
        </Card>
      )}

      <Card title="Järgmine tund">
        {nextSession ? (
          <p className="text-lg font-medium">{formatDateTime(nextSession.scheduled_at)}</p>
        ) : (
          <Empty>Planeerimata.</Empty>
        )}
      </Card>

      <Card title="Küsimused">
        {myQuestions.length === 0 ? (
          <Empty>Küsimusi pole.</Empty>
        ) : (
          <div className="space-y-5">
            {myQuestions.map((question) => (
              <QuestionThread
                key={question.id}
                question={question}
                replies={allReplies.filter((r) => r.question_id === question.id)}
                file={myFiles.find((f) => f.id === question.file_id) ?? null}
                material={myMaterials.find((m) => m.id === question.material_id) ?? null}
                asTutor
              />
            ))}
          </div>
        )}
      </Card>

      <Card title="Tema jagatud failid">
        {myFiles.length === 0 ? (
          <Empty>Faile pole.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {myFiles.map((file) => (
              <li key={file.id} className="py-2">
                <SignedLink path={file.file_path} bucket="student-files" label={file.original_name} />
                <span className="text-sm text-slate-500"> — {formatDateTime(file.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Kodutööd ja tunnid">
        {mySessions.length === 0 ? (
          <Empty>Tunde pole.</Empty>
        ) : (
          <ul className="space-y-3">
            {mySessions.map((session) => (
              <li key={session.id} className="rounded-lg border border-slate-200 p-3">
                <SessionForm session={session} />
                <form action={deleteSession} className="mt-2">
                  <input type="hidden" name="id" value={session.id} />
                  <button className="text-sm text-slate-500 underline hover:text-red-600">
                    Kustuta tund
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Hinded">
        {grades && grades.length > 0 ? (
          <ul className="text-sm">
            {(grades as Grade[]).map((grade) => (
              <li key={grade.id}>
                {formatDate(grade.received_on)} — {grade.subject}: <strong>{grade.mark}</strong>
                {grade.notes && <span className="text-slate-500"> ({grade.notes})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Hindeid pole.</Empty>
        )}
      </Card>

      <Card title="Tulevased kontrolltööd">
        {tests && tests.length > 0 ? (
          <ul className="text-sm">
            {(tests as Test[]).map((test) => (
              <li key={test.id}>
                {formatDate(test.test_date)} — {test.subject}
                {test.notes && <span className="text-slate-500"> ({test.notes})</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Pole lisatud.</Empty>
        )}
      </Card>

      <Card title="Mida soovib harjutada">
        {nextSession && (focus as SessionFocus[])?.some((f) => f.session_id === nextSession.id) ? (
          <p className="whitespace-pre-line text-sm">
            {(focus as SessionFocus[]).find((f) => f.session_id === nextSession.id)?.focus_text}
          </p>
        ) : (
          <Empty>Pole veel kirjutanud.</Empty>
        )}
      </Card>

      <Card title="Jaga fail ainult temaga">
        <MaterialUploader studentId={id} />
      </Card>

      {isCalendarConfigured() && (
        <Card title="Nimi kalendris">
          <form action={setCalendarAlias} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={id} />
            <input
              name="calendar_alias"
              defaultValue={s.calendar_alias ?? ""}
              placeholder={s.full_name.split(" ")[0]}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base shadow-sm sm:text-sm"
            />
            <button className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">
              Salvesta
            </button>
          </form>
        </Card>
      )}

      <Card title="Konto">
        <div className="flex flex-wrap items-center gap-4">
          {parent && (
            <form action={unlinkParent}>
              <input type="hidden" name="id" value={parent.id} />
              <button className="text-sm text-slate-500 underline hover:text-red-600">
                Eemalda vanem {parent.full_name}
              </button>
            </form>
          )}
          <form action={deleteAccount}>
            <input type="hidden" name="id" value={id} />
            <button className="text-sm text-slate-500 underline hover:text-red-600">
              Kustuta õpilase konto
            </button>
          </form>
        </div>
      </Card>
    </main>
  );
}

async function SignedLink({
  path,
  bucket,
  label,
}: {
  path: string;
  bucket: string;
  label: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  return (
    <a
      href={data?.signedUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="break-words text-sm underline"
    >
      {label}
    </a>
  );
}

async function studentEmail(id: string): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(id);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
