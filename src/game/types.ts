export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface RarityDef {
  id: RarityId;
  name: string;
  color: string;
  hex: number;
  mult: number;
  weight: number;
}

export type WeaponId =
  | 'pickaxe'
  | 'ar'
  | 'pump'
  | 'tac'
  | 'smg'
  | 'sniper'
  | 'mini'
  | 'big'
  | 'medkit'
  | 'chug';

export interface MeleeDef {
  id: 'pickaxe';
  name: string;
  short: string;
  role: string;
  icon: string;
  type: 'melee';
  dmg: number;
  swingRate: number;
  range: number;
}

export type AmmoType = 'medium' | 'shells' | 'light' | 'heavy';

export type AmmoBag = Record<AmmoType, number>;

export interface GunDef {
  id: 'ar' | 'pump' | 'tac' | 'smg' | 'sniper';
  name: string;
  short: string;
  role: string;
  icon: string;
  type: 'gun';
  ammoType: AmmoType;
  dmg: number;
  headMult: number;
  fireRate: number;
  mag: number;
  reload: number;
  spread: number;
  range: number;
  pellets: number;
  auto: boolean;
  zoom: number;
  bulletSpeed: number;
  recoilKick: number;
}

export interface HealDef {
  id: 'mini' | 'big' | 'medkit' | 'chug';
  name: string;
  short: string;
  role: string;
  icon: string;
  type: 'heal';
  healType: 'shield' | 'hp' | 'both';
  amount: number;
  maxCap: number;
  castTime: number;
}

export type WeaponDef = MeleeDef | GunDef | HealDef;

export interface InventoryItem {
  def: WeaponDef;
  rarity: RarityDef;
  ammo?: number;
  damage?: number;
  count?: number;
}

export interface SkinDef {
  id: string;
  name: string;
  rarity: RarityId;
  price: number;
  defaultOwned?: boolean;
  pirateExclusive?: boolean;
  torso: number;
  shirt: number;
  pants: number;
  skin: number;
  hair: number;
  accent: number;
  visor: number | null;
  metallic: boolean;
  hat: 'helmet' | 'hood' | 'pirate' | 'crown' | 'cap' | 'halo' | null;
  icon: string;
}

export type EmoteId =
  | 'boogie'
  | 'floss'
  | 'robot'
  | 'spin'
  | 'shred'
  | 'pirate'
  | 'hype'
  | 'backflip'
  | 'moonwalk'
  | 'drums'
  | 'freeze'
  | 'dab';

export interface EmoteDef {
  id: EmoteId;
  name: string;
  rarity: RarityId;
  price: number;
  duration: number;
  description: string;
  defaultOwned?: boolean;
  icon: string;
}

export interface PoiDef {
  name: string;
  x: number;
  z: number;
  r: number;
  type: 'city' | 'town' | 'lake' | 'pirate' | 'depot';
}

export interface ObstacleSlope {
  axis: 'x' | 'z';
  dir: 1 | -1;
  lowY: number;
  highY: number;
}

export interface ObstacleBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
  minY: number;
  maxY: number;
  walkable?: boolean;
  slope?: ObstacleSlope;
  broken?: boolean;
}

export interface BuildingNavVolume {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  doorX: number;
  doorZ: number;
  thresholdZ: number;
}

export interface ChestSlot {
  x: number;
  y: number;
  z: number;
  buildingIdx?: number;
}

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type ShadowQuality = 'off' | 'low' | 'high' | 'ultra';

export type KeybindAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'interact'
  | 'reload'
  | 'pickaxe'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4'
  | 'slot5'
  | 'backpack'
  | 'map'
  | 'emote'
  | 'ping';

export type KeybindsConfig = Record<KeybindAction, string>;

export interface GameSettings {
  sens: number;
  vol: number;
  invertY: boolean;
  graphicsQuality: GraphicsQuality;
  shadowQuality: ShadowQuality;
  renderDistance: number;
  muted: boolean;
  keybinds: KeybindsConfig;
}

export type MatchMode = 'battle_royale' | 'ranked';

export type TeamMode = 'solo' | 'duos' | 'trios' | 'squads';

export type BotDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';

export interface RankTierDef {
  id: string;
  name: string;
  minRp: number;
  color: string;
  accent: string;
  short: string;
}

