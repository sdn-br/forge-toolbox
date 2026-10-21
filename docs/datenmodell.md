# Datenmodell: Player, City, Battle und Great Buildings

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
  attack?: AttackTimer;         // fehlt, bis eine Quelle mit Zeitgebern den Spieler gemeldet hat
  firstSeenAt: number;
  seenAt: number;
  source: PlayerSource;
}

interface AttackTimer {
  canPlunder: boolean;          // canSabotage: Kampf gewonnen, noch nicht geplündert
  nextInteractionAt?: number;   // jetzt + next_interaction_in (Sekunden), in ms
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
- **Angriffs-Zeitgeber** (`canSabotage`, `next_interaction_in`, gesehen 2026-10-21): Direkt nach einem gewonnenen Kampf bringt `updatePlayer` `next_interaction_in: 86400` und `canSabotage: true`, direkt nach dem Plündern `next_interaction_in: 86345` und kein `canSabotage` mehr. In `getSocialList` hatten 30 von 75 Nachbarn `next_interaction_in`, 28 davon `canSabotage`. `visitPlayer` bringt keine Zeitgeber. Gespeichert wird der absolute Zeitpunkt (`nextInteractionAt`), so stimmt er auch nach einem Neuladen.
- Nur Quellen, die den ganzen Spieler bringen, setzen die Zeitgeber, und dort heißt ein fehlendes Feld „nicht gesetzt“: `updatePlayer` und die Nachbarn aus `getSocialList`. So verschwindet `canPlunder` nach dem Plündern. Freunde und Gildenmitglieder aus `getSocialList`, `visitPlayer` und die Spieler in Ereignissen lassen die bekannten Zeitgeber stehen.
- Die Plünderfrist ist derselbe Zeitgeber wie `next_interaction_in`. So rechnet auch die alte Toolbox, im Spiel ist es nicht belegt. Ohne Frist gilt `canPlunder` nicht.
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
  areas?: Area[];               // freigeschaltete Gebiete, fehlt, wenn das Spiel keine schickt
  blocked?: Area[];             // nur eigene Stadt: city_map.blocked_areas, kommt als reine Positionen je 4 × 4-Block
  expansions?: ExpansionOffer[];// nur eigene Stadt: city_map.tilesets, offene Erweiterungen
}

interface ExpansionOffer {
  kind: string;                 // Spieltyp: 'tileset_reward' | 'raidMedals' | 'tileset_premium' | …
  minEra?: EraId;               // requirements.min_era
  cost: Record<ResourceId, number>;
}

interface Area { x: number; y: number; width: number; length: number }

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

**Straßenbedarf (`BuildingDef.street`):** Stufe der Straße, die ein Gebäude braucht, 0 für keine. Klassische Definitionen: `requirements.street_connection_level`, generische: Komponente `streetConnectionRequirement.requiredLevel` in irgendeinem Zeitalter. Fehlt `requirements` bei einer klassischen Definition ganz, bleibt der Wert unbekannt. Beide Felder kommen in echten Definitionen vor (geprüft 2026-10-21 an einer Aufnahme), die Fixtures sind gekürzt und enthalten sie nicht.

**Stadtgitter:** Metadatei `grid-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta` wie die übrigen Metadaten). Eine Liste von Gittern, verwendet wird `id: 'main'` (72 × 72). `sectors[].tilePositions` sind die linken oberen Ecken der 4 × 4-Blöcke, nur Sektoren vom Typ `Regular` zählen (der Typ ist ein Enum-Objekt `{ __enum__: 'GridSectorType', value: 'Regular' }`), fehlende `x`/`y` sind 0. Der Catalog hält es als `CityGrid { width, height, blocks }` und meldet `catalog.grid`.

**Forschung:** Metadatei `research-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta`; Name genau `research`, `research_eras` hat dasselbe Präfix und ist eine andere Datei). Ein Array der Technologien in der Reihenfolge des Baums, Zeitalter aufsteigend. Je Technologie `id`, `name`, `era`, `parents`, `children` und `rewards[]` mit `{ id, type, subType, amount, name, value, … }` (geprüft 2026-10-21). Hauptstadt-Erweiterungen sind `type: 'expansion'`, `subType: 'main'` (66 über alle Technologien). Andere Typen wie `era_outpost_expansion` oder `stellar_city_expansion` gehören zu anderen Städten und zählen nicht, ebenso `building` oder `terraforming`. Der `ResearchStore` hält davon nur die Technologien mit Hauptstadt-Erweiterungen als `{ tech, name, amount }` in Dateireihenfolge.

**Forschungsstand:** `ResearchService.getProgress` kommt mit den Startdaten. `responseData` ist ein Objekt `{ inProgressTechnologies, unlockedNodes, chosenBranches }`, `unlockedNodes` sind die Ids der erforschten Technologien (in der Aufnahme 375). In manchen Antworten kommt `getProgress` ohne Objekt, diese werden übergangen. Der `ResearchStore` hält die Ids im Speicher (nicht persistiert) und meldet wie bei der Metadatei `research.changed`. Gelesen wird nur der Stand vom Start: eine während des Spiels fertig erforschte Technologie zählt bis zum Neuladen als offen, die Antwort dazu ist noch nicht aufgenommen.

