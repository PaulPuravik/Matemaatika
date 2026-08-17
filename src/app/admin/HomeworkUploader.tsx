"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { attachHomeworkFile } from "@/app/actions/admin";
import { ErrorText } from "@/components/ui";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * Attaches a file to one lesson's homework. It goes into the student's own
 * folder, next to what they uploaded themselves — the same read rule applies,
 * so the student and their parent see it and nobody else does.
 */
export default function HomeworkUploader({
  sessionId,
  studentId,
}: {
  sessionId: string;
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
      setError("Fail on liiga suur (maksimaalselt 20 MB).");
      return;
    }

    setBusy(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const path = `${studentId}/${sessionId}/${crypto.randomUUID()}.${extension}`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("student-files")
        .upload(path, file, { contentType: file.type });

      if (uploadError) {
        setError(`Üleslaadimine ebaõnnestus. (${uploadError.message})`);
        return;
      }

      const result = await attachHomeworkFile(sessionId, studentId, path, file.name);
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
