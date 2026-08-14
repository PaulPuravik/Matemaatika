import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-semibold">Matemaatika</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        Sisesta ühine parool, et jätkata.
      </p>

      <form action="/api/gate" method="post" className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/"} />
        <div>
          <Label htmlFor="password">Parool</Label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoFocus
            className={inputClass}
          />
        </div>
        {error && <ErrorText>Vale parool.</ErrorText>}
        <button className={`${buttonClass} w-full`}>Sisene</button>
      </form>
    </main>
  );
}
