'use client'

import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Loader2, Redo2, Sparkles, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/format'

type Labels = {
  title: string
  subtitle: string
  placeholder: string
  send: string
  you: string
  assistant: string
  buildIt: string
  cancel: string
  working: string
  emptyHint: string
  example1: string
  example2: string
  example3: string
  building: string
  cancelled: string
  done: string
  error: string
  undo: string
  redo: string
}

type ContractWhich = 'active' | 'past' | 'oldestPast'

type ClosedContractRef = { id: number; previousEndDate: string | null }

type ContractSnapshot = {
  name: string
  start_date: string
  end_date: string | null
  platforms: string
  goal_instagram: number
  goal_tiktok: number
  target_instagram: number
  target_tiktok: number
  base_amount: number
  commission_amount: number | null
}

type CreatorSnapshot = {
  name: string
  project_id: number | null
  platforms: string
  goal_instagram: number
  goal_tiktok: number
  pay_every_days: number
  notes: string | null
  last_paid_at: string | null
}

type ContractRecreate = {
  creatorUsername: string
  contractName?: string
  startDate?: string
  endDate?: string | null
  durationDays?: number | null
  targetInstagram?: number
  targetTiktok?: number
  goalInstagram?: number
  goalTiktok?: number
  platforms?: string
  baseAmount?: number
  commissionAmount?: number | null
  replaceOpen?: boolean
}

type UpdateContractRecreate = {
  creatorUsername: string
  contractId?: number
  contractName?: string
  which?: ContractWhich
  name?: string
  startDate?: string
  endDate?: string | null
  durationDays?: number | null
  targetInstagram?: number
  targetTiktok?: number
  goalInstagram?: number
  goalTiktok?: number
  platforms?: string
  baseAmount?: number
  commissionAmount?: number | null
  recordAsPaid?: boolean
}

type PaymentRecreate = {
  creatorUsername: string
  amount: number
  paidOn?: string
  note?: string | null
  linkActiveContract?: boolean
  contractId?: number | null
  contractName?: string
  preferPastContract?: boolean
}

type CreatorRecreate = {
  username: string
  projectId?: number | null
  platforms?: string
  goalInstagram?: number
  goalTiktok?: number
  payEveryDays?: number
  notes?: string | null
  lastPaidAt?: string | null
  contractName?: string
  contractStart?: string | null
}

type UpdateCreatorRecreate = {
  username: string
  newUsername?: string
  projectId?: number | null
  platforms?: string
  goalInstagram?: number
  goalTiktok?: number
  payEveryDays?: number
  notes?: string | null
  lastPaidAt?: string | null
}

type ProjectRecreate = { name: string }

type HistoryEntry =
  | {
      kind: 'contract'
      contractId: number
      creatorId: number
      closedContracts: ClosedContractRef[]
      recreate: ContractRecreate
    }
  | {
      kind: 'payment'
      paymentId: number
      creatorId: number
      recreate: PaymentRecreate
    }
  | {
      kind: 'update_contract'
      contractId: number
      creatorId: number
      previous: ContractSnapshot
      paymentId: number | null
      source: 'update' | 'end'
      recreate: UpdateContractRecreate
    }
  | {
      kind: 'past_as_paid'
      creatorId: number
      paymentIds: number[]
      username: string
    }
  | {
      kind: 'create_creator'
      creatorId: number
      recreate: CreatorRecreate
    }
  | {
      kind: 'update_creator'
      creatorId: number
      previous: CreatorSnapshot
      recreate: UpdateCreatorRecreate
    }
  | {
      kind: 'create_project'
      projectId: number
      recreate: ProjectRecreate
    }

const WRITE_TOOL_NAMES = new Set([
  'createContract',
  'updateContract',
  'endContract',
  'recordPayment',
  'recordPastAsPaid',
  'createCreator',
  'updateCreator',
  'createProject',
])

