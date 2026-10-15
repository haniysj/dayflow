import { addDays, dow, todayStr } from './dates'
import { db, DEFAULT_SETTINGS, save, saveMany, uid } from './db'
import type { CalEvent, Category, Holiday, Note, Project, Task } from './types'

export const CATEGORY_COLORS = ['#1F7A6D', '#2F5F98', '#8A6100', '#6D3BB0', '#C2453A', '#B4561B', '#2E7D32', '#AD3B7A', '#00838F', '#5D4037', '#455A64']

const STARTER: [string, string, string][] = [
  ['التخطيط والسياسات', 'Planning and Policy', 'compass'],
  ['متابعة الموظفين والكوادر', 'Staff and Personnel Follow-up', 'users'],
  ['الاجتماعات والمواعيد', 'Meetings and Appointments', 'calendar-clock'],
  ['المراسلات الرسمية', 'Official Correspondence', 'mail'],
  ['المناهج والتطوير', 'Curriculum and Development', 'book-open'],
  ['التقويم وضمان الجودة', 'Assessment and Quality Assurance', 'badge-check'],
  ['التدريب والتنمية المهنية', 'Training and Professional Development', 'graduation-cap'],
  ['ردود معلّقة', 'Pending Responses', 'hourglass'],
  ['المهام الإدارية', 'Administrative Tasks', 'clipboard-list'],
  ['مهام شخصية', 'Personal Tasks', 'heart'],
]

export const OFFICIAL_SOURCE = 'مجلس الوزراء — جدول العطل الرسمية 2026 (Times of Oman / Arabian Business)، وإعلانات العيدين (Muscat Daily / Gulf News)'
const SRC_2026 = 'https://timesofoman.com/article/166620-oman-declares-holiday-calendar-for-2026'
const SRC_FITR = 'https://gulfnews.com/world/gulf/oman/oman-announces-eid-al-fitr-holiday-from-march-19-to-23-1.500470727'
const SRC_ADHA = 'https://www.muscatdaily.com/2026/05/18/eid-al-adha-holidays-declared-for-public-and-private-sectors/'
const SRC_GOV = 'https://gov.om/en/important-dates-and-holidays'

