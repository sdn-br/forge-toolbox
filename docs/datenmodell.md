# Datenmodell: Player und City

Stand 2026-10-19. Entwurf für Phase 1. Grundlage: Aufnahme echter Spielantworten auf de20 (`StartupService.getData`, `OtherPlayerService.getSocialList`, `OtherPlayerService.visitPlayer`) und die Daten, die Sabotage heute braucht.

## Grundsätze

1. **Fakten speichern, Abgeleitetes berechnen.** Stores halten, was das Spiel gemeldet hat, in eigenem Format. Werte wie Angriff und Verteidigung einer Stadt oder plünderbare Produktionen rechnet eine reine Funktion daraus aus. So bleiben Stores schlank, und die Rechnung ist mit Fixtures testbar.
2. **Eigene Namen, eigene Typen.** Kein Feld heißt wie im Spielformat, nur weil es dort so heißt (`clan_id` wird `guildId`). Zustände sind getrennte Varianten statt einer Sammlung optionaler Felder.
3. **Jeder Datensatz weiß, woher und von wann er ist** (`source`, `seenAt`). Wer zuletzt etwas gemeldet hat, gewinnt, aber nur für die Felder, die er mitbringt.
4. **Ein Store, ein Besitzer.** Nur der Store ändert seine Daten. Andere lesen über Abfragen oder hören auf seine Events.

## Identität

```ts
type WorldId = string & { readonly brand: 'WorldId' };     // "de20"
type PlayerId = number & { readonly brand: 'PlayerId' };
type GuildId = number & { readonly brand: 'GuildId' };
type EraId = string & { readonly brand: 'EraId' };          // "ColonialAge"
type BuildingDefId = string & { readonly brand: 'BuildingDefId' }; // "R_ColonialAge_Residential1"
```

Alle Daten gehören zu einer Welt. Persistente Schlüssel sind immer `[world, id]`. Die Marken (`brand`) verhindern, dass eine Spieler-ID versehentlich als Gilden-ID durchgeht.

Der eigene Spieler ist die **Session**: Welt, eigene Spieler-ID, Name, Gilde, Zeitalter. Sie kommt aus `StartupService.getData` (`user_data`) und ist die Voraussetzung für alles andere.

## Player

```ts
interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  score: number;
  rank: number;
  active: boolean;
  guild?: GuildRef;
  relations: Relations;
  firstSeenAt: number;
  seenAt: number;
  source: PlayerSource;
}

interface GuildRef { id: GuildId; name: string; flag?: string }

interface Relations {
  neighbor: boolean;
  guildMember: boolean;
  friend: boolean;
}

type PlayerSource = 'socialList' | 'visit' | 'ranking' | 'gbg' | 'event';
```

**Regeln**

- `getSocialList` ist für Beziehungen die vollständige Quelle. Wer in der neuen Liste nicht mehr als Nachbar steht, verliert `neighbor`. So erkennt die Toolbox, wenn sich die Nachbarschaft neu mischt.
- Andere Quellen (Stadtbesuch, Rangliste, GbG) aktualisieren nur die Felder, die sie mitbringen, und ändern Beziehungen nie.
- Gildenmitglieder bringen mehr mit (Titel, Rechte, gewonnene Kämpfe). Das gehört in einen späteren Guild-Store, nicht in Player.
- Notizen, PvP-Verlauf und LG-Daten verweisen auf `PlayerId`, liegen aber in ihren eigenen Stores.

**Abfragen:** `get(id)`, `list({ relation })`, `search(name)`.

**Events:** `player.updated { ids: PlayerId[]; source }`. Eine Soziale Liste mit 128 Spielern löst ein Event aus, nicht 128.

**Persistenz:** Tabelle `players`, Schlüssel `[world+id]`, Indizes `seenAt` und Beziehungen. Spieler bleiben dauerhaft, solange ein anderer Store auf sie verweist (Notiz, PvP-Eintrag). Alle anderen werden gelöscht, wenn sie 90 Tage nicht gesehen wurden.

## City

Es gibt zwei Arten von Städten, mit verschiedenem Lebenslauf:

| | Eigene Stadt | Besuchte Stadt |
|---|---|---|
| Quelle | `StartupService.getData`, danach Änderungen über `CityMapService` | `OtherPlayerService.visitPlayer` |
| Ändert sich | laufend (Produktion, Bau, Abriss) | nur selten, z.B. nach einer FP-Einzahlung |
| Im Speicher | immer die aktuelle | die zuletzt besuchte |
| Persistiert | nein, kommt bei jedem Start neu | nein, siehe offene Punkte |

