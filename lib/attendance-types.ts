export type AttendanceStatus = 'hit' | 'partial' | 'miss' | 'break'

export type AttendancePerson = {
  id: number
  name: string
  role: 'creator' | 'reposter'
  status: AttendanceStatus
  todayInstagram: number
  todayTiktok: number
  goalInstagram: number
  goalTiktok: number
  missStreak: number
  contractStrikes: number
  maxStrikes: number
  contractId: number | null
  contractName: string | null
}

export type AttendanceReport = {
  day: string
  opToday: string
  dayLabel: string
  people: AttendancePerson[]
}
