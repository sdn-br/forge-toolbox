/** A limited bonus of the player as `BonusService.getLimitedBonuses` lists it. */
export interface LimitedBonus {
  type: string;
  value: number;
  /** the own building that grants it, when it comes from one */
  entityId?: number;
}
