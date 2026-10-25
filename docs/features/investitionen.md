# Investitionen

Stand 2026-10-24. Altes Modul `investment`, hier nur als Idee übernommen. Rechnung wie im [LG-Rechner](lg-rechner.md) und in der [Snipehilfe](snipehilfe.md). Datenmodell: [Great Buildings](../datenmodell/great-buildings.md), [Player](../datenmodell/player.md).

**Zweck:** zeigen, wo die eigenen FP stecken und was sie bringen, und fremde LGs über alle bekannten Spieler durchsuchen, ohne 80 Spieler durchzuklicken. Gemerkte LGs und Spieler ergeben eine kurze Runde für wenig Zeit (Nutzer, 2026-10-24).

## Box

- Eigene Box „Investitionen“ mit zwei Reitern: „Meine Investitionen“ und „Mögliche Investitionen“ (Nutzer, 2026-10-24). Die Snipehilfe bleibt beim LG-Rechner, dort bleibt der schnelle Ablauf beim Snipen (Liste öffnen, LG öffnen, genauer Wert) in einer Box.
- Öffnen über das Menü. Öffnet der Spieler im Rathaus die Liste „Legendäre Bauwerke“, geht die Box auf dem Reiter „Meine Investitionen“ auf. Einstellung „Investitionen beim Öffnen der Rathausliste zeigen“, Standard an (Vorschlag, im PR abzunehmen).
- Größe: Höhe verstellbar, die Listen können lang werden (siehe Konzept, UI-Kit „Verstellbar nur, wo es hilft“).

## Reiter „Meine Investitionen“

Quelle: `GreatBuildingsService.getContributions` (Rathausliste), dazu jedes geöffnete LG und jede eigene Einzahlung. Eine Zeile je LG mit eigener Einzahlung (`ownContribution`).

- **Kopf:** „Stand: vor X Minuten“, die Zeit der letzten Rathausliste. Eine feste Warnung nach 30 Minuten wie in der alten Toolbox gibt es nicht.
- **Spalten:** Eigentümer (Link zu foestats), LG, Stufe, Platz, Einzahlung, Gewinn, Status, Fortschritt. Blaupausen und Medaillen bleiben vorerst ausgeblendet wie im LG-Rechner.
- **Gewinn:** Belohnung des Platzes brutto mit dem eigenen Arche-Bonus minus eigene Einzahlung. Die Belohnung der Rathausliste (`reward.strategy_point_amount`) ist netto, wie in der Rangliste.
- **Status** (Nutzer, 2026-10-24):
  - **sicher** oder **unsicher**: Es gibt eine gespeicherte Rangliste derselben Stufe, deren Summe zum Fortschritt passt. Entschieden wird mit der Regel „Eigener Platz“ des LG-Rechners.
  - **sicher ohne Rangliste:** eigene Einzahlung ≥ (Summe aller Einzahlungen minus eigene Einzahlung) + Rest. Niemand hinter dem Spieler kann mehr halten als alle anderen zusammen, also überholt ihn keiner.
  - **?** (unbekannt): sonst. Ein Öffnen des LGs macht daraus eine genaue Aussage.
  - Die alte Toolbox nannte einen Platz sicher, sobald die eigene Einzahlung den Rest erreichte. Das übersieht die Einzahlungen der Spieler dahinter (100 FP auf Platz 1, Platz 2 hält 90, Rest 50: Platz 2 kommt auf 140). Ihre Regel gilt deshalb nicht als Vorlage.
