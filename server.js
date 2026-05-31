import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4177);
const host = process.env.HOST || "0.0.0.0";

const rooms = new Map();
const clients = new Map();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function roomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function normalizeRoomId(id) {
  return String(id || "").trim().toUpperCase();
}

function isValidRoomId(id) {
  return /^[A-Z0-9]{6}$/.test(id);
}

function playerId() {
  return crypto.randomUUID();
}

function normalizeName(name) {
  const trimmed = String(name || "").trim();
  return trimmed.slice(0, 24) || "Guest";
}

function getRoom(id) {
  const normalized = normalizeRoomId(id);
  if (!isValidRoomId(normalized)) return null;
  if (!rooms.has(normalized)) {
    rooms.set(normalized, {
      id: normalized,
      createdAt: Date.now(),
      hostId: null,
      players: [],
      activeIndex: 0,
      diceCount: 2,
      diceSides: 6,
      rolling: false,
      lastRoll: null,
      log: []
    });
  }
  return rooms.get(normalized);
}

function publicRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    players: room.players,
    activeIndex: room.activeIndex,
    activePlayerId: room.players[room.activeIndex]?.id || null,
    diceCount: room.diceCount,
    diceSides: room.diceSides,
    rolling: room.rolling,
    lastRoll: room.lastRoll,
    log: room.log.slice(-20)
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function broadcast(room) {
  const data = `data: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const res of clients.get(room.id) || []) res.write(data);
}

function addLog(room, entry) {
  room.log.push({ id: crypto.randomUUID(), at: Date.now(), ...entry });
  room.log = room.log.slice(-40);
}

function nextTurn(room) {
  if (!room.players.length) {
    room.activeIndex = 0;
    return;
  }
  room.activeIndex = (room.activeIndex + 1) % room.players.length;
}

function reorderPlayers(room, orderedPlayerIds) {
  if (!Array.isArray(orderedPlayerIds) || orderedPlayerIds.length !== room.players.length) {
    return false;
  }

  const currentIds = new Set(room.players.map((player) => player.id));
  const requestedIds = new Set(orderedPlayerIds);
  if (currentIds.size !== requestedIds.size) return false;
  for (const id of currentIds) {
    if (!requestedIds.has(id)) return false;
  }

  const activePlayerId = room.players[room.activeIndex]?.id || null;
  const byId = new Map(room.players.map((player) => [player.id, player]));
  room.players = orderedPlayerIds.map((id) => byId.get(id));
  room.activeIndex = Math.max(0, room.players.findIndex((player) => player.id === activePlayerId));
  return true;
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const target = path.normalize(path.join(publicDir, pathname));

  if (!target.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(target);
    res.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await bodyJson(req);
      const requestedId = normalizeRoomId(body.roomId || roomId());
      if (!isValidRoomId(requestedId)) {
        return sendJson(res, 400, { error: "Room code must be 6 letters or numbers." });
      }
      const room = getRoom(requestedId);
      return sendJson(res, 201, publicRoom(room));
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      const room = getRoom(url.searchParams.get("room"));
      if (!room) return sendJson(res, 400, { error: "room is required" });

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });
      res.write(`data: ${JSON.stringify(publicRoom(room))}\n\n`);

      if (!clients.has(room.id)) clients.set(room.id, new Set());
      clients.get(room.id).add(res);
      req.on("close", () => clients.get(room.id)?.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/rooms/")) {
      const room = getRoom(url.pathname.split("/").at(-1));
      if (!room) return sendJson(res, 404, { error: "room not found" });
      return sendJson(res, 200, publicRoom(room));
    }

    if (req.method === "POST" && url.pathname.endsWith("/join")) {
      const room = getRoom(url.pathname.split("/").at(-2));
      if (!room) return sendJson(res, 400, { error: "Room code must be 6 letters or numbers." });
      const body = await bodyJson(req);
      const id = body.playerId || playerId();
      let player = room.players.find((item) => item.id === id);

      if (!player) {
        player = { id, name: normalizeName(body.name), joinedAt: Date.now() };
        room.players.push(player);
        if (!room.hostId) room.hostId = id;
      } else {
        player.name = normalizeName(body.name);
      }

      if (room.activeIndex >= room.players.length) room.activeIndex = 0;
      broadcast(room);
      return sendJson(res, 200, { playerId: id, room: publicRoom(room) });
    }

    if (req.method === "POST" && url.pathname.endsWith("/settings")) {
      const room = getRoom(url.pathname.split("/").at(-2));
      if (!room) return sendJson(res, 400, { error: "Room code must be 6 letters or numbers." });
      const body = await bodyJson(req);
      if (room.hostId && body.playerId !== room.hostId) {
        return sendJson(res, 403, { error: "Only the room host can change dice settings." });
      }
      room.diceCount = Math.max(1, Math.min(12, Number(body.diceCount) || room.diceCount));
      room.diceSides = Math.max(2, Math.min(100, Number(body.diceSides) || room.diceSides));
      broadcast(room);
      return sendJson(res, 200, publicRoom(room));
    }

    if (req.method === "POST" && url.pathname.endsWith("/order")) {
      const room = getRoom(url.pathname.split("/").at(-2));
      if (!room) return sendJson(res, 400, { error: "Room code must be 6 letters or numbers." });
      const body = await bodyJson(req);
      if (room.hostId && body.playerId !== room.hostId) {
        return sendJson(res, 403, { error: "Only the room host can change player order." });
      }
      if (!reorderPlayers(room, body.orderedPlayerIds)) {
        return sendJson(res, 400, { error: "Invalid player order." });
      }
      broadcast(room);
      return sendJson(res, 200, publicRoom(room));
    }

    if (req.method === "POST" && url.pathname.endsWith("/roll")) {
      const room = getRoom(url.pathname.split("/").at(-2));
      const body = await bodyJson(req);
      const player = room.players.find((item) => item.id === body.playerId);
      const active = room.players[room.activeIndex];

      if (!player) return sendJson(res, 403, { error: "Join the room first." });
      if (!active || active.id !== player.id) return sendJson(res, 409, { error: "It is not your turn." });
      if (room.rolling) return sendJson(res, 409, { error: "Dice are already rolling." });

      room.rolling = true;
      broadcast(room);

      setTimeout(() => {
        const values = Array.from({ length: room.diceCount }, () => 1 + Math.floor(Math.random() * room.diceSides));
        const total = values.reduce((sum, value) => sum + value, 0);
        room.lastRoll = {
          id: crypto.randomUUID(),
          playerId: player.id,
          playerName: player.name,
          values,
          total,
          diceSides: room.diceSides,
          at: Date.now()
        };
        addLog(room, { type: "roll", ...room.lastRoll });
        room.rolling = false;
        nextTurn(room);
        broadcast(room);
      }, 1450);

      return sendJson(res, 202, publicRoom(room));
    }

    if (req.method === "POST" && url.pathname.endsWith("/next")) {
      const room = getRoom(url.pathname.split("/").at(-2));
      if (!room) return sendJson(res, 400, { error: "Room code must be 6 letters or numbers." });
      const body = await bodyJson(req);
      const player = room.players.find((item) => item.id === body.playerId);
      const active = room.players[room.activeIndex];
      if (!player) return sendJson(res, 403, { error: "Join the room first." });
      if (!active || active.id !== player.id) return sendJson(res, 409, { error: "It is not your turn." });
      nextTurn(room);
      broadcast(room);
      return sendJson(res, 200, publicRoom(room));
    }

    return serveStatic(req, res);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Dice Turn Room running at http://${host}:${port}`);
  console.log(`Local URL: http://localhost:${port}`);
});
