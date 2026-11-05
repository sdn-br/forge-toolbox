// The known buildings the box holds, by owner, and what they are worth. Each owner is rated on its own, so a stored
// owner is read and rated again alone; the Arc bonus and the definitions (rewards and tier of a level) rate every
// owner anew.
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { KnownGreatBuilding } from '../../../shared/model';
import type { ArcBonus } from '../../domain/arc-bonus';
import {
  byDefaultOrder,
  type Investment,
  type Investments,
  myInvestments,
  type PossibleInvestment,
  possibleInvestments,
} from '../../domain/investments';
import type { GreatBuildingDef, TierStart } from '../../model/catalog';

export interface OwnerRatings {
  /** every known building anew, as a read of all brings them */
  replaceAll(buildings: KnownGreatBuilding[]): void;
  /** the buildings of one owner anew; none drops the owner */
  replace(owner: PlayerId, buildings: KnownGreatBuilding[]): void;
  /** the Arc bonus the rows are rated with */
  arc(): ArcBonus;
  /** a new Arc bonus rates every owner anew */
  setArc(arc: ArcBonus): void;
  /** the definitions changed, the rewards or the tier of a level: every owner is rated anew */
  rewardsChanged(): void;
  /** the own investments in their default order; the same object while nothing changes */
  investments(): Investments;
  /** the possible investments, rated when first asked for; the same array while nothing changes */
  candidates(): PossibleInvestment[];
  /** every known building as read, for the finder; the same array while nothing changes */
  buildings(): KnownGreatBuilding[];
}

export function ownerRatings(
  greatBuilding: (def: BuildingDefId) => GreatBuildingDef | undefined,
  me: () => PlayerId | undefined,
  tiers?: () => TierStart[],
): OwnerRatings {
  const known = new Map<PlayerId, KnownGreatBuilding[]>();
  const mine = new Map<PlayerId, Investment[]>();
  const possible = new Map<PlayerId, PossibleInvestment[]>();
  let arc: ArcBonus = { copper: 0, gold: 0 };
  let investments: Investments | undefined;
  let candidates: PossibleInvestment[] | undefined;
  let buildings: KnownGreatBuilding[] | undefined;

  /** the rows of every owner in the order a read of all brings them, by owner, rating an owner not rated yet */
  const all = <T>(rated: Map<PlayerId, T[]>, rate: (buildings: KnownGreatBuilding[]) => T[]): T[] =>
    [...known.keys()]
      .sort((a, b) => a - b)
      .flatMap((owner) => {
        let rows = rated.get(owner);
        if (!rows) {
          rows = rate(known.get(owner) ?? []);
          rated.set(owner, rows);
        }
        return rows;
      });
  const forget = (owner?: PlayerId) => {
    if (owner === undefined) {
      mine.clear();
      possible.clear();
    } else {
      mine.delete(owner);
      possible.delete(owner);
    }
    investments = undefined;
    candidates = undefined;
  };
  /** what was read changed: the finder takes the buildings anew */
  const reread = (owner?: PlayerId) => {
    forget(owner);
    buildings = undefined;
  };

  return {
    replaceAll(buildings) {
      known.clear();
      for (const b of buildings) {
        const rows = known.get(b.owner);
        if (rows) rows.push(b);
        else known.set(b.owner, [b]);
      }
      reread();
    },
    replace(owner, buildings) {
      if (buildings.length > 0) known.set(owner, buildings);
      else known.delete(owner);
      reread(owner);
    },
    arc: () => arc,
    setArc(next) {
      if (next.copper === arc.copper && next.gold === arc.gold) return;
      arc = next;
      forget();
    },
    rewardsChanged() {
      forget();
    },
    investments() {
      investments ??= {
        rows: all(mine, (b) => myInvestments(b, arc, greatBuilding, tiers?.()).rows).sort(byDefaultOrder),
      };
      return investments;
    },
    candidates() {
      candidates ??= all(possible, (b) => possibleInvestments(b, greatBuilding, arc, me(), tiers?.()));
      return candidates;
    },
    buildings() {
      buildings ??= [...known.values()].flat();
      return buildings;
    },
  };
}
