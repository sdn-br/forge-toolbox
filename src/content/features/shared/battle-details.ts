// The view model of the details of one stored battle, drawn by ui/battle-details.ts.
import type { BattleUnit, FoughtBattle } from '../../../shared/model';
import { formatNumber, type TextKey, t } from '../../core/texts';
import type { MeasuredArmy } from '../../domain/measured-army';
import type { CatalogStore } from '../../stores/catalog';
import type { BattleDetailsVm, UnitVm } from '../../ui/battle-details';
import { formatRounds } from './pvp-format';

/** what the details show of a unit type, as display text */
export interface UnitInfo {
  name: string;
  /** the era's name; missing for a unit of every era */
  era?: string;
  /** the game's class, `light_melee` and so on */
  unitClass?: string;
}

/** the unit types of the catalog as the details show them, with the era's name */
export const catalogUnits =
  (catalog: Pick<CatalogStore, 'unitType' | 'eraName'>) =>
  (id: string): UnitInfo | undefined => {
    const u = catalog.unitType(id);
    return (
      u && {
        name: u.name,
        ...(u.era && { era: catalog.eraName(u.era) }),
        ...(u.unitClass && { unitClass: u.unitClass }),
      }
    );
  };

const CLASSES = new Set(['light_melee', 'heavy_melee', 'fast', 'short_ranged', 'long_ranged']);

/** "Zeitalter: Arktische Zukunft", "Typ: Schwere Einheit", each line only when known */
const unitTip = (info: UnitInfo | undefined): string | undefined => {
  if (!info) return undefined;
  const lines = [
    ...(info.era ? [t('unit.era', { era: info.era })] : []),
    ...(info.unitClass && CLASSES.has(info.unitClass)
      ? [t('unit.class', { name: t(`unit.class.${info.unitClass}` as TextKey) })]
      : []),
  ];
  return lines.length ? lines.join('\n') : undefined;
};

/** the unit's name in the game's language, its type id while the unit types are not loaded */
const unitVm = (u: BattleUnit, unit: (id: string) => UnitInfo | undefined): UnitVm => {
  const info = unit(u.unitTypeId);
  const tip = unitTip(info);
  return {
    unit: info?.name ?? u.unitTypeId,
    ...(tip && { tip }),
    hp: u.endHp > 0 ? t('battle.hp', { end: formatNumber(u.endHp), start: formatNumber(u.startHp) }) : t('battle.dead'),
    dead: u.endHp <= 0,
  };
};

export interface BattleDetailsOptions {
  /** the battle's measured army; without it the details leave the armies out, for where the attack and defense values
   * are switched off */
  measured?: MeasuredArmy;
  /** false leaves the result word out, for where an icon shows it */
  withResult?: boolean;
  /** a unit type as the details show it, from the catalog (`catalogUnits`) */
  unit?: (id: string) => UnitInfo | undefined;
}

export function battleDetails(
  battle: FoughtBattle,
  { measured, withResult = true, unit = () => undefined }: BattleDetailsOptions = {},
): BattleDetailsVm {
  return {
    summary: [
      ...(withResult ? [t(`pvp.${battle.result}`)] : []),
      battle.auto ? t('pvp.auto') : t('battle.manual'),
      formatRounds(battle.rounds),
    ].join(', '),
    own: battle.attacker.units.map((u) => unitVm(u, unit)),
    opponent: battle.defender.units.map((u) => unitVm(u, unit)),
    army: measured && { own: measured.attacker, opponent: measured.defender },
  };
}
