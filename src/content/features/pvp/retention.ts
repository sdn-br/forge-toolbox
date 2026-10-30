import { DAY_MS } from '../../../shared/time';
import { choiceDef } from '../../core/settings';

export const KEEP_SETTING = choiceDef({
  key: 'pvp.keep',
  group: 'pvp.title',
  label: 'pvp.keep',
  default: 'forever',
  choices: [
    { value: 'forever', label: 'pvp.keepForever' },
    { value: '30', label: 'pvp.keep30' },
    { value: '90', label: 'pvp.keep90' },
    { value: '180', label: 'pvp.keep180' },
    { value: '365', label: 'pvp.keep365' },
  ],
});

/** Battles, plunders and attacks on the own city before this time are deleted; undefined keeps all. */
export function pruneBefore(keep: string, now: number): number | undefined {
  const days = Number(keep);
  return Number.isFinite(days) && days > 0 ? now - days * DAY_MS : undefined;
}
