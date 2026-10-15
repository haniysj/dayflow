import { createContext, useContext } from 'react'
import type { CalEvent, Settings, Task } from './lib/types'

export type View = 'today' | 'calendar' | 'tasks' | 'categories' | 'leave' | 'reports' | 'settings'

export interface QuickAddDefaults { kind?: 'task' | 'event' | 'note'; date?: string | null; time?: string | null; endTime?: string | null; projectId?: string; categoryId?: string }

export interface AppCtx {
  settings: Settings
  view: View
  go: (v: View, params?: Record<string, string>) => void
  params: Record<string, string>
  editTask: (t: Task | Partial<Task>) => void
  editEvent: (e: CalEvent | Partial<CalEvent>, instanceDate?: string) => void
  quickAdd: (d?: QuickAddDefaults) => void
  openSearch: () => void
  openReminders: () => void
  openPlanTomorrow: () => void
  openReview: (date?: string) => void
}

export const Ctx = createContext<AppCtx>(null as any)
export const useApp = () => useContext(Ctx)
