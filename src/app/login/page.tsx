import Link from "next/link";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string }>;
}) {
  const { confirm } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Logi sisse</h1>
      {confirm && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Konto on loodud. Kinnita e-posti aadress ja logi siis sisse.
        </p>
      )}
      <div className="mt-6">
        <LoginForm />
      </div>
      <p className="mt-6 text-sm text-slate-600">
        Pole veel kontot?{" "}
        <Link href="/signup" className="inline-block py-1 underline">
          Loo konto
        </Link>
      </p>
    </main>
  );
}
