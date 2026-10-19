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
│ Proxy        │ ─────────────► │ Ingestion ─► Parser ─► Stores ─► Bus     │   │ Storage      │
│ (XHR, WS)    │                │                        │        │        │◄─►│ (IndexedDB)  │
└──────────────┘                │                        ▼        ▼        │   │ Alarme       │
                                │                     Features (Plugins)   │   │ Notifications│
                                │                        │                 │   └──────────────┘
                                │                     UI-Kit ─► DOM der Spielseite
                                └─────────────────────────────────────────┘
```

### Shell

- Manifest V3, TypeScript mit Build.
- Nur der Proxy läuft im Seitenkontext, weil er XHR und WebSocket vor dem Spielcode patchen muss. Er reicht Nachrichten an das Content Script weiter.
- Alles andere läuft im Content Script. Es teilt das DOM mit der Spielseite, aber keine JS-Globals. Kollisionen mit Spiel oder Helfer entfallen.
- Der Service Worker hält Speicher, Alarme und Notifications.
- Fester `key` im Manifest, damit die Extension-ID stabil bleibt. Eigene ID, damit Forge Toolbox parallel zur FoE Toolbox laufen kann.

### Ingestion

- Der Proxy liefert jede Spielantwort als Nachricht `(service, method, payload, request)`.
- Pro Service gibt es genau einen Parser. Er übersetzt das Spielformat in das eigene Datenmodell und gibt es an den zuständigen Store. Features sehen das Spielformat nie.
- Pufferung wie bei FoEproxy: Antworten vor dem Start (etwa `StartupService.getData`) gehen nicht verloren.
- Der Proxy kann Antworten aufzeichnen. Die Aufnahmen sind Testdaten (siehe Tests).

### Domain-Stores

- Ein Store je Bereich, etwa Player, City, GreatBuildings, Resources, Inventory, Guild, GuildBattleground. Weitere Stores entstehen, wenn ein Feature sie braucht.
- Ein Store besitzt seinen Zustand und seine Persistenz allein. Nur er ändert ihn. Andere lesen über Abfragen oder abonnieren Änderungen.
- Der laufende Zustand liegt im Speicher des Content Scripts. Lesen ist ein direkter Zugriff ohne DB.
- Was persistiert wird, schreibt der Store im Hintergrund. Niemand wartet darauf.
- Daten, die das Spiel bei jedem Start frisch schickt (Stadtplan, Ressourcen, Inventar), leben nur im Speicher.

Beispiel Stadtbesuch: Das Spiel schickt `visitPlayer`. Der Parser aktualisiert den PlayerStore. Der Store meldet `player.updated {id}`. Sabotage liest den Spieler aus dem Store und zeichnet die Box. Parallel schreibt der Store den Spieler in die DB.

### Event-Bus

- Typisierte Events mit Payload, etwa `player.updated {id}` oder `city.changed {playerId}`. Jeder Vertrag ist ein TypeScript-Typ.
- Stores senden Domain-Events. Features senden keine Events an andere Features, sie kennen sich nicht.
- Zusätzlich Lebenszyklus-Events der Shell (bereit, Spieler bekannt, Welt gewechselt).

### Features als Plugins

- Ein Feature meldet sich bei der Shell an: Menüknopf, Boxen, Settings, Event-Abos.
- Es hängt nur von Stores, Bus und UI-Kit ab, nie von einem anderen Feature.
- Aufbau je Feature: Datenteil liefert ein ViewModel, View ist eine reine lit-html-Funktion, die Box rendert das Ergebnis.

### UI-Kit

- **Box:** Fenster mit Titel, Ziehen, Größe, Minimieren, Fixieren, Pop-out, gemerkter Position.
- **Tabelle:** sortieren, filtern, exportieren.
- **Tooltip:** ein Mechanismus für alle Features.
- **Chart:** kapselt ECharts mit Lazy-Load, Theme, Resize, Export als PNG und CSV. Bekommt ein eigenes Datenformat für Serien, nicht ECharts-Optionen. Lässt sich in jede View einbetten, so muss kein Feature Chart-Code wiederholen.
- **Menü:** Leiste mit den Knöpfen der angemeldeten Features, sortierbar, einzeln ausblendbar.
- Styles so gekapselt, dass Spiel-CSS und Toolbox-CSS sich nicht beeinflussen (zu prüfen: Shadow DOM).

### Settings

- Jede Einstellung hat ein Schema mit Typ und Default, angemeldet vom Feature.
- Gespeichert in `chrome.storage`, nicht im localStorage der Spielseite.
- Double-Opt-In für Einstellungen, die Daten nach außen senden.

### Sprache

- Oberfläche zunächst nur Deutsch, wie die FoE Toolbox. Texte trotzdem über Schlüssel, damit weitere Sprachen möglich bleiben.

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

## Tests

Jedes Feature durchläuft zwei Stufen:

1. **Automatisch:** Aufgezeichnete Spielantworten sind Fixtures für Parser, Stores und ViewModels. Die Tests laufen ohne Spiel.
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
- **B:** Plünderung, Abwehr, Double Loot, FP-Summen. Braucht eine Aufnahme einer Plünderung.
- **C:** Schilde. Braucht eine Aufnahme.

Kämpfe in der PvP-Arena kommen mit dem Arena-Protokoll in Phase 6. Die Notizkarte in der Box kommt mit dem Feature Notizen.

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
- `postMessage` sieht auch das Spiel. Der Proxy liest ohnehin im Seitenkontext mit, daraus entsteht kein neues Risiko. Fremde Seitenskripte könnten aber Nachrichten fälschen, Parser müssen Eingaben prüfen.
- Aufnahmen enthalten private Spieldaten. Fixtures werden vor dem Commit auf das Nötige gekürzt und anonymisiert.

## Offene Punkte

Derzeit keine.
