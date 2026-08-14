import Link from "next/link";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Loo konto</h1>
      <p className="mt-1 text-sm text-slate-600">
        Õpilase konto. Vanema ligipääsu saad küsida otse õpetajalt.
      </p>
      <div className="mt-6">
        <SignupForm />
      </div>
      <p className="mt-6 text-sm text-slate-600">
        On juba konto?{" "}
        <Link href="/login" className="underline">
          Logi sisse
        </Link>
      </p>
    </main>
  );
}