## Ressourcen

`ResourceService.getPlayerResourceBag` kommt mit den Startdaten. Format (geprüft 2026-10-21): `{ type, resources: { resources: { money, premium, expansions, guild_raids_medals, … } } }`, die Mengen stecken also eine Ebene tiefer. Der `ResourceStore` hält den Beutel im Speicher (nicht persistiert) und meldet `resources.changed`. In der Aufnahme ist `type` ein Enum `{ __enum__: 'ResourceBagType', value: 'PlayerMain' }`. Nur Beutel ohne Typ oder mit `PlayerMain` zählen, andere Typen gehören zu anderen Beständen und werden übergangen.

**Updates:** Alle können als normale Antwort oder über den Websocket kommen, ein Websocket-Rahmen kann mehrere Nachrichten bündeln.

- `ResourceService.getPlayerResourceBag` später im Spiel, **aufgezeichnet 2026-10-21:** wie beim Start (`PlayerMain`), etwa in der Antwort auf eine eigene LG-Einzahlung (dort `strategy_points` 0) und nach Quest-Aktionen und Ereignissen der Karte. Ersetzt den Bestand.
- `ResourceService.getPlayerResources`, **unter Vorbehalt, nicht aufgezeichnet:** `responseData.resources` ersetzt den ganzen Bestand.
- `OtherPlayerService.newEvent`, **unter Vorbehalt, nicht aufgezeichnet:** mit `type: trade_accepted`: Ein anderer Spieler hat ein eigenes Handelsangebot angenommen, `need.value` des Guts `need.good_id` kommt zum Bestand dazu. Nur, wenn der Bestand schon bekannt ist.

## Inventar

Stand 2026-10-21. `InventoryService.getItems` kommt mit den Startdaten, eine Liste aller Gegenstände (in der Aufnahme 298). Je Eintrag (gesehen): `id` (Stapel im Inventar), `name`, `description`, `inStock`, `itemAssetName`, `item` (die Nutzlast, ihr `__class__` sagt, was der Gegenstand tut) und Felder für Tausch und Sortierung. Gesehene Klassen: `BuildingItemPayload`, `SelectionKitPayload`, `UpgradeKitPayload`, `FragmentItemPayload`, `BoostItemPayload`, `SpeedupPayload`, `RewardItemPayload`, `ForgePointPackagePayload`, dazu einzelne Kits.

```ts
interface InventoryItem {
  id: number;
  name: string;
  inStock: number;
  gameClass: string;            // Klasse der Nutzlast, z.B. 'ForgePointPackagePayload'
  asset?: string;               // itemAssetName
  payload:
    | { kind: 'forgePoints'; gain: number }                        // item.resource_package.gain
    | { kind: 'building'; def: BuildingDefId; level?: number }      // item.cityEntityId, item.level
    | { kind: 'boost'; boostType: string; value: number; duration?: number }
    | { kind: 'other' };        // alle übrigen Klassen, bis ein Feature sie braucht
}
```

Der `InventoryStore` hält die Liste im Speicher (nicht persistiert, kommt bei jedem Start neu) und meldet `inventory.changed`. Abfragen: `items()`, `item(id)`, `forgePointPackages()` (Summe des Spiels oder gerechnet, siehe unten), `computedForgePointPackages()`.

**FP-Pakete:** Gegenstände mit `ForgePointPackagePayload`. Ihr Wert ist `inStock × gain`. Referenz (Aufnahme 2026-10-21): 9.931 × 10 + 401 × 5 + 3.569 × 2 = 108.453 FP. Der LG-Rechner zählt sie zu den verfügbaren FP, weil das Spiel beim Einzahlen Pakete selbst öffnet.

**Updates:** Alle können als normale Antwort oder über den Websocket kommen, ein Websocket-Rahmen kann mehrere Nachrichten bündeln.

- `getItems` (ganze Liste) ersetzt das Inventar.
- `updateItem`, **aufgezeichnet 2026-10-21:** `{ id, amount, __class__: 'InventoryItemUpdate' }`, `amount` ist der neue Bestand, keine Differenz. Bei einer eigenen LG-Einzahlung von 301 FP kamen zwei getrennte Nachrichten in derselben Antwort (10er-Pakete 9.931 → 9.906, 5er-Pakete 401 → 400). Eine Liste solcher Einträge wird ebenfalls gelesen (unter Vorbehalt).
- `GreatBuildingsService.getAvailablePackageForgePoints`, **aufgezeichnet 2026-10-21:** `[108198]`, die Summe der FP in Paketen, die das Spiel selbst rechnet. Sie stimmte mit `inStock × gain` überein. Entscheidung: Der Store nimmt diese Summe, solange sich danach nichts am Inventar geändert hat, sonst rechnet er selbst. So zählt im Zweifel der Wert des Spiels, und eine spätere Änderung ohne neue Summe macht ihn nicht falsch. Kennt der Store noch keine Liste (kein Start in der Sitzung), reicht die Summe allein für die verfügbaren FP.

