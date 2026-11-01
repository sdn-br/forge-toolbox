# Forge Toolbox: Konzept

Stand 2026-10-19. Status: Entwurf, Grundentscheidungen getroffen.

## Ziel

Forge Toolbox ist eine Browser-Extension für Forge of Empires auf eigener Codebasis. Sie löst die FoE Toolbox ab, die ein Fork des FoE Helfers ist. Am Ende bietet sie das volle heutige Featureset der FoE Toolbox, also alle Toolbox-Features und alle Helfer-Features. Helfer-Features werden nur konzeptionell übernommen, Code aus dem Helfer wird nicht übernommen.

Ziele gegenüber heute:

- eigenes Datenmodell mit gekapselten Daten
- interne Events mit festen Verträgen, damit Änderungen an einem Feature andere nicht brechen
- wiederverwendbare UI-Bausteine, vor allem eine einbettbare Chart-Komponente
- Trennung von Daten und Darstellung in jedem Feature

## Ausgangslage

Analyse der FoE Toolbox auf `master` `f0a4c5d7d` (Helfer 4.8.3.0):

| Bereich | Befund |
|---|---|
| Umfang | rund 73.500 Zeilen JS in 86 Modulen, davon 11 Toolbox-eigen (rund 6.000 Zeilen), Patches in 32 Helfer-Dateien |
| Struktur | kein Build, keine Imports, alles globale Objekte, rund 3.600 Zugriffe über Modulgrenzen |
| Daten | FoEproxy fängt XHR und WebSocket ab, `_main.js` schreibt rund 30 lose Globals und `MainParser.*`, jedes Modul liest und schreibt mit |
| Events | 8 interne Events ohne Payload, sonst direkte Aufrufe, der Kern ruft Features auf (`Investment.UpdateData`, `Parts.CalcBody`) |
| Doppelarbeit | `visitPlayer` in 7 Modulen, Sabotage und Looting schreiben beide `PlayerDict` und die DB |
| Persistenz | 10 Dexie-DBs, Settings als Strings im localStorage der Spielseite, geteilt mit einem parallel installierten Helfer |
| UI | HTML per String-Konkatenation und jQuery, nur sabotage, looting, player-note und calculator-overview trennen ViewModel und lit-html-View |
| Charts | nur ECharts in `stats` und `gexstat`, Laden, Theme und Resize doppelt, `gexstat` hängt an `Stats.loadChartLib` |

Was sich bewährt hat und als Vorbild dient:

- FoEproxy: Pufferung bis alle Handler bereit sind, Wildcards, getrennte Wege für Request, Response und WebSocket
- ViewModel plus lit-html-View in den vier Toolbox-Modulen
- `notes-store` als eigene Datenschicht mit Change-Event

## Architektur

```
Spielseite (MAIN world)          Content Script (isolated world)               Service Worker
┌──────────────┐  Nachrichten   ┌─────────────────────────────────────────┐   ┌──────────────┐
│ Proxy        │ ─────────────► │ Ingestion ─► Handler ─► Stores ─► Bus    │   │ Storage      │
│ (XHR, WS)    │                │                         │        │       │◄─►│ (IndexedDB)  │
└──────────────┘                │                         ▼        ▼       │   │ Alarme       │
┌──────────────┐  Markierungen  │                      Features (Plugins)  │   │ Notifications│
│ Marker       │ ◄────────────► │                         │                │   └──────────────┘
│ (Pfeile)     │                │                     UI-Kit ─► DOM der Spielseite
└──────────────┘                └─────────────────────────────────────────┘
```

### Shell

- Manifest V3, TypeScript mit Build.
- Im Seitenkontext läuft der Proxy, weil er XHR und WebSocket vor dem Spielcode patchen muss. Er reicht Nachrichten an das Content Script weiter. Beim WebSocket meldet er beide Richtungen, ausgehende mit `direction: 'out'`. Die Ingestion wertet sie noch nicht aus, Aufnahmen behalten sie nur mit „Requests mitschreiben“.
- **Bewusste Ausnahme: das Marker-Modul** (`src/marker/`, `marker.js`, 2026-10-25). Es zeichnet die Markierungspfeile über Gebäude im Spiel (siehe [Stadtplan](features/stadtplan.md)). Pfeile, die der Kamera des Spiels folgen, brauchen die Kamera und die Projektion der Spiel-Engine, und die kann nur der Seitenkontext lesen. Verworfen: ein kleiner Leser im Seitenkontext, der nur Kamerawerte an das Content Script meldet, und das Content Script zeichnet selbst. Er wäre nicht robuster, denn er hängt an denselben Interna der Engine. Die Pfeile liefen dazu einen Frame hinterher, und die eigene Nachbildung der Projektion wäre eine weitere Fehlerquelle. Das Modul bekommt nur Gebäude-IDs und Grundflächen (`shared/marker-protocol.ts`, auf beiden Seiten geprüft) und meldet zurück, welche Pfeile weg sind. Es hängt an nicht dokumentierten Interna der Engine (Lime-App über V8-Aufrufstellen von `requestAnimationFrame`, `_isoScene.isoToScreen`, `_camera`, `_zoomFactor`). Ein Update des Spiels kann es brechen. Dann gibt es keine Pfeile, alles andere läuft weiter. Gebaut wird es ohne `"use strict"`, weil V8 `this` unter einem Strict-Mode-Frame verbirgt. Später kamen zwei Leser dazu, die ebenfalls nur die Engine kann: der Gegner im Armeefenster (siehe PvP-Angriffe) und welches LG-Fenster offen ist (siehe [LG-Rechner](features/lg-rechner.md), 2026-10-28).
- Alles andere läuft im Content Script. Es teilt das DOM mit der Spielseite, aber keine JS-Globals. Kollisionen mit Spiel oder Helfer entfallen.
- Der Service Worker hält Speicher, Alarme und Notifications.
- Fester `key` im Manifest, damit die Extension-ID stabil bleibt. Eigene ID, damit Forge Toolbox parallel zur FoE Toolbox laufen kann.

### Ingestion