const READ_TOOL_LABELS: Record<string, string> = {
  listCreators: 'Looked up creators.',
  listProjects: 'Looked up projects.',
  lookupCreator: 'Looked up creator.',
  listContracts: 'Looked up contracts.',
  listPayments: 'Looked up payments.',
  getCreatorSnapshot: 'Looked up creator snapshot.',
  getPayDue: 'Checked pay due.',
  getMissesToday: 'Checked today’s misses.',
  paymentsTotalInRange: 'Checked payments total.',
  getPaidTotals: 'Checked paid totals.',
}

function textFromParts(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map((v) => Number(v)).filter((n) => Number.isFinite(n)) : []
}

function asClosedContracts(value: unknown): ClosedContractRef[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => asRecord(v))
    .filter((v) => Number.isFinite(Number(v.id)))
    .map((v) => ({
      id: Number(v.id),
      previousEndDate: v.previousEndDate == null ? null : String(v.previousEndDate),
    }))
}

// --- Previews (Build It cards) ---

function ContractPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.creatorUsername ?? '')
  const base = Number(input.baseAmount ?? 0)
  const tt = Number(input.targetTiktok ?? 0)
  const ig = Number(input.targetInstagram ?? 0)
  const days = input.durationDays != null ? Number(input.durationDays) : null
  const start = input.startDate ? String(input.startDate) : 'today'
  const end =
    input.endDate != null ? String(input.endDate) : days ? `${days} days` : 'open'

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">Create contract for @{username}</p>
      <ul className="list-inside list-disc text-muted-foreground">
        {tt > 0 ? <li key="tt">{tt} TikTok videos (total)</li> : null}
        {ig > 0 ? <li key="ig">{ig} Instagram videos (total)</li> : null}
        <li key="dates">
          {start} → {end}
        </li>
        {base > 0 ? <li key="base">Base pay {formatMoney(base)} (terms)</li> : null}
      </ul>
    </div>
  )
}

function contractRefLabel(input: Record<string, unknown>): string {
  if (input.contractName) return `“${String(input.contractName)}”`
  if (input.which) return `the ${String(input.which)} contract`
  if (input.contractId != null) return `contract #${String(input.contractId)}`
  return 'the contract'
}

function UpdateContractPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.creatorUsername ?? '')
  const base = input.baseAmount != null ? Number(input.baseAmount) : null
  const commission = input.commissionAmount != null ? Number(input.commissionAmount) : null
  const end =
    input.endDate === null
      ? 'open'
      : input.endDate != null
        ? String(input.endDate)
        : null
  const recordAsPaid = input.recordAsPaid === true

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">
        Update {contractRefLabel(input)} for @{username}
      </p>
      <ul className="list-inside list-disc text-muted-foreground">
        {base != null ? <li key="base">Base {formatMoney(base)}</li> : null}
        {commission != null ? (
          <li key="commission">Commission {formatMoney(commission)}</li>
        ) : null}
        {end != null ? <li key="end">Ends {end}</li> : null}
        {recordAsPaid ? (
          <li key="paid">Records base + commission as paid</li>
        ) : null}
      </ul>
    </div>
  )
}

function EndContractPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.creatorUsername ?? '')
  const end = input.endDate != null ? String(input.endDate) : 'today'
  const base = input.baseAmount != null ? Number(input.baseAmount) : null
  const commission = input.commissionAmount != null ? Number(input.commissionAmount) : null

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">
        End {contractRefLabel(input)} for @{username}
      </p>
      <ul className="list-inside list-disc text-muted-foreground">
        <li>Ends {end}</li>
        {base != null && <li>Base {formatMoney(base)}</li>}
        {commission != null && <li>Commission {formatMoney(commission)}</li>}
        <li>Records the balance as paid</li>
      </ul>
    </div>
  )
}

function PaymentPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.creatorUsername ?? '')
  const amount = Number(input.amount ?? 0)
  const paidOn = input.paidOn ? String(input.paidOn) : 'today'
  const target = input.contractName
    ? `“${String(input.contractName)}”`
    : input.preferPastContract
      ? 'most recent past contract'
      : input.contractId != null
        ? `contract #${String(input.contractId)}`
        : null

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">
        Record payment {formatMoney(amount)} → @{username}
      </p>
      <p className="text-muted-foreground">
        Paid on {paidOn}
        {target ? ` · ${target}` : ''}
      </p>
    </div>
  )
}

function RecordPastAsPaidPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.creatorUsername ?? '')
  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">Record past contracts as paid for @{username}</p>
      <p className="text-muted-foreground">
        Settles every non-current period’s typed base + commission.
      </p>
    </div>
  )
}

function CreateCreatorPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.username ?? '')
  const ig = Number(input.goalInstagram ?? 0)
  const tt = Number(input.goalTiktok ?? 0)
  const contractStart = input.contractStart ? String(input.contractStart) : null

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">Add creator @{username}</p>
      <ul className="list-inside list-disc text-muted-foreground">
        {ig > 0 && <li>{ig} Instagram/day</li>}
        {tt > 0 && <li>{tt} TikTok/day</li>}
        {contractStart && <li>Initial contract from {contractStart}</li>}
      </ul>
    </div>
  )
}

function UpdateCreatorPreview({ input }: { input: Record<string, unknown> }) {
  const username = String(input.username ?? '')
  const newUsername = input.newUsername != null ? String(input.newUsername) : null
  const ig = input.goalInstagram != null ? Number(input.goalInstagram) : null
  const tt = input.goalTiktok != null ? Number(input.goalTiktok) : null

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">Update creator @{username}</p>
      <ul className="list-inside list-disc text-muted-foreground">
        {newUsername && <li>Rename → @{newUsername}</li>}
        {ig != null && <li>{ig} Instagram/day</li>}
        {tt != null && <li>{tt} TikTok/day</li>}
      </ul>
    </div>
  )
}

function CreateProjectPreview({ input }: { input: Record<string, unknown> }) {
  const name = String(input.name ?? '')
  return (
    <div className="mt-2 space-y-1 text-sm">
      <p className="font-medium">Create project “{name}”</p>
    </div>
  )
}

function buildPreview(toolName: string, input: Record<string, unknown>): ReactNode {
  switch (toolName) {
    case 'createContract':
      return <ContractPreview input={input} />
    case 'updateContract':
      return <UpdateContractPreview input={input} />
    case 'endContract':
      return <EndContractPreview input={input} />
    case 'recordPayment':
      return <PaymentPreview input={input} />
    case 'recordPastAsPaid':
      return <RecordPastAsPaidPreview input={input} />
    case 'createCreator':
      return <CreateCreatorPreview input={input} />
    case 'updateCreator':
      return <UpdateCreatorPreview input={input} />
    case 'createProject':
      return <CreateProjectPreview input={input} />
    default:
      return null
  }
}

// --- input -> recreate mappers ---

function contractRecreateFromInput(input: Record<string, unknown>): ContractRecreate {
  return {
    creatorUsername: String(input.creatorUsername ?? ''),
    contractName:
      input.contractName != null ? String(input.contractName) : undefined,
    startDate: input.startDate != null ? String(input.startDate) : undefined,
    endDate:
      input.endDate === null
        ? null
        : input.endDate != null
          ? String(input.endDate)
          : undefined,
    durationDays:
      input.durationDays == null ? (input.durationDays as null | undefined) : Number(input.durationDays),
    targetInstagram:
      input.targetInstagram != null ? Number(input.targetInstagram) : undefined,
    targetTiktok:
      input.targetTiktok != null ? Number(input.targetTiktok) : undefined,
    goalInstagram:
      input.goalInstagram != null ? Number(input.goalInstagram) : undefined,
    goalTiktok: input.goalTiktok != null ? Number(input.goalTiktok) : undefined,
    platforms: input.platforms != null ? String(input.platforms) : undefined,
    baseAmount: input.baseAmount != null ? Number(input.baseAmount) : undefined,
    commissionAmount:
      input.commissionAmount == null
        ? (input.commissionAmount as null | undefined)
        : Number(input.commissionAmount),
    replaceOpen:
      input.replaceOpen != null ? Boolean(input.replaceOpen) : undefined,
  }
}

