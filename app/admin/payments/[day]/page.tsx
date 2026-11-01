import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'
import { ensureCreatorTrackingColumns } from '@/lib/schema'
import { getLocale } from '@/lib/locale'
import { createT, type MessageKey } from '@/lib/i18n'
import { formatDate } from '@/lib/format'
import { MoneyPair } from '@/components/admin/money-pair'
import { getOperationalToday } from '@/lib/queries'
import { parseYearMonth } from '@/lib/campaign'
import { adminPersonHref } from '@/lib/admin-href'
import { loadPaymentCalendar } from '@/lib/payment-calendar-data'
import { dayFromModel, parseCalendarRole, type CalendarPayStatus } from '@/lib/payment-calendar'
import { LanguageToggle } from '@/components/language-toggle'
import { LogoutButton } from '@/components/admin/logout-button'
import { StatCard } from '@/components/stat-card'
import { DayPayToggle } from '@/components/admin/payment-day-actions'
import { PushContractForward } from '@/components/admin/push-contract-forward'
import { participantRoleLabel } from '@/lib/participant-role'

export const dynamic = 'force-dynamic'

const STATUS_KEY: Record<CalendarPayStatus, MessageKey> = {
  paid: 'paymentStatusPaid',
  partial: 'paymentStatusPartial',
  due: 'paymentStatusDue',
  overdue: 'paymentStatusOverdue',
  scheduled: 'paymentStatusScheduled',
}

