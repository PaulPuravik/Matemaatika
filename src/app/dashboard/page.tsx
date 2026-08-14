import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { deleteFile, deleteTest } from "@/app/actions/student";
import type { Material, PublicSession, SessionFile, Test } from "@/lib/types";
import FocusForm from "./FocusForm";
import TestForm from "./TestForm";
import Uploader from "./Uploader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireRole("student");
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("sessions_public")
    .select("*")
    .eq("student_id", profile.id)
    .eq("status", "upcoming")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1);

  const nextSession = (sessions?.[0] as PublicSession) ?? null;

  const [{ data: tests }, { data: materials }] = await Promise.all([
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
  ]);

  let focusText = "";
  let files: SessionFile[] = [];

  if (nextSession) {
    const [{ data: focus }, { data: sessionFiles }] = await Promise.all([
      supabase
        .from("session_focus")
        .select("focus_text")
        .eq("session_id", nextSession.id)
        .eq("student_id", profile.id)
        .maybeSingle(),
      supabase
        .from("session_files")
        .select("*")
        .eq("session_id", nextSession.id)
        .order("uploaded_at", { ascending: false }),
    ]);
    focusText = focus?.focus_text ?? "";
    files = (sessionFiles as SessionFile[]) ?? [];
  }

  return (
    <>
      <PageHeader profile={profile} />

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Card title="Järgmine tund">
          {nextSession ? (
            <p className="text-lg font-medium">
              {formatDateTime(nextSession.scheduled_at)}
            </p>
          ) : (
            <Empty>Järgmist tundi pole veel planeeritud.</Empty>
          )}
        </Card>

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

        <Card title="Failid järgmiseks tunniks">
          {nextSession ? (
            <div className="space-y-4">
              <Uploader sessionId={nextSession.id} studentId={profile.id} />
              <FileList files={files} />
            </div>
          ) : (
            <Empty>Faile saab lisada siis, kui järgmine tund on planeeritud.</Empty>
          )}
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
                className="text-sm underline"
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
