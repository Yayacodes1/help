const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXTENDED_ARABIC = '۰۱۲۳۴۵۶۷۸۹'

function toWesternDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => {
    const arabic = ARABIC_INDIC.indexOf(ch)
    if (arabic >= 0) return String(arabic)
    const extended = EXTENDED_ARABIC.indexOf(ch)
    return extended >= 0 ? String(extended) : ch
  })
}

export type OfferDialCode = {
  iso: string
  dial: string
  label: string
  /** Expected national length after stripping a leading 0 when allowed. */
  nationalLength: number
  allowLeadingZero: boolean
}

/** Common dial codes for the offer form country picker. */
export const OFFER_DIAL_CODES: OfferDialCode[] = [
  { iso: 'SA', dial: '966', label: 'Saudi Arabia (+966)', nationalLength: 9, allowLeadingZero: true },
  { iso: 'US', dial: '1', label: 'United States (+1)', nationalLength: 10, allowLeadingZero: false },
  { iso: 'AE', dial: '971', label: 'United Arab Emirates (+971)', nationalLength: 9, allowLeadingZero: true },
  { iso: 'KW', dial: '965', label: 'Kuwait (+965)', nationalLength: 8, allowLeadingZero: false },
  { iso: 'BH', dial: '973', label: 'Bahrain (+973)', nationalLength: 8, allowLeadingZero: false },
  { iso: 'QA', dial: '974', label: 'Qatar (+974)', nationalLength: 8, allowLeadingZero: false },
  { iso: 'OM', dial: '968', label: 'Oman (+968)', nationalLength: 8, allowLeadingZero: false },
  { iso: 'EG', dial: '20', label: 'Egypt (+20)', nationalLength: 10, allowLeadingZero: true },
  { iso: 'GB', dial: '44', label: 'United Kingdom (+44)', nationalLength: 10, allowLeadingZero: true },
  { iso: 'CA', dial: '1', label: 'Canada (+1)', nationalLength: 10, allowLeadingZero: false },
]

export function findDialCode(dial: string): OfferDialCode | null {
  const d = dial.replace(/\D/g, '')
  return OFFER_DIAL_CODES.find((c) => c.dial === d) ?? null
}

export type OfferPhoneResult =
  | { ok: true; e164: string; key: string; dial: string; national: string }
  | { ok: false; error: string }

/**
 * Country code is selected separately. National field is digits only (max length
 * for that country) — no 00 / pasted country code.
 */
export function normalizeOfferPhone(dialRaw: string, nationalRaw: string): OfferPhoneResult {
  const dial = toWesternDigits(dialRaw).replace(/\D/g, '')
  let national = toWesternDigits(nationalRaw).replace(/\D/g, '')
  if (!dial) return { ok: false, error: 'Pick a country code.' }
  if (!national) return { ok: false, error: 'Enter your WhatsApp number.' }
  if (national.startsWith('00')) {
    return { ok: false, error: 'Don’t type 00 — pick the country code, then your local number.' }
  }
  if (national.startsWith(dial) && national.length > dial.length + 4) {
    return { ok: false, error: 'Don’t include the country code in the number field.' }
  }

  const meta = findDialCode(dial)
  if (meta?.allowLeadingZero && national.startsWith('0')) {
    national = national.replace(/^0+/, '')
  }
  if (national.length > 10) {
    return { ok: false, error: 'Use at most 10 digits for the local number.' }
  }
  if (meta && national.length !== meta.nationalLength) {
    return {
      ok: false,
      error: `For ${meta.label.split(' (')[0]}, use ${meta.nationalLength} digits (no country code).`,
    }
  }
  if (!meta && (national.length < 6 || national.length > 10)) {
    return { ok: false, error: 'Local number should be 6–10 digits.' }
  }

  // Saudi mobiles are 5xxxxxxxx
  if (dial === '966' && !/^5\d{8}$/.test(national)) {
    return { ok: false, error: 'Saudi WhatsApp numbers start with 5 (9 digits).' }
  }

  return {
    ok: true,
    e164: `+${dial}${national}`,
    key: `${dial}${national}`,
    dial,
    national,
  }
}

export type OfferCountryOption = { value: string; label: string }

/**
 * Full searchable country list for “Where are you based?”.
 * Values are ISO 3166-1 alpha-2 (lowercase), plus legacy aliases for market math.
 */
