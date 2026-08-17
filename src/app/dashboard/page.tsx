import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import { FileLink } from "@/components/FileLink";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  cancelParentInvite,
  deleteFile,
  deleteGrade,
  deleteTest,
  revokeParentAccess,
} from "@/app/actions/student";
import type {
  Grade,
  ParentInvite,
  Profile,
  PublicSession,
  SessionFile,
  SessionFocus,
  Test,
} from "@/lib/types";
import FocusForm from "./FocusForm";
import TestForm from "./TestForm";
import Uploader from "./Uploader";
import ParentAccess from "./ParentAccess";
import GradeForm from "./GradeForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireRole("student");
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("sessions_public")
    .select("*")
    .eq("student_id", profile.id)
    .order("scheduled_at", { ascending: false });

  const allSessions = (sessions as PublicSession[]) ?? [];
  const now = Date.now();

  // Every lesson still ahead, soonest first — the student prepares for all of
  // them, not only the next one.
  const upcoming = allSessions
    .filter((s) => s.status === "upcoming" && new Date(s.scheduled_at).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );

  const [
    { data: tests },
    { data: grades },
    { data: parents },
    { data: invites },
    { data: allFiles },
    { data: focusRows },
  ] = await Promise.all([
    supabase
      .from("tests")
      .select("*")
      .eq("student_id", profile.id)
      .gte("test_date", new Date().toISOString().slice(0, 10))
      .order("test_date", { ascending: true }),
    supabase
      .from("grades")
      .select("*")
      .eq("student_id", profile.id)
      .order("received_on", { ascending: false }),
    supabase.from("profiles").select("*").eq("parent_of", profile.id),
    supabase
      .from("parent_invites")
      .select("*")
      .is("accepted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("session_files").select("*").order("uploaded_at", { ascending: false }),
    supabase.from("session_focus").select("*").eq("student_id", profile.id),
  ]);

  const linkedParent = ((parents as Profile[]) ?? [])[0] ?? null;
  const pendingInvite = ((invites as ParentInvite[]) ?? [])[0] ?? null;
  const focus = (focusRows as SessionFocus[]) ?? [];

  // Only what the student sent in. Homework files come the other way and live
  // under Kodutöö.
  const myUploads = ((allFiles as SessionFile[]) ?? []).filter((f) => !f.from_tutor);
  const looseFiles = myUploads.filter((f) => !f.session_id);

  return (
    <>
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
        <Card title={upcoming.length > 1 ? "Planeeritud tunnid" : "Järgmine tund"}>
          {upcoming.length === 0 ? (
            <Empty>
              Järgmist tundi pole veel planeeritud. Faile saad õpetajale saata ka
              praegu, allpool.
            </Empty>
          ) : (
            <ul className="space-y-6">
              {upcoming.map((session, index) => {
                const forThisLesson = myUploads.filter(
                  (f) => f.session_id === session.id,
                );
                const text =
                  focus.find((f) => f.session_id === session.id)?.focus_text ?? "";

                return (
                  <li
                    key={session.id}
                    className="border-t border-slate-100 pt-5 first:border-0 first:pt-0"
                  >
                    <p className="text-lg font-medium">
                      {formatDateTime(session.scheduled_at)}
                    </p>
                    {index === 0 && upcoming.length > 1 && (
                      <p className="text-sm text-slate-500">Kõige lähem tund</p>
                    )}

                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-slate-700">
                        Mida soovin harjutada
                      </p>
                      <FocusForm sessionId={session.id} initialText={text} />
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-slate-700">
                        Failid selle tunni jaoks
                      </p>
                      {index === 0 && (
                        <p className="text-sm text-slate-600">
                          Lisa pilt või PDF sellest, mida soovid läbi vaadata.
                        </p>
                      )}
                      <Uploader sessionId={session.id} studentId={profile.id} />
                      {forThisLesson.length > 0 && <FileList files={forThisLesson} />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Failid õpetajale">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Siia käib see, mis ei ole ühegi kindla tunni külge seotud — kodutöö,
              kontrolltöö parandused, ülesanded, mis ei tulnud välja.
            </p>
            <Uploader sessionId={null} studentId={profile.id} />
            <FileList files={looseFiles} />
          </div>
        </Card>

        <Card title="Tulevased kontrolltööd">
          <div className="space-y-4">
            <TestForm />
            {tests && tests.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {(tests as Test[]).map((test) => (
                  <li
                    key={test.id}
                    className="flex items-start justify-between gap-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{test.subject}</p>
                      <p className="text-sm text-slate-500">
                        {formatDate(test.test_date)}
                      </p>
                      {test.notes && (
                        <p className="mt-1 text-sm text-slate-600">{test.notes}</p>
                      )}
                    </div>
                    <form action={deleteTest}>
                      <input type="hidden" name="id" value={test.id} />
                      <button className="text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Ühtegi kontrolltööd pole lisatud.</Empty>
            )}
          </div>
        </Card>


        <Card title="Minu hinded">
          <div className="space-y-4">
            <GradeForm />
            {grades && grades.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {(grades as Grade[]).map((grade) => (
                  <li
                    key={grade.id}
                    className="flex items-start justify-between gap-4 py-2"
                  >
                    <div className="flex items-start gap-3">
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
                    </div>
                    <form action={deleteGrade}>
                      <input type="hidden" name="id" value={grade.id} />
                      <button className="text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Ühtegi hinnet pole veel lisatud.</Empty>
            )}
          </div>
        </Card>

        <Card title="Vanema ligipääs">
          {linkedParent ? (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{linkedParent.full_name}</p>
                <p className="text-sm text-slate-500">
                  Näeb sinu järgmist tundi, kontrolltöid ja soove. Muuta ei saa.
                </p>
              </div>
              <form action={revokeParentAccess}>
                <input type="hidden" name="parent_id" value={linkedParent.id} />
                <button className="text-sm text-slate-500 underline hover:text-red-600">
                  Eemalda ligipääs
                </button>
              </form>
            </div>
          ) : pendingInvite ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Anna see kood oma vanemale. Ta loob konto lapsevanemana ja sisestab
                selle.
              </p>
              <p className="font-mono text-2xl tracking-widest">{pendingInvite.code}</p>
              <p className="text-sm text-slate-500">
                Kehtib kuni {formatDateTime(pendingInvite.expires_at)}.
                {pendingInvite.parent_email
                  ? ` Saatsime selle aadressile ${pendingInvite.parent_email}.`
                  : ""}
              </p>
              <form action={cancelParentInvite}>
                <input type="hidden" name="id" value={pendingInvite.id} />
                <button className="text-sm text-slate-500 underline hover:text-red-600">
                  Tühista kutse
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Ainult sina saad oma vanemale ligipääsu anda — selleks loo kutse kood.
              </p>
              <ParentAccess />
            </div>
          )}
        </Card>

      </main>
    </>
  );
}

function FileList({ files }: { files: SessionFile[] }) {
  if (files.length === 0) return <Empty>Ühtegi faili pole veel lisatud.</Empty>;

  return (
    <ul className="divide-y divide-slate-100">
      {files.map((file) => (
        <li key={file.id} className="flex items-center justify-between gap-4 py-2">
          <FileLink path={file.file_path} label={file.original_name} />
          <form action={deleteFile}>
            <input type="hidden" name="id" value={file.id} />
            <input type="hidden" name="path" value={file.file_path} />
            <button className="text-sm text-slate-500 underline hover:text-red-600">
              Kustuta
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
