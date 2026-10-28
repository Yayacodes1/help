import { getOutreachLeadImage } from '@/lib/outreach'
import { validLeadImageToken } from '@/lib/outreach-image'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = Number(url.searchParams.get('id'))
  const kind = url.searchParams.get('kind')
  const token = url.searchParams.get('token') ?? ''
  if (!Number.isFinite(id) || id <= 0 || (kind !== 'account' && kind !== 'chat')) {
    return new Response('Not found', { status: 404 })
  }
  if (!validLeadImageToken(id, kind, token)) {
    return new Response('Not found', { status: 404 })
  }
  const image = await getOutreachLeadImage(id, kind)
  const match = image?.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i)
  if (!match) return new Response('Not found', { status: 404 })
  const bytes = Buffer.from(match[2], 'base64')
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': match[1].toLowerCase(),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