- **Fortschritt** (Nutzer, 2026-10-25, wie in der alten Toolbox): „eingezahlt / Kosten der Stufe“, darunter ein dünner Balken in der Akzentfarbe. Der Rest bis zum Level-up steht im Tooltip, eine eigene Spalte Rest entfällt. Die Box ist dafür 560 px breit (seit dem Reiter „Mögliche Investitionen“ 640 px, seit der Erreichbarkeit 710 px, siehe dort).
- **Zuwachs:** Ist der Fortschritt eines LGs gewachsen, zahlt dort jemand ein. Die Zeile ist hervorgehoben, „+X“ steht in der Zelle Fortschritt unter dem Balken. Gezählt wird ab dem letzten Öffnen des LGs, bei einem nie geöffneten LG ab der ersten Rathausliste, in der es stand (Nutzer, 2026-10-25). Die Hervorhebung bleibt, bis der Spieler das LG öffnet.
- **Fußzeile:** FP im Umlauf (Summe der eigenen Einzahlungen), Gewinn „sicher“ (nur Zeilen mit Status sicher) und „gesamt“ (alle Zeilen). Eine Einstellung dafür entfällt.
- **Sortierung:** Standard nach Zuwachs, dann nach Rest aufsteigend (was bald levelt, steht oben). Der Spaltenkopf Fortschritt sortiert ebenso nach dem Rest. Ein Klick auf einen Spaltenkopf sortiert nach dieser Spalte, Umschalt+Klick hängt weitere Sortierstufen an (siehe `docs/konzept.md`, Tabelle).
- **Umsetzung (erster Schnitt, 2026-10-24):**
  - Status als Icon mit dem Wort im Tooltip: sicher Haken im Kreis, unsicher Warndreieck, unbekannt Fragezeichen im Kreis. Der Spaltenkopf ist ein Info-Icon („Status“ im Tooltip), damit Eigentümer und LG Platz behalten.
  - Die Zeile mit Zuwachs ist gelb hinterlegt (Ton der Level-Warnung im LG-Rechner). Jede eigene Einzahlung passiert im offenen LG und setzt den Ausgangswert neu.
  - „Stand“: Die Zeit der letzten Rathausliste steht je Welt in der Datenbank bei den LG-Daten (Tabelle `greatBuildingLists`), so steht sie auch nach einem Neuladen und gehört zu einer späteren Sicherung (Nutzer, 2026-10-24). Ohne Rathausliste steht dort die Bitte, sie zu öffnen.
  - Eigentümernamen: aus dem Player-Store, sonst aus der letzten Rathausliste (nur im Speicher), sonst die ID.
  - Status mit Rangliste: rechnet auch bei einem LG auf Höchststufe oder ohne Verbindung mit der Regel „Eigener Platz“, denn der LG-Rechner zeigt dort keine Plätze.
- **Nicht übernommen (YAGNI):** Ausblenden einzelner LGs, Eintragsdatum, Zuwachsdatum als eigene Spalte, Verlauf der Zuwächse.

## Reiter „Mögliche Investitionen“

Quelle: alle bekannten fremden LGs der Tabelle `greatBuildings`, ohne eigene Beteiligung. Gerechnet wird wie in der Snipehilfe (drei Stufen exakt, sicher, möglich, siehe dort), nur über alle Spieler statt über eine Liste.

