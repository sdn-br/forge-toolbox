# LG-Rechner

Stand 2026-10-21. Erste Stufe des LG-Kostenrechners, nur für LGs anderer Spieler. Datenmodell und Rechnung: [Great Buildings](../datenmodell/great-buildings.md).

**Box „LG-Rechner“ (🏛️):** öffnet sich, sobald der Spieler ein fremdes LG öffnet. Beim eigenen LG bleibt sie zu und zeigt weiter das letzte fremde.

- Kopf: Name des LGs, Stufe → nächste Stufe, freigeschaltete Höchststufe, Eigentümer, verfügbare FP, Arche-Bonus. Verfügbare FP sind die FP der Leiste plus die FP in Paketen im Inventar, weil das Spiel beim Einzahlen Pakete selbst öffnet. Der Tooltip zeigt die Aufteilung „Leiste X + Pakete Y“.
- Faktor für „Fordern“: Knöpfe 80, 90, 100 und Arche (der eigene Arche-Bonus), dazu ein freies Feld von −100 bis 200. Die Wahl ist eine Einstellung und gilt, bis sie geändert wird. Fordern ist Belohnung mal Faktor, ohne Bezug zur sicheren Einzahlung (der Eigentümer sichert den Platz selbst ab). Mehr als bis zum Level-Up fehlt steht rot, unter Sicher gedämpft, der Tooltip nennt den Gewinn bei Fordern.
- Tabelle, eine Zeile je Platz mit Belohnung: Platz, Sicher, Fordern, FP brutto, Gewinn, Kurs, Blaupausen, Medaillen. Farben: Gewinn grün, Verlust rot, Level-Warnung gelb, eigener Platz blau, nicht zu haben oder schlechter grau. Eine Einzahlung, die die verfügbaren FP übersteigt, steht rot. Wer schon eingezahlt hat, sieht in Klammern, was er noch dazulegen muss.
- Fußzeile „Bis Level-Up fehlen X FP“. Eine Abdeckung über der Tabelle, wenn das LG die Höchststufe erreicht hat, nicht verbunden ist oder seit dem Öffnen gelevelt wurde.
- Vergangene Stufe (im Spiel über die Stufenauswahl): nur Plätze, Spieler und FP, als vergangen markiert.
- Ton: ein kurzer Piepton aus WebAudio (keine Audiodatei), wenn beim Öffnen oder nach einer Änderung ein Platz Gewinn bringt, und nach einem Level-up. Derselbe Stand piept nicht zweimal. Einstellung „Ton bei lohnendem Platz“, Standard an.

Entscheidung Faktor als Einstellung: Settings kennen dafür Zahlen mit Grenzen (`NumberSettingDef`), der Einstellungsdialog zeigt sie als Zahlenfeld. Verworfen: den Faktor nur als Ansichtswahl (`ui.pref`) zu merken, dann stünde er nicht in den Einstellungen.

**Noch nicht enthalten:** Klick kopiert die Einzahlung ins Spielfeld, Faktor je Gespräch, FP aus Quests (Quest-Daten liest die Ingestion noch nicht), eigene LGs (kommt mit dem Eigenanteilsrechner), Snipehilfe (die bekannten fremden LGs werden schon gespeichert).