- Der Proxy liefert jede Spielantwort als Nachricht `(service, method, payload, request)`.
- Welche Spielantwort welchen Store füttert, steht an einer Stelle (`game/handlers.ts`). Die Handler übersetzen das Spielformat mit einem gemeinsamen Konvertermodul (`game/convert.ts`) in das eigene Datenmodell und geben es an den zuständigen Store. Eine Antwort kann mehrere Handler haben, etwa `updatePlayer` (Spieler und Plünderung) oder `CityMapService.reset` (Plünderung und eigener Stadtplan). Features sehen das Spielformat nie.
- Zweite Eingabe neben dem Spielverkehr sind die Leser der Engine (`game/engine/`). Was nur die Engine weiß, liest das Marker-Modul im Seitenkontext, und die Leser machen daraus Events auf dem Bus: `army.target` nennt den Gegner im Armeefenster vor einem PvP-Kampf (siehe PvP-Angriffe), `gbWindow.changed` sagt, welches LG-Fenster das Spiel zeigt (siehe [LG-Rechner](features/lg-rechner.md)). Wie `army.opened` gehen sie ohne Store direkt auf den Bus, denn sie sind flüchtig und haben keinen Zustand. Kommt keine Antwort, etwa nach einem Spiel-Update, fehlt nur diese Ergänzung, alles andere läuft weiter.
- Pufferung wie bei FoEproxy: Antworten vor dem Start (etwa `StartupService.getData`) gehen nicht verloren.
- Der Request kommt als `ArrayBuffer` mit JSON. Der Proxy dekodiert ihn, und jeder Handler bekommt die `requestData` des passenden Requests (etwa `plunderById` mit `[Spieler-ID, Gebäude-ID]`).
- Was das Spiel auf mehrere Einträge einer Antwort verteilt (eine Plünderung: Beute, Gebäude, Double-Loot-Symbol), sammeln die Handler und werten es am Ende der Antwort aus (`onBatchEnd`). Die Reihenfolge der Einträge ist nicht fest.
- Nach einem Neuladen der Extension laufen Content Scripts in offenen Tabs ohne Extension weiter. Die Toolbox erkennt das, verarbeitet nichts mehr und bittet um Neuladen des Spiels.
- Der Proxy kann Antworten aufzeichnen. Die Aufnahmen sind Testdaten (siehe Tests). Im Einstellungsfenster unter Allgemein stehen bei laufender Aufnahme zwei Knöpfe: Aufnahme speichern (Download, Zahl der Nachrichten daneben) und Aufnahmedaten löschen (Mülleimer, ohne Rückfrage, ausgegraut ohne Daten). Löschen vor einer Aktion hält die Datei klein, die man aufnehmen will (Nutzer, 2026-10-25).

### Domain-Stores

- Ein Store je Bereich, etwa Player, City, GreatBuildings, Resources, Inventory, Guild, GuildBattleground. Weitere Stores entstehen, wenn ein Feature sie braucht.
- Ein Store besitzt seinen Zustand und seine Persistenz allein. Nur er ändert ihn. Andere lesen über Abfragen oder abonnieren Änderungen.
- Der laufende Zustand liegt im Speicher des Content Scripts. Lesen ist ein direkter Zugriff ohne DB.
- Was persistiert wird, schreibt der Store im Hintergrund. Niemand wartet darauf.
- Daten, die das Spiel bei jedem Start frisch schickt (Stadtplan, Ressourcen, Inventar), leben nur im Speicher.

Beispiel Stadtbesuch: Das Spiel schickt `visitPlayer`. Der Handler übersetzt die Antwort mit `game/convert.ts` und aktualisiert den PlayerStore. Der Store meldet `player.updated {id}`. Sabotage liest den Spieler aus dem Store und zeichnet die Box. Parallel schreibt der Store den Spieler in die DB.

### Event-Bus

- Typisierte Events mit Payload, etwa `player.updated {id}` oder `city.changed {playerId}`. Jeder Vertrag ist ein TypeScript-Typ.
- Stores senden Domain-Events. Features senden keine Events an andere Features, sie kennen sich nicht. Auch Befehle wie „öffne diese Box“ gehen nicht über den Bus, sondern an die Shell (siehe Features als Plugins).
- Bewusste Ausnahme: Der Handler sendet `army.opened` direkt auf den Bus. Das Signal ist flüchtig und hat keinen Zustand, ein Store hätte dafür nichts zu halten.
- `markers.changed` sendet `ctx.markers` (`core/markers.ts`). Er hält die Markierungen im Spiel, eine je Stadt, wie ein Store seinen Zustand und spricht mit dem Marker-Modul in der Seite.
- Zusätzlich Lebenszyklus-Events der Shell (bereit, Spieler bekannt, Welt gewechselt).

### Features als Plugins

- Ein Feature meldet sich bei der Shell an: Menüknopf, Boxen, Settings, Event-Abos.
- **Boxen öffnen über die Shell** (Nutzer, 2026-10-29): Öffnet ein Feature die Box eines anderen, etwa der Eigenanteil das Powerleveln oder der Zahnrad-Knopf einer Box die Einstellungen, ruft es `ctx.open(id)` mit der ID des Features, dem die Box gehört. Das Feature meldet beim Start mit `ctx.registerOpen(id, …)`, wie seine Box aufgeht, und nennt neben sich die ID und die Argumente (`OpenableBoxes` in `core/shell.ts`, etwa `settings: [group: string]`). Grund: Ein Befehl hat genau einen Empfänger. Fehlt er, verschwindet ein Event still. So ist eine unbekannte ID ein Typfehler, und fehlt die Anmeldung zur Laufzeit, steht ein Fehler in der Konsole. Ein zweiter Empfänger für dieselbe Box ist ein Fehler beim Start des Features. Heute öffnen sich so die Einstellungen (`settings`), der Dialog „Gefundene Daten“ (`backupCopy`) und das Powerleveln (`gbPowerLevel`). Vorher gingen dafür die Events `settings.open`, `foundData.open` und `gbPowerLevel.open` über den Bus.
- Es hängt nur von Stores, Bus und UI-Kit ab, nie von einem anderen Feature. Bewusste Ausnahme: Powerleveln nutzt Kopiertext und Faktorstand des Eigenanteils (`features/gb-own-share/copy-text.ts`, `factor-state.ts`). Beide Boxen rechnen dasselbe eigene LG, Powerleveln öffnet sich aus dem Eigenanteil.
- Aufbau je Feature: Datenteil liefert ein ViewModel, View ist eine reine lit-html-Funktion, die Box rendert das Ergebnis.
- Ablage: Jedes Feature hat einen Ordner unter `src/content/features/` mit `index.ts` (Anmeldung), ViewModel, View und `styles.ts` für das CSS, das nur seine Box zeichnet. Fachregeln ohne Darstellung liegen in `src/content/domain/`, etwa die Faktoren der LG-Rechner (`domain/gb-factor.ts`) oder die Sortierschlüssel der Snipehilfe (`domain/gb-snipe.ts`). Die reinen Typen von Stadt, Gebäudedefinitionen, LG-Rängen und Forschung liegen darunter in `src/content/model/`. Die Richtung ist Modell ← Domäne ← Stores: Domäne und `src/shared/` importieren nie aus `src/content/stores/` (2026-10-30). `src/content/ui/` ist das UI-Kit: Bausteine, die mehr als ein Feature nutzt oder die als allgemeiner Baustein gedacht sind (2026-10-29).

### UI-Kit

Bausteine und Regeln der Oberfläche (Box, Tabelle, Chart, Icons, Größe der Boxen, offene Icons): [UI-Kit](ui-kit.md).

### Settings

