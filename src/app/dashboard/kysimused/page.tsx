import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty } from "@/components/ui";
import AskQuestion from "@/components/AskQuestion";
import QuestionThread from "@/components/QuestionThread";
import { askableItems } from "@/lib/student-data";
import type { Material, Question, QuestionReply, SessionFile } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Ask about a specific file — and, on an image, a specific spot on it. */
export default async function QuestionsPage() {
  const profile = await requireRole("student");
  const supabase = await createClient();

  const [items, { data: questions }, { data: replies }, { data: files }, { data: materials }] =
    await Promise.all([
      askableItems(),
      supabase
        .from("questions")
        .select("*")
        .eq("student_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase.from("question_replies").select("*").order("created_at"),
      supabase.from("session_files").select("*"),
      supabase.from("materials").select("*"),
    ]);

  const myQuestions = (questions as Question[]) ?? [];
  const allReplies = (replies as QuestionReply[]) ?? [];
  const myFiles = (files as SessionFile[]) ?? [];
  const myMaterials = (materials as Material[]) ?? [];

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:space-y-6 sm:py-8">
      <Card title="Küsi õpetajalt">
        {items.length === 0 ? (
          <Empty>
            Küsida saab faili kohta. Lae üleval ülevaate all fail üles või oota, kuni
            õpetaja jagab materjali.
          </Empty>
        ) : (
          <AskQuestion items={items} />
        )}
      </Card>

      <Card title="Minu küsimused">
        {myQuestions.length === 0 ? (
          <Empty>Küsimusi pole veel esitatud.</Empty>
        ) : (
          <div className="space-y-5">
            {myQuestions.map((question) => (
              <QuestionThread
                key={question.id}
                question={question}
                replies={allReplies.filter((r) => r.question_id === question.id)}
                file={myFiles.find((f) => f.id === question.file_id) ?? null}
                material={myMaterials.find((m) => m.id === question.material_id) ?? null}
              />
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
