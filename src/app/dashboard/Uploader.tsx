"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerUpload } from "@/app/actions/student";
import { ErrorText } from "@/components/ui";

const MAX_BYTES = 10 * 1024 * 1024;

// Images as well as PDFs: a photo of a worked problem is what a phone
// produces, and only an image can carry a drawn-on question later.
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * Uploads straight from the browser to Supabase Storage, then records the row
 * server-side. Going direct keeps large PDFs out of the server action body.
 */
export default function Uploader({
  sessionId,
  studentId,
}: {
  /** null when no lesson is scheduled yet — the file still reaches the tutor. */
  sessionId: string | null;
  studentId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleUpload(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Lisa PDF või pilt (JPG, PNG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Fail on liiga suur (maksimaalselt 10 MB).");
      return;
    }

    setBusy(true);
    try {
      // The storage policy requires the first path segment to be the student's
      // own id, so a student can only ever write into their own folder.
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${studentId}/${sessionId ?? "general"}/${crypto.randomUUID()}.${extension}`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("student-files")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError("Üleslaadimine ebaõnnestus.");
        return;
      }

      const result = await registerUpload(sessionId, path, file.name);
      if (result?.error) {
        setError(result.error);
        return;
      }

      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleUpload(file);
        }}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
      />
      {busy && <p className="text-sm text-slate-500">Laadin üles…</p>}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
