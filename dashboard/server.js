const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const { spawn, exec, execFile } = require('child_process');
const os = require('os');
const NUM_CORES = os.cpus().length || 1;

let lastCpuTime = null;
let lastSampleTime = null;

const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'server_config.json');
const SERVER_EXE = path.join(ROOT_DIR, 'server', 'valheim_server.exe');
const LOG_FILE = path.join(ROOT_DIR, 'server.log');
const WORLDS_DIR = path.join(ROOT_DIR, 'worlds_local');

// Valheim String Stable Hash Code Algorithm (Equivalent to StringExtensionMethods.GetStableHashCode)
function getStableHashCode(str) {
  if (!str) return 0;
  let hash1 = 5381;
  let hash2 = hash1;
  for (let i = 0; i < str.length && str.charCodeAt(i) !== 0; i += 2) {
    hash1 = (((hash1 << 5) + hash1) ^ str.charCodeAt(i)) | 0;
    if (i === str.length - 1 || str.charCodeAt(i + 1) === 0) break;
    hash2 = (((hash2 << 5) + hash2) ^ str.charCodeAt(i + 1)) | 0;
  }
  return (hash1 + Math.imul(hash2, 1566083941)) | 0;
}

function generateRandomSeed() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function createWorldMetadata(worldName, seedName, modifiers = []) {
  const seed = getStableHashCode(seedName);
  const uid = BigInt(Math.floor(Math.random() * 1000000000) + 1000000000);

  const buffers = [];

  // packageVersion: 58 (Clean standalone world metadata format)
  const b1 = Buffer.alloc(4);
  b1.writeInt32LE(58, 0);
  buffers.push(b1);

  // worldVersion: 41
  const b2 = Buffer.alloc(4);
  b2.writeInt32LE(41, 0);
  buffers.push(b2);

  // name: length-prefixed string
  const nameBuf = Buffer.from(worldName, 'utf8');
  buffers.push(Buffer.from([nameBuf.length]), nameBuf);

  // seedName: length-prefixed string
  const seedBuf = Buffer.from(seedName, 'utf8');
  buffers.push(Buffer.from([seedBuf.length]), seedBuf);

  // seed: int32
  const b3 = Buffer.alloc(4);
  b3.writeInt32LE(seed, 0);
  buffers.push(b3);

  // uid: int64
  const b4 = Buffer.alloc(8);
  b4.writeBigInt64LE(uid, 0);
  buffers.push(b4);

  // worldGenVersion: 2
  const b5 = Buffer.alloc(4);
  b5.writeInt32LE(2, 0);
  buffers.push(b5);

  // needsDB: 0 (false)
  buffers.push(Buffer.from([0]));

  // startingKeys count
  const b6 = Buffer.alloc(4);
  b6.writeInt32LE(modifiers.length, 0);
  buffers.push(b6);

  for (const mod of modifiers) {
    const modBuf = Buffer.from(mod, 'utf8');
    buffers.push(Buffer.from([modBuf.length]), modBuf);
  }

  // playerHistory count: 0
  const b7 = Buffer.alloc(4);
  b7.writeInt32LE(0, 0);
  buffers.push(b7);

  return Buffer.concat(buffers);
}

function parseWorldFwl(buf) {
  try {
    let offset = 0;
    const packageVersion = buf.readInt32LE(offset); offset += 4;
    const worldVersion = buf.readInt32LE(offset); offset += 4;
    const nameLen = buf.readUInt8(offset); offset += 1;
    const name = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
    const seedLen = buf.readUInt8(offset); offset += 1;
    const seedName = buf.toString('utf8', offset, offset + seedLen); offset += seedLen;
    const seed = buf.readInt32LE(offset); offset += 4;
    return { name, seedName, seed, packageVersion, worldVersion };
  } catch (e) {
    return null;
  }
}

function getInitialPort() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (cfg.dashboardPort) return cfg.dashboardPort;
    }
  } catch (e) {}
  return 8085;
}

const PORT = process.env.PORT || getInitialPort();
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Server state
const state = {
  status: 'offline', // 'offline' | 'starting' | 'online'
  pid: null,
  startTime: null,
  joinCode: null,
  players: new Map(), // key: name -> { name, steamId, joinedAt, deaths }
  playerHistory: new Map(), // key: name -> { name, steamId, deaths }
  playerCount: 0,
  sessionCasualties: 0,
  lastSaveTime: null,
  lastSaveDuration: null,
  lastSaveNumber: null,
  saveHistory: [], // { number, duration, time, isBackup }
  errorList: [], // { message, time }
  activityFeed: [], // { type, title, subtitle, time, badge }
  metrics: {
    cpu: 0,
    ram: 0, // in MB
    uptime: 0 // in seconds
  },
  config: {
    serverName: 'AMABOYS_DServer',
    worldName: '',
    serverPassword: 'secretpassword',
    serverPort: 2456,
    dashboardPort: 8085,
    isPublic: 1,
    crossplay: true,
    saveInterval: 1800,
    backups: 4
  }
};

function pushActivity(type, title, subtitle, badge, isInitial = false) {
  const item = {
    id: Date.now() + Math.random(),
    type, // 'player' | 'save' | 'code' | 'error' | 'event'
    title,
    subtitle,
    badge,
    time: new Date().toLocaleTimeString()
  };
  state.activityFeed.unshift(item);
  if (state.activityFeed.length > 50) state.activityFeed.pop();
  if (!isInitial) broadcast({ type: 'activity', data: item });
}

// Console history ring buffer (keep last 500 lines)
const MAX_LOG_HISTORY = 500;
const logHistory = [];

function addLog(line, isInitial = false) {
  const parsed = parseLogLine(line, isInitial);
  if (logHistory.length >= MAX_LOG_HISTORY) {
    logHistory.shift();
  }
  logHistory.push(parsed);
  if (!isInitial) {
    broadcast({ type: 'log', data: parsed });
  }
  return parsed;
}

let currentLogWorld = null;