```ts
interface City {
  world: WorldId;
  owner: PlayerId;
  map: 'main' | string;         // Siedlungen und Kolonien haben eigene Karten
  era: EraId;
  takenAt: number;
  buildings: Map<number, Building>;
}

interface Building {
  id: number;                   // Entity-ID, eindeutig innerhalb der Stadt
  def: BuildingDefId;
  type: BuildingType;
  x: number;
  y: number;
  connected: boolean;
  state: BuildingState;
  greatBuilding?: GreatBuildingState;
}

type BuildingState =
  | { kind: 'idle' }
  | { kind: 'producing'; readyAt: number; product?: Product; motivated?: boolean; boosted?: boolean }
  | { kind: 'finished'; product: Product }
  | { kind: 'unconnected' }
  | { kind: 'constructing'; readyAt: number }
  | { kind: 'unknown'; gameClass: string };

interface Product {
  resources: Partial<Record<ResourceId, number>>;
  label?: string;
}

interface GreatBuildingState {
  level: number;
  maxLevel: number;
  investedFp?: number;          // nur in der eigenen Stadt bekannt
  fpForLevelUp: number;
  bonus?: { type: string; value: number; amount?: number };
}
```

**Regeln**

- `CityMapService.updateEntity` und `CityMapService.reset` tragen die Spieler-ID der Gebäude. Danach entscheidet der Store, ob die eigene oder die besuchte Stadt betroffen ist. Die alte Toolbox hatte hier einen Fehler: Nach einer FP-Einzahlung in ein fremdes LG kam `reset`, und die Daten des LGs blieben alt.
- Unbekannte Zustände des Spiels werden `unknown` mit dem Klassennamen. Ein neuer Zustand im Spiel bricht dann nichts, er wird nur nicht ausgewertet.

**Abfragen:** `own()`, `visited()`, `building(owner, id)`.

**Events:** `city.ownChanged { buildingIds?: number[]; reset: boolean }`, `city.visited { owner: PlayerId }`.

## Catalog (statische Spieldaten)

City allein reicht für Sabotage nicht. Ob ein Gebäude plünderbar ist und welche Angriffs- und Verteidigungsboni es bringt, steht nicht in der Stadt, sondern in den Gebäude-Definitionen des Spiels. Deshalb braucht Phase 1 einen dritten Store:

```ts
interface BuildingDef {
  id: BuildingDefId;
  name: string;
  type: BuildingType;
  size: { width: number; length: number };
  flags: { motivatable: boolean; polishable: boolean; plunderable: boolean };
  chain?: { id: string; start: boolean };
  set?: { id: string };
  boosts: (era: EraId) => Boost[];
}

interface Boost {
  type: BoostType;              // z.B. 'att_boost_attacker', 'plunder_repel'
  feature: 'all' | 'battleground' | 'guild_expedition' | 'guild_raids' | string;
  value: number;
  needsLinks?: number;          // Set-Bonus erst ab dieser Zahl verbundener Nachbarn
}
```

Dazu kommen Zeitalter (Reihenfolge, Namen), Güter (aus `goodsList` beim Start) und Ressourcen-Definitionen.

**Offene Frage für Phase 1:** Der Helfer lädt Gebäude-Definitionen einzeln vom Inno-CDN, offenbar weil das Spiel sie nicht mehr gesammelt beim Start lädt. Der Prototyp hat nur `game/json` mitgeschnitten, keine Metadaten. Phase 1 schneidet auch Metadaten mit und prüft, was das Spiel selbst lädt. Reicht das nicht, holt die Toolbox fehlende Definitionen vom CDN, wie es die Repo-Regel als Ausnahme erlaubt, und hält sie mit dem Hash des Spiels als Cache in der DB.

## Abgeleitete Werte: CityAssessment

Eine reine Funktion, kein Store:

```ts
function assessCity(city: City, catalog: Catalog): CityAssessment;

interface CityAssessment {
  army: {
    attacker: { attack: number; defense: number };
    defender: { attack: number; defense: number };
  };
  plunderRepel: number;
  plunderable: { building: number; product: Product; readyAt?: number }[];
}
```

Sabotage ruft sie nach `city.visited` auf und baut daraus sein ViewModel. Andere Features (Spielerprofil, PvP-Angriffe) können sie ebenso nutzen, ohne Sabotage zu kennen.

## Zuordnung Spielantwort → Store

| Spielantwort | Store | Wirkung |
|---|---|---|
| `StartupService.getData` | Session, City, Catalog | Session anlegen, eigene Stadt setzen, Güter laden |
| `OtherPlayerService.getSocialList` | Player | alle Spieler aktualisieren, Beziehungen neu setzen |
| `OtherPlayerService.visitPlayer` | Player, City | Spieler aktualisieren, besuchte Stadt setzen |
| `CityMapService.updateEntity`, `reset` | City | eigene oder besuchte Stadt je nach Spieler-ID |
| `CityMapService.placeBuilding`, `removeBuilding`, `moveEntity` | City | eigene Stadt ändern |
| Metadaten `city_entities` | Catalog | Gebäude-Definitionen |

## Offene Punkte

- Metadaten-Verkehr des Spiels mitschneiden und prüfen (siehe Catalog).
- Besuchte Städte bleiben vorerst nur im Speicher. Sobald ein Feature einen Verlauf braucht (etwa wann ein Nachbar wieder plünderbar war), bekommen sie eine Tabelle.
- Genaue Namen der Spiel-Methoden für Bauen, Abreißen und Verschieben aus einer Aufnahme bestätigen.