export default async function PaymentDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>
  searchParams: Promise<{ calMonth?: string; calRole?: string }>
}) {
  const session = await getAdminSession()
  if (!session) redirect('/login')
  await ensureCreatorTrackingColumns()
  const { day } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound()
  const sp = await searchParams
  const locale = await getLocale()
  const t = createT(locale)
  const today = await getOperationalToday()
  const month = parseYearMonth(sp.calMonth ?? day.slice(0, 7), today)
  const role = parseCalendarRole(sp.calRole)
  let model
  try {
    model = await loadPaymentCalendar({ month, today, role, viewerId: session.id })
  } catch (err) {
    console.error('[admin] payment day', err)
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
        <p className="text-sm text-destructive">{t('paymentDayError')}</p>
      </main>
    )
  }
  const detail = dayFromModel(model, day)
  const unpaidItems = detail.items.filter((row) => row.remainingSar > 0.009)
  const paidItems = detail.items.filter((row) => row.remainingSar <= 0.009)
  const backQs = new URLSearchParams({ tab: 'money', panel: 'calendar', calMonth: month })
  if (role !== 'all') backQs.set('calRole', role)
  const roleLabel =
    role === 'all'
      ? t('paymentCalendarAll')
      : role === 'company'
        ? t('paymentCalendarCompany')
        : participantRoleLabel(role)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin?${backQs.toString()}`}
            className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
          >
            ← {t('paymentDayBack')}
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{formatDate(day)}</h1>
          <p className="text-sm text-muted-foreground">
            {unpaidItems.length} {t('paymentDayUnpaid').toLowerCase()} · {roleLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle locale={locale} labels={{ english: t('english'), arabic: t('arabic') }} />
          <LogoutButton label={t('logOut')} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('paymentDayRecipients')} value={detail.recipientCount} />
        <StatCard label={t('paymentDayScheduled')} value={<MoneyPair sar={detail.scheduledSar} />} />
        <StatCard
          label={t('paymentDayPaid')}
          value={<MoneyPair sar={detail.paidThatDaySar} />}
          hint={t('paymentDayPaidHint')}
        />
        <StatCard label={t('paymentDayOutstanding')} value={<MoneyPair sar={detail.outstandingSar} />} />
      </section>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-baseline gap-2">
          {t('paymentDayCommission')}:
          <MoneyPair sar={detail.dayCommissionSar} />
        </span>
        <span className="inline-flex items-baseline gap-2">
          {t('paymentCalendarCommission')}:
          <MoneyPair sar={model.commissionEarnedSar} />
          <span>({t('paymentCalendarEarned')})</span>
        </span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t('paymentDayCommissionHint')}</p>

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          {t('paymentDayUnpaid')} · {unpaidItems.length}
        </h2>
        {unpaidItems.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('paymentDayUnpaidEmpty')}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {unpaidItems.map((row) => {
              const personHref =
                row.creatorId > 0
                  ? adminPersonHref(row.creatorId, {
                      role: row.role,
                      panel: 'payments',
                      from: 'calendar',
                    })
                  : '/admin?tab=people&panel=structure'
              return (
                <li
                  key={row.key}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-3"
                >
                  <div className="min-w-0">
                    <Link href={personHref} className="font-medium underline-offset-4 hover:underline">
                      {row.creatorName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {row.creatorId < 0 && row.projectName
                        ? row.projectName
                        : participantRoleLabel(row.role)}
                      {row.creatorId > 0 && row.projectName ? ` · ${row.projectName}` : ''}
                      {' · '}
                      {row.installmentLabel}
                      {' · '}
                      {row.dueDate}
                    </div>
                    {row.creatorId > 0 ? (
                      <div className="mt-1">
                        <PushContractForward
                          creatorId={row.creatorId}
                          contractId={row.contractId}
                          contractEnd={row.contractEnd}
                          compact
                          labels={{
                            moreTime: t('paymentPushForward'),
                            hint: t('paymentPushHint'),
                            pushing: t('paymentPushing'),
                            custom: t('paymentPushCustom'),
                            add: t('paymentPushAdd'),
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <MoneyPair sar={row.remainingSar} />
                    <DayPayToggle
                      paid={false}
                      creatorId={row.creatorId}
                      contractId={row.contractId}
                      installmentIndex={row.installmentIndex}
                      amount={row.remaining}
                      currency={row.currency}
                      payLabel={t('paymentDayPay')}
                      unpayLabel={t('paymentDayUnpay')}
                      showUnpay={row.paidAmount > 0.009}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {paidItems.length > 0 ? (
      <section className="mt-6 overflow-x-auto rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">
          {t('paymentStatusPaid')} · {paidItems.length}
        </h2>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('paymentDayPerson')}</th>
                <th className="px-3 py-2 font-medium">{t('paymentDayContract')}</th>
                <th className="px-3 py-2 font-medium">{t('paymentDayInstallment')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('paymentDayDue')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('paymentDayPaid')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('paymentDayLeft')}</th>
                <th className="px-3 py-2 font-medium">{t('paymentDayStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {paidItems.map((row) => {
                const personHref =
                  row.creatorId > 0
                    ? adminPersonHref(row.creatorId, {
                        role: row.role,
                        panel: 'payments',
                        from: 'calendar',
                      })
                    : '/admin?tab=people&panel=structure'
                const contractHref =
                  row.creatorId > 0
                    ? `${adminPersonHref(row.creatorId, {
                        role: row.role,
                        panel: 'contracts',
                        from: 'calendar',
                      })}#contract-${row.contractId}`
                    : '/admin?tab=people&panel=structure'
                return (
                  <tr key={row.key} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-3">
                      <Link
                        href={personHref}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.creatorName}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {row.creatorId < 0 && row.projectName
                          ? row.projectName
                          : participantRoleLabel(row.role)}
                        {row.creatorId > 0 && row.projectName ? ` · ${row.projectName}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{row.contractName}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.contractStart}
                        {row.contractEnd ? ` → ${row.contractEnd}` : ''}
                      </div>
                      {row.contractCommissionSar > 0.009 ? (
                        <div className="text-xs text-muted-foreground">
                          {t('paymentDayContractCommission')}: <MoneyPair sar={row.contractCommissionSar} />
                          {row.commissionInDue ? ` (${t('paymentDayIncludedInDue')})` : ''}
                        </div>
                      ) : null}
                      <Link
                        href={contractHref}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {t('paymentDayViewContract')}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div>{row.installmentLabel}</div>
                      <div className="text-xs text-muted-foreground">{t('paymentDayDue')} {row.dueDate}</div>
                      {row.lastPaidOn ? (
                        <div className="text-xs text-muted-foreground">
                          {t('paymentDayPaidOn')} {row.lastPaidOn}
                        </div>
                      ) : null}
                      {row.targetTotal > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {t('paymentDayVideos')} {row.videoCount}/{row.targetTotal}
                          {row.awaitingEligibility
                            ? ` · ${row.status === 'scheduled' || row.status === 'due' ? t('paymentDayAwaiting') : t('paymentDayTargetNotMet')}`
                            : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <MoneyPair sar={row.dueAmountSar} stacked />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <MoneyPair sar={row.paidAmountSar} stacked />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <MoneyPair sar={row.remainingSar} stacked />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide">
                        {t(STATUS_KEY[row.status])}
                      </div>
                      <DayPayToggle
                        paid
                        creatorId={row.creatorId}
                        contractId={row.contractId}
                        installmentIndex={row.installmentIndex}
                        amount={row.paidAmount}
                        currency={row.currency}
                        payLabel={t('paymentDayPay')}
                        unpayLabel={t('paymentDayUnpay')}
                      />
                      {row.creatorId > 0 && row.awaitingEligibility ? (
                        <PushContractForward
                          creatorId={row.creatorId}
                          contractId={row.contractId}
                          contractEnd={row.contractEnd}
                          labels={{
                            moreTime: t('paymentPushForward'),
                            hint: t('paymentPushHint'),
                            pushing: t('paymentPushing'),
                            custom: t('paymentPushCustom'),
                            add: t('paymentPushAdd'),
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </section>
      ) : null}

      {detail.actualPayments.length > 0 ? (
        <section className="mt-6 rounded-xl border border-dashed border-border p-4">
          <h2 className="text-sm font-semibold">{t('paymentDayActual')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('paymentDayActualHint')}</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {detail.actualPayments.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link
                    href={
                      row.creatorId > 0
                        ? adminPersonHref(row.creatorId, { role: row.role, panel: 'payments', from: 'calendar' })
                        : '/admin?tab=people&panel=structure'
                    }
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.creatorName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {' · '}
                    {participantRoleLabel(row.role)}
                    {row.contractName ? ` · ${row.contractName}` : ''}
                    {row.note ? ` · ${row.note}` : ''}
                  </span>
                </span>
                <MoneyPair sar={row.amountSar} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