export const OFFER_BASE_COUNTRIES: OfferCountryOption[] = [
  { value: 'af', label: 'Afghanistan' },
  { value: 'al', label: 'Albania' },
  { value: 'dz', label: 'Algeria' },
  { value: 'ad', label: 'Andorra' },
  { value: 'ao', label: 'Angola' },
  { value: 'ag', label: 'Antigua and Barbuda' },
  { value: 'ar', label: 'Argentina' },
  { value: 'am', label: 'Armenia' },
  { value: 'au', label: 'Australia' },
  { value: 'at', label: 'Austria' },
  { value: 'az', label: 'Azerbaijan' },
  { value: 'bs', label: 'Bahamas' },
  { value: 'bh', label: 'Bahrain' },
  { value: 'bd', label: 'Bangladesh' },
  { value: 'bb', label: 'Barbados' },
  { value: 'by', label: 'Belarus' },
  { value: 'be', label: 'Belgium' },
  { value: 'bz', label: 'Belize' },
  { value: 'bj', label: 'Benin' },
  { value: 'bt', label: 'Bhutan' },
  { value: 'bo', label: 'Bolivia' },
  { value: 'ba', label: 'Bosnia and Herzegovina' },
  { value: 'bw', label: 'Botswana' },
  { value: 'br', label: 'Brazil' },
  { value: 'bn', label: 'Brunei' },
  { value: 'bg', label: 'Bulgaria' },
  { value: 'bf', label: 'Burkina Faso' },
  { value: 'bi', label: 'Burundi' },
  { value: 'cv', label: 'Cabo Verde' },
  { value: 'kh', label: 'Cambodia' },
  { value: 'cm', label: 'Cameroon' },
  { value: 'ca', label: 'Canada' },
  { value: 'cf', label: 'Central African Republic' },
  { value: 'td', label: 'Chad' },
  { value: 'cl', label: 'Chile' },
  { value: 'cn', label: 'China' },
  { value: 'co', label: 'Colombia' },
  { value: 'km', label: 'Comoros' },
  { value: 'cg', label: 'Congo' },
  { value: 'cd', label: 'Congo (DRC)' },
  { value: 'cr', label: 'Costa Rica' },
  { value: 'ci', label: "Côte d'Ivoire" },
  { value: 'hr', label: 'Croatia' },
  { value: 'cu', label: 'Cuba' },
  { value: 'cy', label: 'Cyprus' },
  { value: 'cz', label: 'Czechia' },
  { value: 'dk', label: 'Denmark' },
  { value: 'dj', label: 'Djibouti' },
  { value: 'dm', label: 'Dominica' },
  { value: 'do', label: 'Dominican Republic' },
  { value: 'ec', label: 'Ecuador' },
  { value: 'eg', label: 'Egypt' },
  { value: 'sv', label: 'El Salvador' },
  { value: 'gq', label: 'Equatorial Guinea' },
  { value: 'er', label: 'Eritrea' },
  { value: 'ee', label: 'Estonia' },
  { value: 'sz', label: 'Eswatini' },
  { value: 'et', label: 'Ethiopia' },
  { value: 'fj', label: 'Fiji' },
  { value: 'fi', label: 'Finland' },
  { value: 'fr', label: 'France' },
  { value: 'ga', label: 'Gabon' },
  { value: 'gm', label: 'Gambia' },
  { value: 'ge', label: 'Georgia' },
  { value: 'de', label: 'Germany' },
  { value: 'gh', label: 'Ghana' },
  { value: 'gr', label: 'Greece' },
  { value: 'gd', label: 'Grenada' },
  { value: 'gt', label: 'Guatemala' },
  { value: 'gn', label: 'Guinea' },
  { value: 'gw', label: 'Guinea-Bissau' },
  { value: 'gy', label: 'Guyana' },
  { value: 'ht', label: 'Haiti' },
  { value: 'hn', label: 'Honduras' },
  { value: 'hu', label: 'Hungary' },
  { value: 'is', label: 'Iceland' },
  { value: 'in', label: 'India' },
  { value: 'id', label: 'Indonesia' },
  { value: 'ir', label: 'Iran' },
  { value: 'iq', label: 'Iraq' },
  { value: 'ie', label: 'Ireland' },
  { value: 'il', label: 'Israel' },
  { value: 'it', label: 'Italy' },
  { value: 'jm', label: 'Jamaica' },
  { value: 'jp', label: 'Japan' },
  { value: 'jo', label: 'Jordan' },
  { value: 'kz', label: 'Kazakhstan' },
  { value: 'ke', label: 'Kenya' },
  { value: 'ki', label: 'Kiribati' },
  { value: 'kp', label: 'North Korea' },
  { value: 'kr', label: 'South Korea' },
  { value: 'kw', label: 'Kuwait' },
  { value: 'kg', label: 'Kyrgyzstan' },
  { value: 'la', label: 'Laos' },
  { value: 'lv', label: 'Latvia' },
  { value: 'lb', label: 'Lebanon' },
  { value: 'ls', label: 'Lesotho' },
  { value: 'lr', label: 'Liberia' },
  { value: 'ly', label: 'Libya' },
  { value: 'li', label: 'Liechtenstein' },
  { value: 'lt', label: 'Lithuania' },
  { value: 'lu', label: 'Luxembourg' },
  { value: 'mg', label: 'Madagascar' },
  { value: 'mw', label: 'Malawi' },
  { value: 'my', label: 'Malaysia' },
  { value: 'mv', label: 'Maldives' },
  { value: 'ml', label: 'Mali' },
  { value: 'mt', label: 'Malta' },
  { value: 'mh', label: 'Marshall Islands' },
  { value: 'mr', label: 'Mauritania' },
  { value: 'mu', label: 'Mauritius' },
  { value: 'mx', label: 'Mexico' },
  { value: 'fm', label: 'Micronesia' },
  { value: 'md', label: 'Moldova' },
  { value: 'mc', label: 'Monaco' },
  { value: 'mn', label: 'Mongolia' },
  { value: 'me', label: 'Montenegro' },
  { value: 'ma', label: 'Morocco' },
  { value: 'mz', label: 'Mozambique' },
  { value: 'mm', label: 'Myanmar' },
  { value: 'na', label: 'Namibia' },
  { value: 'nr', label: 'Nauru' },
  { value: 'np', label: 'Nepal' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'nz', label: 'New Zealand' },
  { value: 'ni', label: 'Nicaragua' },
  { value: 'ne', label: 'Niger' },
  { value: 'ng', label: 'Nigeria' },
  { value: 'mk', label: 'North Macedonia' },
  { value: 'no', label: 'Norway' },
  { value: 'om', label: 'Oman' },
  { value: 'pk', label: 'Pakistan' },
  { value: 'pw', label: 'Palau' },
  { value: 'ps', label: 'Palestine' },
  { value: 'pa', label: 'Panama' },
  { value: 'pg', label: 'Papua New Guinea' },
  { value: 'py', label: 'Paraguay' },
  { value: 'pe', label: 'Peru' },
  { value: 'ph', label: 'Philippines' },
  { value: 'pl', label: 'Poland' },
  { value: 'pt', label: 'Portugal' },
  { value: 'qa', label: 'Qatar' },
  { value: 'ro', label: 'Romania' },
  { value: 'ru', label: 'Russia' },
  { value: 'rw', label: 'Rwanda' },
  { value: 'kn', label: 'Saint Kitts and Nevis' },
  { value: 'lc', label: 'Saint Lucia' },
  { value: 'vc', label: 'Saint Vincent and the Grenadines' },
  { value: 'ws', label: 'Samoa' },
  { value: 'sm', label: 'San Marino' },
  { value: 'st', label: 'Sao Tome and Principe' },
  { value: 'sa', label: 'Saudi Arabia' },
  { value: 'sn', label: 'Senegal' },
  { value: 'rs', label: 'Serbia' },
  { value: 'sc', label: 'Seychelles' },
  { value: 'sl', label: 'Sierra Leone' },
  { value: 'sg', label: 'Singapore' },
  { value: 'sk', label: 'Slovakia' },
  { value: 'si', label: 'Slovenia' },
  { value: 'sb', label: 'Solomon Islands' },
  { value: 'so', label: 'Somalia' },
  { value: 'za', label: 'South Africa' },
  { value: 'ss', label: 'South Sudan' },
  { value: 'es', label: 'Spain' },
  { value: 'lk', label: 'Sri Lanka' },
  { value: 'sd', label: 'Sudan' },
  { value: 'sr', label: 'Suriname' },
  { value: 'se', label: 'Sweden' },
  { value: 'ch', label: 'Switzerland' },
  { value: 'sy', label: 'Syria' },
  { value: 'tw', label: 'Taiwan' },
  { value: 'tj', label: 'Tajikistan' },
  { value: 'tz', label: 'Tanzania' },
  { value: 'th', label: 'Thailand' },
  { value: 'tl', label: 'Timor-Leste' },
  { value: 'tg', label: 'Togo' },
  { value: 'to', label: 'Tonga' },
  { value: 'tt', label: 'Trinidad and Tobago' },
  { value: 'tn', label: 'Tunisia' },
  { value: 'tr', label: 'Turkey' },
  { value: 'tm', label: 'Turkmenistan' },
  { value: 'tv', label: 'Tuvalu' },
  { value: 'ug', label: 'Uganda' },
  { value: 'ua', label: 'Ukraine' },
  { value: 'ae', label: 'United Arab Emirates' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'us', label: 'United States' },
  { value: 'uy', label: 'Uruguay' },
  { value: 'uz', label: 'Uzbekistan' },
  { value: 'vu', label: 'Vanuatu' },
  { value: 'va', label: 'Vatican City' },
  { value: 've', label: 'Venezuela' },
  { value: 'vn', label: 'Vietnam' },
  { value: 'ye', label: 'Yemen' },
  { value: 'zm', label: 'Zambia' },
  { value: 'zw', label: 'Zimbabwe' },
  { value: 'other', label: 'Other' },
]

export type OfferBaseCountry = string

export function filterOfferCountries(query: string): OfferCountryOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return OFFER_BASE_COUNTRIES
  return OFFER_BASE_COUNTRIES.filter(
    (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q),
  )
}
