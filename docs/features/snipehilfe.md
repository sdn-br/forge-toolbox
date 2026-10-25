# Snipehilfe

Stand 2026-10-24. Altes Modul `calculator-overview` („Mögliche Investitionen“), hier nur als Idee übernommen. Die alte Toolbox ließ in manchen Fällen „???“ stehen, obwohl das LG geöffnet war, ihre Rechnung und Aktualisierung gelten deshalb nicht als Vorlage (Nutzer, 2026-10-24). Rechnung und Zuordnung bauen auf dem [LG-Rechner](lg-rechner.md) auf. Datenmodell: [Great Buildings](../datenmodell/great-buildings.md).

**Zweck:** Klickt der Spieler auf das LG-Symbol eines anderen Spielers, zeigt das Spiel dessen LG-Liste. Die Snipehilfe sagt dazu, bei welchen dieser LGs sich ein Platz lohnen könnte, ohne dass der Spieler jedes einzelne öffnen muss.

## Box

- **Eine Box, beide Bereiche untereinander** (Nutzer, 2026-10-24, ersetzt die zwei Reiter): oben „Mögliche Einzahlungen“, darunter der LG-Rechner mit dem zuletzt geöffneten LG, getrennt durch eine Linie. Skizze: Variante 1 der Layout-Vorschau vom 2026-10-24.
- Der obere Bereich ist einklappbar. Zugeklappt bleibt eine Zeile: „Mögliche Einzahlungen: 3 mit Gewinn, bester Zeusstatue +310 (Manwe-Olaf, vor 3 Min.)“, ein Klick klappt auf. Eine neue LG-Liste klappt ihn auf und ersetzt die vorige. Ein geöffnetes LG klappt ihn zu, außer es gehört dem Spieler der Liste, dann bleibt er offen (Nutzer, 2026-10-24). Sonst klappt nur der Spieler. Ohne Liste fehlt der Bereich ganz.
- **Der LG-Rechner ist ebenfalls einklappbar** (Nutzer, 2026-10-25), gleich gebaut wie der obere Bereich (gemeinsame Zeile `src/content/ui/fold-toggle.ts`, gleiche Optik, gleicher Klick). Zugeklappt bleibt eine Zeile: „LG-Rechner: Zeusstatue, Stufe 52 (Manwe-Olaf)“ mit Name, laufender Stufe und Eigentümer des gezeigten LGs, ein Klick klappt auf. Eine neue LG-Liste klappt ihn zu. Ein geöffnetes LG klappt ihn auf, gleich wem es gehört, die Regel des oberen Bereichs bleibt davon unberührt. Sonst klappt nur der Spieler. Der Zustand liegt im Speicher wie der des oberen Bereichs und wird nicht gespeichert. Solange kein LG gezeigt wird (oder nur der Eigentümer ohne Stufe bekannt ist), bleibt der Hinweistext des Rechners ohne Zeile zum Einklappen. Immer bleibt ein Bereich offen (Nutzer, 2026-10-25): Klappt man den letzten offenen Bereich zu, klappt der andere auf. Beide offen geht. Ein Bereich lässt sich nur zuklappen, wenn der andere etwas zeigt: Ohne Liste hat der Rechner keine Klappzeile, und solange der Rechner noch kein fremdes LG zeigt, steht über der Snipehilfe nur ihre Überschrift ohne Pfeil.
- **Größe:** nicht von Hand verstellbar, feste Breite, Höhe nach Inhalt (siehe Konzept, UI-Kit „Verstellbar nur, wo es hilft“).
- **Lange Listen** (Nutzer, 2026-10-24): Der LG-Rechner wird immer ganz angezeigt, nie weggescrollt. Gescrollt wird nur die Tabelle der möglichen Einzahlungen: höchstens 6 Zeilen sichtbar, der Tabellenkopf bleibt stehen. Scrollen mit dem Mausrad über der Tabelle oder mit zwei Knöpfen rechts neben der Tabelle, Pfeil hoch oben und Pfeil runter unten (Icons `chevronUp`/`chevronDown`), je Klick eine Zeile, ausgegraut am Anfang oder Ende. Unter der Tabelle steht, was verborgen ist, etwa „noch 4 weitere unten“ oder „2 oben · 4 unten“. Die Kopfzeile mit Überschrift und Spieler scrollt nicht mit.
- Der Eigenanteil wird später neu überlegt, er gehört zu eigenen LGs und läuft nie gleichzeitig mit den anderen.
- **Automatisch öffnen:** Einstellung „Snipehilfe beim Öffnen einer LG-Liste zeigen“, Standard an. Die Box öffnet sich nur, wenn die Liste mindestens einen Treffer hat. Ist sie schon offen, klappt sie den Bereich auch ohne Treffer auf.
- **Ton:** eigene Einstellung „Ton bei LGs mit Gewinn in der Snipehilfe“, Standard an, derselbe WebAudio-Ton wie im LG-Rechner. Er spielt nur, wenn eine neue LG-Liste eintrifft, sie mindestens einen Treffer hat und sich die Treffer vom letzten Ton unterscheiden (Spieler und je Treffer LG, Stufe, bester Platz, Einsatz). Dieselbe Liste mit unveränderten Treffern piept nicht, eine Zeile, die beim Öffnen eines LGs exakt wird, auch nicht (Nutzer, 2026-10-24).
- Die eigene LG-Liste wird übergangen.
- **Liste, die das Spiel selbst abfragt** (Nutzer, 2026-10-24, im Spiel noch zu erleben): Nach einem Level-up fragt das Spiel von sich aus die Liste des Eigentümers ab. Eine Liste desselben Spielers, die weniger als 3 Sekunden nach dem Öffnen oder einer Einzahlung in einem seiner LGs kommt, wird gespeichert, klappt nichts auf und piept nicht. Ein echtes Erkennungsmerkmal gibt es nicht, die Anfrage sieht gleich aus.
- Die Einstellungen stehen beim Modul LG-Rechner im Abschnitt „Snipehilfe“.

