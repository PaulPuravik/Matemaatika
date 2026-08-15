import JoinForm from "./JoinForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Seo end oma lapsega</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Sisesta kutse kood, mille sinu laps sulle saatis. Ilma koodita ei saa
        vanema ligipääsu anda.
      </p>
      <JoinForm initialError={error} />
    </main>
  );
}
