import React, { useState, useEffect, useRef } from 'react';
import { 
  Heart, 
  Activity, 
  Utensils, 
  Pill, 
  Plus, 
  Camera, 
  History, 
  AlertCircle, 
  CheckCircle2,
  ChevronRight,
  LogOut,
  User as UserIcon,
  MessageSquare,
  Bell,
  Trash2,
  Settings,
  Edit2,
  Edit3,
  Save,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  isToday, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isSameYear
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  Home,
  Calendar as CalendarIcon,
  CheckSquare,
  Circle,
  ClipboardList,
  ChevronLeft,
  ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout 
} from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs,
  setDoc,
  deleteDoc,
  Timestamp,
  limit
} from 'firebase/firestore';
import { analyzeFood, analyzeReadingImage, getHealthAdvice } from './lib/gemini';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Browser Notifications
const requestNotificationPermission = async () => {
  if (typeof Notification === 'undefined') {
    console.log("This browser does not support desktop notification");
    return 'unsupported';
  }
  
  if (Notification.permission === "granted") return 'granted';
  
  const permission = await Notification.requestPermission();
  return permission;
};

const sendBrowserNotification = (title: string, body: string) => {
  if (typeof Notification !== 'undefined' && Notification.permission === "granted") {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
};

// Error Handling
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
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const BottomNav = ({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) => {
  const tabs = [
    { id: 'home', label: '홈', icon: Home },
    { id: 'calendar', label: '캘린더', icon: CalendarIcon },
    { id: 'todo', label: '할일', icon: CheckSquare },
    { id: 'notifications', label: '알림', icon: Bell },
    { id: 'profile', label: '프로필', icon: UserIcon },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-3 z-50 flex justify-between items-center shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              isActive ? "text-medical-blue" : "text-slate-400"
            )}
          >
            <div className={cn(
              "p-2 rounded-2xl transition-all",
              isActive ? "bg-blue-50" : "bg-transparent"
            )}>
              <Icon className={cn("w-7 h-7", isActive ? "fill-medical-blue/10" : "")} />
            </div>
            <span className="text-xs font-black font-display">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const Calendar = ({ readings, meds, foodLogs }: { readings: any[]; meds: any[]; foodLogs: any[] }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getDayRecords = (day: Date) => {
    const dayReadings = readings.filter(r => isSameDay(new Date(r.timestamp), day));
    const dayFood = foodLogs.filter(f => isSameDay(new Date(f.timestamp), day));
    // Meds are a bit different, they are daily. Let's assume meds in state are current.
    // For a real calendar, we'd need a history of taken meds.
    return { readings: dayReadings, food: dayFood };
  };

  const selectedDayRecords = selectedDate ? getDayRecords(selectedDate) : { readings: [], food: [] };

  return (
    <div className="space-y-8 pb-10">
      <Card className="p-0 overflow-hidden border-none shadow-2xl">
        <div className="p-8 bg-white flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-medical-blue rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 font-display tracking-tighter">
              {format(currentMonth, 'yyyy년 M월', { locale: ko })}
            </h2>
          </div>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors text-slate-400">
              <ChevronLeft className="w-8 h-8" />
            </button>
            <button onClick={nextMonth} className="p-3 hover:bg-slate-50 rounded-2xl transition-colors text-slate-400">
              <ChevronRightIcon className="w-8 h-8" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 bg-slate-50/50">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div key={day} className={cn(
              "py-4 text-center text-sm font-black uppercase tracking-widest",
              i === 0 ? "text-rose-500" : i === 6 ? "text-medical-blue" : "text-slate-400"
            )}>
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-t border-slate-100">
          {calendarDays.map((day, i) => {
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDay = isToday(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const records = getDayRecords(day);
            const hasReadings = records.readings.length > 0;
            const hasFood = records.food.length > 0;

            return (
              <button
                key={day.toString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "relative aspect-square p-2 border-r border-b border-slate-50 flex flex-col items-center justify-start transition-all hover:bg-blue-50/30",
                  !isCurrentMonth && "opacity-20",
                  isSelected && "bg-blue-50/50"
                )}
              >
                <span className={cn(
                  "w-10 h-10 flex items-center justify-center rounded-full text-xl font-black font-display transition-all",
                  isTodayDay ? "bg-medical-blue text-white shadow-lg shadow-blue-200" : 
                  isSelected ? "text-medical-blue" :
                  i % 7 === 0 ? "text-rose-500" : i % 7 === 6 ? "text-medical-blue" : "text-slate-900"
                )}>
                  {format(day, 'd')}
                </span>
                
                <div className="mt-auto flex flex-wrap justify-center gap-1 pb-1">
                  {hasReadings && (
                    <div className="w-1.5 h-1.5 rounded-full bg-medical-blue" />
                  )}
                  {hasFood && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDate && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-medical-blue rounded-full" />
            <h3 className="text-2xl font-black text-slate-900 font-display tracking-tight">
              {format(selectedDate, 'M월 d일 기록', { locale: ko })}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {selectedDayRecords.readings.length > 0 ? selectedDayRecords.readings.map((r: any) => (
              <Card key={r.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-xl">
                      {r.type === 'blood_pressure' ? <Heart className="w-5 h-5 text-medical-blue" /> : <Activity className="w-5 h-5 text-medical-blue" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{r.type === 'blood_pressure' ? '혈압' : '혈당'}</p>
                      <p className="text-2xl font-black text-slate-900 font-display">
                        {r.type === 'blood_pressure' ? `${r.systolic || 0}/${r.diastolic || 0}` : `${r.sugarLevel || 0}`}
                        <span className="text-sm ml-1 text-slate-400">{r.type === 'blood_pressure' ? 'mmHg' : 'mg/dL'}</span>
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-4 text-xs font-bold text-slate-300 flex items-center gap-1">
                  <History className="w-3 h-3" />
                  {format(new Date(r.timestamp), 'a h:mm', { locale: ko })}
                </p>
              </Card>
            )) : (
              <div className="md:col-span-2 py-10 text-center bg-white rounded-[32px] border-2 border-dashed border-slate-100">
                <p className="text-slate-400 font-bold">이 날의 건강 수치 기록이 없습니다</p>
              </div>
            )}

            {selectedDayRecords.food.length > 0 && selectedDayRecords.food.map((f: any) => (
              <Card key={f.id} className="p-6 flex gap-4">
                <img src={f.imageUrl} className="w-24 h-24 rounded-2xl object-cover shadow-md" />
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-full uppercase tracking-widest">Food Log</div>
                    <div className={cn(
                      "w-3 h-3 rounded-full",
                      f.rating === 'good' ? "bg-emerald-500" : f.rating === 'moderate' ? "bg-amber-500" : "bg-rose-500"
                    )} />
                  </div>
                  <p className="text-sm font-bold text-slate-600 line-clamp-2 leading-relaxed">{f.analysis}</p>
                  <p className="mt-2 text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    {format(new Date(f.timestamp), 'a h:mm', { locale: ko })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const TodoView = ({ todos, onToggle, onDelete, onAdd }: { todos: any[]; onToggle: (id: string, completed: boolean) => void; onDelete: (id: string) => void; onAdd: (task: string) => void }) => {
  const [newTask, setNewTask] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTask.trim()) {
      onAdd(newTask);
      setNewTask('');
    }
  };

  const defaultTasks = [
    "아침 약 복용하기",
    "30분 가벼운 산책",
    "충분한 수분 섭취",
    "저녁 혈압 측정"
  ];

  return (
    <div className="space-y-8 pb-10">
      <Card title="오늘의 건강 할 일" subtitle="Daily Health Checklist" icon={CheckSquare}>
        <form onSubmit={handleSubmit} className="flex gap-4 mb-8">
          <input 
            type="text" 
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="새로운 할 일을 입력하세요..."
            className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-lg font-bold focus:outline-none focus:border-medical-blue transition-all"
          />
          <Button type="submit" size="md">추가</Button>
        </form>

        <div className="space-y-4">
          {todos.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {todos.map((todo) => (
                <motion.div 
                  key={todo.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "flex items-center justify-between p-6 rounded-3xl border-2 transition-all",
                    todo.completed ? "bg-slate-50 border-slate-100 opacity-60" : "bg-white border-slate-50 shadow-sm hover:shadow-md"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={() => onToggle(todo.id, todo.completed)}>
                    <div className={cn(
                      "w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all",
                      todo.completed ? "bg-emerald-500 border-emerald-500" : "border-slate-200"
                    )}>
                      {todo.completed && <CheckCircle2 className="w-5 h-5 text-white" />}
                    </div>
                    <span className={cn(
                      "text-xl font-bold font-display",
                      todo.completed ? "line-through text-slate-400" : "text-slate-900"
                    )}>
                      {todo.task}
                    </span>
                  </div>
                  <button onClick={() => onDelete(todo.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                    <Trash2 className="w-6 h-6" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <div className="py-12 px-8 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
              <p className="text-slate-400 text-xl font-bold mb-6">아직 할 일이 없습니다.</p>
              <div className="flex flex-wrap justify-center gap-3">
                {defaultTasks.map(task => (
                  <button 
                    key={task}
                    onClick={() => onAdd(task)}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-500 hover:border-medical-blue hover:text-medical-blue transition-all"
                  >
                    + {task}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const NotificationView = ({ notifications, onRead, onReadAll }: { notifications: any[]; onRead: (id: string) => void; onReadAll: () => void }) => {
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-8 pb-10">
      <Card 
        title="알림 센터" 
        subtitle="Health Alerts & Reminders" 
        icon={Bell}
      >
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 bg-blue-50 text-medical-blue text-xs font-black rounded-full uppercase tracking-widest">
              {unreadCount} New
            </div>
          </div>
          {unreadCount > 0 && (
            <button 
              onClick={onReadAll}
              className="text-sm font-black text-medical-blue hover:underline uppercase tracking-widest"
            >
              모두 읽음 표시
            </button>
          )}
        </div>

        <div className="space-y-4">
          {notifications.length > 0 ? (
            <AnimatePresence mode="popLayout">
              {notifications.map((notif) => (
                <motion.div 
                  key={notif.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => !notif.read && onRead(notif.id)}
                  className={cn(
                    "p-6 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden",
                    notif.read ? "bg-white border-slate-50 opacity-70" : "bg-blue-50 border-blue-100 shadow-lg shadow-blue-50"
                  )}
                >
                  {!notif.read && <div className="absolute top-0 left-0 w-1.5 h-full bg-medical-blue" />}
                  <div className="flex gap-4">
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0",
                      notif.type === 'alert' ? "bg-rose-100 text-rose-600" : 
                      notif.type === 'reminder' ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {notif.type === 'alert' ? <AlertCircle className="w-8 h-8" /> : <Bell className="w-8 h-8" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-xl font-black text-slate-900 font-display">{notif.title}</h4>
                        <span className="text-xs font-bold text-slate-400">{format(new Date(notif.timestamp), 'a h:mm', { locale: ko })}</span>
                      </div>
                      <p className="text-slate-600 font-bold leading-relaxed">{notif.message}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-100">
              <p className="text-slate-400 text-xl font-bold">새로운 알림이 없습니다</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

const ProfileView = ({ user, onLogout }: { user: User; onLogout: () => void }) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    emergencyContact: '',
    bpTargetSystolic: 120,
    bpTargetDiastolic: 80,
    sugarTargetFasting: 100,
    sugarTargetPostMeal: 140
  });
  const [isSaving, setIsSaving] = useState(false);

  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  useEffect(() => {
    const fetchProfile = async () => {
      const q = query(collection(db, 'users'), where('uid', '==', user.uid));
      const docSnap = await getDocs(q);
      if (!docSnap.empty) {
        const data = docSnap.docs[0].data();
        setProfileData(data);
        setEditForm({
          displayName: data.displayName || user.displayName || '',
          emergencyContact: data.emergencyContact || '',
          bpTargetSystolic: data.bpTargetSystolic || 120,
          bpTargetDiastolic: data.bpTargetDiastolic || 80,
          sugarTargetFasting: data.sugarTargetFasting || 100,
          sugarTargetPostMeal: data.sugarTargetPostMeal || 140
        });
      } else {
        // Initialize with defaults if no doc exists
        setEditForm({
          displayName: user.displayName || '',
          emergencyContact: '',
          bpTargetSystolic: 120,
          bpTargetDiastolic: 80,
          sugarTargetFasting: 100,
          sugarTargetPostMeal: 140
        });
      }
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updatedData = {
        ...editForm,
        uid: user.uid,
        email: user.email,
        updatedAt: new Date().toISOString()
      };
      await setDoc(userDocRef, updatedData, { merge: true });
      setProfileData(updatedData);
      setIsEditing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <Card className="p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-medical-blue p-12 text-white relative overflow-hidden">
          <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="w-32 h-32 bg-white/20 rounded-[40px] backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-2xl">
                <UserIcon className="w-16 h-16 text-white" />
              </div>
              <div>
                <h2 className="text-5xl font-black font-display tracking-tighter mb-2">{profileData?.displayName || user.displayName || '사용자'}</h2>
                <p className="text-xl font-bold opacity-70">{user.email}</p>
              </div>
            </div>
            {!isEditing && (
              <button 
                onClick={() => setIsEditing(true)}
                className="p-4 bg-white/20 hover:bg-white/30 rounded-3xl backdrop-blur-md transition-all border border-white/30"
              >
                <Edit2 className="w-8 h-8 text-white" />
              </button>
            )}
          </div>
        </div>

        <div className="p-10 space-y-12">
          {isEditing ? (
            <div className="space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-medical-blue rounded-full" />
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest">기본 정보 수정</label>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">이름</label>
                      <input 
                        type="text"
                        value={editForm.displayName}
                        onChange={(e) => setEditForm({...editForm, displayName: e.target.value})}
                        className="w-full p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 focus:border-medical-blue outline-none font-black text-xl transition-all"
                        placeholder="이름을 입력하세요"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">비상 연락처</label>
                      <input 
                        type="text"
                        value={editForm.emergencyContact}
                        onChange={(e) => setEditForm({...editForm, emergencyContact: e.target.value})}
                        className="w-full p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 focus:border-medical-blue outline-none font-black text-xl transition-all"
                        placeholder="가족 연락처 (예: 010-1234-5678)"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest">건강 목표 설정</label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">목표 수축기 (높은혈압)</label>
                      <input 
                        type="number"
                        value={editForm.bpTargetSystolic}
                        onChange={(e) => setEditForm({...editForm, bpTargetSystolic: parseInt(e.target.value) || 0})}
                        className="w-full p-6 bg-blue-50 rounded-3xl border-2 border-blue-100 focus:border-medical-blue outline-none font-black text-xl transition-all text-medical-blue"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">목표 이완기 (낮은혈압)</label>
                      <input 
                        type="number"
                        value={editForm.bpTargetDiastolic}
                        onChange={(e) => setEditForm({...editForm, bpTargetDiastolic: parseInt(e.target.value) || 0})}
                        className="w-full p-6 bg-blue-50 rounded-3xl border-2 border-blue-100 focus:border-medical-blue outline-none font-black text-xl transition-all text-medical-blue"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">목표 혈당 (공복)</label>
                      <input 
                        type="number"
                        value={editForm.sugarTargetFasting}
                        onChange={(e) => setEditForm({...editForm, sugarTargetFasting: parseInt(e.target.value) || 0})}
                        className="w-full p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100 focus:border-emerald-500 outline-none font-black text-xl transition-all text-emerald-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">목표 혈당 (식후)</label>
                      <input 
                        type="number"
                        value={editForm.sugarTargetPostMeal}
                        onChange={(e) => setEditForm({...editForm, sugarTargetPostMeal: parseInt(e.target.value) || 0})}
                        className="w-full p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-100 focus:border-emerald-500 outline-none font-black text-xl transition-all text-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="flex-1 rounded-[32px]" 
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  <X className="w-6 h-6" />
                  취소
                </Button>
                <Button 
                  variant="primary" 
                  size="lg" 
                  className="flex-[2] rounded-[32px]" 
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-6 h-6" />
                  )}
                  저장하기
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Notification Settings */}
              <div className="bg-blue-50/50 p-8 rounded-[40px] border-2 border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
                    <Bell className="w-8 h-8 text-medical-blue" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-900 font-display leading-tight">실시간 푸시 알림</h4>
                    <p className="text-lg font-bold text-slate-400">위험 수치 감지 시 즉시 알림을 받습니다</p>
                  </div>
                </div>
                  <button 
                    onClick={async () => {
                      const permission = await requestNotificationPermission();
                      setNotificationPermission(permission);
                      if (permission === 'granted') {
                        sendBrowserNotification("알림 설정 완료", "이제 실시간 건강 알림을 받으실 수 있습니다.");
                      }
                    }}
                    disabled={notificationPermission === 'unsupported'}
                    className={cn(
                      "px-8 py-4 rounded-2xl font-black text-lg transition-all shadow-lg",
                      notificationPermission === 'granted' 
                        ? "bg-emerald-500 text-white shadow-emerald-100" 
                        : notificationPermission === 'unsupported'
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-medical-blue text-white shadow-blue-100 hover:scale-105"
                    )}
                  >
                    {notificationPermission === 'granted' ? '알림 활성화됨' : 
                     notificationPermission === 'unsupported' ? '알림 미지원 브라우저' : '알림 권한 요청'}
                  </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-slate-200 rounded-full" />
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest">기본 정보</label>
                  </div>
                  <div className="space-y-4">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">이름</p>
                      <p className="text-xl font-black text-slate-900">{profileData?.displayName || user.displayName || '미설정'}</p>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">비상 연락처</p>
                      <p className="text-xl font-black text-slate-900">{profileData?.emergencyContact || '미등록'}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-medical-blue rounded-full" />
                    <label className="text-sm font-black text-slate-400 uppercase tracking-widest">건강 관리 목표</label>
                  </div>
                  <div className="space-y-4">
                    <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                      <p className="text-xs font-black text-medical-blue uppercase tracking-widest mb-1">목표 혈압</p>
                      <p className="text-xl font-black text-medical-blue">
                        {profileData?.bpTargetSystolic || 120} / {profileData?.bpTargetDiastolic || 80} 
                        <span className="text-sm font-bold opacity-60 ml-2">mmHg</span>
                      </p>
                    </div>
                    <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                      <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">목표 혈당 (공복)</p>
                      <p className="text-xl font-black text-emerald-600">
                        {profileData?.sugarTargetFasting || 100} 
                        <span className="text-sm font-bold opacity-60 ml-2">mg/dL 미만</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-10 border-t border-slate-100 flex flex-col gap-4">
                <Button variant="outline" size="lg" className="w-full justify-start gap-5 p-8 rounded-[32px]">
                  <Settings className="w-8 h-8 text-slate-400" />
                  <div className="text-left">
                    <p className="text-xl font-black text-slate-900 font-display">알림 및 환경 설정</p>
                    <p className="text-sm font-bold text-slate-400">측정 알림 및 소리 설정</p>
                  </div>
                </Button>
                <Button variant="danger" size="lg" className="w-full justify-start gap-5 p-8 rounded-[32px]" onClick={onLogout}>
                  <LogOut className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xl font-black font-display">로그아웃</p>
                    <p className="text-sm font-bold opacity-70">안전하게 계정 연결 해제</p>
                  </div>
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
      <div className="text-center space-y-2">
        <p className="text-slate-300 font-black text-xs uppercase tracking-[0.2em]">Clinical Grade Health Monitoring</p>
        <p className="text-slate-200 font-bold text-[10px]">Version 1.2.5 • AI Medical Assistant Active</p>
      </div>
    </div>
  );
};

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  type = 'button',
  size = 'md'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) => {
  const variants = {
    primary: 'bg-medical-blue text-white hover:bg-medical-dark shadow-lg shadow-blue-200 active:scale-95',
    secondary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200 active:scale-95',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200 active:scale-95',
    outline: 'border-2 border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95',
    ghost: 'text-slate-600 hover:bg-slate-100'
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm font-semibold',
    md: 'px-6 py-3 text-base font-bold',
    lg: 'px-8 py-4 text-xl font-black tracking-tight',
    xl: 'px-10 py-6 text-3xl font-black tracking-tighter'
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      type={type}
      className={cn(
        'rounded-3xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed font-display',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, title, icon: Icon, subtitle, action }: { children: React.ReactNode; className?: string; title?: string; icon?: any; subtitle?: string; action?: React.ReactNode }) => (
  <div className={cn('bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8', className)}>
    {title && (
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-50 rounded-2xl">
            {Icon && <Icon className="w-6 h-6 text-medical-blue" />}
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 font-display leading-none">{title}</h3>
            {subtitle && <p className="text-sm font-medium text-slate-400 mt-1">{subtitle}</p>}
          </div>
        </div>
        {action && <div>{action}</div>}
      </div>
    )}
    {children}
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
        />
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 40 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.95, opacity: 0, y: 40 }}
          className="relative bg-white rounded-[48px] shadow-2xl w-full max-w-xl overflow-hidden border border-white/20"
        >
          <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h2 className="text-3xl font-black text-slate-900 font-display tracking-tight">{title}</h2>
            <button onClick={onClose} className="p-3 hover:bg-slate-200 rounded-full transition-colors">
              <Plus className="w-10 h-10 rotate-45 text-slate-400" />
            </button>
          </div>
          <div className="p-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const StatusBadge = ({ status }: { status: 'normal' | 'warning' | 'danger' }) => {
  const configs = {
    normal: { label: '안정적', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: CheckCircle2, glow: 'status-glow-normal' },
    warning: { label: '주의 필요', color: 'bg-amber-50 text-amber-700 border-amber-100', icon: AlertCircle, glow: 'status-glow-warning' },
    danger: { label: '위험 관리', color: 'bg-rose-50 text-rose-700 border-rose-100', icon: AlertCircle, glow: 'status-glow-danger' }
  };
  const { label, color, icon: Icon, glow } = configs[status];
  return (
    <div className={cn('px-4 py-1.5 rounded-full text-sm font-black border flex items-center gap-2 w-fit font-display uppercase tracking-wider', color, glow)}>
      <Icon className="w-4 h-4" />
      {label}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [readings, setReadings] = useState<any[]>([]);
  const [meds, setMeds] = useState<any[]>([]);
  const [foodLogs, setFoodLogs] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [advice, setAdvice] = useState<string>('기록을 시작하면 국민 건강 비서가 조언을 드립니다.');
  const [activeTab, setActiveTab] = useState('home');
  
  // Modals
  const [isReadingModalOpen, setIsReadingModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isMedModalOpen, setIsMedModalOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'ocr' | 'food'>('ocr');
  
  // Form States
  const [readingType, setReadingType] = useState<'blood_pressure' | 'blood_sugar'>('blood_pressure');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [sugarLevel, setSugarLevel] = useState('');
  const [isFasting, setIsFasting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTime, setMedTime] = useState('');
  const [editingMedId, setEditingMedId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch Readings
    const qReadings = query(
      collection(db, 'readings'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(100) // Increased limit for calendar
    );
    const unsubReadings = onSnapshot(qReadings, (snapshot) => {
      setReadings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'readings'));

    // Fetch Meds
    const qMeds = query(collection(db, 'medications'), where('uid', '==', user.uid));
    const unsubMeds = onSnapshot(qMeds, (snapshot) => {
      setMeds(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'medications'));

    // Fetch Food Logs
    const qFood = query(
      collection(db, 'foodLogs'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50) // Increased limit for calendar
    );
    const unsubFood = onSnapshot(qFood, (snapshot) => {
      setFoodLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'foodLogs'));

    // Fetch Todos
    const qTodos = query(
      collection(db, 'todos'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubTodos = onSnapshot(qTodos, (snapshot) => {
      setTodos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'todos'));

    // Fetch Notifications
    const qNotifs = query(
      collection(db, 'notifications'),
      where('uid', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubNotifs = onSnapshot(qNotifs, (snapshot) => {
      setNotifications(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'notifications'));

    return () => {
      unsubReadings();
      unsubMeds();
      unsubFood();
      unsubTodos();
      unsubNotifs();
    };
  }, [user]);

  useEffect(() => {
    if (readings.length > 0) {
      getHealthAdvice(readings.slice(0, 5)).then(setAdvice);
    }
  }, [readings]);

  const handleSaveReading = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      let status: 'normal' | 'warning' | 'danger' = 'normal';
      const data: any = {
        uid: user.uid,
        type: readingType,
        timestamp: new Date().toISOString(),
        note: ''
      };

      if (readingType === 'blood_pressure') {
        const s = parseInt(systolic) || 0;
        const d = parseInt(diastolic) || 0;
        data.systolic = s;
        data.diastolic = d;
        if (s >= 160 || d >= 100) status = 'danger';
        else if (s >= 140 || d >= 90) status = 'warning';
      } else {
        const s = parseInt(sugarLevel) || 0;
        data.sugarLevel = s;
        data.isFasting = isFasting;
        if (isFasting) {
          if (s >= 126) status = 'danger';
          else if (s >= 100) status = 'warning';
        } else {
          if (s >= 200) status = 'danger';
          else if (s >= 140) status = 'warning';
        }
      }

      data.status = status;
      await addDoc(collection(db, 'readings'), data);

      // Auto-generate notification for abnormal readings
      if (status !== 'normal') {
        const title = status === 'danger' ? '위험 수치 감지' : '주의 수치 감지';
        const message = readingType === 'blood_pressure' 
          ? `혈압이 ${systolic}/${diastolic}mmHg로 측정되었습니다. ${status === 'danger' ? '즉시 휴식을 취하고 필요시 병원을 방문하세요.' : '안정을 취하며 경과를 지켜보세요.'}`
          : `혈당이 ${sugarLevel}mg/dL로 측정되었습니다. ${status === 'danger' ? '식단 조절 및 약 복용 여부를 확인하세요.' : '가벼운 운동이나 식단 관리가 필요합니다.'}`;

        await addDoc(collection(db, 'notifications'), {
          uid: user.uid,
          title,
          message,
          type: status === 'danger' ? 'alert' : 'reminder',
          timestamp: new Date().toISOString(),
          read: false
        });

        // Trigger real browser notification
        sendBrowserNotification(title, message);
      }

      setIsReadingModalOpen(false);
      setSystolic('');
      setDiastolic('');
      setSugarLevel('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'readings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("카메라를 시작할 수 없습니다.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current || !user) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg');
    
    setIsSubmitting(true);
    try {
      if (cameraMode === 'ocr') {
        const result = await analyzeReadingImage(base64);
        setReadingType(result.deviceType);
        if (result.deviceType === 'blood_pressure') {
          setSystolic(result.systolic?.toString() || '');
          setDiastolic(result.diastolic?.toString() || '');
        } else {
          setSugarLevel(result.sugarLevel?.toString() || '');
        }
        setIsCameraModalOpen(false);
        setIsReadingModalOpen(true);
      } else {
        const result = await analyzeFood(base64);
        await addDoc(collection(db, 'foodLogs'), {
          uid: user.uid,
          imageUrl: base64,
          foodName: result.foodName,
          calories: result.calories,
          carbs: result.carbs,
          protein: result.protein,
          fat: result.fat,
          analysis: result.analysis,
          advice: result.advice,
          timestamp: new Date().toISOString(),
          rating: result.rating
        });

        // Trigger real browser notification for bad food rating
        if (result.rating === 'bad') {
          sendBrowserNotification("식단 주의 알림", `${result.foodName}은(는) 현재 건강 상태에 주의가 필요한 식단입니다.`);
        } else {
          sendBrowserNotification("식단 분석 완료", `${result.foodName} 분석이 완료되었습니다.`);
        }
        
        setIsCameraModalOpen(false);
      }
    } catch (err) {
      console.error("Analysis error:", err);
      alert("분석 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
      stopCamera();
    }
  };

  const toggleMed = async (med: any) => {
    try {
      await updateDoc(doc(db, 'medications', med.id), {
        takenToday: !med.takenToday,
        lastTaken: new Date().toISOString()
      });

      if (!med.takenToday) {
        sendBrowserNotification("복약 완료", `${med.name} 복용이 기록되었습니다.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'medications');
    }
  };

  const handleSaveMed = async () => {
    if (!user || !medName) return;
    setIsSubmitting(true);
    try {
      const data = {
        uid: user.uid,
        name: medName,
        dosage: medDosage,
        timeOfDay: medTime,
        takenToday: false,
        lastTaken: null
      };

      if (editingMedId) {
        await updateDoc(doc(db, 'medications', editingMedId), data);
      } else {
        await addDoc(collection(db, 'medications'), data);
      }

      setIsMedModalOpen(false);
      setMedName('');
      setMedDosage('');
      setMedTime('');
      setEditingMedId(null);
    } catch (err) {
      handleFirestoreError(err, editingMedId ? OperationType.UPDATE : OperationType.CREATE, 'medications');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMed = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'medications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'medications');
    }
  };

  const handleAddTodo = async (task: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'todos'), {
        uid: user.uid,
        task,
        completed: false,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'todos');
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    try {
      await updateDoc(doc(db, 'todos', id), { completed: !completed });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'todos');
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      // In a real app, use deleteDoc. Here we'll just update or assume delete tool exists
      // For now, let's use a placeholder or just updateDoc to 'deleted' if schema allowed
      // Actually, deleteDoc is available in firebase/firestore
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'todos', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'todos');
    }
  };

  const handleReadNotification = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  };

  const handleReadAllNotifications = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      const promises = unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
      await Promise.all(promises);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <motion.div 
        animate={{ rotate: 360 }} 
        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
      />
    </div>
  );

  const handleStart = async () => {
    setIsSubmitting(true);
    try {
      const cred = await signInWithGoogle();
      // Create basic profile if it doesn't exist
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        displayName: cred.user.displayName || '사용자',
        email: cred.user.email
      }, { merge: true });
    } catch (err: any) {
      console.error("Login error:", err);
      alert("시작하는 중 오류가 발생했습니다: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-medical-blue flex flex-col items-center justify-center p-8 text-white text-center relative overflow-hidden">
      <div className="absolute inset-0 medical-gradient opacity-90" />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-400/20 rounded-full blur-3xl" />
      
      <motion.div 
        initial={{ y: 40, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-md relative z-10"
      >
        <div className="bg-white/10 p-8 rounded-[48px] backdrop-blur-xl mb-10 inline-block border border-white/20 shadow-2xl">
          <Heart className="w-28 h-28 text-white fill-white/10" />
        </div>
        <h1 className="text-6xl font-black mb-6 leading-tight font-display tracking-tighter">
          국민<br/>건강 비서
        </h1>
        <p className="text-2xl font-medium opacity-80 mb-14 leading-relaxed tracking-tight">
          고혈압과 당뇨 관리를<br/>전문의 수준으로 도와드립니다.
        </p>
        <Button 
          size="xl" 
          variant="primary" 
          className="w-full bg-white text-medical-blue hover:bg-blue-50 h-28 rounded-[40px] text-4xl shadow-2xl shadow-blue-900/40"
          onClick={handleStart}
          disabled={isSubmitting}
        >
          {isSubmitting ? '진료 준비 중...' : '구글로 시작하기'}
        </Button>
        <p className="mt-8 text-sm font-bold opacity-60 uppercase tracking-widest">Clinical Grade Health Monitoring</p>
      </motion.div>
    </div>
  );

  const latestBP = readings.find(r => r.type === 'blood_pressure');
  const latestSugar = readings.find(r => r.type === 'blood_sugar');

  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl px-8 py-10 sticky top-0 z-30 border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex justify-between items-end">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">System Active</span>
            </div>
            <h1 className="text-4xl font-black text-slate-900 font-display tracking-tighter">안녕하세요!</h1>
            <p className="text-lg font-bold text-slate-400 mt-1">{format(new Date(), 'yyyy년 M월 d일 EEEE', { locale: ko })}</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={logout} className="p-4 bg-slate-50 rounded-[24px] text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-all border border-slate-100 shadow-sm">
              <LogOut className="w-7 h-7" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-8 space-y-10">
        {activeTab === 'home' ? (
          <>
            {/* AI Advice - Clinical Insight Style */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }}
              className="relative group"
            >
              <div className="absolute inset-0 medical-gradient rounded-[48px] blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
              <div className="relative bg-white p-10 rounded-[48px] shadow-2xl shadow-blue-100 border border-blue-50 overflow-hidden">
                <div className="flex items-start gap-8">
                  <div className="hidden md:flex flex-col items-center gap-2">
                    <div className="w-20 h-20 bg-medical-blue rounded-3xl flex items-center justify-center shadow-lg shadow-blue-200">
                      <UserIcon className="w-10 h-10 text-white" />
                    </div>
                    <span className="text-[10px] font-black text-medical-blue uppercase tracking-widest">Expert AI</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="px-3 py-1 bg-blue-50 text-medical-blue text-xs font-black rounded-full uppercase tracking-wider">Clinical Insight</div>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>
                    <div className="space-y-4">
                      {advice.split('\n').filter(line => line.trim()).map((line, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: idx * 0.1 }}
                          className="flex items-start gap-4"
                        >
                          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 mt-1">
                            <span className="text-medical-blue font-black text-sm">{idx + 1}</span>
                          </div>
                          <p className="text-2xl font-black text-slate-900 leading-tight font-display tracking-tight">
                            {line.replace(/^\d+\.\s*/, '')}
                          </p>
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-6 flex items-center gap-4">
                      <div className="flex -space-x-2">
                        {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100" />)}
                      </div>
                      <p className="text-sm font-bold text-slate-400">전문의 AI가 실시간 분석 중입니다</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Stats - Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              <Card 
                title="혈압 리포트" 
                subtitle="Blood Pressure Analysis"
                icon={Heart} 
                className="md:col-span-7"
              >
                {latestBP ? (
                  <div className="flex items-end justify-between">
                    <div className="space-y-6">
                      <div className="flex items-baseline gap-3">
                        <span className="text-8xl font-black text-slate-900 font-display tracking-tighter">{latestBP.systolic || 0}</span>
                        <span className="text-4xl font-light text-slate-300">/</span>
                        <span className="text-5xl font-black text-slate-500 font-display tracking-tight">{latestBP.diastolic || 0}</span>
                        <span className="text-xl font-black text-slate-300 ml-2 uppercase tracking-widest">mmHg</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <StatusBadge status={latestBP.status} />
                        <div className="h-4 w-px bg-slate-100" />
                        <p className="text-sm font-bold text-slate-400 flex items-center gap-2">
                          <History className="w-4 h-4" />
                          {format(new Date(latestBP.timestamp), 'a h:mm 측정', { locale: ko })}
                        </p>
                      </div>
                    </div>
                    <div className="hidden lg:block w-32 h-32 opacity-5">
                      <Activity className="w-full h-full" />
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-100">
                    <p className="text-slate-400 text-xl font-bold">측정 데이터가 없습니다</p>
                  </div>
                )}
              </Card>

              <Card 
                title="혈당 수치" 
                subtitle="Glucose Monitoring"
                icon={Activity} 
                className="md:col-span-5"
              >
                {latestSugar ? (
                  <div className="space-y-6">
                    <div className="flex items-baseline gap-3">
                      <span className="text-8xl font-black text-slate-900 font-display tracking-tighter">{latestSugar.sugarLevel || 0}</span>
                      <span className="text-xl font-black text-slate-300 uppercase tracking-widest">mg/dL</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="px-4 py-1.5 bg-blue-50 text-medical-blue rounded-full text-sm font-black font-display uppercase tracking-wider">
                        {latestSugar.isFasting ? '공복 상태' : '식후 측정'}
                      </div>
                      <StatusBadge status={latestSugar.status} />
                    </div>
                    <p className="text-sm font-bold text-slate-400 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      {format(new Date(latestSugar.timestamp), 'a h:mm 측정', { locale: ko })}
                    </p>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-100">
                    <p className="text-slate-400 text-xl font-bold">측정 데이터가 없습니다</p>
                  </div>
                )}
              </Card>
            </div>

            {/* Medication & Food - Side by Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card 
                title="처방 복약 관리" 
                subtitle="Medication Schedule" 
                icon={Pill}
                action={
                  <button 
                    onClick={() => {
                      setEditingMedId(null);
                      setMedName('');
                      setMedDosage('');
                      setMedTime('');
                      setIsMedModalOpen(true);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-medical-blue"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                }
              >
                <div className="space-y-4">
                  {meds.length > 0 ? meds.map((med) => (
                    <motion.div 
                      key={med.id} 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "flex items-center justify-between p-6 rounded-[32px] border-2 transition-all group relative",
                        med.takenToday 
                          ? "bg-emerald-50 border-emerald-100 shadow-inner" 
                          : "bg-white border-slate-100 hover:border-medical-blue hover:shadow-xl hover:shadow-blue-50"
                      )}
                    >
                      <div 
                        className="flex items-center gap-5 flex-1 cursor-pointer"
                        onClick={() => toggleMed(med)}
                      >
                        <div className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors", 
                          med.takenToday ? "bg-emerald-200 text-emerald-700" : "bg-slate-50 text-slate-300"
                        )}>
                          <Pill className="w-8 h-8" />
                        </div>
                        <div>
                          <h4 className="text-2xl font-black text-slate-900 font-display leading-tight">{med.name}</h4>
                          <p className="text-lg font-bold text-slate-400">{med.dosage} • {med.timeOfDay}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMedId(med.id);
                            setMedName(med.name);
                            setMedDosage(med.dosage);
                            setMedTime(med.timeOfDay);
                            setIsMedModalOpen(true);
                          }}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:bg-slate-100 rounded-full transition-all text-slate-400 hover:text-medical-blue"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMed(med.id);
                          }}
                          className="p-2 opacity-0 group-hover:opacity-100 hover:bg-rose-50 rounded-full transition-all text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div onClick={() => toggleMed(med)} className="cursor-pointer">
                          {med.takenToday ? (
                            <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-200">
                              <CheckCircle2 className="w-7 h-7 text-white" />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full border-4 border-slate-100" />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )) : (
                    <div className="text-center py-12 bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-100">
                      <p className="text-slate-400 text-xl font-bold mb-6">등록된 약이 없습니다</p>
                      <Button variant="outline" size="lg" onClick={() => {
                        setEditingMedId(null);
                        setMedName('');
                        setMedDosage('');
                        setMedTime('');
                        setIsMedModalOpen(true);
                      }}>신규 약 등록</Button>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="영양 식단 분석" subtitle="Nutrition Analysis" icon={Utensils}>
                <div className="grid grid-cols-2 gap-6">
                  {foodLogs.map((log) => (
                    <motion.div 
                      key={log.id} 
                      whileHover={{ y: -5 }}
                      className="relative aspect-[4/5] rounded-[32px] overflow-hidden border border-slate-100 group shadow-lg"
                    >
                      <img src={log.imageUrl} alt="Meal" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-medical-dark/90 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col p-6 backdrop-blur-md overflow-y-auto">
                        <div className="mb-4">
                          <h4 className="text-white text-xl font-black mb-1">{log.foodName || '식단'}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 text-sm font-bold">{log.calories} kcal</span>
                            <div className="w-1 h-1 rounded-full bg-slate-500" />
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">탄</p>
                            <p className="text-white text-xs font-black">{log.carbs || '-'}</p>
                          </div>
                          <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">단</p>
                            <p className="text-white text-xs font-black">{log.protein || '-'}</p>
                          </div>
                          <div className="bg-white/10 rounded-xl p-2 text-center">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">지</p>
                            <p className="text-white text-xs font-black">{log.fat || '-'}</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-1">Analysis</p>
                            <p className="text-slate-200 text-xs leading-relaxed">{log.analysis}</p>
                          </div>
                          <div>
                            <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mb-1">Coach Advice</p>
                            <p className="text-slate-200 text-xs leading-relaxed italic">"{log.advice}"</p>
                          </div>
                        </div>
                      </div>
                      <div className="absolute top-4 right-4">
                        <div className={cn(
                          "px-4 py-1.5 rounded-full text-xs font-black text-white shadow-lg uppercase tracking-widest",
                          log.rating === 'good' ? "bg-emerald-500" : log.rating === 'moderate' ? "bg-amber-500" : "bg-rose-500"
                        )}>
                          {log.rating === 'good' ? 'Excellent' : log.rating === 'moderate' ? 'Moderate' : 'Caution'}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  <button 
                    onClick={() => { setCameraMode('food'); setIsCameraModalOpen(true); startCamera(); }}
                    className="aspect-[4/5] rounded-[32px] border-4 border-dashed border-slate-100 flex flex-col items-center justify-center text-slate-300 hover:bg-white hover:border-medical-blue hover:text-medical-blue hover:shadow-2xl hover:shadow-blue-100 transition-all group"
                  >
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-50 transition-colors">
                      <Camera className="w-10 h-10" />
                    </div>
                    <span className="text-xl font-black font-display tracking-tight">식단 촬영</span>
                  </button>
                </div>
              </Card>
            </div>
          </>
        ) : activeTab === 'calendar' ? (
          <Calendar readings={readings} meds={meds} foodLogs={foodLogs} />
        ) : activeTab === 'todo' ? (
          <TodoView todos={todos} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} onAdd={handleAddTodo} />
        ) : activeTab === 'notifications' ? (
          <NotificationView notifications={notifications} onRead={handleReadNotification} onReadAll={handleReadAllNotifications} />
        ) : activeTab === 'profile' ? (
          <ProfileView user={user} onLogout={logout} />
        ) : (
          <div className="py-20 text-center">
            <h2 className="text-3xl font-black text-slate-300 font-display">준비 중인 기능입니다</h2>
          </div>
        )}
      </main>

      {/* Action Bar - Floating */}
      <div className="fixed bottom-28 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6 z-40">
        <div className="glass-card rounded-[40px] p-4 flex gap-4">
          <Button 
            size="xl" 
            variant="primary" 
            className="flex-1 rounded-[32px] h-24 shadow-2xl shadow-blue-200"
            onClick={() => setIsReadingModalOpen(true)}
          >
            <Plus className="w-10 h-10" />
            수치 기록
          </Button>
          <Button 
            size="xl" 
            variant="secondary" 
            className="w-32 h-24 rounded-[32px] shadow-2xl shadow-emerald-200"
            onClick={() => { setCameraMode('ocr'); setIsCameraModalOpen(true); startCamera(); }}
          >
            <Camera className="w-12 h-12" />
          </Button>
        </div>
      </div>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Modals - Refined Styling */}
      <Modal isOpen={isReadingModalOpen} onClose={() => setIsReadingModalOpen(false)} title="임상 데이터 기록">
        <div className="space-y-10">
          <div className="flex p-3 bg-slate-100 rounded-[32px]">
            <button 
              onClick={() => setReadingType('blood_pressure')}
              className={cn("flex-1 py-5 rounded-[24px] font-black text-2xl transition-all font-display", readingType === 'blood_pressure' ? "bg-white shadow-xl text-medical-blue" : "text-slate-400")}
            >혈압 측정</button>
            <button 
              onClick={() => setReadingType('blood_sugar')}
              className={cn("flex-1 py-5 rounded-[24px] font-black text-2xl transition-all font-display", readingType === 'blood_sugar' ? "bg-white shadow-xl text-medical-blue" : "text-slate-400")}
            >혈당 측정</button>
          </div>

          {readingType === 'blood_pressure' ? (
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display">Systolic</label>
                <input 
                  type="number" 
                  value={systolic} 
                  onChange={(e) => setSystolic(e.target.value)}
                  placeholder="120"
                  className="w-full text-7xl font-black p-8 bg-slate-50 rounded-[40px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display tracking-tighter text-center"
                />
              </div>
              <div className="space-y-4">
                <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display">Diastolic</label>
                <input 
                  type="number" 
                  value={diastolic} 
                  onChange={(e) => setDiastolic(e.target.value)}
                  placeholder="80"
                  className="w-full text-7xl font-black p-8 bg-slate-50 rounded-[40px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display tracking-tighter text-center"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="flex gap-6">
                <button 
                  onClick={() => setIsFasting(true)}
                  className={cn("flex-1 py-5 rounded-[28px] font-black text-xl border-4 transition-all font-display", isFasting ? "bg-blue-50 border-medical-blue text-medical-blue shadow-lg" : "border-slate-50 text-slate-300")}
                >공복 상태</button>
                <button 
                  onClick={() => setIsFasting(false)}
                  className={cn("flex-1 py-5 rounded-[28px] font-black text-xl border-4 transition-all font-display", !isFasting ? "bg-blue-50 border-medical-blue text-medical-blue shadow-lg" : "border-slate-50 text-slate-300")}
                >식후 측정</button>
              </div>
              <div className="space-y-4">
                <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display text-center block">Glucose Level</label>
                <input 
                  type="number" 
                  value={sugarLevel} 
                  onChange={(e) => setSugarLevel(e.target.value)}
                  placeholder="100"
                  className="w-full text-9xl font-black p-12 bg-slate-50 rounded-[56px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display tracking-tighter text-center"
                />
              </div>
            </div>
          )}

          <Button 
            size="xl" 
            className="w-full h-28 rounded-[40px] shadow-2xl shadow-blue-200" 
            onClick={handleSaveReading}
            disabled={isSubmitting}
          >
            {isSubmitting ? '데이터 분석 중...' : '임상 기록 저장'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isCameraModalOpen} onClose={() => { stopCamera(); setIsCameraModalOpen(false); }} title={cameraMode === 'ocr' ? "AI 수치 자동 스캔" : "AI 영양 분석 촬영"}>
        <div className="space-y-8">
          <div className="relative aspect-square bg-slate-900 rounded-[56px] overflow-hidden shadow-2xl border-8 border-white">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-[60px] border-black/40 pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-medical-blue/50 shadow-[0_0_15px_rgba(10,88,202,0.5)] animate-scan" />
            </div>
            {cameraMode === 'ocr' && (
              <div className="absolute inset-x-12 top-1/2 -translate-y-1/2 h-40 border-4 border-white/30 rounded-3xl backdrop-blur-[2px]" />
            )}
          </div>
          <p className="text-center text-xl font-bold text-slate-400 leading-relaxed">
            {cameraMode === 'ocr' ? "측정기 화면의 숫자가\n중앙 가이드라인에 오게 해주세요." : "음식의 전체 모습이\n잘 보이도록 촬영해 주세요."}
          </p>
          <Button 
            size="xl" 
            className="w-full h-32 rounded-[48px] shadow-2xl shadow-blue-200" 
            onClick={captureImage}
            disabled={isSubmitting}
          >
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <Camera className="w-10 h-10" />
            </div>
            {isSubmitting ? 'AI 분석 중...' : '스캔 시작'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isMedModalOpen} onClose={() => setIsMedModalOpen(false)} title={editingMedId ? "약 정보 수정" : "신규 약 등록"}>
        <div className="space-y-8">
          <div className="space-y-4">
            <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display">약 이름</label>
            <input 
              type="text" 
              value={medName} 
              onChange={(e) => setMedName(e.target.value)}
              placeholder="예: 혈압약, 당뇨약"
              className="w-full text-3xl font-black p-6 bg-slate-50 rounded-[32px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display">용량</label>
              <input 
                type="text" 
                value={medDosage} 
                onChange={(e) => setMedDosage(e.target.value)}
                placeholder="예: 1알, 5mg"
                className="w-full text-2xl font-black p-6 bg-slate-50 rounded-[32px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display"
              />
            </div>
            <div className="space-y-4">
              <label className="text-xl font-black text-slate-400 uppercase tracking-widest font-display">복용 시간</label>
              <input 
                type="text" 
                value={medTime} 
                onChange={(e) => setMedTime(e.target.value)}
                placeholder="예: 아침 식후"
                className="w-full text-2xl font-black p-6 bg-slate-50 rounded-[32px] border-4 border-transparent focus:border-medical-blue focus:bg-white outline-none transition-all font-display"
              />
            </div>
          </div>
          <Button 
            size="xl" 
            className="w-full h-28 rounded-[40px] shadow-2xl shadow-blue-200" 
            onClick={handleSaveMed}
            disabled={isSubmitting || !medName}
          >
            {isSubmitting ? '저장 중...' : editingMedId ? '정보 수정 완료' : '약 등록 완료'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
