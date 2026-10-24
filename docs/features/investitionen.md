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
- **Spalten:** Eigentümer (Link zu foestats), LG, Stufe, Platz, Einzahlung, Gewinn, Status, Rest bis zum Level-up. Blaupausen und Medaillen bleiben vorerst ausgeblendet wie im LG-Rechner.
- **Gewinn:** Belohnung des Platzes brutto mit dem eigenen Arche-Bonus minus eigene Einzahlung. Die Belohnung der Rathausliste (`reward.strategy_point_amount`) ist netto, wie in der Rangliste.
- **Status** (Nutzer, 2026-10-24):
  - **sicher** oder **unsicher**: Es gibt eine gespeicherte Rangliste derselben Stufe, deren Summe zum Fortschritt passt. Entschieden wird mit der Regel „Eigener Platz“ des LG-Rechners.
  - **sicher ohne Rangliste:** eigene Einzahlung ≥ (Summe aller Einzahlungen minus eigene Einzahlung) + Rest. Niemand hinter dem Spieler kann mehr halten als alle anderen zusammen, also überholt ihn keiner.
  - **?** (unbekannt): sonst. Ein Öffnen des LGs macht daraus eine genaue Aussage.
  - Die alte Toolbox nannte einen Platz sicher, sobald die eigene Einzahlung den Rest erreichte. Das übersieht die Einzahlungen der Spieler dahinter (100 FP auf Platz 1, Platz 2 hält 90, Rest 50: Platz 2 kommt auf 140). Ihre Regel gilt deshalb nicht als Vorlage.
- **Zuwachs:** Ist der Fortschritt eines LGs seit dem letzten Öffnen gewachsen, zahlt dort jemand ein. Die Zeile ist hervorgehoben und zeigt „+X“. Die Hervorhebung bleibt, bis der Spieler das LG öffnet (Vorschlag, im PR abzunehmen). Gespeichert wird dafür der Fortschritt beim letzten Öffnen.
- **Fußzeile:** FP im Umlauf (Summe der eigenen Einzahlungen), Gewinn „sicher“ (nur Zeilen mit Status sicher) und „gesamt“ (alle Zeilen). Eine Einstellung dafür entfällt.
- **Sortierung:** Standard nach Zuwachs, dann nach Rest aufsteigend (was bald levelt, steht oben). Ein Klick auf einen Spaltenkopf sortiert nach dieser Spalte.
- **Umsetzung (erster Schnitt, 2026-10-24):**
  - Status als Icon mit dem Wort im Tooltip: sicher Haken im Kreis, unsicher Warndreieck, unbekannt Fragezeichen im Kreis. Der Spaltenkopf ist ein Info-Icon („Status“ im Tooltip), damit Eigentümer und LG Platz behalten.
  - Zuwachs „+X“ steht vor dem LG-Namen, die Zeile ist gelb hinterlegt (Ton der Level-Warnung im LG-Rechner).
  - Der Zuwachs braucht einen gespeicherten Fortschritt beim Öffnen. LGs, die der Spieler mit dieser Version noch nicht offen hatte, zeigen keinen Zuwachs. Jede eigene Einzahlung passiert im offenen LG und setzt ihn.
  - „Stand“: Die Zeit der letzten Rathausliste merkt sich die Box je Welt mit ihren Ansichtsdaten (`ui.prefs`), so steht sie auch nach einem Neuladen. Ohne Rathausliste steht dort die Bitte, sie zu öffnen.
  - Eigentümernamen: aus dem Player-Store, sonst aus der letzten Rathausliste (nur im Speicher), sonst die ID.
  - Status mit Rangliste: rechnet auch bei einem LG auf Höchststufe oder ohne Verbindung mit der Regel „Eigener Platz“, denn der LG-Rechner zeigt dort keine Plätze.
- **Nicht übernommen (YAGNI):** Ausblenden einzelner LGs, Eintragsdatum, Zuwachsdatum als eigene Spalte, Verlauf der Zuwächse.

## Reiter „Mögliche Investitionen“

Quelle: alle bekannten fremden LGs der Tabelle `greatBuildings`, ohne eigene Beteiligung. Gerechnet wird wie in der Snipehilfe (drei Stufen exakt, sicher, möglich, siehe dort), nur über alle Spieler statt über eine Liste.

