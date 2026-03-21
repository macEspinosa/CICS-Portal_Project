/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo, Component } from 'react';
import { 
  auth, db, googleProvider, signInWithPopup, onAuthStateChanged, signOut,
  doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, getDocs, onSnapshot, orderBy, limit, increment, deleteDoc,
  ref, uploadBytesResumable, getDownloadURL, storage
} from '../firebase';
import { UserProfile, Document, ActivityLog, UserRole, PreAuthorizedAdmin, SharedDocument } from '../types';
import { 
  LayoutDashboard, FileText, Users, LogOut, Search, Download, 
  Plus, ShieldAlert, ShieldCheck, BarChart3, Clock, GraduationCap,
  AlertCircle, CheckCircle2, XCircle, Loader2, Filter, Settings, Eye, EyeOff, Trash2,
  CheckCircle, Save, Upload, Cloud, Link, ExternalLink, User, Share2, Send, Menu, X,
  Mail, UserPlus
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ADMIN_EMAIL = "mariaantonette.espinosa@neu.edu.ph";
const ALLOWED_DOMAIN = "neu.edu.ph";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };

  constructor(props: any) {
    super(props);
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayMessage = "Something went wrong.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.error.includes('permission-denied')) {
            displayMessage = "You don't have permission to access this data. Please contact an administrator.";
          }
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-stone-900 mb-2">Application Error</h2>
            <p className="text-stone-600 mb-8">{displayMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const PROGRAMS = [
  "BSCS",
  "BSIT",
  "BSEMC(Digital Animation Technology)",
  "BSEMC(Game Development)",
  "BSIS",
  "BLIS"
];

const YEAR_LEVELS = [
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year"
];

const CATEGORIES = [
  "Institutional Forms",
  "Academic Guides",
  "Official Requests",
  "Institutional Records ",
  "Administrative Reports",
  "Student Clearance",
  "Course Syllabi",
  "Official Announcements",
  "Policies & Guidelines",
  "Other"
];

const COLORS = ['#059669', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#64748b'];

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'documents' | 'users' | 'settings' | 'profile'>('dashboard');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewProgram, setPreviewProgram] = useState<string>(PROGRAMS[0]);
  const [previewYearLevel, setPreviewYearLevel] = useState<string>(YEAR_LEVELS[0]);
  const [appError, setAppError] = useState<Error | null>(null);
  const [needsSetup, setNeedsSetup] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [shareDoc, setShareDoc] = useState<Document | null>(null);
  const [shareStudent, setShareStudent] = useState<UserProfile | null>(null);
  const [confirmAdminRemoval, setConfirmAdminRemoval] = useState<UserProfile | null>(null);
  const [confirmPreAuthRemoval, setConfirmPreAuthRemoval] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lastLoginUpdated = React.useRef(false);

  const performAdminRemoval = async (admin: UserProfile | null) => {
    if (!user || !admin) return;
    setIsDeleting(true);
    try {
      // 1. Delete from users collection
      await deleteDoc(doc(db, 'users', admin.uid));
      
      // 2. Also remove from pre-authorized admins to prevent automatic re-promotion on next login
      await deleteDoc(doc(db, 'preAuthorizedAdmins', admin.email));
      
      // 3. Log the action
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        action: 'remove_admin',
        targetEmail: admin.email,
        timestamp: new Date().toISOString()
      });
      setToast({ message: "Administrator removed successfully", type: 'success' });
      setConfirmAdminRemoval(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${admin.uid}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const performPreAuthRemoval = async (email: string | null) => {
    if (!user || !email) return;
    setIsDeleting(true);
    const path = `preAuthorizedAdmins/${email}`;
    try {
      await deleteDoc(doc(db, 'preAuthorizedAdmins', email));
      setToast({ message: "Authorization removed successfully", type: 'success' });
      setConfirmPreAuthRemoval(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    } finally {
      setIsDeleting(false);
    }
  };

  // Trigger ErrorBoundary if appError is set
  if (appError) throw appError;

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("User logged in:", firebaseUser.email);
        if (!firebaseUser.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          console.warn("Invalid email domain:", firebaseUser.email);
          setError(`Only ${ALLOWED_DOMAIN} emails are allowed.`);
          await signOut(auth);
          setLoading(false);
          return;
        }

        // Set up real-time listener for user profile
        profileUnsub = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
          console.log("Profile snapshot exists:", snapshot.exists());
          if (snapshot.exists()) {
            const userData = snapshot.data() as UserProfile;
            console.log("User data:", userData);
            if (userData.isBlocked) {
              console.warn("User is blocked:", firebaseUser.email);
              setError("Your account has been blocked. Please contact an administrator.");
              setUser(null);
              await signOut(auth);
            } else {
              setUser(userData);
              if (userData.role === 'student' && view === 'dashboard') {
                setView('documents');
              }
              setError(null);

              // Update lastLogin once per session
              if (!lastLoginUpdated.current) {
                lastLoginUpdated.current = true;
                updateDoc(doc(db, 'users', firebaseUser.uid), {
                  lastLogin: new Date().toISOString()
                }).catch(err => console.error("Error updating lastLogin:", err));
              }
            }
            setLoading(false);
          } else {
            console.log("Checking pre-auth for:", firebaseUser.email);
            // New user logic
            try {
              const preAuthDoc = await getDoc(doc(db, 'preAuthorizedAdmins', firebaseUser.email!));
              const isPreAuthAdmin = preAuthDoc.exists();
              const isInitialAdmin = firebaseUser.email === ADMIN_EMAIL;
              console.log("Is pre-auth admin:", isPreAuthAdmin, "Is initial admin:", isInitialAdmin);
              
              if (isInitialAdmin || isPreAuthAdmin) {
                console.log("Creating admin profile...");
                const newUser: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email!,
                  displayName: firebaseUser.displayName || undefined,
                  photoURL: firebaseUser.photoURL || undefined,
                  role: 'admin',
                  isBlocked: false,
                  lastLogin: new Date().toISOString()
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                
                await addDoc(collection(db, 'logs'), {
                  userId: firebaseUser.uid,
                  action: 'signup',
                  timestamp: new Date().toISOString()
                });
              } else {
                console.log("User needs setup:", firebaseUser.email);
                // Regular students need to go through setup
                setNeedsSetup(firebaseUser);
                setLoading(false);
              }
            } catch (err) {
              console.error("Error checking pre-auth status:", err);
              // If we can't check admin status, default to student setup
              setNeedsSetup(firebaseUser);
              setLoading(false);
            }
          }
        }, (err) => {
          console.error("Profile listener error:", err);
          setAppError(err);
          setLoading(false);
        });

      } else {
        console.log("No user logged in");
        setUser(null);
        setNeedsSetup(null);
        if (profileUnsub) profileUnsub();
        setLoading(false);
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const handleDelete = async (docObj: Document) => {
    setIsDeleting(true);
    try {
      // 1. Delete from Google Drive if applicable
      if (docObj.storageMethod === 'drive' && docObj.fileId) {
        const response = await fetch(`/api/delete/${docObj.fileId}`, {
          method: 'DELETE'
        });
        if (!response.ok) {
          console.warn("Could not delete file from Google Drive, but proceeding with database deletion.");
        }
      }

      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'documents', docObj.id));

      // 3. Log the deletion
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        action: 'delete_document',
        documentId: docObj.id,
        documentTitle: docObj.title,
        timestamp: new Date().toISOString()
      });

      setToast({ message: "Document deleted successfully", type: 'success' });
      setConfirmDelete(null);
    } catch (err: any) {
      console.error("Delete error:", err);
      setToast({ message: "Failed to delete document: " + err.message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (docObj: Document) => {
    if (!user) return;
    if (user.isBlocked) {
      setToast({ message: "Your account is restricted. You cannot download documents at this time.", type: 'error' });
      return;
    }

    // Use downloadUrl if available (for Google Drive), otherwise use url
    const downloadLink = docObj.downloadUrl || docObj.url;
    if (!downloadLink) {
      setToast({ message: "Download link not available", type: 'error' });
      return;
    }

    // Open window immediately to avoid popup blockers
    const win = window.open(downloadLink, '_blank');
    if (!win) {
      setToast({ message: "Popup blocked! Please allow popups to download files.", type: 'error' });
    }

    try {
      // Log the download in the background
      updateDoc(doc(db, 'documents', docObj.id), {
        downloadCount: increment(1)
      }).catch(console.error);
      
      addDoc(collection(db, 'logs'), {
        userId: user.uid,
        action: 'download',
        documentId: docObj.id,
        timestamp: new Date().toISOString()
      }).catch(console.error);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (needsSetup) {
    return <UserSetup firebaseUser={needsSetup} onComplete={() => setNeedsSetup(null)} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-black/5">
          <div className="flex flex-col items-center gap-4 mb-6">
            <img 
              src="https://neu.edu.ph/main/img/neu.png" 
              alt="NEU Logo" 
              className="h-24 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-stone-900 mb-2">CICS Document Portal</h1>
          <p className="text-stone-500 text-center mb-8">Sign in with your @neu.edu.ph account to continue.</p>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row">
        {/* Mobile Header */}
        <div className="md:hidden bg-white border-b border-black/5 h-16 flex items-center justify-between px-4 sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <img 
              src="https://neu.edu.ph/main/img/neu.png" 
              alt="NEU Logo" 
              className="w-8 h-8 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="font-bold text-stone-900">CICS Portal</span>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-stone-500 hover:bg-stone-50 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Sidebar Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={cn(
          "fixed inset-y-0 left-0 w-64 bg-white border-r border-black/5 flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-6 border-bottom border-black/5">
            <div className="hidden md:flex items-center gap-3 mb-8">
              <img 
                src="https://neu.edu.ph/main/img/neu.png" 
                alt="NEU Logo" 
                className="w-8 h-8 object-contain"
                referrerPolicy="no-referrer"
              />
              <span className="font-bold text-stone-900">CICS Portal</span>
            </div>
            
            <nav className="space-y-1">
              {user.role === 'admin' && (
                <NavItem 
                  active={view === 'dashboard'} 
                  onClick={() => { setView('dashboard'); setMobileMenuOpen(false); }} 
                  icon={<LayoutDashboard className="w-5 h-5" />} 
                  label="Dashboard" 
                />
              )}
              <NavItem 
                active={view === 'documents'} 
                onClick={() => { setView('documents'); setMobileMenuOpen(false); }} 
                icon={<FileText className="w-5 h-5" />} 
                label="Documents" 
              />
              {user.role === 'student' && (
                <NavItem 
                  active={view === 'profile'} 
                  onClick={() => { setView('profile'); setMobileMenuOpen(false); }} 
                  icon={<User className="w-5 h-5" />} 
                  label="My Profile" 
                />
              )}
              {user.role === 'admin' && (
                <>
                  <NavItem 
                    active={view === 'users'} 
                    onClick={() => { setView('users'); setMobileMenuOpen(false); }} 
                    icon={<Users className="w-5 h-5" />} 
                    label="Users" 
                  />
                  <NavItem 
                    active={view === 'settings'} 
                    onClick={() => { setView('settings'); setMobileMenuOpen(false); }} 
                    icon={<Settings className="w-5 h-5" />} 
                    label="Settings" 
                  />
                </>
              )}
            </nav>
          </div>

          <div className="mt-auto p-6 border-t border-black/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-600 font-bold">
                {(user.name || user.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{user.name || user.email}</p>
                <p className="text-xs text-stone-500 capitalize">{user.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 text-stone-500 hover:text-red-600 text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <header className="h-16 bg-white border-b border-black/5 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10">
            <div className="flex items-center gap-2 md:gap-4 flex-1">
              <h2 className="text-sm md:text-lg font-semibold text-stone-900 capitalize truncate">
                {isPreviewMode ? "Student View (Preview)" : view}
              </h2>
              {user.role === 'admin' && (
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => setIsPreviewMode(!isPreviewMode)}
                    className={cn(
                      "flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-medium transition-all",
                      isPreviewMode 
                        ? "bg-blue-50 text-blue-700 border border-blue-100" 
                        : "bg-stone-50 text-stone-600 border border-stone-200 hover:bg-stone-100"
                    )}
                  >
                    {isPreviewMode ? <EyeOff className="w-3 md:w-4 h-3 md:h-4" /> : <Eye className="w-3 md:w-4 h-3 md:h-4" />}
                    <span className="hidden sm:inline">{isPreviewMode ? "Exit Preview" : "Preview Student View"}</span>
                    <span className="sm:hidden">{isPreviewMode ? "Exit" : "Preview"}</span>
                  </button>

                  {isPreviewMode && (
                    <div className="flex items-center gap-1 md:gap-2 animate-in fade-in slide-in-from-left-4 duration-300">
                      <div className="h-4 w-px bg-stone-200 mx-1" />
                      <select
                        value={previewProgram}
                        onChange={(e) => setPreviewProgram(e.target.value)}
                        className="text-[10px] md:text-xs p-1 md:p-1.5 bg-stone-50 border border-stone-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500 max-w-[80px] md:max-w-none"
                      >
                        {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select
                        value={previewYearLevel}
                        onChange={(e) => setPreviewYearLevel(e.target.value)}
                        className="text-[10px] md:text-xs p-1 md:p-1.5 bg-stone-50 border border-stone-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-sm text-stone-500">
              <Clock className="w-3 md:w-4 h-3 md:h-4 hidden sm:block" />
              <span className="hidden sm:block">{format(new Date(), 'EEEE, MMMM do')}</span>
              <span className="sm:hidden">{format(new Date(), 'MMM d')}</span>
            </div>
          </header>

          <div className="p-4 md:p-8">
            {isPreviewMode ? (
              <DocumentsView 
                user={{
                  ...user, 
                  role: 'student', 
                  program: previewProgram, 
                  yearLevel: previewYearLevel
                }} 
                setAppError={setAppError} 
                handleDownload={handleDownload} 
                handleDelete={(doc) => { setConfirmDelete(doc); return Promise.resolve(); }} 
                setToast={setToast}
              />
            ) : (
              <>
                {view === 'dashboard' && user.role === 'admin' && <DashboardView user={user} setAppError={setAppError} handleDownload={handleDownload} handleDelete={(doc) => { setConfirmDelete(doc); return Promise.resolve(); }} onShare={(doc) => setShareDoc(doc)} />}
                {view === 'documents' && <DocumentsView user={user} setAppError={setAppError} handleDownload={handleDownload} handleDelete={(doc) => { setConfirmDelete(doc); return Promise.resolve(); }} onShare={(doc) => setShareDoc(doc)} setToast={setToast} />}
                {view === 'profile' && <ProfileView user={user} setAppError={setAppError} setToast={setToast} />}
                {view === 'users' && user.role === 'admin' && <UsersView currentUser={user} onShareStudent={(student) => setShareStudent(student)} setToast={setToast} />}
                {view === 'settings' && user.role === 'admin' && (
                  <SettingsView 
                    user={user} 
                    setAppError={setAppError} 
                    setToast={setToast}
                    setConfirmAdminRemoval={setConfirmAdminRemoval}
                    setConfirmPreAuthRemoval={setConfirmPreAuthRemoval}
                  />
                )}
              </>
            )}
          </div>
        </main>

        {/* Share Modal */}
        {shareDoc && (
          <ShareModal 
            doc={shareDoc} 
            user={user} 
            onClose={() => setShareDoc(null)} 
            setToast={setToast} 
          />
        )}

        {/* Student Share Modal */}
        {shareStudent && (
          <StudentShareModal 
            student={shareStudent} 
            user={user} 
            onClose={() => setShareStudent(null)} 
            setToast={setToast} 
          />
        )}

        {/* Delete Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-black/5">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 mb-2">Delete Document?</h3>
              <p className="text-stone-500 mb-8">
                Are you sure you want to delete <span className="font-semibold text-stone-900">"{confirmDelete.title}"</span>? 
                This action will remove the file from the portal and Google Drive. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Removal Confirmation Modal */}
        {confirmAdminRemoval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-black/5">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 mb-2">Remove Administrator?</h3>
              <p className="text-stone-500 mb-8">
                Are you sure you want to remove <span className="font-semibold text-stone-900">{confirmAdminRemoval.displayName || confirmAdminRemoval.email}</span> as an administrator? 
                This will delete their user profile and revoke their admin access.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmAdminRemoval(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performAdminRemoval(confirmAdminRemoval)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pre-auth Removal Confirmation Modal */}
        {confirmPreAuthRemoval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-black/5">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 mb-2">Remove Authorization?</h3>
              <p className="text-stone-500 mb-8">
                Are you sure you want to remove authorization for <span className="font-semibold text-stone-900">{confirmPreAuthRemoval}</span>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmPreAuthRemoval(null)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => performPreAuthRemoval(confirmPreAuthRemoval)}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-8 right-8 z-50 animate-in fade-in slide-in-from-bottom-4">
            <div className={cn(
              "flex items-center gap-3 px-6 py-4 rounded-2xl shadow-lg border",
              toast.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-red-50 border-red-100 text-red-800"
            )}>
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
              <span className="text-sm font-medium">{toast.message}</span>
              <button onClick={() => setToast(null)} className="ml-4 text-stone-400 hover:text-stone-600">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
        active 
          ? "bg-emerald-50 text-emerald-700 shadow-sm" 
          : "text-stone-500 hover:bg-stone-50 hover:text-stone-900"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function UserSetup({ firebaseUser, onComplete }: { firebaseUser: any, onComplete: () => void }) {
  const [name, setName] = useState(firebaseUser.displayName || "");
  const [program, setProgram] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !program || !yearLevel) return;

    setLoading(true);
    try {
      const newUser: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email!,
        name: name,
        displayName: firebaseUser.displayName || undefined,
        photoURL: firebaseUser.photoURL || undefined,
        role: 'student',
        program,
        yearLevel,
        isBlocked: false,
        lastLogin: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
      
      await addDoc(collection(db, 'logs'), {
        userId: firebaseUser.uid,
        action: 'signup',
        timestamp: new Date().toISOString()
      });
      
      onComplete();
    } catch (err) {
      console.error("Error completing setup:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-black/5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center mb-6">
          <img 
            src="https://neu.edu.ph/main/img/neu.png" 
            alt="NEU Logo" 
            className="h-20 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Account Setup</h1>
        <p className="text-stone-500 mb-8">Please complete your profile to access the portal.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Full Name</label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Undergraduate Program</label>
            <select
              required
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
            >
              <option value="">Select a program...</option>
              {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Year Level</label>
            <select
              required
              value={yearLevel}
              onChange={(e) => setYearLevel(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
            >
              <option value="">Select year level...</option>
              {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button
            type="submit"
            disabled={!name || !program || !yearLevel || loading}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Complete Setup
          </button>
        </form>
      </div>
    </div>
  );
}

function DashboardView({ user, setAppError, handleDownload, handleDelete, onShare }: { user: UserProfile, setAppError: (err: Error) => void, handleDownload: (doc: Document) => Promise<void>, handleDelete: (doc: Document) => Promise<void>, onShare?: (doc: Document) => void }) {
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [stats, setStats] = useState({ docs: 0, downloads: 0 });
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  useEffect(() => {
    if (user.role !== 'admin') return;
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(d => d.data() as UserProfile));
    }, (error) => {
      setAppError(error);
    });
    return () => unsub();
  }, [user.role]);

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document));
      setAllDocs(docs);
      setRecentDocs(docs.slice(0, 5));
      setStats(prev => ({ ...prev, docs: docs.length }));
    }, (error) => {
      setAppError(error);
    });
    return () => unsub();
  }, [user.role]);

  useEffect(() => {
    const q = user.role === 'admin' 
      ? query(collection(db, 'logs'), orderBy('timestamp', 'desc'))
      : query(collection(db, 'logs'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
      
    const unsub = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog)));
    }, (error) => {
      setAppError(error);
    });
    return () => unsub();
  }, [user.role, user.uid]);

  const chartData = useMemo(() => {
    const now = new Date();
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const data: { name: string, logins: number, downloads: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i);
      const dateStr = format(date, 'MMM d');
      const dayLogs = logs.filter(l => {
        const logDate = parseISO(l.timestamp);
        return isWithinInterval(logDate, { start: startOfDay(date), end: endOfDay(date) });
      });

      data.push({
        name: dateStr,
        logins: dayLogs.filter(l => l.action === 'login').length,
        downloads: dayLogs.filter(l => l.action === 'download').length
      });
    }
    return data;
  }, [logs, period]);

  const combinedData = useMemo(() => {
    const now = new Date();
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const filteredLogs = logs.filter(l => {
      const logDate = parseISO(l.timestamp);
      return isWithinInterval(logDate, { 
        start: startOfDay(subDays(now, days - 1)), 
        end: endOfDay(now) 
      });
    });

    if (user.role === 'student') {
      // For students, show their own activity summary
      return [
        { name: 'My Logins', value: filteredLogs.filter(l => l.action === 'login').length },
        { name: 'My Downloads', value: filteredLogs.filter(l => l.action === 'download').length }
      ];
    }

    // For admins, show Document Distribution by Program
    return PROGRAMS.map(p => {
      let name = p;
      if (p.includes('Digital Animation')) name = 'BSEMC-DAT';
      else if (p.includes('Game Development')) name = 'BSEMC-GD';
      
      const count = allDocs.filter(d => 
        (d.targetPrograms || ['All']).includes('All') || 
        (d.targetPrograms || []).includes(p)
      ).length;

      return {
        name,
        value: count
      };
    }).filter(d => d.value > 0);
  }, [allDocs, logs, period, user.role]);

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <p className="text-stone-500">Here's what's happening in the CICS Portal today.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={<FileText className="w-6 h-6 text-emerald-600" />} 
          label="Available Documents" 
          value={stats.docs.toString()} 
          trend={user.role === 'admin' ? "+2 this week" : undefined}
        />
        <StatCard 
          icon={<GraduationCap className="w-6 h-6 text-blue-600" />} 
          label={user.role === 'admin' ? "Total Users" : "My Program"} 
          value={user.role === 'admin' ? users.length.toString() : (user.program || "Not Set")} 
        />
        <StatCard 
          icon={<Download className="w-6 h-6 text-purple-600" />} 
          label={user.role === 'admin' ? "Total Downloads" : "My Downloads"} 
          value={logs.filter(l => l.action === 'download').length.toString()} 
          trend={user.role === 'admin' ? "+12% from last month" : undefined}
        />
      </div>

      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-bold text-stone-900">Activity Overview</h3>
          <div className="flex bg-white border border-stone-200 rounded-xl p-1 w-full sm:w-auto overflow-x-auto">
            {(['daily', 'weekly', 'monthly'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "flex-1 sm:flex-none px-4 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-all whitespace-nowrap",
                  period === p ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-900"
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
            <h4 className="text-sm font-semibold text-stone-500 mb-8 uppercase tracking-wider">
              {user.role === 'admin' ? "Activity Trends" : "My Activity Trends"}
            </h4>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    dy={10}
                  />
                  <YAxis 
                    allowDecimals={false}
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 12, fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="logins" 
                    stroke="#059669" 
                    strokeWidth={3} 
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="Logins" 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="downloads" 
                    stroke="#2563eb" 
                    strokeWidth={3} 
                    dot={false}
                    activeDot={{ r: 6 }}
                    name="Downloads" 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
              <h4 className="text-sm font-semibold text-stone-500 mb-8 uppercase tracking-wider">
                {user.role === 'admin' ? "Program Distribution" : "Activity Summary"}
              </h4>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={combinedData}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {combinedData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        borderRadius: '12px', 
                        border: 'none', 
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {combinedData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-[10px] text-stone-600 font-medium">{entry.name}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 font-mono">{entry.value}</span>
                  </div>
                ))}
                {combinedData.length === 0 && (
                  <p className="text-[10px] text-stone-400 text-center italic">No activity yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-6">
        <h3 className="text-lg font-bold text-stone-900 mb-6">Recently Added Documents</h3>
        <div className="space-y-4">
          {recentDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-xl hover:bg-stone-100 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <FileText className="w-5 h-5 text-stone-400" />
                </div>
                <div>
                  <h4 className="font-medium text-stone-900">{doc.title}</h4>
                  <p className="text-xs text-stone-500">{format(parseISO(doc.createdAt), 'MMM d, yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDownload(doc)}
                  className="p-2 text-stone-400 hover:text-emerald-600 transition-colors"
                >
                  <Download className="w-5 h-5" />
                </button>
                {user.role === 'admin' && (
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => onShare?.(doc)}
                      className="p-2 text-stone-400 hover:text-blue-600 transition-colors"
                      title="Share with Students"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleDelete(doc)}
                      className="p-2 text-stone-400 hover:text-red-600 transition-colors"
                      title="Delete Document"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {recentDocs.length === 0 && (
            <p className="text-center py-8 text-stone-500 italic">No documents available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend }: { icon: React.ReactNode, label: string, value: string, trend?: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-stone-50 rounded-lg">{icon}</div>
        {trend && <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{trend}</span>}
      </div>
      <p className="text-sm text-stone-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

function DocumentsView({ user, setAppError, handleDownload, handleDelete, onShare, setToast }: { user: UserProfile, setAppError: (err: Error) => void, handleDownload: (doc: Document) => Promise<void>, handleDelete: (doc: Document) => Promise<void>, onShare?: (doc: Document) => void, setToast: (t: any) => void }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'shared'>('all');
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({ 
    title: '', 
    description: '', 
    category: CATEGORIES[0], 
    customCategory: '',
    targetPrograms: ['All'] as string[],
    targetYears: ['All'] as string[]
  });
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [isUploadingToStorage, setIsUploadingToStorage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [storageMethod, setStorageMethod] = useState<'drive' | 'link'>('drive');
  const [externalLink, setExternalLink] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        setIsDriveConnected(data.isAuthenticated);
      } catch (err) {
        console.error("Error checking auth status:", err);
      }
    };
    checkAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsDriveConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectDrive = async () => {
    try {
      const res = await fetch('/api/auth/url');
      if (!res.ok) throw new Error("Failed to get authorization URL");
      const { url } = await res.json();
      const authWindow = window.open(url, 'google_auth', 'width=600,height=700');
      if (!authWindow) {
        setToast({ message: "Popup blocked! Please allow popups for this site to connect Google Drive.", type: 'error' });
      }
    } catch (err) {
      console.error("Error getting auth URL:", err);
      setToast({ message: "Failed to connect to Google Drive. Check your configuration.", type: 'error' });
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document));
      setDocs(allDocs);
    }, (error) => {
      setAppError(error);
    });

    return () => unsub();
  }, [user.role]);

  useEffect(() => {
    if (user.role !== 'student') return;
    const q = query(collection(db, 'shared_documents'), where('studentEmail', '==', user.email), orderBy('sharedAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setSharedDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SharedDocument)));
    }, (error) => {
      console.error("Error fetching shared documents:", error);
    });
    return () => unsub();
  }, [user.role, user.email]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingFile(file);
      // Automatically set the title from the file name (removing extension)
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      setUploadForm(prev => ({ ...prev, title: fileName }));
    }
  };

  const filteredDocs = docs.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase()) || 
                         d.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "All" || d.category === categoryFilter;
    
    if (user.role === 'student') {
      const matchesProgram = !d.targetPrograms || d.targetPrograms.includes('All') || d.targetPrograms.includes(user.program || '');
      const matchesYear = !d.targetYears || d.targetYears.includes('All') || d.targetYears.includes(user.yearLevel || '');
      return matchesSearch && matchesCategory && matchesProgram && matchesYear;
    }
    
    return matchesSearch && matchesCategory;
  });

  const filteredSharedDocs = sharedDocs.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.title) return;

    setIsUploadingToStorage(true);
    setUploadProgress(0);
    
    try {
      let fileUrl = '';
      let fileId = '';

      const finalCategory = uploadForm.category === 'Other' ? uploadForm.customCategory : uploadForm.category;
      if (uploadForm.category === 'Other' && !uploadForm.customCategory) {
        throw new Error("Please specify the category");
      }

      if (storageMethod === 'drive') {
        if (!uploadingFile) {
          throw new Error("Please select a file to upload");
        }
        if (!isDriveConnected) {
          throw new Error("Please connect your Google Drive first");
        }

        const formData = new FormData();
        formData.append('file', uploadingFile);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }

        const data = await response.json();
        fileUrl = data.url;
        fileId = data.id;
        const downloadUrl = data.downloadUrl;

        const newDoc = {
          title: uploadForm.title,
          description: uploadForm.description,
          category: finalCategory,
          url: fileUrl,
          downloadUrl: downloadUrl,
          fileId: fileId,
          storageMethod: storageMethod,
          uploadedBy: user.uid,
          createdAt: new Date().toISOString(),
          downloadCount: 0,
          targetPrograms: uploadForm.targetPrograms,
          targetYears: uploadForm.targetYears
        };
        
        await addDoc(collection(db, 'documents'), newDoc);
      } else {
        if (!externalLink) {
          throw new Error("Please provide an external link");
        }
        fileUrl = externalLink;

        const newDoc = {
          title: uploadForm.title,
          description: uploadForm.description,
          category: finalCategory,
          url: fileUrl,
          storageMethod: storageMethod,
          uploadedBy: user.uid,
          createdAt: new Date().toISOString(),
          downloadCount: 0,
          targetPrograms: uploadForm.targetPrograms,
          targetYears: uploadForm.targetYears
        };
        
        await addDoc(collection(db, 'documents'), newDoc);
      }
      
      setUploadForm({ title: '', description: '', category: CATEGORIES[0], customCategory: '', targetPrograms: ['All'], targetYears: ['All'] });
      setUploadingFile(null);
      setExternalLink('');
      setIsUploading(false);
      setIsUploadingToStorage(false);
      setUploadProgress(100);
    } catch (err: any) {
      console.error("Upload error:", err);
      setToast({ message: err.message || "Failed to upload document.", type: 'error' });
      setIsUploadingToStorage(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
        <div className="flex flex-col sm:flex-row flex-1 gap-4 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
            />
          </div>
          {activeTab === 'all' && (
            <div className="relative w-full sm:w-48">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all appearance-none text-sm"
              >
                <option value="All">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 justify-between sm:justify-end">
          {user.role === 'student' && (
            <div className="flex bg-white border border-stone-200 rounded-xl p-1 flex-1 sm:flex-none">
              <button
                className="flex-1 sm:flex-none px-4 py-1.5 text-[10px] md:text-xs font-medium rounded-lg bg-stone-900 text-white shadow-sm whitespace-nowrap"
              >
                All Documents
              </button>
            </div>
          )}
          {user.role === 'admin' && (
            <button
              onClick={() => setIsUploading(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors whitespace-nowrap text-sm"
            >
              <Plus className="w-5 h-5" />
              Upload
            </button>
          )}
        </div>
      </div>

      {isUploading && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpload} className="bg-white rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-stone-100">
              <h3 className="text-xl font-bold text-stone-900">Upload New Document</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-stone-700">Title</label>
                <input
                  required
                  type="text"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-stone-700">Category</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {uploadForm.category === 'Other' && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-medium text-stone-700">Specify Category</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g., Student Handbook"
                    value={uploadForm.customCategory}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, customCategory: e.target.value }))}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-sm font-medium text-stone-700">Description</label>
                <textarea
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-stone-700">Target Programs</label>
                  <div className="flex flex-wrap gap-1 p-2 bg-stone-50 border border-stone-200 rounded-lg max-h-32 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (uploadForm.targetPrograms.includes('All')) {
                          setUploadForm(prev => ({ ...prev, targetPrograms: [] }));
                        } else {
                          setUploadForm(prev => ({ ...prev, targetPrograms: ['All'] }));
                        }
                      }}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md transition-colors",
                        uploadForm.targetPrograms.includes('All') ? "bg-stone-900 text-white" : "bg-white text-stone-500 border border-stone-200"
                      )}
                    >
                      All
                    </button>
                    {PROGRAMS.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          const newPrograms = uploadForm.targetPrograms.includes(p)
                            ? uploadForm.targetPrograms.filter(x => x !== p)
                            : [...uploadForm.targetPrograms.filter(x => x !== 'All'), p];
                          setUploadForm(prev => ({ ...prev, targetPrograms: newPrograms.length === 0 ? ['All'] : newPrograms }));
                        }}
                        className={cn(
                          "px-2 py-1 text-[10px] rounded-md transition-colors",
                          uploadForm.targetPrograms.includes(p) ? "bg-emerald-600 text-white" : "bg-white text-stone-500 border border-stone-200"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-stone-700">Target Year Levels</label>
                  <div className="flex flex-wrap gap-1 p-2 bg-stone-50 border border-stone-200 rounded-lg max-h-32 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (uploadForm.targetYears.includes('All')) {
                          setUploadForm(prev => ({ ...prev, targetYears: [] }));
                        } else {
                          setUploadForm(prev => ({ ...prev, targetYears: ['All'] }));
                        }
                      }}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md transition-colors",
                        uploadForm.targetYears.includes('All') ? "bg-stone-900 text-white" : "bg-white text-stone-500 border border-stone-200"
                      )}
                    >
                      All
                    </button>
                    {YEAR_LEVELS.map(y => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => {
                          const newYears = uploadForm.targetYears.includes(y)
                            ? uploadForm.targetYears.filter(x => x !== y)
                            : [...uploadForm.targetYears.filter(x => x !== 'All'), y];
                          setUploadForm(prev => ({ ...prev, targetYears: newYears.length === 0 ? ['All'] : newYears }));
                        }}
                        className={cn(
                          "px-2 py-1 text-[10px] rounded-md transition-colors",
                          uploadForm.targetYears.includes(y) ? "bg-emerald-600 text-white" : "bg-white text-stone-500 border border-stone-200"
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-stone-100">
                {!isDriveConnected ? (
                  <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                      <Cloud className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-stone-900">Connect Google Drive</h4>
                      <p className="text-xs text-stone-500 mt-1">Authorize access to upload files directly to your cloud storage.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleConnectDrive}
                      className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
                    >
                      Connect Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-stone-700">File Upload (PDF only)</label>
                    <div className="relative group">
                      <input
                        required
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className={cn(
                        "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all",
                        uploadingFile ? "border-emerald-500 bg-emerald-50/30" : "border-stone-200 bg-stone-50 group-hover:border-emerald-400 group-hover:bg-stone-100/50"
                      )}>
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                          uploadingFile ? "bg-emerald-100 text-emerald-600" : "bg-white text-stone-400"
                        )}>
                          {uploadingFile ? <CheckCircle className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-stone-900">
                            {uploadingFile ? uploadingFile.name : "Click or drag to upload"}
                          </p>
                          <p className="text-xs text-stone-500 mt-1">
                            {uploadingFile ? `${(uploadingFile.size / 1024 / 1024).toFixed(2)} MB` : "PDF files up to 10MB"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-stone-100 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsUploading(false);
                  setUploadForm({ title: '', description: '', category: CATEGORIES[0], customCategory: '', targetPrograms: ['All'], targetYears: ['All'] });
                  setUploadingFile(null);
                }}
                className="flex-1 py-2.5 px-4 border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!uploadingFile || !isDriveConnected || isUploadingToStorage}
                className="flex-1 py-2.5 px-4 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 flex flex-col items-center justify-center gap-1"
              >
                <div className="flex items-center gap-2">
                  {isUploadingToStorage && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isUploadingToStorage ? 'Uploading...' : 'Save Document'}
                </div>
                {isUploadingToStorage && (
                  <div className="w-full bg-emerald-800/30 rounded-full h-1 mt-1 overflow-hidden">
                    <div 
                      className="bg-white h-full transition-all duration-300" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTab === 'all' ? filteredDocs.map(doc => (
          <div key={doc.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="flex flex-col gap-2">
                <div className="p-3 bg-stone-50 rounded-xl w-fit relative">
                  <FileText className="w-6 h-6 text-stone-400" />
                </div>
                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-md uppercase tracking-wider w-fit">
                  {doc.category}
                </span>
              </div>
              <span className="text-xs font-medium text-stone-400 flex items-center gap-1">
                <Download className="w-3 h-3" />
                {doc.downloadCount}
              </span>
            </div>
            <h4 className="font-bold text-stone-900 mb-2">{doc.title}</h4>
            <p className="text-sm text-stone-500 mb-6 flex-1 line-clamp-3">{doc.description}</p>
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-stone-50 gap-2">
              <span className="text-xs text-stone-400">{format(parseISO(doc.createdAt), 'MMM d, yyyy')}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.open(doc.url, '_blank')}
                  className="flex items-center gap-1.5 font-medium text-xs text-stone-500 hover:text-stone-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  className={cn(
                    "flex items-center gap-1.5 font-medium text-xs transition-colors",
                    user.isBlocked ? "text-stone-300 cursor-not-allowed" : "text-emerald-600 hover:text-emerald-700"
                  )}
                >
                  <Download className="w-3.5 h-3.5" />
                  {user.isBlocked ? "Restricted" : "Download"}
                </button>
                {user.role === 'admin' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onShare?.(doc)}
                      className="p-1.5 text-stone-400 hover:text-blue-600 transition-colors"
                      title="Share with Students"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      className="p-1.5 text-stone-400 hover:text-red-600 transition-colors"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )) : filteredSharedDocs.map(doc => (
          <div key={doc.id} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div className="flex flex-col gap-2">
                <div className="p-3 bg-blue-50 rounded-xl w-fit relative">
                  <Send className="w-6 h-6 text-blue-400" />
                </div>
                <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md uppercase tracking-wider w-fit">
                  Shared with Me
                </span>
              </div>
            </div>
            <h4 className="font-bold text-stone-900 mb-2">{doc.title}</h4>
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-stone-50 gap-2">
              <span className="text-xs text-stone-400">Shared {format(parseISO(doc.sharedAt), 'MMM d, yyyy')}</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.open(doc.url, '_blank')}
                  className="flex items-center gap-1.5 font-medium text-xs text-stone-500 hover:text-stone-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View
                </button>
                <button
                  onClick={() => {
                    const docObj: Document = {
                      id: doc.documentId,
                      title: doc.title,
                      url: doc.url,
                      downloadUrl: doc.downloadUrl,
                      createdAt: doc.sharedAt,
                      description: '',
                      category: 'Shared',
                      uploadedBy: doc.sharedBy,
                      downloadCount: 0
                    };
                    handleDownload(docObj);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 font-medium text-xs transition-colors",
                    user.isBlocked ? "text-stone-300 cursor-not-allowed" : "text-emerald-600 hover:text-emerald-700"
                  )}
                >
                  <Download className="w-3.5 h-3.5" />
                  {user.isBlocked ? "Restricted" : "Download"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {((activeTab === 'all' && filteredDocs.length === 0) || (activeTab === 'shared' && filteredSharedDocs.length === 0)) && (
          <div className="col-span-full py-20 text-center">
            <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-stone-300" />
            </div>
            <p className="text-stone-500 font-medium">No documents found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ShareModal({ doc, user, onClose, setToast }: { doc: Document, user: UserProfile, onClose: () => void, setToast: (t: any) => void }) {
  const [emails, setEmails] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [showStudentList, setShowStudentList] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsub = onSnapshot(q, (snapshot) => {
      setStudents(snapshot.docs.map(d => d.data() as UserProfile));
    });
    return () => unsub();
  }, []);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailList = emails.split(',').map(e => e.trim()).filter(e => e.length > 0);
    
    if (emailList.length === 0) return;

    setIsSharing(true);
    try {
      const batch = emailList.map(email => {
        if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
          throw new Error(`Invalid email: ${email}. Must be @${ALLOWED_DOMAIN}`);
        }
        return addDoc(collection(db, 'shared_documents'), {
          documentId: doc.id,
          studentEmail: email,
          sharedBy: user.uid,
          sharedAt: new Date().toISOString(),
          title: doc.title,
          url: doc.url,
          downloadUrl: doc.downloadUrl || null
        });
      });

      await Promise.all(batch);
      setToast({ message: `Document shared with ${emailList.length} student(s)`, type: 'success' });
      onClose();
    } catch (err: any) {
      console.error("Share error:", err);
      setToast({ message: err.message || "Failed to share document", type: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  const addEmail = (email: string) => {
    const currentEmails = emails.split(',').map(e => e.trim()).filter(e => e.length > 0);
    if (!currentEmails.includes(email)) {
      setEmails([...currentEmails, email].join(', '));
    }
    setSearch('');
    setShowStudentList(false);
  };

  const filteredStudents = students.filter(s => 
    s.email.toLowerCase().includes(search.toLowerCase()) || 
    (s.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-black/5">
        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
          <Share2 className="w-6 h-6 text-blue-600" />
        </div>
        <h3 className="text-xl font-bold text-stone-900 mb-2">Share Document</h3>
        <p className="text-stone-500 mb-6">
          Share <span className="font-semibold text-stone-900">"{doc.title}"</span> with students.
        </p>
        
        <form onSubmit={handleShare} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Search Students</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowStudentList(true);
                }}
                onFocus={() => setShowStudentList(true)}
                className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
              />
              {showStudentList && search && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-stone-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-10">
                  {filteredStudents.length > 0 ? filteredStudents.map(s => (
                    <button
                      key={s.uid}
                      type="button"
                      onClick={() => addEmail(s.email)}
                      className="w-full px-4 py-2 text-left hover:bg-stone-50 flex flex-col border-b border-stone-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-stone-900">{s.name || 'No name set'}</span>
                      <span className="text-xs text-stone-400">{s.email}</span>
                    </button>
                  )) : (
                    <div className="px-4 py-3 text-xs text-stone-500 italic">No students found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700">Selected Emails</label>
            <textarea
              required
              placeholder="student1@neu.edu.ph, student2@neu.edu.ph"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all h-24 text-sm"
            />
            <p className="text-[10px] text-stone-400 italic">Emails are automatically added when you select a student from the search.</p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSharing}
              className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSharing || !emails.trim()}
              className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSharing ? "Sharing..." : "Share Now"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StudentShareModal({ student, user, onClose, setToast }: { student: UserProfile, user: UserProfile, onClose: () => void, setToast: (t: any) => void }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [search, setSearch] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'documents'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setDocs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document)));
    });
    return () => unsub();
  }, []);

  const handleGive = async (doc: Document) => {
    setIsSharing(true);
    try {
      await addDoc(collection(db, 'shared_documents'), {
        documentId: doc.id,
        studentEmail: student.email,
        sharedBy: user.uid,
        sharedAt: new Date().toISOString(),
        title: doc.title,
        url: doc.url,
        downloadUrl: doc.downloadUrl || null
      });

      setToast({ message: `Document "${doc.title}" shared with ${student.email}`, type: 'success' });
      onClose();
    } catch (err: any) {
      console.error("Share error:", err);
      setToast({ message: err.message || "Failed to share document", type: 'error' });
    } finally {
      setIsSharing(false);
    }
  };

  const filteredDocs = docs.filter(d => 
    d.title.toLowerCase().includes(search.toLowerCase()) || 
    d.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-8 border border-black/5 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Send className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Give Document</h3>
              <p className="text-sm text-stone-500">To: <span className="font-semibold text-stone-900">{student.name || student.email}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-stone-400 hover:text-stone-600">
            <XCircle className="w-6 h-6" />
          </button>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search documents by title or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {filteredDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-xl hover:bg-stone-100 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                  <FileText className="w-5 h-5 text-stone-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stone-900">{doc.title}</h4>
                  <p className="text-[10px] text-stone-500 uppercase font-semibold tracking-wider">{doc.category}</p>
                </div>
              </div>
              <button
                disabled={isSharing}
                onClick={() => handleGive(doc)}
                className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Give
              </button>
            </div>
          ))}
          {filteredDocs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-stone-500 italic text-sm">No documents found matching your search.</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-stone-100">
          <button
            onClick={onClose}
            className="w-full py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user, setAppError, setToast }: { user: UserProfile, setAppError: (err: Error) => void, setToast: (toast: { message: string, type: 'success' | 'error' } | null) => void }) {
  const [name, setName] = useState(user.name || user.displayName || "");
  const [program, setProgram] = useState(user.program || "");
  const [yearLevel, setYearLevel] = useState(user.yearLevel || "");
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);
      try {
        const storageRef = ref(storage, `profiles/${user.uid}/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', null, reject, () => resolve(null));
        });

        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        setPhotoURL(downloadURL);
        setToast({ message: "Photo uploaded! Don't forget to save changes.", type: 'success' });
      } catch (err) {
        console.error("Error uploading photo:", err);
        setToast({ message: "Failed to upload photo.", type: 'error' });
      } finally {
        setUploading(false);
      }
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        name,
        program,
        yearLevel,
        photoURL
      });
      setToast({ message: "Profile updated successfully!", type: 'success' });
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setAppError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-white rounded-2xl border border-black/5 p-8">
        <h3 className="text-xl font-bold text-stone-900 mb-6">My Profile</h3>
        
        <div className="flex flex-col items-center mb-8">
          <div className="relative group">
            <div className="w-24 h-24 bg-stone-100 rounded-full flex items-center justify-center text-stone-400 font-bold text-2xl overflow-hidden border-2 border-stone-50">
              {photoURL ? (
                <img src={photoURL} alt={name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (name || user.email)[0].toUpperCase()
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Upload className="w-6 h-6" />
              <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} />
            </label>
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-full">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              </div>
            )}
          </div>
          <p className="text-xs text-stone-400 mt-2">Click to change profile picture</p>
        </div>

        <form onSubmit={handleUpdateProfile} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Full Name</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Email Address</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-400 cursor-not-allowed outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Undergraduate Program</label>
              <select
                required
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className="w-full p-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              >
                <option value="">Select a program...</option>
                {PROGRAMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Year Level</label>
              <select
                required
                value={yearLevel}
                onChange={(e) => setYearLevel(e.target.value)}
                className="w-full p-3 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
              >
                <option value="">Select year level...</option>
                {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>

      <div className="bg-stone-100/50 rounded-2xl p-6 border border-stone-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white rounded-xl shadow-sm">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h4 className="font-semibold text-stone-900">Account Security</h4>
            <p className="text-sm text-stone-500 mt-1">Your account is secured via NEU Google Authentication. To change your password or security settings, please visit your Google Account settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersView({ currentUser, onShareStudent, setToast }: { currentUser: UserProfile, onShareStudent: (student: UserProfile) => void, setToast: (t: any) => void }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<Error | null>(null);

  if (error) throw error;

  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    // Fetch all users (admins and students)
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(d => d.data() as UserProfile));
    }, (err) => {
      setError(err);
    });
    return () => unsub();
  }, [currentUser.role]);

  const toggleBlock = async (user: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isBlocked: !user.isBlocked
      });
      setToast({ message: `User ${user.isBlocked ? 'unblocked' : 'blocked'} successfully`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email.toLowerCase().includes(search.toLowerCase()) || 
                         (u.name && u.name.toLowerCase().includes(search.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-stone-50 border-b border-black/5">
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Program / Info</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Last Login</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-stone-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-xs font-bold text-stone-600 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.displayName || u.name || u.email} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          (u.displayName || u.name || u.email)[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-stone-900">{u.name || u.displayName || 'No name set'}</span>
                        <span className="text-xs text-stone-400">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                      u.role === 'admin' ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                    )}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-stone-500">
                      {u.program || (u.role === 'admin' ? 'Administrator' : 'No program')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-stone-500">
                      {u.lastLogin ? format(parseISO(u.lastLogin), 'MMM d, yyyy HH:mm') : 'Never'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.isBlocked ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-full">
                        <XCircle className="w-3 h-3" /> Blocked
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 text-xs font-medium rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {u.role === 'student' && (
                        <button
                          onClick={() => onShareStudent(u)}
                          className="p-2 text-stone-400 hover:text-blue-600 transition-colors"
                          title="Give Document"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {u.uid !== currentUser.uid && (
                        <button
                          onClick={() => toggleBlock(u)}
                          className={cn(
                            "text-sm font-medium transition-colors",
                            u.isBlocked ? "text-emerald-600 hover:text-emerald-700" : "text-red-600 hover:text-red-700"
                          )}
                        >
                          {u.isBlocked ? "Unblock" : "Block"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettingsView({ 
  user, 
  setAppError, 
  setToast,
  setConfirmAdminRemoval,
  setConfirmPreAuthRemoval
}: { 
  user: UserProfile, 
  setAppError: (err: Error) => void,
  setToast: (toast: { message: string, type: 'success' | 'error' } | null) => void,
  setConfirmAdminRemoval: (admin: UserProfile | null) => void,
  setConfirmPreAuthRemoval: (email: string | null) => void
}) {
  const [preAuthAdmins, setPreAuthAdmins] = useState<PreAuthorizedAdmin[]>([]);
  const [activeAdmins, setActiveAdmins] = useState<UserProfile[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubPreAuth = onSnapshot(collection(db, 'preAuthorizedAdmins'), (snapshot) => {
      setPreAuthAdmins(snapshot.docs.map(d => d.data() as PreAuthorizedAdmin));
    }, (error) => {
      setAppError(error);
    });

    const qActive = query(collection(db, 'users'), where('role', '==', 'admin'));
    const unsubActive = onSnapshot(qActive, (snapshot) => {
      setActiveAdmins(snapshot.docs.map(d => d.data() as UserProfile));
    }, (error) => {
      setAppError(error);
    });

    return () => {
      unsubPreAuth();
      unsubActive();
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setToast({ message: `Email must end with @${ALLOWED_DOMAIN}`, type: 'error' });
      return;
    }

    setLoading(true);
    try {
      await setDoc(doc(db, 'preAuthorizedAdmins', newEmail), {
        email: newEmail,
        addedBy: user.email,
        createdAt: new Date().toISOString()
      });
      setNewEmail("");
      setToast({ message: "Email authorized successfully", type: 'success' });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to authorize email", type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (email: string) => {
    if (email === ADMIN_EMAIL) return;
    setConfirmPreAuthRemoval(email);
  };

  const toggleBlock = async (admin: UserProfile) => {
    if (admin.uid === user.uid) {
      setToast({ message: "You cannot block your own account.", type: 'error' });
      return;
    }
    try {
      await updateDoc(doc(db, 'users', admin.uid), {
        isBlocked: !admin.isBlocked
      });
      setToast({ message: `Administrator ${admin.isBlocked ? 'unblocked' : 'blocked'} successfully`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${admin.uid}`);
    }
  };

  const handleDeleteAdmin = (admin: UserProfile) => {
    if (admin.uid === user.uid) {
      setToast({ message: "You cannot remove your own administrative account.", type: 'error' });
      return;
    }
    if (admin.email === ADMIN_EMAIL) {
      setToast({ message: "The primary administrator account cannot be removed.", type: 'error' });
      return;
    }
    
    setConfirmAdminRemoval(admin);
  };

  return (
    <div className="max-w-4xl space-y-8">
      {/* Active Admins Section */}
      <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">Active Administrators</h3>
            <p className="text-sm text-stone-500">Manage existing administrators and their access status.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="divide-y divide-stone-50 border border-stone-50 rounded-xl overflow-hidden">
            {activeAdmins.map(admin => (
              <div key={admin.uid} className="flex items-center justify-between p-4 bg-white hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-600 font-bold overflow-hidden">
                    {admin.photoURL ? (
                      <img src={admin.photoURL} alt={admin.displayName || admin.email} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      (admin.displayName || admin.email)[0].toUpperCase()
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">{admin.displayName || admin.email}</p>
                    <p className="text-xs text-stone-400">{admin.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {admin.uid !== user.uid && admin.email !== ADMIN_EMAIL && (
                    <>
                      <button
                        onClick={() => toggleBlock(admin)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          admin.isBlocked
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                        )}
                      >
                        {admin.isBlocked ? "Unblock" : "Block"}
                      </button>
                      <button
                        onClick={() => handleDeleteAdmin(admin)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {admin.isBlocked && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold uppercase rounded tracking-wider">
                      Blocked
                    </span>
                  )}
                  {admin.email === ADMIN_EMAIL && (
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase rounded tracking-wider">
                      Primary Admin
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pre-authorization Section */}
      <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <UserPlus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-stone-900">Admin Pre-authorization</h3>
            <p className="text-sm text-stone-500">Add emails of staff members who should be granted Admin privileges upon their first login.</p>
          </div>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="email"
              placeholder="Enter @neu.edu.ph email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !newEmail}
            className="px-6 py-2.5 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 whitespace-nowrap text-sm"
          >
            Authorize Email
          </button>
        </form>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-stone-400 uppercase tracking-wider">Authorized Emails</h4>
          <div className="divide-y divide-stone-50 border border-stone-50 rounded-xl overflow-hidden">
            {preAuthAdmins.map(admin => (
              <div key={admin.email} className="flex items-center justify-between p-4 bg-white hover:bg-stone-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-stone-900">{admin.email}</p>
                    <p className="text-xs text-stone-400">Added by {admin.addedBy} on {format(parseISO(admin.createdAt), 'MMM d, yyyy')}</p>
                  </div>
                </div>
                {admin.email !== ADMIN_EMAIL && (
                  <button 
                    onClick={() => handleRemove(admin.email)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {preAuthAdmins.length === 0 && (
              <p className="p-8 text-center text-stone-400 italic">No pre-authorized admins yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
