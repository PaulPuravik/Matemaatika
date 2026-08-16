import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Empty } from "@/components/ui";
import ReplyForm from "@/components/ReplyForm";
import RegionPreview from "@/components/RegionPreview";
import type { Material, Question, QuestionReply, SessionFile } from "@/lib/types";

const IMAGE = /\.(jpe?g|png|webp|heic|gif)$/i;

/**
 * One question with its replies. The tutor sees a reply box that also marks the
 * question answered; the student sees one that just adds to the thread.
 */
export default async function QuestionThread({
  question,
  replies,
  file,
  material,
  asTutor = false,
}: {
  question: Question;
  replies: QuestionReply[];
  file: SessionFile | null;
  material: Material | null;
  asTutor?: boolean;
}) {
  const path = file?.file_path ?? material?.file_path ?? null;
  const bucket = file ? "student-files" : "materials";
  const label = file?.original_name ?? material?.title ?? null;

  let url: string | null = null;
  if (path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    url = data?.signedUrl ?? null;
  }

  const isImage = path ? IMAGE.test(path) : false;

  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{formatDateTime(question.created_at)}</p>
        {question.answered_at ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Vastatud
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
            Ootab vastust
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-line text-sm">{question.body}</p>

      {label && (
        <p className="mt-2 text-sm text-slate-500">
          Fail:{" "}
          <a href={url ?? "#"} target="_blank" rel="noreferrer" className="break-words underline">
            {label}
          </a>
        </p>
      )}

      {isImage && url && question.region && (
        <RegionPreview url={url} region={question.region} alt={label ?? "Küsimuse pilt"} />
      )}

      {replies.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {replies.map((reply) => (
            <li key={reply.id}>
              <p className="text-xs text-slate-500">{formatDateTime(reply.created_at)}</p>
              <p className="whitespace-pre-line text-sm">{reply.body}</p>
            </li>
          ))}
        </ul>
      )}

      {replies.length === 0 && !asTutor && (
        <div className="mt-3">
          <Empty>Õpetaja pole veel vastanud.</Empty>
        </div>
      )}

      <div className="mt-3">
        <ReplyForm questionId={question.id} asTutor={asTutor} />
      </div>
    </article>
  );
}
