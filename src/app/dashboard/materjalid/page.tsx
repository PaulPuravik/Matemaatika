import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import type { Material } from "@/lib/types";

export const dynamic = "force-dynamic";

/** What the tutor shared for revision. */
export default async function MaterialsPage() {
  await requireRole("student");
  const supabase = await createClient();

  const { data } = await supabase
    .from("materials")
    .select("*")
    .order("created_at", { ascending: false });

  const materials = (data as Material[]) ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
      <Card title="Materjalid kordamiseks">
        {materials.length === 0 ? (
          <Empty>Õpetaja pole veel midagi jaganud.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {await Promise.all(
              materials.map(async (material) => {
                const { data: signed } = await supabase.storage
                  .from("materials")
                  .createSignedUrl(material.file_path, 60 * 10);

                return (
                  <li key={material.id} className="py-3">
                    <a
                      href={signed?.signedUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="break-words text-sm font-medium underline"
                    >
                      {material.title}
                    </a>
                    {material.audience === "selected" && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        sinule
                      </span>
                    )}
                    <p className="text-sm text-slate-500">
                      {[material.grade, material.topic].filter(Boolean).join(" · ")}
                    </p>
                  </li>
                );
              }),
            )}
          </ul>
        )}
      </Card>
    </main>
  );
}
