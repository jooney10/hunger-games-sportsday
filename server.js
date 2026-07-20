import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || 'JONNY2026';
const MAX_NAME_LENGTH = 40;

const DISTRICTS = [
  { id: 'd1', district: 'District 1', team: 'Rhys', color: '#FF8C00' },
  { id: 'd2', district: 'District 2', team: 'Admin & Aftersales', color: '#1E90FF' },
  { id: 'd3', district: 'District 3', team: 'Tony & Micko', color: '#2E8B57' },
  { id: 'd4', district: 'District 4', team: 'Processing', color: '#8B4513' },
  { id: 'd5', district: 'District 5', team: 'Smix', color: '#FFD700' },
  { id: 'd6', district: 'District 6', team: 'Impaired', color: '#FF69B4' },
  { id: 'd7', district: 'District 7', team: 'Stu', color: '#8A2BE2' },
  { id: 'd8', district: 'District 8', team: 'Hague', color: '#DC143C' },
];
const DISTRICT_IDS = new Set(DISTRICTS.map((d) => d.id));

// A game that has started but not yet been scored. Blocks the next game from
// going live, and is the only state an admin may end a round from.
const IN_PLAY_STATUSES = new Set(['live', 'paused']);

const GAME_NAMES = [
  'Cornucopia Dash',
  'May the fort be ever in your favour',
  'How low can a Tribute go',
  'Rebel Strike',
  'Battle of Panem',
  'The Mocking Jay',
  "Peeta's Donuts",
  'Capitol Knock down',
  'Reaping Apple',
  'Tribute Trials',
];

function freshGames() {
  return GAME_NAMES.map((name, index) => ({
    id: `g${index + 1}`,
    order: index + 1,
    name,
    status: 'pending',
    winner: null,
  }));
}

const defaultData = { games: freshGames(), players: [] };

const adapter = new JSONFile(path.join(__dirname, 'db.json'));
const db = new Low(adapter, defaultData);
await db.read();
db.data ||= defaultData;
await db.write();

const adminTokens = new Set();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'leaderboard.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/state', (req, res) => {
  res.json({ districts: DISTRICTS, games: db.data.games });
});

app.get('/api/leaderboard', (req, res) => {
  res.json(computeLeaderboard());
});

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body || {};
  if (typeof pin !== 'string' || pin !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  const token = randomUUID();
  adminTokens.add(token);
  res.json({ token });
});

const httpServer = createServer(app);
const io = new Server(httpServer);

