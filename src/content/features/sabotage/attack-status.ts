import type { AttackTimer, CityShield } from '../../../shared/model';
import { formatDateTime, formatDuration, formatWhen, t } from '../../core/texts';

type AttackKind = 'plunderable' | 'shielded' | 'waiting' | 'attackable' | 'friend' | 'guildMember' | 'notNeighbor';

export interface AttackStatus {
  kind: AttackKind;
  text: string;
}

/**
 * Whether the session player can attack the visited player now, as one line. Friends, guild members and players who
 * are no neighbours cannot be attacked at all. Otherwise: a won, unplundered battle can be plundered until the timer
 * ends (the old toolbox takes the same timer, not proven in the game), even through a shield. A shield goes over the
 * timer of a past attack. A timer without `canPlunder` waits for the next attack.
 */
export function attackStatus(
  relation: { neighbor: boolean; friend: boolean; guildMember: boolean },
  timer: AttackTimer | undefined,
  shield: CityShield | undefined,
  now: number,
): AttackStatus {
  if (relation.friend) return { kind: 'friend', text: t('attack.friend') };
  if (relation.guildMember) return { kind: 'guildMember', text: t('attack.guildMember') };
  if (!relation.neighbor) return { kind: 'notNeighbor', text: t('attack.notNeighbor') };
  const until =
    timer?.nextInteractionAt !== undefined && timer.nextInteractionAt > now ? timer.nextInteractionAt : undefined;
  if (until !== undefined && timer?.canPlunder) {
    return {
      kind: 'plunderable',
      text: t('attack.plunderable', { duration: formatDuration(until - now), when: formatWhen(until, now) }),
    };
  }
  if (shield && shield.expiresAt > now) {
    return {
      kind: 'shielded',
      text: t('attack.shielded', {
        when: formatDateTime(shield.expiresAt),
        duration: formatDuration(shield.expiresAt - now),
      }),
    };
  }
  if (until !== undefined) {
    return {
      kind: 'waiting',
      text: t('attack.waiting', { duration: formatDuration(until - now), when: formatWhen(until, now) }),
    };
  }
  return { kind: 'attackable', text: t('attack.attackable') };
}
