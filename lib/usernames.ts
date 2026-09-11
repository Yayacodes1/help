/** Strip @ and whitespace from a social handle. */
export function normalizeHandle(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^@+/, '')
}

export function parseOptionalHandle(value: FormDataEntryValue | null): string | null {
  const cleaned = normalizeHandle(value?.toString() ?? '')
  return cleaned ? cleaned.slice(0, 80) : null
}

export function displayHandle(value: string | null | undefined): string | null {
  const cleaned = normalizeHandle(value)
  return cleaned || null
}