- Jede Einstellung hat ein Schema mit Typ und Default, angemeldet vom Feature.
- **Typisierte Handles** (Nutzer, 2026-10-30): Die Definition ist die einzige Quelle. Sie ist eine exportierte Modulkonstante, gebaut mit `toggleDef`, `choiceDef`, `numberDef`, `listDef` oder `textDef`, und trägt ihre Art in `kind`. `choiceDef` behält die Werte als Literal-Union, ein Cast beim Lesen entfällt. Der Besitzer ruft `ctx.settings.register(DEF)` und bekommt ein `Setting<T>` mit `get()`, `set(value)` und `onChange(listener)`. Jeder andere Leser holt es mit `ctx.settings.of(DEF)` aus seiner eigenen `Settings`-Instanz, auch in den Stores. `of` wirft bei einer Definition, die nie angemeldet wurde. Die Reihenfolge der `setup`-Aufrufe spielt für das Lesen keine Rolle, solange der Leser das Handle erst im Handler holt und nicht schon im eigenen `setup`. Das globale `settings.onChange((key) => …)` bleibt für alles, was auf jede Änderung hört (Sicherungskopie, Einstellungsfenster).
- **Orte im Einstellungsfenster** (Nutzer, 2026-10-30): Das Einstellungs-Feature zeichnet nur Einstellungen aus `settings.defs`. Ein Feature, das ein eigenes Bedienelement braucht (Schalter mit Rückfrage, Knöpfe), hängt es mit `ctx.settingsControls.add({ group, section?, claims?, render, reset? })` an einen Ort ein (`core/settings-controls.ts`, ohne lit-html außer dem Typ). Der Ort ist die Gruppe, optional mit einem Abschnitt samt Überschrift. Das Fenster zeichnet je Ort erst die Einstellungen, dann die Elemente in der Reihenfolge ihrer Anmeldung. `claims` nennt die Einstellungen, die das Element selbst zeichnet, die Liste lässt genau diese aus (das ersetzt das frühere `ownControl`). `reset` läuft beim Wechsel der Gruppe und beim Schließen, etwa um eine offene Rückfrage zu verwerfen. Ein Element, das sich neu zeichnen muss (Rückfrage, Zähler der Aufnahme), ruft `ctx.settingsControls.update()`. Heute hängen so der Sicherungskopie-Schalter samt „Gefundene Daten übernehmen“ (`features/backup-copy`), die Aufnahme-Knöpfe (`features/recorder`) und „Daten verwalten“ und „Einstellungen von einem anderen Profil übernehmen“ (`features/settings-feature.ts`) im Abschnitt „Daten“ von „Allgemein“. Weil die Reihenfolge der Anmeldung gilt, steht das Profil-Übernehmen als eigenes Feature `profileCopy` am Ende der Feature-Liste, damit es den Abschnitt abschließt.
- Gespeichert in `chrome.storage`, nicht im localStorage der Spielseite, je Profil (Welt und Spieler, siehe Persistenz).
- Double-Opt-In für Einstellungen, die Daten nach außen senden.

### Sprache

- Oberfläche zunächst nur Deutsch, wie die FoE Toolbox. Texte trotzdem über Schlüssel, damit weitere Sprachen möglich bleiben.
- Die Sprache des Spiels gibt die Welt vor (ihr Markt), nicht der Browser. Eine Spracheinstellung hat das Spiel nicht (geprüft 2026-10-22: Browsersprache umgestellt ohne Wirkung, eine Welt auf den US-Servern ist englisch).
- Die Toolbox folgt der Sprache der Welt. Quelle ist der Eintrag `translations` in `StaticDataService.getMetadata`, dessen Adresse die Sprache enthält (`…/lang/de_DE/client_lang-…`). Das ist die Datei, die das Spiel selbst lädt, eine eigene Tabelle Markt → Sprache entfällt. `StartupService.getData` enthält keine Sprache.

**Offen für eine zweite Sprache:**

- `t()` liest fest aus `texts/de.ts`. Nötig sind eine Tabelle je Sprache mit denselben Schlüsseln (beim Bauen auf Vollständigkeit geprüft) und die Wahl nach der Sprache der Welt, Rückfall Deutsch.
- `Intl` ist fest auf `de-DE` gesetzt und folgt dann derselben Sprache (`de_DE` → `de-DE`).
- Einzahl und Mehrzahl stehen als eigene Schlüssel im Code (`countOne`, `count`). Für andere Sprachen `Intl.PluralRules`.
- Ressourcennamen: Die Toolbox liest heute nur `goodsList` aus den Startdaten und hat eigene Namen für Münzen, Vorräte, Forge-Punkte, Medaillen und Diamanten. `ResourceService.getResourceDefinitions` kommt bei jedem Start und hat die Namen aller Ressourcen in der Sprache der Welt, auch dieser fünf. Wechselt die Toolbox darauf, entfallen die eigenen Namen, und Ressourcen ohne Namen (etwa aus Ereignissen) zeigen nicht mehr ihre Roh-ID. Nur die Platzhalter in Produktionsdefinitionen (`all_goods_of_age`, `random_good_of_age` und ähnliche) fehlen dort und brauchen weiter eigene Texte.

## Techstack

Festgelegt nach Phase 0. Jede Wahl mit der Alternative, die verworfen wurde.

