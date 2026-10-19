# Datenmodell: Player, City und Battle

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

type PlayerSource = 'socialList' | 'visit' | 'update' | 'ranking' | 'gbg' | 'event';
```

**Regeln**

- `getSocialList` ist für Beziehungen die vollständige Quelle. Wer in der neuen Liste nicht mehr als Nachbar steht, verliert `neighbor`. So erkennt die Toolbox, wenn sich die Nachbarschaft neu mischt.
- Andere Quellen (Stadtbesuch, `OtherPlayerService.updatePlayer`, Rangliste, GbG) aktualisieren nur die Felder, die sie mitbringen, und ändern Beziehungen nie.
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

**Woher die Definitionen kommen (geprüft am 2026-10-19 auf de20):** Das Spiel lädt zuerst `building_entity_lookup` (Liste aller Gebäude mit URL und Hash). Danach lädt es einzeln per XHR nur die Definitionen, die es braucht: beim Start rund 110 für die eigene Stadt, beim Besuch einer Stadt die noch fehlenden (beim ersten Besuch 18). Der Helfer lädt dagegen alle rund 2.900 selbst vom CDN.

Daraus folgt:

- Der Catalog liest nur mit, was das Spiel lädt. Eigene CDN-Abrufe braucht es nicht.
- Definitionen werden nicht gespeichert. Das Spiel lädt in jeder Sitzung alle, die es braucht, erneut.
- Beim Stadtbesuch kommen fehlende Definitionen kurz nach `visitPlayer`. Der Catalog meldet `catalog.updated { defs }`, und wer eine Stadt bewertet, rechnet dann neu. Bis dahin markiert `CityAssessment` die Bewertung als unvollständig.

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
  missingDefs: BuildingDefId[];   // noch nicht geladen, Bewertung unvollständig
}
```

Sabotage ruft sie nach `city.visited` auf und baut daraus sein ViewModel. Andere Features (Spielerprofil, PvP-Angriffe) können sie ebenso nutzen, ohne Sabotage zu kennen.

## Regeln der Bewertung (geprüft am 2026-10-19)

Geprüft an der eigenen Stadt gegen `BoostService.getAllBoosts`, das die Boosts fertig berechnet und pro Gebäude mit Quelle liefert (`building`, `building_set_adjacency`, `building_chain_links`, `castle_system`, `friends_tavern_customization`). Gebäude, Sets und Ketten stimmen exakt überein, Testfall `test/fixtures/own-city.json`.

- **Zeitalter eines Gebäudes:** Klassische Mehrzeitalter-Gebäude behalten das Zeitalter, in dem sie gebaut oder zuletzt verbessert wurden. Es steht als `level` (Index in der Reihenfolge von `research_eras`) am Gebäude. Generische Gebäude und LGs zählen mit dem Zeitalter der Stadt.
- **Sets:** Stufe n gilt, wenn das Gebäude an n verschiedene andere Gebäude desselben Sets mit einer Kante grenzt. Die Stufen zählen zusammen.
- **Ketten:** Vom Startgebäude aus über `linkPositions` ablaufen. Jedes erreichte Glied gibt seinen Bonus. Das Spiel bucht die Summe auf das Startgebäude.
- **LG-Boni:** `military_boost` für die angreifende, `fierce_resistance` für die verteidigende Armee, `advanced_tactics` für beide. Gleiche Zuordnung wie im Forge Hammer.
- **Nicht bekannt für fremde Städte:** Burgsystem-Bonus (bei der eigenen Stadt +6 auf beide Armeen) und Verbündete. Die alte Toolbox hat offenbar den eigenen Burgsystem-Bonus auf fremde Städte gerechnet.
- **Echte Werte aus dem Kampf:** `BattlefieldService.startByBattleType` liefert je Einheit die tatsächlichen Boni beider Seiten (`attack_boost`, `attacker_defense_boost`, `defender_attack_boost`, `defense_boost`, dazu die LG-Typen). Beim Test gegen eine fremde Stadt lag die Berechnung rund 30 (Angriff) und 41 (Verteidigung) unter dem Spiel, vermutlich Burgsystem und Verbündete. Berechnete Werte vor einem Kampf sind daher eine Untergrenze. Die gemessenen Werte speichert der Battle-Store (siehe unten).
- **Zeiten:** In fremden Städten verbirgt das Spiel alle Zeiten (`next_state_transition_at` und `_in` = 2147483647). Sicher plünderbar ist nur, was fertig ist.

## Battle (PvP-Angriffe)

Stand 2026-10-19. Grundlage: ein aufgenommener Autokampf auf de20 (`BattlefieldService.startByBattleType`, Testfall `test/fixtures/pvp-battle.json`).

```ts
type BattleResult = 'won' | 'lost' | 'surrendered';

interface Battle {
  world: WorldId;
  battleId: number;
  at: number;                   // Kampfbeginn in ms
  opponent: PlayerId;           // der Verteidiger
  result: BattleResult;
  auto: boolean;
  rounds: number;
  era: EraId;                   // Zeitalter des Kampfes
  attacker: BattleSide;         // die eigene Armee
  defender: BattleSide;
}

interface BattleSide {
  bonuses: Record<string, number>;   // Rohwerte je Bonus-Typ des Spiels
  units: { unitTypeId: string; startHp: number; endHp: number }[];
}
```

**Regeln**

