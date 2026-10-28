import { addOutreachMember, removeOutreachMember } from '@/app/actions/outreach'
import { listOutreachChoices, listOutreachMembers, type OutreachMember } from '@/lib/outreach'
import { OutreachAccessForms } from '@/components/outreach/outreach-access-forms'

function linkLabel(member: OutreachMember): string {
  if (member.leaderName) return `Leader · ${member.leaderName}`
  if (member.creatorName) return `Reposter · ${member.creatorName}`
  if (member.hasPassword) return 'Own login'
  return ''
}

export async function OutreachAccess() {
  const [members, choices] = await Promise.all([listOutreachMembers(), listOutreachChoices()])
  const takenLeaders = new Set(members.map((member) => member.leaderId).filter((id): id is number => id != null))
  const takenReposters = new Set(members.map((member) => member.creatorId).filter((id): id is number => id != null))

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        You already open the board as Ahmed. Add upper managers by a new name, or attach a leader or reposter they already use.
        Outreach people can be an existing reposter, or a new login who is not a reposter.
      </p>
      <OutreachAccessForms
        leaders={choices.leaders.filter((leader) => !takenLeaders.has(leader.id))}
        reposters={choices.reposters.filter((person) => !takenReposters.has(person.id))}
      />
      <MemberList title="Upper management" members={members.filter((member) => member.role === 'upper')} />
      <MemberList title="Outreach" members={members.filter((member) => member.role === 'outreach')} />
    </div>
  )
}

function MemberList({ title, members }: { title: string; members: OutreachMember[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-sm">
                {member.name}
                <span className="text-muted-foreground"> · {linkLabel(member)}</span>
              </span>
              <form action={removeOutreachMember}>
                <input type="hidden" name="id" value={member.id} />
                <button type="submit" className="text-sm font-medium text-destructive">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