function parseLogLine(line, isInitial = false) {
  let category = 'info';
  let cleanLine = line.trimEnd();

  const worldMatch = line.match(/(?:ZNet\.LoadWorld:\s*|Get create world\s+|Loading world:\s*)([^\s(]+)/i);
  if (worldMatch) {
    currentLogWorld = worldMatch[1].trim();
  }

  if (/Error|Exception/i.test(line) && !/Shader/i.test(line) && !/Failed to load world.*LoadError/i.test(line)) {
    category = 'error';
    const errObj = {
      message: cleanLine.substring(0, 180),
      time: new Date().toLocaleTimeString()
    };
    state.errorList.unshift(errObj);
    if (state.errorList.length > 20) state.errorList.pop();
    pushActivity('error', 'Server Warning / Exception', errObj.message, 'error', isInitial);
    if (!isInitial) broadcastStatus();
  } else if (/join code[^\d]*(\d{5,8})|Session ".*?" registered with join code\s+(\d+)|Created new join code\s+(\d+)/i.test(line)) {
    category = 'code';
    const match = line.match(/(?:join code[^\d]*(\d{5,8})|Session ".*?" registered with join code\s+(\d+)|Created new join code\s+(\d+))/i);
    const extractedCode = match ? (match[1] || match[2] || match[3]) : null;
    if (extractedCode) {
      state.joinCode = extractedCode;
      pushActivity('code', 'PlayFab Join Code Ready', `Crossplay join code: ${state.joinCode}`, 'code', isInitial);
      if (!isInitial) broadcastStatus();
    }
  } else if (/Game server connected|Loading:\s*Done|Opened Steam server|Opened PlayFab server/i.test(line)) {
    category = 'event';
    if (!isInitial || state.pid) {
      state.status = 'online';
      // Auto-resolve benign startup load warnings now that the realm is officially up and running
      state.errorList = state.errorList.filter(e => !/Failed to load world|LoadError/i.test(e.message));
      pushActivity('event', 'Valheim Realm Online', 'Game server initialized and listening for vikings', 'event', isInitial);
      if (!isInitial) broadcastStatus();
    }
  } else if (/Player history entry with index \d+:\s+(.*?)\s+\(Steam_(\d+)/.test(line)) {
    const match = line.match(/Player history entry with index \d+:\s+(.*?)\s+\(Steam_(\d+)/);
    if (match) {
      const name = match[1].trim();
      const steamId = match[2].trim();
      const targetWorld = currentLogWorld || (state.config ? state.config.worldName : null);
      if (targetWorld && isWorldInitialized(targetWorld)) {
        const key = targetWorld.toLowerCase();
        let worldMap = worldPlayerArchives.get(key);
        if (!worldMap) {
          worldMap = loadWorldPlayers(targetWorld);
          worldPlayerArchives.set(key, worldMap);
        }
        const existing = worldMap.get(name);
        worldMap.set(name, {
          name,
          steamId,
          deaths: existing ? (existing.deaths || 0) : 0
        });
        saveWorldPlayers(targetWorld, worldMap);
      }
      if (!isInitial) broadcastStatus();
    }
  } else if (/Player joined server.*now (\d+) player\(s\)/i.test(line)) {
    category = 'player';
    const match = line.match(/now (\d+) player\(s\)/i);
    if (match) state.playerCount = parseInt(match[1], 10);
    broadcastStatus();
  } else if (/Got character ZDOID from (.*?) :\s*([-0-9]+:[-0-9]+)/i.test(line)) {
    const match = line.match(/Got character ZDOID from (.*?) :\s*([-0-9]+:[-0-9]+)/i);
    if (match) {
      const charName = match[1].trim();
      const zdoid = match[2].trim();
      const isZeroZdoid = (zdoid === '0:0' || zdoid === '0: 0');
      const targetWorld = (state.config && state.config.worldName) ? state.config.worldName : currentLogWorld;

      let existing = null;
      if (targetWorld && isWorldInitialized(targetWorld)) {
        const key = targetWorld.toLowerCase();
        let worldMap = worldPlayerArchives.get(key);
        if (!worldMap) {
          worldMap = loadWorldPlayers(targetWorld);
          worldPlayerArchives.set(key, worldMap);
        }
        existing = worldMap.get(charName);
      }

      let player = state.players.get(charName);

      if (isZeroZdoid) {
        // Valheim engine logs ZDOID 0:0 during:
        // 1. Initial connection / character selection before spawning into the world
        // 2. Genuine character death (entity destroyed in game)
        // A player CANNOT die unless they have already spawned and materialized in the realm!
        if (player && player.hasSpawned === true) {
          // GENUINE COMBAT CASUALTY
          category = 'death';
          player.deaths = (player.deaths || 0) + 1;
          player.hasSpawned = false; // Marked unspawned until next non-zero ZDOID
          player.currentZdoid = '0:0';

          if (targetWorld && isWorldInitialized(targetWorld)) {
            const key = targetWorld.toLowerCase();
            let worldMap = worldPlayerArchives.get(key);
            if (worldMap) {
              let hist = worldMap.get(charName);
              if (hist) {
                hist.deaths = player.deaths;
              } else {
                worldMap.set(charName, { name: charName, steamId: player.steamId || null, deaths: player.deaths });
              }
              saveWorldPlayers(targetWorld, worldMap);
            }
          }

          state.sessionCasualties = (state.sessionCasualties || 0) + 1;
          pushActivity('death', `VIKING CASUALTY // ${charName} died`, 'Viking succumbed in the realm', 'error');
          broadcastStatus();
        } else {
          // INITIAL CONNECTION / PRE-SPAWN HANDSHAKE (NOT A DEATH)
          category = 'player';
          if (!player) {
            state.players.set(charName, {
              name: charName,
              steamId: existing ? existing.steamId : null,
              joinedAt: new Date().toLocaleTimeString(),
              deaths: existing ? (existing.deaths || 0) : 0,
              hasSpawned: false,
              currentZdoid: '0:0'
            });
            if (state.players.size > state.playerCount) {
              state.playerCount = state.players.size;
            }
          } else {
            player.hasSpawned = false;
            player.currentZdoid = '0:0';
          }
          // Do NOT increment sessionCasualties or player deaths!
          broadcastStatus();
        }
      } else {
        // NON-ZERO ZDOID: Player has spawned / materialized in the world!
        category = 'player';
        const wasSpawned = Boolean(player && player.hasSpawned);
        const deaths = player ? (player.deaths || 0) : (existing ? (existing.deaths || 0) : 0);
        const steamId = player ? (player.steamId || (existing ? existing.steamId : null)) : (existing ? existing.steamId : null);
        const joinedAt = player ? player.joinedAt : new Date().toLocaleTimeString();

        state.players.set(charName, {
          name: charName,
          steamId,
          joinedAt,
          deaths,
          hasSpawned: true,
          currentZdoid: zdoid
        });

        if (targetWorld && isWorldInitialized(targetWorld)) {
          const key = targetWorld.toLowerCase();
          let worldMap = worldPlayerArchives.get(key);
          if (!worldMap) {
            worldMap = loadWorldPlayers(targetWorld);
            worldPlayerArchives.set(key, worldMap);
          }
          worldMap.set(charName, {
            name: charName,
            steamId,
            deaths
          });
          saveWorldPlayers(targetWorld, worldMap);
        }

        if (state.players.size > state.playerCount) {
          state.playerCount = state.players.size;
        }

        if (!player) {
          pushActivity('player', `${charName} arrived in Valheim`, 'Viking entered the realm', 'player');
        } else if (!wasSpawned) {
          pushActivity('player', `${charName} materialized`, 'Viking spawned in the realm', 'player');
        }
        broadcastStatus();
      }
    }
  } else if (/Player connection lost.*now (\d+) player\(s\)/i.test(line) || /RPC_Disconnect/i.test(line)) {
    category = 'player';
    const match = line.match(/now (\d+) player\(s\)/i);
    if (match) {
      state.playerCount = Math.max(0, parseInt(match[1], 10));
      if (state.playerCount === 0) {
        state.players.clear();
      }
      pushActivity('player', 'A Viking left the realm', `Active vikings remaining: ${state.playerCount}`, 'player');
      broadcastStatus();
    }
  } else if (/World save \(5\/5\) done\. Total time \[(.*?)\]/i.test(line)) {
    category = 'save';
    const match = line.match(/done\. Total time \[(.*?)\]/i);
    state.lastSaveDuration = match ? match[1] : 'done';
    state.lastSaveTime = new Date().toLocaleTimeString();
    state.saveHistory.unshift({
      number: state.lastSaveNumber || '#',
      duration: state.lastSaveDuration,
      time: state.lastSaveTime,
      isBackup: false
    });
    if (state.saveHistory.length > 15) state.saveHistory.pop();
    pushActivity('save', 'World Saved to Disk', `Save completed in ${state.lastSaveDuration}`, 'save');
    broadcastStatus();
  } else if (/World save \(1\/5\) .* => Save number (\d+)/i.test(line)) {
    const match = line.match(/Save number (\d+)/i);
    if (match) state.lastSaveNumber = match[1];
  } else if (/World auto backup saved/i.test(line)) {
    category = 'save';
    state.lastSaveTime = new Date().toLocaleTimeString();
    state.saveHistory.unshift({
      number: state.lastSaveNumber || '#',
      duration: 'Auto Backup',
      time: state.lastSaveTime,
      isBackup: true
    });
    if (state.saveHistory.length > 15) state.saveHistory.pop();
    pushActivity('save', 'Auto Backup Snapshot Created', `Backup preserved in worlds_local`, 'save');
    broadcastStatus();
  } else if (/### Save World Thread Started! ###/i.test(line)) {
    category = 'save';
  } else if (/Server has shut down|Net scene destroyed|ShutdownInProgress/i.test(line)) {
    category = 'event';
    pushActivity('event', 'Server Process Stopped', 'The Valheim server has finished shutdown', 'event');
  }

  return {
    raw: cleanLine,
    category,
    timestamp: new Date().toISOString()
  };
}

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

function broadcastStatus() {
  const config = loadConfig();
  const isRealmInit = isWorldInitialized(config.worldName);
  const isOnline = (state.status === 'online') && state.pid;
  const activeJoinCode = (isOnline && isRealmInit) ? state.joinCode : null;
  const payload = {
    type: 'status',
    data: {
      status: state.status,
      pid: state.pid,
      joinCode: activeJoinCode,
      playerCount: state.playerCount,
      players: Array.from(state.players.values()),
      playerHistory: getActiveWorldPlayerHistory(config.worldName),
      sessionCasualties: state.sessionCasualties || 0,
      lastSaveTime: state.lastSaveTime,
      lastSaveDuration: state.lastSaveDuration,
      lastSaveNumber: state.lastSaveNumber,
      saveHistory: state.saveHistory,
      errorList: state.errorList,
      activityFeed: state.activityFeed,
      metrics: state.metrics,
      config,
      isRealmInitialized: isRealmInit
    }
  };
  broadcast(payload);
}

// Config file helper & input sanitizer
function sanitizeConfig(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid configuration payload');
  }

  const clean = {};

  // serverName: string, max 64 chars, strip control characters
  if (typeof input.serverName === 'string') {
    clean.serverName = input.serverName.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 64) || 'AMABOYS_DServer';
  } else {
    clean.serverName = 'AMABOYS_DServer';
  }

  // worldName: alphanumeric, underscore, hyphen, space only; max 64 chars
  if (typeof input.worldName === 'string') {
    const sanitizedWorld = input.worldName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().substring(0, 64);
    clean.worldName = sanitizedWorld;
  } else {
    clean.worldName = '';
  }

  // serverPassword: min 5 chars, max 64 chars, strip control characters
  if (typeof input.serverPassword === 'string') {
    clean.serverPassword = input.serverPassword.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 64);
  } else {
    clean.serverPassword = 'secretpassword';
  }
  if (clean.serverPassword.length < 5) {
    throw new Error('Server password must be at least 5 characters');
  }

  // serverPort: integer 1024 - 65535 (default 2456)
  const port = parseInt(input.serverPort, 10);
  clean.serverPort = (!isNaN(port) && port >= 1024 && port <= 65535) ? port : 2456;

  // dashboardPort: integer 1024 - 65535 (default 8085)
  const dashPort = parseInt(input.dashboardPort, 10);
  clean.dashboardPort = (!isNaN(dashPort) && dashPort >= 1024 && dashPort <= 65535) ? dashPort : 8085;

  // isPublic: 0 or 1
  clean.isPublic = (input.isPublic === 1 || input.isPublic === '1' || input.isPublic === true) ? 1 : 0;

  // crossplay: boolean (default true)
  if (input.crossplay !== undefined && input.crossplay !== null) {
    if (typeof input.crossplay === 'string') {
      clean.crossplay = (input.crossplay.toLowerCase() === 'true' || input.crossplay === '1' || input.crossplay === 'on');
    } else {
      clean.crossplay = Boolean(input.crossplay);
    }
  } else {
    clean.crossplay = true;
  }

  // saveInterval: integer 300 to 86400 (default 1800)
  const interval = parseInt(input.saveInterval, 10);
  clean.saveInterval = (!isNaN(interval) && interval >= 300 && interval <= 86400) ? interval : 1800;

  // backups: integer 1 to 50 (default 4)
  const backups = parseInt(input.backups, 10);
  clean.backups = (!isNaN(backups) && backups >= 1 && backups <= 50) ? backups : 4;

  // preset: optional string, alphanumeric/underscore/dash only, max 32 chars
  if (typeof input.preset === 'string' && input.preset.trim()) {
    clean.preset = input.preset.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 32);
  }

  // modifier: optional string, alphanumeric/underscore/dash/space only, max 64 chars
  if (typeof input.modifier === 'string' && input.modifier.trim()) {
    clean.modifier = input.modifier.replace(/[^a-zA-Z0-9_\- ]/g, '').substring(0, 64);
  }

  return clean;
}

