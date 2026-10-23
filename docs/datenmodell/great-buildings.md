# Great Buildings (LG-Bau)

Stand 2026-10-22. Grundlage: Aufnahme auf de20 mit vier geöffneten fremden LGs, einer vergangenen Stufe und dem eigenen LG Die Arche (Testfall `test/fixtures/great-buildings.json`, gebaut mit `scripts/make-fixture.py gb`).

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

**Eigene LGs:** `CityMapService.updateEntity` hält `investedFp` der eigenen LGs in der Stadt aktuell (so kommen fremde Einzahlungen in eigene LGs an, ohne Rangliste). Der Store übernimmt die Meldung auch für ein offenes eigenes LG, der [Eigenanteil](../features/eigenanteil.md) zeigt daraus, was andere seit dem Öffnen eingezahlt haben. Eine eigene Einzahlung ins eigene LG kommt wie beim fremden als `contributeForgePoints` mit der neuen Rangliste (Besitzerzeile mit der neuen Summe), dazu das Gebäude in `CityMapService.updateEntity` und `reset` derselben Antwort (aufgenommen auf de10, 2026-10-23).

## Rechnung je Platz (abgeleitet)

Reine Funktion `calculateConstruction` in `src/content/domain/gb-calculator.ts`. Eingaben: Stufe, Höchststufe, verbunden, benötigte FP, Rangliste, Arche-Bonus und Faktor in Prozent.

- **Rest:** benötigte FP minus (Summe aller Einzahlungen minus eigene Einzahlung). So viel dürfen die anderen noch einzahlen.
- **Brutto:** `round(N × (1 + Arche/100))` mit N = `strategy_point_amount`, ebenso Blaupausen und Medaillen.
- **Sichern:** `round((d + Rest) / 2)`, d = Einzahlung des Inhabers, 0 bei freiem Platz. Die kleinste Gesamteinzahlung, die der Inhaber nicht mehr überbieten kann.
- **Fördern:** `round(N × (1 + Faktor/100))`, ohne Untergrenze und ohne Deckel. Faktor „Arche“ ist der eigene Arche-Bonus. Fördern ist ein Handel: Der Eigentümer bietet den Platz zum Faktor an und sichert ihn selbst ab, deshalb gilt Sichern für den Einzahler nicht. Entscheidung 2026-10-22, vorher war Fördern mindestens Sichern und höchstens der Rest. Auf fast leeren LGs fiel es so mit Sichern zusammen, und der Faktor änderte nichts. Sichern und Fördern hießen bis 2026-10-22 „Sicher“ und „Fordern“.
- **Markierungen bei Fördern:** mehr als der Rest (mehr, als bis zum Level-Up fehlt) steht rot mit Tooltip „mehr als bis zum Level-Up fehlt (X FP)“. Unter Sichern steht gedämpft mit Tooltip „unter Sichern: nur mit Absprache haltbar“. Der Tooltip nennt immer den Gewinn bei Fördern (Brutto minus Fördern). Die Klammer mit dem, was noch dazukommt, rechnet vom neuen Wert.
- **Eigener Platz:** `round((Einzahlung des nächsten Rangs + Rest) / 2)`, ohne Nachfolger die Hälfte des Rests. Sicher, wenn die eigene Einzahlung das erreicht. Dazu der Kurs der eigenen Einzahlung, `round(eigene Einzahlung / N × 1000) / 10`: was der Platz kostet, wenn der Spieler nichts mehr einzahlt und ihn niemand überholt.
- **Eigene Einzahlung:** die Plätze von 1 bis zum eigenen, die der Spieler noch sichern kann, mit Sichern minus eigene Einzahlung. Ohne eigene Einzahlung sind es alle Plätze, die zu haben sind, mit Sichern selbst. Plätze, die nicht zu haben sind, fehlen, der eigene fehlt, wenn er sicher ist. Hervorgehoben ist der Platz mit dem höchsten Gewinn.
- **Nicht zu haben:** wenn Sichern ≤ Einzahlung des Inhabers (der Platz ist sicher), wenn Sichern gleich dem Sichern des Platzes darüber ist (derselbe Preis kauft den besseren Platz) oder wenn der Platz unter dem eigenen liegt. Sichern(k) heißt „mindestens Platz k“: Wer Sichern(k) einzahlt, darf zunächst über Platz k liegen, im schlechtesten Fall landet er auf k. Beispiel: Rest 3004, Platz 1 hält 1500, Platz 2 hält 900, der Spieler 400 auf Platz 3. Mit 1952 insgesamt ist er erst einmal Erster. Platz 1 kann ihn wieder überholen (es fehlen ihm 453), Platz 2 nicht (es fehlen ihm 1053), also ist Platz 2 mit 1952 sicher. Eine Regel „Platz k nur, wenn Platz k−1 mindestens Sichern(k) hält“ war am 2026-10-22 kurz eingebaut und ist deshalb falsch.
- **Anzeige, wenn nicht zu haben:** kein Gewinn, kein Kurs (Anzeige „–“). Sichern zeigt „✓“ (Tooltip „Platz ist sicher“), wenn der Inhaber nicht mehr zu überholen ist, sonst „–“. Belohnung und Fördern bleiben. Fördern ist ein Angebot des Eigentümers, der den Platz selbst absichert, deshalb gilt es auch hier. Solche Plätze zählen weder für den besten Kurs noch für den Ton noch für „schlechter“.
- **Unter dem eigenen Platz:** keine Kosten, kein Gewinn, kein Kurs (Anzeige „–“), nur Belohnung, Fördern, Blaupausen und Medaillen. Fördern steht ohne Klammer, die eigene Einzahlung kann nicht nach unten wandern. Die eigene Einzahlung kann keinen zweiten Platz halten, eine Rechnung mit ihr wäre ein Scheinpreis. Solche Plätze zählen weder für den besten Kurs noch für den Ton. Testfall `test/fixtures/gb-contribution-below-own.json` (aufgezeichnet 2026-10-21).
- **Level-Warnung:** Sichern ist gleich dem Rest, die eigene Einzahlung würde das LG leveln.
- **Gewinn:** Brutto minus Sichern, auf dem eigenen Platz Brutto minus den größeren Wert aus eigener Einzahlung und Sichern. **Schlechter:** Gewinn nicht größer als der beste Gewinn eines höheren Platzes, der zu haben ist. Plätze mit Level-Warnung zählen dafür nicht.
- **Kurs:** `round(Sichern / N × 1000) / 10` in Prozent.
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

