"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { notifyStudent } from "@/lib/email";
import { formatDate, formatDateTime } from "@/lib/format";
import { fetchEvents } from "@/lib/google-calendar";
import { matchEvents } from "@/lib/calendar";
import type { ActionState } from "@/app/actions/student";
import type { Profile } from "@/lib/types";

/** RLS is the real guard; this just fails fast with a readable message. */
async function assertAdmin() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return profile;
}

export async function createSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const studentId = String(formData.get("student_id") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  const tutorNotes = String(formData.get("tutor_notes") ?? "").trim();

  if (!studentId) return { error: "Vali õpilane." };
  if (!scheduledAt) return { error: "Vali aeg." };

  const supabase = await createClient();
  const { error } = await supabase.from("sessions").insert({
    student_id: studentId,
    scheduled_at: new Date(scheduledAt).toISOString(),
    tutor_notes: tutorNotes || null,
  });

  if (error) return { error: error.message };

  await emailStudentAboutSession(studentId, scheduledAt, "Uus tund on planeeritud");

  revalidatePath("/admin");
  return { ok: true };
}

export async function updateSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertAdmin();

  const id = String(formData.get("id") ?? "");
  const scheduledAt = String(formData.get("scheduled_at") ?? "");
  const status = String(formData.get("status") ?? "upcoming");
  const tutorNotes = String(formData.get("tutor_notes") ?? "").trim();

  if (!id || !scheduledAt) return { error: "Puuduvad andmed." };

  const supabase = await createClient();
  const summary = String(formData.get("summary") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const homeworkDue = String(formData.get("homework_due") ?? "");

  const { data: before } = await supabase
    .from("sessions")
    .select("student_id, scheduled_at, homework")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("sessions")
    .update({
      scheduled_at: new Date(scheduledAt).toISOString(),
      status,
      tutor_notes: tutorNotes || null,
      summary: summary || null,
      homework: homework || null,
      homework_due: homeworkDue || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const moved =
    before && new Date(before.scheduled_at).getTime() !== new Date(scheduledAt).getTime();
  if (moved) {
    await emailStudentAboutSession(before.student_id, scheduledAt, "Tunni aeg muutus");
  }

  if (before && homework && homework !== (before.homework ?? "")) {
    await emailStudent(before.student_id, "Uus kodutöö", [
      `Kodutöö: ${homework}`,
      ...(homeworkDue ? [`Tähtaeg: ${formatDate(homeworkDue)}`] : []),
      ...(summary ? ["", `Tunnis tegime: ${summary}`] : []),
    ]);
  }

  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteSession(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", id);
  revalidatePath("/admin");
}

/**
 * Records a material. `studentId` null shares it with everyone; set, and only
 * that student (and their parent) can see it.
 */
export async function registerMaterial(
  title: string,
  filePath: string,
  grade: string,
  topic: string,
  studentId?: string | null,
): Promise<ActionState & { id?: string }> {
  await assertAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .insert({
      title,
      file_path: filePath,
      grade: grade || null,
      topic: topic || null,
      student_id: studentId || null,
      audience: studentId ? "selected" : "all",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Uploading from a student's own page addresses it to them straight away.
  if (studentId && data?.id) {
    await supabase
      .from("material_recipients")
      .insert({ material_id: data.id, student_id: studentId });
  }

  if (studentId) {
    try {
      const { data } = await createAdminClient().auth.admin.getUserById(studentId);
      if (data.user?.email) {
        await notifyStudent(data.user.email, "Õpetaja jagas sinuga faili", [
          `Sinu jaoks on uus materjal: ${title}`,
        ]);
      }
    } catch (error) {
      console.error("Could not email the student about the material:", error);
    }
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: data?.id };
}

export async function deleteMaterial(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const path = String(formData.get("path") ?? "");

  const supabase = await createClient();
  await supabase.storage.from("materials").remove([path]);
  await supabase.from("materials").delete().eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

/** Their address lives in auth.users, which only the service role can read. */
async function emailStudent(studentId: string, subject: string, lines: string[]) {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(studentId);
    if (data.user?.email) await notifyStudent(data.user.email, subject, lines);
  } catch (error) {
    console.error("Could not email the student:", error);
  }
}

async function emailStudentAboutSession(
  studentId: string,
  scheduledAt: string,
  subject: string,
) {
  await emailStudent(studentId, subject, [
    `Sinu järgmine tund: ${formatDateTime(new Date(scheduledAt).toISOString())}`,
  ]);
}

// ---------------------------------------------------------------------------
// Account administration — the tutor approves, unlinks and removes accounts
// ---------------------------------------------------------------------------

export async function approveAccount(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("Could not approve the account:", error);
    return;
  }

  await emailStudent(id, "Sinu konto on kinnitatud", [
    "Õpetaja kinnitas sinu konto. Nüüd saad sisse logida.",
  ]);

  revalidatePath("/admin");
}

/** Removes the account and, by cascade, everything that belonged to it. */
export async function deleteAccount(formData: FormData) {
  const me = await assertAdmin();
  const id = String(formData.get("id") ?? "");

  // Deleting your own account would lock you out of the app entirely.
  if (id === me.id) return;

  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) console.error("Could not delete the account:", error);

  revalidatePath("/admin");
}

/** Cuts a parent loose from their child without deleting the account. */
export async function unlinkParent(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("profiles").update({ parent_of: null }).eq("id", id);
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

export type SyncReport = {
  error?: string;
  created?: number;
  updated?: number;
  skipped?: string[];
};

/**
 * Pulls lessons out of the tutor's calendar. Only ever creates or moves
 * sessions it made itself (they carry the calendar event's id) — a lesson
 * entered by hand is never touched, and nothing is ever deleted.
 */
export async function syncCalendar(): Promise<SyncReport> {
  await assertAdmin();

  const supabase = await createClient();

  // The calendar columns arrive with migration 0006. Without it every insert
  // below would fail one by one with nothing explaining why.
  const { error: schemaError } = await supabase
    .from("sessions")
    .select("google_event_id")
    .limit(1);

  if (schemaError) {
    return {
      error:
        "Andmebaasis puudub kalendri tugi. Jooksuta Supabase SQL editoris " +
        "migratsioon 0006_google_calendar_sync.sql ja proovi uuesti. " +
        `(${schemaError.message})`,
    };
  }

  const result = await fetchEvents();
  if (!result.ok) return { error: result.error };

  const [{ data: profiles }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*"),
    supabase.from("app_settings").select("value").eq("key", "calendar_keyword").maybeSingle(),
  ]);

  const students = ((profiles as Profile[]) ?? []).filter(
    (p) => p.role === "student" && p.approved,
  );
  const keyword = settings?.value ?? "Eratund";

  if (students.length === 0) {
    return { error: "Ühtegi kinnitatud õpilast pole, kellega tunde siduda." };
  }

  const matches = matchEvents(result.events, students, keyword);

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const match of matches) {
    if (match.kind === "no-keyword") continue;

    const when = new Date(match.event.start).toLocaleString("et-EE", {
      dateStyle: "short",
      timeStyle: "short",
    });

    if (match.kind === "unknown-student") {
      skipped.push(`${when} — "${match.event.summary}": õpilast ei tuvastanud`);
      continue;
    }
    if (match.kind === "ambiguous") {
      skipped.push(
        `${when} — "${match.event.summary}": sobib mitu õpilast ` +
          `(${match.candidates.join(", ")})`,
      );
      continue;
    }

    const { data: existing, error: lookupError } = await supabase
      .from("sessions")
      .select("id")
      .eq("google_event_id", match.event.id)
      .maybeSingle();

    if (lookupError) {
      skipped.push(`${when} — ${match.studentName}: ${lookupError.message}`);
      continue;
    }

    const scheduledAt = match.event.start;
    const notes = match.event.description.trim() || null;

    if (existing) {
      const { error } = await supabase
        .from("sessions")
        .update({ scheduled_at: scheduledAt })
        .eq("id", existing.id);
      if (error) {
        skipped.push(`${when} — ${match.studentName}: ${error.message}`);
      } else {
        updated++;
      }
      continue;
    }

    const { error } = await supabase.from("sessions").insert({
      student_id: match.studentId,
      scheduled_at: scheduledAt,
      google_event_id: match.event.id,
      // The calendar note is the tutor's own shorthand, so it lands in the
      // private field rather than anywhere the student can read.
      tutor_notes: notes,
    });

    if (error) {
      skipped.push(`${when} — ${match.studentName}: ${error.message}`);
    } else {
      created++;
    }
  }

  revalidatePath("/admin");
  return { created, updated, skipped };
}

/** The short name the tutor writes in their calendar for this student. */
export async function setCalendarAlias(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const alias = String(formData.get("calendar_alias") ?? "").trim();

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ calendar_alias: alias || null })
    .eq("id", id);

  revalidatePath("/admin");
}