export interface PartyMember {
  id: string;
  name: string;
  skinId: string;
  emoteId: EmoteId;
  ready: boolean;
  isLeader: boolean;
}

export interface PartyState {
  code: string;
  leaderId: string;
  teamMode: TeamMode;
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  fillTeammates: boolean;
  members: PartyMember[];
}

export interface TeammateHudInfo {
  id: string;
  name: string;
  isHuman: boolean;
  alive: boolean;
  knocked: boolean;
  hasRebootCard: boolean;
  rebootExpiresSec?: number | null;
  skinId: string;
  hp: number;
  shield: number;
  kills: number;
}

export interface MatchLaunchPlayer {
  id: string;
  name: string;
  skinId: string;
  emoteId: EmoteId;
  teamId: number;
  isHuman: boolean;
  isLocal: boolean;
  skillTier?: BotSkillTier;
}

export interface MatchLaunchConfig {
  roomId: string;
  seed: number;
  teamMode: TeamMode;
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  fillTeammates: boolean;
  localPlayerId: string;
  isRoomHost: boolean;
  busStart: { x: number; z: number };
  busEnd: { x: number; z: number };
  roster: MatchLaunchPlayer[];
}

export interface SaveState {
  playerName: string;
  ownedSkins: string[];
  equippedSkin: string;
  ownedEmotes: EmoteId[];
  equippedEmote: EmoteId;
  pirateExpiresAt: number;
  pirateTokenUsed: boolean;
  teamMode: TeamMode;
  fillTeammates: boolean;
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  rankedRp: number;
  bestRankRp: number;
  rankedWins: number;
  brWins: number;
  settings: GameSettings;
}

export type GameMode = 'title' | 'playing' | 'paused' | 'gameover';

export type LobbyTab = 'play' | 'locker' | 'shop' | 'ranked' | 'settings';

export type BotPolicy = 'rusher' | 'flanker' | 'overwatch';

export type BotSkillTier = 'noob' | 'veteran' | 'pro';

export interface HudSlotSummary {
  id: WeaponId;
  short: string;
  name: string;
  role: string;
  type: 'melee' | 'gun' | 'heal';
  rarityName: string;
  rarityColor: string;
  ammo: number;
  mag: number;
  ammoType?: AmmoType;
  reserveAmmo?: number;
}

export interface HudSnapshot {
  hp: number;
  shield: number;
  kills: number;
  aliveCount: number;
  stormTimerSec: number;
  inStorm: boolean;
  stormProximity: number;
  poiName: string;
  yawDeg: number;
  teamMode: TeamMode;
  teammates: TeammateHudInfo[];
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  rankLabel: string;
  pointerLocked: boolean;
  inBattleBus: boolean;
  busProgress: number;
  isSkydiving: boolean;
  isGliding: boolean;
  altitude: number;
  pickaxeEquipped: boolean;
  activeSlot: number;
  slots: Array<HudSlotSummary | null>;
  ammoBag: AmmoBag;
  noAmmoHint: boolean;
  backpackOpen: boolean;
  interactText: string | null;
  sniperScope: boolean;
  reloadPct: number | null;
  actionText: string | null;
  actionPct: number | null;
  killFeed: string[];
  bigMapOpen: boolean;
  activePingText?: string | null;
  alive: boolean;
  knocked: boolean;
  dbnoHp: number;
  revivePct: number | null;
  beingRevived: boolean;
  heldRebootCards: Array<{ id: string; name: string; expiresSec: number }>;
  spectatingName: string | null;
  spectatingId: string | null;
  nearbyRebootVan: boolean;
  rebootProgressPct: number | null;
  keybinds: KeybindsConfig;
}

export interface MatchSummary {
  isVictory: boolean;
  placement: number;
  kills: number;
  damageDealt: number;
  pirateActive: boolean;
  teamMode: TeamMode;
  teamAlive?: number;
  teammateNames?: string[];
  matchMode: MatchMode;
  botDifficulty: BotDifficulty;
  eliminatedBy?: {
    name: string;
    weaponName: string;
    distanceM: number;
  };
  rankUpdate?: {
    prevLabel: string;
    nextLabel: string;
    prevColor: string;
    nextColor: string;
    prevRp: number;
    nextRp: number;
    delta: number;
  };
}
