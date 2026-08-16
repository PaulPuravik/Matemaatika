"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { notifyParentInvite, notifyTutor } from "@/lib/email";
import { formatDate, formatDateTime } from "@/lib/format";

export type ActionState = { error?: string; ok?: boolean } | null;

/**
 * Saves what the student wants to work on for a session. One note per
 * session: saving again edits the existing note.
 */
export async function saveFocus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sessionId = String(formData.get("session_id") ?? "");
  const focusText = String(formData.get("focus_text") ?? "").trim();
  if (!sessionId) return { error: "Tund puudub." };
  if (!focusText) return { error: "Kirjuta, mida soovid harjutada." };

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("session_focus")
    .select("id")
    .eq("session_id", sessionId)
    .eq("student_id", profile.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("session_focus")
        .update({ focus_text: focusText })
        .eq("id", existing.id)
    : await supabase
        .from("session_focus")
        .insert({
          session_id: sessionId,
          student_id: profile.id,
          focus_text: focusText,
        });

  if (error) return { error: "Salvestamine ebaõnnestus." };

  await notifyTutor(`${profile.full_name}: soov järgmiseks tunniks`, [
    `${profile.full_name} (${profile.grade ?? "klass määramata"}) ${
      existing ? "muutis soovi" : "lisas soovi"
    }:`,
    "",
    focusText,
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function addTest(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const subject = String(formData.get("subject") ?? "").trim();
  const testDate = String(formData.get("test_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!subject) return { error: "Sisesta töö teema." };
  if (!testDate) return { error: "Vali kuupäev." };

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { error } = await supabase.from("tests").insert({
    student_id: profile.id,
    subject,
    test_date: testDate,
    notes: notes || null,
  });

  if (error) return { error: "Salvestamine ebaõnnestus." };

  await notifyTutor(`${profile.full_name}: uus kontrolltöö`, [
    `${profile.full_name} lisas kontrolltöö.`,
    "",
    `Teema: ${subject}`,
    `Kuupäev: ${formatDate(testDate)}`,
    ...(notes ? ["", `Märkused: ${notes}`] : []),
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteTest(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("tests").delete().eq("id", id);
  revalidatePath("/dashboard");
}

/**
 * Records a PDF the student has just uploaded to Storage. The upload itself
 * happens straight from the browser (storage policies enforce the path), so
 * the file never travels through a server action body.
 */
export async function registerUpload(
  sessionId: string | null,
  filePath: string,
  originalName: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { error } = await supabase.from("session_files").insert({
    session_id: sessionId,
    student_id: profile.id,
    file_path: filePath,
    original_name: originalName,
  });

  if (error) return { error: "Faili salvestamine ebaõnnestus." };

  const { data: session } = sessionId
    ? await supabase
        .from("sessions_public")
        .select("scheduled_at")
        .eq("id", sessionId)
        .maybeSingle()
    : { data: null };

  await notifyTutor(`${profile.full_name}: uus fail`, [
    `${profile.full_name} laadis üles faili "${originalName}".`,
    ...(session ? [`Tund: ${formatDateTime(session.scheduled_at)}`] : []),
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteFile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const path = String(formData.get("path") ?? "");

  const supabase = await createClient();
  await supabase.storage.from("student-files").remove([path]);
  await supabase.from("session_files").delete().eq("id", id);
  revalidatePath("/dashboard");
}

/**
 * Issues a join code for a parent. Only the student can do this — there is no
 * other way for a parent account to become linked. Issuing a new code retires
 * any unused earlier one.
 */
export async function createParentInvite(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parentEmail = String(formData.get("parent_email") ?? "").trim();

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { data: code, error } = await supabase.rpc("create_parent_invite", {
    p_parent_email: parentEmail || null,
  });

  if (error || !code) return { error: "Kutse loomine ebaõnnestus." };

  if (parentEmail) {
    await notifyParentInvite(parentEmail, profile.full_name, code as string);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function cancelParentInvite(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("parent_invites").delete().eq("id", id);
  revalidatePath("/dashboard");
}

export async function revokeParentAccess(formData: FormData) {
  const parentId = String(formData.get("parent_id") ?? "");
  const supabase = await createClient();
  await supabase.rpc("revoke_parent_access", { p_parent: parentId });
  revalidatePath("/dashboard");
}

export async function addGrade(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const subject = String(formData.get("subject") ?? "").trim();
  const mark = String(formData.get("mark") ?? "").trim();
  const receivedOn = String(formData.get("received_on") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!subject) return { error: "Sisesta aine või teema." };
  if (!mark) return { error: "Sisesta hinne." };

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { error } = await supabase.from("grades").insert({
    student_id: profile.id,
    subject,
    mark,
    received_on: receivedOn || new Date().toISOString().slice(0, 10),
    notes: notes || null,
  });

  if (error) return { error: "Salvestamine ebaõnnestus." };

  await notifyTutor(`${profile.full_name}: uus hinne`, [
    `${profile.full_name} lisas hinde.`,
    "",
    `Aine: ${subject}`,
    `Hinne: ${mark}`,
    `Kuupäev: ${formatDate(receivedOn || new Date().toISOString().slice(0, 10))}`,
    ...(notes ? ["", `Märkused: ${notes}`] : []),
  ]);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteGrade(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("grades").delete().eq("id", id);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * A question about a file, optionally about one drawn-on region of an image.
 * The tutor hears about it straight away, since the point is to unblock the
 * student between lessons.
 */
export async function askQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body = String(formData.get("body") ?? "").trim();
  const fileId = String(formData.get("file_id") ?? "") || null;
  const materialId = String(formData.get("material_id") ?? "") || null;
  const rawRegion = String(formData.get("region") ?? "");

  if (!body) return { error: "Kirjuta oma küsimus." };

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  let region: unknown = null;
  if (rawRegion) {
    try {
      region = JSON.parse(rawRegion);
    } catch {
      region = null;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("questions").insert({
    student_id: profile.id,
    file_id: fileId,
    material_id: materialId,
    body,
    region,
  });

  if (error) return { error: error.message };

  await notifyTutor(`${profile.full_name}: uus küsimus`, [
    `${profile.full_name} küsib:`,
    "",
    body,
    ...(region ? ["", "Küsimus on märgitud pildi kindla koha kohta."] : []),
  ]);

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function replyToQuestion(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const questionId = String(formData.get("question_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Kirjuta vastus." };

  const profile = await getProfile();
  if (!profile) return { error: "Sessioon on aegunud. Logi uuesti sisse." };

  const supabase = await createClient();
  const { error } = await supabase.from("question_replies").insert({
    question_id: questionId,
    author_id: profile.id,
    body,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteQuestion(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  await supabase.from("questions").delete().eq("id", id);
  revalidatePath("/dashboard", "layout");
}