| Bereich | Wahl | Verworfene Alternative | Begründung |
|---|---|---|---|
| Sprache | TypeScript, `strict` | JavaScript mit JSDoc | Datenmodell und Event-Verträge sind der Kern des Neubaus, Typen machen sie prüfbar. JSDoc prüft dasselbe, ist aber umständlicher zu schreiben. |
| Build | esbuild, ein Bundle je Einstiegspunkt | Vite | Eine Extension hat drei Einstiegspunkte (Proxy, Content Script, Service Worker) ohne HTML-Seite. esbuild baut sie direkt in unter einer Sekunde. Vite bringt Dev-Server und Hot Reload, die bei Content Scripts nur mit Zusatz-Plugins gehen, deren Pflege unsicher ist. Nachteil esbuild: Hot Reload fehlt, nach dem Bauen wird die Extension neu geladen. |
| Typprüfung | `tsc --noEmit` | Prüfung im Bundler | esbuild entfernt Typen nur, prüft sie aber nicht. |
| UI-Rendering | lit-html | Preact | Klein (rund 7 KB), Templates sind normales TypeScript, kein virtueller DOM. In Phase 0 belegt: rendert im Shadow DOM und nach dem Umzug ins Pop-out weiter. Preact wäre ähnlich klein und bietet JSX und Komponenten-Zustand, braucht aber JSX im Build und verleitet dazu, Zustand in Komponenten zu legen statt in Stores. |
| Komponenten | Funktionen, die Templates liefern | Web Components (Lit) | Im Content Script ist `customElements` in Chrome nicht verfügbar (isolierte Welt), eigene Elemente gingen nur mit Polyfill. |
| Style-Kapselung | Shadow DOM je Box | CSS mit Präfix | Spiel-CSS und Toolbox-CSS beeinflussen sich nicht. In Phase 0 belegt, zieht ins Pop-out mit. Ein Präfix schützt nur in eine Richtung: Spiel-Regeln wie `button {…}` greifen trotzdem. |
| Zustand und Events | eigene Stores und typisierter Event-Bus | Redux, Zustand, Signals | Das Konzept will Besitz pro Store und Events mit Vertrag. Das sind wenige Zeilen eigener Code. Eine Bibliothek brächte ein zweites Modell (ein globaler Store, Reaktivität), das dem Plugin-Gedanken widerspricht. |
| Messaging | eigenes typisiertes RPC über `chrome.runtime.sendMessage` | Comlink, webext-bridge | Es gibt nur zwei Wege (Proxy → Content Script, Content Script ↔ Service Worker). Eigener Code mit TypeScript-Typen ist klein und transparent. Bibliotheken lohnen sich erst bei vielen Kontexten. |
| Datenbank | Dexie im Service Worker | `idb` (dünner Wrapper) | Dexie bringt Schema-Versionen, zusammengesetzte Indizes, Massen-Operationen und gute Typen. Das brauchen Statistik, PvP-Verlauf und der Altdaten-Import. Die Altdaten liegen selbst in Dexie-Formaten. `idb` ist kleiner, verlangt aber Migrationen und Abfragen von Hand. |
| Charts | Apache ECharts, modular importiert und lazy geladen | Chart.js, uPlot | ECharts deckt alles ab, was die heutigen Statistiken nutzen (Zoom über Zeitachsen, gestapelte Serien, Export als Bild). Modular importiert lädt nur, was gebraucht wird. Chart.js ist leichter, bei Zoom und großen Zeitreihen aber schwächer. uPlot ist sehr schnell, kann aber nur Linien und Balken. |
| Tests | Vitest mit happy-dom | Jest, `node:test` | Vitest versteht TypeScript und ESM ohne Konfiguration und ist schnell. happy-dom erlaubt Tests der Views. Jest braucht für TypeScript und ESM Zusatzkonfiguration. `node:test` braucht keine Abhängigkeit, hat aber keine DOM-Umgebung und weniger Komfort. |
| Lint und Format | Biome | ESLint plus Prettier | Ein Werkzeug statt zwei, schnell, kaum Konfiguration. Weniger Regeln als ESLint, für ein Ein-Personen-Projekt reicht das. |
| Datum und Zahlen | `Intl` des Browsers | moment, date-fns | Formatierung von Datum und Zahlen auf Deutsch kann der Browser selbst. Eine Bibliothek erst, wenn echte Datumsrechnung nötig wird. |
| Texte | eigene Schlüssel-Tabelle mit typisierten Schlüsseln | i18next | Nur Deutsch, keine Pluralregeln außer einfachen. Typisierte Schlüssel finden Tippfehler beim Bauen. |
| Paketmanager | npm | pnpm | Schon installiert, ein Paket, keine Workspaces nötig. |
| Browser | Chromium-Browser (Edge und Chrome) | dazu Firefox | Zielbrowser sind Edge und Chrome (Nutzer, 2026-10-26). Abnahme und Browser-Tests laufen in Edge, Chrome kommt dort dazu, wo sich die Browser unterscheiden können. Firefox kennt `world: MAIN` seit Version 128, eine Unterstützung ist für eine spätere Phase denkbar. Bis dahin wird sie nicht getestet. |

## Persistenz

Entscheidung: Hauptspeicher ist IndexedDB im Origin der Extension, mit Sicherungskopie im Origin der Spielseite.

- Das Content Script greift per Messaging über den Service Worker zu.
- Berechtigung `unlimitedStorage`, damit der Browser bei Platzmangel nichts räumt.
- **Getrennt je Welt und Spieler** (Nutzer, 2026-10-26). In Familien spielen oft mehrere Accounts im selben Browser und Benutzerkonto und loggen sich im Spiel nur um. Daher gehört alles Gespeicherte einem **Profil**, also Welt und eigener Spieler-ID (`de20` und `12345`): Daten, Einstellungen und der Zustand der Boxen. Auch Fakten der Welt (Spieler, Großbauten, Schilde, foestats) liegen je Profil. Spielen zwei Accounts auf derselben Welt, steht ein Fakt dann doppelt, und jeder muss ihn einmal selbst sehen. Dafür gehört jede Zeile genau einem Profil.
  - **Eine Datenbank je Profil:** `forge-toolbox:de20:12345`. Jeder RPC des Content Scripts nennt sein Profil, der Service Worker öffnet die passende Datenbank einmal und behält sie. Tabellen, Schlüssel und Handler bleiben wie bisher, die Zeilen behalten ihr Feld `world`. Verworfen: die Spieler-ID als weiteres Feld in jedem Schlüssel einer gemeinsamen Datenbank (`[world+profile+battleId]`). Das ändert jede Tabelle, jeden Index und jede Abfrage, und vergisst eine Abfrage das Feld, sieht ein Profil die Daten des anderen. Getrennte Datenbanken schließen das aus. Nachteil: Abfragen über alle Profile gehen nicht in einem Zug. Nur der Export braucht das, er geht die Datenbanken einzeln durch (`indexedDB.databases()`).
  - **Einstellungen und Boxen** liegen in `chrome.storage.local` unter `settings:de20:12345`, `ui.boxes:de20:12345` und `ui.prefs:de20:12345`.
  - **Start erst nach den Startdaten:** Die Welt steht in der Adresse, die eigene Spieler-ID erst in `StartupService.getData`. Das Content Script hält den Spielverkehr deshalb zurück, bis die Startdaten da sind, lädt dann Einstellungen und Stores des Profils, spielt den zurückgehaltenen Verkehr ein und hängt erst dann das Menü an, wie die alte Toolbox.
  - **Neues Profil:** startet mit den Standardwerten. In den Einstellungen übernimmt „Einstellungen von einem anderen Profil übernehmen“ die Einstellungen und die Box-Anordnung eines anderen Profils. Das Feld steht unter „Allgemein“, Abschnitt „Daten“, unter „Daten verwalten“: eine Auswahl der anderen Profile und ein Knopf, der einmal nachfragt. Es ersetzt die Einstellungen, Boxen und Ansichtswahl dieses Profils und lädt danach das Spiel neu.
  - **Übernahme des Bestands** (einmal je Welt): Bis 2026-10-26 lag alles in der Datenbank `forge-toolbox`, nur nach Welt getrennt, und die Einstellungen galten für alle Welten. Öffnet der Service Worker ein Profil zum ersten Mal und hat die alte Datenbank Zeilen dieser Welt, gehören sie diesem Profil: Er kopiert sie in die neue Datenbank und löscht sie aus der alten. Das Profil bekommt dann auch eine Kopie der alten Einstellungen und Boxen. Ein zweites Profil auf derselben Welt findet nichts mehr und startet leer. Ist die alte Datenbank leer, löscht er sie. Die Zuordnung stimmt, solange bisher nur ein Account je Welt gespielt hat. Das ist beim einzigen bisherigen Nutzer so.