function updateContractRecreateFromInput(input: Record<string, unknown>): UpdateContractRecreate {
  return {
    creatorUsername: String(input.creatorUsername ?? ''),
    contractId: input.contractId != null ? Number(input.contractId) : undefined,
    contractName: input.contractName != null ? String(input.contractName) : undefined,
    which: input.which != null ? (String(input.which) as ContractWhich) : undefined,
    name: input.name != null ? String(input.name) : undefined,
    startDate: input.startDate != null ? String(input.startDate) : undefined,
    endDate:
      input.endDate === null
        ? null
        : input.endDate != null
          ? String(input.endDate)
          : undefined,
    durationDays:
      input.durationDays == null ? (input.durationDays as null | undefined) : Number(input.durationDays),
    targetInstagram:
      input.targetInstagram != null ? Number(input.targetInstagram) : undefined,
    targetTiktok: input.targetTiktok != null ? Number(input.targetTiktok) : undefined,
    goalInstagram: input.goalInstagram != null ? Number(input.goalInstagram) : undefined,
    goalTiktok: input.goalTiktok != null ? Number(input.goalTiktok) : undefined,
    platforms: input.platforms != null ? String(input.platforms) : undefined,
    baseAmount: input.baseAmount != null ? Number(input.baseAmount) : undefined,
    commissionAmount:
      input.commissionAmount == null
        ? (input.commissionAmount as null | undefined)
        : Number(input.commissionAmount),
    recordAsPaid: input.recordAsPaid != null ? Boolean(input.recordAsPaid) : undefined,
  }
}

function endContractRecreateFromInput(input: Record<string, unknown>): UpdateContractRecreate {
  return {
    creatorUsername: String(input.creatorUsername ?? ''),
    contractId: input.contractId != null ? Number(input.contractId) : undefined,
    contractName: input.contractName != null ? String(input.contractName) : undefined,
    which: input.which != null ? (String(input.which) as ContractWhich) : undefined,
    endDate: input.endDate != null ? String(input.endDate) : undefined,
    baseAmount: input.baseAmount != null ? Number(input.baseAmount) : undefined,
    commissionAmount:
      input.commissionAmount == null
        ? (input.commissionAmount as null | undefined)
        : Number(input.commissionAmount),
  }
}

function paymentRecreateFromInput(input: Record<string, unknown>): PaymentRecreate {
  return {
    creatorUsername: String(input.creatorUsername ?? ''),
    amount: Number(input.amount ?? 0),
    paidOn: input.paidOn != null ? String(input.paidOn) : undefined,
    note:
      input.note === null
        ? null
        : input.note != null
          ? String(input.note)
          : undefined,
    linkActiveContract:
      input.linkActiveContract != null
        ? Boolean(input.linkActiveContract)
        : undefined,
    contractId:
      input.contractId == null ? (input.contractId as null | undefined) : Number(input.contractId),
    contractName: input.contractName != null ? String(input.contractName) : undefined,
    preferPastContract:
      input.preferPastContract != null ? Boolean(input.preferPastContract) : undefined,
  }
}