## Bereich „Mögliche Einzahlungen“

- Kopf: Überschrift „Mögliche Einzahlungen“, darunter der Spieler wie im LG-Rechner: „Eigentümer: Name“ mit Link zu foestats und der Aktivitätszeile aus foestats, dann „Stand: vor X Minuten“ (Zeit der Liste) (Nutzer, 2026-10-24). Die Liste gehört immer zu genau diesem Spieler. Öffnet der Spieler danach ein LG eines anderen Spielers, bleibt die Liste unverändert (Nutzer, 2026-10-24).
- **Nur LGs mit Gewinn** (Nutzer, 2026-10-24): eine Zeile je LG mit möglichem Gewinn (im Code „Treffer“, sichtbar „mit Gewinn“ seit 2026-10-25), sortiert nach Gewinn, der beste oben. Ein Klick auf einen Spaltenkopf sortiert nach dieser Spalte, Umschalt+Klick hängt weitere Sortierstufen an (siehe `docs/konzept.md`, Tabelle).
- Spalten: # (Platz in der Liste des Spiels, zum Sortieren nach der Reihenfolge des Spiels, Nutzer 2026-10-24), LG (Name), Stufe, Fortschritt (eingezahlt / Kosten der Stufe), Platz (der beste lohnende), Einsatz (Sichern dieses Platzes), Gewinn, Stufe der Sicherheit als Icon mit Tooltip. Platz und Einsatz sind die des besten Falls, der Platz im schlechtesten Fall steht im Tooltip der Zeile.
- Auch Sicherheit und Merken sind sortierbar (Nutzer, 2026-10-25), die beste Stufe bzw. die gemerkten zuerst, wie in „Mögliche Investitionen“. Beide Spalten sind dafür 38 px breit, die Box 602 px. Bis dahin hielt eine CSS-Grenze alle Boxen ohne Griff auf 520 px, die Verbreiterungen auf 546, 570 und 594 px wirkten nie, und jede neue Spalte nahm dem LG-Namen Platz, bis er ganz verschwand (Nutzer, 2026-10-25). Die Grenze ist entfernt, die Box hat ihre eingestellte Breite, nur das Fenster begrenzt sie.
- **Drei Stufen** (Nutzer, 2026-10-24):
  - exakt (grün, Haken): die Rangliste ist bekannt und so aktuell wie die Liste. Gewinn und Einsatz sind eine Zahl.
  - sicher (grün, gedämpft): auch im schlechtesten Fall lohnt ein Platz. Gewinn als Spanne „+40 … +310“.
  - möglich (gelb): nur im besten Fall lohnt ein Platz. Gewinn als Spanne von min(0, bester Fall) bis zum besten Fall.
  - Icons (2026-10-24, Abnahme im Spiel offen): Haken für exakt, Haken im Kreis für sicher, Fragezeichen im Kreis für möglich.