- **Spalten:** Merken (Stern), Eigentümer, Erreichbar, LG, Stufe, Fortschritt, EA (Eigenanteil des Eigentümers), Platz, Einsatz, Gewinn, Stufe der Sicherheit, Stand (Alter des Eintrags).
- **Filter:** Spieler (Teil des Namens), LG (Teil des Namens), nur gemerkte (LG gemerkt oder Eigentümer gemerkt), „nur mit Gewinn“ (Standard an, hieß bis 2026-10-25 „nur Treffer“, Nutzer: „Treffer“ versteht man nicht direkt), Beziehung (vier Schalter Nachbar, Freund, Gilde, nicht erreichbar, Standard die ersten drei an), Sicherheit (drei Schalter exakt, sicher, möglich, Standard alle an).
- **Sortierung:** Standard nach Gewinn, der beste oben.
- Der Reiter zeigt den letzten gesehenen Stand. Ob ein gemerktes LG inzwischen reif ist, weiß die Toolbox erst, wenn der Spieler es oder die LG-Liste des Eigentümers öffnet, denn sie fragt nichts im Hintergrund ab. Der Reiter sagt also, wo es sich lohnt vorbeizuschauen.
- **Umsetzung (erster Schnitt, 2026-10-25):** ohne Merken. Die Erreichbarkeit kam danach, siehe [Erreichbarkeit](#erreichbarkeit), das Merken ebenso, siehe [Merken](#merken).
  - Zeilen: alle LGs der Tabelle `greatBuildings` der aktuellen Welt ohne eigene LGs und ohne eigene Einzahlung. Gerechnet wird je LG mit derselben Funktion wie in der Snipehilfe (`snipeBuilding`), also auch mit der gespeicherten Rangliste, wenn sie zur Stufe passt. Ein Treffer braucht Gewinn ≥ 0 mit dem eigenen Arche-Bonus, wie in der Snipehilfe, der Faktor des LG-Rechners zählt nicht.
  - Spalten: Eigentümer (Link zu foestats), LG, Stufe, Fortschritt (wie bei „Meine Investitionen“: „x / y“ mit dünnem Balken, Rest im Tooltip), Platz, Einsatz, Gewinn (Zahl oder Spanne, ≈ bei geschätzter Belohnung), Sicherheit (Icon wie in der Snipehilfe, der Spaltenkopf ein Info-Icon mit dem Wort im Tooltip), Stand. Der Zeilentooltip nennt wie in der Snipehilfe den Platz im schlechtesten Fall und „eventuell gesperrt“.
  - Eigentümernamen: aus dem Player-Store, sonst aus der Rathausliste oder der zuletzt geöffneten LG-Liste des Spielers (nur im Speicher, gilt jetzt für beide Reiter), sonst die ID.
  - Stand: Alter des Eintrags nur in der größten Einheit („vor 3 Std.“, „vor 2 T.“), damit die Spalte schmal bleibt.
  - Filter über der Tabelle: Spieler und LG (Teil des Namens, Groß- und Kleinschreibung egal), „nur mit Gewinn“ (Standard an). Ohne „nur mit Gewinn“ stehen LGs ohne lohnenden Platz und LGs mit unbekannter Belohnung mit leeren Zellen Platz, Einsatz, Gewinn und Sicherheit da, bei jeder Sortierung nach diesen Spalten unten.
  - Unter der Tabelle: „12 mit Gewinn von 85 LGs“, gezählt über die LGs, die die Filter Spieler und LG übrig lassen (seit der Erreichbarkeit auch der Filter nach Beziehung). Ohne bekanntes fremdes LG steht dort ein Hinweis, dass sich der Reiter mit geöffneten LG-Listen anderer Spieler füllt.
  - Sortierung: Standard nach Gewinn im besten Fall, der beste oben (wie in der Snipehilfe). Ein Klick auf einen Spaltenkopf sortiert nach dieser Spalte, Namen von oben, Zahlen, Sicherheit und Stand vom größten bzw. besten oder neuesten. Umschalt+Klick hängt weitere Stufen an, unbekannte Werte stehen in jeder Stufe zuletzt.
  - Gemerkt (als Ansichtswahl wie der Modus der Karten): der gewählte Reiter und die Filter. Kommt die Rathausliste, geht die Box weiter auf „Meine Investitionen“ auf. Die Sortierung gilt nur bis zum Neuladen, wie bei „Meine Investitionen“.
  - Spieler aus der Zeile filtern (2026-10-25, Nutzer): hinter dem Eigentümernamen steht ein kleines Filter-Icon, sichtbar nur bei Maus über der Zeile oder Fokus in der Zeile (CSS `:hover` und `:focus-within`, der Knopf bleibt fokussierbar). Tooltip und `aria-label` „Nur diesen Spieler zeigen“. Ein Klick schreibt den Namen in den Textfilter „Spieler“, wie getippt, es gibt keinen zweiten Filterweg. Der Name bleibt der Link zu foestats. Der Knopf hat im Ruhezustand die Breite 0, damit der Name nicht gekürzt wird, und nimmt bei Hover oder Fokus 16 px, erst dann wird ein langer Name etwas kürzer.
  - Das Icon des Knopfes ist ein Trichter (`funnel`, aus der Icon-Vorschau gewählt, Nutzer, 2026-10-25).
  - Lange Listen scrollen in der Box, der Tabellenkopf bleibt stehen. Keine Pfeilknöpfe wie in der Snipehilfe.
  - Aktualisierung: bei jeder LG-Liste eines anderen Spielers, jedem geöffneten oder geänderten LG, der Rathausliste, neuen Spieldaten (Belohnungen), und einem geänderten Arche-Bonus. Nur die LG-Daten (Listen, Rathausliste, Öffnen, Änderung) liest die Box neu aus der Datenbank, und nur solange sie offen ist. Kommen dabei mehrere Anlässe kurz hintereinander, wie beim Öffnen eines LGs, liest sie einmal und danach höchstens ein weiteres Mal. Belohnungen und Arche-Bonus bewerten den zuletzt gelesenen Stand neu. Die Bewertung aller fremden LGs läuft nur, wenn der Reiter „Mögliche Investitionen“ zu sehen ist, und erst wieder, wenn sich Stand, Arche-Bonus oder Belohnungen ändern.
  - Breite: Die Box ist 640 px breit, damit alle neun Spaltenköpfe ganz stehen (seit der Erreichbarkeit 710 px für zehn Spalten). Dabei fiel auf, dass eine Box mit Griff nie breiter als 520 px aufging, solange sie nicht von Hand vergrößert war (die Obergrenze der festen Boxen). Boxen mit Griff haben jetzt ihre eingestellte Breite.

## Merken

- Gemerkt werden LGs und Spieler (Nutzer, 2026-10-24). Ein Stern je LG in der Snipehilfe, im LG-Rechner und in beiden Reitern, ein Stern je Spieler im Kopf der Snipehilfe, im LG-Rechner beim Eigentümer und in den Stadtinformationen.
- Keine Notiz zur Markierung (Nutzer, 2026-10-24: optional denkbar, aber YAGNI). Für Text gibt es die [Notizen](notizen.md).
- Markierungen entfernt nur der Spieler, von Hand (Nutzer, 2026-10-24). Sie verschwinden nicht, wenn ein Spieler die Nachbarschaft, die Freundesliste oder die Gilde verlässt. Nachbarn kommen wieder.
- Gemerkte Spieler sind ein Zustand im Player-Store, nicht in den Investitionen. Andere Features dürfen ihn mitnutzen (Nutzer, 2026-10-24: Spieler zu merken kann über die Investitionen hinaus nützen).
- Gemerkte LGs löscht die Aufbewahrung nach „Fremde LGs aufbewahren (Tage)“ nicht.
- Icon: der vorhandene Stern aus `icons.ts`, Umriss für nicht gemerkt, gefüllt für gemerkt (Nutzer, 2026-10-25). Der Eigenanteil nutzt dafür jetzt einen Pfeil im Uhrzeigersinn, damit der Stern nur eine Bedeutung hat.
- **Umsetzung (2026-10-25), gemerkte LGs:**
  - Gespeichert als Feld `marked` an der Zeile der Tabelle `greatBuildings` (Nutzer, 2026-10-25), nicht indiziert, die Dexie-Version bleibt. Jeder Schreibweg behält es: das Öffnen eines LGs, jede LG-Liste (neuer oder älter als der Eintrag, auch mit neuer Stufe) und die Rathausliste. Steht ein gemerktes LG nicht mehr in der Rathausliste (gelevelt, Belohnung ausgezahlt), löscht sie es nicht wie sonst, sondern lässt es als gewöhnliches fremdes LG ohne eigene Beteiligung und ohne Rangliste stehen.
  - Die Aufbewahrung löscht gemerkte LGs nie. Nimmt der Spieler den Stern weg, gilt sie wieder.
  - Der Store hält die Sterne im Speicher (`isMarked`), gelesen beim Start, und ändert sie nur über `mark`. Das Setzen läuft hinter den offenen Schreibvorgängen, ein eben geöffnetes LG hat dann schon seine Zeile. Ein LG ohne Zeile (ein eigenes) nimmt keinen Stern. Danach meldet der Bus `greatBuilding.marked { owner, entityId, marked }`, und alle offenen Ansichten zeichnen neu.
  - Der Stern steht in der Snipehilfe als letzte Spalte (nach der Sicherheit, die Box ist dafür 546 px breit statt 520 px), im Kopf des LG-Rechners neben dem Titel und als erste Spalte in beiden Reitern. Der Spaltenkopf ist der Stern, „Merken“ steht im Tooltip und im `aria-label`, ein Klick sortiert die gemerkten nach oben. Der Knopf zeigt „Merken“ oder „Nicht mehr merken“ im Tooltip und sagt seinen Zustand mit `aria-pressed`.
  - Filter „nur gemerkte“ in „Mögliche Investitionen“: Standard aus, gemerkt mit den anderen Filtern, die Zählzeile zählt über die LGs, die er übrig lässt. Die Box ist jetzt 740 px breit (vorher 710 px), die Spalte Merken 38 px (vorher 30 px, damit Stern, Pfeil und Stufennummer passen).
- **Umsetzung (2026-10-25), Eigenanteil des Eigentümers (EA):** Nutzer-Entscheidung, nur im Reiter „Mögliche Investitionen“, nicht in „Meine Investitionen“.
  - Quelle ist die gespeicherte Rangliste des fremden LGs (`rankings`, `rankingsLevel`, `rankingsAt`, `rankingsInvested`). Die Zeile des Eigentümers wird über die Spieler-ID erkannt, ersatzweise als die Zeile ohne `rank`. Der Wert ist ihr `forge_points`, fehlen sie, 0.
  - Drei Zustände, abgeleitet von `ownerShare` in `gb-snipe.ts` neben der Snipe-Rechnung (die Snipehilfe nutzt dieselbe Funktion für ihren Tooltip, siehe [Snipehilfe](snipehilfe.md)). Aktuell heißt, die Rangliste gehört zur Stufe des LGs und `rankingsInvested` ist die heutige Summe der Einzahlungen, dann steht die Zahl schlicht da. Veraltet heißt, die Rangliste kennt die Stufe, die Summe ist seitdem gewachsen, dann steht die Zahl gedämpft in der Klasse `muted` (wie unerreichbare Zeilen, keine neue Farbe) und der Tooltip sagt „Stand vor 2 T.“ nach `rankingsAt`. Ohne brauchbare Rangliste der Stufe ist der Wert unbekannt und die Zelle zeigt „?“.
  - Spalte nach Fortschritt, Kopf „EA“, Tooltip und `aria-label` „Eigenanteil des Eigentümers“. Sortierbar wie die anderen Zahlen, größte zuerst, unbekannte stehen in jeder Richtung zuletzt.
  - Die Box ist jetzt 790 px breit (vorher 740 px), die Spalte 50 px. Die Spalten Eigentümer und LG bleiben so breit wie vorher.
- **Umsetzung (2026-10-25), gemerkte Spieler:**
  - Das Feld `marked` am Spieler im Player-Store (`setMarked`), nicht in den Investitionen. Gespeichert wird es mit der Zeile in der Tabelle `players`. Kein Weg über Beziehungen ändert es: `getSocialList`, `acceptInvitation`, `deleteFriend` und die übrigen Quellen behalten es, auch wenn der Spieler in keiner Liste mehr steht. Nur der Spieler nimmt den Stern von Hand weg.
  - Merken kann man nur einen Spieler, den der Player-Store kennt. Bei einem unbekannten Eigentümer (nur aus einer LG-Liste bekannt, siehe [Erreichbarkeit](#erreichbarkeit)) steht kein Stern, denn für ihn gibt es noch keine Zeile, in der er stehen könnte.
  - Der Stern steht im Kopf der Snipehilfe und im Kopf des LG-Rechners hinter dem Namen des Eigentümers und in den Stadtinformationen hinter dem Namen des besuchten Spielers. Eine Änderung meldet `player.updated` mit der Quelle `mark`, so zeichnen alle offenen Ansichten neu.
  - „nur gemerkte“ lässt nun auch die LGs eines gemerkten Eigentümers durch.

## Erreichbarkeit

Einzahlen kann man nur in LGs von Nachbarn, Freunden und Gildenmitgliedern. Die Beziehungen hält der Player-Store (`relations`).

- Jede Zeile zeigt den Grund (Nachbar, Freund, Gilde) oder „nicht erreichbar“. Nicht erreichbare Zeilen stehen gedämpft da und fehlen im Filter „nur erreichbare“. Ein Eigentümer, den der Player-Store nicht kennt, gilt als unbekannt und bleibt im Filter.
- **Aktualisierung:** `getSocialList` setzt alle Beziehungen neu, meist beim Spielstart. Dazu kommen einzelne Meldungen, sobald sie bekannt sind:
  - `FriendService.acceptInvitation` (aufgenommen 2026-10-20): Antwort ist der neue Freund als ganzer Spieler mit `is_friend` und Gilde. Setzt `friend`.
  - `FriendService.deleteFriend` (aufgenommen 2026-10-25): Anfrage `[Spieler-ID]`, Antwort die Spieler-ID als nackte Zahl. Nimmt `friend` weg, im Spiel bestätigt (Nutzer, 2026-10-25).
  - **Später mit dem Guild-Store (Phase 4):** Abgleich der Mitgliederliste aus `ClanService.getOwnClanData`. Wer fehlt, verliert `guildMember`. So bemerkt die alte Toolbox Austritte, also erst beim nächsten Abruf der Liste.
  - **Offen, keine Aufnahme:** der andere beendet die Freundschaft, der Spieler wird aus der Gilde entfernt, der Spieler verlässt selbst die Gilde. Ob das Spiel das live meldet (eigene Methode, Websocket) oder nur über ein neues `getSocialList`, zeigt erst eine Aufnahme. Bis dahin kann eine Zeile bis zum nächsten `getSocialList` falsch als erreichbar stehen.
- **Umsetzung (2026-10-25):**
  - Spalte „Erreichbar“ gleich nach dem Eigentümer. Der Spaltenkopf ist das Personen-Icon, das Wort steht im Tooltip und im `aria-label`, denn ausgeschrieben passt es samt Sortierpfeil nicht in die Spalte.
  - Die Zelle zeigt je Grund ein Icon in fester Reihenfolge Nachbar, Freund, Gilde, nebeneinander bei mehreren. Der Tooltip nennt alle Gründe („Nachbar, Gilde“). Die Icons sind die Motive der Reiter in der Sozialleiste des Spiels, als eigene Strich-Icons nachgezeichnet: Haus mit Nebenhaus, zwei Personen versetzt, ganzer Wappenschild (Nutzer, 2026-10-25). Sortiert wird weiter nach dem ersten Grund.
  - Nicht erreichbar: „nein“ in der Zelle, „nicht erreichbar“ im Tooltip, die ganze Zeile gedämpft (Klasse `muted`, auch Link und Farbe der Sicherheit). Ausgeschrieben passt „nicht erreichbar“ nicht in die Spalte.
  - Unbekannt: „unbekannt“ in der Zelle, nicht gedämpft. Unbekannt ist ein Eigentümer, den der Player-Store nicht kennt, etwa wenn er nur aus einer LG-Liste bekannt ist.
  - Filter nach Beziehung (seit 2026-10-25, Nutzer, ersetzt das Kontrollkästchen „nur erreichbare“): vier Icon-Schalter nebeneinander, Nachbar, Freund, Gilde, nicht erreichbar. Die Icons sind die der Spalte „Erreichbar“. Wort in Tooltip und `aria-label`, Zustand mit `aria-pressed`, an hervorgehoben, aus gedämpft. Eine Zeile bleibt, wenn einer ihrer Gründe eingeschaltet ist (ODER), eine nicht erreichbare, wenn „nicht erreichbar“ an ist. Unbekannte Eigentümer bleiben immer drin. Standard: die ersten drei an, „nicht erreichbar“ aus, das entspricht dem früheren „nur erreichbare“ an. Gemerkt mit den anderen Filtern als `reach`. Ein gespeichertes `onlyReachable` wird übernommen: true ergibt den Standard, false alle vier an.
  - Das Icon für „nicht erreichbar“ ist die Person aus dem Kopf der Spalte „Erreichbar“, schräg durchgestrichen (`notReachable`, aus der Icon-Vorschau gewählt, Nutzer, 2026-10-25). Der Spaltenkopf „Gewinn“ ist die FP-Münze mit drei steigenden Pfeilen in Akzent (`profit`), das Wort steht im Tooltip und im `aria-label`, ebenso in der Snipehilfe.
  - Filter nach Sicherheit (2026-10-25, Nutzer): drei Icon-Schalter nebeneinander gleich nach denen der Beziehung, exakt, sicher, möglich, gebaut wie jene. Die Icons sind die der Spalte „Sicherheit“. Wort in Tooltip und `aria-label`, Zustand mit `aria-pressed`, an hervorgehoben, aus gedämpft. Eine Zeile bleibt, wenn ihre Sicherheit eingeschaltet ist. Zeilen ohne Sicherheit (kein lohnender Platz oder unbekannte Belohnung, sichtbar nur ohne „nur mit Gewinn“) berührt der Filter nicht. Standard alle drei an. Gemerkt mit den anderen Filtern als `tier`, ein gespeicherter Filter ohne das Feld bekommt den Standard.
  - Zählzeile: „X mit Gewinn von Y LGs“ zählt über die LGs, die Spieler, LG und die Filter nach Beziehung und Sicherheit übrig lassen. Nur „nur mit Gewinn“ macht aus Y die X, so bleibt die Zeile bei jedem Filter gleich gebaut.
  - Sortierung nach der Spalte: erst Nachbarn, dann Freunde, Gilde, unbekannt, zuletzt nicht erreichbar.
  - Breite: Die Box ist 710 px breit (vorher 640 px), die neue Spalte 70 px. So behalten Eigentümer und LG ihren Platz.
  - Live: Jede Änderung im Player-Store (`player.updated`) zeichnet den Reiter neu, also auch `getSocialList`, `acceptInvitation` und `deleteFriend`.

## Testfälle

- `test/fixtures/gb-contributions.json` (Rathausliste, anonymisiert) für Zeilen, Gewinn, Status ohne Rangliste und Fußzeile.
- `test/fixtures/great-buildings.json` und `gb-contribution.json` für Status mit Rangliste und Zuwachs.
- `test/fixtures/friend-accept.json` (`acceptInvitation`, anonymisiert, gebaut mit `scripts/make-fixture.py friend-accept` aus der privaten Aufnahme vom 2026-10-20) für Freund setzen und den Live-Test des Reiters. `test/fixtures/friend-delete.json` (`deleteFriend`, anonymisiert, `scripts/make-fixture.py friend-delete` aus der privaten Aufnahme vom 2026-10-25).
