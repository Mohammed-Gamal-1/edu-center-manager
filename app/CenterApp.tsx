"use client";

import { Activity, Archive, BarChart3, Bell, BookOpen, CalendarDays, Check, ChevronLeft, CircleDollarSign, Cloud, CloudOff, Clock3, Edit3, FileClock, GraduationCap, History, LayoutDashboard, LockKeyhole, LoaderCircle, Menu, MoreHorizontal, PauseCircle, Plus, ReceiptText, Search, Settings, ShieldCheck, Sparkles, SquarePen, Trash2, TrendingUp, UserPlus, Users, WalletCards, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { allocateDebtPayment, calculateAnalyticsProfit, DebtPaymentRecord, getSessionFinancials, normalizeAttendancePaymentTotal, normalizePaidAmount, outstandingForAttendance, outstandingForSession, outstandingForStudent, paidDuringSession, shortageForAttendance } from "../lib/center-finance";
import { findActiveStudentConflict, hasMatchingBooking, isStudentInSessionGrade, nextStudentIdForStage } from "../lib/center-rules";
import { downloadAnalyticsExcel, type AnalyticsExcelExport } from "../lib/analytics-excel";

type View = "dashboard" | "students" | "teachers" | "sessions" | "expenses" | "admin";
type StudentTab = "register" | "bookings" | "records" | "debts";
type AdminTab = "pricing" | "archive" | "teacherArchive" | "analytics" | "audit" | "settings";
type SessionStatus = "scheduled" | "active" | "postponed" | "ended";
type Stage = "المرحلة الابتدائية" | "المرحلة الإعدادية" | "المرحلة الثانوية";

type Student = {
  id: string;
  name: string;
  phone: string;
  stage: Stage;
  grade: string;
  active: boolean;
};

type Assignment = { stage: Stage; grade: string; subject: string };

type Teacher = {
  id: string;
  name: string;
  phone: string;
  assignments: Assignment[];
  active: boolean;
};

type Booking = {
  id: string;
  studentId: string;
  teacherId: string;
  stage: Stage;
  grade: string;
  subject: string;
  bookingFee: number;
  createdAt: string;
  active: boolean;
};

type PriceRule = {
  id: string;
  stage: Stage;
  grade: string;
  subject: string;
  studentPrice: number;
  teacherFee: number;
};

type CenterExpense = {
  id: string;
  category: "إيجار" | "مرافق" | "أدوات ومستلزمات" | "صيانة" | "رواتب" | "أخرى";
  amount: number;
  date: string;
  description: string;
};

type LessonSession = {
  id: string;
  teacherId: string;
  stage: Stage;
  grade: string;
  subject: string;
  room: string;
  date: string;
  scheduledTime: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  studentIds: string[];
  studentPrice: number;
  teacherFee: number;
  studentPayments?: Record<string, number>;
};

type DebtPayment = DebtPaymentRecord;

type AuditEntry = {
  id: string;
  action: string;
  details: string;
  time: string;
  tone: "green" | "blue" | "orange";
};

type SyncStatus = "loading" | "saving" | "saved" | "offline" | "error" | "conflict";

type CenterSnapshot = {
  students: Student[];
  teachers: Teacher[];
  pricing: PriceRule[];
  sessions: LessonSession[];
  bookings: Booking[];
  expenses: CenterExpense[];
  debtPayments: DebtPayment[];
  audit: AuditEntry[];
  subjectCatalog: Record<Stage, string[]>;
  rooms: string[];
  savedAt: string;
};

type LocalSnapshot = { state: CenterSnapshot; baseVersion: number };

const LOCAL_PENDING_KEY = "eltafawoq.pending-state.v3";
const LOCAL_CACHE_KEY = "eltafawoq.cloud-cache.v3";

const sameSnapshotContent = (left: CenterSnapshot, right: CenterSnapshot) => {
  return JSON.stringify({ ...left, savedAt: "" }) === JSON.stringify({ ...right, savedAt: "" });
};

const stages: Stage[] = ["المرحلة الابتدائية", "المرحلة الإعدادية", "المرحلة الثانوية"];
const gradesByStage: Record<Stage, string[]> = {
  "المرحلة الابتدائية": ["الصف الأول", "الصف الثاني", "الصف الثالث", "الصف الرابع", "الصف الخامس", "الصف السادس"],
  "المرحلة الإعدادية": ["الصف الأول", "الصف الثاني", "الصف الثالث"],
  "المرحلة الثانوية": ["الصف الأول", "الصف الثاني", "الصف الثالث"],
};
const initialSubjectsByStage: Record<Stage, string[]> = {
  "المرحلة الابتدائية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية"],
  "المرحلة الإعدادية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "العلوم", "الدراسات الاجتماعية"],
  "المرحلة الثانوية": ["اللغة العربية", "اللغة الإنجليزية", "الرياضيات", "الفيزياء", "الكيمياء", "الأحياء", "التاريخ", "الجغرافيا"],
};
const gradeLabel = (stage: Stage, grade: string) => `${grade} ${stage.replace("المرحلة ", "")}`;
const initialRooms = ["قاعة 1", "قاعة 2", "قاعة 3", "قاعة 4", "قاعة 5"];

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

function newestNumericIdFirst(left: { id: string }, right: { id: string }) {
  return Number(right.id) - Number(left.id);
}

function newestSessionFirst(left: LessonSession, right: LessonSession) {
  const leftTime = `${left.date}T${left.endedAt ?? left.startedAt ?? left.scheduledTime}`;
  const rightTime = `${right.date}T${right.endedAt ?? right.startedAt ?? right.scheduledTime}`;
  return rightTime.localeCompare(leftTime) || newestNumericIdFirst(left, right);
}

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "students", label: "الطلاب", icon: Users },
  { id: "teachers", label: "المدرسون", icon: GraduationCap },
  { id: "sessions", label: "الحصص", icon: CalendarDays },
  { id: "expenses", label: "مصروفات السنتر", icon: ReceiptText },
  { id: "admin", label: "الإدارة", icon: Settings },
];

