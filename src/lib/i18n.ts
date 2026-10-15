// Inline bilingual strings: L('عربي', 'English'). The current language is set from settings on every render of <App/>.
let lang: 'ar' | 'en' = 'ar'
export const setLang = (l: 'ar' | 'en') => {
  lang = l
  document.documentElement.lang = l
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
}
export const getLang = () => lang
export const isRTL = () => lang === 'ar'
export const L = (ar: string, en: string) => (lang === 'ar' ? ar : en)

export const PRIORITY_LABEL = () => ({
  low: L('منخفضة', 'Low'), normal: L('عادية', 'Normal'), high: L('عالية', 'High'), urgent: L('عاجلة', 'Urgent'),
})
export const STATUS_LABEL = () => ({
  inbox: L('الوارد', 'Inbox'), planned: L('مخطط لها', 'Planned'), in_progress: L('قيد التنفيذ', 'In progress'),
  waiting: L('بانتظار رد', 'Waiting'), completed: L('مكتملة', 'Completed'), cancelled: L('ملغاة', 'Cancelled'),
  archived: L('مؤرشفة', 'Archived'),
})
export const EVENT_TYPE_LABEL = () => ({
  work: L('موعد عمل', 'Work appointment'), personal: L('موعد شخصي', 'Personal'), deadline: L('موعد نهائي', 'Deadline'),
  reminder: L('تذكير', 'Reminder'), occasion: L('مناسبة شخصية', 'Personal occasion'), travel: L('سفر / التزام مهم', 'Travel / commitment'),
  meeting: L('اجتماع', 'Meeting'), break: L('استراحة', 'Break'), focus: L('جلسة تركيز', 'Focus session'),
  leave: L('إجازة', 'Leave'), holiday: L('عطلة رسمية', 'Public holiday'), task: L('مهمة', 'Task'),
})
export const LEAVE_TYPE_LABEL = () => ({
  annual: L('إجازة اعتيادية', 'Annual leave'), sick: L('إجازة مرضية', 'Sick leave'), emergency: L('إجازة طارئة', 'Emergency leave'),
  unpaid: L('إجازة بدون راتب', 'Unpaid leave'), study: L('إجازة دراسية', 'Study leave'), other: L('أخرى', 'Other'),
})
export const REMINDER_OPTIONS = () => [
  { v: 0, l: L('عند الموعد', 'At time') },
  { v: 10, l: L('قبل 10 دقائق', '10 min before') },
  { v: 30, l: L('قبل 30 دقيقة', '30 min before') },
  { v: 60, l: L('قبل ساعة', '1 hour before') },
  { v: 1440, l: L('قبل يوم', '1 day before') },
]
