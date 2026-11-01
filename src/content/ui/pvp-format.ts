// The texts the pvp and the sabotage box share for battles, plunders and attacks on the own city.
import type { BuildingDefId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals, PlunderTotals } from '../../shared/model';
import { formatNumber, formatPercent, type TextKey, t } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';
import { de } from '../texts/de';

/** The game's name of a resource from the startup data; undefined when unknown. */
type ResourceName = (id: string) => string | undefined;

/** "368 % / 269 %": attack and defense of an army */
export const formatArmy = (a: ArmyValues) => `${formatPercent(a.attack)} / ${formatPercent(a.defense)}`;

/** "1 Runde", "3 Runden" */
export const formatRounds = (rounds: number) => (rounds === 1 ? t('pvp.round') : t('pvp.rounds', { count: rounds }));

/** the text for exactly one, else the text with the formatted count */
const countText = (n: number, one: TextKey, many: TextKey) => (n === 1 ? t(one) : t(many, { count: formatNumber(n) }));

/** Own name of a resource, else the game's name from the startup data, else its id. */
export function resourceLabel(id: string, resourceName: ResourceName): string {
  const key = `resource.${id}`;
  return key in de ? t(key as TextKey) : (resourceName(id) ?? id);
}

/** "1.220 Münzen, 5 Forge-Punkte" */
export const formatResources = (resources: Record<string, number>, resourceName: ResourceName) =>
  Object.entries(resources)
    .map(([id, amount]) => `${formatNumber(amount)} ${resourceLabel(id, resourceName)}`)
    .join(', ');

/** "3 Plünderungen, 2 abgewehrt, 120 FP"; the repelled part only when there are some */
export const formatPlunderTotals = ({ count, repelled, fp }: PlunderTotals) =>
  [
    countText(count, 'plunder.countOne', 'plunder.count'),
    repelled > 0 ? t('plunder.repelledCount', { count: formatNumber(repelled) }) : '',
    t('plunder.fp', { fp: formatNumber(fp) }),
  ]
    .filter(Boolean)
    .join(', ');

/** "3 Angriffe, 1 abgewehrt, 2 Plünderungen": battles with the held ones among them, then plunders */
export const formatIncomingTotals = ({ battles, held, plunders }: IncomingTotals) =>
  [
    countText(battles, 'incoming.countOne', 'incoming.count'),
    held > 0 ? t('incoming.heldCount', { count: formatNumber(held) }) : '',
    countText(plunders, 'plunder.countOne', 'plunder.count'),
  ]
    .filter(Boolean)
    .join(', ');

/** "Kampf: durchbrochen", "Plünderung: Strohdachhaus" */
export function formatIncoming(a: IncomingAttack, building: (id: BuildingDefId) => string | undefined): string {
  // the old toolbox did not keep the outcome of a battle on the own city
  if (a.kind === 'battle') return t(a.defense ? `incoming.${a.defense}` : 'incoming.battle');
  const id = a.cityEntityId;
  return t('incoming.plunder', { building: id === undefined ? '–' : (building(id) ?? id) });
}
