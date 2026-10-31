import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCreatorReminder } from './telegram-reminder.ts'

const DAY = 'الأربعاء، 28 أكتوبر'

test('zero-video reminder puts the flower after the title and a heart after the period', () => {
  const text = formatCreatorReminder('rana.hack', 0, 2, DAY)
  assert.equal(
    text,
    'رسالة تذكيرية 💐\n' +
      'مساك الله بالخير أختي rana.hack، هذي رسالة تذكيرية بأنك ما نزلتي أي مقطع لليوم حتى الآن (الأربعاء، 28 أكتوبر). يرجى نشر المقاطع المطلوبة قبل الساعة 12 منتصف الليل بتوقيت السعودية. وإذا حصل لك أي ظرف أو واجهتك أي مشكلة، ياليت تخبرينا. شاكرين لك تعاونك.🤍',
  )
  assert.equal(text?.startsWith('💐'), false)
  assert.match(text ?? '', /رسالة تذكيرية 💐/)
  assert.match(text ?? '', /تعاونك\.🤍$/)
  assert.doesNotMatch(text ?? '', /تعاونك 🤍/)
})

test('one-video reminder keeps the same title, deadline, and ending', () => {
  const text = formatCreatorReminder('rana.hack', 1, 2, DAY)
  assert.match(text ?? '', /^رسالة تذكيرية 💐\n/)
  assert.match(text ?? '', /مقطع واحد فقط/)
  assert.match(text ?? '', /قبل الساعة 12 منتصف الليل بتوقيت السعودية/)
  assert.match(text ?? '', /تعاونك\.🤍$/)
})

test('done creators get no reminder', () => {
  assert.equal(formatCreatorReminder('rana.hack', 2, 2, DAY), null)
})