- **Sicherungskopie:** Was der Export eines Profils enthält, liegt zusätzlich in der IndexedDB der Spielseite, etwa eine halbe Minute nach der letzten Änderung. Geänderte Zeilen erkennt der Service Worker an Hooks auf den Tabellen des Exports und meldet sie dem Tab des Profils, den Ordner schreibt er selbst. Nach einer Neuinstallation bietet die Toolbox die Wiederherstellung an. Die Sicherung lässt sich abschalten, weil Spiel und andere Extensions sie lesen können. Einzelheiten in [Sicherung, Export und Import](features/sicherung.md).
- **Export als Datei** ab der ersten Version, für Rechnerwechsel und echte Backups. Einzelheiten in [Sicherung, Export und Import](features/sicherung.md).
- **Eine Form je gespeicherter Domäne** (Architektur-Review 2026-10-20): Was eine Domäne zum Speichern braucht, liegt zusammen in `src/persistence/<domäne>/`. `contract.ts` enthält die RPC-Typen, `worker.ts` Tabellendefinition und Handler im Service Worker, `client.ts` den Adapter auf der Content-Seite. `rpc.ts` und die Handler im Service Worker setzen sich daraus zusammen. Die Versionsgeschichte von Dexie bleibt zentral in `db.ts`, die Domänen liefern nur ihre Tabellen. Im Test läuft dieselbe Domäne gegen Dexie im Speicher. Umgesetzt mit PvP Teil B für Players, Battles, Plunders und Incoming, seitdem auch Notes, Shields, Great Buildings und foestats. Der Service Worker bekommt Abhängigkeiten nach außen (fetch, Uhr) beim Erzeugen der Handler, Tests geben eigene mit.
- **Primärschlüssel ändern:** Dexie kann den Primärschlüssel einer bestehenden Tabelle nicht ändern. Eine Version löscht die Tabelle, die nächste legt sie mit neuem Schlüssel an (so bei `plunders`, Versionen 4 und 5).

Begründung: Im Origin der Spielseite kann fremder Code die Daten lesen, ändern und löschen (der Helfer löscht in `mergeDatabases` alte DBs), und Chrome darf ihn bei Platzmangel leeren. Mit der Sicherung gehen Daten nur verloren, wenn Deinstallation und Löschen der Website-Daten zusammenkommen.

Kosten: etwa 1 ms je kleiner Abfrage, einige 10 ms bei großen Abfragen, rund 50 bis 100 ms, wenn der Service Worker nach Leerlauf aufwacht. Durch Stores im Speicher im Alltag kaum spürbar.

Verworfen: Spielseite als Hauptspeicher und Extension als Sicherung. Gleicher Schutz vor Verlust, schneller und leichter zu debuggen, aber die Wahrheit läge im ungeschützten Bereich und wäre pro Welt abgeschottet.

## Tests

Jedes Feature durchläuft zwei Stufen:

1. **Automatisch:** Aufgezeichnete Spielantworten sind Fixtures für Handler, Stores und ViewModels. Die Tests laufen ohne Spiel.
2. **Abnahme im Browser:** Test im echten Spiel durch den Nutzer. Erst danach gilt das Feature als fertig.

## Vorgehen

Iterativ, ein Feature nach dem anderen, jeweils mit Testzyklus. Forge Toolbox läuft parallel zur FoE Toolbox. Die alte wird abgeschaltet, wenn die Checkliste vollständig ist.

Features, die an Spielereignisse gebunden sind (GbG, Minispiele der Events), werden dann gebaut, wenn das Spiel sie gerade anbietet, damit sie sofort testbar sind.

| Phase | Inhalt |
|---|---|
| 0 | Prototypen: Pop-out per Bild-im-Bild aus dem Content Script, Proxy im Seitenkontext übergibt aufgezeichnete Antworten an das Content Script |
| 1 | Fundament (Shell, Proxy, Ingestion, Bus, Storage, Box, Menü, Settings) zusammen mit Sabotage als erstem echtem Feature |
| 2 | Toolbox-Kern: PvP-Angriffe (speichern nach jedem Kampf die echten Boni des Gegners aus `BattlefieldService.startByBattleType`, die Box „Besuchte Stadt“ zeigt sie neben dem berechneten Wert mit Datum), Notizen, LG-Rechner mit Snipehilfe, Investitionen, Eigenanteilsrechner, Altdaten-Import, Sicherung und Export |
| 2a | Design-Durchgang für das UI-Kit: Farben, Schrift, Abstände, Icons, Tabellen- und Kartenstil, Varianten live im Spiel. Farben und Grundstil kommen aus dem UI-Kit, ein Feature bringt nur das CSS seiner eigenen Box mit. |
| 3 | Stadt und Produktion |
| 4 | Gilde: GbG, GEX, QI, Mitgliederstatistik, Alarme |
| 5 | Statistik mit Chart-Komponente |
| 6 | Restliche Helfer-Features, Event-Minispiele nach Verfügbarkeit |

PvP-Angriffe in Phase 2 kommt in drei Teilen:

- **A:** Kämpfe speichern, gemessene Boni, Box „PvP-Angriffe“, gemessene Werte in der Box „Besuchte Stadt“.
- **B (umgesetzt):**
  - **Plünderungen:** eigene Tabelle, nicht am Kampf, denn das Spiel schickt keine `battleId` mit. Jede Plünderung ist geplündert oder abgewehrt. Bei einer Abwehr kommen Gegner und Gebäude aus dem Request.
  - **Double Loot:** nur ein Kennzeichen. Das Spiel liefert die Beute schon verdoppelt.
  - **Anzeige der Plünderungen:** Abschnitt „Deine Plünderungen“ in der Box „Besuchte Stadt“. In der PvP-Box gehört die Plünderung seit 2026-11-01 zu ihrem Kampf (siehe Umbau der PvP-Box unten), der frühere Reiter „Plünderungen“ mit eigener Summenzeile ist entfallen.
  - **Angriffe auf die eigene Stadt (Abwehr):** eigene Tabelle `incoming` mit Kämpfen (`battle_id`, `status` aus eigener Sicht, `lost` heißt durchbrochen) und Plünderungen (Ereignis-`id`). Sie kommen live über `OtherPlayerService.newEvent` (Websocket) und nachträglich über die Ereignisliste (`getEventsPaginated`). Das Datum steht dort nur als Text („heute/gestern/Wochentag um HH:MM“).
  - **Anzeige der Angriffe:** Reiter „Angriffe auf mich“ in der PvP-Box und eine Zeile in der Box „Besuchte Stadt“ beim Angreifer.
  - **Angenommen, noch ohne Aufnahme:** Eine Plünderung an der eigenen Stadt sieht aus wie das Polieren-Ereignis (`interaction_type: plunder`, `entity_id`), und `won` heißt gehalten. Außerdem könnten Live-Ereignisse und Ereignisliste verschiedene IDs tragen, dann zählt eine Plünderung doppelt. Ausweich-Schlüssel wäre Angreifer + Gebäude + Minute.