function isWorldInitialized(worldName) {
  if (!worldName || typeof worldName !== 'string') return false;
  const clean = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  if (!clean || clean.toUpperCase() === 'NONE' || clean === '------') return false;
  if (!fs.existsSync(WORLDS_DIR)) return false;
  const resolved = path.resolve(WORLDS_DIR);
  const dirPath = path.join(resolved, clean);
  const fwlPath = path.join(resolved, `${clean}.fwl`);
  const dbPath = path.join(resolved, `${clean}.db`);
  return fs.existsSync(dirPath) || fs.existsSync(fwlPath) || fs.existsSync(dbPath);
}

function getDetectedWorldsCount() {
  if (!fs.existsSync(WORLDS_DIR)) return 0;
  try {
    const resolved = path.resolve(WORLDS_DIR);
    const items = fs.readdirSync(resolved);
    let count = 0;
    for (const item of items) {
      if (item.includes('backup') || item.includes('..') || item.includes('/') || item.includes('\\')) continue;
      const fullPath = path.join(resolved, item);
      if (fs.existsSync(fullPath)) {
        if (fs.statSync(fullPath).isDirectory() || item.endsWith('.fwl')) {
          count++;
        }
      }
    }
    return count;
  } catch (e) {
    return 0;
  }
}

function getWorldConfigPath(worldName) {
  if (!worldName) return null;
  const clean = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  if (!clean) return null;
  const resolvedWorldsDir = path.resolve(WORLDS_DIR);
  const dirPath = path.join(resolvedWorldsDir, clean);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    return path.join(dirPath, 'world_config.json');
  }
  return path.join(resolvedWorldsDir, `${clean}.config.json`);
}

function loadWorldConfig(worldName) {
  const cfgPath = getWorldConfigPath(worldName);
  if (cfgPath && fs.existsSync(cfgPath)) {
    try {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error(`Error reading world config for ${worldName}:`, e.message);
    }
  }
  return null;
}

function saveWorldConfig(worldName, configData) {
  const cfgPath = getWorldConfigPath(worldName);
  if (cfgPath) {
    try {
      const dir = path.dirname(cfgPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(configData, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`Failed to save world config for ${worldName}:`, e.message);
    }
  }
  return false;
}

// Per-World Player Archives Storage
const worldPlayerArchives = new Map(); // key: worldName.toLowerCase() -> Map(charName -> { name, steamId, deaths })

function getWorldPlayersPath(worldName) {
  if (!worldName) return null;
  const clean = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  if (!clean || clean.toUpperCase() === 'NONE' || clean === '------') return null;
  const resolvedWorldsDir = path.resolve(WORLDS_DIR);
  const dirPath = path.join(resolvedWorldsDir, clean);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    return path.join(dirPath, 'clan_archives.json');
  }
  return path.join(resolvedWorldsDir, `${clean}.clan_archives.json`);
}

function loadWorldPlayers(worldName) {
  const filePath = getWorldPlayersPath(worldName);
  if (filePath && fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const map = new Map();
        arr.forEach(p => {
          if (p && p.name) map.set(p.name, p);
        });
        return map;
      }
    } catch (e) {
      console.error(`Error loading clan archives for ${worldName}:`, e.message);
    }
  }
  return new Map();
}

function saveWorldPlayers(worldName, playersMap) {
  const filePath = getWorldPlayersPath(worldName);
  if (filePath && playersMap) {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const arr = Array.from(playersMap.values());
      fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`Error saving clan archives for ${worldName}:`, e.message);
    }
  }
  return false;
}

function getActiveWorldPlayerHistory(worldName) {
  if (!worldName || typeof worldName !== 'string') return [];
  const clean = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  if (!clean || clean.toUpperCase() === 'NONE' || clean === '------') return [];
  if (!isWorldInitialized(clean)) return [];
  const key = clean.toLowerCase();
  let worldMap = worldPlayerArchives.get(key);
  if (!worldMap) {
    worldMap = loadWorldPlayers(clean);
    worldPlayerArchives.set(key, worldMap);
  }
  return Array.from(worldMap.values());
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      state.config = sanitizeConfig(JSON.parse(raw));
    }
    // Overlay world-specific configuration for active world
    const activeWorld = state.config.worldName;
    if (activeWorld) {
      const worldCfg = loadWorldConfig(activeWorld);
      if (worldCfg) {
        if (worldCfg.serverPassword) state.config.serverPassword = worldCfg.serverPassword;
        if (worldCfg.serverName) state.config.serverName = worldCfg.serverName;
        if (worldCfg.preset !== undefined) state.config.preset = worldCfg.preset;
        if (worldCfg.modifier !== undefined) state.config.modifier = worldCfg.modifier;
        if (worldCfg.serverPort) state.config.serverPort = worldCfg.serverPort;
        if (worldCfg.crossplayDirectOnly === true) {
          state.config.crossplay = false;
        } else if (worldCfg.crossplay === false && !worldCfg.crossplayDirectOnly) {
          // Auto-heal: realm had crossplay false due to previous lack of UI toggle
          state.config.crossplay = true;
          worldCfg.crossplay = true;
          saveWorldConfig(activeWorld, worldCfg);
        } else if (worldCfg.crossplay !== undefined) {
          state.config.crossplay = Boolean(worldCfg.crossplay);
        } else {
          state.config.crossplay = true;
        }
        if (worldCfg.isPublic !== undefined) state.config.isPublic = (worldCfg.isPublic === 1 || worldCfg.isPublic === true) ? 1 : 0;
        if (worldCfg.saveInterval) state.config.saveInterval = worldCfg.saveInterval;
        if (worldCfg.backups) state.config.backups = worldCfg.backups;
      } else {
        // Seed world_config.json for active world if not already present
        saveWorldConfig(activeWorld, {
          serverPassword: state.config.serverPassword,
          serverName: state.config.serverName,
          preset: state.config.preset || '',
          modifier: state.config.modifier || '',
          crossplay: state.config.crossplay,
          isPublic: state.config.isPublic,
          serverPort: state.config.serverPort,
          saveInterval: state.config.saveInterval,
          backups: state.config.backups
        });
      }
    }
  } catch (err) {
    console.error('Error reading server_config.json:', err.message);
  }
  return state.config;
}

