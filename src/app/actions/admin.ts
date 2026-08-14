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
  const { data: before } = await supabase
    .from("sessions")
    .select("student_id, scheduled_at")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("sessions")
    .update({
      scheduled_at: new Date(scheduledAt).toISOString(),
      status,
      tutor_notes: tutorNotes || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  const moved =
    before && new Date(before.scheduled_at).getTime() !== new Date(scheduledAt).getTime();
  if (moved) {
    await emailStudentAboutSession(before.student_id, scheduledAt, "Tunni aeg muutus");
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

export async function registerMaterial(
  title: string,
  filePath: string,
  grade: string,
  topic: string,
): Promise<ActionState> {
  await assertAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("materials").insert({
    title,
    file_path: filePath,
    grade: grade || null,
    topic: topic || null,
  });

  if (error) return { error: error.message };

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

/**
 * Optional courtesy email to the student. Their address lives in auth.users,
 * which only the service role can read.
 */
async function emailStudentAboutSession(
  studentId: string,
  scheduledAt: string,
  subject: string,
) {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(studentId);
    const email = data.user?.email;
    if (!email) return;

    await notifyStudent(email, subject, [
      `Sinu järgmine tund: ${formatDateTime(new Date(scheduledAt).toISOString())}`,
    ]);
  } catch (error) {
    console.error("Could not email the student about their session:", error);
  }
}