function creatorRecreateFromInput(input: Record<string, unknown>): CreatorRecreate {
  return {
    username: String(input.username ?? ''),
    projectId: input.projectId == null ? (input.projectId as null | undefined) : Number(input.projectId),
    platforms: input.platforms != null ? String(input.platforms) : undefined,
    goalInstagram: input.goalInstagram != null ? Number(input.goalInstagram) : undefined,
    goalTiktok: input.goalTiktok != null ? Number(input.goalTiktok) : undefined,
    payEveryDays: input.payEveryDays != null ? Number(input.payEveryDays) : undefined,
    notes: input.notes == null ? (input.notes as null | undefined) : String(input.notes),
    lastPaidAt: input.lastPaidAt == null ? (input.lastPaidAt as null | undefined) : String(input.lastPaidAt),
    contractName: input.contractName != null ? String(input.contractName) : undefined,
    contractStart:
      input.contractStart == null ? (input.contractStart as null | undefined) : String(input.contractStart),
  }
}

function updateCreatorRecreateFromInput(input: Record<string, unknown>): UpdateCreatorRecreate {
  return {
    username: String(input.username ?? ''),
    newUsername: input.newUsername != null ? String(input.newUsername) : undefined,
    projectId: input.projectId == null ? (input.projectId as null | undefined) : Number(input.projectId),
    platforms: input.platforms != null ? String(input.platforms) : undefined,
    goalInstagram: input.goalInstagram != null ? Number(input.goalInstagram) : undefined,
    goalTiktok: input.goalTiktok != null ? Number(input.goalTiktok) : undefined,
    payEveryDays: input.payEveryDays != null ? Number(input.payEveryDays) : undefined,
    notes: input.notes == null ? (input.notes as null | undefined) : String(input.notes),
    lastPaidAt: input.lastPaidAt == null ? (input.lastPaidAt as null | undefined) : String(input.lastPaidAt),
  }
}

function projectRecreateFromInput(input: Record<string, unknown>): ProjectRecreate {
  return { name: String(input.name ?? '') }
}

