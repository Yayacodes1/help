import 'server-only'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  cleanOutreachUsername,
  parseOutreachCount,
} from '@/lib/outreach-status'
import { normalizeOutreachPhone, outreachPhonesMatch } from '@/lib/saudi-phone'

const extractedSchema = z.object({
  username: z.string().nullable().optional(),
  followers: z.union([z.number(), z.string()]).nullable().optional(),
  likes: z.union([z.number(), z.string()]).nullable().optional(),
  platform: z.enum(['instagram', 'tiktok', 'unknown']).optional(),
  phones: z.array(z.union([z.string(), z.number()])).optional(),
})

export type ScreenRead = {
  username: string
  followers: number | null
  likes: number | null
  platform: 'instagram' | 'tiktok' | 'unknown'
  chatPhones: string[]
  pastedPhone: string
  matchedPhone: string | null
}

function getModel() {
  if (process.env.OPENAI_API_KEY) return openai('gpt-4o-mini')
  if (process.env.AI_GATEWAY_API_KEY) return 'openai/gpt-4o-mini' as const
  return null
}

function parseDataUrl(value: string): { mediaType: string; bytes: Uint8Array } | null {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i)
  if (!match) return null
  const mediaType = match[1].toLowerCase()
  const base64 = match[2].replace(/\s/g, '')
  if (base64.length < 100 || base64.length > 1_800_000) return null
  const bytes = Uint8Array.from(Buffer.from(base64, 'base64'))
  if (bytes.byteLength < 80 || bytes.byteLength > 1_400_000) return null
  return { mediaType, bytes }
}

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return JSON.parse(fenced?.[1]?.trim() || trimmed)
}

export async function readOutreachScreenshots(input: {
  accountImage: string
  chatImage: string
  phone: string
}): Promise<{ ok: true; read: ScreenRead } | { ok: false; error: string }> {
  const pasted = normalizeOutreachPhone(input.phone)
  if (!pasted.ok) return { ok: false, error: pasted.error }

  const account = parseDataUrl(input.accountImage)
  const chat = parseDataUrl(input.chatImage)
  if (!account || !chat) {
    return { ok: false, error: 'Add both pictures: the account, and the chat with the phone number.' }
  }

  const model = getModel()
  if (!model) {
    return { ok: false, error: 'Reading pictures is unavailable right now. Try again in a moment.' }
  }

  let text = ''
  try {
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You read two screenshots for an outreach list.
The first image is a social account (Instagram or TikTok). Read the username without @, the follower count, and the likes count. Convert K/M into a plain integer. Use null when a number is not on the screen.
The second image is a chat. Read every phone number exactly as written.
Reply with JSON only:
{"username": string|null, "followers": number|null, "likes": number|null, "platform": "instagram"|"tiktok"|"unknown", "phones": string[]}`,
            },
            { type: 'image', image: account.bytes, mediaType: account.mediaType },
            { type: 'image', image: chat.bytes, mediaType: chat.mediaType },
          ],
        },
      ],
    })
    text = result.text
  } catch {
    return { ok: false, error: 'Could not read the pictures. Try a clearer screenshot.' }
  }

  let parsed: z.infer<typeof extractedSchema>
  try {
    parsed = extractedSchema.parse(parseJson(text))
  } catch {
    return { ok: false, error: 'Could not read the account or the phone number from the pictures.' }
  }

  const username = cleanOutreachUsername(parsed.username)
  if (!username) {
    return { ok: false, error: 'Could not read the username from the account picture.' }
  }

  const chatPhones = (parsed.phones ?? []).map((phone) => String(phone).trim()).filter(Boolean)
  if (chatPhones.length === 0) {
    return {
      ok: false,
      error: `Could not read a phone number from the chat picture. The account picture shows @${username}.`,
    }
  }
  const matched = chatPhones.find((phone) => outreachPhonesMatch(pasted.e164, phone)) ?? null
  if (!matched) {
    return {
      ok: false,
      error: `Something is off. The number you pasted (${pasted.e164}) does not match the chat picture (${chatPhones.join(', ')}). Account: @${username}.`,
    }
  }

  const platform = parsed.platform === 'instagram' || parsed.platform === 'tiktok' ? parsed.platform : 'unknown'
  return {
    ok: true,
    read: {
      username,
      followers: parseOutreachCount(parsed.followers),
      likes: parseOutreachCount(parsed.likes),
      platform,
      chatPhones,
      pastedPhone: pasted.e164,
      matchedPhone: normalizeOutreachPhone(matched).ok ? pasted.e164 : matched,
    },
  }
}