- Unter der Tabelle: Anzahl der LGs ohne Gewinn („ohne Gewinn: 3“), LGs mit eigener Einzahlung (sie fehlen in der Liste, dafür sind die [Investitionen](investitionen.md) da), LGs mit unbekannter Belohnung.
- Ein LG mit 0 eingezahlten FP kann gesperrt sein (nicht verbunden oder auf der freigeschalteten Höchststufe), die Liste sagt das nicht. Die Zeile trägt dann den Tooltip „eventuell gesperrt“.
- **Ausrichtung und Breiten** (Nutzer, 2026-10-25): # und Stern stehen linksbündig, # ist 32 px breit (gemessen „# ▾2“ 31 px, „999“ 31 px). Fortschritt ist 96 px breit (gemessen „8.371 / 11.122“ 83 px, Kopf mit „▾2“ 88 px), Sicherheit 32 px (Icon, Pfeil und Nummer 29 px), so hat der LG-Name 144 px statt 122 px. In die 64 px der Spalte Gewinn passen gemessen „+99.999“ (57 px) und „≈ +9.999“ (61 px), „≈ +99.999“ (68 px) nicht mehr.
- **Gewinn als bester Fall** (Nutzer, 2026-10-25): Die Spalte Gewinn zeigt immer das Maximum, der Tooltip der Zelle die Spanne („Gewinn +45 bis +285“), bei exaktem Gewinn entfällt sie. Wie belastbar die Zahl ist, sagt die Spalte Sicherheit daneben. Sortiert wird weiter nach dem besten Fall. Die Spalte ist dafür 64 px statt 112 px breit, den Platz bekommt der LG-Name. Gleich in „Mögliche Investitionen“.
- **Fortschritt wie in den Investitionen** (Nutzer, 2026-10-25): „x / y“ mit dem dünnen Balken darunter, der Tooltip „Fehlt bis zum Level-up: 17 von 924 FP“ statt „x % der Stufe sind eingezahlt“. Eine Zelle für alle drei Tabellen (`progressCell` in `ui/fp-bar.ts`).
- **Eigenanteil des Eigentümers** (Nutzer, 2026-10-25): Der Tooltip von Fortschritt nennt unter dem Rest bis zum Level-up, was der Eigentümer in die Stufe eingezahlt hat, etwa „Eigenanteil: 320 FP“. Zuerst stand die Zeile als „Eigentümer: 320 FP“ im Zeilentooltip, der Nutzer erwartet sie aber beim Fortschritt und mit dem Wort Eigenanteil. Gelesen wird die Zeile des Eigentümers aus der gespeicherten Rangliste (`ownerShare` in `gb-snipe.ts`, dieselbe Funktion wie die Spalte EA der [Investitionen](investitionen.md)). Ist die Summe der Einzahlungen seit der Rangliste gewachsen, steht das Alter dabei: „Eigenanteil: 320 FP, Stand vor 2 T.“. Ohne Rangliste der aktuellen Stufe entfällt die Zeile. Eine eigene Spalte und eine Summe im Kopf der Liste gibt es nicht. In „Mögliche Investitionen“ zeigt die Spalte EA den Wert, dort steht er in keinem Tooltip.
- **LG-Name im Tooltip** (Nutzer, 2026-10-25): Der Name wird in der schmalen Spalte oft gekürzt. Der Tooltip über dem Namen nennt ihn deshalb ganz, darunter die Hinweise des Zeilentooltips, damit über dem Namen nichts fehlt. Gleich in „Mögliche Investitionen“.
- **Merken:** Stern je Zeile (LG) und im Kopf (Spieler). Gemerktes findet der Reiter „Mögliche Investitionen“ der [Investitionen](investitionen.md#merken) über alle Spieler wieder.
- Die Liste veraltet: Sie zeigt den Stand beim Anklicken. Spätere Einzahlungen sieht die Toolbox nur bei einem LG, das der Spieler öffnet.

## Rechnung

Je LG der Liste: Stufe, eingezahlte FP (`current_progress`, fehlt bei 0) und Kosten der Stufe (`max_progress`). Wer welchen Platz hält, nennt die Liste nicht, und eigene Anfragen ans Spiel sind ausgeschlossen. Belohnungen der fünf Plätze kommen wie in der Stufenvorschau aus der P1-Tabelle (`emptyLevel`), mit dem Arche-Bonus. Gerechnet wird immer mit `calculateConstruction` auf einer angenommenen Rangliste, so gelten dieselben Regeln wie im LG-Rechner (Sichern, Gleichstand, Gewinn). Ein Platz lohnt nur mit Gewinn ≥ 0, also gemessen am eigenen Arche-Bonus. Beim Durchklicken interessiert, wo es Gewinn gibt. Fördern zu einem Faktor ist Sache des LG-Rechners, der Faktor spielt hier keine Rolle (Nutzer, 2026-10-25). Bis dahin galt die Regel der Zeile „Du:“ (Gewinn ≥ 0 oder Sichern nicht über Belohnung mal Förderfaktor), mit Faktor 2 über dem eigenen Arche-Bonus erschienen so Plätze mit Verlust als Treffer.

- **Ohne bekannte Rangliste:** Die eingezahlten FP verraten, wie stark der stärkste Inhaber höchstens ist: nie mehr als alle zusammen. Bester Fall: die Rangliste ist leer, die FP stammen vom Eigentümer. Schlechtester Fall: ein einziger Spieler hält alle eingezahlten FP. Der Gewinn ist der des besten lohnenden Platzes, je Fall gerechnet.
- **Mit bekannter Rangliste derselben Stufe:** Ist die Summe gleich, ist die Rangliste aktuell und die Zeile exakt. Ist die Liste neuer und die Summe um Δ größer, sind Δ FP unbekannt eingezahlt worden. Bester Fall: Δ kam vom Eigentümer, die Rangliste gilt. Schlechtester Fall: Δ landete beim stärksten Inhaber (Beispiel: gestern 400 auf P1 bei 1.000 gesamt, heute 1.300, dann hält P1 zwischen 400 und 700).
- **Rangliste einer anderen Stufe:** wertlos, es gilt die Rechnung ohne Rangliste.
- Sicher heißt, der schlechteste Fall lohnt. Möglich heißt, nur der beste. Lohnt keiner, fehlt die Zeile.
- Belohnungen über das Ende der Tabelle hinaus sind geschätzt (≈ im Tooltip). Ist die Belohnung unbekannt, fehlt die Zeile und zählt unter der Tabelle mit.

## Ideen (nicht geplant)

Vom Nutzer genannt, 2026-10-25, ohne Zusage:

- Am Spieler merken: „Mögliche Einzahlungen nicht anzeigen“, damit die Box etwa bei bestimmten Spielern nicht aufgeht.
- Einstellung „Gildenmitglieder ignorieren“, damit sie beim Durchklicken der Gilde nicht ständig aufgeht.
- Am Spieler den vereinbarten Förderfaktor merken. Eher nischig, meist fördert man in Gruppen mit festen Faktoren.

## Aktualisierung

- Zuordnung immer über Spieler-ID und Gebäude-ID (`entity_id` der Liste, Entity-ID des geöffneten LGs). Namen dienen nur der Anzeige.
- **Öffnet der Spieler ein LG des Spielers der Liste**, aktualisiert sein Stand die Zeile, wenn die Liste älter ist (Nutzer, 2026-10-24). Die Zeile wird exakt. Ebenso nach einer Einzahlung oder einem Level-Up in diesem LG.
- **Öffnet der Spieler die Liste nach einem LG**, nutzt die Liste den gespeicherten Stand (siehe Rechnung).
- Welcher Stand neuer ist, entscheidet der Zeitpunkt. Stufe und Summe nimmt die Rechnung aus der neueren Quelle, die einzelnen Einzahlungen nur aus der Rangliste.

## Speicher

Die Tabelle `greatBuildings` hält je fremdem LG den letzten Stand, auch aus Listen, siehe [Great Buildings](../datenmodell/great-buildings.md#bekannte-fremde-lgs). Aufbewahrung: Einstellung „Fremde LGs aufbewahren (Tage)“, Standard 30, frei einstellbar (Nutzer, 2026-10-24). Einträge, die länger nicht gesehen wurden, löscht die Toolbox beim Start. LGs mit eigener Einzahlung löscht sie nie (Nutzer, 2026-10-24), sie bleiben für die späteren Investitionen. Sie verschwinden, wenn die Liste „Legendäre Bauwerke“ im Rathaus sie nicht mehr führt (Nutzer, 2026-10-24, siehe Datenmodell).

## Testfälle

Eine Aufnahme mit LG-Liste, zwei, drei geöffneten LGs daraus, Wechsel zurück zur Liste und wenn möglich einer Einzahlung macht der Nutzer. Bis dahin reicht `test/fixtures/gb-level-up.json` (enthält eine Liste `getOtherPlayerOverview`) und `test/fixtures/great-buildings.json`.
