import { PanelBoardClient, type PanelItem } from '@/components/admin/panel-board-client'

export type { PanelItem }

/**
 * Closed panel bodies stay on the server. Passing them into the client board
 * used to hydrate every table, chart, and form on first paint — the main
 * source of phone lag on dashboards.
 */
export function PanelBoard({
  panels,
  defaultOpen = null,
  columns = 4,
  closeLabel = 'Close',
  loadingLabel = '…',
}: {
  panels: PanelItem[]
  defaultOpen?: string | null
  columns?: 2 | 3 | 4
  closeLabel?: string
  loadingLabel?: string
}) {
  const open = defaultOpen ?? null
  const light = panels.map((panel) =>
    panel.id === open ? panel : { ...panel, children: null },
  )
  return (
    <PanelBoardClient
      panels={light}
      defaultOpen={open}
      columns={columns}
      closeLabel={closeLabel}
      loadingLabel={loadingLabel}
    />
  )
}
