import { Empty } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { PublicSession } from "@/lib/types";

/**
 * Lessons that have already happened, newest first, with what was covered and
 * the homework. Shown to the student and to their parent.
 */
export function LessonHistory({ lessons }: { lessons: PublicSession[] }) {
  if (lessons.length === 0) {
    return <Empty>Toimunud tunde pole veel.</Empty>;
  }

  return (
    <ul className="space-y-4">
      {lessons.map((lesson) => (
        <li key={lesson.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
          <p className="text-sm font-medium">{formatDateTime(lesson.scheduled_at)}</p>

          {lesson.summary ? (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
              {lesson.summary}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">Kokkuvõtet pole lisatud.</p>
          )}

          {lesson.homework && (
            <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Kodutöö
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm">{lesson.homework}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
