import type {
  BotDifficulty,
  EmoteId,
  MatchLaunchConfig,
  MatchMode,
  PartyState,
  TeamMode,
} from './types';

export interface RemotePlayerSnapshot {
  playerId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  crouch: boolean;
  slide: boolean;
  glider: boolean;
  skydiving: boolean;
  inBus: boolean;
  knocked?: boolean;
  activeWeaponId: string;
  activeRarityHex: number;
  emoteId: string | null;
  healing: boolean;
  hp: number;
  shield: number;
  alive: boolean;
}

export interface CombatantDamagedEvent {
  targetId: string;
  attackerId: string;
  attackerName: string;
  targetName: string;
  weaponName: string;
  distanceM: number;
  damage: number;
  isHeadshot: boolean;
  hp: number;
  shield: number;
  knocked?: boolean;
  targetKnocked?: boolean;
  eliminated: boolean;
  squadWipedIds?: string[];
  attackerKills: number;
}

export interface RemoteShotEvent {
  shooterId: string;
  muzzle: [number, number, number];
  end: [number, number, number];
  rarityHex: number;
  weaponId: string;
}

export interface SquadPingEvent {
  senderId: string;
  senderName: string;
  teamId: number;
  x: number;
  y: number;
  z: number;
  label: string;
  kind: string;
}

export interface BotsSnapshotEvent {
  storm?: { cx: number; cz: number; radius: number; targetRadius: number; phaseTimer: number; shrinkRate: number };
  busProgress?: number;
  bots: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    hp: number;
    shield: number;
    alive: boolean;
    knocked?: boolean;
    activeWeaponId: string;
    crouch: boolean;
    skydiving: boolean;
    glider: boolean;
  }>;
}

export interface ReviveCompletedEvent {
  targetId: string;
  targetName: string;
  reviverId: string;
  reviverName: string;
  hp: number;
  shield: number;
}

export interface RebootCardCollectedEvent {
  cardPlayerId: string;
  cardPlayerName: string;
  collectorId: string;
  collectorName: string;
}

export interface RebootCompletedEvent {
  rebooterId: string;
  rebooterName: string;
  revivedIds: string[];
  x: number;
  y: number;
  z: number;
}

export interface MultiplayerCallbacks {
  onConnectionChange?: (connected: boolean, clientId: string | null) => void;
  onPartyState?: (party: PartyState) => void;
  onPartyError?: (message: string) => void;
  onPartyEmote?: (memberId: string, emoteId: EmoteId) => void;
  onMatchStart?: (config: MatchLaunchConfig) => void;
  onRemoteJump?: (data: { playerId: string; x: number; y: number; z: number; yaw: number }) => void;
  onRemotePlayerState?: (data: RemotePlayerSnapshot) => void;
  onRemoteShot?: (data: RemoteShotEvent) => void;
  onCombatantDamaged?: (data: CombatantDamagedEvent) => void;
  onReviveCompleted?: (data: ReviveCompletedEvent) => void;
  onRebootCardCollected?: (data: RebootCardCollectedEvent) => void;
  onRebootCompleted?: (data: RebootCompletedEvent) => void;
  onChestOpened?: (data: { chestIdx: number; openerId: string }) => void;
  onStructureDamaged?: (data: { structId: number; broken: boolean; hpPct: number }) => void;
  onPingCreated?: (data: SquadPingEvent) => void;
  onBotsSnapshot?: (data: BotsSnapshotEvent) => void;
  onMatchVictory?: (data: { winningTeamId: number }) => void;
  onHostPromoted?: () => void;
}

