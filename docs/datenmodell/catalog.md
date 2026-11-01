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

**Stadtgitter:** Metadatei `grid-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta` wie die übrigen Metadaten). Eine Liste von Gittern, verwendet wird `id: 'main'` (72 × 72). `sectors[].tilePositions` sind die linken oberen Ecken der 4 × 4-Blöcke, nur Sektoren vom Typ `Regular` zählen (der Typ ist ein Enum-Objekt `{ __enum__: 'GridSectorType', value: 'Regular' }`), fehlende `x`/`y` sind 0. Der Catalog hält es als `CityGrid { width, height, blocks }` und meldet `catalog.grid`.

**Einheiten:** Metadatei `unit_types-<hash>` vom CDN, die das Spiel beim Start selbst lädt (über `onMeta`, Name genau `unit_types`). Ein Array der Einheitentypen, je Typ `unitTypeId`, `unitAssetName`, `unitClass`, `name` in der Sprache des Spiels und Kampfwerte (geprüft 2026-11-01 auf de20: 188 Typen, etwa `EarlyMiddleAge_champion` → „Held“, `rogue` → „Agent“). Der Katalog hält nur `unitTypeId` → `name` (`unitName(id)`), nicht gespeichert, wie die übrigen Definitionen. Die Kampfdetails zeigen den Namen, eine unbekannte Einheit mit ihrer Typ-ID. `unitAssetName` weicht von der Typ-ID ab (`EarlyMiddleAge_champion` → `bronzeage_champion`) und ist für die Einheitenbilder wichtig.

**Forschung:** Metadatei `research-<hash>` vom CDN, die das Spiel selbst lädt (über `onMeta`; Name genau `research`, `research_eras` hat dasselbe Präfix und ist eine andere Datei). Ein Array der Technologien in der Reihenfolge des Baums, Zeitalter aufsteigend. Je Technologie `id`, `name`, `era`, `parents`, `children` und `rewards[]` mit `{ id, type, subType, amount, name, value, … }` (geprüft 2026-10-21). Hauptstadt-Erweiterungen sind `type: 'expansion'`, `subType: 'main'` (66 über alle Technologien). Andere Typen wie `era_outpost_expansion` oder `stellar_city_expansion` gehören zu anderen Städten und zählen nicht, ebenso `building` oder `terraforming`. Der `ResearchStore` hält davon nur die Technologien mit Hauptstadt-Erweiterungen als `{ tech, name, amount }` in Dateireihenfolge.

**Forschungsstand:** `ResearchService.getProgress` kommt mit den Startdaten. `responseData` ist ein Objekt `{ inProgressTechnologies, unlockedNodes, chosenBranches }`, `unlockedNodes` sind die Ids der erforschten Technologien (in der Aufnahme 375). In manchen Antworten kommt `getProgress` ohne Objekt, diese werden übergangen. Der `ResearchStore` hält die Ids im Speicher (nicht persistiert) und meldet wie bei der Metadatei `research.changed`. Gelesen wird nur der Stand vom Start: eine während des Spiels fertig erforschte Technologie zählt bis zum Neuladen als offen, die Antwort dazu ist noch nicht aufgenommen.
