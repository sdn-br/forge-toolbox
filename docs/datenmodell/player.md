# Player

```ts
interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar?: string;              // die sechs Felder fehlen bei einem Spieler, den nur eine LG-Liste kennt
  cityName?: string;
  era?: EraId;
  score?: number;
  rank?: number;
  active?: boolean;
  guild?: GuildRef;
  relations: Relations;
  marked?: boolean;             // vom Spieler gemerkt (Investitionen), nur von Hand entfernt
  ignored?: boolean;            // vom Spieler ignoriert (Investitionen, Snipehilfe, LG-Rechner), nur von Hand entfernt
  marksAt?: number;             // letztes Setzen oder Wegnehmen von Stern oder Ignorieren; der Import nimmt die neueren Marken, ohne Feld gilt die Zeile als älteste
  plunderWorthy?: boolean;      // vom Spieler als gut zu plündern markiert (PvP), schließt noAttack aus, nur von Hand entfernt
  noAttack?: boolean;           // vom Spieler als „nicht angreifen“ markiert (PvP), schließt plunderWorthy aus, nur von Hand entfernt
  pvpMarksAt?: number;          // wie marksAt, nur für die zwei PvP-Marken; der Import wählt sie unabhängig von marksAt
  attack?: AttackTimer;         // fehlt, bis eine Quelle mit Zeitgebern den Spieler gemeldet hat
  firstSeenAt: number;
  seenAt: number;
  source: PlayerSource;
}

interface AttackTimer {
  canPlunder: boolean;          // canSabotage: Kampf gewonnen, noch nicht geplündert
  nextInteractionAt?: number;   // jetzt + next_interaction_in (Sekunden), in ms
}

interface GuildRef { id: GuildId; name: string; flag?: string }

interface Relations {
  neighbor: boolean;
  guildMember: boolean;
  friend: boolean;
}

type PlayerSource = 'socialList' | 'visit' | 'update' | 'ranking' | 'gbg' | 'event' | 'friend' | 'legacy' | 'list'; // legacy: aus der alten Toolbox übernommen, list: nur aus einer LG-Liste bekannt
```

**Regeln**

