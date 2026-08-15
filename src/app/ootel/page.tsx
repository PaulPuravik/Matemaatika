import { redirect } from "next/navigation";
import { getProfile, homeFor } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Where an account waits until the tutor approves it. */
export default async function PendingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.approved || profile.role === "admin") {
    redirect(homeFor(profile.role, profile.approved));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Card title="Konto ootab kinnitust">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Tere, {profile.full_name}. Sinu konto on loodud, aga õpetaja peab selle
            enne kinnitama. Anname teada, kui see on tehtud — proovi hiljem uuesti
            sisse logida.
          </p>
          <form action={signOut}>
            <button className="text-sm text-slate-500 underline hover:text-slate-900">
              Logi välja
            </button>
          </form>
        </div>
      </Card>
    </main>
  );
}
