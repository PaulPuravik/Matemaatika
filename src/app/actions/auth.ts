"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export type FormState = { error?: string } | null;

/**
 * A parent account is only ever linked by accepting a code their child issued.
 * When email confirmation is on there is no session at signup time, so the code
 * rides along in the user metadata and is redeemed on first login instead.
 */
async function redeemPendingInvite(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const code = (user.user_metadata?.invite_code as string | undefined)?.trim();
  if (!code) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, parent_of")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "student" || profile.parent_of) return null;

  const { error } = await supabase.rpc("accept_parent_invite", { p_code: code });

  // Clear the code either way — a bad one should not be retried on every login.
  await supabase.auth.updateUser({ data: { invite_code: null } });

  return error ? error.message : null;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !auth.user) return { error: "Vale e-post või parool." };

  const inviteError = await redeemPendingInvite();
  if (inviteError) redirect("/liitu?error=" + encodeURIComponent(inviteError));

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  redirect(homeFor((data?.role as UserRole) ?? "student"));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const mode = String(formData.get("mode") ?? "student");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!fullName) return { error: "Palun sisesta oma nimi." };
  if (password.length < 8) return { error: "Parool peab olema vähemalt 8 tähemärki." };

  const isParent = mode === "parent";
  const inviteCode = String(formData.get("invite_code") ?? "").trim().toUpperCase();

  if (isParent && !inviteCode) {
    return { error: "Sisesta kutse kood, mille sinu laps sulle saatis." };
  }

  const supabase = await createClient();

  // These fields are read by the handle_new_user trigger, which creates the
  // matching profiles row. Everyone starts as a student; only accepting an
  // invite turns an account into a parent.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: isParent
        ? { full_name: fullName, invite_code: inviteCode }
        : {
            full_name: fullName,
            grade: String(formData.get("grade") ?? "").trim(),
            textbook: String(formData.get("textbook") ?? "").trim(),
            school: String(formData.get("school") ?? "").trim(),
          },
    },
  });

  if (error) return { error: error.message };

  if (!data.session) {
    redirect("/login?confirm=1");
  }

  if (isParent) {
    const inviteError = await redeemPendingInvite();
    if (inviteError) redirect("/liitu?error=" + encodeURIComponent(inviteError));
    redirect("/parent");
  }

  redirect("/dashboard");
}

/** Manual code entry, for a parent whose code did not go through at signup. */
export async function joinAsParent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Sisesta kutse kood." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_parent_invite", { p_code: code });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/parent");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
