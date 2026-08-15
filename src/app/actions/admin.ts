"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { notifyStudent } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import type { ActionState } from "@/app/actions/student";

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
): Promise<ActionState> {
  await assertAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("materials").insert({
    title,
    file_path: filePath,
    grade: grade || null,
    topic: topic || null,
    student_id: studentId || null,
  });

  if (error) return { error: error.message };

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

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { ok: true };
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