/** The tutor answers a question and the student is told it was answered. */
export async function answerQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await assertAdmin();
  const questionId = String(formData.get("question_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Kirjuta vastus." };

  const supabase = await createClient();

  const { error } = await supabase.from("question_replies").insert({
    question_id: questionId,
    author_id: me.id,
    body,
  });
  if (error) return { error: error.message };

  const { data: question } = await supabase
    .from("questions")
    .select("student_id, body")
    .eq("id", questionId)
    .single();

  await supabase
    .from("questions")
    .update({ answered_at: new Date().toISOString() })
    .eq("id", questionId);

  if (question) {
    await emailStudent(question.student_id, "Õpetaja vastas sinu küsimusele", [
      `Sinu küsimus: ${question.body}`,
      "",
      `Vastus: ${body}`,
    ]);
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Which students a material goes to. An empty list means everyone. */
export async function setMaterialAudience(
  materialId: string,
  studentIds: string[],
): Promise<ActionState> {
  await assertAdmin();

  const supabase = await createClient();
  const audience = studentIds.length === 0 ? "all" : "selected";

  const { error } = await supabase
    .from("materials")
    .update({ audience })
    .eq("id", materialId);
  if (error) return { error: error.message };

  await supabase.from("material_recipients").delete().eq("material_id", materialId);

  if (studentIds.length > 0) {
    const { error: linkError } = await supabase
      .from("material_recipients")
      .insert(studentIds.map((student_id) => ({ material_id: materialId, student_id })));
    if (linkError) return { error: linkError.message };
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
