// The texts the pvp and the sabotage box share for battles, plunders and attacks on the own city.
import type { BuildingDefId } from '../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../shared/model';
import { formatNumber, type TextKey, t } from '../core/texts';
import { de } from '../texts/de';

/** Own name of a resource, else the game's name from the startup data, else its id. */
export function resourceLabel(id: string, catalog: { resourceName(id: string): string | undefined }): string {
  const key = `resource.${id}`;
  return key in de ? t(key as TextKey) : (catalog.resourceName(id) ?? id);
}

/** "1.220 Münzen, 5 Forge-Punkte" */
export const formatResources = (
  resources: Record<string, number>,
  catalog: { resourceName(id: string): string | undefined },
) =>
  Object.entries(resources)
    .map(([id, amount]) => `${formatNumber(amount)} ${resourceLabel(id, catalog)}`)
    .join(', ');

/** "3 Plünderungen, 2 abgewehrt, 120 FP"; the repelled part only when there are some */
export const formatPlunderTotals = ({ count, repelled, fp }: { count: number; repelled: number; fp: number }) =>
  [
    count === 1 ? t('plunder.countOne') : t('plunder.count', { count: formatNumber(count) }),
    repelled > 0 ? t('plunder.repelledCount', { count: formatNumber(repelled) }) : '',
    t('plunder.fp', { fp: formatNumber(fp) }),
  ]
    .filter(Boolean)
    .join(', ');

/** "3 Angriffe, 1 abgewehrt, 2 Plünderungen": battles with the held ones among them, then plunders */
export const formatIncomingTotals = ({ battles, held, plunders }: IncomingTotals) =>
  [
    battles === 1 ? t('incoming.countOne') : t('incoming.count', { count: formatNumber(battles) }),
    held > 0 ? t('incoming.heldCount', { count: formatNumber(held) }) : '',
    plunders === 1 ? t('plunder.countOne') : t('plunder.count', { count: formatNumber(plunders) }),
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
