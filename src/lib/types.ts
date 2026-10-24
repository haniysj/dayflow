export type ID = string

/** Fields every synced record carries */
export interface Base {
  id: ID
  updatedAt: number
  deleted?: 0 | 1
  dirty?: 0 | 1
  demo?: boolean
}

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskStatus = 'inbox' | 'planned' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | 'archived'

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval: number
  byDay?: number[] // 0=Sun..6=Sat (weekly)
  until?: string // YYYY-MM-DD
  workdaysOnly?: boolean
}

/** A reminder: minutes before the start (number), or "d days before, at HH:mm" */
export type ReminderSpec = number | { d: number; t: string }
/** Repeat each alert `count` more times, every `every` minutes */
export interface ReminderRepeat { every: number; count: number }

export interface Subtask { id: ID; title: string; done: boolean }

export interface Task extends Base {
  title: string
  desc?: string
  categoryId?: ID | null
  projectId?: ID | null
  createdAt: number
  dueDate?: string | null // YYYY-MM-DD; null = someday/unscheduled
  startDate?: string | null
  startTime?: string | null // HH:mm (wall time in settings TZ)
  endTime?: string | null
  estMin?: number | null
  actualMin?: number | null
  priority: Priority
  status: TaskStatus
  reminders?: ReminderSpec[] // minutes before start (or before default reminder time), or day+time
  reminderRepeat?: ReminderRepeat | null
  recurrence?: Recurrence | null
  notes?: string
  links?: string[]
  subtasks?: Subtask[]
  followUpDate?: string | null
  contact?: string
  completedAt?: number | null
  originalDueDate?: string | null
  rescheduleCount?: number
  blockKind?: BlockKind
}

export type EventType =
  | 'work' | 'personal' | 'deadline' | 'reminder' | 'occasion' | 'travel'
  | 'meeting' | 'break' | 'focus'

export type BlockKind = 'task' | 'meeting' | 'break' | 'personal' | 'focus'

export interface CalEvent extends Base {
  title: string
  type: EventType
  date: string
  endDate?: string | null // inclusive, multi-day
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
  location?: string
  notes?: string
  categoryId?: ID | null
  recurrence?: Recurrence | null
  reminders?: ReminderSpec[]
  reminderRepeat?: ReminderRepeat | null
  exDates?: string[] // skipped occurrences
}

export interface Category extends Base {
  name: string
  nameEn?: string
  icon: string
  color: string
  desc?: string
  order: number
  archived?: boolean
  defaultReminders?: number[]
}

export interface Milestone { id: ID; title: string; date?: string | null; done: boolean }

export interface Project extends Base {
  name: string
  categoryId?: ID | null
  desc?: string
  deadline?: string | null
  status: 'active' | 'done' | 'archived'
  milestones: Milestone[]
  notes?: string
  createdAt: number
}

export interface Note extends Base {
  text: string
  createdAt: number
  archived?: boolean
  convertedTo?: { kind: 'task' | 'event' | 'project'; id: ID } | null
  remindAt?: string | null // ISO local "YYYY-MM-DDTHH:mm"
}

/** Number of daily top-priority slots */
export const PRIORITY_SLOTS = 5

export interface PrioritySlot {
  title: string
  desc?: string
  taskId?: ID | null
  estMin?: number | null
  priority: Priority
  done: boolean
}

export interface DayReview {
  rating?: number | null // 1..5
  answers: string[] // 3 optional reflection answers
  reflection?: string
  tomorrowTaskId?: ID | null
  tomorrowText?: string
  doneAt?: number | null
}

export interface DayRecord extends Base {
  // id = YYYY-MM-DD
  priorities: (PrioritySlot | null)[] // exactly PRIORITY_SLOTS (5)
  review?: DayReview | null
  planned?: ID[] // tasks planned for this day at "plan tomorrow" time (for planned-vs-completed)
}

export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid' | 'study' | 'other'

export interface Leave extends Base {
  type: LeaveType
  start: string
  end: string
  workingDays: number
  notes?: string
  remindDaysBefore?: number | null
  returnReminder?: boolean
  prepTaskIds?: ID[]
}

export interface Holiday extends Base {
  name: string
  nameEn?: string
  start: string
  end: string
  status: 'confirmed' | 'estimated'
  source?: string
  sourceUrl?: string
  verifiedAt?: string | null
  remind?: boolean
  official: boolean // false = personal occasion added manually
}

export interface Settings {
  appName: string
  lang: 'ar' | 'en'
  dateFormat: 'dmy' | 'ymd' | 'long'
  showHijri: boolean
  timeFormat: '12' | '24'
  timeZone: string
  weekStart: number // 0=Sunday
  workdays: number[]
  workStart: string
  workEnd: string
  dayStart: number // timeline hours
  dayEnd: number
  slotMin: number
  theme: 'light' | 'dark' | 'system'
  accent: string
  density: 'comfortable' | 'compact'
  reducedMotion: 'system' | 'on' | 'off'
  motivation: string
  typeColors: Record<string, string>
  // notifications
  notifyEnabled: boolean
  defaultReminders: number[]
  defaultEventReminders: ReminderSpec[]
  defaultEventRepeat: ReminderRepeat | null
  defaultReminderTime: string // for untimed tasks
  quietStart: string
  quietEnd: string
  quietEnabled: boolean
  morningEnabled: boolean
  morningTime: string
  eveningEnabled: boolean
  eveningTime: string
  weeklyEnabled: boolean
  weeklyDay: number
  weeklyTime: string
  notifyCats: { tasks: boolean; events: boolean; planning: boolean; leave: boolean }
  // leave
  leaveAllowance: number | null
  leaveYearStart: string // MM-DD
  leaveCountWeekends: boolean
  leaveCountHolidays: boolean
  leaveCarryOver: number
  reviewQuestions: string[]
  onboarded: boolean
}

export interface MetaRecord extends Base {
  // id = 'settings' | 'snoozes'
  value: any
}

export type TableName =
  | 'tasks' | 'events' | 'categories' | 'projects' | 'notes' | 'days' | 'leaves' | 'holidays' | 'meta'
