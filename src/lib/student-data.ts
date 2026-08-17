import { createClient } from "@/lib/supabase/server";
import type { Askable } from "@/components/AskQuestion";
import type { Material, SessionFile } from "@/lib/types";

const IMAGE = /\.(jpe?g|png|webp|heic|gif)$/i;

/**
 * Everything the student could ask a question about: their own uploads and the
 * materials shared with them, each with a signed URL so an image can be shown
 * and drawn on.
 */
export async function askableItems(): Promise<Askable[]> {
  const supabase = await createClient();

  const [{ data: files }, { data: materials }] = await Promise.all([
    supabase.from("session_files").select("*").order("uploaded_at", { ascending: false }),
    supabase.from("materials").select("*").order("created_at", { ascending: false }),
  ]);

  const rows: Array<{ id: string; kind: "file" | "material"; label: string; path: string; bucket: string }> = [
    // Homework files the tutor attached are askable too — that is exactly the
    // sort of thing a student gets stuck on — so say which is which.
    ...(((files as SessionFile[]) ?? []).map((f) => ({
      id: f.id,
      kind: "file" as const,
      label: f.from_tutor ? `${f.original_name} (kodutöö)` : f.original_name,
      path: f.file_path,
      bucket: "student-files",
    }))),
    ...(((materials as Material[]) ?? []).map((m) => ({
      id: m.id,
      kind: "material" as const,
      label: m.title,
      path: m.file_path,
      bucket: "materials",
    }))),
  ];

  return Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage.from(row.bucket).createSignedUrl(row.path, 60 * 10);
      return {
        id: row.id,
        kind: row.kind,
        label: row.label,
        url: data?.signedUrl ?? null,
        isImage: IMAGE.test(row.path),
      };
    }),
  );
}