- **Kampfdetails (umgesetzt):**
  - **Öffnen mit dem Kampffenster:** Öffnet das Spiel das Armeefenster für einen PvP-Kampf (`ArmyUnitManagementService.getArmyInfo`, im Request `ArmyContext` mit `battleType: pvp`), geht die PvP-Box auf dem Reiter „Kämpfe“ auf. Ist sie schon offen, wechselt sie nur auf den Reiter. Andere Kampfarten (GvG, GG, Kampagne …) öffnen sie nicht. Einstellung „PvP-Box beim Kampffenster öffnen“, Standard an. Den Gegner nennt der Spielverkehr erst mit `startByBattleType`. Das Fenster der Engine kennt ihn aber schon (`settings.battleType.defenderPlayerId`, im Spiel geprüft 2026-10-26). Deshalb fragt das Content Script nach `army.opened` das Marker-Modul, das es bis zu 60 Bilder lang im `windowContainer` sucht und als `army.target` zurückmeldet. Dann schreibt die Box seinen Namen ins Namensfeld (seine Kämpfe und Notizkarte), die übrigen Filter gehen aus. Kommt keine Antwort, etwa nach einem Spiel-Update, bleibt die Box auf allen Kämpfen und der Spieler sucht den Gegner selbst über das Namensfeld (Nutzer, 2026-10-26).
  - **Details:** Ein Klick auf eine Kampfzeile zeigt den Kampf im Seitenpanel der Box (bis 2026-11-01 klappte die Zeile auf): eigene und gegnerische Einheiten mit Lebenspunkten nach dem Kampf, gemessene Boni beider Seiten, Ergebnis mit Auto/manuell und Runden, darunter die Plünderung des Kampfes. Dieselbe Komponente zeigt in der Box „Besuchte Stadt“ den letzten Kampf gegen den besuchten Spieler, eingeklappt. Einheiten stehen mit der Typ-ID des Spiels da, einen Katalog der Einheitennamen gibt es noch nicht.
  - **Gilde im Tooltip** (Nutzer, 2026-10-31): Der Name des Gegners trägt in beiden Reitern (bis 2026-11-01 drei) den Tooltip „Name [Gilde]“, ohne bekannte Gilde nur den Namen. Die Gilde kommt aus dem Player-Store.
- **Umbau der PvP-Box (umgesetzt 2026-11-01, Nutzer):**
  - **Reiter:** „Kämpfe“ und „Angriffe auf mich“. Der Reiter „Plünderungen“ entfällt, denn jede Plünderung hängt an ihrem Kampf (siehe [PvP](datenmodell/pvp.md)).
  - **Plünderung am Kampf:** In der Liste zählt nur, dass es eine Plünderung gab: ein Sack in einer eigenen schmalen Spalte, gefüllt für eine Plünderung, als Umriss für eine abgewehrte, leer ohne Plünderung (entschieden bei der Umsetzung). Tooltip und `aria-label` sagen, welche. Das Seitenpanel zeigt die Plünderung unter der Überschrift „Plünderung“, darunter je eine Zeile: das Gebäude (Name aus dem Katalog, ein unbekanntes mit seiner ID, „–“, wenn das Spiel keines nennt), dann die Beute mit den Namen der Ressourcen und Double Loot oder gedämpft „abgewehrt“ (Nutzer, 2026-11-01). In den Kampfdetails spannen die Köpfe „Deine Einheiten“ und „Gegner“ über Einheit und Lebenspunkte, damit sie im schmalen Panel nicht umbrechen. Für einen erschlossenen Kampf zeigt es nur seine Plünderung und eine gedämpfte Zeile, dass der Kampf selbst nicht aufgezeichnet ist.
  - **Namenszelle wie in den Investitionen:** Der Name ist ein Link zu foestats, am rechten Rand stehen die zwei PvP-Marken (`pvpMarks`, nur für einen Spieler, den der Player-Store kennt) und der Trichter, der den genauen Namen ins Namensfeld schreibt. Ein Klick auf den Namen filtert nicht mehr. Das Namensfeld ist der einzige Zustand des Spielerfilters, einen Knopf „Nur <Name>“ gibt es nicht mehr. Nennt das Feld genau den Namen eines bekannten Spielers (ohne Groß- und Kleinschreibung), gilt nur dieser Spieler, sonst jeder Name, der den Text enthält (entschieden bei der Umsetzung, so filtert der Trichter genau auf einen Spieler). Ein Spieler, den der Store nicht kennt, steht mit seiner ID als Name da, und diese ID im Feld nennt ihn. Die Notizkarte steht da, solange das Feld genau einen Spieler nennt. Das Notizzeichen einer Zeile schreibt den Namen ins Feld und öffnet die Karte zum Schreiben.
  - **Filterzeile** in einer Zeile wie in den Investitionen: Namensfeld, Stern „nur gut zu plündern“, Warndreieck „nur nicht angreifen“ (beide nach den PvP-Marken des Gegners, in beiden Reitern) und im Reiter „Kämpfe“ der Sack „nur Kämpfe mit Plünderung“. Stern und Warndreieck zeigen vorerst nur die markierten Spieler, mit dem Namensfeld zusammen. Kein Filter nach Ergebnis oder Beziehung, Stern und Auge der LGs spielen im PvP keine Rolle. Spieler auf „nicht angreifen“ bleiben in jeder Liste, ihre Zeile zeigt das Warndreieck. Die Filter werden nicht gemerkt.
  - **Summenzeile** über der Liste, passend zum Filter: „9 Kämpfe, 8 gewonnen · 3 Plünderungen, 2 abgewehrt, 2 FP“ aus `battles.summary`. „abgewehrt“ fällt bei null weg wie bisher, der Rest steht immer. Der Reiter „Angriffe auf mich“ behält seine Summenzeile an derselben Stelle.
  - **Scrollen wie in den Investitionen:** Die Box füllt ihre Höhe (`fill`), Reiter, Filterzeile, Notizkarte und Summenzeile bleiben stehen, nur die Zeilen scrollen (`windowedRows`, Mausrad und die zwei Knöpfe), kein Blättern mehr. Wie viele Zeilen passen, misst `ui/fit-rows.ts`, alle Zeilen sind gleich hoch. Die Box liest nur einen Ausschnitt aus der Datenbank: dreimal so viele Zeilen, wie passen, ab einem Fenster über dem sichtbaren, und erst wieder, wenn das Fenster den Ausschnitt verlässt. Die Zahl aller Zeilen kommt aus der Summe (`summary.battles`, bei den Angriffen `totals`). Ein anderer Filter oder Reiter beginnt oben.
  - **Seitenpanel statt aufklappbarer Zeilen** (Nutzer, 2026-11-01, nach dem Test im Browser): Aufgeklappte Zeilen waren höher als eine Zeile, und das Fenster der Zeilen musste sie mitzählen. Nach Filter auf einen Spieler, Aufklappen und Leeren des Filters füllte die Liste das Fenster nicht mehr. Darum zeigt ein Panel an der Seite der Box den gewählten Kampf, gebaut wie die Statistik des Stadtplans (`ui/side-drawer.ts`, beide nutzen es): Ein Reiter „Kampf“ am Rand klappt es aus, angedockt hängt es links aus der Box heraus (rechts, wenn die Box am linken Bildschirmrand steht), die Liste behält ihre Größe. Im Pop-out-Fenster ist es eine eigene Spalte neben der Liste. Offen oder zu wird je Betrachter gemerkt (`pvp.panel`).
    - Ein Klick auf eine Kampfzeile wählt den Kampf, die Zeile ist hervorgehoben wie die gewählte Zeile in „Besuchte Stadt“ (Grund der Auswahl, Akzentstreifen links). Ein zweiter Klick auf dieselbe Zeile hebt die Wahl auf. Ohne Wahl zeigt das Panel einen gedämpften Hinweis. Wählen öffnet ein geschlossenes Panel (entschieden bei der Umsetzung, sonst bliebe der Klick ohne sichtbare Folge).
    - Im Reiter „Angriffe auf mich“ gibt es kein Panel, er hat keine Kampfdetails.
    - Wann die Wahl endet (entschieden bei der Umsetzung, ohne alle Zeilen zu lesen): bei jedem Wechsel von Filter oder Reiter, denn ob der Kampf in der neuen Liste steht, wüsste die Box nur nach dem Lesen der ganzen Liste. Beim Scrollen und bei neuen Daten bleibt sie, solange der Kampf noch da ist: Liest die Box einen Ausschnitt, der den Kampf enthält, nimmt sie ihn neu (etwa mit einer Plünderung, die inzwischen kam). Reicht der Ausschnitt über die Zeit des Kampfes hinweg (oder bis an Anfang und Ende der Liste) und enthält ihn nicht, ist er weg (gelöscht, oder ein erschlossener Kampf vom geführten ersetzt), und die Wahl endet. Löscht das Aufbewahren ihn (er und seine Plünderung älter als die Grenze), endet sie ebenso. Liegt der Kampf außerhalb des gelesenen Ausschnitts, bleibt er gewählt.
