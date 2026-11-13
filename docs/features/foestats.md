# foestats

Stand 2026-11-13. foestats.com ist eine externe Datenquelle mit täglichen Punkten und Kämpfen je Spieler. Die API (`api.forge-db.com`) ist inoffiziell und nicht dokumentiert. Seit 2026-11-13 antwortet sie Anfragen von fremden Seiten mit 401 (sie will einen bezahlten Schlüssel). Deshalb gibt es [ScoreDB](#scoredb) als zweite Quelle, und die Einstellung „Abfrage“ wählt, welche Seite gefragt wird. Das Feature heißt im Code weiter foestats, auch Tabellen und Bezeichner bleiben.

**Links:** Jeder Spieler- und Gildenname in den Boxen öffnet die Seite der gewählten Quelle in einem neuen Tab, bei „Keine Abfrage“ die bei foestats (`src/shared/activity-source.ts`): Besuchte Stadt (Spieler, Gilde), LG-Rechner (Eigentümer, Plätze einer vergangenen Stufe), Kopf einer Spielernotiz. In der PvP-Box ist der Name seit 2026-11-01 ebenso ein Link, gefiltert wird mit dem Trichter daneben (vorher filterte der Name, und ein kleines ↗ stand daneben). Links senden nichts und erscheinen immer, auch ohne die Einstellung. Die Adresse baut eine Funktion (`src/shared/foestats.ts`). **Angenommen, im Browser noch nicht geprüft:** `<server>/<world>` ist Sprachkürzel und Welt-ID der Toolbox, etwa `de/de20`.

**Abruf:** nur beim Ansehen, für den Eigentümer des offenen fremden LGs, den Spieler der besuchten Stadt und den Spieler einer LG-Liste ([Snipehilfe](snipehilfe.md), Nutzer 2026-10-24). Eine LG-Liste, die bei offenem LG-Fenster kommt (`quiet`, siehe [Great Buildings](../datenmodell/great-buildings.md)), löst keinen Abruf aus; so fragt auch die Liste, die das Spiel selbst abfragt, nicht ab (Nutzer, 2026-10-31, Regel seit 2026-11-09). Kein Abruf im Hintergrund, keine Nachbarn oder Gildenmitglieder auf Vorrat. Abgefragt wird der Tagesstand des Spielers (`/api/players/<server>/<world>/<id>`), vom Content Script und ohne Cookies (`credentials: 'omit'`). Vom Service Worker aus (Origin `chrome-extension://`) kam im Browsertest keine Antwort, vermutlich blockt Cloudflare. Von der Spielseite aus antwortet die API mit 200 und erlaubt CORS. Deshalb braucht das Manifest keine `host_permissions`.

**Verläufe brauchen eine Sitzung:** Seit 2026-10-28 antworten `/points-history` und `/battles-history` mit 403 (`Session required`). Der Tagesstand antwortet weiter mit 200. Die Toolbox fragt deshalb nur noch den Tagesstand ab und baut den Verlauf selbst daraus auf, ein Tag je Abruf. Kommt später ein API-Schlüssel, können die Verläufe zurückkommen. Wie er übergeben würde, ist offen.

Die Regeln bleiben im Service Worker, ein Abruf läuft in drei Schritten:

1. `foestats.claim`: Der Service Worker sagt, ob ein Abruf fällig ist, und reserviert ihn. Fällig ist er höchstens einmal je Spieler und foestats-Tag. foestats aktualisiert früh am Morgen, deshalb gilt ein neuer Tag erst ab 05:40 Uhr Ortszeit, davor der Vortag. Solange ein Abruf reserviert ist (höchstens 60 Sekunden), bekommen andere Ansichten und Tabs keinen.
2. Das Content Script fragt foestats nach dem Tagesstand und reicht die Antwort mit `foestats.store` zurück. Es unterscheidet drei Fälle: der Tagesstand, „unbekannt“ (404) und „nicht erreichbar“ (Netzfehler, jeder andere Fehlercode wie 403 oder 5xx, kein JSON, kein Tagesstand in der Antwort). Ein Tagesstand ohne Datum, Punkte oder Kämpfe zählt wie „unbekannt“.
3. `foestats.history` liest die Tage aus der DB.

Die zwei Fehlerfälle gelten verschieden weit (Nutzer, 2026-10-31):

- **foestats nicht erreichbar** gilt für alle Spieler, nicht je Spieler. Der Service Worker merkt sich nur im Speicher, wann foestats zuletzt nicht erreichbar war. Startet er neu, ist das vergessen, und er fragt einfach wieder. In den 30 Minuten danach gibt `foestats.claim` für jeden Spieler keinen Abruf frei. Jede Antwort von foestats hebt das sofort auf, dann ist jeder Spieler beim nächsten Ansehen wieder fällig.
- **Spieler bei foestats unbekannt** gilt je Spieler und steht in `foestatsFetches`. Gefragt wird erst am nächsten foestats-Tag wieder.

Einträge älterer Versionen, die einen gescheiterten Abruf je Spieler festhielten (`ok: false`), sind sofort wieder fällig. Sonst blieben Spieler, bei denen foestats vor 2026-10-31 mit 403 antwortete, auf „foestats nicht erreichbar“ stehen.

**Datenmodell** (Dexie-Version 10, Domäne `src/persistence/foestats/`):

- `foestatsDays` (`[world+player+date]`, Index `[world+player]`): ein Tag eines Spielers mit `points` und `battles`, am Tag eines Tagesstands auch `active` (Status laut foestats, ohne Index, ältere Zeilen haben ihn nicht, deshalb keine neue Dexie-Version). Jeder Tagesstand schreibt bis zu zwei Tage:
  - den Tag des Stands (`data_date`) mit Punkten, Kämpfen und Status. Er ersetzt einen errechneten Wert für denselben Tag.
  - den Vortag, errechnet als Punkte minus `points_change` und Kämpfe minus `battles_change`, nur wenn beide Änderungen da sind. Er füllt nur eine Lücke: Steht der Tag schon in der DB, bleibt er, wie er ist.

  Zeilen aus den früheren Verläufen (vor 2026-10-28) bleiben stehen und zählen wie Tage eines Tagesstands.
- `foestatsFetches` (`[world+player]`): letzter beantworteter Abruf je Spieler mit foestats-Tag und Zeitpunkt, dazu `unknown`, wenn foestats den Spieler nicht kennt (ohne Index, ältere Zeilen haben es nicht, deshalb keine neue Dexie-Version). So fragt ein Neuladen des Spiels nicht noch einmal. Ein Abruf, auf den foestats nicht antwortet, landet hier nicht.
- Der FoestatsStore im Content Script bringt einen Spieler beim Ansehen auf Stand und liest die Tage danach aus der DB. Die Oberfläche liest immer aus dem eigenen Speicher.

**Aktivität im LG-Rechner** (beide Reiter, auch „Mögliche Einzahlungen“), eine Zeile unter dem Eigentümer, Teile mit „·“ getrennt:

Der Status von foestats (`is_active`) wird gespeichert, aber nicht gezeigt (Nutzer, 2026-10-31). Er widersprach den Zahlen desselben Tagesstands in beide Richtungen: `is_active: true` bei 0 Punkten und 0 Kämpfen, `is_active: false` bei +21.077 Punkten und +12 Kämpfen (de10, 2026-10-31). Die Spielerseite von foestats.com nennt einen Spieler inaktiv, wenn der letzte Tagesstand weder Punkte noch Kämpfe dazubrachte, nur ihre Tabellen (Gildenmitglieder) gehen nach `is_active` (im Quelltext der Seite gesehen). Die Aussage der Spielerseite deckt „zuletzt aktiv“ ab, genauer, weil mehrere Tage zählen. Auch die 7- und 30-Tage-Änderung der Seite rechnet der Browser selbst aus `/points-history`, keine API liefert sie fertig.

1. Was die eigenen Tage sagen: „zuletzt aktiv heute / gestern / vor N Tagen“, wenn eine Zunahme von Punkten oder Kämpfen zwischen zwei aufeinanderfolgenden Kalendertagen bekannt ist, gezählt ab dem aktuellen foestats-Tag. Liegt die letzte Zunahme in einer Lücke zwischen zwei bekannten Tagen, ist ihr Tag unbekannt; dann zählt die Ruhe erst ab dem Tag nach der Lücke („seit N Tagen keine Zunahme“ ab 2 Tagen). Sagen die Tage noch nichts, steht „noch keine Zunahme bekannt“.
2. Die Änderung von Punkten und Kämpfen über 7 Tage, wenn die Tage das abdecken, sonst über die kürzere Spanne, die bekannt ist („1 Tag: …“). Ohne zweiten Tag fällt der Teil weg.

Beispiele: Beim ersten Ansehen gibt es den Tag des Stands und den errechneten Vortag, etwa „zuletzt aktiv heute · 1 Tag: +300 Punkte, +3 Kämpfe“. Nach einer Woche mit Abrufen etwa „zuletzt aktiv vor 4 Tagen · 7 Tage: +500 Punkte, +3 Kämpfe“. Ab 3 Tagen ohne Zunahme steht die Zeile als Warnung. „bei foestats unbekannt“ und „foestats nicht erreichbar“ stehen nur, solange kein Tag gespeichert ist. Die Rechnung ist eine reine Funktion (`domain/activity.ts`). Eine eigene Ansicht des Verlaufs gibt es noch nicht.

**Einstellung** bis 2026-11-13 „foestats-Daten abrufen“, Standard an, mit Hinweis, wann foestats.com gefragt wird. Seitdem eine Auswahl, siehe [ScoreDB](#scoredb). Den Satz, dass foestats dabei Welt und Spieler-ID erfährt, hat der Nutzer gestrichen, weil ihn niemand versteht (2026-10-23). Aus: keine Anfragen, keine Aktivität, Links bleiben. Entscheidung: Standard an statt Double-Opt-In wie bei Settings, die Daten nach außen senden. Gesendet wird nur, was foestats ohnehin öffentlich zeigt (Welt und Spieler-ID), keine eigenen Spieldaten.

## ScoreDB

Seit 2026-11-13 zweite Quelle für Punkte und Kämpfe (Nutzer), weil foestats ohne bezahlten Schlüssel nicht mehr antwortet.

**Quelle:** die Spielerseite `https://foe.scoredb.io/<WELT>/Player/<id>`, serverseitig gebautes HTML ohne Schutz gegen Bots. Die Seite trägt zwei Diagramme als Attribute: `playerPoints` und `playerBattles`, je mit `data-startdate` (`YYYY_MM_DD`, der Tag des neuesten Werts) und `data-counters`. Reihen sind mit `,` getrennt, Werte mit `|`, der neueste zuerst, jeder weitere einen Kalendertag früher, bis zu 30 Tage. In `playerPoints` ist die erste Reihe der Spieler, die übrigen sind seine Nachbarn in der Rangliste und werden nicht gelesen. Punkte und Kämpfe werden je Tag gepaart, ein Tag mit nur einem Wert fällt weg. Gelesen wird mit regulären Ausdrücken auf den Attributen (`src/persistence/scoredb/page.ts`), weil der Service Worker keinen DOMParser hat. Reihenfolge der Attribute, fehlende Attribute und Werte, die keine Zahl sind, werden abgefangen.

**Abruf aus dem Service Worker:** ScoreDB sendet keine CORS-Header, vom Content Script aus kommt nur „Failed to fetch“. Deshalb liest der Service Worker die Seite (`scoredb.player`, ohne Cookies) und gibt das Ergebnis an das Content Script zurück, das es wie bei foestats mit `foestats.store` ablegt. Dafür braucht das Manifest die Host-Berechtigung `https://foe.scoredb.io/*`. Chrome fragt beim Update auf diese Version einmal danach. foestats wird weiter vom Content Script gefragt.

**Gleiche Regeln:** nur beim Ansehen, höchstens einmal je Spieler und Tag (Tagesgrenze 05:40 wie bei foestats), `claim`, `store` und `history` wie oben. Die Pause von 30 Minuten nach „nicht erreichbar“ gilt je Quelle, so wird nach dem Wechsel die andere Quelle sofort gefragt. Beide Quellen schreiben in dieselben Tabellen (`foestatsDays`, `foestatsFetches`), Punkte und Kämpfe sind Werte des Spiels. Keine neue Dexie-Version. Ein Abruf bei ScoreDB schreibt alle gemeldeten Tage und ersetzt dabei gespeicherte Werte desselben Tags. Ein von foestats errechneter Vortag füllt weiter nur eine Lücke. Einen Status `active` gibt es bei ScoreDB nicht.

**Antworten:** 404 und 500 mit Fehlerseite (`<title>Error</title>`) zählen als „unbekannt“, ebenso eine Seite ohne beide Diagramme. Ein Netzfehler und jeder andere Fehlercode zählen als „nicht erreichbar“.

**Einstellung** „Abfrage“ in der Gruppe „Aktivität“ (bis 2026-11-13 hieß die Gruppe „foestats“), drei Werte: „Keine Abfrage“, „foestats.com“, „scoredb.io“. Standard ist scoredb.io. Der Hinweis sagt, dass die gewählte Seite einmal am Tag nach dem Spieler gefragt wird, dessen Stadt oder LG man ansieht. Der Schlüssel bleibt `foestats.fetch`: Ein gespeichertes `false` des alten Schalters gilt als „Keine Abfrage“, ein `true` oder nichts als scoredb.io. Gilt die Wahl, wenn ein Spieler angesehen wird. Nach einem Wechsel bleiben gezeigte Daten stehen, neu gefragt wird erst beim nächsten fälligen Abruf. Die Texte der Aktivität nennen die gewählte Quelle („wird von scoredb.io geladen …“, „scoredb.io nicht erreichbar“, „bei scoredb.io unbekannt“, „Punkte und Kämpfe laut scoredb.io, Stand …“, „keine scoredb.io-Daten“).

**Annahmen, im Browser noch nicht geprüft:**

- Der Weltcode bei ScoreDB ist die Welt-ID der Toolbox in Großbuchstaben (`de10` wird `DE10`, `src/shared/scoredb.ts`).
- Ein unbekannter Spieler antwortet mit 500 und Fehlerseite (gesehen 2026-11-13).
- Wann ScoreDB aktualisiert, ist unbekannt. Es gilt die Tagesgrenze 05:40 von foestats. Grenze: Kommt das Update später, zeigt die Toolbox den neuen Tag erst am Tag darauf. Ausbau: den neuesten Tag der Seite mit der Uhrzeit der Abrufe vergleichen und ScoreDB eine eigene Tagesgrenze geben.
