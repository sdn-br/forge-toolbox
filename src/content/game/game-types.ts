// The parts of the game format the parsers read. Everything is optional: the game may change it any time.
export interface GameResources {
  resources?: Record<string, number> | unknown[];
}

export interface GameProduct {
  __class__?: string;
  product?: GameResources;
  goods?: { good_id?: string; value?: number }[];
  name?: string;
  amount?: number;
}

export interface GameProductionOption {
  products?: { playerResources?: GameResources; guildResources?: GameResources }[];
}

export interface GameState {
  __class__?: string;
  next_state_transition_at?: number;
  current_product?: GameProduct;
  productionOption?: GameProductionOption;
  is_motivated?: boolean;
  /** set in visited cities, where is_motivated is missing */
  socialInteractionId?: string;
  boosted?: boolean;
  invested_forge_points?: number;
  forge_points_for_level_up?: number;
}

export interface GameCityEntity {
  id?: number;
  player_id?: number;
  cityentity_id?: string;
  type?: string;
  x?: number;
  y?: number;
  connected?: number;
  level?: number;
  max_level?: number;
  state?: GameState;
  bonus?: { type?: string; value?: number; amount?: number };
}

/** an unlocked piece of the city grid; the game leaves out coordinates that are 0 */
export interface GameCityMapArea {
  x?: number;
  y?: number;
  width?: number;
  length?: number;
}

export interface GameCityMap {
  gridId?: string;
  entities?: GameCityEntity[];
  /** assumed from the game format, not in a recording yet: the unlocked areas of the grid */
  unlocked_areas?: GameCityMapArea[];
  /** own city: blocks of the grid that cannot be unlocked (assumed) */
  blocked_areas?: GameCityMapArea[];
  /** own city: one entry per expansion not obtained yet */
  tilesets?: GameTileset[];
}

/** An open expansion. Where the price sits is assumed: `requirements.cost.resources`, else `cost.resources`. */
export interface GameTileset {
  type?: string;
  available?: boolean;
  requirements?: { min_era?: string; cost?: GameResources };
  cost?: GameResources;
}

/** a grid of the metadata file `grid-<hash>`: sectors list the top left tiles of their 4 × 4 blocks */
export interface GameGrid {
  id?: string;
  width?: number;
  height?: number;
  sectors?: { type?: { value?: string }; tilePositions?: { x?: number; y?: number }[] }[];
}

export interface GameClan {
  id?: number;
  name?: string;
  flag?: string;
}

export interface GamePlayer {
  player_id?: number;
  name?: string;
  avatar?: string;
  city_name?: string;
  era?: string;
  score?: number;
  rank?: number;
  is_active?: boolean;
  clan_id?: number;
  clan?: GameClan;
  is_neighbor?: boolean;
  is_friend?: boolean;
  is_guild_member?: boolean;
  canSabotage?: boolean;
  next_interaction_in?: number;
}

export interface GameUserData {
  player_id?: number;
  user_name?: string;
  era?: string;
  clan_id?: number;
  clan_name?: string;
}

export interface GameStartup {
  user_data?: GameUserData;
  city_map?: GameCityMap;
  goodsList?: { id?: string; name?: string }[];
}

export interface GameEra {
  era?: string;
  name?: string;
}

export interface GameSocialList {
  friends?: GamePlayer[];
  guildMembers?: GamePlayer[];
  neighbours?: GamePlayer[];
}

export interface GameVisit {
  other_player?: GamePlayer;
  city_map?: GameCityMap;
  other_player_era?: string;
}

export interface GameUnitBonus {
  type?: string;
  value?: number;
}

export interface GameBattleUnit {
  ownerId?: number;
  /** 1 attacker, 2 defender */
  teamFlag?: number;
  unitTypeId?: string;
  startHitpoints?: number;
  /** missing when the unit is dead */
  currentHitpoints?: number;
  bonuses?: GameUnitBonus[];
}

/** BattleRealmState: the state of a running battle, also the whole response of a move */
export interface GameBattleState {
  __class__?: string;
  /** 1 = attacker won */
  winnerBit?: number;
  surrenderBit?: number;
  round?: number;
  unitsOrder?: GameBattleUnit[];
}

/** request data of ArmyUnitManagementService.getArmyInfo (seen: `[{ __class__: 'ArmyContext', battleType: 'pvp' }]`) */
export interface GameArmyContext {
  __class__?: string;
  battleType?: string;
}

export interface GameBattle {
  battleId?: number;
  startTime?: number;
  isAutoBattle?: boolean;
  attackerPlayerId?: number;
  defenderPlayerId?: number;
  battleType?: { type?: string; era?: string };
  state?: GameBattleState;
}

/** response of OtherPlayerService.plunderById */
export interface GamePlunderResult {
  /** known: "success", "repelled" */
  result?: string;
  product?: GameProduct;
}

/** an icon over a building, from CityMapService.showEntityIcons */
export interface GameEntityIcon {
  id?: number;
  type?: string;
}

/** an entry of the event history (OtherPlayerService.getEventsPaginated) or a live one (newEvent) */
export interface GameEvent {
  id?: number;
  /** the player the event happened to; missing in some guild events */
  player_id?: number;
  /** German text relative to today, see event-date.ts */
  date?: string;
  /** known: "battle", "social_interaction", "friend_tavern_sat_down", "friend_request", "clan_member_joined" */
  type?: string;
  /** social_interaction only; known: "motivate", "polish" */
  interaction_type?: string;
  entity_id?: string;
  other_player?: GamePlayer;
  battle_id?: number;
  /** battle only, from the attacked player's view; known: "lost" */
  status?: string;
}

/**
 * An entry of OtherPlayerService.getCityProtections, from the concept of the old toolbox, not yet seen ourselves.
 * `expireTime` in Unix seconds; -1 is said to mean the player cannot be attacked at all.
 */
export interface GameCityProtection {
  playerId?: number;
  expireTime?: number;
}

export interface GameEventPage {
  page?: number;
  events?: GameEvent[];
}