function getOrCreateSessionToken(): string {
  if (typeof window === 'undefined') return `tok-${Math.random().toString(36).slice(2, 12)}`;
  try {
    const existing = window.sessionStorage.getItem('fortblox_ws_session_token');
    if (existing && existing.length >= 8) return existing;
    const fresh =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem('fortblox_ws_session_token', fresh);
    return fresh;
  } catch {
    return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private clientId: string | null = null;
  private sessionToken: string = getOrCreateSessionToken();
  private party: PartyState | null = null;
  private connected = false;
  private disposed = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private helloOpts: {
    name: string;
    skinId: string;
    emoteId: EmoteId;
    teamMode: TeamMode;
    matchMode: MatchMode;
    botDifficulty: BotDifficulty;
    fillTeammates: boolean;
    joinCode?: string;
  };
  private callbacks: MultiplayerCallbacks = {};

  constructor(
    initialOpts: {
      name: string;
      skinId: string;
      emoteId: EmoteId;
      teamMode: TeamMode;
      matchMode: MatchMode;
      botDifficulty: BotDifficulty;
      fillTeammates: boolean;
      joinCode?: string;
    },
    callbacks: MultiplayerCallbacks = {},
  ) {
    this.helloOpts = { ...initialOpts };
    this.callbacks = callbacks;
  }

  public setCallbacks(next: MultiplayerCallbacks): void {
    this.callbacks = { ...this.callbacks, ...next };
  }

  public isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  public getClientId(): string | null {
    return this.clientId;
  }

  public getParty(): PartyState | null {
    return this.party;
  }

  private clearPingTimer(): void {
    if (this.pingTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public connect(): void {
    if (this.disposed || typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.send('hello', { ...this.helloOpts, sessionToken: this.sessionToken });
      this.callbacks.onConnectionChange?.(true, this.clientId);
      this.clearPingTimer();
      this.pingTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.send('ping', { t: Date.now() });
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      let msg: { type?: string; payload?: any };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!msg?.type) return;
      switch (msg.type) {
        case 'pong':
          break;
        case 'welcome':
          this.clientId = msg.payload?.clientId ?? null;
          this.callbacks.onConnectionChange?.(true, this.clientId);
          break;
        case 'party:state':
          this.party = msg.payload as PartyState;
          this.helloOpts.joinCode = this.party?.code;
          this.callbacks.onPartyState?.(this.party);
          break;
        case 'party:error':
          this.callbacks.onPartyError?.(String(msg.payload?.message ?? 'Party error'));
          break;
        case 'party:emote':
          this.callbacks.onPartyEmote?.(String(msg.payload?.memberId), msg.payload?.emoteId as EmoteId);
          break;
        case 'match:start':
          this.callbacks.onMatchStart?.(msg.payload as MatchLaunchConfig);
          break;
        case 'bus:jump':
          this.callbacks.onRemoteJump?.(msg.payload);
          break;
        case 'player:state':
          this.callbacks.onRemotePlayerState?.(msg.payload as RemotePlayerSnapshot);
          break;
        case 'shot:fire':
          this.callbacks.onRemoteShot?.(msg.payload as RemoteShotEvent);
          break;
        case 'combatant:damaged':
          this.callbacks.onCombatantDamaged?.(msg.payload as CombatantDamagedEvent);
          break;
        case 'revive:completed':
          this.callbacks.onReviveCompleted?.(msg.payload as ReviveCompletedEvent);
          break;
        case 'reboot:cardCollected':
          this.callbacks.onRebootCardCollected?.(msg.payload as RebootCardCollectedEvent);
          break;
        case 'reboot:completed':
          this.callbacks.onRebootCompleted?.(msg.payload as RebootCompletedEvent);
          break;
        case 'chest:opened':
          this.callbacks.onChestOpened?.(msg.payload);
          break;
        case 'structure:damaged':
          this.callbacks.onStructureDamaged?.(msg.payload);
          break;
        case 'ping:created':
          this.callbacks.onPingCreated?.(msg.payload as SquadPingEvent);
          break;
        case 'bots:snapshot':
          this.callbacks.onBotsSnapshot?.(msg.payload as BotsSnapshotEvent);
          break;
        case 'match:victory':
          this.callbacks.onMatchVictory?.(msg.payload);
          break;
        case 'match:hostPromoted':
          this.callbacks.onHostPromoted?.();
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.connected = false;
      this.ws = null;
      this.clearPingTimer();
      this.callbacks.onConnectionChange?.(false, this.clientId);
      if (!this.disposed && this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1200);
      }
    };

    ws.onerror = () => {
      // Handled by onclose reconnect loop cleanly
    };
  }

  public send(type: string, payload: unknown = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type, payload }));
    } catch {
      // Ignore send errors on closing socket
    }
  }

  public createParty(): void {
    this.send('party:create', {
      teamMode: this.helloOpts.teamMode,
      matchMode: this.helloOpts.matchMode,
      botDifficulty: this.helloOpts.botDifficulty,
      fillTeammates: this.helloOpts.fillTeammates,
    });
  }

  public joinParty(code: string): void {
    this.send('party:join', { code });
  }

  public leaveParty(): void {
    this.send('party:leave', {});
  }

  public kickMember(targetId: string): void {
    this.send('party:kick', { targetId });
  }

  public updatePartyProfile(partial: {
    name?: string;
    skinId?: string;
    emoteId?: EmoteId;
    ready?: boolean;
    teamMode?: TeamMode;
    matchMode?: MatchMode;
    botDifficulty?: BotDifficulty;
    fillTeammates?: boolean;
  }): void {
    this.helloOpts = { ...this.helloOpts, ...partial };
    this.send('party:update', partial);
  }

  public triggerPartyEmote(emoteId: EmoteId): void {
    this.send('party:emote', { emoteId });
  }

  public requestStartMatch(rankedRp: number): void {
    this.send('party:start', { rankedRp });
  }

  public leaveMatch(): void {
    this.send('match:leave', {});
  }

  public dispose(): void {
    this.disposed = true;
    this.clearPingTimer();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

