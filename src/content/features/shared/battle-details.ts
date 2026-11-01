// The view model of the details of one stored battle, drawn by ui/battle-details.ts.
import { unitClassIconPath, unitPortraitPath } from '../../../shared/cdn-assets';
import type { BattleUnit, FoughtBattle } from '../../../shared/model';
import { formatNumber, type TextKey, t } from '../../core/texts';
import type { MeasuredArmy } from '../../domain/measured-army';
import type { AssetStore } from '../../stores/assets';
import type { CatalogStore } from '../../stores/catalog';
import type { BattleDetailsVm, UnitVm } from '../../ui/battle-details';
import { formatRounds } from './pvp-format';

/** what the details show of a unit type, as display text and image URLs; every part only when known */
export interface UnitInfo {
  /** in the game's language */
  name?: string;
  /** the era's name; missing for a unit of every era */
  era?: string;
  /** the game's class, `light_melee` and so on */
  unitClass?: string;
  /** the full URL of the unit's portrait on the Inno CDN */
  image?: string;
  /** the full URL of the game's icon of the unit's class on the Inno CDN */
  classIcon?: string;
}

const CLASSES = new Set(['light_melee', 'heavy_melee', 'fast', 'short_ranged', 'long_ranged']);

/** the unit types of the catalog as the details show them, with the era's name and, once the index is known, the
 * portrait (named by the type id, checked in the game's index 2026-11-01) and the icon of the class */
export const catalogUnits =
  (catalog: Pick<CatalogStore, 'unitType' | 'eraName'>, assets?: Pick<AssetStore, 'url'>) =>
  (id: string): UnitInfo => {
    const u = catalog.unitType(id);
    const unitClass = u?.unitClass && CLASSES.has(u.unitClass) ? u.unitClass : undefined;
    const image = assets?.url(unitPortraitPath(id));
    const classIcon = unitClass && assets?.url(unitClassIconPath(unitClass));
    return {
      ...(u && { name: u.name }),
      ...(u?.era && { era: catalog.eraName(u.era) }),
      ...(unitClass && { unitClass }),
      ...(image && { image }),
      ...(classIcon && { classIcon }),
    };
  };

/** "Ronin-Bot (Virtuelle Zukunft)", "Typ: Schwere Einheit", "LP: 9 / 10"; era and class only when known */
const unitTip = (name: string, info: UnitInfo, u: BattleUnit): string =>
  [
    info.era ? `${name} (${info.era})` : name,
    ...(info.unitClass ? [t('unit.class', { name: t(`unit.class.${info.unitClass}` as TextKey) })] : []),
    t('battle.hp', { end: formatNumber(u.endHp), start: formatNumber(u.startHp) }),
  ].join('\n');

/** a tile: portrait, class icon and health bar; the name and the rest in its tooltip */
const unitVm = (u: BattleUnit, unit: (id: string) => UnitInfo | undefined): UnitVm => {
  const info = unit(u.unitTypeId) ?? {};
  const name = info.name ?? u.unitTypeId;
  return {
    unit: name,
    tip: unitTip(name, info, u),
    ...(info.image && { image: info.image }),
    ...(info.classIcon && { classIcon: info.classIcon }),
    health: u.startHp > 0 ? Math.max(0, Math.min(1, u.endHp / u.startHp)) : 0,
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