**Unter Vorbehalt, nicht aufgezeichnet:**

- `getItemsByType`: ganze Gegenstände eines Typs, sie werden nach `id` eingefügt oder ersetzt. Gegenstände anderer Typen bleiben.
- `getItem`: ein ganzer Gegenstand, eingefügt oder ersetzt. So kommen neue Gegenstände an, etwa FP-Pakete aus einem gelevelten LG, Quest- oder Kartenbelohnungen.
- `getItemAmount`: `responseData` ist das Paar `[id, Menge]`, die Menge ist der neue Bestand.
- Unbekannte `id` bei `getItemAmount` und `updateItem` werden übergangen, bis die nächste ganze Liste kommt.
- `inventory.changed` kommt einmal je Spielantwort oder Websocket-Rahmen und nur, wenn sich etwas geändert hat. Das Öffnen von Paketen schickt mehrere Updates hintereinander.

## Erweiterungen (abgeleitet)

Reine Funktionen in `src/content/domain/expansions.ts`. Referenz eigene Stadt (Aufnahme 2026-10-21): 324 Blöcke im Gitter, 190 freigeschaltet, 49 gesperrt, 85 frei, davon 32 angrenzend, `tilesets` mit genau 85 Einträgen (23 `tileset_reward`, 9 `raidMedals`, 53 `tileset_premium`).

- **Gesetzt:** freigeschaltete Felder ÷ 16 − 16 (der Startbereich 16 × 16 sind 16 Blöcke).
- **Freie Blöcke:** Block des Gitters, dessen linkes oberes Feld weder in `unlocked_areas` noch in `blocked_areas` liegt. „Jetzt setzbar“, wenn er eine Kante mit einem freigeschalteten Block teilt, sonst „später“. Bestätigt im Baumodus (2026-10-21): dunkel markiert das Spiel alle Flächen, auf die theoretisch eine Erweiterung passt, eingezäunt nur die, die über eine Seitenkante an die Stadt grenzen und sich deshalb jetzt setzen lassen.
- **Arten wie im Spiel („Erweiterungen kaufen“):** Diamant-Erweiterung (`tileset_premium`, Preis `premium`), Belohnungs-Erweiterung (`tileset_reward`), Sieg-Erweiterung (Typ unbekannt, in unseren Daten keine offen), Quanten-Erweiterung (`raidMedals`, Preis `guild_raids_medals`, die Quanten-Medaillen). Belohnungs-Erweiterungen gibt es nur als Belohnung: Ihre Einträge nennen Münzen und Diamanten, das Spiel bietet aber keine zum Kauf an (Screenshot 2026-10-21, 23 offen, „keine platzierbaren mehr“). Kaufbar zählen Diamant- und Quanten-Erweiterungen. Gezählt werden nur Einträge eines erreichten Zeitalters, günstigste zuerst, nacheinander, solange die aktuellen Ressourcen reichen. „Nächste“ ist der Preis des ersten Eintrags, der nicht mehr reicht. Weitere ab dem frühesten noch nicht erreichten `min_era`. Diamanten zählen auf Nutzerwunsch als Bezahlweg (Anzeige, kein Kauf). Geprüft am Kauf-Fenster: Quanten „Verfügbar: 9“, nächste 600K, passt zur Preisleiter.

- **Belohnungs-Erweiterungen im Detail:** „{platzierbar} platzierbar, {offen} offen ({aus Forschung} aus Forschung, nächste: {Technologie}; {Rest} von der Kontinentkarte)“. *Platzierbar* ist die Ressource `expansions` (gewonnen, noch nicht gesetzt), immer angezeigt, auch 0, sobald die Ressourcen bekannt sind; eine eigene Zeile „Ungesetzt“ gibt es nicht mehr. *Offen* ist die Zahl der `tileset_reward`-Einträge. *Aus Forschung* ist die Summe der Hauptstadt-Erweiterungen (`type: 'expansion'`, `subType: 'main'`) aller Technologien, die nicht in `unlockedNodes` stehen; *nächste* ist die erste davon in der Reihenfolge der Metadatei. *Von der Kontinentkarte* ist der Rest `offen − aus Forschung`, nur wenn er größer als 0 ist. Fehlt die Forschungs-Metadatei oder der Fortschritt, entfällt die Klammer.

**Annahme Kontinentkarte:** Was die Forschung nicht erklärt, kommt aus den Provinzen der Kontinentkarte. Deren Belohnungen stehen noch nicht in unseren Daten. Ist der Rest negativ, stimmt die Annahme nicht, dann zeigt die Zeile nur den Forschungsteil. Referenz eigene Stadt (2026-10-21): 23 offen, 0 platzierbar, 14 aus Forschung (erste: „Mars-Vorschriften“, SpaceAgeMars), also 9 von der Kontinentkarte.

