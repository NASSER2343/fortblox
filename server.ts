import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import {
  applyDbnoDamage,
  assignMatchTeams,
  computeAliveTeamsCount,
  computeDamageApplication,
  computeRebootResult,
  computeReviveResult,
  findSquadWipeTargets,
  generatePartyCode,
  isFriendlyTarget,
  normalizePartyCode,
  sanitizePlayerName,
  shouldEnterDbno,
} from './src/game/rules';
import type {
  BotDifficulty,
  EmoteId,
  MatchLaunchConfig,
  MatchLaunchPlayer,
  MatchMode,
  PartyMember,
  PartyState,
  TeamMode,
} from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const VALID_TEAM_MODES = new Set<TeamMode>(['solo', 'duos', 'trios', 'squads']);
const VALID_MATCH_MODES = new Set<MatchMode>(['battle_royale', 'ranked']);
const VALID_DIFFICULTIES = new Set<BotDifficulty>(['easy', 'normal', 'hard', 'extreme']);

interface ClientSession {
  id: string;
  sessionToken: string;
  ws: WebSocket;
  isAlive: boolean;
  disconnected: boolean;
  disconnectTimer: NodeJS.Timeout | null;
  name: string;
  skinId: string;
  emoteId: EmoteId;
  ready: boolean;
  partyCode: string | null;
  roomId: string | null;
}

interface PartyRoom {
  code: string;
  leaderId: string;
  teamMode: TeamMode;
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  fillTeammates: boolean;
  memberIds: string[];
}

interface ServerCombatant {
  id: string;
  name: string;
  teamId: number;
  isHuman: boolean;
  hp: number;
  shield: number;
  alive: boolean;
  knocked: boolean;
  kills: number;
}

interface MatchRoom {
  id: string;
  seed: number;
  teamMode: TeamMode;
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  fillTeammates: boolean;
  hostClientId: string;
  humanIds: string[];
  combatants: Map<string, ServerCombatant>;
  openedChests: Set<number>;
  takenLootKeys: Set<string>;
  brokenStructures: Set<number>;
  busStart: { x: number; z: number };
  busEnd: { x: number; z: number };
  ended: boolean;
  createdAt: number;
}

const clients = new Map<string, ClientSession>();
const tokenToClientId = new Map<string, string>();
const parties = new Map<string, PartyRoom>();
const matches = new Map<string, MatchRoom>();

function sendToClient(client: ClientSession | undefined, type: string, payload: unknown): void {
  if (!client || client.ws.readyState !== WebSocket.OPEN) return;
  try {
    client.ws.send(JSON.stringify({ type, payload }));
  } catch {
    // Ignore closed socket races
  }
}

function createUniquePartyCode(): string {
  for (let i = 0; i < 40; i++) {
    const code = generatePartyCode();
    if (!parties.has(code)) return code;
  }
  return `FBX-${Math.floor(1000 + Math.random() * 8999)}`;
}

function serializeParty(party: PartyRoom): PartyState {
  const members: PartyMember[] = [];
  for (const id of party.memberIds) {
    const c = clients.get(id);
    if (!c) continue;
    members.push({
      id: c.id,
      name: c.name,
      skinId: c.skinId,
      emoteId: c.emoteId,
      ready: c.ready,
      isLeader: id === party.leaderId,
    });
  }
  return {
    code: party.code,
    leaderId: party.leaderId,
    teamMode: party.teamMode,
    matchMode: party.matchMode,
    botDifficulty: party.botDifficulty,
    fillTeammates: party.fillTeammates,
    members,
  };
}

function broadcastParty(party: PartyRoom): void {
  const snapshot = serializeParty(party);
  for (const id of party.memberIds) {
    sendToClient(clients.get(id), 'party:state', snapshot);
  }
}

