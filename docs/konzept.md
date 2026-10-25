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
                                │                      Features (Plugins)  │   │ Notifications│
                                │                         │                │   └──────────────┘
                                │                     UI-Kit ─► DOM der Spielseite
                                └─────────────────────────────────────────┘
```

### Shell

- Manifest V3, TypeScript mit Build.
- Nur der Proxy läuft im Seitenkontext, weil er XHR und WebSocket vor dem Spielcode patchen muss. Er reicht Nachrichten an das Content Script weiter. Beim WebSocket meldet er beide Richtungen, ausgehende mit `direction: 'out'`. Die Ingestion wertet sie noch nicht aus, Aufnahmen behalten sie nur mit „Requests mitschreiben“.
- Alles andere läuft im Content Script. Es teilt das DOM mit der Spielseite, aber keine JS-Globals. Kollisionen mit Spiel oder Helfer entfallen.
- Der Service Worker hält Speicher, Alarme und Notifications.
- Fester `key` im Manifest, damit die Extension-ID stabil bleibt. Eigene ID, damit Forge Toolbox parallel zur FoE Toolbox laufen kann.

### Ingestion

- Der Proxy liefert jede Spielantwort als Nachricht `(service, method, payload, request)`.
- Welche Spielantwort welchen Store füttert, steht an einer Stelle (`game/handlers.ts`). Die Handler übersetzen das Spielformat mit einem gemeinsamen Konvertermodul (`game/convert.ts`) in das eigene Datenmodell und geben es an den zuständigen Store. Eine Antwort kann mehrere Handler haben, etwa `updatePlayer` (Spieler und Plünderung) oder `CityMapService.reset` (Plünderung und eigener Stadtplan). Features sehen das Spielformat nie.
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
- Stores senden Domain-Events. Features senden keine Events an andere Features, sie kennen sich nicht.
- Bewusste Ausnahme: Der Handler sendet `army.opened` direkt auf den Bus. Das Signal ist flüchtig und hat keinen Zustand, ein Store hätte dafür nichts zu halten.
- Zusätzlich Lebenszyklus-Events der Shell (bereit, Spieler bekannt, Welt gewechselt).

### Features als Plugins

- Ein Feature meldet sich bei der Shell an: Menüknopf, Boxen, Settings, Event-Abos.
- Es hängt nur von Stores, Bus und UI-Kit ab, nie von einem anderen Feature.
- Aufbau je Feature: Datenteil liefert ein ViewModel, View ist eine reine lit-html-Funktion, die Box rendert das Ergebnis.

### UI-Kit

- **Box:** Fenster mit Titel, Ziehen, Größe, Minimieren, Fixieren, Pop-out, gemerkter Position.
  - Größe: angedockt über einen Griff an der unteren rechten Ecke, eigenes Element mit Pointer-Events (kein CSS-`resize`, das an der fest positionierten Box im Shadow DOM nicht greift). Mindestens 260 × 150 Pixel, höchstens bis zum Rand des Fensters. Breite und Höhe merkt sich die Box mit der Position, ein Doppelklick auf den Griff stellt die Standardgröße wieder her. Ohne gemerkte Größe hat die Box ihre Standardbreite und die Höhe ihres Inhalts (höchstens 70 % der Fensterhöhe), mit gemerkter Höhe füllt der Inhalt die Box und scrollt. Minimiert und im Pop-out gibt es keinen Griff, dort ändert das Fenster die Größe.
  - **Verstellbar nur, wo es hilft** (Nutzer, 2026-10-24): Jede Box legt fest, ob sie einen Griff hat. Ohne Griff hat sie eine feste Breite und die Höhe ihres Inhalts, sie wächst und schrumpft mit ihm, höchstens bis zu einer Maximalhöhe (Standard 70 % des Fensters, Einstellungen 80 %), darüber scrollt der Inhalt. Eine früher gemerkte Größe gilt für sie nicht mehr. Ohne Griff: LG-Rechner, Eigenanteil, Powerleveln, Sabotage, Einstellungen. Mit Griff: Notizen, PvP-Angriffe, Stadtplan (eigene und besuchte Stadt), Investitionen. Eine Box ohne Angabe hat keinen Griff. Im Pop-out ändert wie bisher das Fenster die Größe.
  - **Standardgröße einer verstellbaren Box:** je Box festgelegt. Der Stadtplan öffnet ohne gemerkte Größe groß, 70 % von Fensterbreite und -höhe, höchstens 1.100 × 850 Pixel (Nutzer, 2026-10-24).
  - Einstellungen: Nennt ein Feature seine Einstellungsgruppe (`settings` in den Box-Optionen), zeigt der Kopf einen Knopf mit Zahnrad (eigenes SVG wie die Stecknadel, das Zeichen ⚙ war zu klein). Er öffnet das Einstellungsfenster beim Modul der Box. Die Box meldet das über den Bus (`settings.open { group }`), das Einstellungs-Feature reagiert. Im Pop-out fehlt der Knopf wie die Stecknadel. Heute bei LG-Rechner, Eigenanteil, PvP und Sabotage (Nutzer, 2026-10-23).
  - Pop-out: Die Box zieht als Ganzes ins Bild-im-Bild-Fenster und füllt es. Schließt das Fenster, dockt sie wieder an. Wird sie im Pop-out geschlossen, bleibt sie zu.
- **Einstellungsfenster:** links eine senkrechte Leiste mit einem Icon je Modul (dasselbe wie im Menü, Name im Tooltip), rechts nur das gewählte Modul. „Allgemein“ steht oben, danach die Module in der Reihenfolge ihrer Anmeldung. Ein Modul kann Abschnitte haben (`section` an der Einstellung, etwa „Kopiertext“ beim Eigenanteil). Das gewählte Modul wird gemerkt. Senkrecht statt Reiter, weil die Leiste mit vielen Modulen nach unten wächst statt umzubrechen (Nutzer, 2026-10-23). Features melden ihr Icon mit `settings.registerGroup`.
- **Tabelle:** sortieren, filtern, exportieren.
  - Sortieren mit mehreren Stufen (`src/content/ui/sortable.ts`, 2026-10-25, Nutzer), gleich in allen sortierbaren Tabellen (Snipehilfe, beide Reiter der Investitionen). Ein Klick auf einen Spaltenkopf sortiert nur nach dieser Spalte, derselbe Kopf noch einmal dreht die Richtung. Umschalt+Klick hängt die Spalte als nächste Stufe an, ohne Grenze. Ist die Spalte schon eine Stufe, dreht Umschalt+Klick nur ihre Richtung und sie behält ihren Platz. Ein einfacher Klick danach setzt auf eine Stufe zurück. Spätere Stufen entscheiden nur bei Gleichstand der früheren, unbekannte Werte stehen in jeder Stufe und Richtung zuletzt. Mit einer Stufe zeigt der Kopf den Pfeil wie bisher, ab zwei Stufen folgt dem Pfeil die Nummer der Stufe, klein und im selben Akzent. Der Tooltip nennt zusätzlich „Umschalt+Klick: weitere Sortierung“ und bei mehreren Stufen die Reihenfolge („Sortiert nach Sicherheit, dann Gewinn“). Die Köpfe sind nicht per Tastatur erreichbar, darum gibt es kein Umschalt+Enter. Der Text der Köpfe ist nicht markierbar, damit Umschalt+Klick keinen Text markiert. Die schmalen Icon-Spalten sind 38 px breit, damit Icon, Pfeil und Nummer auf eine Zeile passen. Auch jede Wortspalte ist so breit wie Wort, Pfeil und Nummer (gemessen, „Stufe ▾2“ 56 px, „Einsatz ▾2“ 67 px, „Einzahlung ▾2“ 90 px): Der stehende Tabellenkopf hat einen Hintergrund, und was über die Spalte ragt, verdeckt der Nachbar. Bis dahin fehlte bei Stufe und Platz die Nummer (Nutzer, 2026-10-25). Die Boxen sind dafür breiter, Investitionen 818 px, Snipehilfe und LG-Rechner 602 px (die CSS-Grenze von 520 px für Boxen ohne Griff ist dafür entfernt). Eigentümer und LG haben eine Mindestbreite (90 px bzw. 100 px), als Mindestbreite der ganzen Tabelle: Wird die Box schmaler, scrollt sie seitwärts, statt die Namen ganz verschwinden zu lassen (Nutzer, 2026-10-25). Gemerkt wird die Sortierung nicht, sie gilt bis zum Neuladen.
- **Tooltip:** ein Mechanismus für alle Features (`src/content/ui/tooltip.ts`) statt des Browser-`title`. Elemente tragen ihren Text in `data-tip`, ein Listener je Shadow Root (Box und Menü) zeigt ihn. So erscheint er auch im Pop-out und mehrzeilig im Stil der Toolbox. Er erscheint nach einer kurzen Pause wie beim Browser, steht schon einer, wechselt er sofort. Er folgt dem Zeiger und klappt an den Rändern des Fensters nach links oder oben. Ein Klick blendet ihn aus, weil sich die Beschriftung dann oft ändert. Elemente mit `data-tip-instant` zeigen ihn ohne Pause (Stadtplan). Knöpfe nur mit Symbol tragen dieselbe Beschriftung als `aria-label`.
- **Faktorleiste** (`src/content/ui/factor-bar.ts`): Faktor-Knöpfe der LG-Rechner, als Faktor beschriftet (90 % = 1,9), Voreinstellungen und eigener Arche-Bonus nach Wert sortiert, dazu ein freies Feld. LG-Rechner und Eigenanteil nutzen sie mit je eigenen Einstellungen.
- **Fixieren:** Der Knopf zeigt eine Stecknadel als SVG: als Umriss schräg, solange die Box lose ist, gefüllt senkrecht in Gold, wenn sie fixiert ist.
- **Chart:** kapselt ECharts mit Lazy-Load, Theme, Resize, Export als PNG und CSV. Bekommt ein eigenes Datenformat für Serien, nicht ECharts-Optionen. Lässt sich in jede View einbetten, so muss kein Feature Chart-Code wiederholen.
- **Stadtplan:** zeichnet ein Stadtgitter mit Gebäuden aus einfachen Daten (siehe [Stadtplan](features/stadtplan.md)).
- **Menü:** Leiste mit den Knöpfen der angemeldeten Features, sortierbar, einzeln ausblendbar.
- **Icons statt Wörter** (Nutzer, 2026-10-24): Knöpfe tragen, wo es sinnvoll möglich ist, ein Icon statt eines Worts, mit dem Wort im Tooltip und als `aria-label`. Alle Icons kommen aus `src/content/ui/icons.ts` in derselben Designsprache (eigene SVGs auf dem 24er-Raster, Strichstärke je Ort, Farben aus den Variablen), keine Emoji und keine Schriftzeichen als Icon. Während der Entwicklung darf ein neuer Knopf zuerst Text tragen. Dann wird besprochen, ob er später ein Icon bekommt, und das kommt in die Liste „Offene Icons“ unten. Knöpfe, die Text behalten müssen (Faktoren, Seitenwechsel mit Zahl), sind im Farbschema der Boxen gestylt, wie die Eingabefelder (dunkler Grund, heller Text, brauner Rand, Akzent bei aktiv und Fokus). Reiter sehen wie Reiter aus, nicht wie Knöpfe (Nutzer, 2026-10-25, Entwurf A): eine Leiste mit Linie unten, jeder Reiter mit eigener Fläche und oben gerundet, der aktive hat den Grund der Box, eine Akzentlinie oben und öffnet sich nach unten in die Box. Gleich in Investitionen, PvP und Notizen (`.tabs` in `ui/styles.ts`).
- **Motive aus dem Spiel** (Nutzer, 2026-10-25): Wo das Spiel ein bekanntes Symbol hat, wird dessen Motiv als eigenes Strich-Icon nachgezeichnet, so wie die alte Toolbox Spielbilder zu eigenen Icons kombinierte. Beispiele: FP-Münze im Menü-Icon der Investitionen (Burg mit Münze in Akzent), Nachbar, Freund und Gilde nach den Reitern der Sozialleiste. Spielbilder direkt vom CDN sind ein eigenes, späteres Thema.
- **Keine neuen Farbtöne** (Nutzer, 2026-10-24): Farben kommen aus der Palette der Boxen (Variablen auf `:host`: `--ink`, `--accent`, `--btn`, `--btn-hover`, `--field`, `--line`, `--bg`). Ein neuer Ton, etwa ein helleres Orange, kommt nur dazu, wenn er zum Rest passt und besprochen ist.
- **Überschriften nie abschneiden** (Nutzer, 2026-10-24): Ein Spaltenkopf zeigt sein Wort ganz. Passt es in eine Spalte mit fester Breite nicht, steht eine Abkürzung oder ein Icon da, das ganze Wort im Tooltip und als `aria-label`.
- **Offene Icons** (Knöpfe mit Text, für die ein Icon gewünscht ist):
  - Spaltenkopf „Einzahlen“ im Eigenanteil (zurückgestellt 2026-10-24): Entwürfe Pfeil nach unten auf Münzstapel und Pfeil ins LG gefielen am ehesten, Münze mit Plus und Münze mit Pfeil fallen weg (lesen sich als Männlich-Symbol und Schlüssel).
  - Entschieden 2026-10-24 (Nutzer, erst einmal so, später verfeinern): Icons bekommen Seitenwechsel im PvP (‹ ›), das ✕ am Spielerfilter im PvP (Text bleibt), Seite und Gruppe löschen in den Notizen (Mülleimer), Spieler hinzufügen (Person mit +), Seite hinzufügen (Blatt mit +), Schließen der Spielerauswahl (✕ wie im Boxkopf), Aufnahme speichern (Download, Zahl daneben), Powerleveln öffnen (kleines LG » großes LG). Text behalten: Löschen und Abbrechen in Rückfragen (Klartext ist dort sicherer), „Laufend X → X+1“ (die Stufe ist die Information), Reiter und Faktor-Knöpfe.
  - Gewählt aus der Icon-Vorschau (Nutzer, 2026-10-25): Gewinn als FP-Münze mit drei steigenden Pfeilen in Akzent (Spaltenkopf „Gewinn“ in Snipehilfe und beiden Reitern der Investitionen), „nicht erreichbar“ als durchgestrichene Person, „Nur diesen Spieler zeigen“ als Trichter.
- Styles so gekapselt, dass Spiel-CSS und Toolbox-CSS sich nicht beeinflussen (zu prüfen: Shadow DOM).

### Settings

- Jede Einstellung hat ein Schema mit Typ und Default, angemeldet vom Feature.
- Gespeichert in `chrome.storage`, nicht im localStorage der Spielseite.
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
| Browser | Chrome | Chrome und Firefox | Zielbrowser ist Chrome. Firefox kennt `world: MAIN` seit Version 128, eine spätere Unterstützung bleibt möglich. Bis dahin wird sie nicht getestet. |

## Persistenz

Entscheidung: Hauptspeicher ist IndexedDB im Origin der Extension, mit Sicherungskopie im Origin der Spielseite.

- Das Content Script greift per Messaging über den Service Worker zu.
- Berechtigung `unlimitedStorage`, damit der Browser bei Platzmangel nichts räumt.
- Daten pro Welt und Spieler getrennt, ein gemeinsamer Speicher für alle Welten.
- **Sicherungskopie:** Unwiederbringliche Daten (Notizen, PvP-Verlauf, Statistiken, GbG- und GEX-Historie, keine Caches) gehen gesammelt in die IndexedDB der Spielseite, etwa eine Minute nach der letzten Änderung und beim Schließen. Nach einer Neuinstallation bietet die Toolbox die Wiederherstellung an. Die Sicherung lässt sich abschalten, weil Spiel und andere Extensions sie lesen könnten.
- **Export als Datei** ab der ersten Version, für Rechnerwechsel und echte Backups.
- **Eine Form je gespeicherter Domäne** (Architektur-Review 2026-10-20): Was eine Domäne zum Speichern braucht, liegt zusammen in `src/persistence/<domäne>/`. `contract.ts` enthält die RPC-Typen, `worker.ts` Tabellendefinition und Handler im Service Worker, `client.ts` den Adapter auf der Content-Seite. `rpc.ts` und die Handler im Service Worker setzen sich daraus zusammen. Die Versionsgeschichte von Dexie bleibt zentral in `db.ts`, die Domänen liefern nur ihre Tabellen. Im Test läuft dieselbe Domäne gegen Dexie im Speicher. Umgesetzt mit PvP Teil B für Players, Battles, Plunders und Incoming, seitdem auch Notes, Shields, Great Buildings und foestats. Der Service Worker bekommt Abhängigkeiten nach außen (fetch, Uhr) beim Erzeugen der Handler, Tests geben eigene mit.
- **Primärschlüssel ändern:** Dexie kann den Primärschlüssel einer bestehenden Tabelle nicht ändern. Eine Version löscht die Tabelle, die nächste legt sie mit neuem Schlüssel an (so bei `plunders`, Versionen 4 und 5).

Begründung: Im Origin der Spielseite kann fremder Code die Daten lesen, ändern und löschen (der Helfer löscht in `mergeDatabases` alte DBs), und Chrome darf ihn bei Platzmangel leeren. Mit der Sicherung gehen Daten nur verloren, wenn Deinstallation und Löschen der Website-Daten zusammenkommen.

Kosten: etwa 1 ms je kleiner Abfrage, einige 10 ms bei großen Abfragen, rund 50 bis 100 ms, wenn der Service Worker nach Leerlauf aufwacht. Durch Stores im Speicher im Alltag kaum spürbar.

Verworfen: Spielseite als Hauptspeicher und Extension als Sicherung. Gleicher Schutz vor Verlust, schneller und leichter zu debuggen, aber die Wahrheit läge im ungeschützten Bereich und wäre pro Welt abgeschottet.

## Altdaten-Import

- Beim Spielstart sucht die Toolbox nach Daten der aktuellen Spieler-ID in `FoEToolbox2DB_*`, `FoEToolboxDB_*` und den Helfer-DBs (`FoeHelperDB_*` und Modul-DBs wie `FoeHelper_GexStat_*`), außerdem nach der eigenen Sicherungskopie.
- Findet sie welche, fragt sie einmal: „Alte Daten gefunden, übernehmen?“ mit Ja, Nein und Später. Die Antwort wird gemerkt.
- Bereiche sind einzeln wählbar: Notizen, PvP-Verlauf, LG-Daten, Statistiken, GbG, GEX usw. Settings aus dem localStorage optional.
- Die Quellen werden nur gelesen, nie verändert oder gelöscht.
- Ein Mapper je Quelle und Schema-Version übersetzt in das neue Datenmodell und meldet, was er nicht zuordnen konnte.
- Der Import ist auch später in den Settings erreichbar.
- **Notizen:** Die alten Notizen sind HTML. Der Mapper wandelt sie in das Markdown der neuen Notizen um (Überschriften, fett, kursiv, Listen, Links), alles andere wird Text.

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
| 2 | Toolbox-Kern: PvP-Angriffe (speichern nach jedem Kampf die echten Boni des Gegners aus `BattlefieldService.startByBattleType`, Stadtinformationen zeigen sie neben dem berechneten Wert mit Datum), Notizen, LG-Rechner mit Snipehilfe, Investitionen, Eigenanteilsrechner, Altdaten-Import, Sicherung und Export |
| 2a | Design-Durchgang für das UI-Kit: Farben, Schrift, Abstände, Icons, Tabellen- und Kartenstil, Varianten live im Spiel. Bis dahin enthalten Features keine eigenen Styles. |
| 3 | Stadt und Produktion |
| 4 | Gilde: GbG, GEX, QI, Mitgliederstatistik, Alarme |
| 5 | Statistik mit Chart-Komponente |
| 6 | Restliche Helfer-Features, Event-Minispiele nach Verfügbarkeit |

PvP-Angriffe in Phase 2 kommt in drei Teilen:

- **A:** Kämpfe speichern, gemessene Boni, Box „PvP-Angriffe“, gemessene Werte in den Stadtinformationen.
- **B (umgesetzt):**
  - **Plünderungen:** eigene Tabelle, nicht am Kampf, denn das Spiel schickt keine `battleId` mit. Jede Plünderung ist geplündert oder abgewehrt. Bei einer Abwehr kommen Gegner und Gebäude aus dem Request.
  - **Double Loot:** nur ein Kennzeichen. Das Spiel liefert die Beute schon verdoppelt.
  - **Anzeige der Plünderungen:** Reiter „Plünderungen“ in der PvP-Box mit Summenzeile (Anzahl, abgewehrt, FP), Abschnitt „Deine Plünderungen“ in den Stadtinformationen.
  - **Angriffe auf die eigene Stadt (Abwehr):** eigene Tabelle `incoming` mit Kämpfen (`battle_id`, `status` aus eigener Sicht, `lost` heißt durchbrochen) und Plünderungen (Ereignis-`id`). Sie kommen live über `OtherPlayerService.newEvent` (Websocket) und nachträglich über die Ereignisliste (`getEventsPaginated`). Das Datum steht dort nur als Text („heute/gestern/Wochentag um HH:MM“).
  - **Anzeige der Angriffe:** Reiter „Angriffe auf mich“ in der PvP-Box und eine Zeile in den Stadtinformationen beim Angreifer.
  - **Angenommen, noch ohne Aufnahme:** Eine Plünderung an der eigenen Stadt sieht aus wie das Polieren-Ereignis (`interaction_type: plunder`, `entity_id`), und `won` heißt gehalten. Außerdem könnten Live-Ereignisse und Ereignisliste verschiedene IDs tragen, dann zählt eine Plünderung doppelt. Ausweich-Schlüssel wäre Angreifer + Gebäude + Minute.
- **Kampfdetails (umgesetzt):**
  - **Öffnen mit dem Kampffenster:** Öffnet das Spiel das Armeefenster für einen PvP-Kampf (`ArmyUnitManagementService.getArmyInfo`, im Request `ArmyContext` mit `battleType: pvp`), geht die PvP-Box auf dem Reiter „Kämpfe“ auf. Ist sie schon offen, wechselt sie nur auf den Reiter. Andere Kampfarten (GvG, GG, Kampagne …) öffnen sie nicht. Einstellung „PvP-Box beim Kampffenster öffnen“, Standard an. Den Gegner nennt das Spiel erst mit `startByBattleType`, deshalb sucht der Spieler ihn selbst über das Suchfeld (Teil des Namens).
  - **Details:** Ein Klick auf eine Kampfzeile klappt sie auf: eigene und gegnerische Einheiten mit Lebenspunkten nach dem Kampf, gemessene Boni beider Seiten, Ergebnis mit Auto/manuell und Runden. Dieselbe Komponente zeigt in den Stadtinformationen den letzten Kampf gegen den besuchten Spieler, eingeklappt. Einheiten stehen mit der Typ-ID des Spiels da, einen Katalog der Einheitennamen gibt es noch nicht.
- **C (umgesetzt, Schild-Format unbestätigt):** Angriffszeile in den Stadtinformationen. Eine Zeile unter dem Spieler sagt, ob er angreifbar ist: „Plünderbar noch {Dauer} (bis {Zeit})“, „Stadt geschützt bis {Datum Uhrzeit} (noch {Dauer})“, „Wieder angreifbar in {Dauer} (ab {Zeit})“ oder „angreifbar“. Bei Freunden, Gildenmitgliedern und Nicht-Nachbarn steht der Grund („Freund, nicht angreifbar“). Plünderbar geht vor einem Schild, ein Schild vor dem Zeitgeber. Die Zeitgeber (`canSabotage`, `next_interaction_in`) kommen mit `updatePlayer` und der Nachbarliste, die Schilde aus `OtherPlayerService.getCityProtections` (Format laut alter Toolbox, nicht selbst gesehen, wird bis zur Bestätigung roh in die Konsole geschrieben). Die Box rechnet die Countdowns alle 30 Sekunden neu, solange sie offen ist.

Kämpfe in der PvP-Arena kommen mit dem Arena-Protokoll in Phase 6. Die Notizkarte in der PvP-Box ist mit dem Feature Notizen umgesetzt.

## Features

Je Feature eine Datei mit Umfang, Entscheidungen und Annahmen. Neue Features bekommen hier ihre eigene Datei.

- [Notizen](features/notizen.md): Notizen zu Spielern und Gilden
- [Stadtplan](features/stadtplan.md): Stadtplan der eigenen und besuchten Stadt
- [LG-Rechner](features/lg-rechner.md): Kostenrechner für fremde LGs
- [Eigenanteil](features/eigenanteil.md): Eigenanteilsrechner für eigene LGs
- [Powerleveln](features/powerleveln.md): Eigenanteil über mehrere Stufen eines eigenen LGs
- [Snipehilfe](features/snipehilfe.md): lohnende Plätze aus der LG-Liste eines Spielers
- [Investitionen](features/investitionen.md): eigene Einzahlungen, Suche über alle bekannten fremden LGs, gemerkte LGs und Spieler
- [foestats](features/foestats.md): Links, täglicher Verlauf, Aktivität

## Feature-Checkliste

Stand der FoE Toolbox. Module, die im Fundament aufgehen, stehen getrennt.

**Gehen im Fundament auf:** `_main`, `_helper`, `_languages`, `_menu` mit drei Layouts, `popup`, `settings`, `indexdb`, `toolbox-indexdb`, `toolbox-main`, `toolbox-menu`, `srcLinks`, `mouseActions`, `customTooltip`, `closebox`, `dbexport`, `fh-compat`.

| Bereich | Feature | Altes Modul | Phase |
|---|---|---|---|
| Toolbox | Plünderhilfe / Stadtinformationen | sabotage | 1 |
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
| Stadt | Markierungspfeile | building-marker | 3 |
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

- Die Architektur trägt, kein Helfer im Seitenkontext nötig außer dem Proxy.
- Styles werden per Shadow DOM gekapselt.
- Gebaut wird mit esbuild (ein Bundle je Einstiegspunkt, kein Dev-Server nötig). TypeScript prüft getrennt mit `tsc --noEmit`.
- Rendern darf nicht am `requestAnimationFrame` des Spielfensters hängen. Ist der Spiel-Tab im Hintergrund, drosselt Chrome ihn, und ein offenes Pop-out würde nicht mehr aktualisiert. Das Fundament plant Renders über das Fenster, in dem die Box gerade steckt (noch nicht getestet).
- Schreiben in die DB immer gesammelt, nicht Zeile für Zeile per Nachricht.
- `postMessage` sieht auch das Spiel. Der Proxy liest ohnehin im Seitenkontext mit, daraus entsteht kein neues Risiko. Fremde Seitenskripte könnten aber Nachrichten fälschen, Handler und `game/convert.ts` müssen Eingaben prüfen.
- Aufnahmen enthalten private Spieldaten. Fixtures werden vor dem Commit auf das Nötige gekürzt und anonymisiert.

## Offene Punkte

Derzeit keine.
