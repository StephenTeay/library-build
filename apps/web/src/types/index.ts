export type UserRole = 'LIBRARIAN' | 'REGISTRAR' | 'LIBRARY_STAFF' | 'HOD' | 'LEVEL_COORDINATOR' | 'LECTURER' | 'STUDENT';
export type ProgrammeType = 'ND' | 'HND';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  matric_no?: string | null;
  full_name: string;
  role: UserRole;
  department_id?: number | null;
  department_name?: string | null;
  department_code?: string | null;
  programme?: ProgrammeType | null;
  level?: number | null;
  status: UserStatus;
  must_change_password?: boolean;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  description?: string;
}

export interface Course {
  id: number;
  code: string;
  title: string;
  department_id: number;
  department_code?: string;
  programme: ProgrammeType;
  level: number;
  semester: number;
  credit_units: number;
  description?: string;
  lecturer_name?: string;
  resource_count?: number;
}

export type ResourceType = 'DOCUMENT' | 'SLIDE' | 'PAST_QUESTION' | 'DATASET' | 'CODE' | 'NOTEBOOK' | 'TOPOLOGY' | 'SPREADSHEET' | 'CASE_STUDY' | 'VIDEO' | 'AUDIO' | 'EXTERNAL_LINK';
export type ResourceVisibility = 'PUBLIC' | 'DEPARTMENT_ONLY' | 'ENROLLED_ONLY';

export interface LearningResource {
  id: string;
  course_id: number;
  title: string;
  description?: string;
  resource_type: ResourceType;
  visibility: ResourceVisibility;
  r2_key?: string | null;
  size_bytes?: number | null;
  mime_type?: string | null;
  external_url?: string | null;
  video_id?: string | null;
  start_seconds?: number | null;
  uploaded_by?: string;
  uploader_name?: string;
  created_at: string;
}

export interface LibraryItem {
  id: number;
  title: string;
  author: string;
  isbn?: string | null;
  call_number: string;
  shelf_location: string;
  copies_total: number;
  copies_available: number;
  department_id?: number | null;
  department_code?: string | null;
}

export interface DiscussionThread {
  id: number;
  course_id: number;
  user_id: string;
  author_name: string;
  author_role: UserRole;
  title: string;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  reply_count?: number;
  created_at: string;
  updated_at: string;
}

export interface DiscussionPost {
  id: number;
  thread_id: number;
  user_id: string;
  author_name: string;
  author_role: UserRole;
  parent_post_id?: number | null;
  content: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PendingStudent {
  id: string;
  email: string;
  matric_no: string;
  full_name: string;
  department_id: number;
  department_code: string;
  department_name: string;
  programme: ProgrammeType;
  level: number;
  matched_verified: boolean;
  email_verified?: boolean;
  email_verified_at?: string | null;
  created_at: string;
}

export interface StaffMember {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id?: number | null;
  department_name?: string | null;
  department_code?: string | null;
  level?: number | null;
  status: UserStatus;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookImportSummary {
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  replacedExisting: boolean;
  errors: Array<{ row: number; title?: string; call_number?: string; reason: string }>;
}

export interface BookshelfItem {
  id: string;
  item_type: 'BOOK' | 'RESOURCE' | 'THESIS';
  item_id: string;
  shelf_status: 'WANT_TO_READ' | 'CURRENTLY_READING' | 'FAVORITE' | 'FINISHED';
  notes?: string | null;
  created_at: string;
  updated_at: string;
  title?: string;
  author_or_creator?: string;
  call_number?: string;
  cover_url?: string;
  copies_available?: number;
  resource_type?: string;
  mime_type?: string;
  file_size_bytes?: number;
  programme?: string;
  academic_session?: string;
}

export interface CourseReserve {
  id: string;
  course_id: number;
  item_type: 'BOOK' | 'RESOURCE';
  item_id: string;
  requirement_level: 'REQUIRED' | 'RECOMMENDED';
  notes?: string | null;
  created_at: string;
  title?: string;
  author?: string;
  call_number?: string;
  copies_available?: number;
  copies_total?: number;
  cover_url?: string;
  resource_type?: string;
  mime_type?: string;
}

export interface AggregatorItem {
  id: string;
  source: 'arXiv' | 'Google Books' | 'Open Library' | 'Project Gutenberg' | 'Academic & Tech News' | 'GitHub' | 'Curated Hub';
  title: string;
  description: string;
  authors?: string;
  published?: string;
  thumbnail?: string;
  category?: string;
  readerType: 'pdf' | 'google_books' | 'open_library' | 'gutenberg' | 'news' | 'external';
  readUrl: string;
  externalUrl: string;
}