- **C (umgesetzt, Schild-Format unbestätigt):** Angriffszeile in der Box „Besuchte Stadt“. Eine Zeile unter dem Spieler sagt, ob er angreifbar ist: „Plünderbar noch {Dauer} (bis {Zeit})“, „Stadt geschützt bis {Datum Uhrzeit} (noch {Dauer})“, „Wieder angreifbar in {Dauer} (ab {Zeit})“ oder „angreifbar“. Bei Freunden, Gildenmitgliedern und Nicht-Nachbarn steht der Grund („Freund, nicht angreifbar“). Plünderbar geht vor einem Schild, ein Schild vor dem Zeitgeber. Die Zeitgeber (`canSabotage`, `next_interaction_in`) kommen mit `updatePlayer` und der Nachbarliste, die Schilde aus `OtherPlayerService.getCityProtections` (Format laut alter Toolbox, nicht selbst gesehen, wird bis zur Bestätigung roh in die Konsole geschrieben). Die Box rechnet die Countdowns alle 30 Sekunden neu, solange sie offen ist.

Kämpfe in der PvP-Arena kommen mit dem Arena-Protokoll in Phase 6. Die Notizkarte in der PvP-Box ist mit dem Feature Notizen umgesetzt.

## Features

Je Feature eine Datei mit Umfang, Entscheidungen und Annahmen. Neue Features bekommen hier ihre eigene Datei.

- [Notizen](features/notizen.md): Notizen zu Spielern und Gilden
- [Stadtplan](features/stadtplan.md): Stadtplan der eigenen Stadt, Markierungspfeile im Spiel
- [Gebäudesuche](features/gebaeudesuche.md): Gebäude der eigenen Stadt nach Namen auswählen, die Auswahl trägt Pfeile im Spiel
- [LG-Rechner](features/lg-rechner.md): Kostenrechner für fremde LGs
- [Eigenanteil](features/eigenanteil.md): Eigenanteilsrechner für eigene LGs
- [Powerleveln](features/powerleveln.md): Eigenanteil über mehrere Stufen eines eigenen LGs
- [Snipehilfe](features/snipehilfe.md): lohnende Plätze aus der LG-Liste eines Spielers
- [Investitionen](features/investitionen.md): eigene Einzahlungen, Suche über alle bekannten fremden LGs, gemerkte LGs und Spieler
- [foestats](features/foestats.md): Links, täglicher Verlauf, Aktivität
- [Sicherung, Export und Import](features/sicherung.md): Export, Import, Sicherungskopie auf der Spielseite, Sicherung in einen Ordner, Altdaten-Import

## Feature-Checkliste

Stand der FoE Toolbox. Module, die im Fundament aufgehen, stehen getrennt.

**Gehen im Fundament auf:** `_main`, `_helper`, `_languages`, `_menu` mit drei Layouts, `popup`, `settings`, `indexdb`, `toolbox-indexdb`, `toolbox-main`, `toolbox-menu`, `srcLinks`, `mouseActions`, `customTooltip`, `closebox`, `dbexport`, `fh-compat`.