export function AssistantChat({ labels }: { labels: Labels }) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const recordedToolIds = useRef(new Set<string>())

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/admin/assistant',
      }),
    [],
  )

  const { messages, sendMessage, addToolApprovalResponse, status, error, setMessages } =
    useChat({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    })

  const busy = status === 'submitted' || status === 'streaming' || historyBusy

  useEffect(() => {
    let added = false
    const next: HistoryEntry[] = []

    for (const message of messages) {
      for (const part of message.parts) {
        const type = part.type
        if (typeof type !== 'string' || !type.startsWith('tool-')) continue
        const toolCallId = (part as { toolCallId: string }).toolCallId
        if ((part as { state: string }).state !== 'output-available') continue
        if (recordedToolIds.current.has(toolCallId)) continue

        const output = asRecord((part as { output?: unknown }).output)
        if (output.ok === false) continue
        const toolInput = asRecord((part as { input?: unknown }).input)
        const toolName = type.slice(5)

        if (toolName === 'createContract') {
          const contractId = Number(output.contractId)
          const creatorId = Number(output.creatorId)
          if (!Number.isFinite(contractId) || !Number.isFinite(creatorId)) continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'contract',
            contractId,
            creatorId,
            closedContracts: asClosedContracts(output.closedContracts),
            recreate: contractRecreateFromInput(toolInput),
          })
          added = true
          continue
        }

        if (toolName === 'recordPayment') {
          const paymentId = Number(output.paymentId)
          const creatorId = Number(output.creatorId)
          if (!Number.isFinite(paymentId) || !Number.isFinite(creatorId)) continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'payment',
            paymentId,
            creatorId,
            recreate: paymentRecreateFromInput(toolInput),
          })
          added = true
          continue
        }

        if (toolName === 'updateContract' || toolName === 'endContract') {
          const contractId = Number(output.contractId)
          const creatorId = Number(output.creatorId)
          const previous = output.previous
          if (
            !Number.isFinite(contractId) ||
            !Number.isFinite(creatorId) ||
            !previous ||
            typeof previous !== 'object'
          )
            continue
          recordedToolIds.current.add(toolCallId)
          const source: 'update' | 'end' = toolName === 'endContract' ? 'end' : 'update'
          next.push({
            kind: 'update_contract',
            contractId,
            creatorId,
            previous: previous as ContractSnapshot,
            paymentId: output.paymentId == null ? null : Number(output.paymentId),
            source,
            recreate:
              source === 'end'
                ? endContractRecreateFromInput(toolInput)
                : updateContractRecreateFromInput(toolInput),
          })
          added = true
          continue
        }

        if (toolName === 'recordPastAsPaid') {
          const creatorId = Number(output.creatorId)
          if (!Number.isFinite(creatorId)) continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'past_as_paid',
            creatorId,
            paymentIds: asNumberArray(output.paymentIds),
            username: String(toolInput.creatorUsername ?? ''),
          })
          added = true
          continue
        }

        if (toolName === 'createCreator') {
          const creatorId = Number(output.creatorId)
          if (!Number.isFinite(creatorId)) continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'create_creator',
            creatorId,
            recreate: creatorRecreateFromInput(toolInput),
          })
          added = true
          continue
        }

        if (toolName === 'updateCreator') {
          const creatorId = Number(output.creatorId)
          const previous = output.previous
          if (!Number.isFinite(creatorId) || !previous || typeof previous !== 'object') continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'update_creator',
            creatorId,
            previous: previous as CreatorSnapshot,
            recreate: updateCreatorRecreateFromInput(toolInput),
          })
          added = true
          continue
        }

        if (toolName === 'createProject') {
          const projectId = Number(output.projectId)
          if (!Number.isFinite(projectId)) continue
          recordedToolIds.current.add(toolCallId)
          next.push({
            kind: 'create_project',
            projectId,
            recreate: projectRecreateFromInput(toolInput),
          })
          added = true
          continue
        }
      }
    }

    if (!added) return
    setUndoStack((prev) => [...prev, ...next])
    setRedoStack([])
    router.refresh()
  }, [messages, router])

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setInput('')
    setHistoryError(null)
    await sendMessage({ text: trimmed })
  }

  async function postHistory(body: Record<string, unknown>) {
    const res = await fetch('/api/admin/assistant/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || data.ok === false) {
      throw new Error(String(data.error ?? 'Request failed'))
    }
    return data
  }

  async function undoLast() {
    const entry = undoStack[undoStack.length - 1]
    if (!entry || busy) return
    setHistoryBusy(true)
    setHistoryError(null)
    try {
      switch (entry.kind) {
        case 'contract':
          await postHistory({
            op: 'undo_contract',
            contractId: entry.contractId,
            creatorId: entry.creatorId,
            closedContracts: entry.closedContracts,
          })
          break
        case 'payment':
          await postHistory({
            op: 'undo_payment',
            paymentId: entry.paymentId,
            creatorId: entry.creatorId,
          })
          break
        case 'update_contract':
          await postHistory({
            op: 'undo_update_contract',
            contractId: entry.contractId,
            creatorId: entry.creatorId,
            previous: entry.previous,
            paymentId: entry.paymentId,
          })
          break
        case 'past_as_paid':
          await postHistory({
            op: 'undo_past_as_paid',
            creatorId: entry.creatorId,
            paymentIds: entry.paymentIds,
          })
          break
        case 'create_creator':
          await postHistory({ op: 'undo_create_creator', creatorId: entry.creatorId })
          break
        case 'update_creator':
          await postHistory({
            op: 'undo_update_creator',
            creatorId: entry.creatorId,
            previous: entry.previous,
          })
          break
        case 'create_project':
          await postHistory({ op: 'undo_create_project', projectId: entry.projectId })
          break
      }
      setUndoStack((prev) => prev.slice(0, -1))
      setRedoStack((prev) => [...prev, entry])
      router.refresh()
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Undo failed')
    } finally {
      setHistoryBusy(false)
    }
  }

  async function redoLast() {
    const entry = redoStack[redoStack.length - 1]
    if (!entry || busy) return
    setHistoryBusy(true)
    setHistoryError(null)
    try {
      let rebuilt: HistoryEntry

      switch (entry.kind) {
        case 'contract': {
          const data = await postHistory({ op: 'redo_contract', recreate: entry.recreate })
          rebuilt = {
            kind: 'contract',
            contractId: Number(data.contractId),
            creatorId: Number(data.creatorId),
            closedContracts: asClosedContracts(data.closedContracts),
            recreate: entry.recreate,
          }
          break
        }
        case 'payment': {
          const data = await postHistory({ op: 'redo_payment', recreate: entry.recreate })
          rebuilt = {
            kind: 'payment',
            paymentId: Number(data.paymentId),
            creatorId: Number(data.creatorId),
            recreate: entry.recreate,
          }
          break
        }
        case 'update_contract': {
          const data = await postHistory({
            op: 'redo_update_contract',
            source: entry.source,
            recreate: entry.recreate,
          })
          rebuilt = {
            kind: 'update_contract',
            contractId: Number(data.contractId),
            creatorId: Number(data.creatorId),
            previous: asRecord(data.previous) as unknown as ContractSnapshot,
            paymentId: data.paymentId == null ? null : Number(data.paymentId),
            source: entry.source,
            recreate: entry.recreate,
          }
          break
        }
        case 'past_as_paid': {
          const data = await postHistory({ op: 'redo_past_as_paid', username: entry.username })
          rebuilt = {
            kind: 'past_as_paid',
            creatorId: Number(data.creatorId),
            paymentIds: asNumberArray(data.paymentIds),
            username: entry.username,
          }
          break
        }
        case 'create_creator': {
          const data = await postHistory({ op: 'redo_create_creator', recreate: entry.recreate })
          rebuilt = {
            kind: 'create_creator',
            creatorId: Number(data.creatorId),
            recreate: entry.recreate,
          }
          break
        }
        case 'update_creator': {
          const data = await postHistory({ op: 'redo_update_creator', recreate: entry.recreate })
          rebuilt = {
            kind: 'update_creator',
            creatorId: Number(data.creatorId),
            previous: asRecord(data.previous) as unknown as CreatorSnapshot,
            recreate: entry.recreate,
          }
          break
        }
        case 'create_project': {
          const data = await postHistory({ op: 'redo_create_project', recreate: entry.recreate })
          rebuilt = {
            kind: 'create_project',
            projectId: Number(data.projectId),
            recreate: entry.recreate,
          }
          break
        }
      }

      setRedoStack((prev) => prev.slice(0, -1))
      setUndoStack((prev) => [...prev, rebuilt])
      router.refresh()
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Redo failed')
    } finally {
      setHistoryBusy(false)
    }
  }

  function clearChat() {
    setMessages([])
    recordedToolIds.current.clear()
    setHistoryError(null)
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">{labels.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={busy || undoStack.length === 0}
            onClick={() => void undoLast()}
            title={labels.undo}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-accent/40 disabled:opacity-40"
          >
            <Undo2 className="size-3.5" />
            {labels.undo}
          </button>
          <button
            type="button"
            disabled={busy || redoStack.length === 0}
            onClick={() => void redoLast()}
            title={labels.redo}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs text-muted-foreground hover:bg-accent/40 disabled:opacity-40"
          >
            <Redo2 className="size-3.5" />
            {labels.redo}
          </button>
        </div>
      </div>

      <div className="flex max-h-[28rem] min-h-[12rem] flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{labels.emptyHint}</p>
            <div className="flex flex-wrap gap-2">
              {[labels.example1, labels.example2, labels.example3].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(ex)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground hover:border-primary/40 hover:bg-accent/40 disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === 'user'
                ? 'ml-8 bg-primary text-primary-foreground'
                : 'mr-8 bg-muted/60 text-foreground'
            }`}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
              {message.role === 'user' ? labels.you : labels.assistant}
            </div>
            {message.parts.map((part, i) => {
              const partKey = `${message.id}-part-${i}`
              if (part.type === 'text' && part.text) {
                return (
                  <p key={partKey} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                )
              }

              const type = part.type
              if (typeof type !== 'string' || !type.startsWith('tool-')) return null
              const toolName = type.slice(5)
              const toolCallId =
                'toolCallId' in part && typeof part.toolCallId === 'string'
                  ? part.toolCallId
                  : partKey

              if (WRITE_TOOL_NAMES.has(toolName)) {
                const toolInput = asRecord((part as { input?: unknown }).input)
                return (
                  <ToolBuildCard
                    key={partKey}
                    labels={labels}
                    state={(part as { state: string }).state}
                    approval={
                      'approval' in part
                        ? (part.approval as {
                            id: string
                            approved?: boolean
                            isAutomatic?: boolean
                          })
                        : undefined
                    }
                    preview={buildPreview(toolName, toolInput)}
                    output={
                      'output' in part
                        ? (part.output as Record<string, unknown> | undefined)
                        : undefined
                    }
                    onBuild={() =>
                      addToolApprovalResponse({
                        id: (part as { approval: { id: string } }).approval.id,
                        approved: true,
                      })
                    }
                    onCancel={() =>
                      addToolApprovalResponse({
                        id: (part as { approval: { id: string } }).approval.id,
                        approved: false,
                      })
                    }
                  />
                )
              }

              if (toolName in READ_TOOL_LABELS) {
                if ((part as { state: string }).state !== 'output-available') return null
                const output = asRecord((part as { output?: unknown }).output)
                const failed = output.ok === false
                return (
                  <p
                    key={partKey}
                    className={`mt-1 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {failed ? String(output.error ?? 'Lookup failed') : READ_TOOL_LABELS[toolName]}
                  </p>
                )
              }

              return null
            })}
            {message.role === 'assistant' &&
              !textFromParts(message) &&
              message.parts.every((p) => p.type !== 'text' && !p.type.startsWith('tool-')) &&
              status === 'streaming' && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {labels.working}
                </p>
              )}
          </div>
        ))}

        {(error || historyError) && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {labels.error}: {historyError ?? error?.message ?? 'Something went wrong.'}
          </p>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(input)
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={labels.placeholder}
          disabled={busy}
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {labels.send}
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={clearChat}
            className="h-10 shrink-0 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </form>
    </section>
  )
}