- Gespeichert werden nur PvP-Kämpfe (`battleType.type === 'pvp'`), in denen der eigene Spieler angreift. Ohne Session wird nichts gespeichert.
- Die Seite einer Einheit steht in `teamFlag`: 1 Angreifer, 2 Verteidiger. `bonuses` sind die Summen je Typ aus der ersten Einheit der Seite. Alle Einheiten einer Seite tragen in der Aufnahme dieselben Boni.
- Die Boni bleiben roh gespeichert. Sie sind unwiederbringlich, und eine spätere Auswertung soll sie neu deuten können.
- Fehlt `currentHitpoints`, ist die Einheit tot (`endHp` 0).
- Ergebnis: `surrenderBit` gesetzt ergibt `surrendered`, `winnerBit` 1 ergibt `won`, ein anderer `winnerBit` ergibt `lost`. Ohne `winnerBit` steht der Kampf noch aus und wird nicht gespeichert. Das trifft vermutlich jeden manuellen Kampf; dessen Ergebnis kommt mit einer späteren Nachricht, für die es noch keine Aufnahme gibt.
- Derselbe Kampf zweimal gesehen wird einmal gespeichert (Schlüssel `[world+battleId]`).

**Gemessene Werte** rechnet eine reine Funktion `measuredArmy(battle)` aus den Rohwerten:

| Seite | Angriff | Verteidigung |
|---|---|---|
| Angreifer | `attack_boost` + `military_boost` + `advanced_tactics` | `attacker_defense_boost` + `military_boost` + `advanced_tactics` |
| Verteidiger | `defender_attack_boost` + `fierce_resistance` + `advanced_tactics` | `defense_boost` + `fierce_resistance` + `advanced_tactics` |

Geprüft am 2026-10-19 an der Aufnahme: Beim Angreifer ist `attack_boost` 233 und `attacker_defense_boost` 134, genau die eigenen Gebäude-Boosts aus `BoostService.getAllBoosts` (227 + 6 und 128 + 6). `military_boost` 135 kommt aus den LGs. Beim Verteidiger stimmen `fierce_resistance` 32,5 und `advanced_tactics` 20,5 genau mit der Berechnung aus der besuchten Stadt überein. Gemessen: Angreifer 368 / 269, Verteidiger 406 / 443. Die Einheiten des Verteidigers tragen zusätzlich `attack_boost` 12. Der Wert gehört nicht zur verteidigenden Armee und fließt nicht ein.

Ein Kampf misst nur die verteidigende Armee des Gegners. Seine angreifende Armee zeigt er nie. Die Stadtinformationen zeigen deshalb den gemessenen Wert nur in der Zeile der verteidigenden Armee.

**Abfragen:** `latest(opponent)`, `list({ opponents?, limit, offset })` neueste zuerst, `count(opponents?)`. Die Abfragen laufen über RPC im Service Worker. Der Store hält keine Kämpfe im Speicher, er wartet vor jeder Abfrage nur die eigenen offenen Schreibvorgänge ab.

**Events:** `battle.recorded { opponent: PlayerId }`, einmal je neuem Kampf.

**Persistenz:** Tabelle `battles` (Dexie Version 2), Schlüssel `[world+battleId]`, Indizes `[world+at]`, `[world+opponent+at]` und `at`. Neue Kämpfe einer Spielantwort gehen gesammelt in einem Schreibvorgang an den Service Worker.

**Aufbewahrung:** Einstellung „Kämpfe aufbewahren“: unbegrenzt (Standard), 30, 90, 180 oder 365 Tage. Ältere Kämpfe aller Welten löscht der Service Worker (`battles.prune`) einmal beim Start der Session und sobald sich die Einstellung ändert.

**Spieler:** Ein Kampf verweist auf `opponent`. Eine Bereinigung der Spieler gibt es noch nicht. Kommt sie, muss sie Spieler behalten, auf die ein Kampf verweist. Den Namen des Gegners liefert meist das `OtherPlayerService.updatePlayer`, das in derselben Antwort wie der Kampf kommt.

## Zuordnung Spielantwort → Store

| Spielantwort | Store | Wirkung |
|---|---|---|
| `StartupService.getData` | Session, City, Catalog | Session anlegen, eigene Stadt setzen, Güter laden |
| `OtherPlayerService.getSocialList` | Player | alle Spieler aktualisieren, Beziehungen neu setzen |
| `OtherPlayerService.visitPlayer` | Player, City | Spieler aktualisieren, besuchte Stadt setzen |
| `OtherPlayerService.updatePlayer` | Player | Spieler aktualisieren |
| `BattlefieldService.startByBattleType` | Battle | eigenen PvP-Angriff speichern |
| `CityMapService.updateEntity`, `reset` | City | eigene oder besuchte Stadt je nach Spieler-ID |
| `CityMapService.placeBuilding`, `removeBuilding`, `moveEntity` | City | eigene Stadt ändern |
| Metadaten `building_entity_lookup` und `building_entity_<id>` | Catalog | Gebäude-Definitionen |

## Offene Punkte

- Besuchte Städte bleiben vorerst nur im Speicher. Sobald ein Feature einen Verlauf braucht (etwa wann ein Nachbar wieder plünderbar war), bekommen sie eine Tabelle.
- Genaue Namen der Spiel-Methoden für Bauen, Abreißen und Verschieben aus einer Aufnahme bestätigen.
