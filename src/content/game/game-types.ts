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

export interface GameCityMap {
  gridId?: string;
  entities?: GameCityEntity[];
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

export interface GameBattle {
  battleId?: number;
  startTime?: number;
  isAutoBattle?: boolean;
  attackerPlayerId?: number;
  defenderPlayerId?: number;
  battleType?: { type?: string; era?: string };
  state?: GameBattleState;
}