function saveConfig(rawConfig) {
  const cleanConfig = sanitizeConfig(rawConfig);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cleanConfig, null, 2), 'utf8');
  state.config = cleanConfig;

  // Persist world-specific config into the world's world_config.json
  if (cleanConfig.worldName) {
    saveWorldConfig(cleanConfig.worldName, {
      serverPassword: cleanConfig.serverPassword,
      serverName: cleanConfig.serverName,
      preset: cleanConfig.preset || '',
      modifier: cleanConfig.modifier || '',
      crossplay: cleanConfig.crossplay,
      isPublic: cleanConfig.isPublic,
      serverPort: cleanConfig.serverPort,
      saveInterval: cleanConfig.saveInterval,
      backups: cleanConfig.backups
    });
  }

  broadcastStatus();
  return cleanConfig;
}


// Process management
let serverProcess = null;
let logWatcher = null;
let logPosition = 0;

function checkProcessHealth(callback) {
  execFile('tasklist', ['/FI', 'IMAGENAME eq valheim_server.exe', '/FO', 'CSV', '/NH'], (err, stdout) => {
    const isRunning = !err && stdout && stdout.includes('valheim_server.exe');
    if (isRunning) {
      const match = stdout.match(/"valheim_server\.exe","(\d+)"/i);
      if (match) {
        const foundPid = parseInt(match[1], 10);
        state.pid = foundPid;
        if (state.status === 'offline') {
          state.status = 'online';
          if (!state.startTime) state.startTime = Date.now();
          broadcastStatus();
        }
      }
    } else {
      // Process is not running in tasklist
      const wasOnline = state.status !== 'offline';
      state.status = 'offline';
      state.pid = null;
      state.joinCode = null;
      state.players.clear();
      state.playerCount = 0;
      serverProcess = null;
      if (wasOnline) broadcastStatus();
    }
    if (callback) callback(isRunning);
  });
}

function startLogWatcher() {
  if (logWatcher) return;

  // Initialize position to near end or beginning if file is small
  if (fs.existsSync(LOG_FILE)) {
    try {
      const stats = fs.statSync(LOG_FILE);
      // Read initial last 35KB for history
      const initialReadSize = Math.min(stats.size, 35000);
      logPosition = Math.max(0, stats.size - initialReadSize);
      readLogChunk(true);
    } catch (e) {
      logPosition = 0;
    }
  } else {
    logPosition = 0;
  }

  logWatcher = setInterval(() => {
    readLogChunk(false);
  }, 500);
}

function stopLogWatcher() {
  if (logWatcher) {
    clearInterval(logWatcher);
    logWatcher = null;
  }
}

function readLogChunk(isInitial = false) {
  if (!fs.existsSync(LOG_FILE)) return;
  try {
    const stats = fs.statSync(LOG_FILE);
    if (stats.size < logPosition) {
      // File was truncated or restarted
      logPosition = 0;
    }
    if (stats.size > logPosition) {
      const fd = fs.openSync(LOG_FILE, 'r');
      const length = stats.size - logPosition;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, logPosition);
      fs.closeSync(fd);

      logPosition = stats.size;
      const text = buffer.toString('utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line) => {
        if (line.trim().length > 0) {
          addLog(line, isInitial);
        }
      });
    }
  } catch (err) {
    // ignore temporary file lock issues
  }
}

function startValheimServer() {
  if (state.status !== 'offline') {
    return { success: false, message: 'Server is already running or starting.' };
  }

  const config = loadConfig();
  if (!config.worldName || !config.worldName.trim() || config.worldName.toUpperCase() === 'NONE') {
    return { success: false, message: 'Cannot launch server: No active realm selected. Please create or activate a realm in [REALMS] first.' };
  }

  if (!fs.existsSync(SERVER_EXE)) {
    return { success: false, message: 'valheim_server.exe not found at ' + SERVER_EXE };
  }

  // Clear previous session state
  state.status = 'starting';
  state.joinCode = null;
  state.players.clear();
  state.playerCount = 0;
  state.sessionCasualties = 0;
  state.errorList = [];
  state.startTime = Date.now();
  broadcastStatus();

  // Reset log file for new run or archive
  logPosition = 0;

  const args = [
    '-nographics',
    '-batchmode',
    '-name', config.serverName || 'AMABOYS_DServer',
    '-port', String(config.serverPort || 2456),
    '-world', config.worldName || 'AMABOYS',
    '-password', config.serverPassword || 'amaboys',
    '-savedir', ROOT_DIR,
    '-public', String(config.isPublic ?? 1),
    '-saveinterval', String(config.saveInterval || 1800),
    '-backups', String(config.backups || 4),
    '-logFile', LOG_FILE
  ];

  const useCrossplay = (config.crossplay !== false && config.crossplay !== 'false' && config.crossplay !== 0);
  if (useCrossplay) {
    args.push('-crossplay');
  }
  if (config.preset && config.preset.trim()) {
    args.push('-preset', config.preset.trim());
  }
  if (config.modifier && config.modifier.trim()) {
    args.push('-modifier', config.modifier.trim());
  }

  addLog(`[LAUNCHER] Starting Valheim Dedicated Server: ${SERVER_EXE}`);
  addLog(`[LAUNCHER] Arguments: ${args.join(' ')}`);

  try {
    serverProcess = spawn(SERVER_EXE, args, {
      cwd: ROOT_DIR,
      env: { ...process.env, SteamAppId: '892970' },
      windowsHide: true,
      stdio: 'ignore'
    });

    state.pid = serverProcess.pid;
    addLog(`[LAUNCHER] Server process spawned with PID: ${state.pid}`);

    serverProcess.on('error', (err) => {
      addLog(`[ERROR] Failed to start server process: ${err.message}`);
      state.status = 'offline';
      state.pid = null;
      broadcastStatus();
    });

    serverProcess.on('exit', (code, signal) => {
      addLog(`[LAUNCHER] Server process exited with code ${code}, signal ${signal}`);
      state.status = 'offline';
      state.pid = null;
      state.joinCode = null;
      state.players.clear();
      state.playerCount = 0;
      serverProcess = null;
      broadcastStatus();
    });

    startLogWatcher();
    broadcastStatus();
    return { success: true, pid: state.pid };
  } catch (err) {
    state.status = 'offline';
    state.pid = null;
    broadcastStatus();
    return { success: false, message: err.message };
  }
}

function stopValheimServer() {
  addLog('[LAUNCHER] Shutdown signal requested. Stopping Valheim server...');
  const pidToKill = parseInt(state.pid, 10);

  if (Number.isInteger(pidToKill) && pidToKill > 0) {
    execFile('taskkill', ['/T', '/PID', String(pidToKill)], (err) => {
      if (err) {
        execFile('taskkill', ['/F', '/T', '/PID', String(pidToKill)], () => {});
      }
    });
  } else {
    execFile('taskkill', ['/F', '/T', '/IM', 'valheim_server.exe'], () => {});
  }

  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
    serverProcess = null;
  }

  state.status = 'offline';
  state.pid = null;
  state.joinCode = null;
  state.players.clear();
  state.playerCount = 0;
  state.sessionCasualties = 0;
  broadcastStatus();

  return { success: true, message: 'Server shutdown sequence initiated.' };
}

function restartValheimServer() {
  addLog('[LAUNCHER] Reboot sequence initiated...');
  stopValheimServer();
  setTimeout(() => {
    startValheimServer();
  }, 3500);
  return { success: true, message: 'Restart initiated.' };
}

