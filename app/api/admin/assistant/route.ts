import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { isAdmin } from '@/lib/admin-auth'
import { getPaymentsTotalInRange, getServerToday } from '@/lib/queries'
import {
  createContractFromAssistant,
  createCreatorFromAssistant,
  createProjectFromAssistant,
  endContractFromAssistant,
  getCreatorSnapshot,
  getMissesSnapshot,
  getPaidTotalsSnapshot,
  getPayDueSnapshot,
  getViewsByDaySnapshot,
  getViewsLeaderboardSnapshot,
  getViewsSummarySnapshot,
  listContractsForCreator,
  listCreatorsBrief,
  listPaymentsForCreator,
  listProjectsBrief,
  recordPastAsPaidFromAssistant,
  recordPaymentFromAssistant,
  resolveCreator,
  updateContractFromAssistant,
  updateCreatorFromAssistant,
} from '@/lib/assistant-ops'

export const maxDuration = 60

const CONTRACT_WHICH = z
  .enum(['active', 'past', 'oldestPast'])
  .describe(
    '"active" = current/open period, "past" = most recently ended period, "oldestPast" = earliest ended period',
  )

function getModel() {
  if (process.env.OPENAI_API_KEY) {
    return openai('gpt-4o-mini')
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    return 'openai/gpt-4o-mini' as const
  }
  return null
}

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const model = getModel()
  if (!model) {
    return Response.json(
      {
        error:
          'Assistant is unavailable right now. Try again in a moment.',
      },
      { status: 503 },
    )
  }

  const { messages }: { messages: UIMessage[] } = await req.json()
  const today = await getServerToday()

  const result = streamText({
    model,
    system: `You are the admin-only assistant for a creator performance, contracts & payments dashboard.
Today's date is ${today} (YYYY-MM-DD).

You can read almost anything in the dashboard (creators, projects, contracts, payments, pay-due list,
today's misses, paid totals, AND views / video analytics) and you can write contracts, payments, creators,
and projects — but every write only happens after the admin taps Build It in the UI. You never apply a write yourself.

Creators are identified by their TikTok username (the "name" field).

Reply style (required):
- First line: quote the user's latest message EXACTLY — copy/paste their words inside double quotes. Do not paraphrase.
- For write actions: one short sentence asking them to tap Build It if the draft looks right (or ask one clarifying question if details are missing).
- For read/lookup questions (including views, leaderboards, trends): answer directly with the numbers/facts from the tool result — no Build It needed. Add one short advice sentence when the tool returns an "advice" field.
- Do not claim you already built anything. Writes only run after the admin taps Build It.
- If you propose multiple write tool calls in one turn (e.g. one contract paid + one contract started), that's fine — each gets its own Build It card.

Views & analytics (read-only):
- Use getViewsSummary for totals (views, videos, IG vs TikTok split, zero-view count) over a date range or creator.
- Use getViewsLeaderboard for “who got the most views” / ranking creators in a period.
- Use getViewsByDay for trends / best day / Instagram vs TikTok by day.
- Default a missing date range to the last 30 days ending today when the user says “recently” / “this month” without dates.
- When giving advice: be concrete (names, numbers, dates). Mention if many videos still show 0 views.

Multi-step / multi-period requests (IMPORTANT):
- Requests like "first contract paid $32, second started at $30 for @username" describe TWO different
  periods for the SAME creator. Before proposing any write, call listContracts (or getCreatorSnapshot)
  for that creator so you know which contract is which (by start/end date, order, or name) — never guess ids.
- Map ordinal language ("first", "second", "last", "previous", "the old one") to which:"oldestPast",
  which:"past", or which:"active" — or to a specific contractId/contractName you saw in listContracts.
- Money tied to a PAST / already-ended period → that money was already paid. Use recordPayment with
  contractId/contractName (or preferPastContract: true) so it lands on the right period, OR use
  recordPastAsPaid to settle all outstanding past periods at once when the admin means "everything before now".
- Money tied to the CURRENT / new / still-running period → set terms with createContract or
  updateContract (baseAmount). You MAY also call recordPayment on the current/active contract when the
  admin says they already paid (or are paying now/upfront) — paying mid-contract is allowed and common.
  Do NOT invent a payment if they only set terms and did not say they paid.
- Prefer updateContract over creating a duplicate contract when the admin is clearly correcting or
  finishing details on a period that already exists (check listContracts first).
- To close out a period (mark it ended and settle its money), use endContract — it sets the end date and
  records the terms as paid in one step.

General rules:
- Always resolve the creator with lookupCreator, getCreatorSnapshot, or listContracts before proposing
  any write tool — never invent a username. Only use usernames that came back from a tool result.
- If the request could apply to more than one creator, more than one contract on that creator, or is
  unclear about "paid already" vs "these are just the terms", ask ONE short clarifying question instead
  of guessing. Do not call a write tool until it's resolved.
- If the user asks "how much did I pay / how much is due", call getPaidTotals or getPayDue (read-only,
  no Build It). Use paymentsTotalInRange for a plain date-range sum.
- If the user gives total videos without specifying Instagram vs TikTok, put them on TikTok (targetTiktok)
  and set platforms to "tiktok" unless they clearly mean Instagram or both.
- Set platforms to "tiktok", "instagram", or "both" on createContract/updateContract.
- If they give a duration (e.g. 30 days, 1 month ≈ 30 days, 2 weeks = 14 days), set durationDays. Prefer
  an end date from duration unless they want open-ended.
- If they only give daily cadence (e.g. 1 TikTok/day for a month), set goalTiktok and targetTiktok =
  daily × days, plus durationDays.
- For a new period when the creator already has contracts, createContract closes ALL contracts that
  overlap the new start date and starts the next one — that's expected and matches "start a new period".
- If something is missing (username, amount, video count, which contract), ask one clear follow-up
  question and do not call write tools yet.
- Never invent creator usernames, project names, or contract ids — only use ones that exist in tool results.`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(12),
    toolApproval: {
      createContract: 'user-approval',
      updateContract: 'user-approval',
      endContract: 'user-approval',
      recordPayment: 'user-approval',
      recordPastAsPaid: 'user-approval',
      createCreator: 'user-approval',
      updateCreator: 'user-approval',
      createProject: 'user-approval',
    },
    experimental_toolApprovalSecret:
      process.env.TOOL_APPROVAL_SECRET || process.env.ADMIN_PASSWORD,
    tools: {
      // --- Read tools (no approval needed) ---
      listCreators: tool({
        description: 'List all creators (TikTok usernames) in the dashboard.',
        inputSchema: z.object({}),
        execute: async () => {
          const creators = await listCreatorsBrief()
          return { count: creators.length, creators }
        },
      }),
      listProjects: tool({
        description: 'List all projects in the dashboard.',
        inputSchema: z.object({}),
        execute: async () => {
          const projects = await listProjectsBrief()
          return { count: projects.length, projects }
        },
      }),
      lookupCreator: tool({
        description:
          'Look up a creator by TikTok username and see their active contract. Use before any write.',
        inputSchema: z.object({
          username: z.string().describe('TikTok username / creator name in the dashboard'),
        }),
        execute: async ({ username }) => resolveCreator(username),
      }),
      listContracts: tool({
        description:
          'List every contract period for a creator (id, name, dates, active/past, base, commission, paid, balance, video targets). Call this before writing on any multi-period request so you know which contract is which.',
        inputSchema: z.object({
          username: z.string().describe('TikTok username'),
        }),
        execute: async ({ username }) => listContractsForCreator(username),
      }),
      listPayments: tool({
        description: 'List recorded payments for a creator, newest first.',
        inputSchema: z.object({
          username: z.string().describe('TikTok username'),
        }),
        execute: async ({ username }) => listPaymentsForCreator(username),
      }),
      getCreatorSnapshot: tool({
        description:
          'Full read-only snapshot for one creator: profile, active contract, all contracts, paid total, last payment, and pay schedule.',
        inputSchema: z.object({
          username: z.string().describe('TikTok username'),
        }),
        execute: async ({ username }) => getCreatorSnapshot(username),
      }),
      getPayDue: tool({
        description:
          'List creators/contracts with money due (ended contracts not yet fully recorded as paid) and recently settled ones.',
        inputSchema: z.object({
          projectId: z.number().int().optional().describe('Optional project filter'),
        }),
        execute: async ({ projectId }) => getPayDueSnapshot(projectId),
      }),
      getMissesToday: tool({
        description: 'List creators who missed or only partially hit their daily goal on a given day (defaults to today).',
        inputSchema: z.object({
          day: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
        }),
        execute: async ({ day }) => getMissesSnapshot(day),
      }),
      paymentsTotalInRange: tool({
        description:
          'Sum recorded payments between two dates (inclusive). Use for “how much did I pay from X to Y”.',
        inputSchema: z.object({
          from: z.string().describe('YYYY-MM-DD start'),
          to: z.string().describe('YYYY-MM-DD end'),
          creatorUsername: z
            .string()
            .optional()
            .describe('Optional TikTok username to filter one creator'),
        }),
        execute: async ({ from, to, creatorUsername }) => {
          let creatorId: number | undefined
          if (creatorUsername) {
            const resolved = await resolveCreator(creatorUsername)
            if (!resolved.ok) return resolved
            creatorId = resolved.creator.id
          }
          const total = await getPaymentsTotalInRange(from, to, creatorId)
          return {
            ok: true as const,
            from,
            to,
            creator: creatorUsername?.replace(/^@+/, '') ?? null,
            total,
          }
        },
      }),
      getPaidTotals: tool({
        description:
          'Paid totals for a date range AND all-time, optionally filtered by creator or project. Prefer this over paymentsTotalInRange when the admin also wants the all-time figure.',
        inputSchema: z.object({
          projectId: z.number().int().optional(),
          from: z.string().optional().describe('YYYY-MM-DD; defaults to start of this year'),
          to: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
          creatorUsername: z.string().optional(),
        }),
        execute: async (input) => getPaidTotalsSnapshot(input),
      }),
      getViewsSummary: tool({
        description:
          'Views + video totals for a date range (Instagram vs TikTok split, zero-view count). Use for “how many views do we have” and light advice.',
        inputSchema: z.object({
          from: z.string().optional().describe('YYYY-MM-DD; defaults to start of year if omitted with to, or last 30 days when both omitted — pass last-30 when user says recently'),
          to: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
          creatorUsername: z.string().optional(),
          projectId: z.number().int().optional(),
        }),
        execute: async (input) => {
          // If no dates, default last 30 days for “advice” style questions
          if (!input.from && !input.to) {
            const { addDays } = await import('@/lib/campaign')
            const end = today
            const start = addDays(today, -29)
            return getViewsSummarySnapshot({ ...input, from: start, to: end })
          }
          return getViewsSummarySnapshot(input)
        },
      }),
      getViewsLeaderboard: tool({
        description:
          'Rank creators by total views in a period. Use for “who is making us the most views”.',
        inputSchema: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          projectId: z.number().int().optional(),
          limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async (input) => {
          if (!input.from && !input.to) {
            const { addDays } = await import('@/lib/campaign')
            return getViewsLeaderboardSnapshot({
              ...input,
              from: addDays(today, -29),
              to: today,
            })
          }
          return getViewsLeaderboardSnapshot(input)
        },
      }),
      getViewsByDay: tool({
        description:
          'Daily views and video counts (IG/TT) for trends, peak days, or one creator over time.',
        inputSchema: z.object({
          from: z.string().optional(),
          to: z.string().optional(),
          creatorUsername: z.string().optional(),
          projectId: z.number().int().optional(),
        }),
        execute: async (input) => {
          if (!input.from && !input.to) {
            const { addDays } = await import('@/lib/campaign')
            return getViewsByDaySnapshot({
              ...input,
              from: addDays(today, -29),
              to: today,
            })
          }
          return getViewsByDaySnapshot(input)
        },
      }),

      // --- Write tools (Build It approval required) ---
      createContract: tool({
        description:
          'Create a new contract for a creator (or start a new period, closing overlapping ones). Requires admin approval in the UI.',
        inputSchema: z.object({
          creatorUsername: z.string().describe('TikTok username'),
          contractName: z
            .string()
            .optional()
            .describe('Optional label, e.g. "August round"'),
          startDate: z
            .string()
            .optional()
            .describe('YYYY-MM-DD; defaults to today'),
          endDate: z
            .string()
            .nullable()
            .optional()
            .describe('YYYY-MM-DD inclusive end, or null for open-ended'),
          durationDays: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional()
            .describe('If endDate omitted, end = start + durationDays - 1'),
          targetInstagram: z.number().int().min(0).optional(),
          targetTiktok: z.number().int().min(0).optional(),
          goalInstagram: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Daily IG goal; auto-estimated from targets if omitted'),
          goalTiktok: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe('Daily TT goal; auto-estimated from targets if omitted'),
          platforms: z
            .enum(['both', 'instagram', 'tiktok'])
            .optional()
            .describe('Which networks they must post on'),
          baseAmount: z.number().min(0).optional().describe('Base pay for the period (terms, not yet paid)'),
          commissionAmount: z.number().min(0).nullable().optional(),
          replaceOpen: z
            .boolean()
            .optional()
            .describe('Close overlapping contracts and start new (default true)'),
        }),
        execute: async (input) => createContractFromAssistant(input),
      }),
      updateContract: tool({
        description:
          'Update an existing contract period (terms, dates, targets). Find it via contractId, contractName, or which. If the new end date is in the past (or recordAsPaid is set), the base+commission gap is recorded as a payment automatically. Requires admin approval in the UI.',
        inputSchema: z.object({
          creatorUsername: z.string(),
          contractId: z.number().int().optional(),
          contractName: z.string().optional().describe('Match by (partial) contract name'),
          which: CONTRACT_WHICH.optional(),
          name: z.string().optional().describe('New display name'),
          startDate: z.string().optional(),
          endDate: z.string().nullable().optional(),
          durationDays: z.number().int().positive().nullable().optional(),
          targetInstagram: z.number().int().min(0).optional(),
          targetTiktok: z.number().int().min(0).optional(),
          goalInstagram: z.number().int().min(0).optional(),
          goalTiktok: z.number().int().min(0).optional(),
          platforms: z.enum(['both', 'instagram', 'tiktok']).optional(),
          baseAmount: z.number().min(0).optional(),
          commissionAmount: z.number().min(0).nullable().optional(),
          recordAsPaid: z
            .boolean()
            .optional()
            .describe('Force recording base+commission as paid even if not ended yet'),
        }),
        execute: async (input) => updateContractFromAssistant(input),
      }),
      endContract: tool({
        description:
          'End a contract period (default: the active one) as of endDate (default today) and record its base+commission as paid. Requires admin approval in the UI.',
        inputSchema: z.object({
          creatorUsername: z.string(),
          contractId: z.number().int().optional(),
          contractName: z.string().optional(),
          which: CONTRACT_WHICH.optional().describe('Defaults to "active"'),
          endDate: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
          baseAmount: z.number().min(0).optional().describe('Update base pay before settling'),
          commissionAmount: z.number().min(0).nullable().optional(),
        }),
        execute: async (input) => endContractFromAssistant(input),
      }),
      recordPayment: tool({
        description:
          'Record that a creator was paid a specific amount. Use contractId/contractName or preferPastContract to attach it to the right period. Requires admin approval in the UI.',
        inputSchema: z.object({
          creatorUsername: z.string(),
          amount: z.number().positive(),
          paidOn: z
            .string()
            .optional()
            .describe('YYYY-MM-DD; defaults to today'),
          note: z.string().nullable().optional(),
          linkActiveContract: z
            .boolean()
            .optional()
            .describe('Attach to active contract (default true)'),
          contractId: z.number().int().nullable().optional(),
          contractName: z.string().optional().describe('Match by (partial) contract name'),
          preferPastContract: z
            .boolean()
            .optional()
            .describe('Attach to the most recently ended contract instead of the active one'),
        }),
        execute: async (input) => recordPaymentFromAssistant(input),
      }),
      recordPastAsPaid: tool({
        description:
          'Settle every non-current contract for a creator by recording its typed base+commission as paid (bulk equivalent of "Record past amounts as paid"). Requires admin approval in the UI.',
        inputSchema: z.object({
          creatorUsername: z.string(),
        }),
        execute: async ({ creatorUsername }) => recordPastAsPaidFromAssistant(creatorUsername),
      }),
      createCreator: tool({
        description: 'Add a new creator (TikTok username) to the dashboard. Requires admin approval in the UI.',
        inputSchema: z.object({
          username: z.string(),
          projectId: z.number().int().nullable().optional(),
          platforms: z.enum(['both', 'instagram', 'tiktok']).optional(),
          goalInstagram: z.number().int().min(0).optional(),
          goalTiktok: z.number().int().min(0).optional(),
          payEveryDays: z.number().int().min(1).max(365).optional(),
          notes: z.string().nullable().optional(),
          lastPaidAt: z.string().nullable().optional(),
          contractName: z.string().optional(),
          contractStart: z.string().nullable().optional().describe('If set, also creates an initial contract'),
        }),
        execute: async (input) => createCreatorFromAssistant(input),
      }),
      updateCreator: tool({
        description:
          'Update a creator profile (rename, move project, change goals/platforms/notes/pay schedule). Requires admin approval in the UI.',
        inputSchema: z.object({
          username: z.string(),
          newUsername: z.string().optional(),
          projectId: z.number().int().nullable().optional(),
          platforms: z.enum(['both', 'instagram', 'tiktok']).optional(),
          goalInstagram: z.number().int().min(0).optional(),
          goalTiktok: z.number().int().min(0).optional(),
          payEveryDays: z.number().int().min(1).max(365).optional(),
          notes: z.string().nullable().optional(),
          lastPaidAt: z.string().nullable().optional(),
        }),
        execute: async (input) => updateCreatorFromAssistant(input),
      }),
      createProject: tool({
        description: 'Create a new project. Requires admin approval in the UI.',
        inputSchema: z.object({
          name: z.string(),
        }),
        execute: async (input) => createProjectFromAssistant(input),
      }),
    },
  })

  return result.toUIMessageStreamResponse()
}
