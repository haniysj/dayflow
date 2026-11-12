import { L, LEAVE_TYPE_LABEL } from './i18n'
import type { LeaveTypeDef, Settings } from './types'

export const BUILTIN_LEAVE = ['annual', 'sick', 'emergency', 'unpaid', 'study', 'other']

/** The leave types in use: the user's list from Settings, or the built-in list */
export function leaveTypes(s: Settings): LeaveTypeDef[] {
  if (s.leaveTypes?.length) return s.leaveTypes
  return BUILTIN_LEAVE.map(id => ({ id, countWeekends: true }))
}

export function leaveTypeName(s: Settings, id: string) {
  const def = leaveTypes(s).find(t => t.id === id)
  return def?.name?.trim() || (LEAVE_TYPE_LABEL() as Record<string, string>)[id] || L('إجازة', 'Leave')
}

/** Does this leave type count the weekend days it covers? */
export function typeCountsWeekends(s: Settings, id?: string) {
  if (!id) return s.leaveCountWeekends !== false
  const def = leaveTypes(s).find(t => t.id === id)
  return def ? def.countWeekends : true
}
