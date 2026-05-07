# Dice Turn Room Handoff

## Summary

Dice Turn Room is a small Node.js web app for sharing turn-based dice rolls with friends.

The app supports:

- 6-character room codes using uppercase letters and numbers
- Auto-create room when the first user joins an unused valid room code
- First player in a room becomes the host
- Host-only dice settings
- Clear current-turn state
- Roll and next-turn actions only for the active player
- Shared room state through Server-Sent Events
- 3D CSS dice animation
- Render deployment using a Node Web Service

## Local Folder

```text
/Users/gunue/Documents/New project/dice-turn-room
```

Main files:

```text
server.js
public/index.html
public/app.js
public/styles.css
package.json
render.yaml
README.md
HANDOFF.md
```

## Local Run

From the app folder:

```bash
cd "/Users/gunue/Documents/New project/dice-turn-room"
npm run dev
```

Local URL:

```text
http://localhost:4177
```

Same-network URL depends on the current Mac IP. Previously tested LAN IP:

```text
http://10.40.57.117:4177
```

## GitHub

Repository:

```text
https://github.com/ggunue/dice-turn-room.git
```

Current branch:

```text
main
```

Useful commands:

```bash
git status
git add .
git commit -m "Update dice room"
git push
```

## Render Deployment

The app must be deployed as a Render **Web Service**, not a Static Site.

Render settings:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free
Root Directory: empty
```

The repo also includes `render.yaml`:

```yaml
services:
  - type: web
    name: dice-turn-room
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
```

Render URL:

```text
https://dice-turn-room.onrender.com
```

## Render Free Plan Behavior

Render Free Web Services do not stay warm forever.

- The service sleeps after roughly 15 minutes without requests.
- It wakes automatically when someone visits the URL.
- Wake-up can take tens of seconds or about a minute.
- The public URL stays available.

Important limitation:

The app currently stores room state in server memory. If Render sleeps, restarts, or redeploys, current rooms, players, turns, and logs reset.

To preserve room state later, add external storage such as Redis, Postgres, or another hosted database.

## Current App Behavior

### Rooms

- Room code must be exactly 6 letters/numbers.
- Input is normalized to uppercase.
- Invalid characters are removed in the browser input.
- Joining an unused valid room code creates that room.
- The first player in a room becomes host.

### Host

- Host is shown in the player list and top status.
- Only host can change dice count and dice sides.
- Non-host users see dice setting controls disabled.
- The server also rejects non-host settings changes.

### Turns

- The active player is shown clearly.
- The top status says `내 턴` when it is the current user's turn.
- Roll button is enabled only on the current user's turn.
- Next-turn button is enabled only on the current user's turn.
- Server rejects roll or next-turn requests from non-active players.

### Dice

- Dice count range: 1-12
- Dice sides: d4, d6, d8, d10, d12, d20, d100
- Dice animate as 3D CSS cubes.
- During a roll, dice move around the stage and spin.
- When the roll finishes, dice gather near the center.
- The total is shown prominently.

### Log

The log only records dice roll totals.

Format:

```text
PlayerName: Total
```

Join events, settings changes, and next-turn events are not shown in the log.

## API Notes

Main endpoints:

```text
POST /api/rooms
GET  /api/events?room=ABC123
GET  /api/rooms/ABC123
POST /api/rooms/ABC123/join
POST /api/rooms/ABC123/settings
POST /api/rooms/ABC123/roll
POST /api/rooms/ABC123/next
```

Room state is kept in memory:

```js
const rooms = new Map();
const clients = new Map();
```

SSE is used for shared live updates:

```text
GET /api/events?room=ABC123
```

## Troubleshooting

### Render shows `Not Found`

If `/` or `/api/rooms` shows:

```text
x-render-routing: no-server
```

then Render likely created a Static Site or misconfigured service.

Fix:

- Create a Render Web Service
- Use Node runtime
- Use `npm install` and `npm start`

### GitHub password auth fails

GitHub no longer accepts account passwords for Git push over HTTPS.

Use a Personal Access Token as the password.

If the Mac keychain stores bad credentials:

```bash
printf "protocol=https\nhost=github.com\n" | git credential-osxkeychain erase
```

Then retry:

```bash
git push
```

## Possible Next Improvements

- Add persistent storage so rooms survive Render sleep/restarts
- Add leave-room or inactive-player cleanup
- Add host transfer if host disconnects
- Add sound effects for dice rolling
- Add better mobile layout testing
- Add a copy-room-code button separate from invite-link copy
- Add room history export
