import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Empty, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  approveAccount,
  deleteAccount,
  deleteMaterial,
  deleteSession,
  unlinkParent,
} from "@/app/actions/admin";
import type {
  Grade,
  Material,
  Profile,
  SessionFile,
  SessionFocus,
  Test,
  TutorSession,
} from "@/lib/types";
import SessionForm from "./SessionForm";
import MaterialUploader from "./MaterialUploader";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await requireRole("admin");
  const supabase = await createClient();

  const [{ data: profiles }, { data: sessions }, { data: focus }, { data: files },
    { data: tests }, { data: materials }, { data: grades }] = await Promise.all([
    supabase.from("profiles").select("*").order("full_name"),
    supabase.from("sessions").select("*").order("scheduled_at", { ascending: true }),
    supabase.from("session_focus").select("*"),
    supabase.from("session_files").select("*").order("uploaded_at", { ascending: false }),
    supabase.from("tests").select("*").order("test_date", { ascending: true }),
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
    supabase.from("grades").select("*").order("received_on", { ascending: false }),
  ]);

  const everyone = (profiles as Profile[]) ?? [];
  const pending = everyone.filter((p) => !p.approved && p.role !== "admin");
  const students = everyone.filter((p) => p.role === "student" && p.approved);
  const parents = everyone.filter((p) => p.role === "parent" && p.approved);
  const emails = await studentEmails(everyone.map((s) => s.id));

  const allSessions = (sessions as TutorSession[]) ?? [];
  const allFocus = (focus as SessionFocus[]) ?? [];
  const allFiles = (files as SessionFile[]) ?? [];
  const allTests = (tests as Test[]) ?? [];
  const allGrades = (grades as Grade[]) ?? [];
  const allMaterials = (materials as Material[]) ?? [];
  const sharedMaterials = allMaterials.filter((m) => !m.student_id);
  const now = Date.now();

  return (
    <>
      <PageHeader profile={profile} />

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
                      <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
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

        <Card title="Uus tund">
          <SessionForm students={students} />
        </Card>

        {students.length === 0 && (
          <Card>
            <Empty>Ühtegi õpilast pole veel registreerunud.</Empty>
          </Card>
        )}

        {students.map((student) => {
          const studentSessions = allSessions.filter((s) => s.student_id === student.id);
          const nextSession = studentSessions.find(
            (s) => s.status === "upcoming" && new Date(s.scheduled_at).getTime() >= now,
          );
          const studentTests = allTests.filter(
            (t) => t.student_id === student.id && new Date(t.test_date).getTime() >= now,
          );
          const linkedParents = parents.filter((p) => p.parent_of === student.id);

          return (
            <Card key={student.id} title={student.full_name}>
              <p className="-mt-2 mb-4 text-sm text-slate-500">
                {[
                  student.grade,
                  student.school,
                  student.textbook,
                  emails.get(student.id),
                  linkedParents.length > 0
                    ? `vanem: ${linkedParents.map((p) => p.full_name).join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Järgmine tund</h3>
                  {nextSession ? (
                    <p className="text-sm">{formatDateTime(nextSession.scheduled_at)}</p>
                  ) : (
                    <Empty>Planeerimata.</Empty>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Mida soovib harjutada
                  </h3>
                  {nextSession &&
                  allFocus.some((f) => f.session_id === nextSession.id) ? (
                    <p className="whitespace-pre-line text-sm">
                      {allFocus.find((f) => f.session_id === nextSession.id)?.focus_text}
                    </p>
                  ) : (
                    <Empty>Pole veel kirjutanud.</Empty>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Tema jagatud failid
                  </h3>
                  <AdminFileList
                    files={allFiles.filter((f) => f.student_id === student.id)}
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Hinded</h3>
                  {allGrades.filter((g) => g.student_id === student.id).length > 0 ? (
                    <ul className="text-sm">
                      {allGrades
                        .filter((g) => g.student_id === student.id)
                        .map((grade) => (
                          <li key={grade.id}>
                            {formatDate(grade.received_on)} — {grade.subject}:{" "}
                            <strong>{grade.mark}</strong>
                            {grade.notes && (
                              <span className="text-slate-500"> ({grade.notes})</span>
                            )}
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <Empty>Hindeid pole lisatud.</Empty>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Konto</h3>
                  <div className="flex flex-wrap items-center gap-4">
                    {linkedParents.map((parent) => (
                      <form key={parent.id} action={unlinkParent}>
                        <input type="hidden" name="id" value={parent.id} />
                        <button className="text-sm text-slate-500 underline hover:text-red-600">
                          Eemalda vanem {parent.full_name}
                        </button>
                      </form>
                    ))}
                    <form action={deleteAccount}>
                      <input type="hidden" name="id" value={student.id} />
                      <button className="text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta õpilase konto
                      </button>
                    </form>
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    Jaga fail ainult temaga
                  </h3>
                  <div className="space-y-3">
                    <MaterialUploader studentId={student.id} />
                    <StudentMaterials
                      materials={allMaterials.filter(
                        (m) => m.student_id === student.id,
                      )}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    Tulevased kontrolltööd
                  </h3>
                  {studentTests.length > 0 ? (
                    <ul className="text-sm">
                      {studentTests.map((test) => (
                        <li key={test.id}>
                          {formatDate(test.test_date)} — {test.subject}
                          {test.notes && (
                            <span className="text-slate-500"> ({test.notes})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>Pole lisatud.</Empty>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Tunnid</h3>
                  {studentSessions.length > 0 ? (
                    <ul className="space-y-3">
                      {studentSessions.map((session) => (
                        <li
                          key={session.id}
                          className="rounded-lg border border-slate-200 p-3"
                        >
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
                  ) : (
                    <Empty>Tunde pole.</Empty>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

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

        <Card title="Materjalid kõigile">
          <div className="space-y-4">
            <MaterialUploader />
            {sharedMaterials.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {sharedMaterials.map((material) => (
                  <li
                    key={material.id}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{material.title}</p>
                      <p className="text-sm text-slate-500">
                        {[material.grade, material.topic].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <form action={deleteMaterial}>
                      <input type="hidden" name="id" value={material.id} />
                      <input type="hidden" name="path" value={material.file_path} />
                      <button className="text-sm text-slate-500 underline hover:text-red-600">
                        Kustuta
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Materjale pole lisatud.</Empty>
            )}
          </div>
        </Card>
      </main>
    </>
  );
}

function StudentMaterials({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return <Empty>Sellele õpilasele pole faile jagatud.</Empty>;

  return (
    <ul className="divide-y divide-slate-100">
      {materials.map((material) => (
        <li key={material.id} className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm">{material.title}</span>
          <form action={deleteMaterial}>
            <input type="hidden" name="id" value={material.id} />
            <input type="hidden" name="path" value={material.file_path} />
            <button className="text-sm text-slate-500 underline hover:text-red-600">
              Kustuta
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

async function AdminFileList({ files }: { files: SessionFile[] }) {
  if (files.length === 0) return <Empty>Faile pole.</Empty>;

  const supabase = await createClient();

  return (
    <ul className="text-sm">
      {await Promise.all(
        files.map(async (file) => {
          const { data } = await supabase.storage
            .from("student-files")
            .createSignedUrl(file.file_path, 60 * 10);

          return (
            <li key={file.id}>
              <a
                href={data?.signedUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {file.original_name}
              </a>
              <span className="text-slate-500">
                {" "}
                — {formatDateTime(file.uploaded_at)}
              </span>
            </li>
          );
        }),
      )}
    </ul>
  );
}

/**
 * Student email addresses live in auth.users, which needs the service role.
 * Only reached after requireRole("admin") above.
 */
async function studentEmails(ids: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (ids.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return emails;

  try {
    const { data } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email && ids.includes(user.id)) emails.set(user.id, user.email);
    }
  } catch (error) {
    console.error("Could not load student emails:", error);
  }
  return emails;
}
