export type UserRole = 'admin' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  name?: string;
  displayName?: string;
  photoURL?: string;
  role: UserRole;
  program?: string;
  yearLevel?: string;
  isBlocked: boolean;
  lastLogin: string;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
  downloadCount: number;
  storageMethod?: 'firebase' | 'drive';
  fileId?: string;
  downloadUrl?: string;
  targetPrograms?: string[];
  targetYears?: string[];
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: 'login' | 'download';
  documentId?: string;
  timestamp: string;
}

export interface PreAuthorizedAdmin {
  email: string;
  addedBy: string;
  createdAt: string;
}

export interface SharedDocument {
  id: string;
  documentId: string;
  studentEmail: string;
  sharedBy: string;
  sharedAt: string;
  title: string;
  url: string;
  downloadUrl?: string;
}