function ToolBuildCard({
  labels,
  state,
  approval,
  preview,
  output,
  onBuild,
  onCancel,
}: {
  labels: Labels
  state: string
  approval?: { id: string; approved?: boolean; isAutomatic?: boolean }
  preview: ReactNode
  output?: Record<string, unknown>
  onBuild: () => void
  onCancel: () => void
}) {
  if (state === 'input-streaming') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {labels.working}
      </div>
    )
  }

  if (state === 'approval-requested' && approval && !approval.isAutomatic) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-background p-3">
        {preview}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onBuild}
            className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground"
          >
            {labels.buildIt}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg border border-border px-3 text-xs font-medium"
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    )
  }

  if (state === 'approval-responded' || state === 'output-denied') {
    const approved = approval?.approved
    return (
      <div className="mt-2 rounded-lg border border-border bg-background p-3">
        {preview}
        <p className="mt-2 text-xs text-muted-foreground">
          {approved ? labels.building : labels.cancelled}
        </p>
      </div>
    )
  }

  if (state === 'output-available') {
    const ok = output?.ok !== false
    return (
      <div className="mt-2 rounded-lg border border-border bg-background p-3">
        {preview}
        <p
          className={`mt-2 text-xs ${ok ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {ok ? labels.done : String(output?.error ?? 'Failed')}
        </p>
      </div>
    )
  }

  return null
}
