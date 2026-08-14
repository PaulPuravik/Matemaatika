"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { homeFor } from "@/lib/auth";
import type { UserRole } from "@/lib/types";

export type FormState = { error?: string } | null;

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !auth.user) return { error: "Vale e-post või parool." };

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .single();

  redirect(homeFor((data?.role as UserRole) ?? "student"));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  const textbook = String(formData.get("textbook") ?? "").trim();

  if (!fullName) return { error: "Palun sisesta oma nimi." };
  if (password.length < 8) return { error: "Parool peab olema vähemalt 8 tähemärki." };

  const supabase = await createClient();
  // full_name / grade / textbook are read by the handle_new_user trigger,
  // which creates the matching profiles row.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, grade, textbook } },
  });

  if (error) return { error: error.message };

  // With email confirmation enabled there is no session yet.
  if (!data.session) {
    redirect("/login?confirm=1");
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
