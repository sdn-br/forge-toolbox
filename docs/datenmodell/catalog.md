# Catalog (statische Spieldaten)

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

**Gebäudenamen vom CDN:** Das Spiel lädt die Datei `building_entity_<id>` einer Definition erst, wenn es sie braucht. Gebäude aus älteren Plünderungen oder Angriffen zeigten deshalb die rohe Kennung (etwa `R_MultiAge_HeroBonus22pass`). Beim Start lädt das Spiel `building_entity_lookup`, ein Array `{ identifier: 'building_entity_<id>', url, __class__: 'StaticData' }` mit der Adresse jeder Datei, die Prüfsumme steckt in der Adresse (geprüft 2026-11-01).

Der Service Worker hält einen Cache dieser Dateien, die Tabelle `buildingDefFiles`, je Kennung mit ihrer Adresse.
- **Start:** Bevor der Spielverkehr durchgeht, liest der Katalog den ganzen Cache in einem Aufruf ein (`buildingDefs.all`). Jede Box kennt diese Namen also sofort.
- **Veraltete Einträge:** Kommt die Lookup-Liste, fliegt jede Definition aus dem Cache aus dem Katalog, deren Adresse nicht mehr stimmt oder die nicht mehr gelistet ist. Die aktuelle lädt das Spiel oder der Katalog bei Bedarf.
- **Dateien des Spiels:** Was das Spiel selbst lädt, geht in den Katalog und in den Cache. Das Content Script kennt die Adressen im Cache und schreibt nur neue oder geänderte Dateien, gesammelt alle 50 ms in einem Aufruf (`buildingDefs.put`, `bulkPut`). Nach dem ersten Start fällt meist gar kein Schreibaufruf an.
- **Bei Bedarf:** Fragt eine Box über `buildingName(id)` nach einer Definition, die weder im Cache noch vom Spiel da ist, wartet der Katalog eine Sekunde (das Spiel lädt oft gerade selbst) und lädt sie dann über den Service Worker vom CDN (`buildingDefs.file`). Der Service Worker legt sie in den Cache, `catalog.updated` lässt die Boxen neu zeichnen. Jede Kennung wird je Sitzung einmal angefragt, eine fehlgeschlagene erst in der nächsten Sitzung wieder.

Der Cache liegt wie alles andere je Profil und gehört nicht in den Export.

**Stadtgitter:** Metadatei `grid-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta` wie die übrigen Metadaten). Eine Liste von Gittern, verwendet wird `id: 'main'` (72 × 72). `sectors[].tilePositions` sind die linken oberen Ecken der 4 × 4-Blöcke, nur Sektoren vom Typ `Regular` zählen (der Typ ist ein Enum-Objekt `{ __enum__: 'GridSectorType', value: 'Regular' }`), fehlende `x`/`y` sind 0. Der Catalog hält es als `CityGrid { width, height, blocks }` und meldet `catalog.grid`.

**Einheiten:** Metadatei `unit_types-<hash>` vom CDN, die das Spiel beim Start selbst lädt (über `onMeta`, Name genau `unit_types`). Ein Array der Einheitentypen, je Typ `unitTypeId`, `unitAssetName`, `unitClass`, `name` in der Sprache des Spiels und Kampfwerte (geprüft 2026-11-01 auf de20: 188 Typen, etwa `EarlyMiddleAge_champion` → „Held“, `rogue` → „Agent“). Der Katalog hält je Typ `id`, `name`, Zeitalter aus `minEra` und `unitClass` (`unitType(id)`), nicht gespeichert, wie die übrigen Definitionen. `minEra: NoAge` (39 Typen: Agent, Gildenexpeditionen, Event-Einheiten, Legenden) heißt: kein Zeitalter. Jedes Zeitalter hat seinen eigenen Helden (`<Zeitalter>_champion`, bis zur Moderne schnell, danach schwer). Die Kampfdetails zeigen den Namen, eine unbekannte Einheit mit ihrer Typ-ID. Der Tooltip der Einheit nennt je in einer Zeile „Einheit: …“, „Zeitalter: …“ (Name aus `research_eras`), „Typ: …“ und „LP: …/…“ mit eigenen Wörtern für die fünf Klassen: `light_melee` Leichte Einheit, `heavy_melee` Schwere Einheit, `fast` Schnelle Einheit, `short_ranged` Fernkampfeinheit, `long_ranged` Artillerie (Nutzer, 2026-11-01). Eine unbekannte Klasse lässt ihre Zeile weg, ohne Zeitalter fehlt seine Zeile. `unitAssetName` weicht von der Typ-ID ab (`EarlyMiddleAge_champion` → `bronzeage_champion`) und ist für die Einheitenbilder wichtig: Das Porträt wird zuerst unter dem Asset-Namen, dann unter der Typ-ID im Index der Spielbilder gesucht (siehe [Konzept](../konzept.md#bilder-vom-inno-cdn)).

**Forschung:** Metadatei `research-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta`; Name genau `research`, `research_eras` hat dasselbe Präfix und ist eine andere Datei). Ein Array der Technologien in der Reihenfolge des Baums, Zeitalter aufsteigend. Je Technologie `id`, `name`, `era`, `parents`, `children` und `rewards[]` mit `{ id, type, subType, amount, name, value, … }` (geprüft 2026-10-21). Hauptstadt-Erweiterungen sind `type: 'expansion'`, `subType: 'main'` (66 über alle Technologien). Andere Typen wie `era_outpost_expansion` oder `stellar_city_expansion` gehören zu anderen Städten und zählen nicht, ebenso `building` oder `terraforming`. Der `ResearchStore` hält davon nur die Technologien mit Hauptstadt-Erweiterungen als `{ tech, name, amount }` in Dateireihenfolge.

**Forschungsstand:** `ResearchService.getProgress` kommt mit den Startdaten. `responseData` ist ein Objekt `{ inProgressTechnologies, unlockedNodes, chosenBranches }`, `unlockedNodes` sind die Ids der erforschten Technologien (in der Aufnahme 375). In manchen Antworten kommt `getProgress` ohne Objekt, diese werden übergangen. Der `ResearchStore` hält die Ids im Speicher (nicht persistiert) und meldet wie bei der Metadatei `research.changed`. Gelesen wird nur der Stand vom Start: eine während des Spiels fertig erforschte Technologie zählt bis zum Neuladen als offen, die Antwort dazu ist noch nicht aufgenommen.