function createSoloPartyFor(
  client: ClientSession,
  opts?: Partial<Pick<PartyRoom, 'teamMode' | 'matchMode' | 'botDifficulty' | 'fillTeammates'>>,
): PartyRoom {
  const code = createUniquePartyCode();
  const party: PartyRoom = {
    code,
    leaderId: client.id,
    teamMode: opts?.teamMode && VALID_TEAM_MODES.has(opts.teamMode) ? opts.teamMode : 'duos',
    matchMode: opts?.matchMode && VALID_MATCH_MODES.has(opts.matchMode) ? opts.matchMode : 'battle_royale',
    botDifficulty:
      opts?.botDifficulty && VALID_DIFFICULTIES.has(opts.botDifficulty) ? opts.botDifficulty : 'normal',
    fillTeammates: typeof opts?.fillTeammates === 'boolean' ? opts.fillTeammates : true,
    memberIds: [client.id],
  };
  parties.set(code, party);
  client.partyCode = code;
  client.ready = true;
  return party;
}

function removeClientFromCurrentParty(client: ClientSession): void {
  if (!client.partyCode) return;
  const party = parties.get(client.partyCode);
  client.partyCode = null;
  if (!party) return;

  party.memberIds = party.memberIds.filter((id) => id !== client.id);
  if (party.memberIds.length === 0) {
    parties.delete(party.code);
    return;
  }
  if (party.leaderId === client.id) {
    party.leaderId = party.memberIds[0];
    const newLeader = clients.get(party.leaderId);
    if (newLeader) newLeader.ready = true;
  }
  broadcastParty(party);
}

function broadcastRoom(room: MatchRoom, type: string, payload: unknown, exceptId?: string): void {
  for (const id of room.humanIds) {
    if (exceptId && id === exceptId) continue;
    sendToClient(clients.get(id), type, payload);
  }
}

function leaveCurrentMatch(client: ClientSession): void {
  if (!client.roomId) return;
  const room = matches.get(client.roomId);
  client.roomId = null;
  if (!room) return;

  room.humanIds = room.humanIds.filter((id) => id !== client.id);
  const combatant = room.combatants.get(client.id);
  if (combatant && combatant.alive) {
    combatant.alive = false;
    broadcastRoom(room, 'player:left', { playerId: client.id, name: client.name });
  }
  if (room.hostClientId === client.id && room.humanIds.length > 0) {
    room.hostClientId = room.humanIds[0];
    sendToClient(clients.get(room.hostClientId), 'match:hostPromoted', { roomId: room.id });
  }
  if (room.humanIds.length === 0) {
    matches.delete(room.id);
  }
}

function computeBusRoute(seed: number): { busStart: { x: number; z: number }; busEnd: { x: number; z: number } } {
  const diag = ((seed % 1000) / 1000) * Math.PI * 2;
  const dist = 365;
  return {
    busStart: { x: Math.cos(diag) * dist, z: Math.sin(diag) * dist },
    busEnd: { x: Math.cos(diag + Math.PI) * dist, z: Math.sin(diag + Math.PI) * dist },
  };
}

