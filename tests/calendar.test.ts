// Exercises the matcher against the shapes a real calendar throws at it.
import { matchEvent, containsName } from "../src/lib/calendar.ts";

let pass = 0, fail = 0;
const check = (label, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS  " : "FAIL  ") + label); };

const students = [
  { id: "raul", full_name: "Raul Tubarik", calendar_alias: null },
  { id: "anna", full_name: "Anna Kask", calendar_alias: null },
  { id: "annika", full_name: "Annika Saar", calendar_alias: null },
  { id: "mart", full_name: "Mart Õun", calendar_alias: "Mardikas" },
  { id: "kaido", full_name: "Kaido Kask", calendar_alias: null },
];

const ev = (summary, description = "") => ({ id: "e1", summary, description, start: "2026-09-01T16:00:00Z" });
const m = (e) => matchEvent(e, students, "Eratund");

check("full name in title", m(ev("Eratund Raul Tubarik")).studentId === "raul");
check("first name only", m(ev("Eratund Raul")).studentId === "raul");
check("name in description", m(ev("Eratund", "Raul Tubarik, logaritmid")).studentId === "raul");
check("alias works", m(ev("Eratund Mardikas")).studentId === "mart");
check("real name still works when alias set", m(ev("Eratund Mart Õun")).studentId === "mart");
check("case insensitive", m(ev("ERATUND raul tubarik")).studentId === "raul");
check("estonian letters", m(ev("Eratund Mart Õun")).studentId === "mart");

check("no keyword is skipped", m(ev("Hambaarst Raul")).kind === "no-keyword");
check("keyword but nobody named", m(ev("Eratund")).kind === "unknown-student");
check("unknown name", m(ev("Eratund Peeter")).kind === "unknown-student");

// "Anna" must not swallow "Annika", and a shared surname must not be ambiguous
check("Anna does not match Annika", m(ev("Eratund Anna Kask")).studentId === "anna");
check("Annika matches itself", m(ev("Eratund Annika Saar")).studentId === "annika");
check("shared first name is not guessed", m(ev("Eratund Anna")).kind !== "matched" || m(ev("Eratund Anna")).studentId === "anna");

// Two students named in one event
const amb = m(ev("Eratund Raul Tubarik ja Anna Kask"));
check("two students is ambiguous", amb.kind === "ambiguous" && amb.candidates.length === 2);

// Kask is a surname shared by Anna and Kaido
const surname = m(ev("Eratund Kask"));
check("bare shared surname does not match", surname.kind === "unknown-student");

// word boundaries
check("substring alone is not a match", containsName("Eratund Raulikene", "Raul") === false);
check("punctuation is a boundary", containsName("Eratund: Raul, 16:00", "Raul") === true);
check("hyphen is a boundary", containsName("Eratund -Raul-", "Raul") === true);
check("empty name never matches", containsName("Eratund", "") === false);

// no keyword configured means every event is considered
check("blank keyword considers all", matchEvent(ev("Matemaatika Raul"), students, "").studentId === "raul");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