**Annahmen:** Jeder Eintrag in `tilesets` ist eine offene Erweiterung, `available: true` sagt nichts. Der Preis steht unter `requirements.cost.resources` (geprüft an einer Aufnahme). Gesperrte Blöcke sind nicht kaufbar (der Baumodus markiert sie nicht).

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
  plunderable: { building: number; name: string; resources: Record<string, number> }[];  // nur fertige
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
- **Zeiten:** In fremden Städten verbirgt das Spiel alle Zeiten (`next_state_transition_at` und `_in` = 2147483647). Gelistet wird deshalb nur, was fertig ist (`ProductionFinishedState`). Einen Abschnitt „In Produktion“ gibt es nicht, ohne Zeit sagt er nichts.

### Plünderbarkeit (geprüft am 2026-10-19)

Grundlage: Besuch einer Stadt auf de10 mit allen Gebäude-Definitionen (628 Gebäude), Besuch auf de20, je ein echtes Plündern (`OtherPlayerService.plunderById`) und Angaben eines erfahrenen Spielers.

Ein Gebäude steht unter „Jetzt plünderbar“, wenn alles zutrifft:

1. **Die Definition erlaubt es.** Klassische Definitionen: Typ `production`, `goods`, `residential` oder `clan_power_production`, keine der Fähigkeiten `AddResourcesToGuildTreasuryAbility`, `RandomChestRewardAbility`, `NotPlunderableAbility`, nur auf dem Hauptgitter. Generische Definitionen (`GenericCityEntity`): nur, wenn das Gebäude motivierbar ist (`socialInteraction` mit `interactionType: 'motivate'` oder `MotivatableAbility`).
2. **Die Produktion ist fertig** (`ProductionFinishedState`).
3. **Das Gebäude ist nicht motiviert** (`is_motivated`, in fremden Städten `socialInteractionId: 'motivate'`).
4. **Es ist etwas zu holen:** Der Besuch schickt ein Produkt mit mindestens einer Ressource.

Woher das Produkt kommt:

- Klassische Gebäude schicken es im Besuch als `current_product`. Alle 52 fertigen Wohnhäuser im de10-Besuch tun das.
- Fertige generische Gebäude schickt der Besuch oft ohne Produkt. Dann gibt es nichts zu plündern, geprüft im Spiel am Keltischen Goldschmied St. 5, am Handelsposten St. 8 und an Atem des Drachen St. 9 derselben Stadt (alle fertig, nicht motiviert, ohne Produkt, Plünderung noch frei, im Spiel nichts zu holen). Das inoffizielle Wiki nennt Yggdrasil unmotiviert plünderbar, was dem widerspricht, vermutlich veraltet. Die alte Toolbox listet solche Gebäude ebenfalls nicht.

Belege:

- **Motivierbarkeit:** Laut Spieler sind nicht motivierbare Spezialgebäude nie plünderbar, schon ab Stufe 1: Siegesturm, Wunschbrunnen, Druidentempel, Piratenversteck, Goldenes Orrery. In der de10-Aufnahme sind das genau die 6 generischen Produktionsgebäude ohne `motivate`. Alle 18 motivierbaren (etwa Handelsposten, Yggdrasil, Adlerberg) sind unmotiviert plünderbar. Ein Kennzeichen im Bauteil `flags` (Wert 23 statt 19) trifft nur Siegesturm und Wunschbrunnen und reicht deshalb nicht.
- **Medaillen schützen nicht:** Eine frühere Regel schloss Gebäude mit Medaillen in ihrer Stufe aus. Widerlegt am 2026-10-20: Ein Mondtor (`R_MultiAge_PatrickBonusSet20b`) St. 6 wurde mit 5.100 Münzen, 2 FP und 17 Medaillen geplündert. Laut Spieler sind viele Gebäude mit Medaillen trotzdem geschützt, der Grund ist aber eine andere, noch unbekannte Eigenschaft des Gebäudes. Bis sie gefunden ist, zeigt die Box solche Gebäude an.
- **Handelsposten:** Seine Definition gleicht der der Zeitlosen Kreuzung (Flags 19, `motivate`, Produkt ohne `onlyWhenMotivated`). Im de10-Besuch war er motiviert, das allein schließt ihn aus. Laut Spieler ist er unmotiviert plünderbar.
- **Plünderbar:** Wohnhaus mit 610 Münzen, geplündert 1.220 (doppelte Beute, de10). Domizil mit 110 Münzen, geplündert 110 (de20). Rosarium (klassisch, Typ `production`) und Zeitlose Kreuzung laut Spieler.
- **Ergebnis de10-Besuch:** vorher 52 Einträge (50 fertige Wohnhäuser, dazu Siegesturm St. 1 und St. 2 unter „In Produktion“), danach 50, nur die fertigen Wohnhäuser.

## Battle (PvP-Angriffe)

Stand 2026-10-19. Grundlage: ein aufgenommener Autokampf auf de20 (`BattlefieldService.startByBattleType`, Testfall `test/fixtures/pvp-battle.json`) und ein manueller Kampf (ein Zug von Hand, dann Autokampf; `startByBattleType` und `submitMove`, Testfall `test/fixtures/pvp-manual-battle.json`).