// Telemetry Poller (CPU, RAM, Uptime) & Process Health Check
setInterval(() => {
  checkProcessHealth();

  if (state.status === 'offline') {
    state.metrics.cpu = 0;
    state.metrics.ram = 0;
    state.metrics.uptime = 0;
    lastCpuTime = null;
    lastSampleTime = null;
    return;
  }

  if (state.startTime) {
    state.metrics.uptime = Math.floor((Date.now() - state.startTime) / 1000);
  }

  const safePid = parseInt(state.pid, 10);
  if (Number.isInteger(safePid) && safePid > 0) {
    // Query process stats safely via execFile without shell expansion
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Get-Process -Id ${safePid} -ErrorAction SilentlyContinue | Select-Object -Property WorkingSet64, CPU | ConvertTo-Json`
      ],
      (err, stdout) => {
        if (!err && stdout && stdout.trim()) {
          try {
            const data = JSON.parse(stdout);
            if (data) {
              const ramMb = Math.round((data.WorkingSet64 || 0) / (1024 * 1024));
              state.metrics.ram = ramMb;

              const currentCpuTime = typeof data.CPU === 'number' ? data.CPU : null;
              const now = Date.now();

              if (currentCpuTime !== null && lastCpuTime !== null && lastSampleTime !== null) {
                const deltaCpuSec = currentCpuTime - lastCpuTime;
                const deltaRealSec = (now - lastSampleTime) / 1000;
                if (deltaRealSec > 0 && deltaCpuSec >= 0) {
                  // Percentage normalized to total CPU capacity (0% to 100%)
                  const cpuPercent = (deltaCpuSec / (deltaRealSec * NUM_CORES)) * 100;
                  state.metrics.cpu = parseFloat(Math.min(100, Math.max(0, cpuPercent)).toFixed(1));
                }
              }

              lastCpuTime = currentCpuTime;
              lastSampleTime = now;

              broadcast({
                type: 'metrics',
                data: state.metrics
              });
            }
          } catch (jsonErr) {
            // ignore JSON parse
          }
        }
      }
    );
  }
}, 3000);

// API Routes
app.get('/api/status', (req, res) => {
  const config = loadConfig();
  const isRealmInit = isWorldInitialized(config.worldName);
  const detectedCount = getDetectedWorldsCount();
  const isOnline = (state.status === 'online') && state.pid;
  const activeJoinCode = (isOnline && isRealmInit) ? state.joinCode : null;
  res.json({
    status: state.status,
    pid: state.pid,
    joinCode: activeJoinCode,
    playerCount: state.playerCount,
    players: Array.from(state.players.values()),
    playerHistory: getActiveWorldPlayerHistory(config.worldName),
    sessionCasualties: state.sessionCasualties || 0,
    lastSaveTime: state.lastSaveTime,
    lastSaveDuration: state.lastSaveDuration,
    lastSaveNumber: state.lastSaveNumber,
    saveHistory: state.saveHistory,
    errorList: state.errorList,
    activityFeed: state.activityFeed,
    metrics: state.metrics,
    config,
    isRealmInitialized: isRealmInit,
    detectedWorldsCount: detectedCount
  });
});

app.post('/api/test/combat', (req, res) => {
  const { type, player } = req.body || {};
  if (type !== 'death') {
    return res.status(400).json({ error: 'Invalid combat event type. Must be "death".' });
  }

  const rawName = typeof player === 'string' ? player : (state.players.size > 0 ? state.players.keys().next().value : 'Black Downey Jr.');
  const safePlayer = String(rawName).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().substring(0, 32) || 'Warrior';

  let p = state.players.get(safePlayer);
  if (p) p.deaths = (p.deaths || 0) + 1;

  const config = loadConfig();
  const activeWorld = config ? config.worldName : null;
  if (activeWorld && isWorldInitialized(activeWorld)) {
    const key = activeWorld.toLowerCase();
    let worldMap = worldPlayerArchives.get(key);
    if (!worldMap) {
      worldMap = loadWorldPlayers(activeWorld);
      worldPlayerArchives.set(key, worldMap);
    }
    let h = worldMap.get(safePlayer);
    if (h) h.deaths = (h.deaths || 0) + 1;
    else worldMap.set(safePlayer, { name: safePlayer, steamId: null, deaths: 1 });
    saveWorldPlayers(activeWorld, worldMap);
  }
  state.sessionCasualties = (state.sessionCasualties || 0) + 1;
  pushActivity('death', `VIKING CASUALTY // ${safePlayer} died`, 'Combat casualty logged in realm', 'error');

  broadcastStatus();
  res.json({ success: true, sessionCasualties: state.sessionCasualties });
});

app.post('/api/diagnostics/reset-casualties', (req, res) => {
  state.sessionCasualties = 0;
  for (const player of state.players.values()) {
    player.deaths = 0;
  }
  const config = loadConfig();
  const activeWorld = config ? config.worldName : null;
  if (activeWorld && isWorldInitialized(activeWorld)) {
    const key = activeWorld.toLowerCase();
    let worldMap = worldPlayerArchives.get(key);
    if (!worldMap) {
      worldMap = loadWorldPlayers(activeWorld);
      worldPlayerArchives.set(key, worldMap);
    }
    for (const player of worldMap.values()) {
      player.deaths = 0;
    }
    saveWorldPlayers(activeWorld, worldMap);
  }
  pushActivity('event', 'Combat Casualties Cleared', 'Session death tally reset to 0 by administrator', 'event');
  broadcastStatus();
  res.json({ success: true, sessionCasualties: 0 });
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: logHistory });
});

app.post('/api/server/start', (req, res) => {
  const result = startValheimServer();
  res.json(result);
});

app.post('/api/server/stop', (req, res) => {
  const result = stopValheimServer();
  res.json(result);
});

app.post('/api/server/restart', (req, res) => {
  const result = restartValheimServer();
  res.json(result);
});

app.post('/api/server/toggle-crossplay', (req, res) => {
  const config = loadConfig();
  const targetWorld = (req.body && req.body.worldName) ? req.body.worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim() : config.worldName;
  
  const newCrossplay = (req.body && typeof req.body.crossplay === 'boolean') 
    ? req.body.crossplay 
    : !config.crossplay;
    
  config.crossplay = newCrossplay;
  saveConfig(config);
  
  if (targetWorld) {
    const worldCfg = loadWorldConfig(targetWorld) || {};
    worldCfg.crossplay = newCrossplay;
    worldCfg.crossplayDirectOnly = !newCrossplay;
    saveWorldConfig(targetWorld, worldCfg);
  }
  
  const statusMsg = newCrossplay ? 'ENABLED (PlayFab Party Join Token)' : 'DISABLED (Direct IP Only)';
  addLog(`[CONFIG] Crossplay protocol changed to: ${statusMsg}`);
  pushActivity('event', 'Crossplay Configuration Updated', `Network protocol: ${statusMsg}`, 'event');
  
  const isCurrentlyActive = (state.status === 'online' || state.status === 'starting');
  if (isCurrentlyActive) {
    restartValheimServer();
  } else {
    broadcastStatus();
  }
  
  res.json({
    success: true,
    crossplay: newCrossplay,
    restarted: isCurrentlyActive,
    message: `Crossplay protocol set to ${statusMsg}.${isCurrentlyActive ? ' Server restarting to initialize PlayFab cloud gateway.' : ''}`
  });
});

app.post('/api/diagnostics/clear', (req, res) => {
  state.errorList = [];
  broadcastStatus();
  res.json({ success: true, message: 'Diagnostics alerts cleared.' });
});

app.post('/api/dashboard/shutdown', (req, res) => {
  res.json({ success: true, message: 'Dashboard server is shutting down.' });
  addLog('[SYS_MSG] Dashboard server shutdown initiated via web portal.');
  setTimeout(() => {
    try {
      const pidFile = path.join(ROOT_DIR, 'cache', 'dashboard.pid');
      if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    } catch (e) {}
    process.exit(0);
  }, 500);
});

app.get('/api/config', (req, res) => {
  const worldName = req.query.world;
  if (worldName && typeof worldName === 'string') {
    const cleanWorldName = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
    const globalCfg = loadConfig();
    const worldCfg = loadWorldConfig(cleanWorldName);
    const merged = Object.assign({}, globalCfg, worldCfg || {}, {
      worldName: cleanWorldName,
      isCurrentActive: cleanWorldName.toLowerCase() === (globalCfg.worldName || '').toLowerCase()
    });
    return res.json(merged);
  }
  const cfg = loadConfig();
  res.json(Object.assign({}, cfg, { isCurrentActive: true }));
});

