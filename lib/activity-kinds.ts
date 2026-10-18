/** Things a person can do on TikTok/Instagram besides a tracked video, ticked by an admin or their leader. */
export const ACTIVITY_KINDS = ['live', 'story', 'repost', 'comments', 'like', 'save'] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const LEADER_ACTIVITY_KINDS = ['live', 'story', 'repost', 'comments'] as const satisfies readonly ActivityKind[]

export const REPOSTER_ACTIVITY_KINDS = ['comments', 'like', 'save'] as const satisfies readonly ActivityKind[]

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  live: 'Live',
  story: 'Story',
  repost: 'Repost',
  comments: 'Comment',
  like: 'Like',
  save: 'Save',
}

export function isActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && (ACTIVITY_KINDS as readonly string[]).includes(value)
}

export type ActivityCounts = Record<ActivityKind, number>

export function emptyActivityCounts(): ActivityCounts {
  return { live: 0, story: 0, repost: 0, comments: 0, like: 0, save: 0 }
}
