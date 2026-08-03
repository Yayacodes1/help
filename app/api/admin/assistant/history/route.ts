import { z } from 'zod'
import { isAdmin } from '@/lib/admin-auth'
import {
  createContractFromAssistant,
  createCreatorFromAssistant,
  createProjectFromAssistant,
  endContractFromAssistant,
  recordPastAsPaidFromAssistant,
  recordPaymentFromAssistant,
  undoContractCreate,
  undoContractUpdate,
  undoCreatorCreate,
  undoCreatorUpdate,
  undoPastAsPaid,
  undoPaymentCreate,
  undoProjectCreate,
  updateContractFromAssistant,
  updateCreatorFromAssistant,
} from '@/lib/assistant-ops'

const closedContractSchema = z.object({
  id: z.number().int(),
  previousEndDate: z.string().nullable(),
})

const contractSnapshotSchema = z.object({
  name: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  platforms: z.string(),
  goal_instagram: z.number(),
  goal_tiktok: z.number(),
  target_instagram: z.number(),
  target_tiktok: z.number(),
  base_amount: z.number(),
  commission_amount: z.number().nullable(),
})

const creatorSnapshotSchema = z.object({
  name: z.string(),
  project_id: z.number().nullable(),
  platforms: z.string(),
  goal_instagram: z.number(),
  goal_tiktok: z.number(),
  pay_every_days: z.number(),
  notes: z.string().nullable(),
  last_paid_at: z.string().nullable(),
})

const contractRecreateSchema = z.object({
  creatorUsername: z.string(),
  contractName: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  durationDays: z.number().nullable().optional(),
  targetInstagram: z.number().optional(),
  targetTiktok: z.number().optional(),
  goalInstagram: z.number().optional(),
  goalTiktok: z.number().optional(),
  platforms: z.string().optional(),
  baseAmount: z.number().optional(),
  commissionAmount: z.number().nullable().optional(),
  replaceOpen: z.boolean().optional(),
})

