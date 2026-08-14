import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/** The signed-in user's profile, or null when signed out. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/**
 * Requires a signed-in user with one of the given roles. Sends everyone else
 * to the page that matches their own role, so a student hitting /admin lands
 * back on their dashboard rather than seeing an error.
 */
export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(homeFor(profile.role));
  return profile;
}

export function homeFor(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "parent":
      return "/parent";
    default:
      return "/dashboard";
  }
}