```ts
type BattleResult = 'won' | 'lost' | 'surrendered';

interface Battle {
  world: WorldId;
  battleId: number;
  at: number;                   // Kampfbeginn in ms
  opponent: PlayerId;           // der Verteidiger
  result: BattleResult;
  auto: boolean;
  rounds: number;               // gespielte Runden, ab 1
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
- Ergebnis: `surrenderBit` gesetzt ergibt `surrendered`, `winnerBit` 1 ergibt `won`, ein anderer `winnerBit` ergibt `lost`.
- **Autokampf:** Das Ergebnis steht schon in `startByBattleType` (`isAutoBattle` true). Der Kampf wird sofort gespeichert.
- **Manueller Kampf:** `startByBattleType` kommt ohne `winnerBit` und ohne `isAutoBattle`. Der Kampf wartet dann im Speicher, nur der zuletzt gestartete (der Kampf auf dem Bildschirm). Jede weitere Antwort des `BattlefieldService`, die ein `BattleRealmState` ist (gesehen: `submitMove`, ohne `battleId`), schließt ihn ab, sobald sie `winnerBit` oder `surrenderBit` trägt. Ergebnis, Runden und `endHp` kommen aus diesem Endzustand, die Boni aus dem Start (fehlen sie dort, aus dem Endzustand). Gespeichert wird mit `auto: false`. Ein Zug ohne Ergebnis lässt den Kampf warten. Ein neuer `startByBattleType` ersetzt den wartenden Kampf, auch wenn er kein eigener PvP-Kampf ist. Ein Zug ohne wartenden Kampf wird ignoriert.
- **Runden:** Das Spiel zählt `round` ab 0 und lässt das Feld weg, solange es 0 ist (geprüft an einem manuellen Kampf über vier Runden: Feld fehlt in den ersten 7 Zügen, dann 1, 2, 3). Gespeichert wird `round` + 1. Aufgeben (`BattlefieldService.surrender`) liefert einen `BattleRealmState` mit `surrenderBit` und ohne `winnerBit`.
- Geprüft am 2026-10-19 an der Aufnahme des manuellen Kampfes: genau ein `submitMove`, mit `winnerBit` 1 und `round` 1. Die Boni aller Einheiten sind dort dieselben wie im Start. Toten Einheiten fehlt `currentHitpoints` auch im Endzustand.
- Ein Kampf, der wartet, geht bei einem Neuladen verloren.
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

## CityShield (Schilde)

Stand 2026-10-21. **Format laut alter Toolbox, nicht selbst gesehen.** Quelle: `OtherPlayerService.getCityProtections`, `responseData` ist eine Liste von `{ playerId, expireTime }`. `expireTime` ist in Unix-Sekunden, `-1` heißt, der Spieler kann gar nicht angegriffen werden. Vermutung: Die Liste kommt beim Start, wenn ein Nachbar schon einen Schild hat, und über den Websocket, wenn ein Nachbar einen Schild aktiviert (24, 48 oder 72 Stunden aus dem Laden der Freundesschenke). Die Ingestion behandelt `json` und `ws` gleich.

```ts
interface CityShield {
  world: WorldId;
  player: PlayerId;
  expiresAt: number;            // expireTime * 1000
}
```

**Regeln**

- Nur Einträge mit numerischer `playerId` und `expireTime > 0` zählen. `-1` und Einträge in fremdem Format werden übersprungen.
- Ein neuer Eintrag ersetzt den Schild des Spielers. Ein Start ohne Liste löscht nichts.
- Abgelaufene Schilde werden beim Lesen ignoriert und einmal beim Start der Session gelöscht (`shields.prune`).
- Bis Format und Auslöser im Spiel bestätigt sind, schreibt die Toolbox jede `getCityProtections`-Nachricht roh in die Konsole (`[Forge Toolbox] getCityProtections (format unconfirmed)`).

**Abfragen:** `active(player)`. **Events:** `shield.recorded { players: PlayerId[] }`.

**Persistenz:** Tabelle `cityShields` (Dexie Version 8), Schlüssel `[world+player]`, Index `expiresAt`.

## Great Buildings (LG-Bau)

Stand 2026-10-21. Grundlage: Aufnahme auf de20 mit vier geöffneten fremden LGs, einer vergangenen Stufe und dem eigenen LG Die Arche (Testfall `test/fixtures/great-buildings.json`, gebaut mit `scripts/make-fixture.py gb`).

**Woher die Daten kommen (gesehen 2026-10-21):**

- Öffnet der Spieler ein fremdes LG, kommen zwei Anfragen nacheinander, beide mit `requestData` `[Entity-ID, Spieler-ID]`: `OtherPlayerService.getOtherPlayerCityMapEntity` liefert das Gebäude (`CityMapEntity` mit `level`, `max_level`, `connected`, `state.invested_forge_points`, `state.forge_points_for_level_up`, `bonus`), danach `GreatBuildingsService.getConstruction` die Rangliste (`rankings`, dazu `next_passive_bonus`, `next_production_bonus`, `ownerEra`).
- Beim eigenen LG kommt nur `getConstruction`. Das Gebäude steht in der eigenen Stadt.
- `GreatBuildingsService.getConstructionRanking` hat `[Entity-ID, Spieler-ID, Stufe]` und liefert nur die Liste. Die Stufe zählt den Bau auf diese Stufe hin: Stufe = aktuelle Stufe + 1 wiederholt die laufende Rangliste, eine kleinere Stufe ist abgeschlossen. Bei einem LG auf Stufe 52 lieferte 53 die laufende Liste, 52 und 51 vergangene.
- Eine Zeile der Rangliste: `rank`, `player { player_id, name, is_self }`, `forge_points`, `reward { strategy_point_amount, blueprints, blueprintRewards[{ amount, tier }], resources { medals } }`. Die Zeile des Eigentümers hat keinen `rank`. Ein freier Platz hat keine `forge_points` und keine `player_id` (Name „Noch kein Mäzen“), gelöschte Spieler haben Punkte, aber keine `player_id`. Plätze ohne `reward` bringen nichts (in der Aufnahme Platz 6 bis 8).
- `invested_forge_points` ist die Summe aller Einzahlungen, Eigentümer eingeschlossen (geprüft an allen vier LGs). Das Spiel lässt Felder mit 0 weg (`y`, `invested_forge_points`), deshalb gilt ein fehlendes `connected` als nicht verbunden.
- Namen der LGs: `InventoryService.getGreatBuildings` (`cityentity_id`, `name`) und `GreatBuildingsService.getOtherPlayerOverview` (`city_entity_id`, `name`). Der Catalog hält sie, auch wenn die Definition nicht geladen ist.

```ts
interface RankingRow {
  rank?: number;                // fehlt beim Eigentümer
  player?: PlayerId;            // fehlt bei freien Plätzen und gelöschten Spielern
  name: string;
  self: boolean;                // is_self
  fp?: number;                  // fehlt bei freien Plätzen
  reward?: { fp: number; blueprints: number; medals: number };  // netto, wie das Spiel sie nennt
}

