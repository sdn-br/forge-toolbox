# City

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

type ExpansionKind = 'diamonds' | 'reward' | 'quantum';

type ExpansionOffer =         // Art aus dem Spieltyp: tileset_premium → diamonds, tileset_reward → reward, raidMedals → quantum
  | { kind: ExpansionKind; minEra?: EraId; cost: Record<ResourceId, number> }
  | { kind: 'unknown'; gameType: string; minEra?: EraId; cost: Record<ResourceId, number> }; // unbekannter Spieltyp, zum Anzeigen

interface Area { x: number; y: number; width: number; length: number }

interface Building {
  id: number;                   // Entity-ID, eindeutig innerhalb der Stadt
  def: BuildingDefId;
  category: BuildingCategory;   // Gruppe aus dem Spieltyp der Entity
  offGrid?: boolean;            // steht neben dem Gitter, etwa Außenposten-Schiff oder Freundeskneipe
  x: number;
  y: number;
  connected: boolean;
  state: BuildingState;
  greatBuilding?: GreatBuildingState;
}

type BuildingCategory =
  | 'residential' | 'production' | 'goods' | 'culture' | 'military'
  | 'greatBuilding' | 'street' | 'special' | 'other';

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
- Spielbegriffe übersetzt `game/convert.ts` beim Einlesen, die Domäne kennt nur die eigenen Namen. `category` kommt aus dem Spieltyp der Entity: `decoration` zählt als `culture`, `greatbuilding` wird `greatBuilding`, `generic_building`, `random_production`, `tower` und `clan_power_production` werden `special`, jeder unbekannte Typ wird `other`. `offGrid` setzt convert für `off_grid`, `outpost_ship`, `friends_tavern`, `hub_main` und `hub_part` (die Hubs Arctic Harbour und Ocean Terminal mit ihren Teilen). Den Spieltyp selbst behält das Gebäude nicht.
- Unbekannte Zustände des Spiels werden `unknown` mit dem Klassennamen. Ein neuer Zustand im Spiel bricht dann nichts, er wird nur nicht ausgewertet.

**Gezeigte Stadt:** `shown()` ist `'own'` oder die Spieler-ID der besuchten Stadt, so weit der Spielverkehr es verrät. Ein Besuch zeigt die besuchte Stadt. Die eigene Stadt kehrt zurück mit `CityMapService.getEntities` der Karte `main` oder `AnnouncementsService.fetchAllAnnouncements`, ausgewertet am Ende der Antwort und nur, wenn dieselbe Antwort keinen Besuch bringt (nach einem Kampf aus einer besuchten Stadt schickt das Spiel beides). Der Knopf „Nach Hause“ schickt nichts, diese Rückkehr bleibt unbemerkt. Nutzer: die Markierungspfeile (siehe [Stadtplan](../features/stadtplan.md)).

**Abfragen:** `own()`, `visited()`, `shown()`, `building(owner, id)`.

**Events:** `city.ownChanged { buildingIds?: number[]; reset: boolean }`, `city.visited { owner: PlayerId }`, `city.shown { city: 'own' | PlayerId }` (nur bei einem Wechsel).