const updateContractRecreateSchema = z.object({
  creatorUsername: z.string(),
  contractId: z.number().int().optional(),
  contractName: z.string().optional(),
  which: z.enum(['active', 'past', 'oldestPast']).optional(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  durationDays: z.number().nullable().optional(),
  targetInstagram: z.number().optional(),
  targetTiktok: z.number().optional(),
  goalInstagram: z.number().optional(),
  goalTiktok: z.number().optional(),
  platforms: z.string().optional(),
  baseAmount: z.number().optional(),
  commissionAmount: z.number().nullable().optional(),
  recordAsPaid: z.boolean().optional(),
})

const paymentRecreateSchema = z.object({
  creatorUsername: z.string(),
  amount: z.number(),
  paidOn: z.string().optional(),
  note: z.string().nullable().optional(),
  linkActiveContract: z.boolean().optional(),
  contractId: z.number().nullable().optional(),
  contractName: z.string().optional(),
  preferPastContract: z.boolean().optional(),
})

const creatorRecreateSchema = z.object({
  username: z.string(),
  projectId: z.number().nullable().optional(),
  platforms: z.string().optional(),
  goalInstagram: z.number().optional(),
  goalTiktok: z.number().optional(),
  payEveryDays: z.number().optional(),
  notes: z.string().nullable().optional(),
  lastPaidAt: z.string().nullable().optional(),
  contractName: z.string().optional(),
  contractStart: z.string().nullable().optional(),
})

const updateCreatorRecreateSchema = z.object({
  username: z.string(),
  newUsername: z.string().optional(),
  projectId: z.number().nullable().optional(),
  platforms: z.string().optional(),
  goalInstagram: z.number().optional(),
  goalTiktok: z.number().optional(),
  payEveryDays: z.number().optional(),
  notes: z.string().nullable().optional(),
  lastPaidAt: z.string().nullable().optional(),
})

const projectRecreateSchema = z.object({
  name: z.string(),
})

const bodySchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('undo_contract'),
    contractId: z.number().int(),
    creatorId: z.number().int(),
    closedContracts: z.array(closedContractSchema).nullable().optional(),
  }),
  z.object({
    op: z.literal('redo_contract'),
    recreate: contractRecreateSchema,
  }),
  z.object({
    op: z.literal('undo_payment'),
    paymentId: z.number().int(),
    creatorId: z.number().int(),
  }),
  z.object({
    op: z.literal('redo_payment'),
    recreate: paymentRecreateSchema,
  }),
  z.object({
    op: z.literal('undo_update_contract'),
    contractId: z.number().int(),
    creatorId: z.number().int(),
    previous: contractSnapshotSchema,
    paymentId: z.number().int().nullable().optional(),
  }),
  z.object({
    op: z.literal('redo_update_contract'),
    source: z.enum(['update', 'end']),
    recreate: updateContractRecreateSchema,
  }),
  z.object({
    op: z.literal('undo_past_as_paid'),
    creatorId: z.number().int(),
    paymentIds: z.array(z.number().int()),
  }),
  z.object({
    op: z.literal('redo_past_as_paid'),
    username: z.string(),
  }),
  z.object({
    op: z.literal('undo_create_creator'),
    creatorId: z.number().int(),
  }),
  z.object({
    op: z.literal('redo_create_creator'),
    recreate: creatorRecreateSchema,
  }),
  z.object({
    op: z.literal('undo_update_creator'),
    creatorId: z.number().int(),
    previous: creatorSnapshotSchema,
  }),
  z.object({
    op: z.literal('redo_update_creator'),
    recreate: updateCreatorRecreateSchema,
  }),
  z.object({
    op: z.literal('undo_create_project'),
    projectId: z.number().int(),
  }),
  z.object({
    op: z.literal('redo_create_project'),
    recreate: projectRecreateSchema,
  }),
])

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const body = parsed.data

  if (body.op === 'undo_contract') {
    const result = await undoContractCreate({
      contractId: body.contractId,
      creatorId: body.creatorId,
      closedContracts: body.closedContracts ?? null,
    })
    return Response.json(result)
  }

  if (body.op === 'redo_contract') {
    const result = await createContractFromAssistant(body.recreate)
    return Response.json(result)
  }

  if (body.op === 'undo_payment') {
    const result = await undoPaymentCreate({
      paymentId: body.paymentId,
      creatorId: body.creatorId,
    })
    return Response.json(result)
  }

  if (body.op === 'redo_payment') {
    const result = await recordPaymentFromAssistant(body.recreate)
    return Response.json(result)
  }

  if (body.op === 'undo_update_contract') {
    const result = await undoContractUpdate({
      contractId: body.contractId,
      creatorId: body.creatorId,
      previous: body.previous,
      paymentId: body.paymentId ?? null,
    })
    return Response.json(result)
  }

  if (body.op === 'redo_update_contract') {
    const result =
      body.source === 'end'
        ? await endContractFromAssistant(body.recreate)
        : await updateContractFromAssistant(body.recreate)
    return Response.json(result)
  }

  if (body.op === 'undo_past_as_paid') {
    const result = await undoPastAsPaid({
      creatorId: body.creatorId,
      paymentIds: body.paymentIds,
    })
    return Response.json(result)
  }

  if (body.op === 'redo_past_as_paid') {
    const result = await recordPastAsPaidFromAssistant(body.username)
    return Response.json(result)
  }

  if (body.op === 'undo_create_creator') {
    const result = await undoCreatorCreate({ creatorId: body.creatorId })
    return Response.json(result)
  }

  if (body.op === 'redo_create_creator') {
    const result = await createCreatorFromAssistant(body.recreate)
    return Response.json(result)
  }

  if (body.op === 'undo_update_creator') {
    const result = await undoCreatorUpdate({
      creatorId: body.creatorId,
      previous: body.previous,
    })
    return Response.json(result)
  }

  if (body.op === 'redo_update_creator') {
    const result = await updateCreatorFromAssistant(body.recreate)
    return Response.json(result)
  }

  if (body.op === 'undo_create_project') {
    const result = await undoProjectCreate({ projectId: body.projectId })
    return Response.json(result)
  }

  const result = await createProjectFromAssistant(body.recreate)
  return Response.json(result)
}