## Stufenvorschau

Reine Funktionen in `src/content/domain/gb-level-preview.ts`. `previewLevel` nimmt Ära und Stufenkosten des LGs, die Stufe, den Arche-Bonus und den Faktor und rechnet mit `calculateConstruction` auf einer leeren Rangliste (fünf freie Plätze, Blaupausen und Medaillen 0, verbunden, Höchststufe nicht beachtet). Die Stufe zählt wie `level` des Gebäudes: Stufe X ist der Bau von X auf X+1.

**Definition des LGs:** die Metadatei `building_entity_<id>` vom Inno-CDN, wie das Spiel sie lädt. `toBuildingDef` legt für LGs `greatBuilding { era, levelCosts }` an:

- `levelCosts` ist `strategy_points_for_upgrade`, die Kosten der ersten zehn Stufen (Index 0 ist der Bau von 0 auf 1).
- `era` ist `requirements.min_era`, die Ära des LGs selbst, nicht die des Eigentümers. LGs aller Zeitalter (Orakel, Expedition) haben dort `NoAge`, das wird `AllAge`. Fehlt `min_era`, gilt die Ära aus der ID `X_<Ära>_Landmark1`. Gesehen in der Aufnahme vom 2026-10-19 (alle LG-Definitionen), Testfall `test/fixtures/gb-definitions.json` (gebaut mit `scripts/make-fixture.py gb-defs`).

**Kosten einer Stufe:** bis Stufe 9 `levelCosts[Stufe]`, ab Stufe 10 `ceil(levelCosts[9] × 1,025^(Stufe − 9))`. Geprüft an allen neun aufgezeichneten Konstruktionen (Stufen 41 bis 135): die Kosten der laufenden Stufe sind genau `forge_points_for_level_up`.

**Belohnung Platz 1 (P1):** ohne Arche-Bonus, je Ära des LGs und Stufe aus `src/content/data/gb-p1.json`. Quelle ist die Datentabelle `GreatBuildings.Rewards` der alten FoE Toolbox (Spieldaten, keine Code-Übernahme), ausgelesen mit `scripts/extract-gb-p1.py`. Deren Schlüssel ist die Ära als Zahl, Position in der Ärenliste des Spiels plus 1 (Bronzezeit 2 bis Stellar Age 24, 0 ist AllAge, Steinzeit fehlt). Die Datei führt die Ären mit Namen, so wie die Definitionen sie nennen, dazu die Ärenliste in Spielreihenfolge. Werte, die die alte Tabelle selbst nur geschätzt hatte (im Kommentar über der Zeile genannt), sind `null` und werden wie fehlende Werte selbst geschätzt. AllAge ist gleich dem Hochmittelalter.

**Schätzung:** Das Spiel scheint P1 = auf 5 aufgerundetes (Ära + 9) × A(Stufe) zu rechnen, mit einer Kurve A, die für alle Ären gleich ist. Jeder bekannte Wert grenzt A auf [(P1 − 5) / (Ära + 9), P1 / (Ära + 9)] ein. Je Stufe ist A die Mitte aller Grenzen der Ären mit Daten (ohne AllAge, das doppelt zählte). Die Grenzen treffen sich an manchen Stufen knapp nicht, die Formel ist also nicht ganz die des Spiels. Rechnet man die bekannten Werte mit der Kurve nach, liegen alle höchstens 5 FP daneben. Geschätzt werden Stufen über das Ende der Zeile einer Ära hinaus und Ären ohne Zeile. Die Kurve reicht bis Stufe 421, ab 422 hat höchstens eine einzelne Ära Daten, das grenzt A zu ungenau ein. Darüber zeigt die Vorschau keine Belohnung. Geschätzte Werte tragen `estimate`.

