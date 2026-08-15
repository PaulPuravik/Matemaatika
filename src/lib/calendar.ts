import type { Profile } from "@/lib/types";

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  /** ISO timestamp. Recurring events arrive already expanded into instances. */
  start: string;
};

export type MatchResult =
  | { kind: "matched"; event: CalendarEvent; studentId: string; studentName: string }
  | { kind: "no-keyword"; event: CalendarEvent }
  | { kind: "unknown-student"; event: CalendarEvent }
  | { kind: "ambiguous"; event: CalendarEvent; candidates: string[] };

/**
 * True when `name` appears in `text` as a whole word. Plain `includes` would
 * let "Ann" match "Anna", and JavaScript's \b is ASCII-only, so it would also
 * mis-handle õ, ä, ö and ü.
 */
export function containsName(text: string, name: string): boolean {
  const haystack = text.toLowerCase();
  const needle = name.trim().toLowerCase();
  if (!needle) return false;

  const isLetter = (char: string | undefined) =>
    char !== undefined && /\p{L}|\p{N}/u.test(char);

  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    if (!isLetter(haystack[at - 1]) && !isLetter(haystack[at + needle.length])) {
      return true;
    }
    from = at + 1;
  }
}

/** The names an event may use to refer to a student, most specific first. */
function namesFor(student: Profile, allStudents: Profile[]): string[] {
  const names: string[] = [];

  if (student.calendar_alias?.trim()) names.push(student.calendar_alias.trim());
  if (student.full_name?.trim()) names.push(student.full_name.trim());

  // A bare first name is convenient — "Eratund Raul" — but only safe while no
  // other student shares it.
  const first = student.full_name?.trim().split(/\s+/)[0];
  if (first && first !== student.full_name?.trim()) {
    const shared = allStudents.some(
      (other) =>
        other.id !== student.id &&
        other.full_name?.trim().split(/\s+/)[0]?.toLowerCase() === first.toLowerCase(),
    );
    if (!shared) names.push(first);
  }

  return names;
}

/**
 * Decides which student a calendar event belongs to.
 *
 * Anything without the keyword is ignored outright, so the tutor's private
 * calendar entries never turn into lessons. An event that names nobody, or
 * names two students at once, is reported rather than guessed at.
 */
export function matchEvent(
  event: CalendarEvent,
  students: Profile[],
  keyword: string,
): MatchResult {
  const text = `${event.summary} ${event.description}`;

  if (keyword.trim() && !containsName(text, keyword)) {
    return { kind: "no-keyword", event };
  }

  const hits = students.filter((student) =>
    namesFor(student, students).some((name) => containsName(text, name)),
  );

  if (hits.length === 1) {
    return {
      kind: "matched",
      event,
      studentId: hits[0].id,
      studentName: hits[0].full_name,
    };
  }

  if (hits.length > 1) {
    return { kind: "ambiguous", event, candidates: hits.map((s) => s.full_name) };
  }

  return { kind: "unknown-student", event };
}

export function matchEvents(
  events: CalendarEvent[],
  students: Profile[],
  keyword: string,
): MatchResult[] {
  return events.map((event) => matchEvent(event, students, keyword));
}
