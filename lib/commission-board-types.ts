/** Client-safe commission board shape (no server-only imports). */
import type { CommissionBoard, CommissionTerms } from '@/lib/commission'

export type MajorityCommissionBoard = CommissionBoard & {
  month: string
  majorityPct: number
  totalUsd: number
  earnersOnly: boolean
  contractCount: number
  months: string[]
}

export type { CommissionBoard, CommissionTerms }
