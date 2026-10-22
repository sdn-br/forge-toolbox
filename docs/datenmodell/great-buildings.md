# Great Buildings (LG-Bau)

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
  reward?: { fp: number; blueprints: number; medals: number };  // netto (bestätigt), wie das Spiel sie nennt
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

## Rechnung je Platz (abgeleitet)

Reine Funktion `calculateConstruction` in `src/content/domain/gb-calculator.ts`. Eingaben: Stufe, Höchststufe, verbunden, benötigte FP, Rangliste, Arche-Bonus und Faktor in Prozent.

- **Rest:** benötigte FP minus (Summe aller Einzahlungen minus eigene Einzahlung). So viel dürfen die anderen noch einzahlen.
- **Brutto:** `round(N × (1 + Arche/100))` mit N = `strategy_point_amount`, ebenso Blaupausen und Medaillen.
- **Sicher:** `round((d + Rest) / 2)`, d = Einzahlung des Inhabers, 0 bei freiem Platz. Die kleinste Gesamteinzahlung, die der Inhaber nicht mehr überbieten kann.
- **Fordern:** `round(N × (1 + Faktor/100))`, ohne Untergrenze und ohne Deckel. Faktor „Arche“ ist der eigene Arche-Bonus. Fordern ist ein Handel: Der Eigentümer bietet den Platz zum Faktor an und sichert ihn selbst ab, deshalb gilt die sichere Einzahlung für den Einzahler nicht. Entscheidung 2026-10-22, vorher war Fordern mindestens Sicher und höchstens der Rest. Auf fast leeren LGs fiel es so mit Sicher zusammen, und der Faktor änderte nichts.
- **Markierungen bei Fordern:** mehr als der Rest (mehr, als bis zum Level-Up fehlt) steht rot mit Tooltip „mehr als bis zum Level-Up fehlt (X FP)“. Unter Sicher steht gedämpft mit Tooltip „unter Sicher: nur mit Absprache haltbar“. Der Tooltip nennt immer den Gewinn bei Fordern (Brutto minus Fordern). Die Klammer mit dem, was noch dazukommt, rechnet vom neuen Wert.
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

**Netto:** `strategy_point_amount` ist die Belohnung ohne Arche-Bonus, der Empfänger bekommt sie mit seinem Bonus. Bestätigt (Abgleich mit Spiel und alter Toolbox, 2026-10-22).

**Verfügbare FP:** `strategy_points` aus dem `ResourceStore` plus die FP in Paketen aus dem `InventoryStore` (siehe Inventar). Beide folgen den Updates (siehe Ressourcen und Inventar). Nach der aufgezeichneten Einzahlung zeigt der Rechner 0 + 108.198.

## Eigene Einzahlung (aufgezeichnet 2026-10-21)

Testfall `test/fixtures/gb-contribution.json` (gebaut mit `scripts/make-fixture.py gb-contribution`). `GreatBuildingsService.contributeForgePoints` hat den Request `[Entity-ID, Spieler-ID, Stufe, Betrag, false]`, die Antwort ist die neue Rangliste als Liste (eigene Zeile mit `is_self`, im Beispiel Platz 2 mit 301 FP). Dieselbe Antwort bringt:

- `CityMapService.reset` mit dem fremden LG, wie es jetzt ist (`invested_forge_points` 1455 → 1756, `level`, `max_level`),
- `ResourceService.getPlayerResourceBag` (`PlayerMain`) mit dem neuen Bestand,
- je geöffnetem Pakettyp ein `InventoryService.updateItem`,
- `GreatBuildingsService.getAvailablePackageForgePoints` mit der neuen Paketsumme,
- `ResourceService.getPlayerAutoRefills` (nicht ausgewertet).

Die Reihenfolge ist nicht fest, deshalb wendet der Handler die Einzahlung erst am Ende der Antwort an: Rangliste aus der Antwort, Gebäude aus dem `reset`. Fehlt der `reset`, wächst `invested` um das, was die eigene Einzahlung gewachsen ist (unter Vorbehalt). Ein `reset` oder `updateEntity` des offenen LGs ohne Einzahlung hält es ebenfalls aktuell. Danach fragt das Spiel `getConstructionRanking` für die Stufen 63, 62, 63 und 64 ab (LG auf Stufe 63, also ist 64 die laufende Liste).

Die Kopfzeile des LG-Rechners zeigt neben der Stufe die freigeschaltete Höchststufe aus `max_level`.

## Unter Vorbehalt, nicht aufgezeichnet

- **Level-up eines fremden LGs** über den Websocket `OtherPlayerService.newEvent` mit `type: great_building_contribution` und `other_player { player_id, name }`, `great_building_name` (Anzeigename, keine Entity-ID), `level` (neue Stufe), `rank`. Passt Eigentümer und Name (über den Catalog) zur offenen Konstruktion, wird sie als gelevelt markiert.
