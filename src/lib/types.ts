export type UserRole = "student" | "parent" | "admin";
export type SessionStatus = "upcoming" | "done";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  grade: string | null;
  textbook: string | null;
  school: string | null;
  /** Short name the tutor uses in their calendar, when it differs. */
  calendar_alias: string | null;
  parent_of: string | null;
  approved: boolean;
  approved_at: string | null;
  created_at: string;
};

/** A session as students and parents see it — without the tutor's notes. */
export type PublicSession = {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: SessionStatus;
  created_at: string;
  /** What was covered in the lesson. Written by the tutor, read by both. */
  summary: string | null;
  homework: string | null;
  homework_due: string | null;
};

export type TutorSession = PublicSession & {
  tutor_notes: string | null;
  google_event_id: string | null;
};

export type SessionFocus = {
  id: string;
  session_id: string;
  student_id: string;
  focus_text: string;
  created_at: string;
};

export type SessionFile = {
  id: string;
  /** null when the student attached it outside any scheduled lesson. */
  session_id: string | null;
  student_id: string;
  file_path: string;
  original_name: string;
  uploaded_at: string;
};

export type Test = {
  id: string;
  student_id: string;
  subject: string;
  test_date: string;
  notes: string | null;
  created_at: string;
};

export type Material = {
  id: string;
  title: string;
  file_path: string;
  grade: string | null;
  topic: string | null;
  /** Legacy single-recipient column, superseded by material_recipients. */
  student_id: string | null;
  audience: "all" | "selected";
  created_at: string;
};

export type Grade = {
  id: string;
  student_id: string;
  subject: string;
  mark: string;
  received_on: string;
  notes: string | null;
  created_at: string;
};

export type ParentInvite = {
  id: string;
  student_id: string;
  code: string;
  parent_email: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
};

export type MaterialRecipient = { material_id: string; student_id: string };

/** A box drawn on an image, as fractions of its width and height. */
export type Region = { x: number; y: number; w: number; h: number };

export type Question = {
  id: string;
  student_id: string;
  file_id: string | null;
  material_id: string | null;
  body: string;
  region: Region | null;
  created_at: string;
  answered_at: string | null;
};

export type QuestionReply = {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  created_at: string;
};
