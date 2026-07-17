"use client";

import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  Edit3,
  FileClock,
  GraduationCap,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  PauseCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";

type View = "dashboard" | "students" | "teachers" | "sessions" | "admin";
type StudentTab = "register" | "bookings" | "records";
type AdminTab = "pricing" | "archive" | "analytics" | "audit" | "settings";
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
};

type AuditEntry = {
  id: string;
  action: string;
  details: string;
  time: string;
  tone: "green" | "blue" | "orange";
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
const rooms = ["قاعة 1", "قاعة 2", "قاعة 3", "قاعة 4", "قاعة 5"];

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const initialStudents: Student[] = [
  { id: "1042", name: "أحمد محمد علي", phone: "01012345678", stage: "المرحلة الإعدادية", grade: "الصف الثالث", active: true },
  { id: "1043", name: "سارة محمود حسن", phone: "01123567890", stage: "المرحلة الثانوية", grade: "الصف الثاني", active: true },
  { id: "1044", name: "يوسف كريم سعيد", phone: "01234567891", stage: "المرحلة الثانوية", grade: "الصف الأول", active: true },
  { id: "1045", name: "ملك أحمد سمير", phone: "01012345678", stage: "المرحلة الثانوية", grade: "الصف الثالث", active: true },
  { id: "1046", name: "عمر خالد إبراهيم", phone: "01556789012", stage: "المرحلة الإعدادية", grade: "الصف الثالث", active: true },
  { id: "1047", name: "نور هاني عادل", phone: "01098765432", stage: "المرحلة الإعدادية", grade: "الصف الثاني", active: true },
  { id: "1048", name: "مريم طارق السيد", phone: "01187654321", stage: "المرحلة الثانوية", grade: "الصف الأول", active: true },
  { id: "1049", name: "زياد وليد ماهر", phone: "01276543210", stage: "المرحلة الثانوية", grade: "الصف الثاني", active: true },
];

const initialTeachers: Teacher[] = [
  { id: "18", name: "أ/ محمود عبدالعزيز", phone: "01011112222", active: true, assignments: [{ stage: "المرحلة الإعدادية", grade: "الصف الثالث", subject: "الرياضيات" }, { stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "الرياضيات" }] },
  { id: "24", name: "أ/ سارة إبراهيم", phone: "01122223333", active: true, assignments: [{ stage: "المرحلة الثانوية", grade: "الصف الثاني", subject: "الفيزياء" }, { stage: "المرحلة الثانوية", grade: "الصف الثالث", subject: "الفيزياء" }] },
  { id: "31", name: "أ/ أحمد الشناوي", phone: "01233334444", active: true, assignments: [{ stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "اللغة الإنجليزية" }, { stage: "المرحلة الإعدادية", grade: "الصف الثاني", subject: "اللغة الإنجليزية" }] },
  { id: "35", name: "أ/ منى مجدي", phone: "01044445555", active: true, assignments: [{ stage: "المرحلة الثانوية", grade: "الصف الثالث", subject: "الكيمياء" }, { stage: "المرحلة الثانوية", grade: "الصف الثاني", subject: "الكيمياء" }] },
];

const initialPricing: PriceRule[] = [
  { id: "1", stage: "المرحلة الإعدادية", grade: "الصف الثالث", subject: "الرياضيات", studentPrice: 100, teacherFee: 40 },
  { id: "2", stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "الرياضيات", studentPrice: 120, teacherFee: 50 },
  { id: "3", stage: "المرحلة الثانوية", grade: "الصف الثاني", subject: "الفيزياء", studentPrice: 150, teacherFee: 65 },
  { id: "4", stage: "المرحلة الثانوية", grade: "الصف الثالث", subject: "الفيزياء", studentPrice: 170, teacherFee: 75 },
  { id: "5", stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "اللغة الإنجليزية", studentPrice: 110, teacherFee: 45 },
  { id: "6", stage: "المرحلة الثانوية", grade: "الصف الثالث", subject: "الكيمياء", studentPrice: 160, teacherFee: 70 },
];

const initialSessions: LessonSession[] = [
  { id: "2407", teacherId: "18", stage: "المرحلة الإعدادية", grade: "الصف الثالث", subject: "الرياضيات", room: "قاعة 1", date: todayIso(), scheduledTime: "15:00", status: "active", startedAt: "15:06", studentIds: ["1042", "1046", "1047", "1048", "1049"], studentPrice: 100, teacherFee: 40 },
  { id: "2408", teacherId: "24", stage: "المرحلة الثانوية", grade: "الصف الثاني", subject: "الفيزياء", room: "قاعة 3", date: todayIso(), scheduledTime: "16:00", status: "active", startedAt: "16:02", studentIds: ["1043", "1049", "1044"], studentPrice: 150, teacherFee: 65 },
  { id: "2409", teacherId: "31", stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "اللغة الإنجليزية", room: "قاعة 2", date: todayIso(), scheduledTime: "18:00", status: "scheduled", studentIds: ["1044", "1048"], studentPrice: 110, teacherFee: 45 },
  { id: "2404", teacherId: "35", stage: "المرحلة الثانوية", grade: "الصف الثالث", subject: "الكيمياء", room: "قاعة 4", date: todayIso(), scheduledTime: "10:00", status: "ended", startedAt: "10:04", endedAt: "11:32", studentIds: ["1045", "1043", "1049", "1048"], studentPrice: 160, teacherFee: 70 },
  { id: "2405", teacherId: "18", stage: "المرحلة الثانوية", grade: "الصف الأول", subject: "الرياضيات", room: "قاعة 5", date: todayIso(), scheduledTime: "12:00", status: "ended", startedAt: "12:01", endedAt: "13:24", studentIds: ["1044", "1048", "1042"], studentPrice: 120, teacherFee: 50 },
  { id: "2406", teacherId: "31", stage: "المرحلة الإعدادية", grade: "الصف الثاني", subject: "اللغة الإنجليزية", room: "قاعة 2", date: todayIso(), scheduledTime: "13:30", status: "ended", startedAt: "13:35", endedAt: "14:50", studentIds: ["1047", "1042", "1046", "1043", "1049", "1048"], studentPrice: 95, teacherFee: 38 },
];

const initialBookings: Booking[] = [
  { id: "301", studentId: "1042", teacherId: "18", stage: "المرحلة الإعدادية", grade: "الصف الثالث", subject: "الرياضيات", bookingFee: 200, createdAt: todayIso(), active: true },
  { id: "302", studentId: "1043", teacherId: "24", stage: "المرحلة الثانوية", grade: "الصف الثاني", subject: "الفيزياء", bookingFee: 250, createdAt: todayIso(), active: true },
];

const initialAudit: AuditEntry[] = [
  { id: "1", action: "إنهاء حصة", details: "تم إنهاء حصة الكيمياء وحفظ الحسابات النهائية", time: "منذ 24 دقيقة", tone: "green" },
  { id: "2", action: "إضافة طالب", details: "تم تسجيل الطالب زياد وليد ماهر — 1049", time: "منذ 48 دقيقة", tone: "blue" },
  { id: "3", action: "تعديل سعر", details: "تحديث سعر فيزياء الصف الثاني الثانوي إلى 150 ج.م", time: "منذ ساعتين", tone: "orange" },
];

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "students", label: "الطلاب", icon: Users },
  { id: "teachers", label: "المدرسون", icon: GraduationCap },
  { id: "sessions", label: "الحصص", icon: CalendarDays },
  { id: "admin", label: "الإدارة", icon: Settings },
];

const money = (value: number) => new Intl.NumberFormat("ar-EG").format(value) + " ج.م";
const arabicDate = (date = new Date()) => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);

function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        </div>
        {children}
      </section>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p></div>;
}

function StatusPill({ status }: { status: SessionStatus }) {
  const labels = { active: "شغالة الآن", scheduled: "مجدولة", postponed: "مؤجلة", ended: "انتهت" };
  return <span className={`status-pill ${status}`}><span className="status-dot" />{labels[status]}</span>;
}

