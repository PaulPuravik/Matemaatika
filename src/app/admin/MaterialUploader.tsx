"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerMaterial } from "@/app/actions/admin";
import { buttonClass, ErrorText, inputClass, Label } from "@/components/ui";

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Uploads a PDF straight to the materials bucket, then records it. With a
 * `studentId` the file goes into that student's folder and only they can read
 * it; without one it lands under shared/ and everyone can.
 */
export default function MaterialUploader({ studentId }: { studentId?: string }) {
  const titleId = `material-title-${studentId ?? "shared"}`;
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const file = form.get("file") as File | null;
    const title = String(form.get("title") ?? "").trim();

    if (!file || file.size === 0) return setError("Vali fail.");
    if (file.type !== "application/pdf") return setError("Palun lisa PDF-fail.");
    if (file.size > MAX_BYTES) return setError("Fail on liiga suur (max 20 MB).");
    if (!title) return setError("Sisesta pealkiri.");

    setBusy(true);
    try {
      const path = `${studentId ?? "shared"}/${crypto.randomUUID()}.pdf`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("materials")
        .upload(path, file, { contentType: "application/pdf" });

      if (uploadError) return setError("Üleslaadimine ebaõnnestus.");

      const result = await registerMaterial(
        title,
        path,
        String(form.get("grade") ?? "").trim(),
        String(form.get("topic") ?? "").trim(),
        studentId ?? null,
      );
      if (result?.error) return setError(result.error);

      formRef.current?.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div className={studentId ? "grid gap-3" : "grid gap-3 sm:grid-cols-3"}>
        <div>
          <Label htmlFor={titleId}>Pealkiri</Label>
          <input id={titleId} name="title" required className={inputClass} />
        </div>
        {!studentId && (
          <>
            <div>
              <Label htmlFor="material-grade">Klass</Label>
              <input id="material-grade" name="grade" className={inputClass} />
            </div>
            <div>
              <Label htmlFor="material-topic">Teema</Label>
              <input id="material-topic" name="topic" className={inputClass} />
            </div>
          </>
        )}
      </div>
      <input
        type="file"
        name="file"
        accept="application/pdf"
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
      />
      {error && <ErrorText>{error}</ErrorText>}
      <button disabled={busy} className={buttonClass}>
        {busy ? "Laadin üles…" : studentId ? "Jaga fail" : "Lisa materjal"}
      </button>
    </form>
  );
}