/** Verified on 2026-10-15. 2027 entries are estimates until officially announced. */
export const OFFICIAL_HOLIDAYS: Omit<Holiday, 'updatedAt'>[] = [
  { id: 'om-2026-accession', name: 'ذكرى تولي السلطان مقاليد الحكم', nameEn: "Sultan's Accession Day", start: '2026-01-15', end: '2026-01-15', status: 'confirmed', source: 'مجلس الوزراء', sourceUrl: SRC_2026, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-isra', name: 'الإسراء والمعراج', nameEn: "Isra' and Mi'raj", start: '2026-01-18', end: '2026-01-18', status: 'confirmed', source: 'مجلس الوزراء', sourceUrl: SRC_2026, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-fitr', name: 'إجازة عيد الفطر', nameEn: 'Eid al-Fitr holiday', start: '2026-03-19', end: '2026-03-23', status: 'confirmed', source: 'إعلان رسمي', sourceUrl: SRC_FITR, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-adha', name: 'إجازة عيد الأضحى', nameEn: 'Eid al-Adha holiday', start: '2026-05-26', end: '2026-05-30', status: 'confirmed', source: 'إعلان رسمي', sourceUrl: SRC_ADHA, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-hijri', name: 'رأس السنة الهجرية', nameEn: 'Islamic New Year', start: '2026-06-18', end: '2026-06-18', status: 'confirmed', source: 'مجلس الوزراء', sourceUrl: SRC_2026, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-mawlid', name: 'المولد النبوي الشريف', nameEn: "Prophet's Birthday", start: '2026-08-27', end: '2026-08-27', status: 'confirmed', source: 'مجلس الوزراء', sourceUrl: SRC_2026, verifiedAt: '2026-10-15', official: true },
  { id: 'om-2026-national', name: 'العيد الوطني', nameEn: 'National Day', start: '2026-11-25', end: '2026-11-26', status: 'confirmed', source: 'مجلس الوزراء', sourceUrl: SRC_2026, verifiedAt: '2026-10-15', official: true },
  // 2027 — estimated (to be replaced when the Council of Ministers publishes the calendar)
  { id: 'om-2027-accession', name: 'ذكرى تولي السلطان مقاليد الحكم', nameEn: "Sultan's Accession Day", start: '2027-01-11', end: '2027-01-11', status: 'estimated', source: 'تقدير — بانتظار الإعلان الرسمي', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-isra', name: 'الإسراء والمعراج', nameEn: "Isra' and Mi'raj", start: '2027-01-06', end: '2027-01-06', status: 'estimated', source: 'تقدير فلكي — بانتظار الإعلان الرسمي', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-fitr', name: 'إجازة عيد الفطر', nameEn: 'Eid al-Fitr holiday', start: '2027-03-09', end: '2027-03-12', status: 'estimated', source: 'تقدير فلكي — يتبع رؤية الهلال', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-adha', name: 'إجازة عيد الأضحى', nameEn: 'Eid al-Adha holiday', start: '2027-05-15', end: '2027-05-19', status: 'estimated', source: 'تقدير فلكي — يتبع رؤية الهلال', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-hijri', name: 'رأس السنة الهجرية', nameEn: 'Islamic New Year', start: '2027-06-06', end: '2027-06-06', status: 'estimated', source: 'تقدير فلكي — بانتظار الإعلان الرسمي', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-mawlid', name: 'المولد النبوي الشريف', nameEn: "Prophet's Birthday", start: '2027-08-15', end: '2027-08-15', status: 'estimated', source: 'تقدير فلكي — بانتظار الإعلان الرسمي', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
  { id: 'om-2027-national', name: 'العيد الوطني', nameEn: 'National Day', start: '2027-11-20', end: '2027-11-20', status: 'estimated', source: 'تقدير — بانتظار الإعلان الرسمي', sourceUrl: SRC_GOV, verifiedAt: null, official: true },
]

/** First run: categories + official holidays + clearly-labelled demo records */
export async function firstRunSeed() {
  if (localStorage.getItem('df-seeded')) return
  const existing = await db.categories.count()
  if (existing > 0) { localStorage.setItem('df-seeded', '1'); return }
  localStorage.setItem('df-seeded', '1')

  const cats: Category[] = STARTER.map(([name, nameEn, icon], i) => ({
    id: uid(), updatedAt: 0, name, nameEn, icon, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length], order: i, defaultReminders: [],
  }))
  await saveMany('categories', cats)
  await saveMany('holidays', OFFICIAL_HOLIDAYS)
  await seedDemo(cats)
  await save('meta', { id: 'settings', value: { ...DEFAULT_SETTINGS } })
}

/** Add any newer official holiday rows that are not yet in the local store (never overwrites manual edits) */
export async function mergeOfficialHolidays() {
  const have = new Set((await db.holidays.toArray()).map(h => h.id))
  const missing = OFFICIAL_HOLIDAYS.filter(h => !have.has(h.id))
  if (missing.length) await saveMany('holidays', missing)
}

/** Titles used by seedDemo — a demo-flagged record whose title differs was renamed by the user and is real data */
export const DEMO_TITLES = new Set(['آخر موعد لتسليم خطة الفصل', 'إرسال كشف الحضور الأسبوعي', 'إعداد محضر اجتماع لجنة الجودة', 'اجتماع لجنة المناهج', 'استراحة', 'الاجتماع الأسبوعي للقسم', 'الرد على مراسلة مديرية الموارد البشرية', 'تحديث ملف الإنجاز المهني', 'تحضير عرض ورشة استراتيجيات القراءة', 'جلسة تركيز: كتابة التقرير', 'زيارة صفية — مدرسة الخوض', 'عشاء عائلي عند بيت العم', 'قراءة تقرير نتائج التقويم التكويني', 'متابعة طلب الصيانة لقاعة التدريب', 'مراجعة مسودة خطة التدريب مع أ. سالم البلوشي', 'خطة التطوير المهني للفصل الثاني'])

const nextWorkday = (d: string, n = 1) => { let x = d; let k = 0; while (k < n) { x = addDays(x, 1); if (![5, 6].includes(dow(x))) k++ } return x }

export async function seedDemo(cats?: Category[]) {
  cats = cats || (await db.categories.orderBy('order').toArray()).filter(c => !c.deleted)
  const c = (i: number) => cats![i]?.id ?? null
  const t = todayStr()
  const tm = nextWorkday(t)
  const proj: Project = {
    id: uid(), updatedAt: 0, demo: true, name: 'خطة التطوير المهني للفصل الثاني', categoryId: c(6), status: 'active',
    desc: 'برنامج ورش لمعلمي اللغة الإنجليزية (بيانات تجريبية)', deadline: addDays(t, 30), createdAt: Date.now(),
    milestones: [
      { id: uid(), title: 'حصر الاحتياجات التدريبية', date: addDays(t, 5), done: true },
      { id: uid(), title: 'اعتماد جدول الورش', date: addDays(t, 14), done: false },
      { id: uid(), title: 'تنفيذ الورشة الأولى', date: addDays(t, 28), done: false },
    ],
  }
  const task = (p: Partial<Task>): Task => ({
    id: uid(), updatedAt: 0, demo: true, title: '', createdAt: Date.now(), priority: 'normal', status: 'planned',
    subtasks: [], links: [], reminders: [], ...p,
  })
  const tasks: Task[] = [
    task({ title: 'مراجعة مسودة خطة التدريب مع أ. سالم البلوشي', categoryId: c(0), projectId: proj.id, dueDate: t, startTime: '09:00', endTime: '10:00', priority: 'high', estMin: 60, reminders: [10] }),
    task({ title: 'الرد على مراسلة مديرية الموارد البشرية', categoryId: c(3), dueDate: t, priority: 'urgent', estMin: 20 }),
    task({ title: 'متابعة طلب الصيانة لقاعة التدريب', categoryId: c(7), dueDate: addDays(t, -2), originalDueDate: addDays(t, -3), rescheduleCount: 1, status: 'waiting', followUpDate: t, contact: 'م. فهد الحارثي', estMin: 15 }),
    task({ title: 'إعداد محضر اجتماع لجنة الجودة', categoryId: c(5), dueDate: tm, priority: 'high', estMin: 45, subtasks: [{ id: uid(), title: 'جمع الملاحظات', done: true }, { id: uid(), title: 'صياغة التوصيات', done: false }] }),
    task({ title: 'قراءة تقرير نتائج التقويم التكويني', categoryId: c(5), dueDate: addDays(t, 3), estMin: 30 }),
    task({ title: 'تحديث ملف الإنجاز المهني', categoryId: c(9), dueDate: null, status: 'inbox', priority: 'low' }),
    task({ title: 'تحضير عرض ورشة استراتيجيات القراءة', categoryId: c(6), projectId: proj.id, dueDate: addDays(t, 6), estMin: 90, priority: 'high' }),
    task({ title: 'إرسال كشف الحضور الأسبوعي', categoryId: c(8), dueDate: t, status: 'completed', completedAt: Date.now() - 3600000, estMin: 10 }),
  ]
  const ev = (p: Partial<CalEvent>): CalEvent => ({ id: uid(), updatedAt: 0, demo: true, title: '', type: 'work', date: t, allDay: false, reminders: [10], ...p })
  const events: CalEvent[] = [
    ev({ title: 'اجتماع لجنة المناهج', type: 'meeting', date: t, startTime: '10:30', endTime: '11:30', location: 'قاعة الاجتماعات', categoryId: c(2) }),
    ev({ title: 'استراحة', type: 'break', date: t, startTime: '12:00', endTime: '12:20', reminders: [] }),
    ev({ title: 'جلسة تركيز: كتابة التقرير', type: 'focus', date: tm, startTime: '08:00', endTime: '09:30' }),
    ev({ title: 'زيارة صفية — مدرسة الخوض', type: 'work', date: addDays(t, 2), startTime: '08:30', endTime: '10:00', location: 'الخوض' }),
    ev({ title: 'عشاء عائلي عند بيت العم', type: 'personal', date: addDays(t, 1), startTime: '19:30', endTime: '21:30' }),
    ev({ title: 'آخر موعد لتسليم خطة الفصل', type: 'deadline', date: addDays(t, 9), allDay: true, reminders: [1440] }),
    ev({ title: 'الاجتماع الأسبوعي للقسم', type: 'meeting', date: t, startTime: '13:00', endTime: '13:45', recurrence: { freq: 'weekly', interval: 1, byDay: [dow(t)] } }),
  ]
  const notes: Note[] = [
    { id: uid(), updatedAt: 0, demo: true, text: 'فكرة: نموذج إلكتروني موحّد لطلبات الإجازات', createdAt: Date.now() - 7200000 },
    { id: uid(), updatedAt: 0, demo: true, text: 'الاتصال بأ. مريم العامري بخصوص جدول الورش', createdAt: Date.now() - 3600000 },
  ]
  await save('projects', proj)
  await saveMany('tasks', tasks)
  await saveMany('events', events)
  await saveMany('notes', notes)
  await save('days', { id: t, updatedAt: 0, demo: true, priorities: [
    { title: tasks[0].title, taskId: tasks[0].id, priority: 'high', estMin: 60, done: false },
    { title: tasks[1].title, taskId: tasks[1].id, priority: 'urgent', estMin: 20, done: false },
    null,
  ] })
  await save('leaves', { id: uid(), updatedAt: 0, demo: true, type: 'annual', start: addDays(t, 40), end: addDays(t, 46), workingDays: 5, notes: 'إجازة تجريبية', remindDaysBefore: 3, returnReminder: true })
}

/** Removes every record flagged demo (official holidays are never demo) */
export async function clearDemo() {
  const now = Date.now()
  for (const tb of ['tasks', 'events', 'projects', 'notes', 'days', 'leaves'] as const) {
    const rows = await (db as any)[tb].filter((r: any) => r.demo && !r.deleted).toArray()
    await (db as any)[tb].bulkPut(rows.map((r: any) => ({ ...r, deleted: 1, dirty: 1, updatedAt: now })))
  }
}
export async function hasDemo() {
  for (const tb of ['tasks', 'events', 'projects', 'notes', 'leaves'] as const)
    if (await (db as any)[tb].filter((r: any) => r.demo && !r.deleted).count()) return true
  return false
}
