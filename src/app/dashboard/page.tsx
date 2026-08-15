import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { LessonHistory } from "@/components/LessonHistory";
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
  Material,
  ParentInvite,
  Profile,
  PublicSession,
  SessionFile,
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

  const nextSession =
    [...allSessions]
      .reverse()
      .find(
        (s) => s.status === "upcoming" && new Date(s.scheduled_at).getTime() >= now,
      ) ?? null;

  // Anything already held, newest first — that is where homework lives.
  const pastLessons = allSessions.filter(
    (s) => s.status === "done" || new Date(s.scheduled_at).getTime() < now,
  );
  const currentHomework = pastLessons.find((s) => s.homework)?.homework ?? null;

  const [
    { data: tests },
    { data: materials },
    { data: grades },
    { data: parents },
    { data: invites },
  ] = await Promise.all([
    supabase
      .from("tests")
      .select("*")
      .eq("student_id", profile.id)
      .gte("test_date", new Date().toISOString().slice(0, 10))
      .order("test_date", { ascending: true }),
    supabase
      .from("materials")
      .select("*")
      .order("created_at", { ascending: false }),
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
  ]);

  const linkedParent = ((parents as Profile[]) ?? [])[0] ?? null;
  const pendingInvite = ((invites as ParentInvite[]) ?? [])[0] ?? null;

  let focusText = "";

  const { data: allFiles } = await supabase
    .from("session_files")
    .select("*")
    .order("uploaded_at", { ascending: false });
  const files = (allFiles as SessionFile[]) ?? [];

  if (nextSession) {
    const { data: focus } = await supabase
      .from("session_focus")
      .select("focus_text")
      .eq("session_id", nextSession.id)
      .eq("student_id", profile.id)
      .maybeSingle();
    focusText = focus?.focus_text ?? "";
  }

  return (
    <>
      <PageHeader profile={profile} />

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
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
          </Card>
        )}

        <Card title="Mida soovin harjutada">
          {nextSession ? (
            <FocusForm sessionId={nextSession.id} initialText={focusText} />
          ) : (
            <Empty>
              Kui järgmine tund on planeeritud, saad siia kirjutada, mida soovid
              harjutada.
            </Empty>
          )}
        </Card>

        <Card title="Failid õpetajale">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Lisa siia see, millest tunnis kasu oleks — kodutöö, kontrolltöö
              parandused, ülesanded, mis ei tulnud välja. Faile saab lisada ka siis,
              kui järgmist tundi pole veel planeeritud.
            </p>
            <Uploader sessionId={nextSession?.id ?? null} studentId={profile.id} />
            <FileList files={files} />
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

        <Card title="Toimunud tunnid">
          <LessonHistory lessons={pastLessons} />
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

        <Card title="Materjalid">
          <MaterialList materials={(materials as Material[]) ?? []} />
        </Card>
      </main>
    </>
  );
}

async function FileList({ files }: { files: SessionFile[] }) {
  if (files.length === 0) return <Empty>Ühtegi faili pole veel lisatud.</Empty>;

  const supabase = await createClient();

  return (
    <ul className="divide-y divide-slate-100">
      {await Promise.all(
        files.map(async (file) => {
          const { data } = await supabase.storage
            .from("student-files")
            .createSignedUrl(file.file_path, 60 * 10);

          return (
            <li key={file.id} className="flex items-center justify-between gap-4 py-2">
              <a
                href={data?.signedUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 break-words text-sm underline"
              >
                {file.original_name}
              </a>
              <form action={deleteFile}>
                <input type="hidden" name="id" value={file.id} />
                <input type="hidden" name="path" value={file.file_path} />
                <button className="text-sm text-slate-500 underline hover:text-red-600">
                  Kustuta
                </button>
              </form>
            </li>
          );
        }),
      )}
    </ul>
  );
}

async function MaterialList({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return <Empty>Materjale pole veel jagatud.</Empty>;

  const supabase = await createClient();

  return (
    <ul className="divide-y divide-slate-100">
      {await Promise.all(
        materials.map(async (material) => {
          const { data } = await supabase.storage
            .from("materials")
            .createSignedUrl(material.file_path, 60 * 10);

          return (
            <li key={material.id} className="py-2">
              <a
                href={data?.signedUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline"
              >
                {material.title}
              </a>
              {material.student_id && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  ainult sulle
                </span>
              )}
              <p className="text-sm text-slate-500">
                {[material.grade, material.topic].filter(Boolean).join(" · ")}
              </p>
            </li>
          );
        }),
      )}
    </ul>
  );
}