- `getSocialList` ist für Beziehungen die vollständige Quelle. Wer in der neuen Liste nicht mehr als Nachbar steht, verliert `neighbor`. So erkennt die Toolbox, wenn sich die Nachbarschaft neu mischt.
- Einzelne Meldungen zu Freunden ändern nur `friend`: `FriendService.acceptInvitation` (ganzer Spieler mit `is_friend`, aufgenommen 2026-10-20) setzt es, `FriendService.deleteFriend` (Antwort ist die Spieler-ID als Zahl, aufgenommen 2026-10-25) nimmt es weg. Austritte aus der Gilde kommen später mit dem Guild-Store über `ClanService.getOwnClanData`. Siehe [Investitionen](../features/investitionen.md#erreichbarkeit).
  - `acceptInvitation` aktualisiert dazu die Felder des Spielers wie ein Stadtbesuch. Punkte und Rang fehlen in der Antwort, bekannte Werte bleiben stehen. Ohne `is_friend: true` wird die Antwort übersprungen.
  - `deleteFriend` liest nur die nackte Spieler-ID, andere Formen werden übersprungen. Einen unbekannten Spieler legt die Meldung nicht an.
- **Stern** (`marked`, Nutzer, 2026-10-24): Er ist die eigene Wahl des Spielers und kommt in keiner Meldung des Spiels vor. Jede Quelle, auch `getSocialList` mit dem Wegfall aller Beziehungen, lässt ihn stehen. `setMarked(id, marked)` setzt ihn oder nimmt ihn weg, das Feld fehlt dann ganz, und tut bei einem unbekannten Spieler nichts (Ergebnis `false`). Die Quelle der Zeile bleibt dabei, das Event `player.updated` trägt die Quelle `mark`. Beim Laden behält ein gemerkter Spieler der Datenbank seinen Stern, auch wenn das Spiel ihn schon vorher gemeldet hat.
- **Ignorieren** (`ignored`, Nutzer, 2026-10-25): wie der Stern die eigene Wahl des Spielers, in keiner Meldung des Spiels, von jeder Quelle und vom Wegfall aller Beziehungen unberührt, beim Laden aus der Datenbank zurückgeholt. `setIgnored(id, ignored)` setzt es oder nimmt es weg (das Feld fehlt dann ganz), tut bei einem unbekannten Spieler nichts (Ergebnis `false`) und teilt sich den Weg mit `setMarked`. `player.updated` trägt die Quelle `ignore`. Stern und Ignorieren schließen sich aus (Nutzer, 2026-10-25): `setMarked(id, true)` löscht `ignored`, `setIgnored(id, true)` löscht `marked`, in einem Schritt und mit einer Meldung `player.updated` je geänderter Eigenschaft (Quelle `ignore` und `mark`), damit jede offene Ansicht neu zeichnet. Wegnehmen berührt die andere Eigenschaft nicht. Kommt beim Laden aus der Datenbank eine Eigenschaft, die der Spieler in dieser Sitzung schon durch die andere ersetzt hat, gewinnt die Sitzung. Die Ansichten blenden alle LGs eines ignorierten Spielers aus, siehe [Investitionen](../features/investitionen.md#ignorieren).
- **PvP-Marken** (`plunderWorthy` „gut zu plündern“, `noAttack` „nicht angreifen“, Nutzer, 2026-11-01): Stern und Ignorieren gehören den Großbauten (LG-Rechner, Snipehilfe, Investitionen, Notizen), die PvP-Marken dem PvP. Das sind zwei verschiedene Dinge: Wer als Plünderziel uninteressant ist, bleibt als LG-Besitzer vielleicht interessant, und umgekehrt. Darum haben die PvP-Marken eigene Felder und eine eigene Zeit `pvpMarksAt`, und der Import wählt sie unabhängig von `marksAt` (siehe [Sicherung](../features/sicherung.md)). `setPlunderWorthy(id, value)` und `setNoAttack(id, value)` laufen über denselben Weg wie `setMarked` und `setIgnored` (eine Tabelle mit den zwei Paaren, je Paar eigenes Zeitfeld): Das Feld fehlt ganz, wenn es nicht gesetzt ist, ein unbekannter Spieler ergibt `false`, die Abfragen `plunderWorthy(id)` und `noAttack(id)` ergeben dort `undefined`. Die zwei Marken schließen sich aus, Setzen löscht die andere, Wegnehmen berührt sie nicht. `player.updated` trägt die Quelle `plunderWorthy` bzw. `noAttack`, bei einem Löschen zuerst die der gelöschten Marke. Laden, Listen und jede Quelle des Spiels behandeln sie wie Stern und Ignorieren. Die Warnung beim Angriff kommt später.
- Andere Quellen (Stadtbesuch, `OtherPlayerService.updatePlayer`, Rangliste, GbG) aktualisieren nur die Felder, die sie mitbringen, und ändern Beziehungen nie.
- **LG-Listen** (Nutzer, 2026-10-31: Wissen über Spieler gehört in den Player-Store, auch Spieler, die nur in Listen vorkommen): Die Rathausliste (`GreatBuildingsService.getContributions`) und die LG-Liste eines anderen Spielers (`GreatBuildingsService.getOtherPlayerOverview`) bringen je Zeile den Eigentümer mit `player_id`, `name` und `avatar` (in beiden Aufnahmen vorhanden, dort anonymisiert leer), sonst nichts über ihn. Der Handler meldet sie mit `applyListed(world, listed)`, jeden Eigentümer einmal, den eigenen Spieler und Zeilen ohne Namen nicht.
  - Ein unbekannter Eigentümer wird angelegt: Name, Avatar (nur wenn nicht leer), keine Beziehung (wie bei einem Stadtbesuch, wer nicht in `getSocialList` steht, hat keine), Quelle `list`. Stadtname, Zeitalter, Punkte, Rang und `active` fehlen, bis eine Quelle mit dem ganzen Spieler ihn meldet. Diese setzt dann alle Felder wie sonst.
  - Ein bekannter Spieler bekommt nur den Namen und einen nicht leeren Avatar, denn der Name folgt wie bei jeder Quelle der neuesten Sichtung. `seenAt` rückt vor. Die übrigen Felder, die Quelle der Zeile, Beziehungen, Zeitgeber, Stern und Ignorieren bleiben. Bleibt der Name gleich, wird die Zeile nur gespeichert, ohne `player.updated`.
  - Kommt eine Liste vor dem Laden der Datenbank, und der Spieler steht dort schon, gilt die Zeile der Datenbank mit Name, Avatar und Sichtung der Liste und mit Stern und Ignorieren dieser Sitzung.
  - Alle Ansichten nehmen Eigentümernamen aus dem Player-Store. Die Investitionen hielten bis 2026-10-31 eigene Namen der Listen im Speicher, die Snipehilfe trug den Namen mit ihrer Liste mit. Beides ist entfallen.
  - Die sechs optionalen Felder liest heute keine Ansicht. Wer sie später zeigt, braucht für einen Spieler aus einer Liste eine leere Anzeige.
- **Angriffs-Zeitgeber** (`canSabotage`, `next_interaction_in`, gesehen 2026-10-21): Direkt nach einem gewonnenen Kampf bringt `updatePlayer` `next_interaction_in: 86400` und `canSabotage: true`, direkt nach dem Plündern `next_interaction_in: 86345` und kein `canSabotage` mehr. In `getSocialList` hatten 30 von 75 Nachbarn `next_interaction_in`, 28 davon `canSabotage`. `visitPlayer` bringt keine Zeitgeber. Gespeichert wird der absolute Zeitpunkt (`nextInteractionAt`), so stimmt er auch nach einem Neuladen.
- Nur Quellen, die den ganzen Spieler bringen, setzen die Zeitgeber, und dort heißt ein fehlendes Feld „nicht gesetzt“: `updatePlayer` und die Nachbarn aus `getSocialList`. So verschwindet `canPlunder` nach dem Plündern. Freunde und Gildenmitglieder aus `getSocialList`, `visitPlayer` und die Spieler in Ereignissen lassen die bekannten Zeitgeber stehen.
- Die Plünderfrist ist derselbe Zeitgeber wie `next_interaction_in`. So rechnet auch die alte Toolbox, im Spiel ist es nicht belegt. Ohne Frist gilt `canPlunder` nicht.
- Gildenmitglieder bringen mehr mit (Titel, Rechte, gewonnene Kämpfe). Das gehört in einen späteren Guild-Store, nicht in Player.
- Notizen, PvP-Verlauf und LG-Daten verweisen auf `PlayerId`, liegen aber in ihren eigenen Stores.

**Abfragen:** `get(id)`, `list({ relation })`, `search(name)`.

**Events:** `player.updated { ids: PlayerId[]; source }`, `source` ist die Quelle der Daten oder `mark`. Eine Soziale Liste mit 128 Spielern löst ein Event aus, nicht 128.

**Persistenz:** Tabelle `players`, Schlüssel `[world+id]`, Indizes `seenAt` und Beziehungen. Ältere Zeilen mit allen Feldern bleiben gültig, die Dexie-Version bleibt. Der Import (Zusammenführen, `mergePlayer`) nimmt die Spieldaten wie bisher aus der Zeile mit dem neueren `seenAt`, Felder, die ihr fehlen, aus der anderen Zeile: So löscht eine Zeile aus einer Liste nie, was eine reichere Zeile weiß, und eine reichere Zeile der Datei füllt eine Zeile, die das Profil nur aus einer Liste kennt. Spieler bleiben dauerhaft, solange sie gemerkt sind oder ein anderer Store auf sie verweist (Notiz, PvP-Eintrag). Alle anderen werden gelöscht, wenn sie 90 Tage nicht gesehen wurden.