const money = (value: number) => new Intl.NumberFormat("ar-EG").format(value) + " ج.م";
const arabicDate = (date = new Date()) =>
  new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق">
            <X size={20} />
          </button>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function StatusPill({ status }: { status: SessionStatus }) {
  const labels = {
    active: "شغالة الآن",
    scheduled: "مجدولة",
    postponed: "مؤجلة",
    ended: "انتهت",
  };
  return (
    <span className={`status-pill ${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}

export default function CenterApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentUsername, setCurrentUsername] = useState("admin");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [adminRecoveryMode, setAdminRecoveryMode] = useState(false);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState("");
  const [pendingAdminTab, setPendingAdminTab] = useState<AdminTab>("analytics");
  const [receptionRetry, setReceptionRetry] = useState(0);
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsSeen, setNotificationsSeen] = useState(false);
  const [studentTab, setStudentTab] = useState<StudentTab>("records");
  const [adminTab, setAdminTab] = useState<AdminTab>("analytics");
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [pricing, setPricing] = useState<PriceRule[]>([]);
  const [sessions, setSessions] = useState<LessonSession[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expenses, setExpenses] = useState<CenterExpense[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPayment[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [subjectCatalog, setSubjectCatalog] = useState<Record<Stage, string[]>>(initialSubjectsByStage);
  const [rooms, setRooms] = useState(initialRooms);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedSession, setSelectedSession] = useState<LessonSession | null>(null);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [editSessionOpen, setEditSessionOpen] = useState(false);
  const [endReview, setEndReview] = useState(false);
  const [startReview, setStartReview] = useState(false);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
  const [toast, setToast] = useState("");
  const [dataReady, setDataReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [cloudConflict, setCloudConflict] = useState<LocalSnapshot | null>(null);
  const [retrySync, setRetrySync] = useState(0);
  const versionRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const latestSnapshotRef = useRef<CenterSnapshot | null>(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/reception", { method: "POST", cache: "no-store" })
      .then((response) => response.json())
      .then((result: { ok?: boolean; username?: string | null }) => {
        if (cancelled) return;
        setAuthenticated(true);
        setAdminUnlocked(false);
        if (result.username) setCurrentUsername(result.username);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(true);
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [receptionRetry]);

  useEffect(() => {
    if (!authenticated || dataReady) return;
    let cancelled = false;
    const applySnapshot = (state: CenterSnapshot) => {
      setStudents(state.students);
      setTeachers(state.teachers);
      setPricing(state.pricing);
      setSessions(state.sessions);
      setBookings(state.bookings);
      setExpenses(state.expenses);
      setDebtPayments(state.debtPayments ?? []);
      setAudit(state.audit);
      setSubjectCatalog(state.subjectCatalog);
      setRooms(state.rooms);
    };
    const readLocal = (key: string) => {
      try {
        return JSON.parse(localStorage.getItem(key) ?? "null") as LocalSnapshot | null;
      } catch {
        return null;
      }
    };
    const pending = readLocal(LOCAL_PENDING_KEY);
    const cached = readLocal(LOCAL_CACHE_KEY);
    if (pending?.state) {
      applySnapshot(pending.state);
      versionRef.current = pending.baseVersion;
      queueMicrotask(() => setSyncStatus(navigator.onLine ? "saving" : "offline"));
    }
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) throw new Error("unauthorized");
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<{
          state: CenterSnapshot;
          version: number;
        }>;
      })
      .then((result) => {
        if (cancelled) return;
        if (!pending?.state) {
          skipNextPersistRef.current = true;
          applySnapshot(result.state);
          versionRef.current = result.version;
          localStorage.setItem(
            LOCAL_CACHE_KEY,
            JSON.stringify({
              state: result.state,
              baseVersion: result.version,
            } satisfies LocalSnapshot),
          );
          setSyncStatus("saved");
        }
        setDataReady(true);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        if (error.message === "unauthorized") {
          setAuthenticated(false);
          setDataReady(false);
          setAuthChecking(true);
          setReceptionRetry((value) => value + 1);
          return;
        }
        if (!pending?.state && cached?.state) {
          skipNextPersistRef.current = true;
          applySnapshot(cached.state);
          versionRef.current = cached.baseVersion;
        }
        setSyncStatus("offline");
        setDataReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authenticated, dataReady]);

  useEffect(() => {
    if (!authenticated || !dataReady) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const snapshot: CenterSnapshot = {
      students,
      teachers,
      pricing,
      sessions,
      bookings,
      expenses,
      debtPayments,
      audit,
      subjectCatalog,
      rooms,
      savedAt: new Date().toISOString(),
    };
    latestSnapshotRef.current = snapshot;
    const localRecord: LocalSnapshot = {
      state: snapshot,
      baseVersion: versionRef.current,
    };
    localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(localRecord));
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    if (!navigator.onLine) {
      queueMicrotask(() => setSyncStatus("offline"));
      return;
    }
    queueMicrotask(() => setSyncStatus("saving"));
    if (saveInFlightRef.current) {
      saveTimerRef.current = window.setTimeout(() => setRetrySync((value) => value + 1), 180);
      return () => {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      };
    }
    saveTimerRef.current = window.setTimeout(
      async () => {
        saveInFlightRef.current = true;
        let retryDelay: number | null = null;
        try {
          const response = await fetch("/api/state", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              state: snapshot,
              baseVersion: localRecord.baseVersion,
            }),
          });
          if (response.status === 401) {
            setAuthenticated(false);
            setDataReady(false);
            setAuthChecking(true);
            setReceptionRetry((value) => value + 1);
            return;
          }
          const result = (await response.json()) as {
            ok?: boolean;
            version?: number;
            conflict?: boolean;
            state?: CenterSnapshot;
          };
          if (response.status === 409 || result.conflict) {
            if (result.state && typeof result.version === "number") {
              if (sameSnapshotContent(snapshot, result.state)) {
                versionRef.current = result.version;
                localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ state: result.state, baseVersion: result.version } satisfies LocalSnapshot));
                localStorage.removeItem(LOCAL_PENDING_KEY);
                setSyncStatus("saved");
                return;
              }
              setCloudConflict({
                state: result.state,
                baseVersion: result.version,
              });
            }
            setSyncStatus("conflict");
            return;
          }
          if (!response.ok || !result.ok || typeof result.version !== "number") throw new Error("save failed");
          versionRef.current = result.version;
          localStorage.setItem(
            LOCAL_CACHE_KEY,
            JSON.stringify({
              state: snapshot,
              baseVersion: result.version,
            } satisfies LocalSnapshot),
          );
          if (latestSnapshotRef.current?.savedAt === snapshot.savedAt) {
            localStorage.removeItem(LOCAL_PENDING_KEY);
            setSyncStatus("saved");
          } else {
            retryDelay = 80;
          }
        } catch {
          setSyncStatus(navigator.onLine ? "error" : "offline");
          if (navigator.onLine) retryDelay = 2000;
        } finally {
          saveInFlightRef.current = false;
          if (retryDelay !== null) {
            saveTimerRef.current = window.setTimeout(() => setRetrySync((value) => value + 1), retryDelay);
          }
        }
      },
      retrySync ? 80 : 650,
    );
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [authenticated, dataReady, students, teachers, pricing, sessions, bookings, expenses, debtPayments, audit, subjectCatalog, rooms, retrySync]);

  useEffect(() => {
    const handleOnline = () => setRetrySync((value) => value + 1);
    const handleOffline = () => setSyncStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setNotificationsSeen(false);
    window.setTimeout(() => setToast(""), 2600);
  };

  const keepLocalConflictCopy = () => {
    if (!cloudConflict) return;
    versionRef.current = cloudConflict.baseVersion;
    const latest = latestSnapshotRef.current;
    if (latest) {
      localStorage.setItem(
        LOCAL_PENDING_KEY,
        JSON.stringify({
          state: latest,
          baseVersion: cloudConflict.baseVersion,
        } satisfies LocalSnapshot),
      );
    }
    setCloudConflict(null);
    setSyncStatus("saving");
    setRetrySync((value) => value + 1);
    showToast("سيتم حفظ نسخة هذا الجهاز على السحابة");
  };

  const useCloudConflictCopy = () => {
    if (!cloudConflict) return;
    skipNextPersistRef.current = true;
    setStudents(cloudConflict.state.students);
    setTeachers(cloudConflict.state.teachers);
    setPricing(cloudConflict.state.pricing);
    setSessions(cloudConflict.state.sessions);
    setBookings(cloudConflict.state.bookings);
    setExpenses(cloudConflict.state.expenses);
    setDebtPayments(cloudConflict.state.debtPayments ?? []);
    setAudit(cloudConflict.state.audit);
    setSubjectCatalog(cloudConflict.state.subjectCatalog);
    setRooms(cloudConflict.state.rooms);
    versionRef.current = cloudConflict.baseVersion;
    latestSnapshotRef.current = cloudConflict.state;
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(cloudConflict));
    localStorage.removeItem(LOCAL_PENDING_KEY);
    setCloudConflict(null);
    setSyncStatus("saved");
    showToast("تم اعتماد أحدث نسخة محفوظة على السحابة");
  };

  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "مدرس مؤرشف";

  const openAdmin = (tab: AdminTab = adminTab) => {
    setPendingAdminTab(tab);
    setProfileMenuOpen(false);
    setNotificationsOpen(false);
    setMobileNav(false);
    if (adminUnlocked && view === "admin") {
      setAdminTab(tab);
      return;
    }
    setAdminAuthError("");
    setAdminRecoveryMode(false);
    setAdminPinOpen(true);
  };

  const navigate = (target: View) => {
    if (target === "admin") {
      openAdmin();
      return;
    }
    if (adminUnlocked) {
      setAdminUnlocked(false);
      void fetch("/api/auth/reception", { method: "POST" }).catch(() => {
        /* The local admin gate is already locked. */
      });
    }
    setView(target);
    setMobileNav(false);
    setProfileMenuOpen(false);
    setNotificationsOpen(false);
  };

  const handleAdminPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAdminAuthLoading(true);
    setAdminAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: data.get("pin") }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        username?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "تعذر فتح الإدارة");
      setAdminUnlocked(true);
      setAdminPinOpen(false);
      setAdminTab(pendingAdminTab);
      setView("admin");
      if (result.username) setCurrentUsername(result.username);
    } catch (error) {
      setAdminAuthError(error instanceof Error ? error.message : "تعذر فتح الإدارة");
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleAdminPinRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAdminAuthLoading(true);
    setAdminAuthError("");
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUsername,
          recoveryCode: data.get("recoveryCode"),
          password: data.get("pin"),
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        username?: string;
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "تعذر استرداد PIN الإدارة");
      setAdminUnlocked(true);
      setAdminPinOpen(false);
      setAdminRecoveryMode(false);
      setAdminTab(pendingAdminTab);
      setView("admin");
      if (result.username) setCurrentUsername(result.username);
    } catch (error) {
      setAdminAuthError(error instanceof Error ? error.message : "تعذر استرداد PIN الإدارة");
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const lockAdmin = async () => {
    setAdminUnlocked(false);
    if (view === "admin") setView("dashboard");
    setProfileMenuOpen(false);
    try {
      await fetch("/api/auth/reception", { method: "POST" });
    } catch {
      /* The local admin gate still locks. */
    }
    showToast("تم قفل صفحة الإدارة");
  };

  if (authChecking) {
    return (
      <main className="login-page app-loading" dir="rtl">
        <div className="loading-card">
          <LoaderCircle className="spin" size={31} />
          <strong>جاري فتح نظام سنتر التفوق</strong>
          <span>يتم التحقق من الجلسة الآمنة…</span>
        </div>
      </main>
    );
  }

  if (!dataReady) {
    return (
      <main className="login-page app-loading" dir="rtl">
        <div className="loading-card">
          <LoaderCircle className="spin" size={31} />
          <strong>جاري استرجاع بيانات السنتر</strong>
          <span>يتم تحميل آخر نسخة محفوظة بأمان…</span>
        </div>
      </main>
    );
  }

  const pageTitles: Record<View, [string, string]> = {
    dashboard: ["صباح الخير 👋", "دي نظرة سريعة على يوم السنتر"],
    students: ["إدارة الطلاب", "تسجيل الطلاب، الحجوزات المسبقة وسجل الحضور"],
    teachers: ["المدرسون", "بيانات المدرسين وتخصصاتهم وسجل حصصهم"],
    sessions: ["إدارة الحصص", "أنشئ الحصص وتابعها من البداية حتى الأرشيف"],
    expenses: ["مصروفات السنتر", "سجّل كل مصروف وتابع تأثيره على صافي الربح"],
    admin: ["الإدارة والتقارير", "الأسعار، الأرشيف، التحليلات وإعدادات النظام"],
  };
  const openSessionsToday = sessions.filter((lesson) => lesson.date === todayIso() && lesson.status !== "ended").length;
  const notificationSessions = sessions
    .filter((lesson) => lesson.status === "active" || lesson.status === "postponed")
    .slice()
    .sort(newestSessionFirst);
  const notificationCount = notificationSessions.length + Math.min(audit.length, 3);
  const syncInfo: Record<SyncStatus, { label: string; hint: string; icon: typeof Cloud }> = {
    loading: {
      label: "جاري التحميل",
      hint: "استرجاع البيانات",
      icon: LoaderCircle,
    },
    saving: {
      label: "جاري الحفظ",
      hint: "يتم الحفظ في Supabase",
      icon: LoaderCircle,
    },
    saved: { label: "محفوظ سحابيًا", hint: "كل التغييرات محفوظة", icon: Cloud },
    offline: {
      label: "محفوظ مؤقتًا",
      hint: "ستتم المزامنة عند رجوع الإنترنت",
      icon: CloudOff,
    },
    error: {
      label: "بانتظار المزامنة",
      hint: "النسخة المحلية آمنة وسيعاد الحفظ",
      icon: CloudOff,
    },
    conflict: {
      label: "تعارض يحتاج مراجعة",
      hint: "النسخة المحلية لم تُحذف",
      icon: CloudOff,
    },
  };
  const SyncIcon = syncInfo[syncStatus].icon;

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">
            <BookOpen size={23} />
          </div>
          <div>
            <strong>
              سنتر <span>التفوق</span>
            </strong>
            <small>نظام الإدارة</small>
          </div>
        </div>
        <nav>
          <span className="nav-label">القائمة الرئيسية</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                <Icon size={20} />
                <span>{item.label}</span>
                {item.id === "sessions" && <b>{openSessionsToday}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-menu-wrap">
            <div className="admin-mini">
              <span>م</span>
              <div>
                <strong>مدير السنتر</strong>
                <small>{adminUnlocked ? currentUsername : "الإدارة مقفولة"}</small>
              </div>
              <button className="admin-more" onClick={() => setProfileMenuOpen((open) => !open)} aria-label="فتح قائمة مدير السنتر" aria-expanded={profileMenuOpen}>
                <MoreHorizontal size={18} />
              </button>
            </div>
            {profileMenuOpen && (
              <div className="admin-popover" role="menu">
                <button role="menuitem" onClick={() => openAdmin("settings")}>
                  <Settings size={17} />
                  <span>
                    <strong>إعدادات الإدارة</strong>
                    <small>تغيير اسم المستخدم أو PIN</small>
                  </span>
                </button>
                <button role="menuitem" onClick={() => openAdmin("audit")}>
                  <History size={17} />
                  <span>
                    <strong>سجل العمليات</strong>
                    <small>عرض آخر التغييرات</small>
                  </span>
                </button>
                {adminUnlocked && (
                  <button className="danger" role="menuitem" onClick={lockAdmin}>
                    <LockKeyhole size={17} />
                    <span>
                      <strong>قفل الإدارة</strong>
                      <small>العودة لوضع الريسبشن</small>
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
          {adminUnlocked && (
            <button className="logout" onClick={lockAdmin}>
              <LockKeyhole size={18} /> قفل الإدارة
            </button>
          )}
        </div>
      </aside>

      {mobileNav && <button className="nav-backdrop" aria-label="إغلاق القائمة" onClick={() => setMobileNav(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)} aria-label="فتح القائمة">
            <Menu size={22} />
          </button>
          <div className="page-heading">
            <h1>{pageTitles[view][0]}</h1>
            <p>{pageTitles[view][1]}</p>
          </div>
          <div className="top-actions">
            <div className={`sync-chip ${syncStatus}`} title={syncInfo[syncStatus].hint}>
              <SyncIcon className={syncStatus === "saving" || syncStatus === "loading" ? "spin" : ""} size={17} />
              <span>
                {syncInfo[syncStatus].label}
                <small>{syncInfo[syncStatus].hint}</small>
              </span>
            </div>
            <div className="today-chip">
              <CalendarDays size={17} />
              <span>{arabicDate()}</span>
            </div>
            <div className="notification-wrap">
              <button
                className="icon-btn notification"
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setNotificationsSeen(true);
                }}
                aria-label={`التنبيهات: ${notificationCount}`}
                aria-expanded={notificationsOpen}
              >
                <Bell size={20} />
                {!notificationsSeen && notificationCount > 0 && <i />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="notification-head">
                    <div>
                      <strong>الإشعارات</strong>
                      <span>{notificationCount} تحديث</span>
                    </div>
                    <button type="button" onClick={() => setNotificationsOpen(false)} aria-label="إغلاق الإشعارات">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="notification-list">
                    {notificationSessions.map((lesson) => (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          setSelectedSession(lesson);
                        }}
                      >
                        <span className={lesson.status}>
                          <Clock3 size={16} />
                        </span>
                        <div>
                          <strong>{lesson.status === "active" ? "حصة شغالة الآن" : "حصة مؤجلة"}</strong>
                          <small>
                            {lesson.subject} · {teacherName(lesson.teacherId)} · {lesson.room}
                          </small>
                        </div>
                        <ChevronLeft size={16} />
                      </button>
                    ))}
                    {audit.slice(0, 3).map((entry) => (
                      <button type="button" key={entry.id} onClick={() => openAdmin("audit")}>
                        <span className={entry.tone}>
                          <History size={16} />
                        </span>
                        <div>
                          <strong>{entry.action}</strong>
                          <small>{entry.details}</small>
                        </div>
                        <ChevronLeft size={16} />
                      </button>
                    ))}
                    {!notificationCount && (
                      <div className="notification-empty">
                        <Bell size={20} />
                        <span>لا توجد إشعارات جديدة</span>
                      </div>
                    )}
                  </div>
                  <button type="button" className="notification-footer" onClick={() => openAdmin("audit")}>
                    عرض سجل العمليات بالكامل <ChevronLeft size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          {view === "dashboard" && <Dashboard sessions={sessions} teachers={teachers} onOpenSession={setSelectedSession} onViewAllSessions={() => navigate("sessions")} />}
          {view === "students" && <StudentsPage tab={studentTab} setTab={setStudentTab} students={students} setStudents={setStudents} teachers={teachers} bookings={bookings} setBookings={setBookings} sessions={sessions} debtPayments={debtPayments} setDebtPayments={setDebtPayments} onOpenStudent={setSelectedStudent} audit={setAudit} showToast={showToast} />}
          {view === "teachers" && <TeachersPage teachers={teachers} setTeachers={setTeachers} sessions={sessions} onOpenTeacher={setSelectedTeacher} audit={setAudit} subjectCatalog={subjectCatalog} setSubjectCatalog={setSubjectCatalog} showToast={showToast} />}
          {view === "sessions" && <SessionsPage sessions={sessions} teachers={teachers} onCreate={() => setCreateSessionOpen(true)} onOpen={setSelectedSession} />}
          {view === "expenses" && <ExpensesPage expenses={expenses} setExpenses={setExpenses} audit={setAudit} showToast={showToast} />}
          {view === "admin" && (
            <AdminPage
              tab={adminTab}
              setTab={setAdminTab}
              pricing={pricing}
              setPricing={setPricing}
              sessions={sessions}
              bookings={bookings}
              expenses={expenses}
              debtPayments={debtPayments}
              students={students}
              teachers={teachers}
              audit={audit}
              setAudit={setAudit}
              subjectCatalog={subjectCatalog}
              setSubjectCatalog={setSubjectCatalog}
              rooms={rooms}
              currentUsername={currentUsername}
              onCredentialsChanged={setCurrentUsername}
              onRestoreTeacher={(teacher) => {
                setTeachers((current) => current.map((item) => (item.id === teacher.id ? { ...item, active: true } : item)));
                setAudit((current) => [
                  {
                    id: String(Date.now()),
                    action: "استرجاع مدرس",
                    details: `تم استرجاع ${teacher.name} من الأرشيف`,
                    time: "الآن",
                    tone: "green",
                  },
                  ...current,
                ]);
                showToast("تم استرجاع المدرس");
              }}
              onAddRoom={(room) => {
                setRooms((current) => [...current, room]);
                setAudit((current) => [
                  {
                    id: String(Date.now()),
                    action: "إضافة قاعة",
                    details: `تمت إضافة ${room} إلى قاعات السنتر`,
                    time: "الآن",
                    tone: "green",
                  },
                  ...current,
                ]);
              }}
              onRenameRoom={(index, room) => {
                const previousRoom = rooms[index];
                setRooms((current) => current.map((item, itemIndex) => (itemIndex === index ? room : item)));
                setSessions((current) => current.map((lesson) => (lesson.room === previousRoom ? { ...lesson, room } : lesson)));
                setAudit((current) => [
                  {
                    id: String(Date.now()),
                    action: "تعديل قاعة",
                    details: `تم تغيير اسم ${previousRoom} إلى ${room}`,
                    time: "الآن",
                    tone: "blue",
                  },
                  ...current,
                ]);
              }}
              showToast={showToast}
            />
          )}
        </div>
      </main>

      {createSessionOpen && (
        <CreateSessionModal
          teachers={teachers}
          pricing={pricing}
          sessions={sessions}
          rooms={rooms}
          onClose={() => setCreateSessionOpen(false)}
          onCreate={(lesson) => {
            setSessions((current) => [lesson, ...current]);
            setAudit((current) => [
              {
                id: String(Date.now()),
                action: "إنشاء حصة",
                details: `تم إنشاء حصة ${lesson.subject} في ${lesson.room}`,
                time: "الآن",
                tone: "blue",
              },
              ...current,
            ]);
            setCreateSessionOpen(false);
            showToast("تم إنشاء الحصة بنجاح");
          }}
        />
      )}

      {selectedStudent && <StudentRecordModal student={selectedStudent} sessions={sessions} teachers={teachers} debtPayments={debtPayments} onClose={() => setSelectedStudent(null)} />}
      {selectedTeacher && <TeacherRecordModal teacher={selectedTeacher} sessions={sessions} students={students} debtPayments={debtPayments} onClose={() => setSelectedTeacher(null)} />}

      {selectedSession && (
        <SessionModal
          session={sessions.find((item) => item.id === selectedSession.id) ?? selectedSession}
          allSessions={sessions}
          debtPayments={debtPayments}
          bookings={bookings}
          students={students}
          teacherName={teacherName(sessions.find((item) => item.id === selectedSession.id)?.teacherId ?? selectedSession.teacherId)}
          onClose={() => {
            setSelectedSession(null);
            setEndReview(false);
            setStartReview(false);
            setEditSessionOpen(false);
          }}
          onEdit={() => setEditSessionOpen(true)}
          onAddStudent={(studentId, paidAmount, oldDebtPayment, advanceBookingFee) => {
            const currentLesson = sessions.find((item) => item.id === selectedSession.id) ?? selectedSession;
            const activeConflict = currentLesson.status === "active" ? findActiveStudentConflict(sessions, currentLesson.id, studentId) : undefined;
            if (activeConflict) {
              showToast(`لا يمكن الإضافة: الطالب داخل حصة ${activeConflict.subject} في ${activeConflict.room}`);
              return;
            }
            const student = students.find((item) => item.id === studentId);
            const oldDebtBefore = outstandingForStudent(sessions, debtPayments, studentId);
            const appliedOldDebt = Math.min(oldDebtBefore, Math.max(0, oldDebtPayment));
            setSessions((current) =>
              current.map((item) =>
                item.id === selectedSession.id && !item.studentIds.includes(studentId)
                  ? {
                      ...item,
                      studentIds: [...item.studentIds, studentId],
                      studentPayments: {
                        ...(item.studentPayments ?? {}),
                        [studentId]: normalizePaidAmount(paidAmount, item.studentPrice),
                      },
                    }
                  : item,
              ),
            );
            if (appliedOldDebt > 0) {
              setDebtPayments((current) => {
                const allocations = allocateDebtPayment(sessions, current, studentId, appliedOldDebt);
                const nextId = Math.max(0, ...current.map((item) => Number(item.id)).filter(Number.isFinite)) + 1;
                const created = allocations.map((allocation, index): DebtPayment => ({
                  id: String(nextId + index),
                  studentId,
                  sessionId: allocation.sessionId,
                  amount: allocation.amount,
                  date: todayIso(),
                  note: `سداد تلقائي عند تسجيل الحضور في حصة ${selectedSession.subject}`,
                }));
                return [...created, ...current];
              });
              setAudit((current) => [
                {
                  id: String(Date.now()),
                  action: "إضافة طالب وتحصيل مديونية",
                  details: `تمت إضافة ${student?.name ?? `الطالب ${studentId}`} إلى حصة ${selectedSession.subject} وتحصيل ${money(appliedOldDebt)} من مديونيته القديمة`,
                  time: "الآن",
                  tone: "green",
                },
                ...current,
              ]);
            }
            if (advanceBookingFee !== null && !hasMatchingBooking(bookings, currentLesson, studentId)) {
              setBookings((current) => [
                {
                  id: String(Math.max(0, ...current.map((booking) => Number(booking.id)).filter(Number.isFinite)) + 1),
                  studentId,
                  teacherId: currentLesson.teacherId,
                  stage: currentLesson.stage,
                  grade: currentLesson.grade,
                  subject: currentLesson.subject,
                  bookingFee: advanceBookingFee,
                  createdAt: todayIso(),
                  active: true,
                },
                ...current,
              ]);
              setAudit((current) => [
                {
                  id: String(Date.now() + 1),
                  action: "حجز مسبق من داخل الحصة",
                  details: `تم تسجيل ${student?.name ?? `الطالب ${studentId}`} مسبقاً في ${currentLesson.subject} مع ${teacherName(currentLesson.teacherId)} بقيمة ${money(advanceBookingFee)}`,
                  time: "الآن",
                  tone: "green",
                },
                ...current,
              ]);
            }
            if (advanceBookingFee !== null) showToast("تمت إضافة الطالب للحصة وتسجيل الحجز المسبق وقيمته");
            else if (appliedOldDebt >= oldDebtBefore && oldDebtBefore > 0) showToast("تمت إضافة الطالب وسداد المديونية القديمة بالكامل");
            else if (appliedOldDebt > 0) showToast(`تمت إضافة الطالب وخصم ${money(appliedOldDebt)} من مديونيته القديمة`);
            else showToast(paidAmount < selectedSession.studentPrice ? "تمت إضافة الطالب وتسجيل المبلغ المتبقي عليه" : "تمت إضافة الطالب للحصة كدفع كامل");
          }}
          onRemoveStudent={(studentId) => {
            setSessions((current) =>
              current.map((item) => {
                if (item.id !== selectedSession.id) return item;
                const studentPayments = { ...(item.studentPayments ?? {}) };
                delete studentPayments[studentId];
                return {
                  ...item,
                  studentIds: item.studentIds.filter((id) => id !== studentId),
                  studentPayments,
                };
              }),
            );
          }}
          onStart={() => {
            setStartTime(new Date().toTimeString().slice(0, 5));
            setStartReview(true);
          }}
          onPostpone={() => {
            setSessions((current) => current.map((item) => (item.id === selectedSession.id ? { ...item, status: "postponed" } : item)));
            setAudit((current) => [
              {
                id: String(Date.now()),
                action: "تأجيل حصة",
                details: `تم تأجيل حصة ${selectedSession.subject} في ${selectedSession.room}`,
                time: "الآن",
                tone: "orange",
              },
              ...current,
            ]);
            showToast("تم تأجيل الحصة ويمكن بدءها لاحقاً");
          }}
          onEnd={() => setEndReview(true)}
        />
      )}

      {editSessionOpen && selectedSession && (
        <EditSessionModal
          session={sessions.find((item) => item.id === selectedSession.id) ?? selectedSession}
          teachers={teachers}
          pricing={pricing}
          sessions={sessions}
          rooms={rooms}
          onClose={() => setEditSessionOpen(false)}
          onSave={(updated) => {
            setSessions((current) => current.map((lesson) => (lesson.id === updated.id ? updated : lesson)));
            setSelectedSession(updated);
            setAudit((current) => [
              {
                id: String(Date.now()),
                action: "تعديل حصة",
                details: `تم تحديث حصة ${updated.subject} — ${updated.date} ${updated.scheduledTime}`,
                time: "الآن",
                tone: "blue",
              },
              ...current,
            ]);
            setEditSessionOpen(false);
            showToast("تم حفظ تعديلات الحصة");
          }}
        />
      )}

      {startReview &&
        selectedSession &&
        (() => {
          const lessonToStart = sessions.find((item) => item.id === selectedSession.id) ?? selectedSession;
          return (
            <Modal title="بدء الحصة" subtitle="راجع وقت البداية الفعلي قبل التأكيد" onClose={() => setStartReview(false)}>
              <div className="modal-body">
                <label className="field">
                  وقت البداية
                  <input type="time" value={startTime} onInput={(event) => setStartTime(event.currentTarget.value)} />
                </label>
                <div className="date-note">
                  <CalendarDays size={18} />
                  <span>
                    <strong>{arabicDate()}</strong>يمكنك تعديل الوقت قبل بدء الحصة
                  </span>
                </div>
              </div>
              <div className="modal-actions">
                <button className="secondary-btn" onClick={() => setStartReview(false)}>
                  إلغاء
                </button>
                <button
                  className="primary-btn"
                  onClick={() => {
                    const roomBusy = sessions.some((item) => item.id !== lessonToStart.id && item.room === lessonToStart.room && item.status === "active");
                    if (roomBusy) {
                      showToast(`${lessonToStart.room} فيها حصة شغالة بالفعل`);
                      return;
                    }
                    const studentConflict = lessonToStart.studentIds
                      .map((studentId) => ({
                        studentId,
                        lesson: findActiveStudentConflict(sessions, lessonToStart.id, studentId),
                      }))
                      .find((item) => item.lesson);
                    if (studentConflict?.lesson) {
                      const student = students.find((item) => item.id === studentConflict.studentId);
                      showToast(`لا يمكن البدء: ${student?.name ?? "طالب"} داخل حصة ${studentConflict.lesson.subject} في ${studentConflict.lesson.room}`);
                      return;
                    }
                    setSessions((current) => current.map((item) => (item.id === lessonToStart.id ? { ...item, status: "active", startedAt: startTime } : item)));
                    setStartReview(false);
                    showToast("بدأت الحصة وتم تسجيل الوقت");
                  }}
                >
                  تأكيد بدء الحصة
                </button>
              </div>
            </Modal>
          );
        })()}

      {endReview &&
        selectedSession &&
        (() => {
          const lesson = sessions.find((item) => item.id === selectedSession.id) ?? selectedSession;
          const financials = getSessionFinancials(lesson);
          return (
            <Modal title="إنهاء الحصة" subtitle="مراجعة الحسابات النهائية قبل نقل الحصة للأرشيف" onClose={() => setEndReview(false)} wide>
              <div className="modal-body">
                <div className="review-banner">
                  <ShieldCheck size={24} />
                  <div>
                    <strong>سيتم قفل بيانات الحصة بعد التأكيد</strong>
                    <span>أي تعديل لاحق سيتم تسجيله في سجل العمليات</span>
                  </div>
                </div>
                <div className="financial-grid session-financial-grid">
                  <div>
                    <span>الطلاب الحاضرون</span>
                    <strong>{lesson.studentIds.length}</strong>
                  </div>
                  <div>
                    <span>قيمة الحصة كاملة</span>
                    <strong>{money(financials.fullTotal)}</strong>
                  </div>
                  <div className={financials.shortages ? "shortage-card" : ""}>
                    <span>النواقص</span>
                    <strong>{money(financials.shortages)}</strong>
                  </div>
                  <div>
                    <span>المحصل بعد النواقص</span>
                    <strong>{money(financials.collected)}</strong>
                  </div>
                  <div>
                    <span>مستحق المدرس</span>
                    <strong>{money(financials.teacherDue)}</strong>
                  </div>
                  <div className="highlight">
                    <span>صافي السنتر</span>
                    <strong>{money(financials.centerNet)}</strong>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="secondary-btn" onClick={() => setEndReview(false)}>
                  رجوع للحصة
                </button>
                <button
                  className="danger-confirm"
                  onClick={() => {
                    const end = new Date().toTimeString().slice(0, 5);
                    setSessions((current) => current.map((item) => (item.id === lesson.id ? { ...item, status: "ended", endedAt: end } : item)));
                    setAudit((current) => [
                      {
                        id: String(Date.now()),
                        action: "إنهاء حصة",
                        details: `تم إنهاء حصة ${lesson.subject} — صافي السنتر ${money(financials.centerNet)}`,
                        time: "الآن",
                        tone: "green",
                      },
                      ...current,
                    ]);
                    setEndReview(false);
                    setSelectedSession(null);
                    showToast("تم إنهاء الحصة ونقلها للأرشيف");
                  }}
                >
                  تأكيد وإنهاء الحصة
                </button>
              </div>
            </Modal>
          );
        })()}

      {adminPinOpen && (
        <Modal
          title={adminRecoveryMode ? "استرداد PIN الإدارة" : "فتح صفحة الإدارة"}
          subtitle="باقي النظام متاح للريسبشن بدون كلمة مرور"
          onClose={() => {
            setAdminPinOpen(false);
            setAdminRecoveryMode(false);
            setAdminAuthError("");
          }}
        >
          {!adminRecoveryMode ? (
            <form className="modal-body admin-pin-form" onSubmit={handleAdminPin}>
              <div className="admin-pin-icon">
                <LockKeyhole size={25} />
              </div>
              <label className="field">
                PIN الإدارة — 4 أرقام
                <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={4} pattern="[0-9]{4}" autoFocus required placeholder="••••" />
              </label>
              {adminAuthError && <div className="form-error">{adminAuthError}</div>}
              <button className="primary-btn" type="submit" disabled={adminAuthLoading}>
                {adminAuthLoading ? (
                  <>
                    <LoaderCircle className="spin" size={17} /> جاري الفتح…
                  </>
                ) : (
                  <>
                    فتح الإدارة <ChevronLeft size={17} />
                  </>
                )}
              </button>
              <button
                className="forgot-password"
                type="button"
                onClick={() => {
                  setAdminAuthError("");
                  setAdminRecoveryMode(true);
                }}
              >
                نسيت PIN الإدارة؟
              </button>
            </form>
          ) : (
            <form className="modal-body admin-pin-form" onSubmit={handleAdminPinRecovery}>
              <div className="admin-pin-icon recovery">
                <ShieldCheck size={25} />
              </div>
              <label className="field">
                كود الطوارئ الثابت
                <input name="recoveryCode" autoComplete="off" required placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" />
              </label>
              <label className="field">
                PIN جديد — 4 أرقام
                <input name="pin" type="password" inputMode="numeric" autoComplete="new-password" minLength={4} maxLength={4} pattern="[0-9]{4}" required placeholder="••••" />
              </label>
              {adminAuthError && <div className="form-error">{adminAuthError}</div>}
              <button className="primary-btn" type="submit" disabled={adminAuthLoading}>
                {adminAuthLoading ? "جاري الاسترداد…" : "تعيين PIN وفتح الإدارة"}
              </button>
              <button
                className="forgot-password"
                type="button"
                onClick={() => {
                  setAdminAuthError("");
                  setAdminRecoveryMode(false);
                }}
              >
                العودة لإدخال PIN
              </button>
            </form>
          )}
        </Modal>
      )}

      {cloudConflict && (
        <div className="sync-conflict-banner" role="alertdialog" aria-modal="true" aria-labelledby="sync-conflict-title">
          <div>
            <CloudOff size={23} />
            <span>
              <strong id="sync-conflict-title">يوجد تعديل محفوظ من جهاز آخر</strong>
              <small>نسخة هذا الجهاز ما زالت محفوظة بأمان. اختر النسخة التي تريد اعتمادها.</small>
            </span>
          </div>
          <div>
            <button type="button" className="secondary-btn" onClick={useCloudConflictCopy}>
              استخدام النسخة السحابية
            </button>
            <button type="button" className="primary-btn" onClick={keepLocalConflictCopy}>
              حفظ نسخة هذا الجهاز
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Dashboard({ sessions, teachers, onOpenSession, onViewAllSessions }: { sessions: LessonSession[]; teachers: Teacher[]; onOpenSession: (lesson: LessonSession) => void; onViewAllSessions: () => void }) {
  const [todaySessionsOpen, setTodaySessionsOpen] = useState(false);
  const today = todayIso();
  const todaySessions = sessions
    .filter((lesson) => lesson.date === today)
    .slice()
    .sort(newestSessionFirst);
  const active = todaySessions.filter((lesson) => lesson.status === "active");
  const ended = todaySessions.filter((lesson) => lesson.status === "ended").slice(0, 3);
  const attendance = todaySessions.filter((lesson) => lesson.status !== "scheduled").reduce((total, lesson) => total + lesson.studentIds.length, 0);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "—";
  const maxStudents = Math.max(...todaySessions.map((lesson) => lesson.studentIds.length), 1);
  return (
    <div className="dashboard-grid">
      <button type="button" className="metric-card teal metric-button" onClick={() => setTodaySessionsOpen(true)} aria-label={`فتح حصص اليوم وعددها ${todaySessions.length}`}>
        <div className="metric-icon">
          <CalendarDays size={23} />
        </div>
        <div>
          <span>حصص اليوم</span>
          <strong>{todaySessions.length}</strong>
          <small>
            <Activity size={14} /> {active.length} شغالة الآن · اضغط للتفاصيل
          </small>
        </div>
        <span className="metric-watermark">{String(todaySessions.length).padStart(2, "0")}</span>
        <span className="metric-open">
          <ChevronLeft size={18} />
        </span>
      </button>
      <section className="metric-card navy">
        <div className="metric-icon">
          <Users size={23} />
        </div>
        <div>
          <span>حضور الطلاب اليوم</span>
          <strong>{attendance}</strong>
          <small>
            <Activity size={14} /> كل حضور محسوب على حدة
          </small>
        </div>
        <span className="metric-watermark">{attendance}</span>
      </section>
      <section className="panel active-lessons">
        <div className="panel-head">
          <div>
            <span className="section-kicker live">
              <i /> مباشر الآن
            </span>
            <h2>الحصص الشغالة</h2>
          </div>
          <button type="button" className="text-btn" onClick={onViewAllSessions}>
            عرض كل الحصص <ChevronLeft size={17} />
          </button>
        </div>
        {active.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المدرس</th>
                  <th>المرحلة والصف والمادة</th>
                  <th>القاعة</th>
                  <th>الطلاب</th>
                  <th>بدأت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((lesson) => (
                  <tr key={lesson.id} onClick={() => onOpenSession(lesson)}>
                    <td>
                      <div className="person-cell">
                        <span>{teacherName(lesson.teacherId).replace("أ/ ", "").charAt(0)}</span>
                        <strong>{teacherName(lesson.teacherId)}</strong>
                      </div>
                    </td>
                    <td>
                      <strong>{lesson.subject}</strong>
                      <small>
                        {lesson.stage} · {lesson.grade}
                      </small>
                    </td>
                    <td>
                      <span className="room-tag">{lesson.room}</span>
                    </td>
                    <td>
                      <div className="student-count">
                        <Users size={16} />
                        <strong>{lesson.studentIds.length}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="time-cell">
                        <Clock3 size={15} /> {lesson.startedAt}
                      </span>
                    </td>
                    <td>
                      <button className="row-action">
                        <ChevronLeft size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Clock3 />} title="لا توجد حصص شغالة" text="الحصص التي تبدأ ستظهر هنا فوراً" />
        )}
      </section>
      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">تحليل اليوم</span>
            <h2>الحصص وعدد الطلاب</h2>
          </div>
          <span className="chart-legend">
            <i /> عدد الحضور
          </span>
        </div>
        <div className="bar-chart">
          {todaySessions.map((lesson) => (
            <div className="bar-column" key={lesson.id}>
              <span>{lesson.studentIds.length}</span>
              <div
                className={`bar ${lesson.status}`}
                style={{
                  height: `${Math.max(22, (lesson.studentIds.length / maxStudents) * 145)}px`,
                }}
              />
              <small>{lesson.scheduledTime}</small>
              <b>{lesson.subject}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="panel recent-lessons">
        <div className="panel-head">
          <div>
            <span className="section-kicker">تمت اليوم</span>
            <h2>آخر 3 حصص انتهت</h2>
          </div>
        </div>
        <div className="recent-list">
          {ended.map((lesson) => (
            <button key={lesson.id} onClick={() => onOpenSession(lesson)}>
              <span className="recent-icon">
                <Check size={18} />
              </span>
              <span className="recent-main">
                <strong>
                  {lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}
                </strong>
                <small>
                  {teacherName(lesson.teacherId)} · {lesson.room}
                </small>
              </span>
              <span className="recent-students">
                <b>{lesson.studentIds.length}</b>
                <small>طالب</small>
              </span>
              <span className="recent-time">{lesson.endedAt}</span>
              <ChevronLeft size={18} />
            </button>
          ))}
        </div>
      </section>
      {todaySessionsOpen && (
        <Modal title="حصص اليوم" subtitle={`${arabicDate()} · ${todaySessions.length} حصة`} onClose={() => setTodaySessionsOpen(false)} wide>
          <div className="modal-body today-session-list">
            {todaySessions.map((lesson) => (
              <button
                key={lesson.id}
                onClick={() => {
                  setTodaySessionsOpen(false);
                  onOpenSession(lesson);
                }}
              >
                <StatusPill status={lesson.status} />
                <div className="today-session-main">
                  <strong>
                    {lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}
                  </strong>
                  <small>
                    {teacherName(lesson.teacherId)} · {lesson.room}
                  </small>
                </div>
                <span>
                  <Clock3 size={15} /> {lesson.startedAt ?? lesson.scheduledTime}
                </span>
                <span>
                  <Users size={15} /> {lesson.studentIds.length} طلاب
                </span>
                <ChevronLeft size={18} />
              </button>
            ))}
            {!todaySessions.length && <EmptyState icon={<CalendarDays />} title="لا توجد حصص اليوم" text="الحصص التي يتم إنشاؤها بتاريخ اليوم ستظهر هنا" />}
          </div>
        </Modal>
      )}
    </div>
  );
}

function StudentsPage({ tab, setTab, students, setStudents, teachers, bookings, setBookings, sessions, debtPayments, setDebtPayments, onOpenStudent, audit, showToast }: { tab: StudentTab; setTab: (tab: StudentTab) => void; students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>>; teachers: Teacher[]; bookings: Booking[]; setBookings: React.Dispatch<React.SetStateAction<Booking[]>>; sessions: LessonSession[]; debtPayments: DebtPayment[]; setDebtPayments: React.Dispatch<React.SetStateAction<DebtPayment[]>>; onOpenStudent: (student: Student) => void; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [settlingDebt, setSettlingDebt] = useState<{
    studentId: string;
    sessionId: string;
  } | null>(null);
  const [registerStage, setRegisterStage] = useState<Stage>("المرحلة الإعدادية");
  const [editStage, setEditStage] = useState<Stage>("المرحلة الإعدادية");
  const filtered = students
    .filter((student) => student.active && [student.id, student.name, student.phone].some((value) => value.toLowerCase().includes(query.toLowerCase())))
    .slice()
    .sort(newestNumericIdFirst);
  const debtsForStudent = (studentId: string) =>
    sessions
      .filter((lesson) => lesson.studentIds.includes(studentId) && outstandingForAttendance(lesson, studentId, debtPayments) > 0)
      .slice()
      .sort(newestSessionFirst);
  const studentsWithDebt = students
    .filter((student) => outstandingForStudent(sessions, debtPayments, student.id) > 0 && [student.id, student.name, student.phone].some((value) => value.toLowerCase().includes(query.toLowerCase())))
    .slice()
    .sort((left, right) => outstandingForStudent(sessions, debtPayments, right.id) - outstandingForStudent(sessions, debtPayments, left.id));
  const selectedDebtStudent = settlingDebt ? students.find((student) => student.id === settlingDebt.studentId) : undefined;
  const selectedDebtSessions = selectedDebtStudent ? debtsForStudent(selectedDebtStudent.id) : [];
  const selectedDebtSession = settlingDebt ? sessions.find((lesson) => lesson.id === settlingDebt.sessionId) : undefined;
  const selectedDebtRemaining = selectedDebtSession && selectedDebtStudent ? outstandingForAttendance(selectedDebtSession, selectedDebtStudent.id, debtPayments) : 0;
  const addStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newStudent: Student = {
      id: nextStudentIdForStage(
        students.map((student) => student.id),
        registerStage,
      ),
      name: String(data.get("name")),
      phone: String(data.get("phone")),
      stage: registerStage,
      grade: String(data.get("grade")),
      active: true,
    };
    setStudents((current) => [...current, newStudent]);
    audit((current) => [
      {
        id: String(Date.now()),
        action: "إضافة طالب",
        details: `تم تسجيل ${newStudent.name} — ${newStudent.id}`,
        time: "الآن",
        tone: "blue",
      },
      ...current,
    ]);
    event.currentTarget.reset();
    showToast(`تم تسجيل الطالب بالرقم ${newStudent.id}`);
  };
  return (
    <div className="stack-page">
      <div className="segmented-tabs">
        <button className={tab === "register" ? "active" : ""} onClick={() => setTab("register")}>
          <UserPlus size={18} /> تسجيل طالب لأول مرة
        </button>
        <button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}>
          <BookOpen size={18} /> الحجز المسبق
        </button>
        <button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>
          <FileClock size={18} /> سجل الطلاب
        </button>
        <button className={tab === "debts" ? "active" : ""} onClick={() => setTab("debts")}>
          <WalletCards size={18} /> طلاب عليهم مبالغ
        </button>
      </div>
      {tab === "register" && (
        <section className="split-layout">
          <div className="form-panel">
            <div className="form-panel-head">
              <span>
                <UserPlus size={22} />
              </span>
              <div>
                <h2>تسجيل طالب جديد</h2>
                <p>أدخل البيانات الأساسية، وسيتم إنشاء ID من 6 أرقام حسب المرحلة</p>
              </div>
            </div>
            <form className="entity-form" onSubmit={addStudent}>
              <label className="field full">
                اسم الطالب بالكامل
                <input name="name" required placeholder="مثال: أحمد محمد علي" />
              </label>
              <label className="field full">
                رقم الهاتف
                <input name="phone" required inputMode="tel" placeholder="01xxxxxxxxx" />
              </label>
              <label className="field">
                المرحلة
                <select value={registerStage} onChange={(event) => setRegisterStage(event.target.value as Stage)}>
                  {stages.map((stage) => (
                    <option key={stage}>{stage}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                الصف
                <select name="grade" required>
                  {gradesByStage[registerStage].map((grade) => (
                    <option key={grade}>{grade}</option>
                  ))}
                </select>
              </label>
              <div className="student-id-preview full">
                <span>رقم الطالب المتوقع</span>
                <strong>
                  {nextStudentIdForStage(
                    students.map((student) => student.id),
                    registerStage,
                  )}
                </strong>
                <small>{registerStage === "المرحلة الابتدائية" ? "10" : registerStage === "المرحلة الإعدادية" ? "20" : "30"} يحدد المرحلة · آخر 4 أرقام كود الطالب</small>
              </div>
              <div className="info-note full">
                <ShieldCheck size={18} />
                <span>يمكن استخدام نفس رقم الهاتف لأكثر من طالب، والـID الرقمي المكوّن من 6 أرقام هو المعرف الأساسي.</span>
              </div>
              <button className="primary-btn full" type="submit">
                <Plus size={18} /> تسجيل الطالب
              </button>
            </form>
          </div>
          <div className="tip-card">
            <span>
              <Sparkles size={25} />
            </span>
            <h3>تسجيل سريع وواضح</h3>
            <p>بعد التسجيل سيظهر الطالب فوراً في السجل، ويمكن البحث عنه وإضافته لأي حصة أو حجز مسبق.</p>
            <div>
              <Check size={17} /> ID حسب المرحلة
            </div>
            <div>
              <Check size={17} /> تعديل وأرشفة
            </div>
            <div>
              <Check size={17} /> سجل حضور كامل
            </div>
          </div>
        </section>
      )}
      {tab === "bookings" && <BookingsPanel students={students} teachers={teachers} bookings={bookings} setBookings={setBookings} audit={audit} showToast={showToast} />}
      {tab === "debts" && (
        <>
          <section className="panel data-panel debt-panel">
            <div className="data-toolbar">
              <div>
                <h2>الطلاب الذين عليهم مبالغ</h2>
                <p>{studentsWithDebt.length} طالب · التحصيل هنا مستقل عن سعر أي حصة جديدة</p>
              </div>
              <div className="search-box">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، الهاتف أو ID" />
              </div>
            </div>
            {studentsWithDebt.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>الطالب</th>
                      <th>ID</th>
                      <th>عدد الحصص الناقصة</th>
                      <th>إجمالي المتبقي</th>
                      <th>آخر حصة ناقصة</th>
                      <th>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsWithDebt.map((student) => {
                      const debtSessions = debtsForStudent(student.id);
                      const totalDebt = outstandingForStudent(sessions, debtPayments, student.id);
                      const latest = debtSessions[0];
                      return (
                        <tr key={student.id}>
                          <td>
                            <div className="person-cell student">
                              <span>{student.name.charAt(0)}</span>
                              <strong>{student.name}</strong>
                            </div>
                            <small>{student.phone}</small>
                          </td>
                          <td>
                            <code>{student.id}</code>
                          </td>
                          <td>{debtSessions.length} حصة</td>
                          <td>
                            <span className="debt-amount">{money(totalDebt)}</span>
                          </td>
                          <td>
                            <strong>{latest?.subject}</strong>
                            <small>{latest?.date}</small>
                          </td>
                          <td>
                            <div className="table-actions">
                              <button onClick={() => onOpenStudent(student)} title="فتح سجل الطالب">
                                <FileClock size={17} />
                              </button>
                              <button
                                className="settle-debt-btn"
                                onClick={() =>
                                  latest &&
                                  setSettlingDebt({
                                    studentId: student.id,
                                    sessionId: latest.id,
                                  })
                                }
                              >
                                <WalletCards size={17} /> تسجيل سداد
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<WalletCards />} title="لا توجد مديونيات حالية" text="كل الطلاب مسددون قيمة حصصهم بالكامل" />
            )}
          </section>
          {settlingDebt && selectedDebtStudent && selectedDebtSession && (
            <Modal title="تسجيل سداد مديونية" subtitle={`${selectedDebtStudent.name} — ID ${selectedDebtStudent.id}`} onClose={() => setSettlingDebt(null)}>
              <form
                className="modal-body entity-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const amount = Math.min(selectedDebtRemaining, Math.max(0, Number(data.get("amount"))));
                  if (!amount) {
                    showToast("أدخل مبلغ سداد صحيح");
                    return;
                  }
                  const payment: DebtPayment = {
                    id: String(Math.max(...debtPayments.map((item) => Number(item.id)), 0) + 1),
                    studentId: selectedDebtStudent.id,
                    sessionId: selectedDebtSession.id,
                    amount,
                    date: todayIso(),
                    note: String(data.get("note") ?? ""),
                  };
                  setDebtPayments((current) => [payment, ...current]);
                  audit((current) => [
                    {
                      id: String(Date.now()),
                      action: "سداد مديونية طالب",
                      details: `تم تحصيل ${money(amount)} من ${selectedDebtStudent.name} عن حصة ${selectedDebtSession.subject} بدون تعديل سعر أي حصة جديدة`,
                      time: "الآن",
                      tone: "green",
                    },
                    ...current,
                  ]);
                  setSettlingDebt(null);
                  showToast(amount === selectedDebtRemaining ? "تم سداد المبلغ المتبقي بالكامل" : "تم تسجيل السداد الجزئي وتحديث المتبقي");
                }}
              >
                <label className="field full">
                  الحصة المرتبطة بالمبلغ
                  <select
                    value={settlingDebt.sessionId}
                    onChange={(event) =>
                      setSettlingDebt({
                        ...settlingDebt,
                        sessionId: event.target.value,
                      })
                    }
                  >
                    {selectedDebtSessions.map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.date} — {lesson.subject} — متبقي {money(outstandingForAttendance(lesson, selectedDebtStudent.id, debtPayments))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="debt-settlement-summary full">
                  <span>المبلغ المتبقي على الحصة</span>
                  <strong>{money(selectedDebtRemaining)}</strong>
                  <small>هذا السداد يخص الحصة القديمة فقط، ولا يغيّر حساب الحصة التالية أو مستحق المدرس.</small>
                </div>
                <label className="field full">
                  المبلغ المدفوع الآن
                  <input name="amount" type="number" min="0.01" max={selectedDebtRemaining} step="0.01" defaultValue={selectedDebtRemaining} key={`${selectedDebtSession.id}-${selectedDebtRemaining}`} required />
                </label>
                <label className="field full">
                  ملاحظة (اختياري)
                  <input name="note" placeholder="مثال: سداد باقي حصة يوم الخميس" />
                </label>
                <button className="primary-btn full" type="submit">
                  تأكيد السداد
                </button>
              </form>
            </Modal>
          )}
        </>
      )}
      {tab === "records" && (
        <section className="panel data-panel">
          <div className="data-toolbar">
            <div>
              <h2>سجل الطلاب</h2>
              <p>{filtered.length} طالب نشط</p>
            </div>
            <div className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، الهاتف أو ID" />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>ID</th>
                  <th>رقم الهاتف</th>
                  <th>المرحلة</th>
                  <th>الصف</th>
                  <th>مرات الحضور</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="person-cell student">
                        <span>{student.name.charAt(0)}</span>
                        <strong>{student.name}</strong>
                      </div>
                    </td>
                    <td>
                      <code>{student.id}</code>
                    </td>
                    <td>{student.phone}</td>
                    <td>{student.stage}</td>
                    <td>{student.grade}</td>
                    <td>
                      <span className="attendance-badge">{sessions.filter((lesson) => lesson.studentIds.includes(student.id) && lesson.status === "ended").length} حصة</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button onClick={() => onOpenStudent(student)} title="فتح السجل">
                          <FileClock size={17} />
                        </button>
                        <button
                          onClick={() => {
                            setEditStage(student.stage);
                            setEditStudent(student);
                          }}
                          title="تعديل"
                        >
                          <Edit3 size={17} />
                        </button>
                        <button
                          className="archive-action"
                          onClick={() => {
                            setStudents((current) => current.map((item) => (item.id === student.id ? { ...item, active: false } : item)));
                            audit((current) => [
                              {
                                id: String(Date.now()),
                                action: "أرشفة طالب",
                                details: `تمت أرشفة ${student.name} — ${student.id} مع الاحتفاظ بسجل حصصه وحساباته`,
                                time: "الآن",
                                tone: "orange",
                              },
                              ...current,
                            ]);
                            showToast("تم نقل الطالب للأرشيف");
                          }}
                          title="أرشفة"
                        >
                          <Archive size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editStudent && (
        <Modal title="تعديل بيانات الطالب" subtitle={editStudent.id} onClose={() => setEditStudent(null)}>
          <form
            className="modal-body entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setStudents((current) =>
                current.map((student) =>
                  student.id === editStudent.id
                    ? {
                        ...student,
                        name: String(data.get("name")),
                        phone: String(data.get("phone")),
                        stage: editStage,
                        grade: String(data.get("grade")),
                      }
                    : student,
                ),
              );
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: "تعديل طالب",
                  details: `تم تحديث بيانات ${editStudent.name} — ${editStudent.id}`,
                  time: "الآن",
                  tone: "blue",
                },
                ...current,
              ]);
              setEditStudent(null);
              showToast("تم تحديث بيانات الطالب");
            }}
          >
            <label className="field full">
              اسم الطالب
              <input name="name" defaultValue={editStudent.name} required />
            </label>
            <label className="field full">
              الهاتف
              <input name="phone" defaultValue={editStudent.phone} required />
            </label>
            <label className="field">
              المرحلة
              <select value={editStage} onChange={(event) => setEditStage(event.target.value as Stage)}>
                {stages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <label className="field">
              الصف
              <select name="grade" defaultValue={editStudent.grade}>
                {gradesByStage[editStage].map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
              </select>
            </label>
            <button className="primary-btn full" type="submit">
              حفظ التعديلات
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function BookingsPanel({ students, teachers, bookings, setBookings, audit, showToast }: { students: Student[]; teachers: Teacher[]; bookings: Booking[]; setBookings: React.Dispatch<React.SetStateAction<Booking[]>>; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState(teachers.find((teacher) => teacher.active)?.id ?? "");
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId);
  const selectedAssignment = selectedTeacher?.assignments[assignmentIndex] ?? selectedTeacher?.assignments[0];
  const normalized = query.trim().toLocaleLowerCase("ar");
  const active = bookings
    .filter((booking) => booking.active)
    .filter((booking) => {
      const student = students.find((item) => item.id === booking.studentId);
      const teacher = teachers.find((item) => item.id === booking.teacherId);
      return !normalized || `${student?.name ?? ""} ${student?.phone ?? ""} ${student?.id ?? ""} ${teacher?.name ?? ""} ${booking.subject} ${booking.grade}`.toLocaleLowerCase("ar").includes(normalized);
    })
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || newestNumericIdFirst(left, right));
  const studentCandidates = students.filter((student) => student.active && selectedAssignment && student.stage === selectedAssignment.stage && student.grade === selectedAssignment.grade && studentQuery.trim() && [student.name, student.phone, student.id].some((value) => value.toLocaleLowerCase("ar").includes(studentQuery.trim().toLocaleLowerCase("ar")))).slice(0, 6);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const closeBooking = () => {
    setOpen(false);
    setStudentQuery("");
    setSelectedStudentId("");
  };
  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <div>
          <h2>الحجوزات المسبقة</h2>
          <p>ربط الطالب بالمدرس وتسجيل قيمة الحجز بعيداً عن حساب الحصص</p>
        </div>
        <div className="toolbar-actions">
          <div className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالطالب، الهاتف، المدرس أو المادة" />
          </div>
          <button className="primary-btn" onClick={() => setOpen(true)}>
            <Plus size={18} /> حجز جديد
          </button>
        </div>
      </div>
      <div className="booking-grid">
        {active.map((booking) => {
          const student = students.find((item) => item.id === booking.studentId);
          const teacher = teachers.find((item) => item.id === booking.teacherId);
          return (
            <article key={booking.id} className="booking-card">
              <div className="booking-top">
                <span className="student-avatar">{student?.name.charAt(0)}</span>
                <div>
                  <strong>{student?.name}</strong>
                  <small>
                    {student?.id} · {booking.createdAt}
                  </small>
                </div>
                <button
                  onClick={() => {
                    setBookings((current) => current.map((item) => (item.id === booking.id ? { ...item, active: false } : item)));
                    audit((current) => [
                      {
                        id: String(Date.now()),
                        action: "أرشفة حجز مسبق",
                        details: `تمت أرشفة حجز ${student?.name ?? booking.studentId} مع ${teacher?.name ?? booking.teacherId} — ${booking.subject}`,
                        time: "الآن",
                        tone: "orange",
                      },
                      ...current,
                    ]);
                    showToast("تم نقل الحجز للأرشيف");
                  }}
                  aria-label="أرشفة الحجز"
                >
                  <Archive size={17} />
                </button>
              </div>
              <div className="booking-link">
                <span>
                  <GraduationCap size={17} /> {teacher?.name}
                </span>
                <span>
                  <BookOpen size={17} /> {booking.subject}
                </span>
                <span>
                  {booking.stage} · {booking.grade}
                </span>
              </div>
              <div className="booking-fee">
                <span>قيمة الحجز</span>
                <strong>{money(booking.bookingFee)}</strong>
              </div>
            </article>
          );
        })}
      </div>
      {!active.length && <EmptyState icon={<BookOpen />} title="لا توجد حجوزات مطابقة" text={query ? "غيّر كلمات البحث لعرض حجوزات أخرى" : "ابدأ بربط طالب مع المدرس المناسب"} />}
      {open && (
        <Modal title="حجز مسبق جديد" subtitle="ابحث عن الطالب ثم اربطه بالمدرس والمادة" onClose={closeBooking}>
          <form
            className="modal-body entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (!selectedTeacher || !selectedAssignment || !selectedStudentId || !selectedStudent || selectedStudent.stage !== selectedAssignment.stage || selectedStudent.grade !== selectedAssignment.grade) {
                showToast("اختر طالباً من نفس المرحلة والصف");
                return;
              }
              const bookingFee = Number(data.get("bookingFee"));
              setBookings((current) => [
                ...current,
                {
                  id: String(Math.max(...current.map((booking) => Number(booking.id)), 0) + 1),
                  studentId: selectedStudentId,
                  teacherId: selectedTeacher.id,
                  stage: selectedAssignment.stage,
                  grade: selectedAssignment.grade,
                  subject: selectedAssignment.subject,
                  bookingFee,
                  createdAt: todayIso(),
                  active: true,
                },
              ]);
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: "إضافة حجز مسبق",
                  details: `تم حجز ${selectedStudent.name} مع ${selectedTeacher.name} في ${selectedAssignment.subject} بقيمة ${money(bookingFee)}`,
                  time: "الآن",
                  tone: "green",
                },
                ...current,
              ]);
              closeBooking();
              showToast("تم إنشاء الحجز وتسجيل قيمته");
            }}
          >
            <div className="field full booking-student-search">
              <span>الطالب</span>
              {selectedStudent ? (
                <div className="selected-student-chip">
                  <span>{selectedStudent.name.charAt(0)}</span>
                  <div>
                    <strong>{selectedStudent.name}</strong>
                    <small>
                      {selectedStudent.id} · {selectedStudent.phone}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId("");
                      setStudentQuery("");
                    }}
                    aria-label="تغيير الطالب"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="search-box large">
                    <Search size={18} />
                    <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} autoFocus placeholder="ابحث بالاسم، الهاتف أو ID" />
                  </div>
                  {studentCandidates.length > 0 && (
                    <div className="booking-student-results">
                      {studentCandidates.map((student) => (
                        <button
                          type="button"
                          key={student.id}
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setStudentQuery(student.name);
                          }}
                        >
                          <span>{student.name.charAt(0)}</span>
                          <div>
                            <strong>{student.name}</strong>
                            <small>
                              {student.id} · {student.phone}
                            </small>
                          </div>
                          <ChevronLeft size={16} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <label className="field full">
              المدرس
              <select
                value={teacherId}
                onChange={(event) => {
                  setTeacherId(event.target.value);
                  setAssignmentIndex(0);
                }}
              >
                {teachers
                  .filter((teacher) => teacher.active)
                  .map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field full">
              المرحلة والصف والمادة
              <select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>
                {selectedTeacher?.assignments.map((assignment, index) => (
                  <option value={index} key={`${assignment.stage}-${assignment.grade}-${assignment.subject}`}>
                    {assignment.stage} — {assignment.grade} — {assignment.subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              قيمة الحجز
              <input name="bookingFee" type="number" min="0" required placeholder="مثال: 200" />
            </label>
            <div className="info-note full">
              <CircleDollarSign size={18} /> قيمة الحجز مستقلة عن الحصص ولا تدخل في حساب مستحق المدرس أو صافي الحصة.
            </div>
            <button className="primary-btn full" type="submit">
              تأكيد الحجز
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function TeachersPage({ teachers, setTeachers, sessions, onOpenTeacher, audit, subjectCatalog, setSubjectCatalog, showToast }: { teachers: Teacher[]; setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>; sessions: LessonSession[]; onOpenTeacher: (teacher: Teacher) => void; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; showToast: (message: string) => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [query, setQuery] = useState("");
  const [openTeacherMenuId, setOpenTeacherMenuId] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Assignment[]>([
    {
      stage: "المرحلة الإعدادية",
      grade: "الصف الأول",
      subject: "اللغة العربية",
    },
  ]);
  const visible = teachers
    .filter((teacher) => teacher.active && [teacher.name, teacher.phone, teacher.id].some((value) => value.includes(query)))
    .slice()
    .sort(newestNumericIdFirst);
  const openForm = (teacher?: Teacher) => {
    setEditing(teacher ?? null);
    setAssignmentDrafts(
      teacher?.assignments.map((item) => ({ ...item })) ?? [
        {
          stage: "المرحلة الإعدادية",
          grade: "الصف الأول",
          subject: subjectCatalog["المرحلة الإعدادية"][0],
        },
      ],
    );
    setFormOpen(true);
  };
  const updateAssignment = (index: number, next: Assignment) => setAssignmentDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)));
  const archiveTeacher = (teacher: Teacher) => {
    setTeachers((current) => current.map((item) => (item.id === teacher.id ? { ...item, active: false } : item)));
    audit((current) => [
      {
        id: String(Date.now()),
        action: "أرشفة مدرس",
        details: `تمت أرشفة ${teacher.name} مع الاحتفاظ بكل حصصه وحساباته`,
        time: "الآن",
        tone: "orange",
      },
      ...current,
    ]);
    setOpenTeacherMenuId(null);
    showToast("تم نقل المدرس للأرشيف مع الاحتفاظ بحصصه وحساباته");
  };
  return (
    <div className="stack-page">
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div>
            <h2>قائمة المدرسين</h2>
            <p>{visible.length} مدرس نشط</p>
          </div>
          <div className="toolbar-actions">
            <div className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن مدرس" />
            </div>
            <button className="primary-btn" onClick={() => openForm()}>
              <Plus size={18} /> إضافة مدرس
            </button>
          </div>
        </div>
        <div className="teacher-grid">
          {visible.map((teacher) => {
            const teacherSessions = sessions.filter((lesson) => lesson.teacherId === teacher.id && lesson.status === "ended");
            return (
              <article className="teacher-card" key={teacher.id}>
                <div className="teacher-card-head">
                  <span>{teacher.name.replace("أ/ ", "").charAt(0)}</span>
                  <div>
                    <h3>{teacher.name}</h3>
                    <small>
                      {teacher.id} · {teacher.phone}
                    </small>
                  </div>
                  <div className="teacher-menu-wrap">
                    <button type="button" className="teacher-more" onClick={() => setOpenTeacherMenuId((current) => (current === teacher.id ? null : teacher.id))} aria-label={`فتح إجراءات ${teacher.name}`} aria-expanded={openTeacherMenuId === teacher.id}>
                      <MoreHorizontal size={19} />
                    </button>
                    {openTeacherMenuId === teacher.id && (
                      <div className="teacher-card-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenTeacherMenuId(null);
                            onOpenTeacher(teacher);
                          }}
                        >
                          <History size={16} /> سجل الحصص
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenTeacherMenuId(null);
                            openForm(teacher);
                          }}
                        >
                          <SquarePen size={16} /> تعديل البيانات
                        </button>
                        <button type="button" className="danger" onClick={() => archiveTeacher(teacher)}>
                          <Archive size={16} /> نقل للأرشيف
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="assignment-tags">
                  {teacher.assignments.map((assignment) => (
                    <span key={`${assignment.stage}-${assignment.grade}-${assignment.subject}`}>
                      {assignment.subject}
                      <small>
                        {assignment.stage.replace("المرحلة ", "")} · {assignment.grade.replace("الصف ", "")}
                      </small>
                    </span>
                  ))}
                </div>
                <div className="teacher-stats">
                  <div>
                    <strong>{teacherSessions.length}</strong>
                    <span>حصة منتهية</span>
                  </div>
                  <div>
                    <strong>{teacherSessions.reduce((sum, lesson) => sum + lesson.studentIds.length, 0)}</strong>
                    <span>حضور طالب</span>
                  </div>
                </div>
                <div className="teacher-actions">
                  <button onClick={() => onOpenTeacher(teacher)}>
                    <History size={17} /> سجل الحصص
                  </button>
                  <button onClick={() => openForm(teacher)}>
                    <SquarePen size={17} /> تعديل
                  </button>
                  <button className="archive-action" onClick={() => archiveTeacher(teacher)} aria-label={`نقل ${teacher.name} للأرشيف`}>
                    <Archive size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {formOpen && (
        <Modal title={editing ? "تعديل بيانات المدرس" : "إضافة مدرس جديد"} subtitle="حدد المرحلة أولاً، ثم الصف والمادة المتاحة" onClose={() => setFormOpen(false)} wide>
          <form
            className="modal-body entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              if (assignmentDrafts.some((item) => !item.subject.trim())) {
                showToast("اكتب اسم المادة الجديدة");
                return;
              }
              assignmentDrafts.forEach((item) => {
                if (!subjectCatalog[item.stage].includes(item.subject))
                  setSubjectCatalog((current) => ({
                    ...current,
                    [item.stage]: [...current[item.stage], item.subject],
                  }));
              });
              if (editing)
                setTeachers((current) =>
                  current.map((teacher) =>
                    teacher.id === editing.id
                      ? {
                          ...teacher,
                          name: String(data.get("name")),
                          phone: String(data.get("phone")),
                          assignments: assignmentDrafts,
                        }
                      : teacher,
                  ),
                );
              else
                setTeachers((current) => [
                  ...current,
                  {
                    id: String(Math.max(...current.map((teacher) => Number(teacher.id)), 0) + 1),
                    name: String(data.get("name")),
                    phone: String(data.get("phone")),
                    assignments: assignmentDrafts,
                    active: true,
                  },
                ]);
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: editing ? "تعديل مدرس" : "إضافة مدرس",
                  details: `${editing ? "تم تعديل" : "تم تسجيل"} بيانات ${String(data.get("name"))}`,
                  time: "الآن",
                  tone: "blue",
                },
                ...current,
              ]);
              setFormOpen(false);
              showToast(editing ? "تم تحديث بيانات المدرس" : "تمت إضافة المدرس");
            }}
          >
            <label className="field">
              اسم المدرس
              <input name="name" defaultValue={editing?.name} placeholder="أ/ اسم المدرس" required />
            </label>
            <label className="field">
              رقم الهاتف
              <input name="phone" defaultValue={editing?.phone} required />
            </label>
            <div className="assignment-builder full">
              <div>
                <strong>المراحل والصفوف والمواد</strong>
                <button
                  type="button"
                  onClick={() =>
                    setAssignmentDrafts((current) => [
                      ...current,
                      {
                        stage: "المرحلة الإعدادية",
                        grade: "الصف الأول",
                        subject: subjectCatalog["المرحلة الإعدادية"][0],
                      },
                    ])
                  }
                >
                  <Plus size={16} /> إضافة تخصص
                </button>
              </div>
              {assignmentDrafts.map((assignment, index) => {
                const isCustom = !subjectCatalog[assignment.stage].includes(assignment.subject);
                return (
                  <div className="assignment-row expanded" key={index}>
                    <label className="field">
                      <span>المرحلة</span>
                      <select
                        value={assignment.stage}
                        onChange={(event) => {
                          const stage = event.target.value as Stage;
                          updateAssignment(index, {
                            stage,
                            grade: gradesByStage[stage][0],
                            subject: subjectCatalog[stage][0],
                          });
                        }}
                      >
                        {stages.map((stage) => (
                          <option key={stage}>{stage}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>الصف</span>
                      <select
                        value={assignment.grade}
                        onChange={(event) =>
                          updateAssignment(index, {
                            ...assignment,
                            grade: event.target.value,
                          })
                        }
                      >
                        {gradesByStage[assignment.stage].map((grade) => (
                          <option key={grade}>{grade}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>المادة</span>
                      <select
                        value={isCustom ? "__custom__" : assignment.subject}
                        onChange={(event) =>
                          updateAssignment(index, {
                            ...assignment,
                            subject: event.target.value === "__custom__" ? "" : event.target.value,
                          })
                        }
                      >
                        {subjectCatalog[assignment.stage].map((subject) => (
                          <option key={subject}>{subject}</option>
                        ))}
                        <option value="__custom__">+ مادة جديدة</option>
                      </select>
                    </label>
                    {isCustom && (
                      <label className="field custom-subject">
                        <span>اسم المادة الجديدة</span>
                        <input
                          value={assignment.subject}
                          onChange={(event) =>
                            updateAssignment(index, {
                              ...assignment,
                              subject: event.target.value,
                            })
                          }
                          placeholder="اكتب اسم المادة"
                          required
                        />
                      </label>
                    )}
                    {assignmentDrafts.length > 1 && (
                      <button type="button" className="remove-row" onClick={() => setAssignmentDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button className="primary-btn full" type="submit">
              {editing ? "حفظ التعديلات" : "إضافة المدرس"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SessionsPage({ sessions, teachers, onCreate, onOpen }: { sessions: LessonSession[]; teachers: Teacher[]; onCreate: () => void; onOpen: (lesson: LessonSession) => void }) {
  const [filter, setFilter] = useState<"all" | SessionStatus>("all");
  const visible = sessions
    .filter((lesson) => filter === "all" || lesson.status === filter)
    .slice()
    .sort(newestSessionFirst);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name;
  return (
    <div className="stack-page">
      <div className="sessions-hero">
        <div>
          <span className="eyebrow">
            <Activity size={15} /> تشغيل اليوم
          </span>
          <h2>
            نظّم يوم السنتر
            <br />
            حصة بحصة.
          </h2>
          <p>أنشئ الحصة، سجّل بدايتها، أضف الطلاب ثم راجع الحسابات قبل الإنهاء.</p>
        </div>
        <button className="hero-create" onClick={onCreate}>
          <span>
            <Plus size={25} />
          </span>
          إنشاء حصة جديدة
        </button>
      </div>
      <div className="filter-row">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>
          الكل <b>{sessions.length}</b>
        </button>
        <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>
          شغالة الآن <b>{sessions.filter((lesson) => lesson.status === "active").length}</b>
        </button>
        <button className={filter === "scheduled" ? "active" : ""} onClick={() => setFilter("scheduled")}>
          مجدولة <b>{sessions.filter((lesson) => lesson.status === "scheduled").length}</b>
        </button>
        <button className={filter === "postponed" ? "active" : ""} onClick={() => setFilter("postponed")}>
          مؤجلة <b>{sessions.filter((lesson) => lesson.status === "postponed").length}</b>
        </button>
        <button className={filter === "ended" ? "active" : ""} onClick={() => setFilter("ended")}>
          انتهت <b>{sessions.filter((lesson) => lesson.status === "ended").length}</b>
        </button>
      </div>
      <div className="session-card-grid">
        {visible.map((lesson) => {
          const gross = lesson.studentIds.length * lesson.studentPrice;
          return (
            <button className={`session-card ${lesson.status}`} key={lesson.id} onClick={() => onOpen(lesson)}>
              <div className="session-card-top">
                <StatusPill status={lesson.status} />
                <code>{lesson.id}</code>
              </div>
              <h3>{lesson.subject}</h3>
              <p>
                {lesson.stage} · {lesson.grade}
              </p>
              <div className="session-teacher">
                <span>{teacherName(lesson.teacherId)?.replace("أ/ ", "").charAt(0)}</span>
                <strong>{teacherName(lesson.teacherId)}</strong>
              </div>
              <div className="session-meta">
                <span>
                  <Clock3 size={16} /> {lesson.startedAt ?? lesson.scheduledTime}
                </span>
                <span>
                  <BookOpen size={16} /> {lesson.room}
                </span>
                <span>
                  <Users size={16} /> {lesson.studentIds.length} طلاب
                </span>
              </div>
              <div className="session-card-foot">
                <span>قيمة الحصة</span>
                <strong>{money(gross)}</strong>
                <ChevronLeft size={19} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpensesPage({ expenses, setExpenses, audit, showToast }: { expenses: CenterExpense[]; setExpenses: React.Dispatch<React.SetStateAction<CenterExpense[]>>; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const categories: CenterExpense["category"][] = ["إيجار", "مرافق", "أدوات ومستلزمات", "صيانة", "رواتب", "أخرى"];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | CenterExpense["category"]>("all");
  const [deletingExpense, setDeletingExpense] = useState<CenterExpense | null>(null);
  const normalized = query.trim().toLocaleLowerCase("ar");
  const visible = expenses
    .filter((expense) => category === "all" || expense.category === category)
    .filter((expense) => !normalized || `${expense.description} ${expense.category} ${expense.date} ${expense.id}`.toLocaleLowerCase("ar").includes(normalized))
    .sort((a, b) => b.date.localeCompare(a.date) || Number(b.id) - Number(a.id));
  const total = visible.reduce((sum, expense) => sum + expense.amount, 0);
  return (
    <div className="expenses-stack">
      <section className="expenses-hero">
        <div>
          <span className="eyebrow">
            <ReceiptText size={16} /> حسابات السنتر
          </span>
          <h2>
            كل مصروف
            <br />
            متسجّل ومحسوب.
          </h2>
          <p>سجّل مصروفات التشغيل، وسيتم خصمها تلقائيًا من صافي ربح السنتر في الإحصائيات.</p>
        </div>
        <div className="expense-total-card">
          <span>إجمالي النتائج الحالية</span>
          <strong>{money(total)}</strong>
          <small>{visible.length} مصروف</small>
        </div>
        <button className="primary-btn" onClick={() => setOpen(true)}>
          <Plus size={18} /> إضافة مصروف
        </button>
      </section>
      <section className="panel data-panel">
        <div className="data-toolbar expense-toolbar">
          <div>
            <h2>سجل المصروفات</h2>
            <p>
              {visible.length} سجل · {money(total)}
            </p>
          </div>
          <div className="expense-filter-actions">
            <div className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث في الوصف أو التاريخ أو ID" />
            </div>
            <label className="expense-category-filter">
              <select value={category} onChange={(event) => setCategory(event.target.value as "all" | CenterExpense["category"])}>
                <option value="all">كل الفئات</option>
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {visible.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>التاريخ</th>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((expense) => (
                  <tr key={expense.id}>
                    <td>
                      <code>{expense.id}</code>
                    </td>
                    <td>{expense.date}</td>
                    <td>
                      <span className="expense-category-tag">{expense.category}</span>
                    </td>
                    <td>
                      <strong>{expense.description}</strong>
                    </td>
                    <td>
                      <span className="expense-amount">{money(expense.amount)}</span>
                    </td>
                    <td>
                      <button type="button" className="table-icon delete" onClick={() => setDeletingExpense(expense)} aria-label={`حذف مصروف ${expense.description}`}>
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>إجمالي المصروفات المعروضة</td>
                  <td colSpan={2}>{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState icon={<ReceiptText />} title="لا توجد مصروفات" text="أضف أول مصروف ليظهر في السجل والإحصائيات" />
        )}
      </section>
      {open && (
        <Modal title="إضافة مصروف جديد" subtitle="سيُخصم المبلغ من صافي ربح السنتر حسب تاريخ المصروف" onClose={() => setOpen(false)}>
          <form
            className="modal-body entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const expense: CenterExpense = {
                id: String(Math.max(...expenses.map((item) => Number(item.id)), 0) + 1),
                category: String(data.get("category")) as CenterExpense["category"],
                amount: Number(data.get("amount")),
                date: String(data.get("date")),
                description: String(data.get("description")).trim(),
              };
              setExpenses((current) => [expense, ...current]);
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: "إضافة مصروف",
                  details: `${expense.description} — ${money(expense.amount)}`,
                  time: "الآن",
                  tone: "orange",
                },
                ...current,
              ]);
              setOpen(false);
              showToast("تم تسجيل المصروف وخصمه من الحسابات");
            }}
          >
            <label className="field">
              الفئة
              <select name="category">
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              التاريخ
              <input name="date" type="date" defaultValue={todayIso()} required />
            </label>
            <label className="field full">
              الوصف
              <input name="description" placeholder="مثال: فاتورة الكهرباء" required />
            </label>
            <label className="field full">
              المبلغ
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </label>
            <button className="primary-btn full" type="submit">
              حفظ المصروف
            </button>
          </form>
        </Modal>
      )}
      {deletingExpense && (
        <Modal title="حذف المصروف" subtitle="سيتم تعديل صافي الربح بعد الحذف" onClose={() => setDeletingExpense(null)}>
          <div className="modal-body">
            <div className="delete-review">
              <Trash2 size={22} />
              <div>
                <strong>{deletingExpense.description}</strong>
                <span>
                  {deletingExpense.date} · {deletingExpense.category} · {money(deletingExpense.amount)}
                </span>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="secondary-btn" onClick={() => setDeletingExpense(null)}>
              إلغاء
            </button>
            <button
              className="danger-confirm"
              onClick={() => {
                const removed = deletingExpense;
                setExpenses((current) => current.filter((expense) => expense.id !== removed.id));
                audit((current) => [
                  {
                    id: String(Date.now()),
                    action: "حذف مصروف",
                    details: `${removed.description} — ${money(removed.amount)}`,
                    time: "الآن",
                    tone: "orange",
                  },
                  ...current,
                ]);
                setDeletingExpense(null);
                showToast("تم حذف المصروف وتحديث الحسابات");
              }}
            >
              تأكيد الحذف
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateSessionModal({ teachers, pricing, sessions, rooms, onClose, onCreate }: { teachers: Teacher[]; pricing: PriceRule[]; sessions: LessonSession[]; rooms: string[]; onClose: () => void; onCreate: (lesson: LessonSession) => void }) {
  const [teacherId, setTeacherId] = useState(teachers.find((teacher) => teacher.active)?.id ?? "");
  const teacher = teachers.find((item) => item.id === teacherId);
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [conflictError, setConflictError] = useState("");
  const assignment = teacher?.assignments[assignmentIndex] ?? teacher?.assignments[0];
  const rule = pricing.find((item) => item.stage === assignment?.stage && item.grade === assignment?.grade && item.subject === assignment?.subject);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!assignment) return;
    const room = String(data.get("room"));
    const date = String(data.get("date"));
    const scheduledTime = String(data.get("time"));
    const conflict = sessions.some((lesson) => lesson.room === room && lesson.date === date && lesson.scheduledTime === scheduledTime && lesson.status !== "ended");
    if (conflict) {
      setConflictError(`لا يمكن الحفظ: ${room} محجوزة في نفس التاريخ والوقت`);
      return;
    }
    setConflictError("");
    onCreate({
      id: String(Math.max(...sessions.map((lesson) => Number(lesson.id)), 0) + 1),
      teacherId,
      stage: assignment.stage,
      grade: assignment.grade,
      subject: assignment.subject,
      room,
      date,
      scheduledTime,
      status: "scheduled",
      studentIds: [],
      studentPrice: rule?.studentPrice ?? 0,
      teacherFee: rule?.teacherFee ?? 0,
    });
  };
  return (
    <Modal title="إنشاء حصة جديدة" subtitle="المرحلة والصف والمادة يظهرون حسب بيانات المدرس" onClose={onClose} wide>
      <form className="modal-body entity-form" onSubmit={submit}>
        <label className="field full">
          المدرس
          <select
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setAssignmentIndex(0);
            }}
          >
            {teachers
              .filter((item) => item.active)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field full">
          المرحلة والصف والمادة
          <select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>
            {teacher?.assignments.map((item, index) => (
              <option key={`${item.stage}-${item.grade}-${item.subject}`} value={index}>
                {item.stage} — {item.grade} — {item.subject}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          التاريخ
          <input name="date" type="date" defaultValue={todayIso()} required />
        </label>
        <label className="field">
          الساعة
          <input name="time" type="time" defaultValue="17:00" required />
        </label>
        <label className="field full">
          القاعة
          <select name="room">
            {rooms.map((room) => (
              <option key={room}>{room}</option>
            ))}
          </select>
        </label>
        <div className="price-preview full">
          <div>
            <span>سعر الطالب</span>
            <strong>{money(rule?.studentPrice ?? 0)}</strong>
          </div>
          <div>
            <span>أجر المدرس / طالب</span>
            <strong>{money(rule?.teacherFee ?? 0)}</strong>
          </div>
        </div>
        {conflictError && <div className="form-error full">{conflictError}</div>}
        <div className="info-note full">
          <ShieldCheck size={18} /> لا يمكن حجز قاعة لحصتين في نفس التاريخ والوقت، ولا بدء حصتين في نفس القاعة.
        </div>
        <button className="primary-btn full" type="submit">
          إنشاء الحصة
        </button>
      </form>
    </Modal>
  );
}

function EditSessionModal({ session, teachers, pricing, sessions, rooms, onClose, onSave }: { session: LessonSession; teachers: Teacher[]; pricing: PriceRule[]; sessions: LessonSession[]; rooms: string[]; onClose: () => void; onSave: (lesson: LessonSession) => void }) {
  const [teacherId, setTeacherId] = useState(session.teacherId);
  const teacher = teachers.find((item) => item.id === teacherId);
  const initialAssignmentIndex = Math.max(teacher?.assignments.findIndex((assignment) => assignment.stage === session.stage && assignment.grade === session.grade && assignment.subject === session.subject) ?? 0, 0);
  const [assignmentIndex, setAssignmentIndex] = useState(initialAssignmentIndex);
  const [date, setDate] = useState(session.date);
  const [time, setTime] = useState(session.scheduledTime);
  const [room, setRoom] = useState(session.room);
  const [conflictError, setConflictError] = useState("");
  const assignment = teacher?.assignments[assignmentIndex] ?? teacher?.assignments[0];
  const rule = pricing.find((item) => item.stage === assignment?.stage && item.grade === assignment?.grade && item.subject === assignment?.subject);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!assignment) return;
    const scheduledConflict = sessions.some((lesson) => lesson.id !== session.id && lesson.room === room && lesson.date === date && lesson.scheduledTime === time && lesson.status !== "ended");
    const activeConflict = session.status === "active" && sessions.some((lesson) => lesson.id !== session.id && lesson.room === room && lesson.status === "active");
    if (scheduledConflict || activeConflict) {
      setConflictError(`لا يمكن الحفظ: ${room} مرتبطة بحصة أخرى في هذا الوقت`);
      return;
    }
    onSave({
      ...session,
      teacherId,
      stage: assignment.stage,
      grade: assignment.grade,
      subject: assignment.subject,
      room,
      date,
      scheduledTime: time,
      studentPrice: rule?.studentPrice ?? session.studentPrice,
      teacherFee: rule?.teacherFee ?? session.teacherFee,
    });
  };
  return (
    <Modal title="تعديل بيانات الحصة" subtitle={`${session.id} · التغييرات تُسجل في سجل العمليات`} onClose={onClose} wide>
      <form className="modal-body entity-form" onSubmit={submit}>
        <label className="field full">
          المدرس
          <select
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setAssignmentIndex(0);
            }}
          >
            {teachers
              .filter((item) => item.active || item.id === session.teacherId)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field full">
          المرحلة والصف والمادة
          <select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>
            {teacher?.assignments.map((item, index) => (
              <option key={`${item.stage}-${item.grade}-${item.subject}`} value={index}>
                {item.stage} — {item.grade} — {item.subject}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          التاريخ
          <input type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} required />
        </label>
        <label className="field">
          الساعة
          <input type="time" value={time} onInput={(event) => setTime(event.currentTarget.value)} required />
        </label>
        <label className="field full">
          القاعة
          <select value={room} onChange={(event) => setRoom(event.target.value)}>
            {rooms.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="price-preview full">
          <div>
            <span>سعر الطالب بعد التعديل</span>
            <strong>{money(rule?.studentPrice ?? session.studentPrice)}</strong>
          </div>
          <div>
            <span>أجر المدرس / طالب</span>
            <strong>{money(rule?.teacherFee ?? session.teacherFee)}</strong>
          </div>
        </div>
        {conflictError && <div className="form-error full">{conflictError}</div>}
        <div className="modal-actions full">
          <button type="button" className="secondary-btn" onClick={onClose}>
            إلغاء
          </button>
          <button className="primary-btn" type="submit">
            حفظ تعديلات الحصة
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SessionModal({ session, allSessions, debtPayments, bookings, students, teacherName, onClose, onEdit, onAddStudent, onRemoveStudent, onStart, onPostpone, onEnd }: { session: LessonSession; allSessions: LessonSession[]; debtPayments: DebtPayment[]; bookings: Booking[]; students: Student[]; teacherName: string; onClose: () => void; onEdit: () => void; onAddStudent: (id: string, paidAmount: number, oldDebtPayment: number, advanceBookingFee: number | null) => void; onRemoveStudent: (id: string) => void; onStart: () => void; onPostpone: () => void; onEnd: () => void }) {
  const [query, setQuery] = useState("");
  const [pendingStudent, setPendingStudent] = useState<Student | null>(null);
  const [payFull, setPayFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState(String(session.studentPrice));
  const [registerBookingNow, setRegisterBookingNow] = useState(false);
  const [bookingFee, setBookingFee] = useState("");
  const [studentError, setStudentError] = useState("");
  const candidates = students.filter((student) => student.active && isStudentInSessionGrade(student, session) && !session.studentIds.includes(student.id) && query && [student.name, student.phone, student.id].some((value) => value.includes(query))).slice(0, 4);
  const financials = getSessionFinancials(session);
  const pendingOldDebt = pendingStudent ? outstandingForStudent(allSessions, debtPayments, pendingStudent.id) : 0;
  const combinedTotal = session.studentPrice + pendingOldDebt;
  const enteredTotal = payFull ? session.studentPrice : normalizeAttendancePaymentTotal(paidAmount, session.studentPrice, pendingOldDebt);
  const currentLessonPaid = Math.min(session.studentPrice, enteredTotal);
  const oldDebtPaid = Math.min(pendingOldDebt, Math.max(0, enteredTotal - session.studentPrice));
  const currentLessonRemaining = Math.max(0, session.studentPrice - currentLessonPaid);
  const oldDebtRemaining = Math.max(0, pendingOldDebt - oldDebtPaid);
  const pendingHasBooking = pendingStudent ? hasMatchingBooking(bookings, session, pendingStudent.id) : false;
  const openPayment = (student: Student) => {
    const conflict = session.status === "active" ? findActiveStudentConflict(allSessions, session.id, student.id) : undefined;
    if (conflict) {
      setStudentError(`لا يمكن إضافة ${student.name}: الطالب داخل حصة ${conflict.subject} في ${conflict.room}`);
      return;
    }
    setStudentError("");
    setPendingStudent(student);
    setPayFull(true);
    setPaidAmount(String(session.studentPrice));
    setRegisterBookingNow(false);
    setBookingFee("");
  };
  const confirmAttendance = () => {
    if (!pendingStudent) return;
    if (!payFull && Number(paidAmount) > combinedTotal) {
      setStudentError(`الحد الأقصى للمبلغ هو ${money(combinedTotal)}`);
      return;
    }
    if (!pendingHasBooking && registerBookingNow && (bookingFee === "" || Number(bookingFee) < 0)) {
      setStudentError("أدخل قيمة صحيحة للحجز المسبق");
      return;
    }
    onAddStudent(pendingStudent.id, currentLessonPaid, oldDebtPaid, !pendingHasBooking && registerBookingNow ? Number(bookingFee) : null);
    setPendingStudent(null);
    setQuery("");
  };
  return (
    <>
      <Modal title={`${session.subject} — ${gradeLabel(session.stage, session.grade)}`} subtitle={`${session.id} · ${session.room}`} onClose={onClose} wide>
        <div className="session-modal-body">
          <div className="session-summary">
            <div>
              <StatusPill status={session.status} />
              <h3>{teacherName}</h3>
              <p>
                <CalendarDays size={16} /> {session.date} <Clock3 size={16} /> {session.startedAt ?? session.scheduledTime}
              </p>
            </div>
            <div className="session-summary-actions">
              {session.status !== "ended" && (
                <button className="secondary-btn" onClick={onEdit}>
                  <Edit3 size={17} /> تعديل
                </button>
              )}
              {(session.status === "scheduled" || session.status === "postponed") && (
                <button className="start-btn" onClick={onStart}>
                  <Activity size={18} /> {session.status === "postponed" ? "بدء الحصة مجدداً" : "بدء الحصة"}
                </button>
              )}
              {session.status === "active" && (
                <>
                  <button className="postpone-btn" onClick={onPostpone}>
                    <PauseCircle size={18} /> تأجيل الحصة
                  </button>
                  <button className="end-btn" onClick={onEnd}>
                    <Check size={18} /> إنهاء الحصة
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="financial-grid session-financial-grid">
            <div>
              <span>عدد الطلاب</span>
              <strong>{session.studentIds.length}</strong>
            </div>
            <div>
              <span>قيمة الحصة كاملة</span>
              <strong>{money(financials.fullTotal)}</strong>
            </div>
            <div className={financials.shortages ? "shortage-card" : ""}>
              <span>النواقص</span>
              <strong>{money(financials.shortages)}</strong>
            </div>
            <div>
              <span>المحصل بعد النواقص</span>
              <strong>{money(financials.collected)}</strong>
            </div>
            <div>
              <span>مستحق المدرس</span>
              <strong>{money(financials.teacherDue)}</strong>
            </div>
            <div className="highlight">
              <span>صافي السنتر</span>
              <strong>{money(financials.centerNet)}</strong>
            </div>
          </div>
          {session.status !== "ended" && (
            <div className="student-search-wrap">
              <label>إضافة طالب للحصة</label>
              <div className="search-box large">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setStudentError("");
                  }}
                  placeholder="ابحث بالاسم، رقم الهاتف أو ID"
                />
              </div>
              {studentError && (
                <div className="student-conflict-alert">
                  <Users size={17} /> {studentError}
                </div>
              )}
              {candidates.length > 0 && (
                <div className="search-results">
                  {candidates.map((student) => {
                    const oldDebt = outstandingForStudent(allSessions, debtPayments, student.id);
                    const conflict = session.status === "active" ? findActiveStudentConflict(allSessions, session.id, student.id) : undefined;
                    return (
                      <button key={student.id} className={conflict ? "student-busy" : ""} onClick={() => openPayment(student)}>
                        <span>{student.name.charAt(0)}</span>
                        <div>
                          <strong>{student.name}</strong>
                          <small>
                            {student.id} · {student.phone}
                          </small>
                          {oldDebt > 0 && <em className="candidate-debt">عليه سابقاً {money(oldDebt)}</em>}
                          {conflict && (
                            <em className="candidate-conflict">
                              داخل حصة {conflict.subject} · {conflict.room}
                            </em>
                          )}
                        </div>
                        {conflict ? <X size={18} /> : <Plus size={18} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="attendance-list">
            <div className="attendance-head">
              <h3>الطلاب الحاضرون</h3>
              <span>{session.studentIds.length} طالب</span>
            </div>
            {session.studentIds.map((studentId, index) => {
              const student = students.find((item) => item.id === studentId);
              const paid = paidDuringSession(session, studentId);
              const shortage = shortageForAttendance(session, studentId);
              return (
                <div className="attendance-row" key={studentId}>
                  <span className="row-number">{index + 1}</span>
                  <span className="student-avatar">{student?.name.charAt(0)}</span>
                  <div>
                    <strong>{student?.name}</strong>
                    <small>
                      {student?.id} · {student && gradeLabel(student.stage, student.grade)}
                    </small>
                  </div>
                  <span className={shortage ? "debt-badge" : "paid-tag"}>
                    {shortage ? (
                      `متبقي ${money(shortage)}`
                    ) : (
                      <>
                        <Check size={14} /> دفع كامل
                      </>
                    )}
                  </span>
                  <strong>{money(paid)}</strong>
                  {session.status !== "ended" && (
                    <button className="remove-student" onClick={() => onRemoveStudent(studentId)}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
      {pendingStudent && (
        <Modal title="تسجيل دفع الطالب" subtitle={`${pendingStudent.name} — سعر الحصة ${money(session.studentPrice)}`} onClose={() => setPendingStudent(null)}>
          <div className="modal-body">
            <div className={`booking-check-note ${pendingHasBooking ? "booked" : "not-booked"}`}>
              {pendingHasBooking ? <Check size={18} /> : <BookOpen size={18} />}
              <div>
                <strong>{pendingHasBooking ? "الطالب حاجز هذه المادة" : "الطالب غير حاجز هذه المادة"}</strong>
                <small>
                  {session.subject} مع {teacherName} — {session.grade}
                </small>
              </div>
            </div>
            {!pendingHasBooking && (
              <div className={`inline-booking-option ${registerBookingNow ? "selected" : ""}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={registerBookingNow}
                    onChange={(event) => {
                      setRegisterBookingNow(event.target.checked);
                      setStudentError("");
                    }}
                  />
                  <span>
                    <strong>تسجيل الطالب مسبقاً الآن</strong>
                    <small>سيظهر الحجز فوراً في قسم الحجوزات المسبقة ويُضاف دخله للحسابات.</small>
                  </span>
                </label>
                {registerBookingNow && (
                  <label className="field booking-fee-field">
                    قيمة الحجز المسبق
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={bookingFee}
                      onChange={(event) => {
                        setBookingFee(event.target.value);
                        setStudentError("");
                      }}
                      placeholder="اكتب قيمة الحجز"
                      autoFocus
                      required
                    />
                  </label>
                )}
              </div>
            )}
            {studentError && <div className="form-error session-payment-error">{studentError}</div>}
            <div className="payment-choice">
              <button
                type="button"
                className={payFull ? "active" : ""}
                onClick={() => {
                  setPayFull(true);
                  setPaidAmount(String(session.studentPrice));
                }}
              >
                <Check size={18} />
                <span>
                  <strong>دفع الحصة كاملة</strong>
                  <small>{money(session.studentPrice)} — الاختيار الافتراضي</small>
                </span>
              </button>
              <button
                type="button"
                className={!payFull ? "active partial" : ""}
                onClick={() => {
                  setPayFull(false);
                  setPaidAmount("");
                }}
              >
                <WalletCards size={18} />
                <span>
                  <strong>إدخال المبلغ المدفوع</strong>
                  <small>{pendingOldDebt > 0 ? "يمكن سداد الحصة والمديونية القديمة معاً" : "يتسجل الباقي على الطالب"}</small>
                </span>
              </button>
            </div>
            {pendingOldDebt > 0 && (
              <div className="payment-debt-breakdown" role="status">
                <div>
                  <span>سعر الحصة الحالية</span>
                  <strong>{money(session.studentPrice)}</strong>
                </div>
                <div>
                  <span>المبلغ القديم على الطالب</span>
                  <strong>{money(pendingOldDebt)}</strong>
                </div>
                <div className="payment-debt-total">
                  <span>الإجمالي لسداد الكل</span>
                  <strong>{money(combinedTotal)}</strong>
                </div>
              </div>
            )}
            {!payFull && (
              <label className="field payment-amount">
                إجمالي المبلغ المدفوع الآن
                <input
                  autoFocus
                  type="number"
                  min="0"
                  max={combinedTotal}
                  step="0.01"
                  value={paidAmount}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "") {
                      setPaidAmount("");
                      setStudentError("");
                      return;
                    }
                    const numeric = Number(value);
                    if (numeric > combinedTotal) {
                      setPaidAmount(String(combinedTotal));
                      setStudentError(`لا يمكن إدخال أكثر من ${money(combinedTotal)}${pendingOldDebt > 0 ? " شامل المديونية القديمة" : " وهو سعر الحصة"}`);
                      return;
                    }
                    setPaidAmount(numeric < 0 ? "0" : value);
                    setStudentError("");
                  }}
                  placeholder="اكتب إجمالي المبلغ الذي دفعه الطالب"
                />
                <small>{currentLessonRemaining > 0 ? `متبقي من الحصة الحالية: ${money(currentLessonRemaining)}` : oldDebtPaid > 0 ? `سيتم خصم ${money(oldDebtPaid)} من القديم، والمتبقي القديم ${money(oldDebtRemaining)}` : pendingOldDebt > 0 ? `الحصة الحالية مسددة، والمتبقي القديم ${money(oldDebtRemaining)}` : "تم سداد سعر الحصة بالكامل"}</small>
                {pendingOldDebt > 0 && oldDebtRemaining === 0 && currentLessonRemaining === 0 && (
                  <em className="debt-cleared-note">
                    <Check size={15} /> سيتم سداد المديونية بالكامل وإزالة الطالب من قائمة «طلاب عليهم مبالغ»
                  </em>
                )}
              </label>
            )}
            <div className="teacher-protection-note">
              <ShieldCheck size={18} />
              <span>مستحق المدرس يظل {money(session.teacherFee)} عن هذا الطالب سواء دفع كامل أو ناقص. أي سداد زائد عن سعر الحصة يخص المديونية القديمة فقط.</span>
            </div>
          </div>
          <div className="modal-actions">
            <button className="secondary-btn" onClick={() => setPendingStudent(null)}>
              إلغاء
            </button>
            <button className="primary-btn" onClick={confirmAttendance} disabled={!payFull && paidAmount === ""}>
              تأكيد وإضافة الطالب
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function StudentRecordModal({ student, sessions, teachers, debtPayments, onClose }: { student: Student; sessions: LessonSession[]; teachers: Teacher[]; debtPayments: DebtPayment[]; onClose: () => void }) {
  const history = sessions
    .filter((lesson) => lesson.studentIds.includes(student.id) && lesson.status === "ended")
    .slice()
    .sort(newestSessionFirst);
  const settlements = debtPayments.filter((payment) => payment.studentId === student.id);
  const outstanding = outstandingForStudent(sessions, debtPayments, student.id);
  const totalPaid = history.reduce((sum, lesson) => sum + paidDuringSession(lesson, student.id), 0) + settlements.reduce((sum, payment) => sum + payment.amount, 0);
  return (
    <Modal title="سجل الطالب" subtitle={`${student.name} — ${student.id}`} onClose={onClose} wide>
      <div className="modal-body">
        <div className="profile-strip student-finance-strip">
          <span>{student.name.charAt(0)}</span>
          <div>
            <h3>{student.name}</h3>
            <p>
              {student.phone} · {gradeLabel(student.stage, student.grade)}
            </p>
          </div>
          <div>
            <strong>{history.length}</strong>
            <small>حصة مكتملة</small>
          </div>
          <div>
            <strong>{money(totalPaid)}</strong>
            <small>إجمالي ما تم دفعه</small>
          </div>
          <div className={outstanding ? "student-debt-total" : ""}>
            <strong>{money(outstanding)}</strong>
            <small>إجمالي المتبقي عليه</small>
          </div>
        </div>
        <div className="timeline">
          {history.map((lesson) => {
            const paid = paidDuringSession(lesson, student.id);
            const initialShortage = shortageForAttendance(lesson, student.id);
            const remaining = outstandingForAttendance(lesson, student.id, debtPayments);
            const settled = Math.max(0, initialShortage - remaining);
            return (
              <article key={lesson.id}>
                <i />
                <div className="timeline-time">
                  <strong>{lesson.date}</strong>
                  <span>
                    {lesson.startedAt} — {lesson.endedAt}
                  </span>
                </div>
                <div className="timeline-card student-payment-card">
                  <div>
                    <h4>{lesson.subject}</h4>
                    <p>
                      {teachers.find((teacher) => teacher.id === lesson.teacherId)?.name ?? "مدرس مؤرشف"} · {gradeLabel(lesson.stage, lesson.grade)} · {lesson.room}
                    </p>
                    <small>
                      سعر الحصة {money(lesson.studentPrice)} · دفع وقت الحصة {money(paid)}
                      {settled > 0 ? ` · سداد لاحق ${money(settled)}` : ""}
                    </small>
                  </div>
                  <strong className={remaining ? "debt-text" : ""}>{remaining ? `متبقي ${money(remaining)}` : "مسدد"}</strong>
                </div>
              </article>
            );
          })}
        </div>
        {!history.length && <EmptyState icon={<FileClock />} title="لا يوجد سجل حتى الآن" text="ستظهر حصص الطالب المنتهية هنا" />}
      </div>
    </Modal>
  );
}
function TeacherRecordModal({ teacher, sessions, students, debtPayments, onClose }: { teacher: Teacher; sessions: LessonSession[]; students: Student[]; debtPayments: DebtPayment[]; onClose: () => void }) {
  const history = sessions
    .filter((lesson) => lesson.teacherId === teacher.id && lesson.status === "ended")
    .slice()
    .sort(newestSessionFirst);
  const [selectedLesson, setSelectedLesson] = useState<LessonSession | null>(null);
  return (
    <>
      <Modal title="سجل حصص المدرس" subtitle={`${teacher.name} — ${teacher.id}`} onClose={onClose} wide>
        <div className="modal-body">
          <div className="financial-grid compact">
            <div>
              <span>الحصص المنتهية</span>
              <strong>{history.length}</strong>
            </div>
            <div>
              <span>إجمالي الحضور</span>
              <strong>{history.reduce((sum, lesson) => sum + lesson.studentIds.length, 0)}</strong>
            </div>
            <div>
              <span>إجمالي المستحق</span>
              <strong>{money(history.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.teacherFee, 0))}</strong>
            </div>
          </div>
          <div className="archive-list teacher-history-list">
            {history.map((lesson) => (
              <button type="button" className="teacher-history-row" key={lesson.id} onClick={() => setSelectedLesson(lesson)} aria-label={`عرض تفاصيل حصة ${lesson.subject}`}>
                <StatusPill status="ended" />
                <div>
                  <strong>
                    {lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}
                  </strong>
                  <small>
                    {lesson.date} · {lesson.startedAt}–{lesson.endedAt} · {lesson.room}
                  </small>
                </div>
                <span>{lesson.studentIds.length} طلاب</span>
                <strong>{money(lesson.studentIds.length * lesson.teacherFee)}</strong>
                <ChevronLeft size={18} />
              </button>
            ))}
          </div>
          {!history.length && <EmptyState icon={<FileClock />} title="لا توجد حصص منتهية" text="ستظهر حصص المدرس هنا بعد إنهائها" />}
        </div>
      </Modal>
      {selectedLesson && <ArchivedSessionDetailsModal session={selectedLesson} debtPayments={debtPayments} students={students} teacherName={teacher.name} onClose={() => setSelectedLesson(null)} />}
    </>
  );
}

