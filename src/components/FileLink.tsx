import { createClient } from "@/lib/supabase/server";

/**
 * A link to a file in a private bucket. Signing happens on the server at render
 * time, so the URL in the page is already short-lived and no bucket is public.
 */
export async function FileLink({
  path,
  label,
  bucket = "student-files",
}: {
  path: string;
  label: string;
  bucket?: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);

  return (
    <a
      href={data?.signedUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className="min-w-0 break-words text-sm underline"
    >
      {label}
    </a>
  );
}