**Platz 2 bis 5:** P(i) = `round(P(i − 1) / (i + 1) / 5) × 5` für i = 1 bis 4 (0-basiert), kaufmännisch gerundet (2605 → 1305). Geprüft an allen aufgezeichneten Konstruktionen: P1 aus der Tabelle und daraus P2 bis P5 sind genau die `strategy_point_amount` je Platz. Danach brutto, Sichern, Fördern und Kurs wie oben. Leer ist nur Platz 1 zu haben, die anderen haben dasselbe Sichern.

**Genauigkeit:** Kosten exakt (für Stufen über 10 im Rahmen der Formel, geprüft bis 135). P1 aus der Tabelle exakt, geschätzt auf etwa 5 FP. Blaupausen und Medaillen unbekannt.

## Leveln und P1 der nächsten Stufe

Reine Funktion `levelUpAndFirst` in `src/content/domain/gb-level-preview.ts`, auf Grundlage von `calculateConstruction` und `previewLevel`. Entscheidung des Nutzers 2026-10-22.

- **Leveln:** Der Spieler zahlt alles ein, was bis zum Level-Up fehlt (F). Seine Gesamteinzahlung wird d + F, d ist die eigene Einzahlung (0 ohne). Sein Platz folgt aus der Rangliste danach, die Einzahlungen der anderen bleiben gleich. Bei Gleichstand bleibt der frühere Einzahler vorn, andere mit gleichem Betrag stehen also über ihm. Gewinn 1 ist die Belohnung dieses Platzes brutto (mit dem eigenen Arche-Bonus) minus (d + F), ohne Belohnung 0 minus (d + F).
- **P1 der nächsten Stufe:** Die nächste Stufe ist offen und leer, Sichern von P1 rechnet `previewLevel` für Stufe + 1 (die halbe Stufe). Gewinn 2 ist P1 brutto minus dieses Sichern.
- **Summe:** Gewinn 1 + Gewinn 2, Einsatz F + Sichern von P1.
- **Nur wenn möglich:** Die Konstruktion ab Stufe X ist offen, solange X kleiner als `max_level` ist. Die nächste braucht also Stufe + 1 < `max_level`. Dazu muss das LG verbunden sein, noch etwas fehlen und die Belohnung der nächsten Stufe bekannt sein. Sonst gibt die Funktion nichts zurück.
- **Nur wenn es mehr bringt als die laufende Stufe:** Die Summe muss über dem besten Gewinn liegen, den die laufende Stufe ohne Leveln bringt: der eigene Platz, wie er steht (Spalte Gewinn: Brutto minus den größeren Wert aus eigener Einzahlung und Sichern), oder ein Platz, der zu haben ist, ohne Level-Warnung. Der eigene Platz fehlte zuerst. Dann erschien die Zeile etwa bei einem sicheren eigenen P1 mit +3.082, obwohl Leveln + P1 nur +1.328 brachte (Nutzer, 2026-10-23). Bringt keiner einen Gewinn, ist das 0. Beispiel: Kein Platz bringt etwas, Leveln kostet 10 ohne Belohnung, P1 der nächsten Stufe kostet 100 und bringt 200. Dann ist die Summe 0 − 10 − 100 + 200 = +90, mehr als 0, die Zeile erscheint. Bringt dagegen P3 jetzt +115 und Leveln + P1 zusammen +95, fehlt sie (Nutzer, 2026-10-23).
- **Beispiel aus der Aufnahme (2434, Stufe 52 von 60, 2400 FP nötig):** Wie aufgezeichnet hält der Spieler 575 auf Platz 2, es fehlen 211. Mit 786 bleibt er auf Platz 2, 645 brutto ergeben −141. Stufe 53 kostet 2460, P1 zahlt 670, brutto 1310 bei Sichern 1230, also +80. Die Summe −61 lohnt nicht, die Zeile fehlt. Mit 1600 auf Platz 1, 560 eigenen auf Platz 2 und 100 auf Platz 3 fehlen 40. Dann ergibt sich 645 − 600 = +45, zusammen +125, mehr als die +85, die Platz 2 so bringt. Mit 500 eigenen fehlen 100, Leveln + P1 bringt wieder +125, Platz 2 so aber +145, die Zeile fehlt. Die Testfälle stehen in `test/gb-level-preview.test.ts`.

## Unter Vorbehalt, nicht aufgezeichnet

- **Level-up eines fremden LGs** über den Websocket `OtherPlayerService.newEvent` mit `type: great_building_contribution` und `other_player { player_id, name }`, `great_building_name` (Anzeigename, keine Entity-ID), `level` (neue Stufe), `rank`. Passt Eigentümer und Name (über den Catalog) zur offenen Konstruktion, wird sie als gelevelt markiert.