| Bereich | Feature | Altes Modul | Phase |
|---|---|---|---|
| Toolbox | Plünderhilfe / Besuchte Stadt (bis 2026-10-28 „Stadtinformationen“) | sabotage | 1 |
| Toolbox | PvP-Angriffe | looting | 2 |
| Toolbox | Notizen, Spieler-Notizen | toolbox-notes, notes-store, player-note | 2 |
| Toolbox | Snipehilfe: Mögliche Investitionen | calculator-overview | 2 |
| LG | LG-Kostenrechner (mit Minimal-Investition, BP-Tabelle, LG-DB) | calculator | 2 |
| LG | Investitionen | investment | 2 |
| LG | Eigenanteilsrechner, Powerleveling | part-calc | 2 |
| LG | Doppel-FP-Sperre | doublefpprevention | 2 |
| LG | LG-Finder | findGB | 2 |
| LG | Welches LG lohnt sich | greatbuildings | 3 |
| LG | LG-Boni | gbbonus | 3 |
| Stadt | Stadtübersicht | citymap | 3 |
| Stadt | Produktionen | productions | 3 |
| Stadt | Boosts | boosts | 3 |
| Stadt | Boost-Tränke | boost-potions | 3 |
| Stadt | Sets und Ketten, Kits | kits | 3 |
| Stadt | Inventar | inventory | 3 |
| Stadt | Erhabene Gebäude | ascended | 3 |
| Stadt | Gebäudesuche | citysearch | 3 |
| Stadt | Markierungspfeile | building-marker | 3 (umgesetzt) |
| Stadt | Stadtplaner | city-builder | 3 |
| Stadt | Umbau-Modus | reconstruction | 3 |
| Stadt | Blaue Galaxie | bluegalaxy | 3 |
| Stadt | Versteckte Ereignisse | hidden-rewards | 3 |
| Stadt | FP-Bestand | strategy-points | 3 |
| Stadt | FP-Sammler | fp-collector | 3 |
| Stadt | Forschung | technologies | 3 |
| Stadt | Armeen | unit | 3 |
| Stadt | Verbündete | allies | 3 |
| Stadt | Siedlungen | outposts | 3 |
| Stadt | Burgsystem | castle | 3 |
| Stadt | Diamanten-Schutz | cablocker | 3 |
| Gilde | Gildengefechte | guild_fights | 4 |
| Gilde | GbG-Aktionslog | gbg-actionlog | 4 |
| Gilde | GbG-Gebäude | gbgbuildings | 4 |
| Gilde | Verhandlungsassistent (auch GbG) | negotiation | 4 |
| Gilde | GEX-Statistik | gexstat | 4 |
| Gilde | QI-Fortschritt | qiprogress | 4 |
| Gilde | Mitgliederstatistik | guildmemberstat | 4 |
| Gilde | Gildenkasse | treasury | 4 |
| Gilde | Discord-Webhooks | discord | 4 |
| Gilde | Eigene Server (WebRequest) | webrequest | 4 |
| Gilde | Alarme | alerts | 4 |
| Statistik | Statistiken | stats | 5 |
| Sonstiges | Infobox | infoboard | 6 |
| Sonstiges | Moppelassistent | eventhandler | 6 |
| Sonstiges | Spielerprofil | profile | 6 |
| Sonstiges | Bonus-Zähler | bonus-service | 6 |
| Sonstiges | Kampfassistent | battle-assist | 6 |
| Sonstiges | PvP-Arena-Protokoll | pvparena | 6 |
| Sonstiges | Checkliste aus Nachricht | checklist | 6 |
| Sonstiges | Freunde vergleichen | compare_friends_threads | 6 |
| Sonstiges | Quests | quests | 6 |
| Sonstiges | Wiederkehrende Quests | recurring-quests | 6 |
| Sonstiges | Markt | market | 6 |
| Sonstiges | Marktangebote | marketoffers | 6 |
| Sonstiges | Shop-Assistent | shopAssist | 6 |
| Sonstiges | Auktionen | auctions | 6 |
| Sonstiges | Kampagne: Spähzeiten | scoutingtimes | 6 |
| Sonstiges | Warnung Kampagne/Handel | maptradewarning | 6 |
| Sonstiges | Hintergrundmusik | bettermusic | 6 |
| Sonstiges | Helfer-Server-Notizen | notice | entfällt, ersetzt durch Notizen |
| Event | Event-Truhen | eventchests | nach Verfügbarkeit |
| Event | Idle-Spiel | idleGame | nach Verfügbarkeit |
| Event | Merger-Spiel | mergergame | nach Verfügbarkeit |
| Event | Weltherausforderung | worldchallenge | nach Verfügbarkeit |
| Event | Kartenspiel | cardgame | nach Verfügbarkeit |
| Event | Pop-Spiel | popgame | nach Verfügbarkeit |
| Event | Azteken-Minispiel | minigame_aztecs | nach Verfügbarkeit |

Querschnitt aus der FoE Toolbox, der in die passenden Features eingeht: Fenster fixieren (Box), Alarme mit `requireInteraction` (Service Worker), Spielerlinks nur am Icon (UI-Kit), Datenschutz mit `GlobalSend` und Double-Opt-In (Settings, Ingestion nach außen).

## Externe Verbindungen

- Keine eigenen Anfragen an die Spielserver, nur mitlesen. Ausnahme wie heute: Metadaten und Assets vom Inno-CDN.
- `api.foe-rechner.de` nur nach Double-Opt-In, nur über den Service Worker.
- `api.forge-db.com` (foestats) aus dem Content Script, ohne Cookies, nur für angesehene Spieler, abschaltbar (siehe foestats). Wann gefragt wird, entscheidet der Service Worker.
- Discord-Webhooks und eigene Server nur mit URLs, die der Nutzer einträgt.

## Ergebnisse Phase 0

Prototyp `prototypes/phase-0`, getestet am 2026-10-19 in Chrome auf de20, parallel zur FoE Toolbox 2.0.

| Frage | Ergebnis |
|---|---|
| Proxy-Übergabe | Funktioniert. Das Content Script ist vor der ersten Spielantwort bereit, `StartupService.getData` und `visitPlayer` kommen an. Übergabe per `postMessage` meist 0,1 bis 0,3 ms, beim Spielstart Spitzen bis 84 ms, weil der Hauptthread mit dem Spiel beschäftigt ist. Datenmenge beim Start rund 2,3 MB, größter Brocken `OutpostService.getAll` mit 1,4 MB. |
| Pop-out | Bild-im-Bild und `window.open` gehen direkt aus dem Content Script. Box im Shadow DOM zieht mit, Styles greifen, lit-html rendert weiter, Klicks kommen an, beim Schließen kehrt die Box ins Spiel zurück. |
| Speicher | Aufwecken des Service Workers 93 bis 107 ms. Kleine Zugriffe 0,5 bis 1,3 ms. 5.000 Zeilen schreiben rund 115 ms, lesen rund 25 ms, je in einer Nachricht. |
| Aufnahme | Mitschnitt als JSON klappt (21 Nachrichten, 61 verschiedene Service-Methoden, 2,9 MB). Taugt als Grundlage für Fixtures. |

Folgerungen:

- Die Architektur trägt, kein Helfer im Seitenkontext nötig außer dem Proxy. Später kam als bewusste Ausnahme das Marker-Modul für die Markierungspfeile dazu (siehe Shell).
- Styles werden per Shadow DOM gekapselt.
- Gebaut wird mit esbuild (ein Bundle je Einstiegspunkt, kein Dev-Server nötig). TypeScript prüft getrennt mit `tsc --noEmit`.
- Rendern darf nicht am `requestAnimationFrame` des Spielfensters hängen. Ist der Spiel-Tab im Hintergrund, drosselt Chrome ihn, und ein offenes Pop-out würde nicht mehr aktualisiert. Das Fundament plant Renders über das Fenster, in dem die Box gerade steckt (noch nicht getestet).
- Schreiben in die DB immer gesammelt, nicht Zeile für Zeile per Nachricht.
- `postMessage` sieht auch das Spiel. Der Proxy liest ohnehin im Seitenkontext mit, daraus entsteht kein neues Risiko. Fremde Seitenskripte könnten aber Nachrichten fälschen, Handler und `game/convert.ts` müssen Eingaben prüfen.
- Aufnahmen enthalten private Spieldaten. Fixtures werden vor dem Commit auf das Nötige gekürzt und anonymisiert.

## Offene Punkte

Derzeit keine.