app.post('/api/config', (req, res) => {
  try {
    const targetWorld = (req.body.worldName || state.config.worldName || 'AMABOYS').replace(/[^a-zA-Z0-9_\-]/g, '').trim();
    const makeActive = req.body.makeActive === true || req.body.makeActive === 'true' || req.body.makeActive === 'on';

    const cleanConfig = sanitizeConfig(Object.assign({}, req.body, { worldName: targetWorld }));

    // Save into world's world_config.json
    saveWorldConfig(targetWorld, {
      serverPassword: cleanConfig.serverPassword,
      serverName: cleanConfig.serverName,
      preset: cleanConfig.preset || '',
      modifier: cleanConfig.modifier || '',
      crossplay: cleanConfig.crossplay,
      crossplayDirectOnly: !cleanConfig.crossplay,
      isPublic: cleanConfig.isPublic,
      serverPort: cleanConfig.serverPort,
      saveInterval: cleanConfig.saveInterval,
      backups: cleanConfig.backups
    });

    const isCurrentActive = targetWorld.toLowerCase() === (state.config.worldName || '').toLowerCase();

    if (makeActive || isCurrentActive) {
      cleanConfig.worldName = targetWorld;
      saveConfig(cleanConfig);
      addLog(`[CONFIG] Realm configuration updated for active world "${targetWorld}"`);
    } else {
      addLog(`[CONFIG] Realm configuration saved for offline world "${targetWorld}"`);
    }

    res.json({ success: true, config: cleanConfig, targetWorld, isActive: makeActive || isCurrentActive });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

app.get('/api/backups', (req, res) => {
  try {
    if (!fs.existsSync(WORLDS_DIR)) {
      return res.json({ backups: [] });
    }
    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    const items = fs.readdirSync(WORLDS_DIR);
    const backups = items
      .filter((name) => name.includes('backup') && !name.includes('..') && !name.includes('/') && !name.includes('\\'))
      .map((name) => {
        const itemPath = path.resolve(resolvedWorldsDir, name);
        if (!itemPath.startsWith(resolvedWorldsDir)) return null;
        const stats = fs.statSync(itemPath);
        return {
          name,
          isDir: stats.isDirectory(),
          created: stats.birthtime || stats.mtime,
          size: stats.isDirectory() ? getDirSize(itemPath) : stats.size
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/create', (req, res) => {
  try {
    const config = loadConfig();
    const rawWorld = config.worldName || 'AMABOYS';
    const safeWorldName = path.basename(String(rawWorld).replace(/[^a-zA-Z0-9_\- ]/g, ''));
    if (!safeWorldName) {
      return res.status(400).json({ success: false, message: 'Invalid world name configuration.' });
    }

    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    const sourcePath = path.resolve(resolvedWorldsDir, safeWorldName);

    // Verify source path stays strictly within WORLDS_DIR
    if (!sourcePath.startsWith(resolvedWorldsDir) || sourcePath === resolvedWorldsDir) {
      return res.status(400).json({ success: false, message: 'Path traversal detected.' });
    }

    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, message: `World directory ${safeWorldName} not found.` });
    }

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const backupName = `${safeWorldName}_backup_manual-${ts}`;
    const destPath = path.resolve(resolvedWorldsDir, backupName);

    if (!destPath.startsWith(resolvedWorldsDir)) {
      return res.status(400).json({ success: false, message: 'Invalid backup destination.' });
    }

    fs.cpSync(sourcePath, destPath, { recursive: true });
    addLog(`[BACKUP] Created manual snapshot: ${backupName}`);

    res.json({ success: true, backupName });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/backups/restore', (req, res) => {
  try {
    if (state.status !== 'offline') {
      return res.status(409).json({
        success: false,
        message: 'Cannot restore snapshot while server is running. Please terminate the server process first.'
      });
    }

    const { backupName, targetWorld: requestedWorld } = req.body || {};
    if (!backupName || typeof backupName !== 'string') {
      return res.status(400).json({ success: false, message: 'Backup name is required.' });
    }

    const safeBackupName = path.basename(backupName);
    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    const backupPath = path.resolve(resolvedWorldsDir, safeBackupName);

    if (!backupPath.startsWith(resolvedWorldsDir) || !fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, message: `Backup "${safeBackupName}" not found.` });
    }

    let targetWorld = requestedWorld;
    if (!targetWorld || typeof targetWorld !== 'string') {
      const match = safeBackupName.match(/^(.+?)_backup_/);
      targetWorld = match ? match[1] : safeBackupName.split('_')[0];
    }
    const safeTargetWorld = path.basename(String(targetWorld).replace(/[^a-zA-Z0-9_\- ]/g, ''));
    if (!safeTargetWorld) {
      return res.status(400).json({ success: false, message: 'Could not determine target world for restore.' });
    }

    const targetPath = path.resolve(resolvedWorldsDir, safeTargetWorld);
    if (!targetPath.startsWith(resolvedWorldsDir) || targetPath === resolvedWorldsDir) {
      return res.status(400).json({ success: false, message: 'Invalid target world destination.' });
    }

    // Safety: Take a pre-restore backup of existing world before overwriting
    if (fs.existsSync(targetPath)) {
      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const safetyBackupName = `${safeTargetWorld}_backup_prerestore-${ts}`;
      const safetyPath = path.resolve(resolvedWorldsDir, safetyBackupName);
      try {
        fs.cpSync(targetPath, safetyPath, { recursive: true });
        addLog(`[BACKUP] Created automatic pre-restore safety snapshot: ${safetyBackupName}`);
      } catch (e) {
        console.error('Failed to create pre-restore safety backup:', e);
      }
    }

    // Perform restore
    const isDir = fs.statSync(backupPath).isDirectory();
    if (isDir) {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
      fs.cpSync(backupPath, targetPath, { recursive: true });
    } else {
      fs.copyFileSync(backupPath, targetPath);
    }

    addLog(`[RESTORE] Successfully restored realm "${safeTargetWorld}" from snapshot "${safeBackupName}"`);
    res.json({
      success: true,
      message: `Realm "${safeTargetWorld}" successfully restored from snapshot.`,
      targetWorld: safeTargetWorld,
      backupName: safeBackupName
    });
  } catch (err) {
    console.error('Error restoring backup:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/worlds', (req, res) => {
  try {
    const config = loadConfig();
    const activeWorld = config.worldName || 'AMABOYS';
    if (!fs.existsSync(WORLDS_DIR)) {
      return res.json({ worlds: [], activeWorld });
    }
    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    const items = fs.readdirSync(WORLDS_DIR);
    const worlds = [];

    for (const item of items) {
      if (item.includes('backup') || item.includes('..') || item.includes('/') || item.includes('\\')) continue;
      const itemPath = path.resolve(resolvedWorldsDir, item);
      if (!itemPath.startsWith(resolvedWorldsDir)) continue;

      const stat = fs.statSync(itemPath);
      let seedName = 'Standard Seed';
      let seedHash = null;

      if (stat.isDirectory()) {
        const subfiles = fs.readdirSync(itemPath);
        const fwlFiles = subfiles.filter(f => f.endsWith('.fwl2') || f.endsWith('.fwl')).sort().reverse();
        if (fwlFiles.length > 0) {
          try {
            const buf = fs.readFileSync(path.join(itemPath, fwlFiles[0]));
            const meta = parseWorldFwl(buf);
            if (meta) {
              seedName = meta.seedName;
              seedHash = meta.seed;
            }
          } catch (e) {}
        }
        const worldCfg = loadWorldConfig(item) || {};
        const isActive = item.toLowerCase() === activeWorld.toLowerCase();
        worlds.push({
          name: item,
          seedName,
          seedHash,
          isActive,
          isDir: true,
          size: getDirSize(itemPath),
          modified: stat.mtime,
          password: worldCfg.serverPassword || (isActive ? config.serverPassword : 'amaboys'),
          preset: worldCfg.preset !== undefined ? worldCfg.preset : (isActive ? (config.preset || '') : ''),
          modifier: worldCfg.modifier !== undefined ? worldCfg.modifier : (isActive ? (config.modifier || '') : ''),
          serverName: worldCfg.serverName || `${item}_DServer`
        });
      } else if (item.endsWith('.fwl')) {
        const base = path.basename(item, '.fwl');
        try {
          const buf = fs.readFileSync(itemPath);
          const meta = parseWorldFwl(buf);
          if (meta) {
            seedName = meta.seedName;
            seedHash = meta.seed;
          }
        } catch (e) {}
        const worldCfg = loadWorldConfig(base) || {};
        const isActive = base.toLowerCase() === activeWorld.toLowerCase();
        worlds.push({
          name: base,
          seedName,
          seedHash,
          isActive,
          isDir: false,
          size: stat.size,
          modified: stat.mtime,
          password: worldCfg.serverPassword || (isActive ? config.serverPassword : 'amaboys'),
          preset: worldCfg.preset !== undefined ? worldCfg.preset : (isActive ? (config.preset || '') : ''),
          modifier: worldCfg.modifier !== undefined ? worldCfg.modifier : (isActive ? (config.modifier || '') : ''),
          serverName: worldCfg.serverName || `${base}_DServer`
        });
      }
    }

    res.json({ worlds, activeWorld });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/worlds/create', (req, res) => {
  try {
    const { worldName, seed, preset, modifier, setAsActive, password, crossplay } = req.body || {};
    const useCrossplay = (crossplay !== undefined) ? (crossplay === true || crossplay === 'true' || crossplay === 1 || crossplay === '1' || crossplay === 'on') : true;
    if (!worldName || typeof worldName !== 'string') {
      return res.status(400).json({ success: false, message: 'World name is required.' });
    }

    const cleanWorldName = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim().substring(0, 48);
    if (!cleanWorldName) {
      return res.status(400).json({ success: false, message: 'Invalid world name. Use alphanumeric characters, hyphens, or underscores.' });
    }

    if (!password || typeof password !== 'string' || password.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Realm password is required and must contain at least 5 characters.' });
    }
    const cleanPassword = password.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 64);

    const cleanSeed = (typeof seed === 'string' && seed.trim().length > 0)
      ? seed.trim().substring(0, 32)
      : generateRandomSeed();

    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    if (!fs.existsSync(resolvedWorldsDir)) {
      fs.mkdirSync(resolvedWorldsDir, { recursive: true });
    }

    const targetWorldDir = path.join(resolvedWorldsDir, cleanWorldName);
    if (!targetWorldDir.startsWith(resolvedWorldsDir)) {
      return res.status(400).json({ success: false, message: 'Invalid target directory path.' });
    }

    if (fs.existsSync(targetWorldDir)) {
      return res.status(400).json({ success: false, message: `World "${cleanWorldName}" already exists.` });
    }

    fs.mkdirSync(targetWorldDir, { recursive: true });

    const modifiers = [];
    if (preset && typeof preset === 'string' && preset.trim()) {
      modifiers.push(`preset ${preset.trim()}`);
    }
    if (modifier && typeof modifier === 'string' && modifier.trim()) {
      modifiers.push(modifier.trim());
    }

    const fwlBuffer = createWorldMetadata(cleanWorldName, cleanSeed, modifiers);
    fs.writeFileSync(path.join(targetWorldDir, '_main.0.fwl2'), fwlBuffer);

    // Save world-specific configuration inside world directory
    saveWorldConfig(cleanWorldName, {
      serverPassword: cleanPassword,
      serverName: `${cleanWorldName}_DServer`,
      preset: preset && typeof preset === 'string' ? preset.trim() : '',
      modifier: modifier && typeof modifier === 'string' ? modifier.trim() : '',
      crossplay: useCrossplay,
      crossplayDirectOnly: !useCrossplay,
      isPublic: 1,
      serverPort: 2456,
      saveInterval: 1800,
      backups: 4
    });

    addLog(`[WORLD_GEN] Created new realm: "${cleanWorldName}" with seed: "${cleanSeed}" (Hash: ${getStableHashCode(cleanSeed)})`);
    pushActivity('event', 'New Realm Initialized', `Realm "${cleanWorldName}" initialized with secure password`, 'event');

    let isNowActive = false;
    if (setAsActive !== false) {
      const currentConfig = loadConfig();
      if (currentConfig.worldName !== cleanWorldName) {
        state.joinCode = null;
      }
      currentConfig.worldName = cleanWorldName;
      currentConfig.serverPassword = cleanPassword;
      currentConfig.serverName = `${cleanWorldName}_DServer`;
      currentConfig.crossplay = useCrossplay;
      currentConfig.crossplayDirectOnly = !useCrossplay;
      currentConfig.isPublic = 1;
      if (preset && typeof preset === 'string') currentConfig.preset = preset.trim();
      if (modifier && typeof modifier === 'string') currentConfig.modifier = modifier.trim();
      saveConfig(currentConfig);
      isNowActive = true;
      addLog(`[CONFIG] Active realm updated to: "${cleanWorldName}" (Password & parameters bound)`);
      broadcastStatus();
    }

    res.json({
      success: true,
      world: {
        name: cleanWorldName,
        seedName: cleanSeed,
        seedHash: getStableHashCode(cleanSeed),
        password: cleanPassword,
        isActive: isNowActive
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/worlds/select', (req, res) => {
  try {
    const { worldName } = req.body || {};
    if (!worldName || typeof worldName !== 'string') {
      return res.status(400).json({ success: false, message: 'World name is required.' });
    }

    const cleanWorldName = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim().substring(0, 48);
    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    const targetWorldDir = path.join(resolvedWorldsDir, cleanWorldName);
    const targetWorldFwl = path.join(resolvedWorldsDir, `${cleanWorldName}.fwl`);

    if (!fs.existsSync(targetWorldDir) && !fs.existsSync(targetWorldFwl)) {
      return res.status(404).json({ success: false, message: `World "${cleanWorldName}" not found.` });
    }

    const currentConfig = loadConfig();
    if (currentConfig.worldName !== cleanWorldName) {
      state.joinCode = null;
    }
    currentConfig.worldName = cleanWorldName;

    // Load this world's tied configuration!
    const worldCfg = loadWorldConfig(cleanWorldName);
    if (worldCfg) {
      if (worldCfg.serverPassword) currentConfig.serverPassword = worldCfg.serverPassword;
      if (worldCfg.serverName) currentConfig.serverName = worldCfg.serverName;
      if (worldCfg.preset !== undefined) currentConfig.preset = worldCfg.preset;
      if (worldCfg.modifier !== undefined) currentConfig.modifier = worldCfg.modifier;
      if (worldCfg.isPublic !== undefined) currentConfig.isPublic = (worldCfg.isPublic === 1 || worldCfg.isPublic === true) ? 1 : 0;
      if (worldCfg.crossplay !== undefined) currentConfig.crossplay = Boolean(worldCfg.crossplay);
      if (worldCfg.serverPort) currentConfig.serverPort = worldCfg.serverPort;
      if (worldCfg.saveInterval) currentConfig.saveInterval = worldCfg.saveInterval;
      if (worldCfg.backups) currentConfig.backups = worldCfg.backups;
    } else {
      // Seed world_config.json if not present yet
      saveWorldConfig(cleanWorldName, {
        serverPassword: currentConfig.serverPassword,
        serverName: currentConfig.serverName || `${cleanWorldName}_DServer`,
        preset: currentConfig.preset || '',
        modifier: currentConfig.modifier || '',
        crossplay: currentConfig.crossplay,
        isPublic: currentConfig.isPublic,
        serverPort: currentConfig.serverPort,
        saveInterval: currentConfig.saveInterval,
        backups: currentConfig.backups
      });
    }

    saveConfig(currentConfig);

    addLog(`[CONFIG] Active realm switched to: "${cleanWorldName}" (Password & parameters synced)`);
    pushActivity('event', 'Active Realm Switched', `Realm set to "${cleanWorldName}"`, 'event');
    broadcastStatus();

    res.json({ success: true, activeWorld: cleanWorldName, config: currentConfig });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/worlds/local-client-detect', (req, res) => {
  try {
    const candidates = [];
    if (process.env.USERPROFILE) {
      candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'IronGate', 'Valheim', 'worlds_local'));
      candidates.push(path.join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'IronGate', 'Valheim', 'worlds'));
    }
    if (process.env.HOME) {
      candidates.push(path.join(process.env.HOME, '.config', 'unity3d', 'IronGate', 'Valheim', 'worlds_local'));
      candidates.push(path.join(process.env.HOME, '.config', 'unity3d', 'IronGate', 'Valheim', 'worlds'));
    }

    const detected = [];
    const seen = new Set();

    for (const candDir of candidates) {
      if (!fs.existsSync(candDir)) continue;
      try {
        const files = fs.readdirSync(candDir);
        for (const file of files) {
          if (file.endsWith('.fwl') && !file.includes('backup')) {
            const worldName = path.basename(file, '.fwl');
            if (seen.has(worldName.toLowerCase())) continue;
            seen.add(worldName.toLowerCase());

            const fwlPath = path.join(candDir, file);
            const dbPath = path.join(candDir, `${worldName}.db`);
            const hasDb = fs.existsSync(dbPath);
            const fwlStat = fs.statSync(fwlPath);
            const dbStat = hasDb ? fs.statSync(dbPath) : null;
            const totalSize = fwlStat.size + (dbStat ? dbStat.size : 0);

            let seedName = 'Standard Seed';
            try {
              const meta = parseWorldFwl(fs.readFileSync(fwlPath));
              if (meta && meta.seedName) seedName = meta.seedName;
            } catch (e) {}

            detected.push({
              name: worldName,
              sourceDir: candDir,
              hasDb,
              hasFwl: true,
              seedName,
              size: totalSize,
              modified: dbStat ? dbStat.mtime : fwlStat.mtime
            });
          }
        }
      } catch (e) {}
    }

    res.json({
      success: true,
      detectedWorlds: detected,
      serverWorldsDir: path.resolve(WORLDS_DIR)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/worlds/import-local', (req, res) => {
  try {
    const { worldName, sourceDir, password, setAsActive } = req.body || {};
    if (!worldName || typeof worldName !== 'string') {
      return res.status(400).json({ success: false, message: 'World name is required.' });
    }
    const cleanName = worldName.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Invalid world name.' });
    }

    let searchDir = sourceDir;
    if (!searchDir || !fs.existsSync(searchDir)) {
      if (process.env.USERPROFILE) {
        searchDir = path.join(process.env.USERPROFILE, 'AppData', 'LocalLow', 'IronGate', 'Valheim', 'worlds_local');
      }
    }
    if (!searchDir || !fs.existsSync(searchDir)) {
      return res.status(404).json({ success: false, message: 'Local Valheim worlds folder not found.' });
    }

    const srcFwl = path.join(searchDir, `${cleanName}.fwl`);
    const srcDb = path.join(searchDir, `${cleanName}.db`);

    if (!fs.existsSync(srcFwl)) {
      return res.status(404).json({ success: false, message: `Source file ${cleanName}.fwl not found in local directory.` });
    }

    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    if (!fs.existsSync(resolvedWorldsDir)) fs.mkdirSync(resolvedWorldsDir, { recursive: true });

    const destFwl = path.join(resolvedWorldsDir, `${cleanName}.fwl`);
    const destDb = path.join(resolvedWorldsDir, `${cleanName}.db`);

    fs.copyFileSync(srcFwl, destFwl);
    if (fs.existsSync(srcDb)) {
      fs.copyFileSync(srcDb, destDb);
    }

    const cleanPassword = (typeof password === 'string' && password.trim().length >= 5)
      ? password.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 64)
      : 'amaboys';

    saveWorldConfig(cleanName, {
      serverPassword: cleanPassword,
      serverName: `${cleanName}_DServer`,
      preset: '',
      modifier: '',
      crossplay: true,
      crossplayDirectOnly: false,
      isPublic: 1,
      serverPort: 2456,
      saveInterval: 1800,
      backups: 4
    });

    addLog(`[IMPORT] Local world "${cleanName}" imported into dedicated server matrix.`);
    pushActivity('event', 'Realm Imported', `World "${cleanName}" imported from local client folder`, 'event');

    let isNowActive = false;
    if (setAsActive !== false) {
      const currentConfig = loadConfig();
      if (currentConfig.worldName !== cleanName) {
        state.joinCode = null;
      }
      currentConfig.worldName = cleanName;
      currentConfig.serverPassword = cleanPassword;
      currentConfig.serverName = `${cleanName}_DServer`;
      currentConfig.crossplay = true;
      currentConfig.crossplayDirectOnly = false;
      saveConfig(currentConfig);
      isNowActive = true;
      addLog(`[CONFIG] Active realm updated to imported world: "${cleanName}"`);
      broadcastStatus();
    }

    res.json({
      success: true,
      worldName: cleanName,
      isActive: isNowActive,
      message: `World "${cleanName}" imported successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/worlds/upload-file', express.raw({ type: 'application/octet-stream', limit: '350mb' }), (req, res) => {
  try {
    const worldName = (req.query.world || '').replace(/[^a-zA-Z0-9_\-]/g, '').trim();
    const ext = (req.query.ext || '').toLowerCase();

    if (!worldName || (ext !== '.fwl' && ext !== '.db')) {
      return res.status(400).json({ success: false, message: 'Valid world name and extension (.fwl or .db) required.' });
    }

    if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ success: false, message: 'Empty or invalid file payload.' });
    }

    const resolvedWorldsDir = path.resolve(WORLDS_DIR);
    if (!fs.existsSync(resolvedWorldsDir)) fs.mkdirSync(resolvedWorldsDir, { recursive: true });

    const targetFile = path.join(resolvedWorldsDir, `${worldName}${ext}`);
    fs.writeFileSync(targetFile, req.body);

    if (ext === '.fwl') {
      const existingCfg = loadWorldConfig(worldName);
      if (!existingCfg) {
        saveWorldConfig(worldName, {
          serverPassword: 'secretpassword',
          serverName: `${worldName}_DServer`,
          preset: '',
          modifier: '',
          crossplay: true,
          crossplayDirectOnly: false,
          isPublic: 1,
          serverPort: 2456,
          saveInterval: 1800,
          backups: 4
        });
      }
    }

    addLog(`[UPLOAD] World component file received: "${worldName}${ext}" (${(req.body.length / (1024 * 1024)).toFixed(2)} MB)`);
    res.json({
      success: true,
      worldName,
      file: `${worldName}${ext}`,
      size: req.body.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/worlds/upload-complete', (req, res) => {
  try {
    const { worldName, password, setAsActive } = req.body || {};
    const cleanName = (worldName || '').replace(/[^a-zA-Z0-9_\-]/g, '').trim();
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'World name required.' });
    }

    const cleanPassword = (typeof password === 'string' && password.trim().length >= 5)
      ? password.replace(/[\x00-\x1F\x7F]/g, '').trim().substring(0, 64)
      : 'amaboys';

    const currentWorldCfg = loadWorldConfig(cleanName) || {};
    currentWorldCfg.serverPassword = cleanPassword;
    currentWorldCfg.serverName = `${cleanName}_DServer`;
    currentWorldCfg.crossplay = true;
    currentWorldCfg.crossplayDirectOnly = false;
    saveWorldConfig(cleanName, currentWorldCfg);

    let isNowActive = false;
    if (setAsActive) {
      const currentConfig = loadConfig();
      if (currentConfig.worldName !== cleanName) {
        state.joinCode = null;
      }
      currentConfig.worldName = cleanName;
      currentConfig.serverPassword = cleanPassword;
      currentConfig.serverName = `${cleanName}_DServer`;
      currentConfig.crossplay = true;
      currentConfig.crossplayDirectOnly = false;
      saveConfig(currentConfig);
      isNowActive = true;
      addLog(`[CONFIG] Active realm updated to uploaded world: "${cleanName}"`);
      broadcastStatus();
    }

    pushActivity('event', 'World Upload Complete', `Realm "${cleanName}" uploaded and initialized`, 'event');
    res.json({ success: true, worldName: cleanName, isActive: isNowActive });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Centralized error handler to catch malformed JSON and avoid leaking stack traces
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload format' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

function getDirSize(dirPath) {
  let size = 0;
  try {
    const resolved = path.resolve(dirPath);
    if (!resolved.startsWith(path.resolve(WORLDS_DIR))) return 0;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch (e) {}
  return size;
}

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  const config = loadConfig();
  const isRealmInit = isWorldInitialized(config.worldName);
  const isOnline = (state.status === 'online') && state.pid;
  const activeJoinCode = (isOnline && isRealmInit) ? state.joinCode : null;

  // Send current state
  ws.send(
    JSON.stringify({
      type: 'init',
      data: {
        status: state.status,
        pid: state.pid,
        joinCode: activeJoinCode,
        playerCount: state.playerCount,
        players: Array.from(state.players.values()),
        playerHistory: getActiveWorldPlayerHistory(config.worldName),
        sessionCasualties: state.sessionCasualties || 0,
        lastSaveTime: state.lastSaveTime,
        lastSaveDuration: state.lastSaveDuration,
        lastSaveNumber: state.lastSaveNumber,
        saveHistory: state.saveHistory,
        errorList: state.errorList,
        activityFeed: state.activityFeed,
        metrics: state.metrics,
        config,
        isRealmInitialized: isRealmInit,
        history: logHistory.slice(-250)
      }
    })
  );

  ws.on('message', (message) => {
    try {
      if (typeof message !== 'string' && !Buffer.isBuffer(message)) return;
      if (message.length > 32768) return; // Prevent WS packet flood / oversized payload
      const { action, payload } = JSON.parse(message);
      if (action === 'start') startValheimServer();
      else if (action === 'stop') stopValheimServer();
      else if (action === 'restart') restartValheimServer();
      else if (action === 'save_config') {
        saveConfig(payload);
      }
    } catch (e) {
      console.error('Invalid WS command:', e.message);
    }
  });
});

// Start listener bound to HOST (Localhost only)
server.listen(PORT, HOST, () => {
  try {
    const cacheDir = path.join(ROOT_DIR, 'cache');
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'dashboard.pid'), String(process.pid), 'utf8');
  } catch (e) {}

  loadConfig();
  checkProcessHealth(() => {
    startLogWatcher();
  });
  console.log(`====================================================`);
  console.log(`   VALHEIM SERVER DASHBOARD RUNNING ON PORT ${PORT} `);
  console.log(`   BIND IP: ${HOST} (Local Host Only)                `);
  console.log(`   URL: http://localhost:${PORT}                    `);
  console.log(`====================================================`);
});

process.on('exit', () => {
  try {
    const pidFile = path.join(ROOT_DIR, 'cache', 'dashboard.pid');
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
  } catch (e) {}
});