- **Spalten:** Merken (Stern), Eigentümer, Erreichbar, LG, Stufe, Fortschritt, Platz, Einsatz, Gewinn, Stufe der Sicherheit, Stand (Alter des Eintrags).
- **Filter:** Spieler (Teil des Namens), LG (Teil des Namens), nur gemerkte (LG gemerkt oder Eigentümer gemerkt), nur Treffer (Standard an), nur erreichbare (Standard an).
- **Sortierung:** Standard nach Gewinn, der beste oben.
- Der Reiter zeigt den letzten gesehenen Stand. Ob ein gemerktes LG inzwischen reif ist, weiß die Toolbox erst, wenn der Spieler es oder die LG-Liste des Eigentümers öffnet, denn sie fragt nichts im Hintergrund ab. Der Reiter sagt also, wo es sich lohnt vorbeizuschauen.

## Merken

- Gemerkt werden LGs und Spieler (Nutzer, 2026-10-24). Ein Stern je LG in der Snipehilfe, im LG-Rechner und in beiden Reitern, ein Stern je Spieler im Kopf der Snipehilfe, im LG-Rechner beim Eigentümer und in den Stadtinformationen.
- Keine Notiz zur Markierung (Nutzer, 2026-10-24: optional denkbar, aber YAGNI). Für Text gibt es die [Notizen](notizen.md).
- Markierungen entfernt nur der Spieler, von Hand (Nutzer, 2026-10-24). Sie verschwinden nicht, wenn ein Spieler die Nachbarschaft, die Freundesliste oder die Gilde verlässt. Nachbarn kommen wieder.
- Gemerkte Spieler sind ein Zustand im Player-Store, nicht in den Investitionen. Andere Features dürfen ihn mitnutzen (Nutzer, 2026-10-24: Spieler zu merken kann über die Investitionen hinaus nützen).
- Gemerkte LGs löscht die Aufbewahrung nach „Fremde LGs aufbewahren (Tage)“ nicht.
- Icon für den Stern: offen, erst als HTML-Vorschau (siehe Konzept, „Offene Icons“).

## Erreichbarkeit

Einzahlen kann man nur in LGs von Nachbarn, Freunden und Gildenmitgliedern. Die Beziehungen hält der Player-Store (`relations`).

- Jede Zeile zeigt den Grund (Nachbar, Freund, Gilde) oder „nicht erreichbar“. Nicht erreichbare Zeilen stehen gedämpft da und fehlen im Filter „nur erreichbare“. Ein Eigentümer, den der Player-Store nicht kennt, gilt als unbekannt und bleibt im Filter.
- **Aktualisierung:** `getSocialList` setzt alle Beziehungen neu, meist beim Spielstart. Dazu kommen einzelne Meldungen, sobald sie bekannt sind:
  - `FriendService.acceptInvitation` (aufgenommen 2026-10-20): Antwort ist der neue Freund als ganzer Spieler mit `is_friend` und Gilde. Setzt `friend`.
  - `FriendService.deleteFriend` (Format laut alter Toolbox, nicht selbst gesehen): Antwort ist die Spieler-ID. Nimmt `friend` weg. Bis zur Bestätigung per Aufnahme roh in die Konsole schreiben, wie bei den Schilden.
  - **Später mit dem Guild-Store (Phase 4):** Abgleich der Mitgliederliste aus `ClanService.getOwnClanData`. Wer fehlt, verliert `guildMember`. So bemerkt die alte Toolbox Austritte, also erst beim nächsten Abruf der Liste.
  - **Offen, keine Aufnahme:** der andere beendet die Freundschaft, der Spieler wird aus der Gilde entfernt, der Spieler verlässt selbst die Gilde. Ob das Spiel das live meldet (eigene Methode, Websocket) oder nur über ein neues `getSocialList`, zeigt erst eine Aufnahme. Bis dahin kann eine Zeile bis zum nächsten `getSocialList` falsch als erreichbar stehen.

## Testfälle

- `test/fixtures/gb-contributions.json` (Rathausliste, anonymisiert) für Zeilen, Gewinn, Status ohne Rangliste und Fußzeile.
- `test/fixtures/great-buildings.json` und `gb-contribution.json` für Status mit Rangliste und Zuwachs.
- `acceptInvitation`: Testfall aus der Aufnahme `~/Downloads/forge-toolbox-recording-2026-10-20T14-31-13-492Z.json` (privat) mit `scripts/make-fixture.py` bauen.