interface GreatBuildingEntity {
  owner: PlayerId;
  entityId: number;
  def: BuildingDefId;
  level: number;
  maxLevel: number;
  invested: number;             // alle Einzahlungen der laufenden Stufe
  required: number;             // forge_points_for_level_up
  connected: boolean;
}

interface Construction {
  owner: PlayerId;
  entityId: number;
  own: boolean;
  entity?: GreatBuildingEntity; // fehlt, wenn weder Öffnung noch Stadt das Gebäude kennen
  rankings: RankingRow[];       // laufende Stufe
  past?: { level: number; rankings: RankingRow[] };  // angesehene vergangene Stufe
  leveled?: { level: number; rank?: number };        // seit dem Öffnen gelevelt
  seenAt: number;
}

interface KnownGreatBuilding {  // persistiert, für die Snipehilfe
  world: WorldId;
  owner: PlayerId;
  entityId: number;
  cityEntityId: BuildingDefId;
  level: number;
  invested: number;
  required: number;
  bestRate?: number;            // niedrigster Kurs der freien Plätze beim letzten Blick
  seenAt: number;
}
```

**GreatBuildingStore:** hält nur die gerade geöffnete Konstruktion im Speicher. Das Gebäude aus `getOtherPlayerCityMapEntity` merkt er sich, bis die Konstruktion kommt (höchstens 20 Öffnungen). Ohne Request lässt sich eine Konstruktion keinem Gebäude zuordnen und wird übergangen. Fremde LGs schreibt er bei jedem Öffnen und jeder Änderung der laufenden Stufe in die Tabelle `greatBuildings` (Dexie-Version 9, Schlüssel `[world+owner+entityId]`, Indizes `[world+owner]`, `world`, `seenAt`). Eigene LGs werden nicht gespeichert. Abfrage: `known(owner?)`.

**Events:** `greatBuilding.opened { owner, entityId, own }`, `greatBuilding.changed { owner, entityId, reason }` mit `reason` `entity`, `ranking`, `contributed` oder `leveled`.

**Eigene LGs:** `CityMapService.updateEntity` hält `investedFp` der eigenen LGs in der Stadt aktuell (so kommen fremde Einzahlungen in eigene LGs an, ohne Rangliste). Eine Anzeige dafür kommt mit dem Eigenanteilsrechner.

### Rechnung je Platz (abgeleitet)

Reine Funktion `calculateConstruction` in `src/content/domain/gb-calculator.ts`. Eingaben: Stufe, Höchststufe, verbunden, benötigte FP, Rangliste, Arche-Bonus und Faktor in Prozent.

- **Rest:** benötigte FP minus (Summe aller Einzahlungen minus eigene Einzahlung). So viel dürfen die anderen noch einzahlen.
- **Brutto:** `round(N × (1 + Arche/100))` mit N = `strategy_point_amount`, ebenso Blaupausen und Medaillen.
- **Sicher:** `round((d + Rest) / 2)`, d = Einzahlung des Inhabers, 0 bei freiem Platz. Die kleinste Gesamteinzahlung, die der Inhaber nicht mehr überbieten kann.
- **Fordern:** `max(round(N × (1 + Faktor/100)), Sicher)`, höchstens der Rest. Faktor „Arche“ ist der eigene Arche-Bonus.
- **Eigener Platz:** `round((Einzahlung des nächsten Rangs + Rest) / 2)`, ohne Nachfolger die Hälfte des Rests.
- **Nicht zu haben:** wenn Sicher ≤ Einzahlung des Inhabers, wenn der Platz unter dem eigenen liegt oder wenn Sicher gleich dem Wert des Platzes darüber ist.
- **Unter dem eigenen Platz:** keine Kosten, kein Gewinn, kein Kurs (Anzeige „–“), nur Belohnung, Blaupausen und Medaillen. Die eigene Einzahlung kann keinen zweiten Platz halten, eine Rechnung mit ihr wäre ein Scheinpreis. Solche Plätze zählen weder für den besten Kurs noch für den Ton. Testfall `test/fixtures/gb-contribution-below-own.json` (aufgezeichnet 2026-10-21).
- **Level-Warnung:** Sicher ist gleich dem Rest, die eigene Einzahlung würde das LG leveln.
- **Gewinn:** Brutto minus Sicher. **Schlechter:** Gewinn nicht größer als der beste Gewinn eines höheren Platzes, Plätze mit Level-Warnung zählen dafür nicht.
- **Kurs:** `round(Sicher / N × 1000) / 10` in Prozent.
- Kosten sind immer die Gesamteinzahlung. Wer schon einzahlte, sieht zusätzlich, was er noch dazulegen muss.
- Runden kaufmännisch, mit einer kleinen Toleranz gegen Fließkommafehler (5 × 1,9 ergibt 10).
- Höchststufe erreicht oder nicht verbunden: keine Plätze, nur der Grund.

**Arche-Bonus:** Summe der `contribution_boost`-Boni der eigenen LGs aus der Stadt, dazu befristete Boni dieses Typs aus `BonusService.getLimitedBonuses`. Befristete Boni eines eigenen LGs stehen in beiden Listen (gesehen beim Vorrats-Bonus des LGs 701), deshalb zählt ein befristeter Bonus nicht, dessen `entityId` schon mit einem Arche-Bonus gezählt ist. In der Aufnahme gab es keinen befristeten `contribution_boost`.

**Annahme Netto:** `strategy_point_amount` ist die Belohnung ohne Arche-Bonus, der Empfänger bekommt sie mit seinem Bonus. Nicht im Spiel geprüft.

**Verfügbare FP:** `strategy_points` aus dem `ResourceStore` plus die FP in Paketen aus dem `InventoryStore` (siehe Inventar). Beide folgen den Updates (siehe Ressourcen und Inventar). Nach der aufgezeichneten Einzahlung zeigt der Rechner 0 + 108.198.

### Eigene Einzahlung (aufgezeichnet 2026-10-21)

Testfall `test/fixtures/gb-contribution.json` (gebaut mit `scripts/make-fixture.py gb-contribution`). `GreatBuildingsService.contributeForgePoints` hat den Request `[Entity-ID, Spieler-ID, Stufe, Betrag, false]`, die Antwort ist die neue Rangliste als Liste (eigene Zeile mit `is_self`, im Beispiel Platz 2 mit 301 FP). Dieselbe Antwort bringt:

- `CityMapService.reset` mit dem fremden LG, wie es jetzt ist (`invested_forge_points` 1455 → 1756, `level`, `max_level`),
- `ResourceService.getPlayerResourceBag` (`PlayerMain`) mit dem neuen Bestand,
- je geöffnetem Pakettyp ein `InventoryService.updateItem`,
- `GreatBuildingsService.getAvailablePackageForgePoints` mit der neuen Paketsumme,
- `ResourceService.getPlayerAutoRefills` (nicht ausgewertet).

Die Reihenfolge ist nicht fest, deshalb wendet der Handler die Einzahlung erst am Ende der Antwort an: Rangliste aus der Antwort, Gebäude aus dem `reset`. Fehlt der `reset`, wächst `invested` um das, was die eigene Einzahlung gewachsen ist (unter Vorbehalt). Ein `reset` oder `updateEntity` des offenen LGs ohne Einzahlung hält es ebenfalls aktuell. Danach fragt das Spiel `getConstructionRanking` für die Stufen 63, 62, 63 und 64 ab (LG auf Stufe 63, also ist 64 die laufende Liste).

Die Kopfzeile des LG-Rechners zeigt neben der Stufe die freigeschaltete Höchststufe aus `max_level`.

### Unter Vorbehalt, nicht aufgezeichnet

- **Level-up eines fremden LGs** über den Websocket `OtherPlayerService.newEvent` mit `type: great_building_contribution` und `other_player { player_id, name }`, `great_building_name` (Anzeigename, keine Entity-ID), `level` (neue Stufe), `rank`. Passt Eigentümer und Name (über den Catalog) zur offenen Konstruktion, wird sie als gelevelt markiert.

## Zuordnung Spielantwort → Store

| Spielantwort | Store | Wirkung |
|---|---|---|
| `StartupService.getData` | Session, City, Catalog | Session anlegen, eigene Stadt setzen, Güter laden |
| `OtherPlayerService.getSocialList` | Player | alle Spieler aktualisieren, Beziehungen neu setzen, Angriffs-Zeitgeber der Nachbarn setzen |
| `OtherPlayerService.visitPlayer` | Player, City | Spieler aktualisieren, besuchte Stadt setzen |
| `OtherPlayerService.updatePlayer` | Player | Spieler aktualisieren, Angriffs-Zeitgeber setzen |
| `OtherPlayerService.getCityProtections` (laut alter Toolbox) | CityShield | Schilde ersetzen |
| `BattlefieldService.startByBattleType` | Battle | eigenen PvP-Angriff speichern, manuellen Kampf bis zum Ende vormerken |
| `BattlefieldService.*` mit `BattleRealmState` (gesehen: `submitMove`) | Battle | vorgemerkten manuellen Kampf mit dem Ergebnis speichern |
| `CityMapService.updateEntity`, `reset` | City | eigene oder besuchte Stadt je nach Spieler-ID |
| `CityMapService.placeBuilding`, `removeBuilding`, `moveEntity` | City | eigene Stadt ändern |
| Metadaten `building_entity_lookup` und `building_entity_<id>` | Catalog | Gebäude-Definitionen |
| `OtherPlayerService.getOtherPlayerCityMapEntity` | GreatBuilding | fremdes LG vormerken, bis die Konstruktion kommt |
| `GreatBuildingsService.getConstruction` | GreatBuilding | Konstruktion öffnen, fremdes LG speichern |
| `GreatBuildingsService.getConstructionRanking` | GreatBuilding | vergangene Stufe zeigen oder laufende Rangliste erneuern |
| `GreatBuildingsService.contributeForgePoints` | GreatBuilding | am Ende der Antwort: neue Rangliste, Gebäude aus dem `reset` derselben Antwort |
| `CityMapService.reset`, `updateEntity` mit dem offenen fremden LG | GreatBuilding (und City) | Stand des LGs, bei einer Einzahlung mit ihr zusammen |
| `GreatBuildingsService.getAvailablePackageForgePoints` | Inventory | Summe der FP in Paketen laut Spiel |
| `OtherPlayerService.newEvent` mit `great_building_contribution` (nicht aufgezeichnet) | GreatBuilding | offene Konstruktion als gelevelt markieren |
| `InventoryService.getGreatBuildings`, `GreatBuildingsService.getOtherPlayerOverview` | Catalog | Namen der LGs |
| `BonusService.getLimitedBonuses` | GreatBuilding | befristete Boni für den Arche-Bonus |
| `InventoryService.getItems` | Inventory | Inventar ersetzen (alle Gegenstände) |
| `InventoryService.getItemsByType`, `getItem` (nicht aufgezeichnet) | Inventory | Gegenstände einfügen oder ersetzen |
| `InventoryService.updateItem` | Inventory | neuen Bestand bekannter Gegenstände setzen |
| `InventoryService.getItemAmount` (nicht aufgezeichnet) | Inventory | neuen Bestand bekannter Gegenstände setzen |
| `ResourceService.getPlayerResourceBag` (nur `PlayerMain`) | Resource | Bestand ersetzen |
| `ResourceService.getPlayerResources` (nicht aufgezeichnet) | Resource | Bestand ersetzen |
| `OtherPlayerService.newEvent` mit `trade_accepted` (nicht aufgezeichnet) | Resource | angenommenes Handelsangebot: Gut dazuzählen |

## Offene Punkte

- Besuchte Städte bleiben vorerst nur im Speicher. Sobald ein Feature einen Verlauf braucht (etwa wann ein Nachbar wieder plünderbar war), bekommen sie eine Tabelle.
- Genaue Namen der Spiel-Methoden für Bauen, Abreißen und Verschieben aus einer Aufnahme bestätigen.
- LG: Annahme Netto (`strategy_point_amount` ohne Arche-Bonus) im Spiel prüfen.
- LG: das Level-up-Ereignis `great_building_contribution` aufnehmen und Format bestätigen.
- Inventar und Ressourcen: Die Updates `InventoryService.getItemsByType`, `getItem`, `getItemAmount`, `ResourceService.getPlayerResources` und `trade_accepted` sind unter Vorbehalt umgesetzt. Ihr Format mit einer Aufnahme bestätigen, etwa einer Belohnung mit neuen Paketen.
- LG: FP aus Quests (Zeile im LG-Rechner) braucht Quest-Daten, die die Ingestion noch nicht liest (`QuestService.getUpdates`).
