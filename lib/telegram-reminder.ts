const CLOSING =
  'وإذا حصل لك أي ظرف أو واجهتك أي مشكلة، ياليت تخبرينا. شاكرين لك تعاونك.🤍'

/** Copy-ready Arabic reminder for a creator who is still behind (Riyadh). */
export function formatCreatorReminder(
  name: string,
  posted: number,
  needed: number,
  dayLabel: string,
): string | null {
  if (needed > 0 && posted >= needed) return null
  if (posted <= 0) {
    return (
      'رسالة تذكيرية 💐\n' +
      `مساك الله بالخير أختي ${name}، هذي رسالة تذكيرية بأنك ما نزلتي أي مقطع لليوم حتى الآن (${dayLabel}). يرجى نشر المقاطع المطلوبة قبل الساعة 12 منتصف الليل بتوقيت السعودية. ${CLOSING}`
    )
  }
  return (
    'رسالة تذكيرية 💐\n' +
    `مساك الله بالخير أختي ${name}، هذي رسالة تذكيرية بأنك نزلتي مقطع واحد فقط لليوم حتى الآن (${dayLabel})، وباقي عليك مقطع واحد عشان تكمّلين المطلوب منك لهذا اليوم. يرجى نشر المقطع المتبقي قبل الساعة 12 منتصف الليل بتوقيت السعودية. ${CLOSING}`
  )
}
