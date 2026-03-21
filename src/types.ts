export type UserRole = 'admin' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  program?: string;
  isBlocked: boolean;
  lastLogin: string;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
  downloadCount: number;
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