function clampNum(v: unknown, min: number, max: number, fallback = 0): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      onlineClients: clients.size,
      activeParties: parties.size,
      activeMatches: matches.size,
    });
  });

  app.get('/api/party/:code', (req, res) => {
    const code = normalizePartyCode(String(req.params.code || ''));
    const party = parties.get(code);
    if (!party) {
      res.status(404).json({ exists: false, message: 'Party not found' });
      return;
    }
    res.json({
      exists: true,
      code: party.code,
      teamMode: party.teamMode,
      memberCount: party.memberIds.length,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const heartbeatInterval = setInterval(() => {
    for (const socket of wss.clients) {
      const tracked = socket as WebSocket & { __isAlive?: boolean };
      if (tracked.__isAlive === false) {
        socket.terminate();
        continue;
      }
      tracked.__isAlive = false;
      try {
        socket.ping();
      } catch {
        // Ignore terminated sockets
      }
    }
  }, 12000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws) => {
    const trackedWs = ws as WebSocket & { __isAlive?: boolean };
    trackedWs.__isAlive = true;
    ws.on('pong', () => {
      trackedWs.__isAlive = true;
    });

    const tempId = `p-${randomUUID().slice(0, 8)}`;
    let activeSession: ClientSession = {
      id: tempId,
      sessionToken: tempId,
      ws,
      isAlive: true,
      disconnected: false,
      disconnectTimer: null,
      name: 'AgentZero',
      skinId: 'recruit',
      emoteId: 'boogie',
      ready: true,
      partyCode: null,
      roomId: null,
    };
    clients.set(tempId, activeSession);

    sendToClient(activeSession, 'welcome', { clientId: activeSession.id });

    ws.on('message', (raw) => {
      trackedWs.__isAlive = true;
      let msg: { type?: string; payload?: Record<string, unknown> };
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      const payload = (msg.payload && typeof msg.payload === 'object' ? msg.payload : {}) as Record<string, unknown>;
      const session = activeSession;

      switch (msg.type) {
        case 'ping': {
          sendToClient(session, 'pong', { t: Date.now() });
          break;
        }

        case 'hello': {
          const incomingToken =
            typeof payload.sessionToken === 'string' && payload.sessionToken.trim().length >= 8
              ? payload.sessionToken.trim().slice(0, 64)
              : '';

          if (incomingToken) {
            const existingId = tokenToClientId.get(incomingToken);
            const existing = existingId ? clients.get(existingId) : undefined;
            if (existing && existing.id !== session.id) {
              // Reattach to existing session across transient disconnects without kicking player
              if (existing.disconnectTimer) {
                clearTimeout(existing.disconnectTimer);
                existing.disconnectTimer = null;
              }
              clients.delete(session.id);
              existing.ws = ws;
              existing.disconnected = false;
              existing.isAlive = true;
              existing.name = sanitizePlayerName(typeof payload.name === 'string' ? payload.name : existing.name, existing.name);
              if (typeof payload.skinId === 'string' && payload.skinId.length <= 32) {
                existing.skinId = payload.skinId;
              }
              if (typeof payload.emoteId === 'string' && payload.emoteId.length <= 24) {
                existing.emoteId = payload.emoteId as EmoteId;
              }
              activeSession = existing;
              sendToClient(existing, 'welcome', { clientId: existing.id, reconnected: true });
              const existingParty = existing.partyCode ? parties.get(existing.partyCode) : undefined;
              if (existingParty) {
                broadcastParty(existingParty);
              } else {
                const solo = createSoloPartyFor(existing, {
                  teamMode: payload.teamMode as TeamMode,
                  matchMode: payload.matchMode as MatchMode,
                  botDifficulty: payload.botDifficulty as BotDifficulty,
                  fillTeammates: typeof payload.fillTeammates === 'boolean' ? payload.fillTeammates : true,
                });
                broadcastParty(solo);
              }
              if (existing.roomId) {
                const existingRoom = matches.get(existing.roomId);
                if (existingRoom && !existingRoom.ended) {
                  sendToClient(existing, 'match:sync', {
                    roomId: existingRoom.id,
                    hostClientId: existingRoom.hostClientId,
                    openedChests: Array.from(existingRoom.openedChests),
                    brokenStructures: Array.from(existingRoom.brokenStructures),
                    combatants: Array.from(existingRoom.combatants.values()),
                  });
                }
              }
              return;
            }
            session.sessionToken = incomingToken;
            tokenToClientId.set(incomingToken, session.id);
          }

          session.name = sanitizePlayerName(typeof payload.name === 'string' ? payload.name : session.name);
          if (typeof payload.skinId === 'string' && payload.skinId.length <= 32) {
            session.skinId = payload.skinId;
          }
          if (typeof payload.emoteId === 'string' && payload.emoteId.length <= 24) {
            session.emoteId = payload.emoteId as EmoteId;
          }

          const requestedCode =
            typeof payload.joinCode === 'string' && payload.joinCode.trim().length > 0
              ? normalizePartyCode(payload.joinCode)
              : '';
          const targetParty = requestedCode ? parties.get(requestedCode) : undefined;
          if (targetParty && targetParty.code === session.partyCode) {
            broadcastParty(targetParty);
          } else if (targetParty && targetParty.memberIds.length < 4) {
            removeClientFromCurrentParty(session);
            targetParty.memberIds.push(session.id);
            session.partyCode = targetParty.code;
            session.ready = true;
            broadcastParty(targetParty);
          } else if (!session.partyCode) {
            const solo = createSoloPartyFor(session, {
              teamMode: payload.teamMode as TeamMode,
              matchMode: payload.matchMode as MatchMode,
              botDifficulty: payload.botDifficulty as BotDifficulty,
              fillTeammates: typeof payload.fillTeammates === 'boolean' ? payload.fillTeammates : true,
            });
            broadcastParty(solo);
          } else {
            const cur = parties.get(session.partyCode);
            if (cur) broadcastParty(cur);
          }
          break;
        }

        case 'party:create': {
          removeClientFromCurrentParty(session);
          const created = createSoloPartyFor(session, {
            teamMode: payload.teamMode as TeamMode,
            matchMode: payload.matchMode as MatchMode,
            botDifficulty: payload.botDifficulty as BotDifficulty,
            fillTeammates: typeof payload.fillTeammates === 'boolean' ? payload.fillTeammates : true,
          });
          broadcastParty(created);
          break;
        }

        case 'party:join': {
          const code = normalizePartyCode(typeof payload.code === 'string' ? payload.code : '');
          const target = parties.get(code);
          if (!target) {
            sendToClient(session, 'party:error', { message: `No active party found for code ${code || '---'}` });
            return;
          }
          if (target.code === session.partyCode) {
            broadcastParty(target);
            return;
          }
          if (target.memberIds.length >= 4) {
            sendToClient(session, 'party:error', { message: `Party ${target.code} is already full (4/4)` });
            return;
          }
          removeClientFromCurrentParty(session);
          target.memberIds.push(session.id);
          session.partyCode = target.code;
          session.ready = true;
          broadcastParty(target);
          break;
        }

        case 'party:leave': {
          removeClientFromCurrentParty(session);
          const fresh = createSoloPartyFor(session);
          broadcastParty(fresh);
          break;
        }

        case 'party:kick': {
          if (!session.partyCode) return;
          const party = parties.get(session.partyCode);
          if (!party || party.leaderId !== session.id) return;
          const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
          if (!targetId || targetId === session.id || !party.memberIds.includes(targetId)) return;
          const targetClient = clients.get(targetId);
          party.memberIds = party.memberIds.filter((id) => id !== targetId);
          broadcastParty(party);
          if (targetClient) {
            targetClient.partyCode = null;
            const fresh = createSoloPartyFor(targetClient);
            sendToClient(targetClient, 'party:error', { message: 'Removed from party by party leader.' });
            broadcastParty(fresh);
          }
          break;
        }

        case 'party:update': {
          if (typeof payload.name === 'string') {
            session.name = sanitizePlayerName(payload.name, session.name);
          }
          if (typeof payload.skinId === 'string' && payload.skinId.length <= 32) {
            session.skinId = payload.skinId;
          }
          if (typeof payload.emoteId === 'string' && payload.emoteId.length <= 24) {
            session.emoteId = payload.emoteId as EmoteId;
          }
          if (typeof payload.ready === 'boolean') {
            session.ready = payload.ready;
          }
          const party = session.partyCode ? parties.get(session.partyCode) : null;
          if (!party) return;

          if (party.leaderId === session.id) {
            if (VALID_TEAM_MODES.has(payload.teamMode as TeamMode)) {
              party.teamMode = payload.teamMode as TeamMode;
            }
            if (VALID_MATCH_MODES.has(payload.matchMode as MatchMode)) {
              party.matchMode = payload.matchMode as MatchMode;
            }
            if (VALID_DIFFICULTIES.has(payload.botDifficulty as BotDifficulty)) {
              party.botDifficulty = payload.botDifficulty as BotDifficulty;
            }
            if (typeof payload.fillTeammates === 'boolean') {
              party.fillTeammates = payload.fillTeammates;
            }
          }
          broadcastParty(party);
          break;
        }

        case 'party:emote': {
          const party = session.partyCode ? parties.get(session.partyCode) : null;
          if (!party) return;
          const emoteId = typeof payload.emoteId === 'string' ? (payload.emoteId as EmoteId) : session.emoteId;
          session.emoteId = emoteId;
          for (const memberId of party.memberIds) {
            sendToClient(clients.get(memberId), 'party:emote', {
              memberId: session.id,
              emoteId,
            });
          }
          break;
        }

        case 'party:start': {
          const party = session.partyCode ? parties.get(session.partyCode) : null;
          if (!party || party.leaderId !== session.id) return;

          const humanClients = party.memberIds
            .map((id) => clients.get(id))
            .filter((c): c is ClientSession => Boolean(c));
          if (humanClients.length === 0) return;

          const seed = Math.floor(1 + Math.random() * 1_999_999_999);
          const roomId = `rm-${randomUUID().slice(0, 8)}`;
          const { busStart, busEnd } = computeBusRoute(seed);

          // Automatically scale up to Duos/Squads if party size exceeds selected mode size
          let effectiveMode = party.teamMode;
          if (humanClients.length === 2 && effectiveMode === 'solo') effectiveMode = 'duos';
          if (humanClients.length === 3 && (effectiveMode === 'solo' || effectiveMode === 'duos')) effectiveMode = 'trios';
          if (humanClients.length >= 4 && effectiveMode !== 'squads') effectiveMode = 'squads';
          if (effectiveMode !== party.teamMode) {
            party.teamMode = effectiveMode;
            broadcastParty(party);
          }

          const rawRoster = assignMatchTeams({
            humanMembers: humanClients.map((c) => ({
              id: c.id,
              name: c.name,
              skinId: c.skinId,
              emoteId: c.emoteId,
            })),
            teamMode: effectiveMode,
            fillTeammates: party.fillTeammates,
            totalPlayers: 25,
            difficulty: party.botDifficulty,
            matchMode: party.matchMode,
            rankedRp: clampNum(payload.rankedRp, 0, 20000, 350),
            seed,
          });

          const combatants = new Map<string, ServerCombatant>();
          for (const entry of rawRoster) {
            combatants.set(entry.id, {
              id: entry.id,
              name: entry.name,
              teamId: entry.teamId,
              isHuman: entry.isHuman,
              hp: 100,
              shield: 0,
              alive: true,
              knocked: false,
              kills: 0,
            });
          }

          const room: MatchRoom = {
            id: roomId,
            seed,
            teamMode: effectiveMode,
            matchMode: party.matchMode,
            botDifficulty: party.botDifficulty,
            fillTeammates: party.fillTeammates,
            hostClientId: humanClients[0].id,
            humanIds: humanClients.map((c) => c.id),
            combatants,
            openedChests: new Set(),
            takenLootKeys: new Set(),
            brokenStructures: new Set(),
            busStart,
            busEnd,
            ended: false,
            createdAt: Date.now(),
          };
          matches.set(roomId, room);

          for (const hc of humanClients) {
            leaveCurrentMatch(hc);
            hc.roomId = roomId;
            const rosterForClient: MatchLaunchPlayer[] = rawRoster.map((r) => ({
              ...r,
              isLocal: r.id === hc.id,
            }));
            const launchConfig: MatchLaunchConfig = {
              roomId,
              seed,
              teamMode: effectiveMode,
              matchMode: party.matchMode,
              botDifficulty: party.botDifficulty,
              fillTeammates: party.fillTeammates,
              localPlayerId: hc.id,
              isRoomHost: hc.id === room.hostClientId,
              busStart,
              busEnd,
              roster: rosterForClient,
            };
            sendToClient(hc, 'match:start', launchConfig);
          }
          break;
        }

        case 'match:leave': {
          leaveCurrentMatch(session);
          break;
        }

        case 'bus:jump': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          broadcastRoom(
            room,
            'bus:jump',
            {
              playerId: session.id,
              x: clampNum(payload.x, -450, 450, 0),
              y: clampNum(payload.y, -20, 300, 175),
              z: clampNum(payload.z, -450, 450, 0),
              yaw: clampNum(payload.yaw, -Math.PI * 4, Math.PI * 4, 0),
            },
            session.id,
          );
          break;
        }

        case 'player:state': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          const combatant = room.combatants.get(session.id);
          if (typeof payload.hp === 'number' && combatant) {
            combatant.hp = clampNum(payload.hp, 0, 100, combatant.hp);
          }
          if (typeof payload.shield === 'number' && combatant) {
            combatant.shield = clampNum(payload.shield, 0, 100, combatant.shield);
          }
          if (typeof payload.knocked === 'boolean' && combatant && combatant.alive) {
            combatant.knocked = payload.knocked;
          }
          broadcastRoom(
            room,
            'player:state',
            {
              playerId: session.id,
              x: clampNum(payload.x, -450, 450, 0),
              y: clampNum(payload.y, -30, 320, 5),
              z: clampNum(payload.z, -450, 450, 0),
              yaw: clampNum(payload.yaw, -Math.PI * 4, Math.PI * 4, 0),
              pitch: clampNum(payload.pitch, -2, 2, 0),
              speed: clampNum(payload.speed, 0, 60, 0),
              crouch: Boolean(payload.crouch),
              slide: Boolean(payload.slide),
              glider: Boolean(payload.glider),
              skydiving: Boolean(payload.skydiving),
              inBus: Boolean(payload.inBus),
              knocked: combatant?.knocked ?? Boolean(payload.knocked),
              activeWeaponId: typeof payload.activeWeaponId === 'string' ? payload.activeWeaponId : 'pickaxe',
              activeRarityHex: typeof payload.activeRarityHex === 'number' ? payload.activeRarityHex : 0x38bdf8,
              emoteId: typeof payload.emoteId === 'string' ? payload.emoteId : null,
              healing: Boolean(payload.healing),
              hp: combatant?.hp ?? 100,
              shield: combatant?.shield ?? 0,
              alive: combatant?.alive ?? true,
            },
            session.id,
          );
          break;
        }

        case 'shot:fire': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          broadcastRoom(
            room,
            'shot:fire',
            {
              shooterId: session.id,
              muzzle: Array.isArray(payload.muzzle) ? payload.muzzle.slice(0, 3) : [0, 2, 0],
              end: Array.isArray(payload.end) ? payload.end.slice(0, 3) : [0, 2, -10],
              rarityHex: typeof payload.rarityHex === 'number' ? payload.rarityHex : 0xfef08a,
              weaponId: typeof payload.weaponId === 'string' ? payload.weaponId : 'ar',
            },
            session.id,
          );
          break;
        }

        case 'player:hit': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.ended) return;

          const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
          const attackerId = typeof payload.attackerId === 'string' && !room.combatants.get(payload.attackerId)?.isHuman
            ? payload.attackerId
            : session.id;
          const attacker = room.combatants.get(attackerId);
          const target = room.combatants.get(targetId);
          if (!attacker || !target || !attacker.alive || !target.alive) return;
          if (isFriendlyTarget(attacker.teamId, target.teamId)) return;

          const damage = clampNum(payload.damage, 0, 260, 0);
          if (damage <= 0) return;

          const allCombatants = Array.from(room.combatants.values());
          let knockedNow = false;
          let eliminated = false;
          let squadWipedIds: string[] = [];

          if (target.knocked) {
            const dbnoRes = applyDbnoDamage(target.hp, damage);
            target.hp = dbnoRes.dbnoHp;
            target.shield = 0;
            if (dbnoRes.eliminated) {
              target.alive = false;
              target.knocked = false;
              eliminated = true;
              attacker.kills += 1;
            }
          } else {
            const dmgRes = computeDamageApplication(target.hp, target.shield, damage);
            target.hp = dmgRes.hp;
            target.shield = dmgRes.shield;
            if (dmgRes.eliminated) {
              if (shouldEnterDbno(target.teamId, target.id, allCombatants)) {
                target.knocked = true;
                target.hp = 100;
                target.shield = 0;
                target.alive = true;
                knockedNow = true;
              } else {
                target.alive = false;
                target.knocked = false;
                eliminated = true;
                attacker.kills += 1;
                squadWipedIds = findSquadWipeTargets(target.teamId, target.id, allCombatants);
                for (const wipeId of squadWipedIds) {
                  const mate = room.combatants.get(wipeId);
                  if (mate) {
                    mate.alive = false;
                    mate.knocked = false;
                    mate.hp = 0;
                    mate.shield = 0;
                  }
                }
              }
            }
          }

          broadcastRoom(room, 'combatant:damaged', {
            targetId: target.id,
            attackerId: attacker.id,
            attackerName: attacker.name,
            targetName: target.name,
            weaponName: typeof payload.weaponName === 'string' ? payload.weaponName.slice(0, 32) : 'Rifle',
            distanceM: clampNum(payload.distanceM, 0, 600, 0),
            damage: Math.round(damage),
            isHeadshot: Boolean(payload.isHeadshot),
            hp: target.hp,
            shield: target.shield,
            knocked: knockedNow,
            targetKnocked: target.knocked,
            eliminated,
            squadWipedIds,
            attackerKills: attacker.kills,
          });

          if (eliminated) {
            const aliveTeams = computeAliveTeamsCount(Array.from(room.combatants.values()));
            if (aliveTeams <= 1) {
              room.ended = true;
              const winnerTeam = Array.from(room.combatants.values()).find((c) => c.alive)?.teamId ?? attacker.teamId;
              broadcastRoom(room, 'match:victory', { winningTeamId: winnerTeam });
            }
          }
          break;
        }

        case 'combatant:selfDamage': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.ended) return;
          const targetId = typeof payload.targetId === 'string' ? payload.targetId : session.id;
          const target = room.combatants.get(targetId);
          if (!target || !target.alive) return;
          if (target.id !== session.id && (target.isHuman || room.hostClientId !== session.id)) return;
          const dmg = clampNum(payload.damage, 0, 100, 0);
          if (dmg <= 0) return;

          const allCombatants = Array.from(room.combatants.values());
          target.hp = Math.max(0, target.hp - dmg);
          let knockedNow = false;
          let eliminated = false;
          let squadWipedIds: string[] = [];

          if (target.hp <= 0) {
            if (!target.knocked && shouldEnterDbno(target.teamId, target.id, allCombatants)) {
              target.knocked = true;
              target.hp = 100;
              target.shield = 0;
              target.alive = true;
              knockedNow = true;
            } else {
              target.alive = false;
              target.knocked = false;
              eliminated = true;
              squadWipedIds = findSquadWipeTargets(target.teamId, target.id, allCombatants);
              for (const wipeId of squadWipedIds) {
                const mate = room.combatants.get(wipeId);
                if (mate) {
                  mate.alive = false;
                  mate.knocked = false;
                  mate.hp = 0;
                  mate.shield = 0;
                }
              }
            }
          }

          broadcastRoom(room, 'combatant:damaged', {
            targetId: target.id,
            attackerId: 'storm',
            attackerName: 'The Storm',
            targetName: target.name,
            weaponName: target.knocked && eliminated ? 'Bled Out' : 'Storm Surge',
            distanceM: 0,
            damage: Math.round(dmg),
            isHeadshot: false,
            hp: target.hp,
            shield: target.shield,
            knocked: knockedNow,
            targetKnocked: target.knocked,
            eliminated,
            squadWipedIds,
            attackerKills: 0,
          });
          if (eliminated) {
            const aliveTeams = computeAliveTeamsCount(Array.from(room.combatants.values()));
            if (aliveTeams <= 1) {
              room.ended = true;
              const winnerTeam = Array.from(room.combatants.values()).find((c) => c.alive)?.teamId ?? 0;
              broadcastRoom(room, 'match:victory', { winningTeamId: winnerTeam });
            }
          }
          break;
        }

        case 'revive:complete': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.ended) return;
          const targetId = typeof payload.targetId === 'string' ? payload.targetId : '';
          const reviverId = typeof payload.reviverId === 'string' && !room.combatants.get(payload.reviverId)?.isHuman
            ? payload.reviverId
            : session.id;
          const reviver = room.combatants.get(reviverId);
          const target = room.combatants.get(targetId);
          if (!reviver || !target || !reviver.alive || reviver.knocked || !target.alive || !target.knocked) return;
          if (!isFriendlyTarget(reviver.teamId, target.teamId)) return;

          const res = computeReviveResult();
          target.knocked = res.knocked;
          target.hp = res.hp;
          target.shield = res.shield;
          broadcastRoom(room, 'revive:completed', {
            targetId: target.id,
            targetName: target.name,
            reviverId: reviver.id,
            reviverName: reviver.name,
            hp: target.hp,
            shield: target.shield,
          });
          break;
        }

        case 'reboot:cardCollected': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.ended) return;
          const cardPlayerId = typeof payload.cardPlayerId === 'string' ? payload.cardPlayerId : '';
          const collector = room.combatants.get(session.id);
          const cardOwner = room.combatants.get(cardPlayerId);
          if (!collector || !cardOwner || !isFriendlyTarget(collector.teamId, cardOwner.teamId)) return;
          broadcastRoom(room, 'reboot:cardCollected', {
            cardPlayerId: cardOwner.id,
            cardPlayerName: cardOwner.name,
            collectorId: collector.id,
            collectorName: collector.name,
          });
          break;
        }

        case 'reboot:complete': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.ended) return;
          const rebooter = room.combatants.get(session.id);
          if (!rebooter || !rebooter.alive || rebooter.knocked) return;
          const rawIds = Array.isArray(payload.targetIds) ? payload.targetIds : [];
          const revivedIds: string[] = [];
          for (const rawId of rawIds) {
            if (typeof rawId !== 'string') continue;
            const mate = room.combatants.get(rawId);
            if (!mate || mate.alive || !isFriendlyTarget(rebooter.teamId, mate.teamId)) continue;
            const res = computeRebootResult();
            mate.alive = res.alive;
            mate.knocked = res.knocked;
            mate.hp = res.hp;
            mate.shield = res.shield;
            revivedIds.push(mate.id);
          }
          if (revivedIds.length === 0) return;
          broadcastRoom(room, 'reboot:completed', {
            rebooterId: rebooter.id,
            rebooterName: rebooter.name,
            revivedIds,
            x: clampNum(payload.x, -450, 450, 0),
            y: clampNum(payload.y, -20, 260, 10),
            z: clampNum(payload.z, -450, 450, 0),
          });
          break;
        }

        case 'chest:open': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          const chestIdx = Math.floor(clampNum(payload.chestIdx, 0, 1000, -1));
          if (chestIdx < 0 || room.openedChests.has(chestIdx)) return;
          room.openedChests.add(chestIdx);
          broadcastRoom(room, 'chest:opened', { chestIdx, openerId: session.id });
          break;
        }

        case 'structure:damage': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          const structId = Math.floor(clampNum(payload.structId, 0, 50000, -1));
          if (structId < 0 || room.brokenStructures.has(structId)) return;
          const broken = Boolean(payload.broken);
          if (broken) room.brokenStructures.add(structId);
          broadcastRoom(
            room,
            'structure:damaged',
            {
              structId,
              broken,
              hpPct: clampNum(payload.hpPct, 0, 1, 1),
            },
            session.id,
          );
          break;
        }

        case 'ping:create': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room) return;
          const sender = room.combatants.get(session.id);
          if (!sender) return;
          broadcastRoom(room, 'ping:created', {
            senderId: session.id,
            senderName: sender.name,
            teamId: sender.teamId,
            x: clampNum(payload.x, -450, 450, 0),
            y: clampNum(payload.y, -20, 260, 4),
            z: clampNum(payload.z, -450, 450, 0),
            label: typeof payload.label === 'string' ? payload.label.slice(0, 40) : 'Squad Ping',
            kind: typeof payload.kind === 'string' ? payload.kind.slice(0, 16) : 'enemy',
          });
          break;
        }

        case 'bots:snapshot': {
          if (!session.roomId) return;
          const room = matches.get(session.roomId);
          if (!room || room.hostClientId !== session.id) return;
          if (!Array.isArray(payload.bots)) return;
          broadcastRoom(
            room,
            'bots:snapshot',
            {
              storm: payload.storm,
              busProgress: payload.busProgress,
              bots: payload.bots.slice(0, 28),
            },
            session.id,
          );
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      const session = activeSession;
      if (session.ws !== ws) return;
      session.disconnected = true;
      if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
      // Keep friend in party & match for 30s grace period across proxy timeouts/reloads
      session.disconnectTimer = setTimeout(() => {
        if (!session.disconnected) return;
        leaveCurrentMatch(session);
        removeClientFromCurrentParty(session);
        if (session.sessionToken) tokenToClientId.delete(session.sessionToken);
        clients.delete(session.id);
      }, 30000);
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Fortblox Royale server running on http://0.0.0.0:${PORT} (WS at /ws)`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