export default function CenterApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [studentTab, setStudentTab] = useState<StudentTab>("records");
  const [adminTab, setAdminTab] = useState<AdminTab>("analytics");
  const [students, setStudents] = useState(initialStudents);
  const [teachers, setTeachers] = useState(initialTeachers);
  const [pricing, setPricing] = useState(initialPricing);
  const [sessions, setSessions] = useState(initialSessions);
  const [bookings, setBookings] = useState(initialBookings);
  const [audit, setAudit] = useState(initialAudit);
  const [subjectCatalog, setSubjectCatalog] = useState<Record<Stage, string[]>>(initialSubjectsByStage);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [selectedSession, setSelectedSession] = useState<LessonSession | null>(null);
  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [endReview, setEndReview] = useState(false);
  const [startReview, setStartReview] = useState(false);
  const [startTime, setStartTime] = useState(new Date().toTimeString().slice(0, 5));
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "مدرس مؤرشف";

  const navigate = (target: View) => {
    setView(target);
    setMobileNav(false);
    setProfileMenuOpen(false);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get("username") === "admin" && data.get("password") === "12345678") {
      setAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("اسم المستخدم أو كلمة المرور غير صحيحة");
    }
  };

  if (!authenticated) {
    return (
      <main className="login-page" dir="rtl">
        <div className="login-glow glow-one" /><div className="login-glow glow-two" />
        <section className="login-brand">
          <div className="brand-mark large"><BookOpen size={31} /></div>
          <span className="eyebrow"><Sparkles size={15} /> سنتر التفوق</span>
          <h1>كل تفاصيل يومك<br /><em>في مكان واحد.</em></h1>
          <p>الحصص، الطلاب، المدرسين والحسابات — نظام واحد بسيط وآمن يساعدك تركز في اللي يهم.</p>
          <div className="login-feature-row">
            <span><ShieldCheck size={19} /> بيانات محمية</span>
            <span><Activity size={19} /> متابعة لحظية</span>
          </div>
        </section>
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-card-icon"><LockKeyhole size={24} /></div>
          <h2>أهلاً برجوعك</h2>
          <p>سجّل دخولك لفتح لوحة إدارة السنتر</p>
          <label>اسم المستخدم<input name="username" defaultValue="admin" autoComplete="username" /></label>
          <label>كلمة المرور<input name="password" type="password" defaultValue="12345678" autoComplete="current-password" /></label>
          {loginError && <div className="form-error">{loginError}</div>}
          <button className="primary-btn login-btn" type="submit">دخول للنظام <ChevronLeft size={18} /></button>
          <small>بيانات الـDemo: admin / 12345678</small>
        </form>
      </main>
    );
  }

  const pageTitles: Record<View, [string, string]> = {
    dashboard: ["صباح الخير 👋", "دي نظرة سريعة على يوم السنتر"],
    students: ["إدارة الطلاب", "تسجيل الطلاب، الحجوزات المسبقة وسجل الحضور"],
    teachers: ["المدرسون", "بيانات المدرسين وتخصصاتهم وسجل حصصهم"],
    sessions: ["إدارة الحصص", "أنشئ الحصص وتابعها من البداية حتى الأرشيف"],
    admin: ["الإدارة والتقارير", "الأسعار، الأرشيف، التحليلات وإعدادات النظام"],
  };
  const openSessionsToday = sessions.filter((lesson) => lesson.date === todayIso() && lesson.status !== "ended").length;

  return (
    <div className="app-shell" dir="rtl">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand"><div className="brand-mark"><BookOpen size={23} /></div><div><strong>سنتر <span>التفوق</span></strong><small>نظام الإدارة</small></div></div>
        <nav>
          <span className="nav-label">القائمة الرئيسية</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}><Icon size={20} /><span>{item.label}</span>{item.id === "sessions" && <b>{openSessionsToday}</b>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="admin-menu-wrap"><div className="admin-mini"><span>م</span><div><strong>مدير السنتر</strong><small>حساب الإدارة</small></div><button className="admin-more" onClick={() => setProfileMenuOpen((open) => !open)} aria-label="فتح قائمة مدير السنتر" aria-expanded={profileMenuOpen}><MoreHorizontal size={18} /></button></div>{profileMenuOpen && <div className="admin-popover" role="menu"><button role="menuitem" onClick={() => { setView("admin"); setAdminTab("settings"); setProfileMenuOpen(false); }}><Settings size={17} /><span><strong>إعدادات الحساب</strong><small>تغيير اسم المستخدم أو كلمة المرور</small></span></button><button role="menuitem" onClick={() => { setView("admin"); setAdminTab("audit"); setProfileMenuOpen(false); }}><History size={17} /><span><strong>سجل العمليات</strong><small>عرض آخر التغييرات</small></span></button><button className="danger" role="menuitem" onClick={() => { setAuthenticated(false); setProfileMenuOpen(false); }}><LogOut size={17} /><span><strong>تسجيل الخروج</strong><small>إنهاء الجلسة الحالية</small></span></button></div>}</div>
          <button className="logout" onClick={() => setAuthenticated(false)}><LogOut size={18} /> تسجيل الخروج</button>
        </div>
      </aside>

      {mobileNav && <button className="nav-backdrop" aria-label="إغلاق القائمة" onClick={() => setMobileNav(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="mobile-menu icon-btn" onClick={() => setMobileNav(true)} aria-label="فتح القائمة"><Menu size={22} /></button>
          <div className="page-heading"><h1>{pageTitles[view][0]}</h1><p>{pageTitles[view][1]}</p></div>
          <div className="top-actions"><div className="today-chip"><CalendarDays size={17} /><span>{arabicDate()}</span></div><button className="icon-btn notification" aria-label="التنبيهات"><Bell size={20} /><i /></button></div>
        </header>

        <div className="page-content">
          {view === "dashboard" && <Dashboard sessions={sessions} teachers={teachers} onOpenSession={setSelectedSession} />}
          {view === "students" && <StudentsPage tab={studentTab} setTab={setStudentTab} students={students} setStudents={setStudents} teachers={teachers} bookings={bookings} setBookings={setBookings} sessions={sessions} onOpenStudent={setSelectedStudent} audit={setAudit} showToast={showToast} />}
          {view === "teachers" && <TeachersPage teachers={teachers} setTeachers={setTeachers} sessions={sessions} onOpenTeacher={setSelectedTeacher} audit={setAudit} subjectCatalog={subjectCatalog} setSubjectCatalog={setSubjectCatalog} showToast={showToast} />}
          {view === "sessions" && <SessionsPage sessions={sessions} teachers={teachers} onCreate={() => setCreateSessionOpen(true)} onOpen={setSelectedSession} />}
          {view === "admin" && <AdminPage tab={adminTab} setTab={setAdminTab} pricing={pricing} setPricing={setPricing} sessions={sessions} students={students} teachers={teachers} audit={audit} subjectCatalog={subjectCatalog} setSubjectCatalog={setSubjectCatalog} showToast={showToast} />}
        </div>
      </main>

      {createSessionOpen && <CreateSessionModal teachers={teachers} pricing={pricing} sessions={sessions} onClose={() => setCreateSessionOpen(false)} onCreate={(lesson) => { setSessions((current) => [lesson, ...current]); setAudit((current) => [{ id: String(Date.now()), action: "إنشاء حصة", details: `تم إنشاء حصة ${lesson.subject} في ${lesson.room}`, time: "الآن", tone: "blue" }, ...current]); setCreateSessionOpen(false); showToast("تم إنشاء الحصة بنجاح"); }} />}

      {selectedStudent && <StudentRecordModal student={selectedStudent} sessions={sessions} teachers={teachers} onClose={() => setSelectedStudent(null)} />}
      {selectedTeacher && <TeacherRecordModal teacher={selectedTeacher} sessions={sessions} onClose={() => setSelectedTeacher(null)} />}

      {selectedSession && <SessionModal session={sessions.find((item) => item.id === selectedSession.id) ?? selectedSession} students={students} teacherName={teacherName(selectedSession.teacherId)} onClose={() => { setSelectedSession(null); setEndReview(false); setStartReview(false); }} onAddStudent={(studentId) => { setSessions((current) => current.map((item) => item.id === selectedSession.id && !item.studentIds.includes(studentId) ? { ...item, studentIds: [...item.studentIds, studentId] } : item)); showToast("تمت إضافة الطالب للحصة"); }} onRemoveStudent={(studentId) => { setSessions((current) => current.map((item) => item.id === selectedSession.id ? { ...item, studentIds: item.studentIds.filter((id) => id !== studentId) } : item)); }} onStart={() => setStartReview(true)} onPostpone={() => { setSessions((current) => current.map((item) => item.id === selectedSession.id ? { ...item, status: "postponed" } : item)); setAudit((current) => [{ id: String(Date.now()), action: "تأجيل حصة", details: `تم تأجيل حصة ${selectedSession.subject} في ${selectedSession.room}`, time: "الآن", tone: "orange" }, ...current]); showToast("تم تأجيل الحصة ويمكن بدءها لاحقاً"); }} onEnd={() => setEndReview(true)} />}

      {startReview && selectedSession && <Modal title="بدء الحصة" subtitle="راجع وقت البداية الفعلي قبل التأكيد" onClose={() => setStartReview(false)}><div className="modal-body"><label className="field">وقت البداية<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><div className="date-note"><CalendarDays size={18} /><span><strong>{arabicDate()}</strong>يمكنك تعديل الوقت قبل بدء الحصة</span></div></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setStartReview(false)}>إلغاء</button><button className="primary-btn" onClick={() => { const roomBusy = sessions.some((item) => item.id !== selectedSession.id && item.room === selectedSession.room && item.status === "active"); if (roomBusy) { showToast(`${selectedSession.room} فيها حصة شغالة بالفعل`); return; } setSessions((current) => current.map((item) => item.id === selectedSession.id ? { ...item, status: "active", startedAt: startTime } : item)); setStartReview(false); showToast("بدأت الحصة وتم تسجيل الوقت"); }}>تأكيد بدء الحصة</button></div></Modal>}

      {endReview && selectedSession && (() => { const lesson = sessions.find((item) => item.id === selectedSession.id) ?? selectedSession; const gross = lesson.studentIds.length * lesson.studentPrice; const teacherDue = lesson.studentIds.length * lesson.teacherFee; return <Modal title="إنهاء الحصة" subtitle="مراجعة الحسابات النهائية قبل نقل الحصة للأرشيف" onClose={() => setEndReview(false)} wide><div className="modal-body"><div className="review-banner"><ShieldCheck size={24} /><div><strong>سيتم قفل بيانات الحصة بعد التأكيد</strong><span>أي تعديل لاحق سيتم تسجيله في سجل العمليات</span></div></div><div className="financial-grid"><div><span>الطلاب الحاضرون</span><strong>{lesson.studentIds.length}</strong></div><div><span>إجمالي قيمة الحصة</span><strong>{money(gross)}</strong></div><div><span>مستحق المدرس</span><strong>{money(teacherDue)}</strong></div><div className="highlight"><span>صافي السنتر</span><strong>{money(gross - teacherDue)}</strong></div></div></div><div className="modal-actions"><button className="secondary-btn" onClick={() => setEndReview(false)}>رجوع للحصة</button><button className="danger-confirm" onClick={() => { const end = new Date().toTimeString().slice(0, 5); setSessions((current) => current.map((item) => item.id === lesson.id ? { ...item, status: "ended", endedAt: end } : item)); setAudit((current) => [{ id: String(Date.now()), action: "إنهاء حصة", details: `تم إنهاء حصة ${lesson.subject} — صافي السنتر ${money(gross - teacherDue)}`, time: "الآن", tone: "green" }, ...current]); setEndReview(false); setSelectedSession(null); showToast("تم إنهاء الحصة ونقلها للأرشيف"); }}>تأكيد وإنهاء الحصة</button></div></Modal>; })()}

      {toast && <div className="toast"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Dashboard({ sessions, teachers, onOpenSession }: { sessions: LessonSession[]; teachers: Teacher[]; onOpenSession: (lesson: LessonSession) => void }) {
  const [todaySessionsOpen, setTodaySessionsOpen] = useState(false);
  const today = todayIso();
  const todaySessions = sessions.filter((lesson) => lesson.date === today).slice().sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const active = todaySessions.filter((lesson) => lesson.status === "active");
  const ended = todaySessions.filter((lesson) => lesson.status === "ended").slice(0, 3);
  const attendance = todaySessions.reduce((total, lesson) => total + lesson.studentIds.length, 0);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "—";
  const maxStudents = Math.max(...todaySessions.map((lesson) => lesson.studentIds.length), 1);
  return <div className="dashboard-grid">
    <button type="button" className="metric-card teal metric-button" onClick={() => setTodaySessionsOpen(true)} aria-label={`فتح حصص اليوم وعددها ${todaySessions.length}`}><div className="metric-icon"><CalendarDays size={23} /></div><div><span>حصص اليوم</span><strong>{todaySessions.length}</strong><small><Activity size={14} /> {active.length} شغالة الآن · اضغط للتفاصيل</small></div><span className="metric-watermark">{String(todaySessions.length).padStart(2, "0")}</span><span className="metric-open"><ChevronLeft size={18} /></span></button>
    <section className="metric-card navy"><div className="metric-icon"><Users size={23} /></div><div><span>حضور الطلاب اليوم</span><strong>{attendance}</strong><small><Activity size={14} /> كل حضور محسوب على حدة</small></div><span className="metric-watermark">{attendance}</span></section>
    <section className="panel active-lessons">
      <div className="panel-head"><div><span className="section-kicker live"><i /> مباشر الآن</span><h2>الحصص الشغالة</h2></div><button className="text-btn">عرض كل الحصص <ChevronLeft size={17} /></button></div>
      {active.length ? <div className="table-wrap"><table><thead><tr><th>المدرس</th><th>المرحلة والصف والمادة</th><th>القاعة</th><th>الطلاب</th><th>بدأت</th><th /></tr></thead><tbody>{active.map((lesson) => <tr key={lesson.id} onClick={() => onOpenSession(lesson)}><td><div className="person-cell"><span>{teacherName(lesson.teacherId).replace("أ/ ", "").charAt(0)}</span><strong>{teacherName(lesson.teacherId)}</strong></div></td><td><strong>{lesson.subject}</strong><small>{lesson.stage} · {lesson.grade}</small></td><td><span className="room-tag">{lesson.room}</span></td><td><div className="student-count"><Users size={16} /><strong>{lesson.studentIds.length}</strong></div></td><td><span className="time-cell"><Clock3 size={15} /> {lesson.startedAt}</span></td><td><button className="row-action"><ChevronLeft size={18} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Clock3 />} title="لا توجد حصص شغالة" text="الحصص التي تبدأ ستظهر هنا فوراً" />}
    </section>
    <section className="panel chart-panel">
      <div className="panel-head"><div><span className="section-kicker">تحليل اليوم</span><h2>الحصص وعدد الطلاب</h2></div><span className="chart-legend"><i /> عدد الحضور</span></div>
      <div className="bar-chart">{todaySessions.map((lesson) => <div className="bar-column" key={lesson.id}><span>{lesson.studentIds.length}</span><div className={`bar ${lesson.status}`} style={{ height: `${Math.max(22, (lesson.studentIds.length / maxStudents) * 145)}px` }} /><small>{lesson.scheduledTime}</small><b>{lesson.subject}</b></div>)}</div>
    </section>
    <section className="panel recent-lessons">
      <div className="panel-head"><div><span className="section-kicker">تمت اليوم</span><h2>آخر 3 حصص انتهت</h2></div></div>
      <div className="recent-list">{ended.map((lesson) => <button key={lesson.id} onClick={() => onOpenSession(lesson)}><span className="recent-icon"><Check size={18} /></span><span className="recent-main"><strong>{lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}</strong><small>{teacherName(lesson.teacherId)} · {lesson.room}</small></span><span className="recent-students"><b>{lesson.studentIds.length}</b><small>طالب</small></span><span className="recent-time">{lesson.endedAt}</span><ChevronLeft size={18} /></button>)}</div>
    </section>
    {todaySessionsOpen && <Modal title="حصص اليوم" subtitle={`${arabicDate()} · ${todaySessions.length} حصة`} onClose={() => setTodaySessionsOpen(false)} wide><div className="modal-body today-session-list">{todaySessions.map((lesson) => <button key={lesson.id} onClick={() => { setTodaySessionsOpen(false); onOpenSession(lesson); }}><StatusPill status={lesson.status} /><div className="today-session-main"><strong>{lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}</strong><small>{teacherName(lesson.teacherId)} · {lesson.room}</small></div><span><Clock3 size={15} /> {lesson.startedAt ?? lesson.scheduledTime}</span><span><Users size={15} /> {lesson.studentIds.length} طلاب</span><ChevronLeft size={18} /></button>)}{!todaySessions.length && <EmptyState icon={<CalendarDays />} title="لا توجد حصص اليوم" text="الحصص التي يتم إنشاؤها بتاريخ اليوم ستظهر هنا" />}</div></Modal>}
  </div>;
}

function StudentsPage({ tab, setTab, students, setStudents, teachers, bookings, setBookings, sessions, onOpenStudent, audit, showToast }: { tab: StudentTab; setTab: (tab: StudentTab) => void; students: Student[]; setStudents: React.Dispatch<React.SetStateAction<Student[]>>; teachers: Teacher[]; bookings: Booking[]; setBookings: React.Dispatch<React.SetStateAction<Booking[]>>; sessions: LessonSession[]; onOpenStudent: (student: Student) => void; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; showToast: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [registerStage, setRegisterStage] = useState<Stage>("المرحلة الإعدادية");
  const [editStage, setEditStage] = useState<Stage>("المرحلة الإعدادية");
  const filtered = students.filter((student) => student.active && [student.id, student.name, student.phone].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  const addStudent = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const newStudent: Student = { id: String(Math.max(...students.map((student) => Number(student.id)), 0) + 1), name: String(data.get("name")), phone: String(data.get("phone")), stage: registerStage, grade: String(data.get("grade")), active: true }; setStudents((current) => [...current, newStudent]); audit((current) => [{ id: String(Date.now()), action: "إضافة طالب", details: `تم تسجيل ${newStudent.name} — ${newStudent.id}`, time: "الآن", tone: "blue" }, ...current]); event.currentTarget.reset(); showToast(`تم تسجيل الطالب بالرقم ${newStudent.id}`); };
  return <div className="stack-page"><div className="segmented-tabs"><button className={tab === "register" ? "active" : ""} onClick={() => setTab("register")}><UserPlus size={18} /> تسجيل طالب لأول مرة</button><button className={tab === "bookings" ? "active" : ""} onClick={() => setTab("bookings")}><BookOpen size={18} /> الحجز المسبق</button><button className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}><FileClock size={18} /> سجل الطلاب</button></div>
    {tab === "register" && <section className="split-layout"><div className="form-panel"><div className="form-panel-head"><span><UserPlus size={22} /></span><div><h2>تسجيل طالب جديد</h2><p>أدخل البيانات الأساسية، وسيتم إنشاء ID رقمي تلقائياً</p></div></div><form className="entity-form" onSubmit={addStudent}><label className="field full">اسم الطالب بالكامل<input name="name" required placeholder="مثال: أحمد محمد علي" /></label><label className="field full">رقم الهاتف<input name="phone" required inputMode="tel" placeholder="01xxxxxxxxx" /></label><label className="field">المرحلة<select value={registerStage} onChange={(event) => setRegisterStage(event.target.value as Stage)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label className="field">الصف<select name="grade" required>{gradesByStage[registerStage].map((grade) => <option key={grade}>{grade}</option>)}</select></label><div className="info-note full"><ShieldCheck size={18} /><span>يمكن استخدام نفس رقم الهاتف لأكثر من طالب، والـID الرقمي هو المعرف الأساسي.</span></div><button className="primary-btn full" type="submit"><Plus size={18} /> تسجيل الطالب</button></form></div><div className="tip-card"><span><Sparkles size={25} /></span><h3>تسجيل سريع وواضح</h3><p>بعد التسجيل سيظهر الطالب فوراً في السجل، ويمكن البحث عنه وإضافته لأي حصة أو حجز مسبق.</p><div><Check size={17} /> ID رقمي تلقائي</div><div><Check size={17} /> تعديل وأرشفة</div><div><Check size={17} /> سجل حضور كامل</div></div></section>}
    {tab === "bookings" && <BookingsPanel students={students} teachers={teachers} bookings={bookings} setBookings={setBookings} showToast={showToast} />}
    {tab === "records" && <section className="panel data-panel"><div className="data-toolbar"><div><h2>سجل الطلاب</h2><p>{filtered.length} طالب نشط</p></div><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، الهاتف أو ID" /></div></div><div className="table-wrap"><table><thead><tr><th>الطالب</th><th>ID</th><th>رقم الهاتف</th><th>المرحلة</th><th>الصف</th><th>مرات الحضور</th><th>إجراءات</th></tr></thead><tbody>{filtered.map((student) => <tr key={student.id}><td><div className="person-cell student"><span>{student.name.charAt(0)}</span><strong>{student.name}</strong></div></td><td><code>{student.id}</code></td><td>{student.phone}</td><td>{student.stage}</td><td>{student.grade}</td><td><span className="attendance-badge">{sessions.filter((lesson) => lesson.studentIds.includes(student.id) && lesson.status === "ended").length} حصة</span></td><td><div className="table-actions"><button onClick={() => onOpenStudent(student)} title="فتح السجل"><FileClock size={17} /></button><button onClick={() => { setEditStage(student.stage); setEditStudent(student); }} title="تعديل"><Edit3 size={17} /></button><button className="archive-action" onClick={() => { setStudents((current) => current.map((item) => item.id === student.id ? { ...item, active: false } : item)); showToast("تم نقل الطالب للأرشيف"); }} title="أرشفة"><Archive size={17} /></button></div></td></tr>)}</tbody></table></div></section>}
    {editStudent && <Modal title="تعديل بيانات الطالب" subtitle={editStudent.id} onClose={() => setEditStudent(null)}><form className="modal-body entity-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setStudents((current) => current.map((student) => student.id === editStudent.id ? { ...student, name: String(data.get("name")), phone: String(data.get("phone")), stage: editStage, grade: String(data.get("grade")) } : student)); setEditStudent(null); showToast("تم تحديث بيانات الطالب"); }}><label className="field full">اسم الطالب<input name="name" defaultValue={editStudent.name} required /></label><label className="field full">الهاتف<input name="phone" defaultValue={editStudent.phone} required /></label><label className="field">المرحلة<select value={editStage} onChange={(event) => setEditStage(event.target.value as Stage)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label className="field">الصف<select name="grade" defaultValue={editStudent.grade}>{gradesByStage[editStage].map((grade) => <option key={grade}>{grade}</option>)}</select></label><button className="primary-btn full" type="submit">حفظ التعديلات</button></form></Modal>}
  </div>;
}

function BookingsPanel({ students, teachers, bookings, setBookings, showToast }: { students: Student[]; teachers: Teacher[]; bookings: Booking[]; setBookings: React.Dispatch<React.SetStateAction<Booking[]>>; showToast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState(teachers.find((teacher) => teacher.active)?.id ?? "");
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId);
  const selectedAssignment = selectedTeacher?.assignments[assignmentIndex] ?? selectedTeacher?.assignments[0];
  const active = bookings.filter((booking) => booking.active);
  return <section className="panel data-panel"><div className="data-toolbar"><div><h2>الحجوزات المسبقة</h2><p>ربط الطالب بالمدرس وتسجيل قيمة الحجز بعيداً عن حساب الحصص</p></div><button className="primary-btn" onClick={() => setOpen(true)}><Plus size={18} /> حجز جديد</button></div><div className="booking-grid">{active.map((booking) => { const student = students.find((item) => item.id === booking.studentId); const teacher = teachers.find((item) => item.id === booking.teacherId); return <article key={booking.id} className="booking-card"><div className="booking-top"><span className="student-avatar">{student?.name.charAt(0)}</span><div><strong>{student?.name}</strong><small>{student?.id} · {booking.createdAt}</small></div><button onClick={() => { setBookings((current) => current.map((item) => item.id === booking.id ? { ...item, active: false } : item)); showToast("تم نقل الحجز للأرشيف"); }} aria-label="أرشفة الحجز"><Archive size={17} /></button></div><div className="booking-link"><span><GraduationCap size={17} /> {teacher?.name}</span><span><BookOpen size={17} /> {booking.subject}</span><span>{booking.stage} · {booking.grade}</span></div><div className="booking-fee"><span>قيمة الحجز</span><strong>{money(booking.bookingFee)}</strong></div></article>; })}</div>{!active.length && <EmptyState icon={<BookOpen />} title="لا توجد حجوزات مسبقة" text="ابدأ بربط طالب مع المدرس المناسب" />}
    {open && <Modal title="حجز مسبق جديد" subtitle="قيمة الحجز مستقلة تماماً عن سعر الحصة" onClose={() => setOpen(false)}><form className="modal-body entity-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!selectedTeacher || !selectedAssignment) return; setBookings((current) => [...current, { id: String(Math.max(...current.map((booking) => Number(booking.id)), 0) + 1), studentId: String(data.get("student")), teacherId: selectedTeacher.id, stage: selectedAssignment.stage, grade: selectedAssignment.grade, subject: selectedAssignment.subject, bookingFee: Number(data.get("bookingFee")), createdAt: todayIso(), active: true }]); setOpen(false); showToast("تم إنشاء الحجز وتسجيل قيمته"); }}><label className="field full">الطالب<select name="student">{students.filter((student) => student.active).map((student) => <option key={student.id} value={student.id}>{student.name} — {student.id}</option>)}</select></label><label className="field full">المدرس<select value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setAssignmentIndex(0); }}>{teachers.filter((teacher) => teacher.active).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label><label className="field full">المرحلة والصف والمادة<select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>{selectedTeacher?.assignments.map((assignment, index) => <option value={index} key={`${assignment.stage}-${assignment.grade}-${assignment.subject}`}>{assignment.stage} — {assignment.grade} — {assignment.subject}</option>)}</select></label><label className="field full">قيمة الحجز<input name="bookingFee" type="number" min="0" required placeholder="مثال: 200" /></label><div className="info-note full"><CircleDollarSign size={18} /> قيمة الحجز مستقلة عن الحصص ولا تدخل في حساب مستحق المدرس أو صافي الحصة.</div><button className="primary-btn full" type="submit">تأكيد الحجز</button></form></Modal>}
  </section>;
}

function TeachersPage({ teachers, setTeachers, sessions, onOpenTeacher, audit, subjectCatalog, setSubjectCatalog, showToast }: { teachers: Teacher[]; setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>; sessions: LessonSession[]; onOpenTeacher: (teacher: Teacher) => void; audit: React.Dispatch<React.SetStateAction<AuditEntry[]>>; subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; showToast: (message: string) => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [query, setQuery] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Assignment[]>([{ stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: "اللغة العربية" }]);
  const visible = teachers.filter((teacher) => teacher.active && [teacher.name, teacher.phone, teacher.id].some((value) => value.includes(query)));
  const openForm = (teacher?: Teacher) => {
    setEditing(teacher ?? null);
    setAssignmentDrafts(teacher?.assignments.map((item) => ({ ...item })) ?? [{ stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: subjectCatalog["المرحلة الإعدادية"][0] }]);
    setFormOpen(true);
  };
  const updateAssignment = (index: number, next: Assignment) => setAssignmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? next : item));
  return <div className="stack-page"><section className="panel data-panel"><div className="data-toolbar"><div><h2>قائمة المدرسين</h2><p>{visible.length} مدرس نشط</p></div><div className="toolbar-actions"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن مدرس" /></div><button className="primary-btn" onClick={() => openForm()}><Plus size={18} /> إضافة مدرس</button></div></div><div className="teacher-grid">{visible.map((teacher) => { const teacherSessions = sessions.filter((lesson) => lesson.teacherId === teacher.id && lesson.status === "ended"); return <article className="teacher-card" key={teacher.id}><div className="teacher-card-head"><span>{teacher.name.replace("أ/ ", "").charAt(0)}</span><div><h3>{teacher.name}</h3><small>{teacher.id} · {teacher.phone}</small></div><button><MoreHorizontal size={19} /></button></div><div className="assignment-tags">{teacher.assignments.map((assignment) => <span key={`${assignment.stage}-${assignment.grade}-${assignment.subject}`}>{assignment.subject}<small>{assignment.stage.replace("المرحلة ", "")} · {assignment.grade.replace("الصف ", "")}</small></span>)}</div><div className="teacher-stats"><div><strong>{teacherSessions.length}</strong><span>حصة منتهية</span></div><div><strong>{teacherSessions.reduce((sum, lesson) => sum + lesson.studentIds.length, 0)}</strong><span>حضور طالب</span></div></div><div className="teacher-actions"><button onClick={() => onOpenTeacher(teacher)}><History size={17} /> سجل الحصص</button><button onClick={() => openForm(teacher)}><SquarePen size={17} /> تعديل</button><button className="archive-action" onClick={() => { setTeachers((current) => current.map((item) => item.id === teacher.id ? { ...item, active: false } : item)); showToast("تم نقل المدرس للأرشيف"); }}><Archive size={17} /></button></div></article>; })}</div></section>
    {formOpen && <Modal title={editing ? "تعديل بيانات المدرس" : "إضافة مدرس جديد"} subtitle="حدد المرحلة أولاً، ثم الصف والمادة المتاحة" onClose={() => setFormOpen(false)} wide><form className="modal-body entity-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (assignmentDrafts.some((item) => !item.subject.trim())) { showToast("اكتب اسم المادة الجديدة"); return; } assignmentDrafts.forEach((item) => { if (!subjectCatalog[item.stage].includes(item.subject)) setSubjectCatalog((current) => ({ ...current, [item.stage]: [...current[item.stage], item.subject] })); }); if (editing) setTeachers((current) => current.map((teacher) => teacher.id === editing.id ? { ...teacher, name: String(data.get("name")), phone: String(data.get("phone")), assignments: assignmentDrafts } : teacher)); else setTeachers((current) => [...current, { id: String(Math.max(...current.map((teacher) => Number(teacher.id)), 0) + 1), name: String(data.get("name")), phone: String(data.get("phone")), assignments: assignmentDrafts, active: true }]); audit((current) => [{ id: String(Date.now()), action: editing ? "تعديل مدرس" : "إضافة مدرس", details: `${editing ? "تم تعديل" : "تم تسجيل"} بيانات ${String(data.get("name"))}`, time: "الآن", tone: "blue" }, ...current]); setFormOpen(false); showToast(editing ? "تم تحديث بيانات المدرس" : "تمت إضافة المدرس"); }}><label className="field">اسم المدرس<input name="name" defaultValue={editing?.name} placeholder="أ/ اسم المدرس" required /></label><label className="field">رقم الهاتف<input name="phone" defaultValue={editing?.phone} required /></label><div className="assignment-builder full"><div><strong>المراحل والصفوف والمواد</strong><button type="button" onClick={() => setAssignmentDrafts((current) => [...current, { stage: "المرحلة الإعدادية", grade: "الصف الأول", subject: subjectCatalog["المرحلة الإعدادية"][0] }])}><Plus size={16} /> إضافة تخصص</button></div>{assignmentDrafts.map((assignment, index) => { const isCustom = !subjectCatalog[assignment.stage].includes(assignment.subject); return <div className="assignment-row expanded" key={index}><label className="field"><span>المرحلة</span><select value={assignment.stage} onChange={(event) => { const stage = event.target.value as Stage; updateAssignment(index, { stage, grade: gradesByStage[stage][0], subject: subjectCatalog[stage][0] }); }}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label className="field"><span>الصف</span><select value={assignment.grade} onChange={(event) => updateAssignment(index, { ...assignment, grade: event.target.value })}>{gradesByStage[assignment.stage].map((grade) => <option key={grade}>{grade}</option>)}</select></label><label className="field"><span>المادة</span><select value={isCustom ? "__custom__" : assignment.subject} onChange={(event) => updateAssignment(index, { ...assignment, subject: event.target.value === "__custom__" ? "" : event.target.value })}>{subjectCatalog[assignment.stage].map((subject) => <option key={subject}>{subject}</option>)}<option value="__custom__">+ مادة جديدة</option></select></label>{isCustom && <label className="field custom-subject"><span>اسم المادة الجديدة</span><input value={assignment.subject} onChange={(event) => updateAssignment(index, { ...assignment, subject: event.target.value })} placeholder="اكتب اسم المادة" required /></label>}{assignmentDrafts.length > 1 && <button type="button" className="remove-row" onClick={() => setAssignmentDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} /></button>}</div>; })}</div><button className="primary-btn full" type="submit">{editing ? "حفظ التعديلات" : "إضافة المدرس"}</button></form></Modal>}
  </div>;
}

function SessionsPage({ sessions, teachers, onCreate, onOpen }: { sessions: LessonSession[]; teachers: Teacher[]; onCreate: () => void; onOpen: (lesson: LessonSession) => void }) {
  const [filter, setFilter] = useState<"all" | SessionStatus>("all");
  const visible = sessions.filter((lesson) => filter === "all" || lesson.status === filter);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name;
  return <div className="stack-page"><div className="sessions-hero"><div><span className="eyebrow"><Activity size={15} /> تشغيل اليوم</span><h2>نظّم يوم السنتر<br />حصة بحصة.</h2><p>أنشئ الحصة، سجّل بدايتها، أضف الطلاب ثم راجع الحسابات قبل الإنهاء.</p></div><button className="hero-create" onClick={onCreate}><span><Plus size={25} /></span>إنشاء حصة جديدة</button></div><div className="filter-row"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>الكل <b>{sessions.length}</b></button><button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>شغالة الآن <b>{sessions.filter((lesson) => lesson.status === "active").length}</b></button><button className={filter === "scheduled" ? "active" : ""} onClick={() => setFilter("scheduled")}>مجدولة <b>{sessions.filter((lesson) => lesson.status === "scheduled").length}</b></button><button className={filter === "postponed" ? "active" : ""} onClick={() => setFilter("postponed")}>مؤجلة <b>{sessions.filter((lesson) => lesson.status === "postponed").length}</b></button><button className={filter === "ended" ? "active" : ""} onClick={() => setFilter("ended")}>انتهت <b>{sessions.filter((lesson) => lesson.status === "ended").length}</b></button></div><div className="session-card-grid">{visible.map((lesson) => { const gross = lesson.studentIds.length * lesson.studentPrice; return <button className={`session-card ${lesson.status}`} key={lesson.id} onClick={() => onOpen(lesson)}><div className="session-card-top"><StatusPill status={lesson.status} /><code>{lesson.id}</code></div><h3>{lesson.subject}</h3><p>{lesson.stage} · {lesson.grade}</p><div className="session-teacher"><span>{teacherName(lesson.teacherId)?.replace("أ/ ", "").charAt(0)}</span><strong>{teacherName(lesson.teacherId)}</strong></div><div className="session-meta"><span><Clock3 size={16} /> {lesson.startedAt ?? lesson.scheduledTime}</span><span><BookOpen size={16} /> {lesson.room}</span><span><Users size={16} /> {lesson.studentIds.length} طلاب</span></div><div className="session-card-foot"><span>قيمة الحصة</span><strong>{money(gross)}</strong><ChevronLeft size={19} /></div></button>; })}</div></div>;
}

function CreateSessionModal({ teachers, pricing, sessions, onClose, onCreate }: { teachers: Teacher[]; pricing: PriceRule[]; sessions: LessonSession[]; onClose: () => void; onCreate: (lesson: LessonSession) => void }) {
  const [teacherId, setTeacherId] = useState(teachers.find((teacher) => teacher.active)?.id ?? "");
  const teacher = teachers.find((item) => item.id === teacherId);
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [conflictError, setConflictError] = useState("");
  const assignment = teacher?.assignments[assignmentIndex] ?? teacher?.assignments[0];
  const rule = pricing.find((item) => item.stage === assignment?.stage && item.grade === assignment?.grade && item.subject === assignment?.subject);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); if (!assignment) return; const room = String(data.get("room")); const date = String(data.get("date")); const scheduledTime = String(data.get("time")); const conflict = sessions.some((lesson) => lesson.room === room && lesson.date === date && lesson.scheduledTime === scheduledTime && lesson.status !== "ended"); if (conflict) { setConflictError(`لا يمكن الحفظ: ${room} محجوزة في نفس التاريخ والوقت`); return; } setConflictError(""); onCreate({ id: String(Math.max(...sessions.map((lesson) => Number(lesson.id)), 0) + 1), teacherId, stage: assignment.stage, grade: assignment.grade, subject: assignment.subject, room, date, scheduledTime, status: "scheduled", studentIds: [], studentPrice: rule?.studentPrice ?? 0, teacherFee: rule?.teacherFee ?? 0 }); };
  return <Modal title="إنشاء حصة جديدة" subtitle="المرحلة والصف والمادة يظهرون حسب بيانات المدرس" onClose={onClose} wide><form className="modal-body entity-form" onSubmit={submit}><label className="field full">المدرس<select value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setAssignmentIndex(0); }}>{teachers.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="field full">المرحلة والصف والمادة<select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>{teacher?.assignments.map((item, index) => <option key={`${item.stage}-${item.grade}-${item.subject}`} value={index}>{item.stage} — {item.grade} — {item.subject}</option>)}</select></label><label className="field">التاريخ<input name="date" type="date" defaultValue={todayIso()} required /></label><label className="field">الساعة<input name="time" type="time" defaultValue="17:00" required /></label><label className="field full">القاعة<select name="room">{rooms.map((room) => <option key={room}>{room}</option>)}</select></label><div className="price-preview full"><div><span>سعر الطالب</span><strong>{money(rule?.studentPrice ?? 0)}</strong></div><div><span>أجر المدرس / طالب</span><strong>{money(rule?.teacherFee ?? 0)}</strong></div></div>{conflictError && <div className="form-error full">{conflictError}</div>}<div className="info-note full"><ShieldCheck size={18} /> لا يمكن حجز قاعة لحصتين في نفس التاريخ والوقت، ولا بدء حصتين في نفس القاعة.</div><button className="primary-btn full" type="submit">إنشاء الحصة</button></form></Modal>;
}

function SessionModal({ session, students, teacherName, onClose, onAddStudent, onRemoveStudent, onStart, onPostpone, onEnd }: { session: LessonSession; students: Student[]; teacherName: string; onClose: () => void; onAddStudent: (id: string) => void; onRemoveStudent: (id: string) => void; onStart: () => void; onPostpone: () => void; onEnd: () => void }) {
  const [query, setQuery] = useState("");
  const candidates = students.filter((student) => student.active && !session.studentIds.includes(student.id) && query && [student.name, student.phone, student.id].some((value) => value.includes(query))).slice(0, 4);
  const gross = session.studentIds.length * session.studentPrice;
  const teacherDue = session.studentIds.length * session.teacherFee;
  return <Modal title={`${session.subject} — ${gradeLabel(session.stage, session.grade)}`} subtitle={`${session.id} · ${session.room}`} onClose={onClose} wide><div className="session-modal-body"><div className="session-summary"><div><StatusPill status={session.status} /><h3>{teacherName}</h3><p><CalendarDays size={16} /> {session.date} <Clock3 size={16} /> {session.startedAt ?? session.scheduledTime}</p></div><div className="session-summary-actions">{(session.status === "scheduled" || session.status === "postponed") && <button className="start-btn" onClick={onStart}><Activity size={18} /> {session.status === "postponed" ? "بدء الحصة مجدداً" : "بدء الحصة"}</button>}{session.status === "active" && <><button className="postpone-btn" onClick={onPostpone}><PauseCircle size={18} /> تأجيل الحصة</button><button className="end-btn" onClick={onEnd}><Check size={18} /> إنهاء الحصة</button></>}</div></div><div className="financial-grid compact"><div><span>عدد الطلاب</span><strong>{session.studentIds.length}</strong></div><div><span>إجمالي الحصة</span><strong>{money(gross)}</strong></div><div><span>مستحق المدرس</span><strong>{money(teacherDue)}</strong></div><div className="highlight"><span>صافي السنتر</span><strong>{money(gross - teacherDue)}</strong></div></div>{session.status !== "ended" && <div className="student-search-wrap"><label>إضافة طالب للحصة</label><div className="search-box large"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم، رقم الهاتف أو ID" /></div>{candidates.length > 0 && <div className="search-results">{candidates.map((student) => <button key={student.id} onClick={() => { onAddStudent(student.id); setQuery(""); }}><span>{student.name.charAt(0)}</span><div><strong>{student.name}</strong><small>{student.id} · {student.phone}</small></div><Plus size={18} /></button>)}</div>}</div>}<div className="attendance-list"><div className="attendance-head"><h3>الطلاب الحاضرون</h3><span>{session.studentIds.length} طالب</span></div>{session.studentIds.map((studentId, index) => { const student = students.find((item) => item.id === studentId); return <div className="attendance-row" key={studentId}><span className="row-number">{index + 1}</span><span className="student-avatar">{student?.name.charAt(0)}</span><div><strong>{student?.name}</strong><small>{student?.id} · {student && gradeLabel(student.stage, student.grade)}</small></div><span className="paid-tag"><Check size={14} /> كاش</span><strong>{money(session.studentPrice)}</strong>{session.status !== "ended" && <button className="remove-student" onClick={() => onRemoveStudent(studentId)}><Trash2 size={17} /></button>}</div>; })}</div></div></Modal>;
}

function StudentRecordModal({ student, sessions, teachers, onClose }: { student: Student; sessions: LessonSession[]; teachers: Teacher[]; onClose: () => void }) {
  const history = sessions.filter((lesson) => lesson.studentIds.includes(student.id) && lesson.status === "ended");
  return <Modal title="سجل الطالب" subtitle={`${student.name} — ${student.id}`} onClose={onClose} wide><div className="modal-body"><div className="profile-strip"><span>{student.name.charAt(0)}</span><div><h3>{student.name}</h3><p>{student.phone} · {gradeLabel(student.stage, student.grade)}</p></div><div><strong>{history.length}</strong><small>حصة مكتملة</small></div><div><strong>{money(history.reduce((sum, lesson) => sum + lesson.studentPrice, 0))}</strong><small>إجمالي المدفوع</small></div></div><div className="timeline">{history.map((lesson) => <article key={lesson.id}><i /><div className="timeline-time"><strong>{lesson.date}</strong><span>{lesson.startedAt} — {lesson.endedAt}</span></div><div className="timeline-card"><div><h4>{lesson.subject}</h4><p>{teachers.find((teacher) => teacher.id === lesson.teacherId)?.name} · {gradeLabel(lesson.stage, lesson.grade)} · {lesson.room}</p></div><strong>{money(lesson.studentPrice)}</strong></div></article>)}</div>{!history.length && <EmptyState icon={<FileClock />} title="لا يوجد سجل حتى الآن" text="ستظهر حصص الطالب المنتهية هنا" />}</div></Modal>;
}

function TeacherRecordModal({ teacher, sessions, onClose }: { teacher: Teacher; sessions: LessonSession[]; onClose: () => void }) {
  const history = sessions.filter((lesson) => lesson.teacherId === teacher.id && lesson.status === "ended");
  return <Modal title="سجل حصص المدرس" subtitle={`${teacher.name} — ${teacher.id}`} onClose={onClose} wide><div className="modal-body"><div className="financial-grid compact"><div><span>الحصص المنتهية</span><strong>{history.length}</strong></div><div><span>إجمالي الحضور</span><strong>{history.reduce((sum, lesson) => sum + lesson.studentIds.length, 0)}</strong></div><div><span>إجمالي المستحق</span><strong>{money(history.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.teacherFee, 0))}</strong></div></div><div className="archive-list">{history.map((lesson) => <div key={lesson.id}><StatusPill status="ended" /><div><strong>{lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}</strong><small>{lesson.date} · {lesson.room}</small></div><span>{lesson.studentIds.length} طلاب</span><strong>{money(lesson.studentIds.length * lesson.teacherFee)}</strong></div>)}</div></div></Modal>;
}

function AdminPage({ tab, setTab, pricing, setPricing, sessions, students, teachers, audit, subjectCatalog, setSubjectCatalog, showToast }: { tab: AdminTab; setTab: (tab: AdminTab) => void; pricing: PriceRule[]; setPricing: React.Dispatch<React.SetStateAction<PriceRule[]>>; sessions: LessonSession[]; students: Student[]; teachers: Teacher[]; audit: AuditEntry[]; subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; showToast: (message: string) => void }) {
  const tabs: { id: AdminTab; label: string; icon: typeof WalletCards }[] = [{ id: "pricing", label: "أسعار الحصص", icon: WalletCards }, { id: "archive", label: "أرشيف الحصص", icon: Archive }, { id: "analytics", label: "الإحصائيات", icon: BarChart3 }, { id: "audit", label: "سجل العمليات", icon: History }, { id: "settings", label: "الإعدادات", icon: Settings }];
  return <div className="admin-layout"><aside className="admin-nav">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={18} />{item.label}<ChevronLeft size={16} /></button>; })}</aside><section className="admin-content">{tab === "pricing" && <PricingPanel pricing={pricing} setPricing={setPricing} subjectCatalog={subjectCatalog} showToast={showToast} />}{tab === "archive" && <ArchivePanel sessions={sessions} students={students} teachers={teachers} />}{tab === "analytics" && <AnalyticsPanel sessions={sessions} teachers={teachers} />}{tab === "audit" && <AuditPanel audit={audit} />}{tab === "settings" && <SettingsPanel subjectCatalog={subjectCatalog} setSubjectCatalog={setSubjectCatalog} showToast={showToast} />}</section></div>;
}

function PricingPanel({ pricing, setPricing, subjectCatalog, showToast }: { pricing: PriceRule[]; setPricing: React.Dispatch<React.SetStateAction<PriceRule[]>>; subjectCatalog: Record<Stage, string[]>; showToast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PriceRule | null>(null);
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
  const closeEditor = () => { setOpen(false); setEditingRule(null); };
  return <section className="panel data-panel"><div className="data-toolbar"><div><h2>أسعار الحصص</h2><p>سعر الطالب وأجر المدرس لكل حضور حسب المرحلة والصف والمادة</p></div><button className="primary-btn" onClick={openNewRule}><Plus size={18} /> إضافة سعر</button></div><div className="table-wrap"><table><thead><tr><th>المرحلة</th><th>الصف</th><th>المادة</th><th>سعر الطالب</th><th>أجر المدرس / طالب</th><th>صافي السنتر / طالب</th><th /></tr></thead><tbody>{pricing.map((rule) => <tr key={rule.id}><td>{rule.stage}</td><td><strong>{rule.grade}</strong></td><td>{rule.subject}</td><td><span className="money-main">{money(rule.studentPrice)}</span></td><td>{money(rule.teacherFee)}</td><td><span className="profit-tag">{money(rule.studentPrice - rule.teacherFee)}</span></td><td><button className="table-icon" onClick={() => openEditRule(rule)} aria-label={`تعديل سعر ${rule.subject}`} title="تعديل السعر"><Edit3 size={17} /></button></td></tr>)}</tbody></table></div>{open && <Modal title={editingRule ? "تعديل سعر الحصة" : "إضافة قاعدة سعر"} subtitle={editingRule ? "التعديل يطبّق على الحصص الجديدة فقط" : "السعر الجديد يطبّق على الحصص القادمة فقط"} onClose={closeEditor}><form className="modal-body entity-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const studentPrice = Number(data.get("price")); const teacherFee = Number(data.get("fee")); if (teacherFee > studentPrice) { showToast("أجر المدرس لا يمكن أن يتجاوز سعر الطالب"); return; } const updatedRule = { id: editingRule?.id ?? String(Math.max(...pricing.map((rule) => Number(rule.id)), 0) + 1), stage: priceStage, grade: priceGrade, subject: priceSubject, studentPrice, teacherFee }; setPricing((current) => editingRule ? current.map((rule) => rule.id === editingRule.id ? updatedRule : rule) : [...current, updatedRule]); closeEditor(); showToast(editingRule ? "تم تحديث سعر الحصة" : "تمت إضافة السعر الجديد"); }}><label className="field">المرحلة<select value={priceStage} onChange={(event) => { const stage = event.target.value as Stage; setPriceStage(stage); setPriceGrade(gradesByStage[stage][0]); setPriceSubject(subjectCatalog[stage][0]); }}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label className="field">الصف<select name="grade" value={priceGrade} onChange={(event) => setPriceGrade(event.target.value)}>{gradesByStage[priceStage].map((grade) => <option key={grade}>{grade}</option>)}</select></label><label className="field">المادة<select name="subject" value={priceSubject} onChange={(event) => setPriceSubject(event.target.value)}>{subjectCatalog[priceStage].map((subject) => <option key={subject}>{subject}</option>)}</select></label><label className="field">سعر الطالب<input name="price" type="number" min="0" defaultValue={editingRule?.studentPrice} required /></label><label className="field">أجر المدرس لكل طالب<input name="fee" type="number" min="0" defaultValue={editingRule?.teacherFee} required /></label><button className="primary-btn full" type="submit">{editingRule ? "حفظ التعديلات" : "حفظ السعر"}</button></form></Modal>}</section>;
}

function ArchivePanel({ sessions, students, teachers }: { sessions: LessonSession[]; students: Student[]; teachers: Teacher[] }) {
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedLesson, setSelectedLesson] = useState<LessonSession | null>(null);
  const teacherName = (id: string) => teachers.find((teacher) => teacher.id === id)?.name ?? "مدرس مؤرشف";
  const normalizedQuery = query.trim().toLowerCase();
  const history = sessions.filter((lesson) => lesson.status === "ended").filter((lesson) => {
    if (dateFilter && lesson.date !== dateFilter) return false;
    if (!normalizedQuery) return true;
    if (["اليوم", "النهاردة"].includes(normalizedQuery)) return lesson.date === todayIso();
    const dayName = new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(new Date(`${lesson.date}T12:00:00`));
    return [lesson.id, lesson.subject, lesson.stage, lesson.grade, lesson.room, lesson.date, dayName, teacherName(lesson.teacherId)].some((value) => value.toLowerCase().includes(normalizedQuery));
  });
  return <><section className="panel data-panel"><div className="data-toolbar archive-toolbar"><div><h2>أرشيف الحصص</h2><p>{history.length} حصة مطابقة · اضغط على أي حصة لعرض معلوماتها</p></div><div className="archive-filters"><div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اليوم، اسم المدرس أو المادة" /></div><label className="archive-date"><CalendarDays size={17} /><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="فلترة بتاريخ الحصة" /></label>{(query || dateFilter) && <button className="clear-filters" onClick={() => { setQuery(""); setDateFilter(""); }}><X size={16} /> مسح</button>}</div></div>{history.length ? <div className="archive-list detailed">{history.map((lesson) => { const gross = lesson.studentIds.length * lesson.studentPrice; const teacherDue = lesson.studentIds.length * lesson.teacherFee; return <button type="button" className="archive-row" key={lesson.id} onClick={() => setSelectedLesson(lesson)} aria-label={`فتح تفاصيل حصة ${lesson.subject}`}><StatusPill status="ended" /><div><strong>{lesson.subject} — {gradeLabel(lesson.stage, lesson.grade)}</strong><small>{teacherName(lesson.teacherId)} · {lesson.date} · {lesson.startedAt}–{lesson.endedAt}</small></div><span>{lesson.room}</span><span>{lesson.studentIds.length} طلاب</span><strong>{money(gross)}</strong><b>{money(gross - teacherDue)} صافي</b><ChevronLeft size={18} /></button>; })}</div> : <EmptyState icon={<Archive />} title="لا توجد حصص مطابقة" text="جرّب البحث باسم مدرس أو مادة، أو غيّر التاريخ" />}</section>{selectedLesson && <ArchivedSessionDetailsModal session={selectedLesson} students={students} teacherName={teacherName(selectedLesson.teacherId)} onClose={() => setSelectedLesson(null)} />}</>;
}

function ArchivedSessionDetailsModal({ session, students, teacherName, onClose }: { session: LessonSession; students: Student[]; teacherName: string; onClose: () => void }) {
  const gross = session.studentIds.length * session.studentPrice;
  const teacherDue = session.studentIds.length * session.teacherFee;
  return <Modal title="تفاصيل الحصة المؤرشفة" subtitle={`${session.id} · ${session.date} · ${session.room}`} onClose={onClose} wide><div className="modal-body archive-details"><div className="archive-detail-head"><div><StatusPill status="ended" /><h3>{session.subject} — {gradeLabel(session.stage, session.grade)}</h3><p>{teacherName} · من {session.startedAt} إلى {session.endedAt}</p></div><span><ShieldCheck size={18} /> سجل مالي نهائي</span></div><div className="financial-grid"><div><span>عدد الطلاب</span><strong>{session.studentIds.length}</strong></div><div><span>إجمالي قيمة الحصة</span><strong>{money(gross)}</strong></div><div><span>مستحق المدرس</span><strong>{money(teacherDue)}</strong></div><div className="highlight"><span>صافي السنتر</span><strong>{money(gross - teacherDue)}</strong></div></div><div className="archive-unit-prices"><div><span>سعر الطالب</span><strong>{money(session.studentPrice)}</strong></div><div><span>أجر المدرس لكل طالب</span><strong>{money(session.teacherFee)}</strong></div><div><span>القاعة</span><strong>{session.room}</strong></div></div><div className="attendance-list"><div className="attendance-head"><h3>طلاب الحصة</h3><span>{session.studentIds.length} طالب</span></div>{session.studentIds.map((studentId, index) => { const student = students.find((item) => item.id === studentId); return <div className="attendance-row" key={studentId}><span className="row-number">{index + 1}</span><span className="student-avatar">{student?.name.charAt(0) ?? "—"}</span><div><strong>{student?.name ?? "طالب مؤرشف"}</strong><small>{studentId} · {student?.phone ?? "لا يوجد رقم"}</small></div><span className="paid-tag"><Check size={14} /> كاش</span><strong>{money(session.studentPrice)}</strong></div>; })}</div></div></Modal>;
}

function AnalyticsPanel({ sessions, teachers }: { sessions: LessonSession[]; teachers: Teacher[] }) {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("today");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | Stage>("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const ended = sessions.filter((lesson) => lesson.status === "ended");
  const now = new Date();
  const matchesPeriod = (lesson: LessonSession) => {
    if (period === "all") return true;
    if (period === "today") return lesson.date === todayIso();
    const lessonDate = new Date(`${lesson.date}T12:00:00`);
    if (period === "month") return lessonDate.getFullYear() === now.getFullYear() && lessonDate.getMonth() === now.getMonth();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const differenceInDays = Math.floor((today.getTime() - lessonDate.getTime()) / 86400000);
    return differenceInDays >= 0 && differenceInDays < 7;
  };
  const dimensionFiltered = ended.filter((lesson) => teacherFilter === "all" || lesson.teacherId === teacherFilter).filter((lesson) => subjectFilter === "all" || lesson.subject === subjectFilter).filter((lesson) => stageFilter === "all" || lesson.stage === stageFilter).filter((lesson) => gradeFilter === "all" || lesson.grade === gradeFilter);
  const filtered = dimensionFiltered.filter(matchesPeriod);
  const subjectOptions = Array.from(new Set(ended.map((lesson) => lesson.subject)));
  const gradeOptions = Array.from(new Set(ended.filter((lesson) => stageFilter === "all" || lesson.stage === stageFilter).map((lesson) => lesson.grade)));
  const gross = filtered.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.studentPrice, 0);
  const teacherDue = filtered.reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.teacherFee, 0);
  const net = gross - teacherDue;
  const attendance = filtered.reduce((sum, lesson) => sum + lesson.studentIds.length, 0);
  const averageAttendance = filtered.length ? attendance / filtered.length : 0;
  const averageRevenue = filtered.length ? gross / filtered.length : 0;
  const margin = gross ? (net / gross) * 100 : 0;
  const bySubject = Array.from(new Set(filtered.map((lesson) => lesson.subject))).map((subject) => ({ label: subject, value: filtered.filter((lesson) => lesson.subject === subject).reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.studentPrice, 0) })).sort((a, b) => b.value - a.value);
  const byStage = stages.map((stage) => ({ label: stage.replace("المرحلة ", ""), value: filtered.filter((lesson) => lesson.stage === stage).reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.studentPrice, 0) })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const teacherRank = teachers.map((teacher) => ({ teacher, sessions: filtered.filter((lesson) => lesson.teacherId === teacher.id).length, attendance: filtered.filter((lesson) => lesson.teacherId === teacher.id).reduce((sum, lesson) => sum + lesson.studentIds.length, 0), revenue: filtered.filter((lesson) => lesson.teacherId === teacher.id).reduce((sum, lesson) => sum + lesson.studentIds.length * lesson.studentPrice, 0) })).filter((item) => item.sessions > 0).sort((a, b) => b.revenue - a.revenue);
  const monthlyMap = new Map<string, { key: string; label: string; sessions: number; attendance: number; gross: number; teacherDue: number; net: number }>();
  dimensionFiltered.forEach((lesson) => {
    const key = lesson.date.slice(0, 7);
    const current = monthlyMap.get(key) ?? { key, label: new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(`${key}-01T12:00:00`)), sessions: 0, attendance: 0, gross: 0, teacherDue: 0, net: 0 };
    const lessonGross = lesson.studentIds.length * lesson.studentPrice;
    const lessonTeacherDue = lesson.studentIds.length * lesson.teacherFee;
    current.sessions += 1;
    current.attendance += lesson.studentIds.length;
    current.gross += lessonGross;
    current.teacherDue += lessonTeacherDue;
    current.net += lessonGross - lessonTeacherDue;
    monthlyMap.set(key, current);
  });
  const monthlyAnalysis = Array.from(monthlyMap.values()).sort((a, b) => b.key.localeCompare(a.key));
  const maxSubject = Math.max(...bySubject.map((item) => item.value), 1);
  const maxStage = Math.max(...byStage.map((item) => item.value), 1);
  const resetFilters = () => { setTeacherFilter("all"); setSubjectFilter("all"); setStageFilter("all"); setGradeFilter("all"); };
  const periodLabel = { today: "اليوم", week: "آخر 7 أيام", month: "هذا الشهر", all: "كل الفترات" }[period];
  return <div className="analytics-stack"><section className="panel analytics-control-panel"><div><span className="section-kicker">نطاق التحليل</span><h2>إحصائيات {periodLabel}</h2></div><div className="analytics-period">{([{ id: "today", label: "اليوم" }, { id: "week", label: "7 أيام" }, { id: "month", label: "الشهر" }, { id: "all", label: "الكل" }] as const).map((item) => <button key={item.id} className={period === item.id ? "active" : ""} onClick={() => setPeriod(item.id)}>{item.label}</button>)}</div></section><section className="panel analytics-filter-panel"><div className="analytics-filter-head"><div><h3>فلترة التحليل والجدول</h3><p>كل المؤشرات والرسوم والجدول تتحدث مع الفلاتر</p></div>{(teacherFilter !== "all" || subjectFilter !== "all" || stageFilter !== "all" || gradeFilter !== "all") && <button className="clear-filters" onClick={resetFilters}><X size={16} /> مسح الفلاتر</button>}</div><div className="analytics-filter-grid"><label className="field">المدرس<select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="all">كل المدرسين</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label><label className="field">المادة<select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">كل المواد</option>{subjectOptions.map((subject) => <option key={subject}>{subject}</option>)}</select></label><label className="field">المرحلة<select value={stageFilter} onChange={(event) => { setStageFilter(event.target.value as "all" | Stage); setGradeFilter("all"); }}><option value="all">كل المراحل</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label className="field">الصف<select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)}><option value="all">كل الصفوف</option>{gradeOptions.map((grade) => <option key={grade}>{grade}</option>)}</select></label></div></section><div className="analytics-kpi-grid"><article><span><CalendarDays size={20} /></span><div><small>الحصص المنتهية</small><strong>{filtered.length}</strong><em>{periodLabel}</em></div></article><article><span><Users size={20} /></span><div><small>إجمالي الحضور</small><strong>{attendance}</strong><em>كل حضور محسوب</em></div></article><article><span><CircleDollarSign size={20} /></span><div><small>إجمالي قيمة الحصص</small><strong>{money(gross)}</strong><em>قبل مستحق المدرس</em></div></article><article><span><WalletCards size={20} /></span><div><small>مستحقات المدرسين</small><strong>{money(teacherDue)}</strong><em>عن الطلاب الحاضرين</em></div></article><article className="net-card"><span><TrendingUp size={20} /></span><div><small>صافي ربح السنتر</small><strong>{money(net)}</strong><em>هامش {margin.toFixed(1)}٪</em></div></article><article><span><BarChart3 size={20} /></span><div><small>متوسط الحضور / حصة</small><strong>{averageAttendance.toFixed(1)}</strong><em>متوسط الإيراد {money(averageRevenue)}</em></div></article></div><div className="analytics-grid"><section className="panel"><div className="panel-head"><div><span className="section-kicker">مقارنة المواد</span><h2>الدخل حسب المادة</h2></div></div>{bySubject.length ? <div className="horizontal-chart">{bySubject.map((item) => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.value / maxSubject) * 100}%` }} /></div><strong>{money(item.value)}</strong></div>)}</div> : <EmptyState icon={<BarChart3 />} title="لا توجد بيانات" text="غيّر الفلاتر لعرض المقارنة" />}</section><section className="panel"><div className="panel-head"><div><span className="section-kicker">مقارنة المراحل</span><h2>الدخل حسب المرحلة</h2></div></div>{byStage.length ? <div className="horizontal-chart stage-chart">{byStage.map((item) => <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${(item.value / maxStage) * 100}%` }} /></div><strong>{money(item.value)}</strong></div>)}</div> : <EmptyState icon={<GraduationCap />} title="لا توجد بيانات" text="لا توجد حصص منتهية ضمن الاختيار" />}</section></div><section className="panel"><div className="panel-head"><div><span className="section-kicker">أداء المدرسين</span><h2>ترتيب المدرسين حسب قيمة الحصص</h2></div></div>{teacherRank.length ? <div className="ranking-list wide-ranking">{teacherRank.map((item, index) => <div key={item.teacher.id}><b>{index + 1}</b><span>{item.teacher.name.replace("أ/ ", "").charAt(0)}</span><div><strong>{item.teacher.name}</strong><small>{item.sessions} حصة · {item.attendance} حضور</small></div><em>{money(item.revenue)}</em></div>)}</div> : <EmptyState icon={<GraduationCap />} title="لا توجد نتائج للمدرسين" text="غيّر الفترة أو الفلاتر" />}</section><section className="panel data-panel monthly-analysis-panel"><div className="data-toolbar"><div><span className="section-kicker">تحليل شهري</span><h2>مقارنة أداء الشهور</h2><p>يتأثر بفلاتر المدرس والمادة والمرحلة والصف، ويعرض كل الشهور المسجلة</p></div></div>{monthlyAnalysis.length ? <div className="table-wrap"><table><thead><tr><th>الشهر</th><th>الحصص</th><th>الحضور</th><th>إجمالي الدخل</th><th>مستحق المدرسين</th><th>صافي السنتر</th><th>هامش السنتر</th></tr></thead><tbody>{monthlyAnalysis.map((month) => <tr key={month.key}><td><strong>{month.label}</strong></td><td>{month.sessions}</td><td>{month.attendance}</td><td>{money(month.gross)}</td><td>{money(month.teacherDue)}</td><td><span className="profit-tag">{money(month.net)}</span></td><td>{month.gross ? ((month.net / month.gross) * 100).toFixed(1) : "0.0"}٪</td></tr>)}</tbody></table></div> : <EmptyState icon={<CalendarDays />} title="لا توجد بيانات شهرية" text="ستظهر مقارنة الشهور بعد إنهاء الحصص" />}</section><section className="panel data-panel analysis-table-panel"><div className="data-toolbar"><div><h2>جدول تحليل الحصص</h2><p>{filtered.length} حصة · يمكنك تغيير النتائج من الفلاتر بالأعلى</p></div></div>{filtered.length ? <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المدرس</th><th>المرحلة والصف</th><th>المادة</th><th>الحضور</th><th>إجمالي الحصة</th><th>مستحق المدرس</th><th>صافي السنتر</th><th>الهامش</th></tr></thead><tbody>{filtered.slice().sort((a, b) => b.date.localeCompare(a.date)).map((lesson) => { const lessonGross = lesson.studentIds.length * lesson.studentPrice; const lessonTeacherDue = lesson.studentIds.length * lesson.teacherFee; const lessonNet = lessonGross - lessonTeacherDue; return <tr key={lesson.id}><td><strong>{lesson.date}</strong><small>{lesson.startedAt}–{lesson.endedAt}</small></td><td>{teachers.find((teacher) => teacher.id === lesson.teacherId)?.name ?? "مدرس مؤرشف"}</td><td><strong>{lesson.stage}</strong><small>{lesson.grade}</small></td><td>{lesson.subject}</td><td><span className="attendance-badge">{lesson.studentIds.length} طالب</span></td><td>{money(lessonGross)}</td><td>{money(lessonTeacherDue)}</td><td><span className="profit-tag">{money(lessonNet)}</span></td><td>{lessonGross ? ((lessonNet / lessonGross) * 100).toFixed(1) : "0.0"}٪</td></tr>; })}</tbody><tfoot><tr><td colSpan={4}>إجمالي النتائج</td><td>{attendance} حضور</td><td>{money(gross)}</td><td>{money(teacherDue)}</td><td>{money(net)}</td><td>{margin.toFixed(1)}٪</td></tr></tfoot></table></div> : <EmptyState icon={<BarChart3 />} title="لا توجد حصص مطابقة" text="غيّر الفترة أو أحد الفلاتر بالأعلى" />}</section><section className="insight-banner"><span><Sparkles size={24} /></span><div><strong>ملخص التحليل</strong><p>{filtered.length ? `${bySubject[0]?.label ?? "—"} هي الأعلى في قيمة الحصص، و${teacherRank[0]?.teacher.name ?? "—"} في صدارة المدرسين. متوسط صافي السنتر لكل حصة ${money(net / filtered.length)}.` : "لا توجد بيانات كافية ضمن الفلاتر الحالية. جرّب توسيع الفترة أو مسح الفلاتر."}</p></div></section></div>;
}

function AuditPanel({ audit }: { audit: AuditEntry[] }) {
  return <section className="panel data-panel"><div className="data-toolbar"><div><h2>سجل العمليات</h2><p>تتبع كل التغييرات المهمة داخل النظام</p></div><span className="secure-chip"><ShieldCheck size={17} /> سجل محمي</span></div><div className="audit-list">{audit.map((entry) => <div key={entry.id}><span className={entry.tone}><History size={18} /></span><div><strong>{entry.action}</strong><p>{entry.details}</p></div><time>{entry.time}</time></div>)}</div></section>;
}

function SettingsPanel({ subjectCatalog, setSubjectCatalog, showToast }: { subjectCatalog: Record<Stage, string[]>; setSubjectCatalog: React.Dispatch<React.SetStateAction<Record<Stage, string[]>>>; showToast: (message: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [subjectStage, setSubjectStage] = useState<Stage>("المرحلة الإعدادية");
  const [newSubject, setNewSubject] = useState("");
  return <div className="settings-stack"><section className="panel settings-section"><div className="settings-icon"><LockKeyhole size={21} /></div><div className="settings-copy"><h3>بيانات الدخول</h3><p>تغيير اسم المستخدم أو كلمة المرور للإدارة</p></div><form onSubmit={(event) => { event.preventDefault(); showToast("تم تحديث بيانات الدخول"); }}><label className="field">اسم المستخدم<input value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="field">كلمة المرور الجديدة<input type="password" placeholder="اتركها فارغة بدون تغيير" /></label><button className="primary-btn" type="submit">حفظ التغييرات</button></form></section><section className="panel settings-section"><div className="settings-icon rooms"><BookOpen size={21} /></div><div className="settings-copy"><h3>قاعات السنتر</h3><p>القاعات المتاحة عند إنشاء الحصة</p></div><div className="room-settings">{rooms.map((room) => <span key={room}><i />{room}<Edit3 size={15} /></span>)}</div></section><section className="panel settings-section subjects-section"><div className="settings-icon subjects"><BookOpen size={21} /></div><div className="settings-copy"><h3>مواد كل مرحلة</h3><p>المواد هنا تظهر تلقائياً عند إضافة مدرس أو تحديد سعر جديد</p></div><div className="subject-settings"><label className="field">المرحلة<select value={subjectStage} onChange={(event) => setSubjectStage(event.target.value as Stage)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><div className="subject-tags">{subjectCatalog[subjectStage].map((subject) => <span key={subject}>{subject}</span>)}</div><form onSubmit={(event) => { event.preventDefault(); const value = newSubject.trim(); if (!value) return; if (subjectCatalog[subjectStage].includes(value)) { showToast("المادة موجودة بالفعل في هذه المرحلة"); return; } setSubjectCatalog((current) => ({ ...current, [subjectStage]: [...current[subjectStage], value] })); setNewSubject(""); showToast("تمت إضافة المادة للمرحلة"); }}><label className="field">مادة جديدة<input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} placeholder="اكتب اسم المادة" /></label><button className="primary-btn" type="submit"><Plus size={17} /> إضافة المادة</button></form></div></section><section className="cloud-card"><ShieldCheck size={26} /><div><h3>قاعدة البيانات السحابية</h3><p>المشروع مجهز للاتصال بـSupabase PostgreSQL، بدون تخزين قاعدة بيانات على جهاز السنتر.</p></div><span>جاهز للربط</span></section></div>;
}
