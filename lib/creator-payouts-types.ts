export type PayerGroup = 'yahya' | 'ahmed'
export type PayoutMethod = 'paypal' | 'bank'

export type CreatorPayoutRow = {
  creatorId: number
  name: string
  role: string
  payerGroup: PayerGroup
  method: PayoutMethod | null
  paypalEmail: string | null
  paypalUsername: string | null
  bankName: string | null
  accountHolderName: string | null
  iban: string | null
  phone: string | null
  city: string | null
  baseAmount: number
  commissionAmount: number
  totalAmount: number
  currency: 'SAR' | 'USD'
  dueOn: string | null
  infoFilled: boolean
  defaults: {
    baseAmount: number
    commissionAmount: number
    totalAmount: number
    currency: 'SAR' | 'USD'
    dueOn: string | null
  }
  overrides: {
    baseAmount: number | null
    commissionAmount: number | null
    totalAmount: number | null
    currency: 'SAR' | 'USD' | null
    dueOn: string | null
  }
  updatedAt: string | null
  updatedBy: string | null
}

export type CreatorPayoutCandidate = {
  creatorId: number
  name: string
  role: string
  payerGroup: PayerGroup | null
}

export type CreatorPayoutBoard = {
  yahya: CreatorPayoutRow[]
  ahmed: CreatorPayoutRow[]
  candidates: CreatorPayoutCandidate[]
  filledCount: number
  missingCount: number
}
