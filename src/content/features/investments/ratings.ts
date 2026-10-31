// The known buildings the box holds, by owner, and what they are worth. Each owner is rated on its own, so a stored
// owner is read and rated again alone; the Arc bonus rates every owner anew, the rewards of a level the possible ones.
import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { KnownGreatBuilding } from '../../../shared/model';
import {
  byDefaultOrder,
  type Investment,
  type Investments,
  myInvestments,
  type PossibleInvestment,
  possibleInvestments,
} from '../../domain/investments';
import type { GreatBuildingDef } from '../../model/catalog';

export interface OwnerRatings {
  /** every known building anew, as a read of all brings them */
  replaceAll(buildings: KnownGreatBuilding[]): void;
  /** the buildings of one owner anew; none drops the owner */
  replace(owner: PlayerId, buildings: KnownGreatBuilding[]): void;
  /** the Arc bonus the rows are rated with */
  arc(): number;
  /** a new Arc bonus rates every owner anew */
  setArc(arc: number): void;
  /** the rewards of a level changed: the possible investments are rated anew */
  rewardsChanged(): void;
  /** the own investments in their default order; the same object while nothing changes */
  investments(): Investments;
  /** the possible investments, rated when first asked for; the same array while nothing changes */
  candidates(): PossibleInvestment[];
}

export function ownerRatings(
  greatBuilding: (def: BuildingDefId) => GreatBuildingDef | undefined,
  me: () => PlayerId | undefined,
): OwnerRatings {
  const known = new Map<PlayerId, KnownGreatBuilding[]>();
  const mine = new Map<PlayerId, Investment[]>();
  const possible = new Map<PlayerId, PossibleInvestment[]>();
  let arc = 0;
  let investments: Investments | undefined;
  let candidates: PossibleInvestment[] | undefined;

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

  return {
    replaceAll(buildings) {
      known.clear();
      for (const b of buildings) {
        const rows = known.get(b.owner);
        if (rows) rows.push(b);
        else known.set(b.owner, [b]);
      }
      forget();
    },
    replace(owner, buildings) {
      if (buildings.length > 0) known.set(owner, buildings);
      else known.delete(owner);
      forget(owner);
    },
    arc: () => arc,
    setArc(next) {
      if (next === arc) return;
      arc = next;
      forget();
    },
    rewardsChanged() {
      possible.clear();
      candidates = undefined;
    },
    investments() {
      investments ??= { rows: all(mine, (b) => myInvestments(b, arc).rows).sort(byDefaultOrder) };
      return investments;
    },
    candidates() {
      candidates ??= all(possible, (b) => possibleInvestments(b, greatBuilding, arc, me()));
      return candidates;
    },
  };
}
