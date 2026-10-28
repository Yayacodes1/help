const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXTENDED_ARABIC = '۰۱۲۳۴۵۶۷۸۹'

/** Western digits, including Arabic-Indic numerals typed on a Saudi keyboard. */
export function toWesternDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabic = ARABIC_INDIC.indexOf(ch)
    if (arabic >= 0) return String(arabic)
    const extended = EXTENDED_ARABIC.indexOf(ch)
    return extended >= 0 ? String(extended) : ch
  })
}

export type OutreachPhone = {
  ok: true
  /** What we store and show, like +9665xxxxxxxx. */
  e164: string
  /** Digits only, used to catch the same number twice. */
  key: string
  saudi: boolean
}

export type OutreachPhoneResult = OutreachPhone | { ok: false; error: string }

/**
 * Saudi mobiles are usually pasted as 05xxxxxxxx.
 * Drop the leading 0 and store them as +9665xxxxxxxx.
 * A number that already starts with + and is not Saudi is kept as typed.
 */
export function normalizeOutreachPhone(raw: string): OutreachPhoneResult {
  const trimmed = toWesternDigits(raw).trim()
  if (!trimmed) {
    return { ok: false, error: 'Paste the phone number.' }
  }
  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)

  const saudi = saudiNational(digits)
  if (saudi) {
    return { ok: true, e164: `+966${saudi}`, key: `966${saudi}`, saudi: true }
  }

  if (hasPlus && digits.length >= 8 && digits.length <= 15) {
    return { ok: true, e164: `+${digits}`, key: digits, saudi: false }
  }

  return {
    ok: false,
    error: 'Use a Saudi mobile like 05xxxxxxxx, or a full number that starts with +.',
  }
}

function saudiNational(digits: string): string | null {
  let national = digits
  if (national.startsWith('966')) {
    national = national.slice(3)
    if (national.startsWith('0')) national = national.slice(1)
  } else if (national.startsWith('0')) {
    national = national.replace(/^0+/, '')
  }
  return /^5\d{8}$/.test(national) ? national : null
}

/** True when both values are the same number after Saudi normalization. */
export function outreachPhonesMatch(pasted: string, seen: string): boolean {
  const a = normalizeOutreachPhone(pasted)
  const b = normalizeOutreachPhone(seen)
  if (a.ok && b.ok) return a.key === b.key
  const da = toWesternDigits(pasted).replace(/\D/g, '')
  const db = toWesternDigits(seen).replace(/\D/g, '')
  if (da.length < 8 || db.length < 8) return false
  return da.slice(-9) === db.slice(-9)
}
