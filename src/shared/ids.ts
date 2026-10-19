// Branded ids keep a player id from passing as a guild id.
export type WorldId = string & { readonly brand: 'WorldId' };
export type PlayerId = number & { readonly brand: 'PlayerId' };
export type GuildId = number & { readonly brand: 'GuildId' };
export type EraId = string & { readonly brand: 'EraId' };
export type BuildingDefId = string & { readonly brand: 'BuildingDefId' };

export const worldId = (v: string) => v as WorldId;
export const playerId = (v: number) => v as PlayerId;
export const guildId = (v: number) => v as GuildId;
export const eraId = (v: string) => v as EraId;
export const buildingDefId = (v: string) => v as BuildingDefId;
