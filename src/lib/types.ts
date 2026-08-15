export type UserRole = "student" | "parent" | "admin";
export type SessionStatus = "upcoming" | "done";

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  grade: string | null;
  textbook: string | null;
  school: string | null;
  parent_of: string | null;
  created_at: string;
};

/** A session as students and parents see it — without the tutor's notes. */
export type PublicSession = {
  id: string;
  student_id: string;
  scheduled_at: string;
  status: SessionStatus;
  created_at: string;
};

export type TutorSession = PublicSession & { tutor_notes: string | null };

export type SessionFocus = {
  id: string;
  session_id: string;
  student_id: string;
  focus_text: string;
  created_at: string;
};

export type SessionFile = {
  id: string;
  session_id: string;
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
  /** null = shared with everyone; set = visible only to that student. */
  student_id: string | null;
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