function AdminPage({ tab, setTab, pricing, setPricing, sessions, bookings, expenses, debtPayments, students, teachers, audit, setAudit, subjectCatalog, setSubjectCatalog, rooms, currentUsername, onCredentialsChanged, onRestoreTeacher, onAddRoom, onRenameRoom, showToast }: { tab: AdminTab; setTab: (tab: AdminTab) => void; pricing: PriceRule[]; setPricing: React.Dispatch<React.SetStateAction<PriceRule[]>>; sessions: LessonSession[]; bookings: Booking[]; expenses: CenterExpense[]; debtPayments: DebtPayment[]; students: Student[]; teachers: Teacher[]; audit: AuditEntry[]; setAudit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; rooms: string[]; currentUsername: string; onCredentialsChanged: (username: string) => void; onRestoreTeacher: (teacher: Teacher) => void; onAddRoom: (room: string) => void; onRenameRoom: (index: number, room: string) => void; showToast: (message: string) => void }) {
  const tabs: { id: AdminTab; label: string; icon: typeof WalletCards }[] = [
    { id: "pricing", label: "أسعار الحصص", icon: WalletCards },
    { id: "archive", label: "أرشيف الحصص", icon: Archive },
    { id: "teacherArchive", label: "أرشيف المدرسين", icon: GraduationCap },
    { id: "analytics", label: "الإحصائيات", icon: BarChart3 },
    { id: "audit", label: "سجل العمليات", icon: History },
    { id: "settings", label: "الإعدادات", icon: Settings },
  ];
  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
              <Icon size={18} />
              {item.label}
              <ChevronLeft size={16} />
            </button>
          );
        })}
      </aside>
      <section className="admin-content">
        {tab === "pricing" && <PricingPanel pricing={pricing} setPricing={setPricing} subjectCatalog={subjectCatalog} audit={setAudit} showToast={showToast} />}
        {tab === "archive" && <ArchivePanel sessions={sessions} debtPayments={debtPayments} students={students} teachers={teachers} />}
        {tab === "teacherArchive" && <TeacherArchivePanel teachers={teachers} sessions={sessions} onRestore={onRestoreTeacher} />}
        {tab === "analytics" && <AnalyticsPanel sessions={sessions} bookings={bookings} expenses={expenses} debtPayments={debtPayments} teachers={teachers} />}
        {tab === "audit" && <AuditPanel audit={audit} />}
        {tab === "settings" && <SettingsPanel subjectCatalog={subjectCatalog} setSubjectCatalog={setSubjectCatalog} rooms={rooms} currentUsername={currentUsername} onCredentialsChanged={onCredentialsChanged} onAddRoom={onAddRoom} onRenameRoom={onRenameRoom} audit={setAudit} showToast={showToast} />}
      </section>
    </div>
  );
}

