# Player

```ts
interface Player {
  world: WorldId;
  id: PlayerId;
  name: string;
  avatar: string;
  cityName: string;
  era: EraId;
  score: number;
  rank: number;
  active: boolean;
  guild?: GuildRef;
  relations: Relations;
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

type PlayerSource = 'socialList' | 'visit' | 'update' | 'ranking' | 'gbg' | 'event';
```

**Regeln**

- `getSocialList` ist für Beziehungen die vollständige Quelle. Wer in der neuen Liste nicht mehr als Nachbar steht, verliert `neighbor`. So erkennt die Toolbox, wenn sich die Nachbarschaft neu mischt.
- Andere Quellen (Stadtbesuch, `OtherPlayerService.updatePlayer`, Rangliste, GbG) aktualisieren nur die Felder, die sie mitbringen, und ändern Beziehungen nie.
- **Angriffs-Zeitgeber** (`canSabotage`, `next_interaction_in`, gesehen 2026-10-21): Direkt nach einem gewonnenen Kampf bringt `updatePlayer` `next_interaction_in: 86400` und `canSabotage: true`, direkt nach dem Plündern `next_interaction_in: 86345` und kein `canSabotage` mehr. In `getSocialList` hatten 30 von 75 Nachbarn `next_interaction_in`, 28 davon `canSabotage`. `visitPlayer` bringt keine Zeitgeber. Gespeichert wird der absolute Zeitpunkt (`nextInteractionAt`), so stimmt er auch nach einem Neuladen.
- Nur Quellen, die den ganzen Spieler bringen, setzen die Zeitgeber, und dort heißt ein fehlendes Feld „nicht gesetzt“: `updatePlayer` und die Nachbarn aus `getSocialList`. So verschwindet `canPlunder` nach dem Plündern. Freunde und Gildenmitglieder aus `getSocialList`, `visitPlayer` und die Spieler in Ereignissen lassen die bekannten Zeitgeber stehen.
- Die Plünderfrist ist derselbe Zeitgeber wie `next_interaction_in`. So rechnet auch die alte Toolbox, im Spiel ist es nicht belegt. Ohne Frist gilt `canPlunder` nicht.
- Gildenmitglieder bringen mehr mit (Titel, Rechte, gewonnene Kämpfe). Das gehört in einen späteren Guild-Store, nicht in Player.
- Notizen, PvP-Verlauf und LG-Daten verweisen auf `PlayerId`, liegen aber in ihren eigenen Stores.

**Abfragen:** `get(id)`, `list({ relation })`, `search(name)`.

**Events:** `player.updated { ids: PlayerId[]; source }`. Eine Soziale Liste mit 128 Spielern löst ein Event aus, nicht 128.

**Persistenz:** Tabelle `players`, Schlüssel `[world+id]`, Indizes `seenAt` und Beziehungen. Spieler bleiben dauerhaft, solange ein anderer Store auf sie verweist (Notiz, PvP-Eintrag). Alle anderen werden gelöscht, wenn sie 90 Tage nicht gesehen wurden.