function computeLeaderboard() {
  const endedGames = db.data.games.filter((g) => g.status === 'ended');
  const leaderboard = db.data.players.map((player) => {
    const score = endedGames.reduce(
      (total, game) => total + (player.votes[game.id] === game.winner ? 1 : 0),
      0
    );
    return {
      id: player.id,
      name: player.name,
      overallPrediction: player.overallPrediction,
      score,
      joinedAt: player.joinedAt,
    };
  });
  leaderboard.sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  return leaderboard.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function broadcastState() {
  io.emit('state:update', { games: db.data.games });
}

function broadcastLeaderboard() {
  io.emit('leaderboard:update', computeLeaderboard());
}

function isValidAdmin(token) {
  return typeof token === 'string' && adminTokens.has(token);
}

io.on('connection', (socket) => {
  socket.emit('state:update', { games: db.data.games });

  socket.on('player:register', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const overallPrediction = payload?.overallPrediction;

    if (!name || name.length > MAX_NAME_LENGTH) {
      return ack({ ok: false, error: 'Please enter a valid name.' });
    }
    if (!DISTRICT_IDS.has(overallPrediction)) {
      return ack({ ok: false, error: 'Please select a valid district prediction.' });
    }

    const player = {
      id: randomUUID(),
      name,
      overallPrediction,
      votes: {},
      joinedAt: Date.now(),
    };
    db.data.players.push(player);
    db.write();

    ack({ ok: true, player, games: db.data.games });
    broadcastLeaderboard();
  });

  socket.on('player:restore', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    const player = db.data.players.find((p) => p.id === payload?.playerId);
    if (!player) {
      return ack({ ok: false });
    }
    ack({ ok: true, player, games: db.data.games });
  });

  socket.on('player:vote', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    const { playerId, gameId, districtId } = payload || {};

    const player = db.data.players.find((p) => p.id === playerId);
    if (!player) {
      return ack({ ok: false, error: 'Player not found. Please rejoin.' });
    }
    const game = db.data.games.find((g) => g.id === gameId);
    if (!game || game.status !== 'live') {
      return ack({ ok: false, error: 'Voting is not open for this round.' });
    }
    if (!DISTRICT_IDS.has(districtId)) {
      return ack({ ok: false, error: 'Please select a valid district.' });
    }
    if (player.votes[gameId]) {
      return ack({ ok: false, error: 'You have already voted for this round.' });
    }

    player.votes[gameId] = districtId;
    db.write();

    ack({ ok: true });

    const votedCount = db.data.players.filter((p) => p.votes[gameId]).length;
    io.emit('votes:update', { gameId, count: votedCount });
  });

  socket.on('admin:goLive', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!isValidAdmin(payload?.token)) {
      return ack({ ok: false, error: 'Not authorized.' });
    }
    const game = db.data.games.find((g) => g.id === payload?.gameId);
    if (!game || game.status !== 'pending') {
      return ack({ ok: false, error: 'That game cannot be started right now.' });
    }
    const alreadyRunning = db.data.games.some((g) => IN_PLAY_STATUSES.has(g.status));
    if (alreadyRunning) {
      return ack({ ok: false, error: 'Another game is already in play.' });
    }
    const priorUnfinished = db.data.games.some(
      (g) => g.order < game.order && g.status !== 'ended'
    );
    if (priorUnfinished) {
      return ack({ ok: false, error: 'Previous games must be completed first.' });
    }

    game.status = 'live';
    db.write();
    broadcastState();
    ack({ ok: true });
  });

  socket.on('admin:pauseGame', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!isValidAdmin(payload?.token)) {
      return ack({ ok: false, error: 'Not authorized.' });
    }
    const game = db.data.games.find((g) => g.id === payload?.gameId);
    if (!game || game.status !== 'live') {
      return ack({ ok: false, error: 'That game is not currently open for voting.' });
    }

    game.status = 'paused';
    db.write();
    broadcastState();
    ack({ ok: true });
  });

  socket.on('admin:resumeGame', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!isValidAdmin(payload?.token)) {
      return ack({ ok: false, error: 'Not authorized.' });
    }
    const game = db.data.games.find((g) => g.id === payload?.gameId);
    if (!game || game.status !== 'paused') {
      return ack({ ok: false, error: 'That game is not currently paused.' });
    }

    game.status = 'live';
    db.write();
    broadcastState();
    ack({ ok: true });
  });

  socket.on('admin:endGame', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!isValidAdmin(payload?.token)) {
      return ack({ ok: false, error: 'Not authorized.' });
    }
    const game = db.data.games.find((g) => g.id === payload?.gameId);
    if (!game || !IN_PLAY_STATUSES.has(game.status)) {
      return ack({ ok: false, error: 'That game is not currently in play.' });
    }
    if (!DISTRICT_IDS.has(payload?.winnerId)) {
      return ack({ ok: false, error: 'Please select a valid winning district.' });
    }

    game.status = 'ended';
    game.winner = payload.winnerId;
    db.write();
    broadcastState();
    broadcastLeaderboard();
    ack({ ok: true });
  });

  socket.on('admin:reset', (payload, callback) => {
    const ack = typeof callback === 'function' ? callback : () => {};
    if (!isValidAdmin(payload?.token)) {
      return ack({ ok: false, error: 'Not authorized.' });
    }

    db.data.players = [];
    db.data.games = freshGames();
    db.write();
    broadcastState();
    broadcastLeaderboard();
    ack({ ok: true });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Hunger Games Sports Day server running at http://localhost:${PORT}`);
  console.log(`Player view:    http://localhost:${PORT}/`);
  console.log(`Leaderboard:    http://localhost:${PORT}/leaderboard`);
  console.log(`Admin panel:    http://localhost:${PORT}/admin`);
});