function TeacherArchivePanel({ teachers, sessions, onRestore }: { teachers: Teacher[]; sessions: LessonSession[]; onRestore: (teacher: Teacher) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase("ar");
  const archived = teachers
    .filter((teacher) => !teacher.active)
    .filter((teacher) => !normalized || `${teacher.name} ${teacher.phone} ${teacher.id}`.toLocaleLowerCase("ar").includes(normalized))
    .slice()
    .sort(newestNumericIdFirst);
  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <div>
          <h2>أرشيف المدرسين</h2>
          <p>الأرشفة لا تحذف أي حصة أو حساب مالي، ويمكن استرجاع المدرس في أي وقت</p>
        </div>
        <div className="search-box">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، الهاتف أو ID" />
        </div>
      </div>
      {archived.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المدرس</th>
                <th>الهاتف</th>
                <th>التخصصات</th>
                <th>الحصص المنتهية</th>
                <th>إجمالي الحضور</th>
                <th>إجمالي المستحق المحفوظ</th>
                <th>استرجاع</th>
              </tr>
            </thead>
            <tbody>
              {archived.map((teacher) => {
                const teacherSessions = sessions.filter((lesson) => lesson.teacherId === teacher.id && lesson.status === "ended");
                const attendance = teacherSessions.reduce((sum, lesson) => sum + lesson.studentIds.length, 0);
                const due = teacherSessions.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.teacherFee, 0);
                return (
                  <tr key={teacher.id}>
                    <td>
                      <div className="person-cell">
                        <span>{teacher.name.replace("أ/ ", "").charAt(0)}</span>
                        <strong>{teacher.name}</strong>
                      </div>
                      <small>ID {teacher.id}</small>
                    </td>
                    <td>{teacher.phone}</td>
                    <td>
                      <div className="archive-assignment-tags">
                        {teacher.assignments.slice(0, 3).map((assignment) => (
                          <span key={`${assignment.stage}-${assignment.grade}-${assignment.subject}`}>{assignment.subject}</span>
                        ))}
                        {teacher.assignments.length > 3 && <b>+{teacher.assignments.length - 3}</b>}
                      </div>
                    </td>
                    <td>{teacherSessions.length} حصة</td>
                    <td>{attendance} حضور</td>
                    <td>
                      <span className="profit-tag">{money(due)}</span>
                    </td>
                    <td>
                      <button type="button" className="restore-teacher-btn" onClick={() => onRestore(teacher)}>
                        <UserPlus size={16} /> استرجاع
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={<Archive />} title="لا يوجد مدرسون في الأرشيف" text={query ? "جرّب البحث باسم أو رقم مختلف" : "أي مدرس تتم أرشفته سيظهر هنا مع بقاء حصصه وحساباته محفوظة"} />
      )}
    </section>
  );
}

function PricingPanel({ pricing, setPricing, subjectCatalog, audit, showToast }: { pricing: PriceRule[]; setPricing: React.Dispatch<React.SetStateAction<PriceRule[]>>; subjectCatalog: Record<Stage, string[]>; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<PriceRule | null>(null);
  const [priceStage, setPriceStage] = useState<Stage>("المرحلة الإعدادية");
  const [priceGrade, setPriceGrade] = useState(gradesByStage["المرحلة الإعدادية"][0]);
  const [priceSubject, setPriceSubject] = useState(initialSubjectsByStage["المرحلة الإعدادية"][0]);
  const openNewRule = () => {
    const stage: Stage = "المرحلة الإعدادية";
    setEditingRule(null);
    setPriceStage(stage);
    setPriceGrade(gradesByStage[stage][0]);
    setPriceSubject(subjectCatalog[stage][0]);
    setOpen(true);
  };
  const openEditRule = (rule: PriceRule) => {
    setEditingRule(rule);
    setPriceStage(rule.stage);
    setPriceGrade(rule.grade);
    setPriceSubject(rule.subject);
    setOpen(true);
  };
  const closeEditor = () => {
    setOpen(false);
    setEditingRule(null);
  };
  return (
    <section className="panel data-panel">
      <div className="data-toolbar">
        <div>
          <h2>أسعار الحصص</h2>
          <p>سعر الطالب وأجر المدرس لكل حضور حسب المرحلة والصف والمادة</p>
        </div>
        <button className="primary-btn" onClick={openNewRule}>
          <Plus size={18} /> إضافة سعر
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>المرحلة</th>
              <th>الصف</th>
              <th>المادة</th>
              <th>سعر الطالب</th>
              <th>أجر المدرس / طالب</th>
              <th>صافي السنتر / طالب</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {pricing
              .slice()
              .sort(newestNumericIdFirst)
              .map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.stage}</td>
                  <td>
                    <strong>{rule.grade}</strong>
                  </td>
                  <td>{rule.subject}</td>
                  <td>
                    <span className="money-main">{money(rule.studentPrice)}</span>
                  </td>
                  <td>{money(rule.teacherFee)}</td>
                  <td>
                    <span className="profit-tag">{money(rule.studentPrice - rule.teacherFee)}</span>
                  </td>
                  <td>
                    <div className="price-table-actions">
                      <button className="table-icon" onClick={() => openEditRule(rule)} aria-label={`تعديل سعر ${rule.subject}`} title="تعديل السعر">
                        <Edit3 size={17} />
                      </button>
                      <button className="table-icon delete" onClick={() => setDeletingRule(rule)} aria-label={`حذف سعر ${rule.subject}`} title="حذف السعر">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title={editingRule ? "تعديل سعر الحصة" : "إضافة قاعدة سعر"} subtitle={editingRule ? "التعديل يطبّق على الحصص الجديدة فقط" : "السعر الجديد يطبّق على الحصص القادمة فقط"} onClose={closeEditor}>
          <form
            className="modal-body entity-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const studentPrice = Number(data.get("price"));
              const teacherFee = Number(data.get("fee"));
              if (teacherFee > studentPrice) {
                showToast("أجر المدرس لا يمكن أن يتجاوز سعر الطالب");
                return;
              }
              const duplicate = pricing.some((rule) => rule.id !== editingRule?.id && rule.stage === priceStage && rule.grade === priceGrade && rule.subject === priceSubject);
              if (duplicate) {
                showToast("يوجد سعر مسجل بالفعل لنفس المرحلة والصف والمادة");
                return;
              }
              const updatedRule = {
                id: editingRule?.id ?? String(Math.max(...pricing.map((rule) => Number(rule.id)), 0) + 1),
                stage: priceStage,
                grade: priceGrade,
                subject: priceSubject,
                studentPrice,
                teacherFee,
              };
              setPricing((current) => (editingRule ? current.map((rule) => (rule.id === editingRule.id ? updatedRule : rule)) : [...current, updatedRule]));
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: editingRule ? "تعديل سعر حصة" : "إضافة سعر حصة",
                  details: `${priceSubject} — ${priceGrade} — سعر الطالب ${money(studentPrice)} وأجر المدرس ${money(teacherFee)}`,
                  time: "الآن",
                  tone: "blue",
                },
                ...current,
              ]);
              closeEditor();
              showToast(editingRule ? "تم تحديث سعر الحصة" : "تمت إضافة السعر الجديد");
            }}
          >
            <label className="field">
              المرحلة
              <select
                value={priceStage}
                onChange={(event) => {
                  const stage = event.target.value as Stage;
                  setPriceStage(stage);
                  setPriceGrade(gradesByStage[stage][0]);
                  setPriceSubject(subjectCatalog[stage][0]);
                }}
              >
                {stages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            </label>
            <label className="field">
              الصف
              <select name="grade" value={priceGrade} onChange={(event) => setPriceGrade(event.target.value)}>
                {gradesByStage[priceStage].map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
              </select>
            </label>
            <label className="field">
              المادة
              <select name="subject" value={priceSubject} onChange={(event) => setPriceSubject(event.target.value)}>
                {subjectCatalog[priceStage].map((subject) => (
                  <option key={subject}>{subject}</option>
                ))}
              </select>
            </label>
            <label className="field">
              سعر الطالب
              <input name="price" type="number" min="0" defaultValue={editingRule?.studentPrice} required />
            </label>
            <label className="field">
              أجر المدرس لكل طالب
              <input name="fee" type="number" min="0" defaultValue={editingRule?.teacherFee} required />
            </label>
            <button className="primary-btn full" type="submit">
              {editingRule ? "حفظ التعديلات" : "حفظ السعر"}
            </button>
          </form>
        </Modal>
      )}
      {deletingRule && (
        <Modal title="حذف سعر الحصة" subtitle="راجع السعر المحدد قبل الحذف" onClose={() => setDeletingRule(null)}>
          <div className="modal-body">
            <div className="delete-review">
              <Trash2 size={22} />
              <div>
                <strong>
                  {deletingRule.subject} — {deletingRule.grade}
                </strong>
                <span>
                  {deletingRule.stage} · سعر الطالب {money(deletingRule.studentPrice)}
                </span>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="secondary-btn" onClick={() => setDeletingRule(null)}>
              إلغاء
            </button>
            <button
              className="danger-confirm"
              onClick={() => {
                setPricing((current) => current.filter((rule) => rule.id !== deletingRule.id));
                audit((current) => [
                  {
                    id: String(Date.now()),
                    action: "حذف سعر حصة",
                    details: `${deletingRule.subject} — ${deletingRule.grade} — ${deletingRule.stage}`,
                    time: "الآن",
                    tone: "orange",
                  },
                  ...current,
                ]);
                setDeletingRule(null);
                showToast("تم حذف سعر الحصة");
              }}
            >
              تأكيد الحذف
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function ArchivePanel({ sessions, debtPayments, students, teachers }: { sessions: LessonSession[]; debtPayments: DebtPayment[]; students: Student[]; teachers: Teacher[] }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<LessonSession | null>(null);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "مدرس مؤرشف";
  const normalizedQuery = query.trim().toLowerCase();
  const history = sessions
    .filter((lesson) => lesson.status === "ended")
    .filter((lesson) => {
      if (dateFilter && lesson.date !== dateFilter) return false;
      if (!normalizedQuery) return true;
      if (["اليوم", "النهاردة"].includes(normalizedQuery)) return lesson.date === todayIso();
      const dayName = new Intl.DateTimeFormat("ar-EG", {
        weekday: "long",
      }).format(new Date(`${lesson.date}T12:00:00`));
      return [lesson.id, lesson.subject, lesson.stage, lesson.grade, lesson.room, lesson.date, dayName, teacherName(lesson.teacherId)].some((value) => value.toLowerCase().includes(normalizedQuery));
    })
    .slice()
    .sort(newestSessionFirst);
  return (
    <>
      <section className="panel data-panel">
        <div className="data-toolbar archive-toolbar">
          <div>
            <h2>أرشيف الحصص</h2>
            <p>{history.length} حصة مطابقة · اضغط على أي حصة لعرض معلوماتها</p>
          </div>
          <div className="archive-filters">
            <div className="search-box">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اليوم، اسم المدرس أو المادة" />
            </div>
            <label className="archive-date">
              <CalendarDays size={17} />
              <input type="date" value={dateFilter} onInput={(event) => setDateFilter(event.currentTarget.value)} aria-label="فلترة بتاريخ الحصة" />
            </label>
            {(query || dateFilter) && (
              <button
                className="clear-filters"
                onClick={() => {
                  setQuery("");
                  setDateFilter("");
                }}
              >
                <X size={16} /> مسح
              </button>
            )}
          </div>
        </div>
        {history.length ? (
          <div className="archive-list detailed">
            {history.map((lesson) => {
              const financials = getSessionFinancials(lesson);
              return (
                <button type="button" className="archive-row" key={lesson.id} onClick={() => setSelectedLesson(lesson)} aria-label={`فتح تفاصيل حصة ${lesson.subject}`}>
                  <StatusPill status="ended" />
                  <div>
                    <strong>
                      {lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}
                    </strong>
                    <small>
                      {teacherName(lesson.teacherId)} · {lesson.date} · {lesson.startedAt}–{lesson.endedAt}
                    </small>
                  </div>
                  <span>{lesson.room}</span>
                  <span>{lesson.studentIds.length} طلاب</span>
                  <strong>{money(financials.collected)}</strong>
                  <b>{money(financials.centerNet)} صافي</b>
                  <ChevronLeft size={18} />
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Archive />} title="لا توجد حصص مطابقة" text="جرّب البحث باسم مدرس أو مادة، أو غيّر التاريخ" />
        )}
      </section>
      {selectedLesson && <ArchivedSessionDetailsModal session={selectedLesson} debtPayments={debtPayments} students={students} teacherName={teacherName(selectedLesson.teacherId)} onClose={() => setSelectedLesson(null)} />}
    </>
  );
}
function ArchivedSessionDetailsModal({ session, debtPayments, students, teacherName, onClose }: { session: LessonSession; debtPayments: DebtPayment[]; students: Student[]; teacherName: string; onClose: () => void }) {
  const financials = getSessionFinancials(session);
  const outstanding = session.studentIds.reduce((sum, studentId) => sum + outstandingForAttendance(session, studentId, debtPayments), 0);
  return (
    <Modal title="تفاصيل الحصة المؤرشفة" subtitle={`${session.id} · ${session.date} · ${session.room}`} onClose={onClose} wide>
      <div className="modal-body archive-details">
        <div className="archive-detail-head">
          <div>
            <StatusPill status="ended" />
            <h3>
              {session.subject} — {gradeLabel(session.stage, session.grade)}
            </h3>
            <p>
              {teacherName} · من {session.startedAt} إلى {session.endedAt}
            </p>
          </div>
          <span>
            <ShieldCheck size={18} /> سجل مالي محفوظ
          </span>
        </div>
        <div className="financial-grid session-financial-grid">
          <div>
            <span>عدد الطلاب</span>
            <strong>{session.studentIds.length}</strong>
          </div>
          <div>
            <span>قيمة الحصة كاملة</span>
            <strong>{money(financials.fullTotal)}</strong>
          </div>
          <div className={financials.shortages ? "shortage-card" : ""}>
            <span>النواقص وقت الحصة</span>
            <strong>{money(financials.shortages)}</strong>
          </div>
          <div>
            <span>المحصل وقت الحصة</span>
            <strong>{money(financials.collected)}</strong>
          </div>
          <div>
            <span>مستحق المدرس</span>
            <strong>{money(financials.teacherDue)}</strong>
          </div>
          <div className="highlight">
            <span>صافي السنتر وقتها</span>
            <strong>{money(financials.centerNet)}</strong>
          </div>
        </div>
        {financials.shortages > 0 && (
          <div className="archive-debt-note">
            <WalletCards size={19} />
            <span>
              <strong>المتبقي حالياً من نواقص هذه الحصة: {money(outstanding)}</strong>
              <small>أي سداد لاحق محفوظ كتحصيل مستقل ولا يغيّر مستحق المدرس أو سعر حصة أخرى.</small>
            </span>
          </div>
        )}
        <div className="archive-unit-prices">
          <div>
            <span>سعر الطالب</span>
            <strong>{money(session.studentPrice)}</strong>
          </div>
          <div>
            <span>أجر المدرس لكل طالب</span>
            <strong>{money(session.teacherFee)}</strong>
          </div>
          <div>
            <span>القاعة</span>
            <strong>{session.room}</strong>
          </div>
        </div>
        <div className="attendance-list">
          <div className="attendance-head">
            <h3>طلاب الحصة</h3>
            <span>{session.studentIds.length} طالب</span>
          </div>
          {session.studentIds.map((studentId, index) => {
            const student = students.find((item) => item.id === studentId);
            const paid = paidDuringSession(session, studentId);
            const remaining = outstandingForAttendance(session, studentId, debtPayments);
            return (
              <div className="attendance-row" key={studentId}>
                <span className="row-number">{index + 1}</span>
                <span className="student-avatar">{student?.name.charAt(0) ?? "—"}</span>
                <div>
                  <strong>{student?.name ?? "طالب مؤرشف"}</strong>
                  <small>
                    {studentId} · {student?.phone ?? "لا يوجد رقم"}
                  </small>
                </div>
                <span className={remaining ? "debt-badge" : "paid-tag"}>
                  {remaining ? (
                    `متبقي ${money(remaining)}`
                  ) : (
                    <>
                      <Check size={14} /> مسدد
                    </>
                  )}
                </span>
                <strong>{money(paid)}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
function AnalyticsPanel({ sessions, bookings, expenses, debtPayments, teachers }: { sessions: LessonSession[]; bookings: Booking[]; expenses: CenterExpense[]; debtPayments: DebtPayment[]; teachers: Teacher[] }) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all" | "custom">("today");
  const [customDateFrom, setCustomDateFrom] = useState(todayIso());
  const [customDateTo, setCustomDateTo] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const excelExportRef = useRef<AnalyticsExcelExport | null>(null);
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>(".analytics-control-panel");
    if (!panel || panel.querySelector("[data-analytics-export]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "analytics-export-btn";
    button.dataset.analyticsExport = "true";
    button.textContent = "تحميل Excel";
    button.setAttribute("aria-label", "تحميل الإحصائيات الحالية في ملف Excel");
    button.addEventListener("click", async () => {
      const exportData = excelExportRef.current;
      if (!exportData || button.disabled) return;
      button.disabled = true;
      button.textContent = "جاري تجهيز Excel…";
      try {
        await downloadAnalyticsExcel(exportData);
        button.textContent = "تم التحميل ✓";
      } catch {
        button.textContent = "تعذر التحميل — حاول مرة أخرى";
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = "تحميل Excel";
        }, 1800);
      }
    });
    panel.appendChild(button);
    return () => button.remove();
  }, []);
  const ended = sessions.filter((lesson) => lesson.status === "ended");
  const now = new Date();
  const matchesPeriod = (date: string) => {
    if (period === "all") return true;
    if (period === "custom") {
      if (!customDateFrom) return true;
      const rangeEnd = customDateTo || customDateFrom;
      return date >= customDateFrom && date <= rangeEnd;
    }
    if (period === "today") return date === todayIso();
    const recordDate = new Date(`${date}T12:00:00`);
    if (period === "month") return recordDate.getFullYear() === now.getFullYear() && recordDate.getMonth() === now.getMonth();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const differenceInDays = Math.floor((today.getTime() - recordDate.getTime()) / 86400000);
    return differenceInDays >= 0 && differenceInDays < 7;
  };
  const dimensionFiltered = ended
    .filter((lesson) => teacherFilter === "all" || lesson.teacherId === teacherFilter)
    .filter((lesson) => subjectFilter === "all" || lesson.subject === subjectFilter)
    .filter((lesson) => stageFilter === "all" || lesson.stage === stageFilter)
    .filter((lesson) => gradeFilter === "all" || lesson.grade === gradeFilter);
  const dimensionFilteredBookings = bookings
    .filter((booking) => teacherFilter === "all" || booking.teacherId === teacherFilter)
    .filter((booking) => subjectFilter === "all" || booking.subject === subjectFilter)
    .filter((booking) => stageFilter === "all" || booking.stage === stageFilter)
    .filter((booking) => gradeFilter === "all" || booking.grade === gradeFilter);
  const reportEndDate = period === "custom" ? customDateTo || customDateFrom : todayIso();
  const debtPaymentsThroughReportEnd = debtPayments.filter((payment) => payment.date <= reportEndDate);
  const filtered = dimensionFiltered
    .filter((lesson) => matchesPeriod(lesson.date))
    .map((lesson) => ({ ...lesson, outstandingShortage: outstandingForSession(lesson, debtPaymentsThroughReportEnd) }));
  const filteredBookings = dimensionFilteredBookings.filter((booking) => matchesPeriod(booking.createdAt));
  const filteredExpenses = expenses.filter((expense) => matchesPeriod(expense.date));
  const dimensionSessionIds = new Set(dimensionFiltered.map((lesson) => lesson.id));
  const filteredDebtPayments = debtPayments.filter((payment) => dimensionSessionIds.has(payment.sessionId) && matchesPeriod(payment.date));
  const filteredSessionIds = new Set(filtered.map((lesson) => lesson.id));
  const subjectOptions = Array.from(new Set([...ended.map((lesson) => lesson.subject), ...bookings.map((booking) => booking.subject)]));
  const gradeOptions = Array.from(new Set([...ended.filter((lesson) => stageFilter === "all" || lesson.stage === stageFilter).map((lesson) => lesson.grade), ...bookings.filter((booking) => stageFilter === "all" || booking.stage === stageFilter).map((booking) => booking.grade)]));
  const fullSessionValue = filtered.reduce((sum, lesson) => sum + getSessionFinancials(lesson).fullTotal, 0);
  const sessionShortages = filtered.reduce((sum, lesson) => sum + getSessionFinancials(lesson).shortages, 0);
  const sessionGross = filtered.reduce((sum, lesson) => sum + getSessionFinancials(lesson).collected, 0);
  const bookingRevenue = filteredBookings.reduce((sum, booking) => sum + booking.bookingFee, 0);
  const debtRecovery = filteredDebtPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const debtRecoveryAlreadyReflected = filteredDebtPayments.filter((payment) => filteredSessionIds.has(payment.sessionId)).reduce((sum, payment) => sum + payment.amount, 0);
  const teacherDue = filtered.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.teacherFee, 0);
  const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const { sessionNet, net, averageRevenue, additiveDebtRecovery } = calculateAnalyticsProfit({ fullSessionValue, teacherDue, sessionShortages, debtRecovery, debtRecoveryAlreadyReflected, bookingRevenue, expenseTotal, sessionCount: filtered.length });
  const attendance = filtered.reduce((sum, lesson) => sum + lesson.studentIds.length, 0);
  const averageAttendance = filtered.length ? attendance / filtered.length : 0;
  const recoveredForSessions = (lessonIds: Set<string>) => filteredDebtPayments.filter((payment) => lessonIds.has(payment.sessionId)).reduce((sum, payment) => sum + payment.amount, 0);
  const recoveredSubjects = filteredDebtPayments.map((payment) => sessions.find((lesson) => lesson.id === payment.sessionId)?.subject).filter((subject): subject is string => Boolean(subject));
  const bySubject = Array.from(new Set([...filtered.map((lesson) => lesson.subject), ...filteredBookings.map((booking) => booking.subject), ...recoveredSubjects]))
    .map((subject) => {
      const lessons = filtered.filter((lesson) => lesson.subject === subject);
      const dimensionLessonIds = new Set(dimensionFiltered.filter((lesson) => lesson.subject === subject).map((lesson) => lesson.id));
      return {
        label: subject,
        value: lessons.reduce((sum, lesson) => sum + getSessionFinancials(lesson).collected, 0) + recoveredForSessions(dimensionLessonIds) + filteredBookings.filter((booking) => booking.subject === subject).reduce((sum, booking) => sum + booking.bookingFee, 0),
      };
    })
    .sort((a, b) => b.value - a.value);
  const byStage = stages
    .map((stage) => {
      const lessons = filtered.filter((lesson) => lesson.stage === stage);
      const dimensionLessonIds = new Set(dimensionFiltered.filter((lesson) => lesson.stage === stage).map((lesson) => lesson.id));
      return {
        label: stage.replace("المرحلة ", ""),
        value: lessons.reduce((sum, lesson) => sum + getSessionFinancials(lesson).collected, 0) + recoveredForSessions(dimensionLessonIds) + filteredBookings.filter((booking) => booking.stage === stage).reduce((sum, booking) => sum + booking.bookingFee, 0),
      };
    })
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const teacherRank = teachers
    .map((teacher) => {
      const lessons = filtered.filter((lesson) => lesson.teacherId === teacher.id);
      const dimensionLessonIds = new Set(dimensionFiltered.filter((lesson) => lesson.teacherId === teacher.id).map((lesson) => lesson.id));
      return {
        teacher,
        sessions: lessons.length,
        bookings: filteredBookings.filter((booking) => booking.teacherId === teacher.id).length,
        attendance: lessons.reduce((sum, lesson) => sum + lesson.studentIds.length, 0),
        revenue: lessons.reduce((sum, lesson) => sum + getSessionFinancials(lesson).collected, 0) + recoveredForSessions(dimensionLessonIds) + filteredBookings.filter((booking) => booking.teacherId === teacher.id).reduce((sum, booking) => sum + booking.bookingFee, 0),
      };
    })
    .filter((item) => item.sessions > 0 || item.bookings > 0 || item.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  const monthlyMap = new Map<
    string,
    {
      key: string;
      label: string;
      sessions: number;
      bookings: number;
      attendance: number;
      gross: number;
      teacherDue: number;
      expenses: number;
      sessionNet: number;
      bookingNet: number;
      net: number;
    }
  >();
  dimensionFiltered.forEach((lesson) => {
    const key = lesson.date.slice(0, 7);
    const current = monthlyMap.get(key) ?? {
      key,
      label: new Intl.DateTimeFormat("ar-EG", {
        month: "long",
        year: "numeric",
      }).format(new Date(`${key}-01T12:00:00`)),
      sessions: 0,
      bookings: 0,
      attendance: 0,
      gross: 0,
      teacherDue: 0,
      expenses: 0,
      sessionNet: 0,
      bookingNet: 0,
      net: 0,
    };
    const lessonFinancials = getSessionFinancials(lesson);
    const lessonGross = lessonFinancials.collected;
    const lessonTeacherDue = lessonFinancials.teacherDue;
    const [lessonYear, lessonMonth] = key.split("-").map(Number);
    const calendarMonthEnd = `${key}-${String(new Date(lessonYear, lessonMonth, 0).getDate()).padStart(2, "0")}`;
    const monthEnd = key === todayIso().slice(0, 7) ? todayIso() : calendarMonthEnd;
    const lessonOutstandingAtMonthEnd = outstandingForSession(
      lesson,
      debtPayments.filter((payment) => payment.date <= monthEnd),
    );
    const lessonNetAtMonthEnd = lessonFinancials.fullTotal - lessonTeacherDue - lessonOutstandingAtMonthEnd;
    current.sessions += 1;
    current.attendance += lesson.studentIds.length;
    current.gross += lessonGross;
    current.teacherDue += lessonTeacherDue;
    current.sessionNet += lessonNetAtMonthEnd;
    current.net += lessonNetAtMonthEnd;
    monthlyMap.set(key, current);
  });
  dimensionFilteredBookings.forEach((booking) => {
    const key = booking.createdAt.slice(0, 7);
    const current = monthlyMap.get(key) ?? {
      key,
      label: new Intl.DateTimeFormat("ar-EG", {
        month: "long",
        year: "numeric",
      }).format(new Date(`${key}-01T12:00:00`)),
      sessions: 0,
      bookings: 0,
      attendance: 0,
      gross: 0,
      teacherDue: 0,
      expenses: 0,
      sessionNet: 0,
      bookingNet: 0,
      net: 0,
    };
    current.bookings += 1;
    current.gross += booking.bookingFee;
    current.bookingNet += booking.bookingFee;
    current.net += booking.bookingFee;
    monthlyMap.set(key, current);
  });
  debtPayments
    .filter((payment) => dimensionSessionIds.has(payment.sessionId))
    .forEach((payment) => {
      const key = payment.date.slice(0, 7);
      const current = monthlyMap.get(key) ?? {
        key,
        label: new Intl.DateTimeFormat("ar-EG", {
          month: "long",
          year: "numeric",
        }).format(new Date(`${key}-01T12:00:00`)),
        sessions: 0,
        bookings: 0,
        attendance: 0,
        gross: 0,
        teacherDue: 0,
        expenses: 0,
        sessionNet: 0,
        bookingNet: 0,
        net: 0,
      };
      current.gross += payment.amount;
      const paymentSession = sessions.find((lesson) => lesson.id === payment.sessionId);
      if (!paymentSession || paymentSession.date.slice(0, 7) !== key) current.net += payment.amount;
      monthlyMap.set(key, current);
    });
  expenses.forEach((expense) => {
    const key = expense.date.slice(0, 7);
    const current = monthlyMap.get(key) ?? {
      key,
      label: new Intl.DateTimeFormat("ar-EG", {
        month: "long",
        year: "numeric",
      }).format(new Date(`${key}-01T12:00:00`)),
      sessions: 0,
      bookings: 0,
      attendance: 0,
      gross: 0,
      teacherDue: 0,
      expenses: 0,
      sessionNet: 0,
      bookingNet: 0,
      net: 0,
    };
    current.expenses += expense.amount;
    current.net -= expense.amount;
    monthlyMap.set(key, current);
  });
  const monthlyAnalysis = Array.from(monthlyMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  const maxSubject = Math.max(...bySubject.map((item) => item.value), 1);
  const maxStage = Math.max(...byStage.map((item) => item.value), 1);
  const resetFilters = () => {
    setTeacherFilter("all");
    setSubjectFilter("all");
    setStageFilter("all");
    setGradeFilter("all");
  };
  const periodLabel =
    period === "custom"
      ? customDateTo && customDateTo !== customDateFrom
        ? `من ${customDateFrom} إلى ${customDateTo}`
        : `يوم ${customDateFrom}`
      : {
          today: "اليوم",
          week: "آخر 7 أيام",
          month: "هذا الشهر",
          all: "كل الفترات",
        }[period];
  const excelExportData: AnalyticsExcelExport = {
    periodLabel,
    filters: {
      teacher: teacherFilter === "all" ? "كل المدرسين" : (teachers.find((teacher) => teacher.id === teacherFilter)?.name ?? "مدرس مؤرشف"),
      subject: subjectFilter === "all" ? "كل المواد" : subjectFilter,
      stage: stageFilter === "all" ? "كل المراحل" : stageFilter,
      grade: gradeFilter === "all" ? "كل الصفوف" : gradeFilter,
    },
    summary: [
      ["الحصص المنتهية", filtered.length, "حصة"],
      ["إجمالي الحضور", attendance, "حضور"],
      ["متوسط حضور الطلاب", averageAttendance, "طالب / حصة"],
      ["إجمالي قيمة الحصص", fullSessionValue, "ج.م"],
      ["مستحقات المدرسين", teacherDue, "ج.م"],
      ["المبالغ المتبقية على الطلاب", sessionShortages, "ج.م"],
      ["صافي ربح الحصص بعد السداد", sessionNet, "ج.م"],
      ["إيراد الحجوزات المسبقة", bookingRevenue, "ج.م"],
      ["مصروفات السنتر", expenseTotal, "ج.م"],
      ["تحصيل مديونيات خلال الفترة", debtRecovery, "ج.م"],
      ["تحصيل مديونيات مضاف للصافي", additiveDebtRecovery, "ج.م"],
      ["صافي الربح", net, "ج.م"],
      ["متوسط صافي ربح الحصة", averageRevenue, "ج.م"],
    ],
    sessions: filtered
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((lesson) => {
        const financials = getSessionFinancials(lesson);
        return [lesson.date, teachers.find((teacher) => teacher.id === lesson.teacherId)?.name ?? "مدرس مؤرشف", lesson.stage, lesson.grade, lesson.subject, lesson.room, lesson.studentIds.length, financials.fullTotal, financials.shortages, financials.collected, financials.teacherDue, financials.centerNet, financials.collected ? financials.centerNet / financials.collected : 0];
      }),
    teachers: teacherRank.map((item, index) => [index + 1, item.teacher.name, item.sessions, item.bookings, item.attendance, item.revenue]),
    subjects: bySubject.map((item) => [item.label, item.value]),
    stages: byStage.map((item) => [item.label, item.value]),
    monthly: monthlyAnalysis.map((month) => [month.label, month.sessions, month.bookings, month.attendance, month.gross, month.teacherDue, month.expenses, month.sessionNet, month.bookingNet, month.net, month.gross ? month.net / month.gross : 0]),
    bookings: filteredBookings.map((booking) => [booking.createdAt, booking.studentId, teachers.find((teacher) => teacher.id === booking.teacherId)?.name ?? "مدرس مؤرشف", `${booking.stage} — ${booking.grade}`, booking.subject, booking.bookingFee]),
    expenses: filteredExpenses.map((expense) => [expense.date, expense.category, expense.description, expense.amount]),
    debtPayments: filteredDebtPayments.map((payment) => [payment.date, payment.studentId, payment.sessionId, payment.amount]),
  };
  useEffect(() => {
    excelExportRef.current = excelExportData;
  });
  return (
    <div className="analytics-stack">
      <section className="panel analytics-control-panel">
        <div>
          <span className="section-kicker">نطاق التحليل</span>
          <h2>إحصائيات {periodLabel}</h2>
        </div>
        <div className="analytics-period-wrap">
          <div className="analytics-period">
            {(
              [
                { id: "today", label: "اليوم" },
                { id: "week", label: "7 أيام" },
                { id: "month", label: "الشهر" },
                { id: "all", label: "الكل" },
                { id: "custom", label: "تاريخ مخصص" },
              ] as const
            ).map((item) => (
              <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => setPeriod(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="analytics-custom-range">
              <label>
                <span>من / يوم معين</span>
                <input
                  type="date"
                  value={customDateFrom}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setCustomDateFrom(value);
                    if (customDateTo && value > customDateTo) setCustomDateTo("");
                  }}
                />
              </label>
              <label>
                <span>إلى (اختياري)</span>
                <input type="date" min={customDateFrom} value={customDateTo} onInput={(event) => setCustomDateTo(event.currentTarget.value)} />
              </label>
            </div>
          )}
        </div>
      </section>
      <section className="panel analytics-filter-panel">
        <div className="analytics-filter-head">
          <div>
            <h3>فلترة التحليل والجدول</h3>
            <p>كل المؤشرات والرسوم والجدول تتحدث مع الفلاتر</p>
          </div>
          {(teacherFilter !== "all" || subjectFilter !== "all" || stageFilter !== "all" || gradeFilter !== "all") && (
            <button className="clear-filters" onClick={resetFilters}>
              <X size={16} /> مسح الفلاتر
            </button>
          )}
        </div>
        <div className="analytics-filter-grid">
          <label className="field">
            المدرس
            <select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
              <option value="all">كل المدرسين</option>
              {teachers.map((teacher) => (
                <option value={teacher.id} key={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            المادة
            <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
              <option value="all">كل المواد</option>
              {subjectOptions.map((subject) => (
                <option key={subject}>{subject}</option>
              ))}
            </select>
          </label>
          <label className="field">
            المرحلة
            <select
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value as "all" | Stage);
                setGradeFilter("all");
              }}
            >
              <option value="all">كل المراحل</option>
              {stages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <label className="field">
            الصف
            <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}>
              <option value="all">كل الصفوف</option>
              {gradeOptions.map((grade) => (
                <option key={grade}>{grade}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <div className="analytics-kpi-grid">
        <article>
          <span>
            <CalendarDays size={20} />
          </span>
          <div>
            <small>عدد الحصص</small>
            <strong>{filtered.length}</strong>
            <em>{periodLabel}</em>
          </div>
        </article>
        <article>
          <span>
            <Users size={20} />
          </span>
          <div>
            <small>عدد الطلاب</small>
            <strong>{attendance}</strong>
            <em>كل حضور للطالب محسوب</em>
          </div>
        </article>
        <article>
          <span>
            <BarChart3 size={20} />
          </span>
          <div>
            <small>متوسط حضور الطلاب</small>
            <strong>{averageAttendance.toFixed(1)}</strong>
            <em>عدد الطلاب ÷ عدد الحصص</em>
          </div>
        </article>
        <article>
          <span>
            <CircleDollarSign size={20} />
          </span>
          <div>
            <small>إجمالي قيمة الحصص</small>
            <strong>{money(fullSessionValue)}</strong>
            <em>المبلغ المستحق قبل مستحق المدرسين والمديونيات</em>
          </div>
        </article>
        <article>
          <span>
            <WalletCards size={20} />
          </span>
          <div>
            <small>مستحقات المدرسين</small>
            <strong>{money(teacherDue)}</strong>
            <em>عن جميع الطلاب الحاضرين</em>
          </div>
        </article>
        <article className="shortage-kpi">
          <span>
            <WalletCards size={20} />
          </span>
          <div>
            <small>المبالغ المتبقية على الطلاب</small>
            <strong>{money(sessionShortages)}</strong>
            <em>الرصيد غير المدفوع حتى نهاية الفترة</em>
          </div>
        </article>
        <article className="net-card">
          <span>
            <TrendingUp size={20} />
          </span>
          <div>
            <small>صافي ربح الحصص بعد السداد</small>
            <strong>{money(sessionNet)}</strong>
            <em>قيمة الحصص − مستحق المدرسين − المتبقي</em>
          </div>
        </article>
        <article>
          <span>
            <BookOpen size={20} />
          </span>
          <div>
            <small>الحجوزات المسبقة</small>
            <strong>{money(bookingRevenue)}</strong>
            <em>{filteredBookings.length} حجز ضمن الفترة</em>
          </div>
        </article>
        <article className="expense-kpi">
          <span>
            <ReceiptText size={20} />
          </span>
          <div>
            <small>مصروفات السنتر</small>
            <strong>{money(expenseTotal)}</strong>
            <em>{filteredExpenses.length} مصروف ضمن الفترة</em>
          </div>
        </article>
        <article>
          <span>
            <CircleDollarSign size={20} />
          </span>
          <div>
            <small>تحصيل مديونيات خلال الفترة</small>
            <strong>{money(debtRecovery)}</strong>
            <em>{money(debtRecoveryAlreadyReflected)} ضمن صافي الحصص · {money(additiveDebtRecovery)} مضافة للصافي</em>
          </div>
        </article>
        <article className="net-card">
          <span>
            <TrendingUp size={20} />
          </span>
          <div>
            <small>صافي الربح</small>
            <strong>{money(net)}</strong>
            <em>صافي الحصص + {money(additiveDebtRecovery)} تحصيل غير محتسب + الحجوزات − المصروفات</em>
          </div>
        </article>
        <article className="net-card">
          <span>
            <BarChart3 size={20} />
          </span>
          <div>
            <small>متوسط صافي ربح الحصة</small>
            <strong>{money(averageRevenue)}</strong>
            <em>صافي ربح الحصص بعد السداد ÷ عدد الحصص</em>
          </div>
        </article>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">مقارنة المواد</span>
              <h2>الدخل حسب المادة</h2>
            </div>
          </div>
          {bySubject.length ? (
            <div className="horizontal-chart">
              {bySubject.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <div>
                    <i style={{ width: `${(item.value / maxSubject) * 100}%` }} />
                  </div>
                  <strong>{money(item.value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<BarChart3 />} title="لا توجد بيانات" text="غيّر الفلاتر لعرض المقارنة" />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <span className="section-kicker">مقارنة المراحل</span>
              <h2>الدخل حسب المرحلة</h2>
            </div>
          </div>
          {byStage.length ? (
            <div className="horizontal-chart stage-chart">
              {byStage.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <div>
                    <i style={{ width: `${(item.value / maxStage) * 100}%` }} />
                  </div>
                  <strong>{money(item.value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<GraduationCap />} title="لا توجد بيانات" text="لا توجد حصص منتهية ضمن الاختيار" />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="section-kicker">أداء المدرسين</span>
            <h2>ترتيب المدرسين حسب قيمة الحصص</h2>
          </div>
        </div>
        {teacherRank.length ? (
          <div className="ranking-list wide-ranking">
            {teacherRank.map((item, index) => (
              <div key={item.teacher.id}>
                <b>{index + 1}</b>
                <span>{item.teacher.name.replace("أ/ ", "").charAt(0)}</span>
                <div>
                  <strong>{item.teacher.name}</strong>
                  <small>
                    {item.sessions} حصة · {item.bookings} حجز · {item.attendance} حضور
                  </small>
                </div>
                <em>{money(item.revenue)}</em>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<GraduationCap />} title="لا توجد نتائج للمدرسين" text="غيّر الفترة أو الفلاتر" />
        )}
      </section>
      <section className="panel data-panel monthly-analysis-panel">
        <div className="data-toolbar">
          <div>
            <span className="section-kicker">تحليل شهري</span>
            <h2>مقارنة أداء الشهور</h2>
            <p>يتأثر بفلاتر المدرس والمادة والمرحلة والصف، ويعرض كل الشهور المسجلة</p>
          </div>
        </div>
        {monthlyAnalysis.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الحصص</th>
                  <th>الحجوزات</th>
                  <th>الحضور</th>
                  <th>إجمالي الدخل</th>
                  <th>مستحق المدرسين</th>
                  <th>المصروفات</th>
                  <th>صافي الحصص</th>
                  <th>صافي الحجوزات</th>
                  <th>صافي السنتر</th>
                  <th>هامش السنتر</th>
                </tr>
              </thead>
              <tbody>
                {monthlyAnalysis.map((month) => (
                  <tr key={month.key}>
                    <td>
                      <strong>{month.label}</strong>
                    </td>
                    <td>{month.sessions}</td>
                    <td>{month.bookings}</td>
                    <td>{month.attendance}</td>
                    <td>{money(month.gross)}</td>
                    <td>{money(month.teacherDue)}</td>
                    <td>
                      <span className="expense-amount">{money(month.expenses)}</span>
                    </td>
                    <td>{money(month.sessionNet)}</td>
                    <td>{money(month.bookingNet)}</td>
                    <td>
                      <span className="profit-tag">{money(month.net)}</span>
                    </td>
                    <td>{month.gross ? ((month.net / month.gross) * 100).toFixed(1) : "0.0"}٪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<CalendarDays />} title="لا توجد بيانات شهرية" text="ستظهر مقارنة الشهور بعد إنهاء الحصص" />
        )}
      </section>
      <section className="panel data-panel analysis-table-panel">
        <div className="data-toolbar">
          <div>
            <h2>جدول تحليل الحصص</h2>
            <p>{filtered.length} حصة · يمكنك تغيير النتائج من الفلاتر بالأعلى</p>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المدرس</th>
                  <th>المرحلة والصف</th>
                  <th>المادة</th>
                  <th>الحضور</th>
                  <th>القيمة الكاملة</th>
                  <th>النواقص</th>
                  <th>المحصل</th>
                  <th>مستحق المدرس</th>
                  <th>صافي السنتر</th>
                  <th>الهامش</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((lesson) => {
                    const lessonFinancials = getSessionFinancials(lesson);
                    const lessonGross = lessonFinancials.collected;
                    const lessonTeacherDue = lessonFinancials.teacherDue;
                    const lessonNet = lessonFinancials.centerNet;
                    return (
                      <tr key={lesson.id}>
                        <td>
                          <strong>{lesson.date}</strong>
                          <small>
                            {lesson.startedAt}–{lesson.endedAt}
                          </small>
                        </td>
                        <td>{teachers.find((teacher) => teacher.id === lesson.teacherId)?.name ?? "مدرس مؤرشف"}</td>
                        <td>
                          <strong>{lesson.stage}</strong>
                          <small>{lesson.grade}</small>
                        </td>
                        <td>{lesson.subject}</td>
                        <td>
                          <span className="attendance-badge">{lesson.studentIds.length} طالب</span>
                        </td>
                        <td>{money(lessonFinancials.fullTotal)}</td>
                        <td>
                          <span className={lessonFinancials.shortages ? "debt-amount" : ""}>{money(lessonFinancials.shortages)}</span>
                        </td>
                        <td>{money(lessonGross)}</td>
                        <td>{money(lessonTeacherDue)}</td>
                        <td>
                          <span className="profit-tag">{money(lessonNet)}</span>
                        </td>
                        <td>{lessonGross ? ((lessonNet / lessonGross) * 100).toFixed(1) : "0.0"}٪</td>
                      </tr>
                    );
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>إجمالي النتائج</td>
                  <td>{attendance} حضور</td>
                  <td>{money(fullSessionValue)}</td>
                  <td>{money(sessionShortages)}</td>
                  <td>{money(sessionGross)}</td>
                  <td>{money(teacherDue)}</td>
                  <td>{money(sessionGross - teacherDue)}</td>
                  <td>{sessionGross ? (((sessionGross - teacherDue) / sessionGross) * 100).toFixed(1) : "0.0"}٪</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState icon={<BarChart3 />} title="لا توجد حصص مطابقة" text="غيّر الفترة أو أحد الفلاتر بالأعلى" />
        )}
      </section>
      <section className="insight-banner">
        <span>
          <Sparkles size={24} />
        </span>
        <div>
          <strong>ملخص التحليل</strong>
          <p>{filtered.length || filteredBookings.length || filteredExpenses.length || filteredDebtPayments.length ? `${bySubject[0]?.label ?? "—"} هي الأعلى في الإيرادات، و${teacherRank[0]?.teacher.name ?? "—"} في صدارة المدرسين. الحجوزات أضافت ${money(bookingRevenue)} وتحصيل المديونيات أضاف ${money(debtRecovery)} والمصروفات خفّضت الصافي بمقدار ${money(expenseTotal)}؛ صافي السنتر النهائي ${money(net)}.` : "لا توجد بيانات كافية ضمن الفلاتر الحالية. جرّب توسيع الفترة أو مسح الفلاتر."}</p>
        </div>
      </section>
    </div>
  );
}

function AuditPanel({ audit }: { audit: AuditEntry[] }) {
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const recordedAt =
    selectedEntry && Number(selectedEntry.id) > 1_000_000_000_000
      ? new Intl.DateTimeFormat("ar-EG", {
          dateStyle: "full",
          timeStyle: "short",
        }).format(new Date(Number(selectedEntry.id)))
      : selectedEntry?.time;
  return (
    <>
      <section className="panel data-panel">
        <div className="data-toolbar">
          <div>
            <h2>سجل العمليات</h2>
            <p>تتبع كل التغييرات المهمة داخل النظام · اضغط على أي عملية لعرض تفاصيلها</p>
          </div>
          <span className="secure-chip">
            <ShieldCheck size={17} /> سجل محمي
          </span>
        </div>
        <div className="audit-list">
          {audit
            .slice()
            .sort(newestNumericIdFirst)
            .map((entry) => (
              <button type="button" key={entry.id} onClick={() => setSelectedEntry(entry)}>
                <span className={entry.tone}>
                  <History size={18} />
                </span>
                <div>
                  <strong>{entry.action}</strong>
                  <p>{entry.details}</p>
                </div>
                <time>{entry.time}</time>
                <ChevronLeft size={17} />
              </button>
            ))}
        </div>
      </section>
      {selectedEntry && (
        <Modal title="تفاصيل العملية" subtitle={`رقم العملية ${selectedEntry.id}`} onClose={() => setSelectedEntry(null)}>
          <div className="modal-body audit-detail">
            <div className={`audit-detail-icon ${selectedEntry.tone}`}>
              <History size={24} />
            </div>
            <div className="audit-detail-title">
              <span>نوع العملية</span>
              <strong>{selectedEntry.action}</strong>
            </div>
            <div className="audit-detail-card">
              <span>تفاصيل ما تم</span>
              <p>{selectedEntry.details}</p>
            </div>
            <div className="audit-detail-meta">
              <div>
                <span>وقت التسجيل</span>
                <strong>{recordedAt}</strong>
              </div>
              <div>
                <span>حالة السجل</span>
                <strong>
                  <ShieldCheck size={15} /> محفوظ ومحمي
                </strong>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-btn" onClick={() => setSelectedEntry(null)}>
              تم
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SettingsPanel({ subjectCatalog, setSubjectCatalog, rooms, currentUsername, onCredentialsChanged, onAddRoom, onRenameRoom, audit, showToast }: { subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; rooms: string[]; currentUsername: string; onCredentialsChanged: (username: string) => void; onAddRoom: (room: string) => void; onRenameRoom: (index: number, room: string) => void; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const [username, setUsername] = useState(currentUsername);
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodeLoading, setRecoveryCodeLoading] = useState(false);
  const [subjectStage, setSubjectStage] = useState<Stage>("المرحلة الإعدادية");
  const [newSubject, setNewSubject] = useState("");
  const [roomEditor, setRoomEditor] = useState<{
    index: number | null;
    value: string;
  } | null>(null);
  const saveRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomEditor) return;
    const value = roomEditor.value.trim();
    if (!value) {
      showToast("اكتب اسم القاعة أولاً");
      return;
    }
    const duplicate = rooms.some((room, index) => room.toLocaleLowerCase("ar").trim() === value.toLocaleLowerCase("ar").trim() && index !== roomEditor.index);
    if (duplicate) {
      showToast("اسم القاعة موجود بالفعل");
      return;
    }
    if (roomEditor.index === null) {
      onAddRoom(value);
      showToast("تمت إضافة القاعة");
    } else {
      onRenameRoom(roomEditor.index, value);
      showToast("تم تعديل اسم القاعة");
    }
    setRoomEditor(null);
  };
  const saveCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCredentialsSaving(true);
    try {
      const response = await fetch("/api/auth/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: form.get("newPassword") }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        username?: string;
        error?: string;
      };
      if (!response.ok || !result.ok || !result.username) throw new Error(result.error || "تعذر تحديث بيانات الدخول");
      onCredentialsChanged(result.username);
      formElement.reset();
      setUsername(result.username);
      showToast("تم تحديث بيانات الدخول بأمان");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر تحديث بيانات الدخول");
    } finally {
      setCredentialsSaving(false);
    }
  };
  const generateRecoveryCode = async () => {
    setRecoveryCodeLoading(true);
    try {
      const response = await fetch("/api/auth/recovery-code", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        recoveryCode?: string;
        error?: string;
      };
      if (!response.ok || !result.ok || !result.recoveryCode) throw new Error(result.error || "تعذر إنشاء كود الاسترداد");
      setRecoveryCode(result.recoveryCode);
      showToast("تم إنشاء كود استرداد جديد");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "تعذر إنشاء كود الاسترداد");
    } finally {
      setRecoveryCodeLoading(false);
    }
  };
  return (
    <div className="settings-stack">
      <section className="panel settings-section">
        <div className="settings-icon">
          <LockKeyhole size={21} />
        </div>
        <div className="settings-copy">
          <h3>PIN الإدارة</h3>
          <p>تغيير اسم المدير أو رمز الإدارة المكوّن من 4 أرقام</p>
        </div>
        <form onSubmit={saveCredentials}>
          <label className="field">
            اسم المستخدم
            <input value={username} minLength={3} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label className="field">
            PIN جديد — 4 أرقام
            <input name="newPassword" type="password" inputMode="numeric" minLength={4} maxLength={4} pattern="[0-9]{4}" placeholder="اتركه فارغًا بدون تغيير" />
          </label>
          <button className="primary-btn" type="submit" disabled={credentialsSaving}>
            {credentialsSaving ? "جاري الحفظ…" : "حفظ التغييرات"}
          </button>
        </form>
      </section>
      <section className="panel settings-section recovery-settings">
        <div className="settings-icon recovery">
          <ShieldCheck size={21} />
        </div>
        <div className="settings-copy">
          <h3>استرداد PIN الإدارة</h3>
          <p>أنشئ كود طوارئ واحفظه خارج الجهاز. يظل ثابتًا وصالحًا حتى تنشئ كودًا جديدًا، والكود الجديد يلغي السابق.</p>
        </div>
        <div className="recovery-actions">
          {recoveryCode ? (
            <div className="recovery-code-display">
              <span>احفظ هذا الكود الآن — سيظل صالحًا حتى تغييره</span>
              <code>{recoveryCode}</code>
              <button
                type="button"
                className="secondary-btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(recoveryCode);
                  showToast("تم نسخ كود الاسترداد");
                }}
              >
                نسخ الكود
              </button>
            </div>
          ) : (
            <button type="button" className="primary-btn" onClick={generateRecoveryCode} disabled={recoveryCodeLoading}>
              {recoveryCodeLoading ? "جاري الإنشاء…" : "إنشاء كود استرداد"}
            </button>
          )}
        </div>
      </section>
      <section className="panel settings-section">
        <div className="settings-icon rooms">
          <BookOpen size={21} />
        </div>
        <div className="settings-copy">
          <h3>قاعات السنتر</h3>
          <p>القاعات المتاحة عند إنشاء الحصة</p>
        </div>
        <div className="room-manager">
          <div className="room-settings">
            {rooms.map((room, index) => (
              <button type="button" className="room-pill" key={`${room}-${index}`} onClick={() => setRoomEditor({ index, value: room })} aria-label={`تعديل اسم ${room}`}>
                <i />
                <span>{room}</span>
                <Edit3 size={15} />
              </button>
            ))}
            <button type="button" className="add-room-btn" onClick={() => setRoomEditor({ index: null, value: "" })}>
              <Plus size={16} /> إضافة قاعة
            </button>
          </div>
          {roomEditor && (
            <form className="room-editor-form" onSubmit={saveRoom}>
              <label className="field">
                {roomEditor.index === null ? "اسم القاعة الجديدة" : "تعديل اسم القاعة"}
                <input autoFocus value={roomEditor.value} onChange={(event) => setRoomEditor({ ...roomEditor, value: event.target.value })} placeholder="مثال: القاعة الكبرى" />
              </label>
              <div>
                <button type="button" className="secondary-btn" onClick={() => setRoomEditor(null)}>
                  إلغاء
                </button>
                <button type="submit" className="primary-btn">
                  {roomEditor.index === null ? "إضافة القاعة" : "حفظ الاسم"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
      <section className="panel settings-section subjects-section">
        <div className="settings-icon subjects">
          <BookOpen size={21} />
        </div>
        <div className="settings-copy">
          <h3>مواد كل مرحلة</h3>
          <p>المواد هنا تظهر تلقائياً عند إضافة مدرس أو تحديد سعر جديد</p>
        </div>
        <div className="subject-settings">
          <label className="field">
            المرحلة
            <select value={subjectStage} onChange={(event) => setSubjectStage(event.target.value as Stage)}>
              {stages.map((stage) => (
                <option key={stage}>{stage}</option>
              ))}
            </select>
          </label>
          <div className="subject-tags">
            {subjectCatalog[subjectStage].map((subject) => (
              <span key={subject}>{subject}</span>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = newSubject.trim();
              if (!value) return;
              if (subjectCatalog[subjectStage].includes(value)) {
                showToast("المادة موجودة بالفعل في هذه المرحلة");
                return;
              }
              setSubjectCatalog((current) => ({
                ...current,
                [subjectStage]: [...current[subjectStage], value],
              }));
              audit((current) => [
                {
                  id: String(Date.now()),
                  action: "إضافة مادة",
                  details: `تمت إضافة ${value} إلى ${subjectStage}`,
                  time: "الآن",
                  tone: "green",
                },
                ...current,
              ]);
              setNewSubject("");
              showToast("تمت إضافة المادة للمرحلة");
            }}
          >
            <label className="field">
              مادة جديدة
              <input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="اكتب اسم المادة" />
            </label>
            <button className="primary-btn" type="submit">
              <Plus size={17} /> إضافة المادة
            </button>
          </form>
        </div>
      </section>
      <section className="cloud-card">
        <ShieldCheck size={26} />
        <div>
          <h3>قاعدة البيانات السحابية</h3>
          <p>كل تغيير يُحفظ أولاً على الجهاز كنسخة انتظار ثم يُزامن تلقائياً مع Supabase PostgreSQL.</p>
        </div>
        <span>حفظ مزدوج آمن</span>
      </section>
    </div>
  );
}
