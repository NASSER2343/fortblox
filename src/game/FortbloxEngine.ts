import * as THREE from 'three';
import { SoundEngine, type SoundKind } from './audio';
import {
  AMMO_DEFS,
  BOT_COUNT,
  BOT_NAMES,
  BUS_CRUISE_Y,
  BUS_DURATION_SEC,
  CHEST_OPEN_TIME,
  DBNO_BLEED_RATE,
  DEFAULT_KEYBINDS,
  EMOTES,
  HALF_MAP,
  MAP_SIZE,
  POIS,
  RARITIES,
  REBOOT_CARD_DURATION,
  REBOOT_TIME,
  REVIVE_TIME,
  SKINS,
  TOTAL_CHESTS,
  WEAPON_DEFS,
} from './constants';
import {
  createAmmoPackGroup,
  createBattleBusGroup,
  createChestGroup,
  createGroundLootGroup,
  createHumanoidRig,
  createPlayerNameplate,
  createRebootCardGroup,
  createTacticalPingMarker,
  type HitboxZone,
  type HumanoidRig,
} from './models';
import type {
  BotsSnapshotEvent,
  CombatantDamagedEvent,
  MultiplayerClient,
  RebootCardCollectedEvent,
  RebootCompletedEvent,
  RemotePlayerSnapshot,
  RemoteShotEvent,
  ReviveCompletedEvent,
  SquadPingEvent,
} from './multiplayerClient';
import {
  applyDbnoDamage,
  applyStructureDamage,
  areBotsTeammates,
  assignMatchTeams,
  chooseBestBotSlot,
  computeAliveTeamsCount,
  computeBotFlankWaypoint,
  computeBotLeadPoint,
  computeDamageApplication,
  computeHealApplication,
  computeRebootResult,
  computeReloadTransfer,
  computeReviveResult,
  computeShotgunPelletSpreadOffsets,
  computeStormAudioParams,
  createEmptyAmmoBag,
  dropBackpackSlot,
  findSquadWipeTargets,
  formatKeyCodeLabel,
  getBattleBusPose,
  getBotCombatProfile,
  getCeilingLimitY,
  getCurrentPoiName,
  getRankFromRp,
  getRiverCenterX,
  getTerrainHeight,
  getWalkableSurfaceY,
  isFriendlyTarget,
  isInsideStorm,
  isPirateTokenActive,
  makeWeaponItem,
  pickBotRarity,
  pickChestHealDrop,
  pickChestHealId,
  pickChestWeaponId,
  pickFloorLootDrop,
  pickRandomRarity,
  pickupForBot,
  pickupWithDrop,
  resolveBotBuildingWaypoint,
  resolveObstacleCollision,
  rollPirateToken,
  seededRng,
  shouldBotBroadcastPing,
  shouldBotPunishHeal,
  shouldEnterDbno,
  stepChestSearchProgress,
  stepDbnoBleed,
  stepStorm,
  swapBackpackSlots,
  sweptSphereCapsuleHit,
  sweptSphereSegmentHit,
  type DbnoCombatantLike,
  type StormState,
} from './rules';
import { createProceduralTextures, type ProceduralTextures } from './textures';
import type {
  AmmoBag,
  AmmoType,
  BotDifficulty,
  BotPolicy,
  BotSkillTier,
  BuildingNavVolume,
  ChestSlot,
  EmoteId,
  GameMode,
  GameSettings,
  HudSnapshot,
  InventoryItem,
  KeybindAction,
  MatchLaunchConfig,
  MatchMode,
  MatchSummary,
  ObstacleBox,
  PartyMember,
  TeammateHudInfo,
  TeamMode,
  WeaponId,
} from './types';
import { buildWorld, type DestructibleStructureDef, type LaunchPadDef, type RebootVanDef } from './world';

// Pre-allocated scratch math objects (zero GC inside animation loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camLookTarget = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _projRaycaster = new THREE.Raycaster();
const _center2D = new THREE.Vector2(0, 0);
const _hitNormal = new THREE.Vector3();
const _normalMat3 = new THREE.Matrix3();
const _upVec = new THREE.Vector3(0, 0, 1);

const BUS_START_X = -380;
const BUS_START_Z = -305;
const BUS_END_X = 380;
const BUS_END_Z = 305;
const BUS_DROP_UNLOCK_PROGRESS = 0.14;

function createFortniteSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  const domeGeo = new THREE.SphereGeometry(40, 14, 10);
  const pos = domeGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const zenith = new THREE.Color(0x1d4ed8);
  const mid = new THREE.Color(0x38bdf8);
  const horizon = new THREE.Color(0xfef3c7);
  const groundBounce = new THREE.Color(0x3b7d39);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const yNorm = pos.getY(i) / 40;
    if (yNorm >= 0.25) {
      c.copy(mid).lerp(zenith, (yNorm - 0.25) / 0.75);
    } else if (yNorm >= 0) {
      c.copy(horizon).lerp(mid, yNorm / 0.25);
    } else {
      c.copy(horizon).lerp(groundBounce, Math.min(1, -yNorm * 2.2));
    }
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  domeGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const domeMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const sunGeo = new THREE.SphereGeometry(4.8, 12, 10);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.set(20, 32, 16);
  envScene.add(sunMesh);

  const groundGeo = new THREE.CircleGeometry(34, 16);
  const groundMat = new THREE.MeshBasicMaterial({ color: 0x4d7c0f, side: THREE.DoubleSide });
  const groundDisc = new THREE.Mesh(groundGeo, groundMat);
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -3.5;
  envScene.add(groundDisc);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  domeGeo.dispose();
  domeMat.dispose();
  sunGeo.dispose();
  sunMat.dispose();
  groundGeo.dispose();
  groundMat.dispose();
  return envTex;
}

function detectSoftwareGl(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function segmentIntersectsBoxT(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  ob: ObstacleBox,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;

  let tmin = 0;
  let tmax = 1;

  const checkAxis = (p: number, d: number, minB: number, maxB: number): boolean => {
    if (Math.abs(d) < 1e-8) {
      return p >= minB && p <= maxB;
    }
    let t1 = (minB - p) / d;
    let t2 = (maxB - p) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    return tmin <= tmax;
  };

  if (!checkAxis(ax, dx, ob.x - ob.hw, ob.x + ob.hw)) return null;
  if (!checkAxis(ay, dy, ob.minY, ob.maxY)) return null;
  if (!checkAxis(az, dz, ob.z - ob.hd, ob.z + ob.hd)) return null;

  return tmin;
}

interface ChestEntity {
  id: number;
  x: number;
  y: number;
  z: number;
  opened: boolean;
  openProgress: number;
  mesh: THREE.Group;
  lidPivot: THREE.Group;
  halo: THREE.Mesh;
  shockRing: THREE.Mesh;
}

interface GroundLootEntity {
  x: number;
  y: number;
  z: number;
  item: InventoryItem;
  mesh: THREE.Group;
  spinner: THREE.Object3D | null;
  label: THREE.Sprite | null;
  popTime: number;
}

interface GroundAmmoEntity {
  x: number;
  y: number;
  z: number;
  ammoType: AmmoType;
  amount: number;
  mesh: THREE.Group;
  spinner: THREE.Object3D | null;
  label: THREE.Sprite | null;
  popTime: number;
}

interface BotEntity {
  id: string;
  name: string;
  squadId: number;
  skinId: string;
  flankSide: 1 | -1;
  pingCooldown: number;
  chestChannel: { chestId: number; elapsed: number } | null;
  policy: BotPolicy;
  tier: BotSkillTier;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  shield: number;
  alive: boolean;
  knocked: boolean;
  dbnoHp: number;
  reviveProgress: number;
  revivingTargetId: string | null;
  beingRevived: boolean;
  inBattleBus: boolean;
  busJumpProgress: number;
  isSkydiving: boolean;
  isGliding: boolean;
  dyingTimer: number;
  hitFlashTimer: number;
  hitFlinchTimer: number;
  rig: HumanoidRig;
  slots: Array<InventoryItem | null>;
  ammo: AmmoBag;
  activeSlot: number;
  weapon: InventoryItem;
  pickaxeSwing: number;
  midRangeSwitchRoll: number;
  midRangeRollTimer: number;
  fireCd: number;
  burstRemaining: number;
  burstShotIndex: number;
  aimAcquireTimer: number;
  losClear: boolean;
  losCheckTimer: number;
  healingTimer: number;
  healingSlotIdx: number;
  alertTimer: number;
  alertTargetX: number;
  alertTargetZ: number;
  telegraphLine: THREE.Line | null;
  moveTargetX: number;
  moveTargetZ: number;
  retargetTimer: number;
  strafeDir: number;
  strafeFlipTimer: number;
  lastShotTime: number;
  recoil: number;
  aimSampleX: number;
  aimSampleY: number;
  aimSampleZ: number;
  aimSampleTimer: number;
  isSwimming: boolean;
  isCrouching: boolean;
  crouchToggleTimer: number;
  slideTimer: number;
  slideCooldown: number;
  deathProgress: number;
  strafeLean: number;
  vy: number;
  onGround: boolean;
  jumpCooldown: number;
  lastCheckX: number;
  lastCheckZ: number;
  stuckCheckTimer: number;
  stuckSteerTimer: number;
  stuckTurnAngle: number;
  driftSeed: number;
  nameplate?: THREE.Sprite | null;
}

interface RemoteHumanEntity {
  id: string;
  name: string;
  skinId: string;
  teamId: number;
  hp: number;
  shield: number;
  alive: boolean;
  knocked: boolean;
  kills: number;
  inBattleBus: boolean;
  isSkydiving: boolean;
  isGliding: boolean;
  isCrouching: boolean;
  isSliding: boolean;
  healing: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  targetYaw: number;
  speed: number;
  activeWeaponId: string;
  emoteId: EmoteId | null;
  emoteTimer: number;
  rig: HumanoidRig;
  nameplate: THREE.Sprite;
  dyingTimer: number;
}

interface RebootCardEntity {
  id: string;
  name: string;
  teamId: number;
  skinId: string;
  isHuman: boolean;
  x: number;
  y: number;
  z: number;
  expiresSec: number;
  mesh: THREE.Group;
}

interface LobbyTeammateSlot {
  memberId: string;
  skinId: string;
  name: string;
  ready: boolean;
  isLeader: boolean;
  rig: HumanoidRig;
  nameplate: THREE.Sprite;
  emoteTimer: number;
  emoteId: EmoteId;
}

interface ProjectileEntity {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  headMult: number;
  shotId: number;
  fromPlayer: boolean;
  ownerName: string;
  ownerId?: string;
  ownerSquadId: number;
  weaponName: string;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  life: number;
  gravity: number;
  bulletRadius: number;
}

interface ActivePingEntity {
  mesh: THREE.Group;
  x: number;
  y: number;
  z: number;
  ttl: number;
  maxTtl: number;
  squadId: number;
}

interface PooledParticle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface ShellEntity {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface EngineCallbacks {
  onModeChange: (mode: GameMode) => void;
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (summary: MatchSummary) => void;
  onPirateTokenFound: (expiresAt: number) => void;
  onDamageNumber: (
    screenX: number,
    screenY: number,
    dmg: number,
    isShield: boolean,
    isCrit: boolean,
    shotKey?: string,
  ) => void;
  onHitmarker: () => void;
  onDamageFlash: () => void;
  onCrosshairSize: (sizePx: number) => void;
  onContextLostChange: (lost: boolean) => void;
}

export class FortbloxEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private dirLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private textures: ProceduralTextures;
  private sound: SoundEngine;

  private obstacles: ObstacleBox[] = [];
  private buildings: BuildingNavVolume[] = [];
  private buildingSlots: ChestSlot[] = [];
  private floorLootSlots: ChestSlot[] = [];
  private colliderMeshes: THREE.Object3D[] = [];
  private clouds: THREE.Group[] = [];
  private launchPads: LaunchPadDef[] = [];
  private rebootVans: RebootVanDef[] = [];
  private foliageMeshes: THREE.Object3D[] = [];
  private ultraProps: THREE.Object3D[] = [];
  private destructibles: DestructibleStructureDef[] = [];
  private meshToDestructible = new Map<THREE.Object3D, DestructibleStructureDef>();
  private pbrNormalMaterials: THREE.MeshStandardMaterial[] = [];

  private lobbyStage = new THREE.Group();
  private lobbyCharRig: HumanoidRig | null = null;
  private lobbyHeroNameplate: THREE.Sprite | null = null;
  private lobbyTeammateSlots: LobbyTeammateSlot[] = [];
  private lobbyPartyMembers: PartyMember[] = [];
  private lobbyLocalClientId: string | null = null;
  private lobbyEmoteTimer = 0;

  private mpClient: MultiplayerClient | null = null;
  private launchConfig: MatchLaunchConfig | null = null;
  private localPlayerId = 'local';
  private localTeamId = 0;
  private isRoomHost = true;
  private teamMode: TeamMode = 'duos';
  private fillTeammates = true;
  private busStartX = BUS_START_X;
  private busStartZ = BUS_START_Z;
  private busEndX = BUS_END_X;
  private busEndZ = BUS_END_Z;
  private matchRng: () => number = Math.random;
  private remoteHumans = new Map<string, RemoteHumanEntity>();
  private remoteHumanHitboxMeshes: THREE.Mesh[] = [];
  private hitboxToRemoteHuman = new Map<THREE.Object3D, string>();
  private netStateAccum = 0;
  private hostBotsAccum = 0;
  private stormTickAccum = 0;
  private squadPingText: string | null = null;
  private squadPingTextTimer = 0;
  private botById = new Map<string, BotEntity>();

  private matchEntitiesGroup = new THREE.Group();
  private battleBus: { group: THREE.Group; animate: (dt: number) => void } | null = null;
  private chests: ChestEntity[] = [];
  private playerChestSearch: { chest: ChestEntity; elapsed: number } | null = null;
  private playerReviveChannel: { targetId: string; targetName: string; targetType: 'bot' | 'human'; elapsed: number } | null = null;
  private playerRebootChannel: { van: RebootVanDef; elapsed: number } | null = null;
  private rebootCards: RebootCardEntity[] = [];
  private heldRebootCards: Array<{ id: string; name: string; teamId: number; isHuman: boolean; skinId: string; expiresSec: number }> = [];
  private dbnoNetBleedAccum = 0;
  private activePings: ActivePingEntity[] = [];
  private groundLoot: GroundLootEntity[] = [];
  private groundAmmo: GroundAmmoEntity[] = [];
  private bots: BotEntity[] = [];
  private botHitboxMeshes: THREE.Mesh[] = [];
  private hitboxToBot = new Map<THREE.Object3D, { bot: BotEntity; zone: HitboxZone; multiplier: number }>();
  private projectiles: ProjectileEntity[] = [];
  private shellCasings: ShellEntity[] = [];

  // Permanent pre-allocated FX pool
  private muzzleLight: THREE.PointLight;
  private muzzleLightTimer = 0;
  private muzzleFlashMesh: THREE.Mesh;
  private muzzleFlashTimer = 0;
  private particlePool: PooledParticle[] = [];
  private particleCursor = 0;
  private decalPool: THREE.Mesh[] = [];
  private decalCursor = 0;

  private nextShotId = 1;
  private shotTallies = new Map<string, { dmg: number; isCrit: boolean; hadShield: boolean; ttl: number }>();
  private lastChestWasChug = false;

  private mode: GameMode = 'title';
  private bigMapOpen = false;
  private backpackOpen = false;
  private settings: GameSettings;
  private matchMode: MatchMode = 'battle_royale';
  private botDifficulty: BotDifficulty = 'normal';
  private rankedRp = 350;
  private equippedSkin: string;
  private equippedEmote: EmoteId;
  private previewSkin: string | null = null;
  private previewEmote: EmoteId | null = null;
  private pirateExpiresAt = 0;
  private pirateTokenUsed = false;

  private keys = new Set<string>();
  private mouseDownLeft = false;
  private pointerLocked = false;
  private pointerLockGraceUntil = 0;
  private lobbySideView = false;
  private lobbyTargetLookX = 0;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;
  private normMouseX = 0.5;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;

  private minimapCanvas: HTMLCanvasElement | null = null;
  private bigMapCanvas: HTMLCanvasElement | null = null;
  private mapBgCanvas: HTMLCanvasElement;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private hudEmitAccum = 0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private camPosSmooth = new THREE.Vector3(0, 62.05, 4.3);
  private camLookSmooth = new THREE.Vector3(0, 61.2, 0);

  private killFeed: string[] = [];

  private storm: StormState = {
    cx: 0,
    cz: 0,
    radius: 400,
    targetRadius: 45,
    phaseTimer: 60,
    shrinkRate: 3.0,
  };
  private stormProximity = 0;
  private stormMesh: THREE.Mesh | null = null;

  private player = {
    x: 0,
    y: 10,
    z: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    pitch: 0.08,
    hp: 100,
    shield: 0,
    alive: true,
    knocked: false,
    dbnoHp: 100,
    beingRevived: false,
    spectatingId: null as string | null,
    kills: 0,
    dmgDealt: 0,
    inBattleBus: true,
    busProgress: 0,
    isSkydiving: false,
    onGround: false,
    isGliding: false,
    skydiveWindTimer: 0,
    isSwimming: false,
    swimSplashTimer: 0,
    isCrouching: false,
    isSliding: false,
    slideTimer: 0,
    slideCooldown: 0,
    slideDirX: 0,
    slideDirZ: 0,
    slideDustTimer: 0,
    strafeLean: 0,
    isAiming: false,
    lastDamager: null as { name: string; weaponName: string; distanceM: number } | null,
    squashY: 1,
    rig: null as HumanoidRig | null,
    pickaxeEquipped: true,
    pickaxeSwing: 0,
    slots: [null, null, null, null, null] as Array<InventoryItem | null>,
    ammo: createEmptyAmmoBag(),
    noAmmoHintTimer: 0,
    activeSlot: 0,
    fireCd: 0,
    reloading: 0,
    reloadTotal: 1,
    healing: 0,
    healTotal: 1,
    healItem: null as { slotIdx: number; def: InventoryItem['def'] } | null,
    recoil: 0,
    equipTimer: 0,
    hitFlinchTimer: 0,
    emoteTimer: 0,
  };

  private sharedBulletGeo = new THREE.BoxGeometry(0.08, 0.08, 1.45);
  private sharedParticleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  private sharedShellGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.09, 6);
  private sharedShellMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.2 });
  private basicMatCache = new Map<number, THREE.MeshBasicMaterial>();

  private getBasicMat(hex: number): THREE.MeshBasicMaterial {
    let m = this.basicMatCache.get(hex);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: hex });
      this.basicMatCache.set(hex, m);
    }
    return m;
  }

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    equippedSkin: string,
    equippedEmote: EmoteId,
    pirateExpiresAt: number,
    pirateTokenUsed: boolean,
    callbacks: EngineCallbacks,
    initialMatchMode: MatchMode = 'battle_royale',
    initialBotDifficulty: BotDifficulty = 'normal',
    initialRankedRp = 350,
  ) {
    this.container = container;
    this.settings = {
      ...initialSettings,
      keybinds: { ...DEFAULT_KEYBINDS, ...(initialSettings.keybinds || {}) },
    };
    this.matchMode = initialMatchMode;
    this.botDifficulty = initialBotDifficulty;
    this.rankedRp = initialRankedRp;
    this.equippedSkin = equippedSkin;
    this.equippedEmote = equippedEmote;
    this.pirateExpiresAt = pirateExpiresAt;
    this.pirateTokenUsed = pirateTokenUsed;
    this.callbacks = callbacks;

    this.sound = new SoundEngine();
    this.sound.setVolume(this.settings.vol, this.settings.muted);

    this.isSoftwareGl = detectSoftwareGl();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x69b7ff);
    this.scene.fog = new THREE.FogExp2(0x7cc4ff, 0.0008);

    this.scene.environment = createFortniteSkyEnvironment(this.renderer);

    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.18, this.settings.renderDistance);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x365314, 0.62);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4de, 1.38);
    this.dirLight.position.set(170, 270, 130);
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.018;
    this.dirLight.shadow.camera.near = 20;
    this.dirLight.shadow.camera.far = 560;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.2);
    this.rimLight.position.set(-140, 120, -160);
    this.scene.add(this.rimLight);

    // Pre-allocated permanent muzzle PointLight + flash mesh + particle pool
    this.muzzleLight = new THREE.PointLight(0xfacc15, 0, 14);
    this.scene.add(this.muzzleLight);

    this.muzzleFlashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95 }),
    );
    this.muzzleFlashMesh.visible = false;
    this.scene.add(this.muzzleFlashMesh);

    for (let i = 0; i < 96; i++) {
      const m = new THREE.Mesh(this.sharedParticleGeo, this.getBasicMat(0xfef08a));
      m.visible = false;
      this.scene.add(m);
      this.particlePool.push({ mesh: m, active: false, vx: 0, vy: 0, vz: 0, life: 0 });
    }

    const decalGeo = new THREE.CircleGeometry(0.16, 10);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (let i = 0; i < 36; i++) {
      const dm = new THREE.Mesh(decalGeo, decalMat);
      dm.visible = false;
      this.scene.add(dm);
      this.decalPool.push(dm);
    }

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    const world = buildWorld(this.textures);
    this.obstacles = world.obstacles;
    this.buildings = world.buildings;
    this.buildingSlots = world.buildingSlots;
    this.floorLootSlots = world.floorLootSlots;
    this.colliderMeshes = world.colliderMeshes;
    this.clouds = world.clouds;
    this.launchPads = world.launchPads;
    this.rebootVans = world.rebootVans;
    this.foliageMeshes = world.foliageMeshes;
    this.ultraProps = world.ultraProps;
    this.destructibles = world.destructibles;
    this.meshToDestructible.clear();
    for (const d of this.destructibles) {
      for (const m of d.meshes) {
        this.meshToDestructible.set(m, d);
      }
    }
    this.pbrNormalMaterials = world.pbrNormalMaterials;
    this.scene.add(world.worldGroup);
    this.scene.add(this.matchEntitiesGroup);

    this.applyGraphicsSettings();

    // Lobby elevated showcase pedestal overlooking the island
    this.setupLobbyStage();
    this.scene.add(this.lobbyStage);

    // Pre-render island tactical minimap texture
    this.mapBgCanvas = this.prerenderIslandMap();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Paint initial lobby frame synchronously so first canvas draw is immediate
    this.dirLight.target.position.set(0, 60, 0);
    this.dirLight.position.set(110, 220, 90);
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 62.15, 4.35);
    this.camera.lookAt(0, 61.18, 0);
    this.renderFrame();

    this.bindEvents();
    this.scheduleNextTick();
  }

  private renderFrame(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private applyGraphicsSettings(): void {
    const q = this.settings.graphicsQuality;
    const sq = this.settings.shadowQuality;
    const renderDist = THREE.MathUtils.clamp(this.settings.renderDistance, 300, 1500);

    // Render Distance + Fog (keep camera.far beyond skyDome radius 1320 so sky never clips)
    this.camera.far = Math.max(renderDist + 600, 2200);
    this.camera.updateProjectionMatrix();
    const fogDensity = THREE.MathUtils.clamp(0.42 / renderDist, 0.00028, 0.0022);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = fogDensity;
    }

    // Pixel Ratio & Clean Natural Lighting (no bloom halos or excessive IBL glare)
    const dpr = window.devicePixelRatio || 1;
    const targetPr = this.isSoftwareGl
      ? 1
      : q === 'low'
        ? 1
        : q === 'medium'
          ? Math.min(dpr, 1.25)
          : q === 'high'
            ? Math.min(dpr, 1.75)
            : Math.min(dpr, 2.0);
    this.renderer.setPixelRatio(targetPr);

    this.renderer.toneMappingExposure = 1.0;
    this.scene.environmentIntensity = q === 'low' ? 0.14 : q === 'medium' ? 0.2 : q === 'high' ? 0.26 : 0.3;
    this.hemiLight.intensity = q === 'low' ? 0.68 : q === 'medium' ? 0.65 : q === 'high' ? 0.62 : 0.62;
    this.dirLight.intensity = q === 'ultra' ? 1.45 : q === 'high' ? 1.38 : q === 'medium' ? 1.32 : 1.25;
    this.rimLight.intensity = q === 'low' ? 0.15 : q === 'medium' ? 0.18 : q === 'high' ? 0.2 : 0.22;

    // True visual tier switching across ALL world, character, weapon, chest, and bus materials
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const targetAniso = q === 'low' ? 1 : q === 'medium' ? Math.min(4, maxAniso) : q === 'high' ? Math.min(8, maxAniso) : maxAniso;
    this.textures.setAnisotropy(targetAniso);
    this.textures.applyTierQuality(q);

    // Foliage & Ultra Props density visibility (Low strips extra foliage/props -> pure brick aesthetic!)
    const showFoliage = q === 'high' || q === 'ultra';
    for (const fm of this.foliageMeshes) {
      fm.visible = showFoliage;
    }
    const showUltraProps = q === 'ultra' || q === 'high';
    for (const up of this.ultraProps) {
      up.visible = showUltraProps;
    }

    // Shadow Quality (tightened frustum around camera target for sharp character/building shadows)
    const shadowsEnabled = !this.isSoftwareGl && sq !== 'off';
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.dirLight.castShadow = shadowsEnabled;

    if (shadowsEnabled) {
      const mapRes = sq === 'ultra' ? 4096 : sq === 'high' ? 2048 : 1024;
      const dShadow = sq === 'ultra' ? 105 : sq === 'high' ? 88 : 68;
      this.renderer.shadowMap.type = sq === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
      if (this.dirLight.shadow.mapSize.width !== mapRes) {
        this.dirLight.shadow.mapSize.set(mapRes, mapRes);
        this.dirLight.shadow.map?.dispose();
        this.dirLight.shadow.map = null;
      }
      this.dirLight.shadow.camera.left = -dShadow;
      this.dirLight.shadow.camera.right = dShadow;
      this.dirLight.shadow.camera.top = dShadow;
      this.dirLight.shadow.camera.bottom = -dShadow;
      this.dirLight.shadow.camera.updateProjectionMatrix();
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  private static readonly LOBBY_SLOT_POSITIONS: ReadonlyArray<[number, number, number]> = [
    [0, 60.2, 0],
    [-1.55, 60.15, -0.55],
    [1.55, 60.15, -0.55],
    [-2.85, 60.1, -1.15],
  ];

  private setupLobbyStage(): void {
    // Fortblox Chapter Hilltop Diorama: grass terrace, stone ruin arch, pine trees, chest, crates & 4 team pedestals
    const hillMat = this.textures.registerTierMaterial(
      new THREE.MeshStandardMaterial({
        map: this.textures.terrainGrass.map,
        normalMap: this.textures.terrainGrass.normalMap,
        roughnessMap: this.textures.terrainGrass.roughnessMap,
        color: 0x65a30d,
        roughness: 0.88,
        metalness: 0.04,
      }),
    );
    const hillBase = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 11.4, 2.2, 24), hillMat);
    hillBase.position.set(0, 58.95, -1.5);
    hillBase.receiveShadow = true;
    this.lobbyStage.add(hillBase);

    const cliffSkirtMat = this.textures.registerTierMaterial(
      new THREE.MeshStandardMaterial({
        map: this.textures.concrete.map,
        normalMap: this.textures.concrete.normalMap,
        color: 0x64748b,
        roughness: 0.85,
        metalness: 0.12,
      }),
    );
    const cliffSkirt = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 12.6, 2.6, 16), cliffSkirtMat);
    cliffSkirt.position.set(0, 57.5, -1.5);
    this.lobbyStage.add(cliffSkirt);

    // Ruins Pillars & Broken Arch behind squad
    for (const px of [-3.4, 3.4]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.95, 4.6, 0.95), cliffSkirtMat);
      col.position.set(px, 62.2, -3.6);
      col.castShadow = true;
      col.receiveShadow = true;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.38, 1.25), cliffSkirtMat);
      cap.position.set(px, 64.55, -3.6);
      this.lobbyStage.add(col, cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(7.9, 0.65, 1.1), cliffSkirtMat);
    lintel.position.set(0, 64.9, -3.6);
    lintel.castShadow = true;
    this.lobbyStage.add(lintel);

    // Stylized Pine Trees on Diorama flanks
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.78 });
    for (const [tx, tz, scale] of [
      [-5.4, -3.1, 1.08],
      [5.3, -2.9, 0.98],
      [-6.5, -0.4, 0.82],
    ] as const) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 1.8 * scale, 7), trunkMat);
      trunk.position.set(tx, 60.8, tz);
      trunk.castShadow = true;
      this.lobbyStage.add(trunk);
      for (let tier = 0; tier < 3; tier++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((1.55 - tier * 0.34) * scale, 2.0 * scale, 8), leafMat);
        cone.position.set(tx, 62.1 + tier * 1.15 * scale, tz);
        cone.castShadow = true;
        this.lobbyStage.add(cone);
      }
    }

    // Loot Chest + Ammo Crate prop beside platform
    const chestProp = createChestGroup(this.textures).group;
    chestProp.position.set(3.2, 60.05, -0.9);
    chestProp.rotation.y = -0.6;
    chestProp.scale.setScalar(0.95);
    this.lobbyStage.add(chestProp);

    const crateMat = new THREE.MeshStandardMaterial({
      map: this.textures.wood.map,
      normalMap: this.textures.wood.normalMap,
      roughness: 0.75,
    });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.92, 0.92), crateMat);
    crate.position.set(-3.3, 60.5, -0.2);
    crate.rotation.y = 0.35;
    crate.castShadow = true;
    this.lobbyStage.add(crate);

    // 4 Holographic Squad Pedestals
    const pedMat = this.textures.registerTierMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        map: this.textures.armorHex.map,
        normalMap: this.textures.armorHex.normalMap,
        roughnessMap: this.textures.armorHex.roughnessMap,
        metalness: 0.72,
        roughness: 0.24,
      }),
    );
    const goldRingMat = this.textures.registerTierMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.22,
        normalMap: this.textures.gunmetal.normalMap,
        metalness: 0.62,
        roughness: 0.28,
      }),
    );
    const cyanRingMat = this.textures.registerTierMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.2,
        normalMap: this.textures.gunmetal.normalMap,
        metalness: 0.55,
        roughness: 0.3,
      }),
    );

    FortbloxEngine.LOBBY_SLOT_POSITIONS.forEach(([px, py, pz], idx) => {
      const s = idx === 0 ? 1 : 0.72;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.32 * s, 1.62 * s, 0.26, 24), pedMat);
      base.position.set(px, py - 0.14, pz);
      base.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42 * s, 0.048, 10, 32), idx === 0 ? goldRingMat : cyanRingMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, py, pz);
      this.lobbyStage.add(base, ring);
    });

    this.rebuildLobbyCharacter();
  }

  public rebuildLobbyCharacter(): void {
    if (this.lobbyCharRig) {
      this.lobbyStage.remove(this.lobbyCharRig.root);
    }
    if (this.lobbyHeroNameplate) {
      this.lobbyStage.remove(this.lobbyHeroNameplate);
      this.lobbyHeroNameplate = null;
    }
    const activeDisplaySkin = this.previewSkin ?? this.equippedSkin;
    this.lobbyCharRig = createHumanoidRig(activeDisplaySkin, this.textures.contactShadow, 'player', this.textures);
    this.lobbyCharRig.root.position.set(0, 60.2, 0);
    this.lobbyStage.add(this.lobbyCharRig.root);

    if (this.lobbyPartyMembers.length > 1) {
      const localMember = this.lobbyPartyMembers.find((m) => m.id === this.lobbyLocalClientId);
      const localName = localMember?.name ?? 'You';
      const np = createPlayerNameplate(localName, localMember?.ready ? 'READY' : 'WAITING', localMember?.ready ? '#22c55e' : '#facc15');
      np.position.set(0, 63.06, 0);
      this.lobbyStage.add(np);
      this.lobbyHeroNameplate = np;
    }

    this.textures.applyTierQuality(this.settings.graphicsQuality);
  }

  public updateLobbyParty(members: PartyMember[], localClientId: string | null): void {
    this.lobbyPartyMembers = members;
    this.lobbyLocalClientId = localClientId;

    // Clear existing remote teammate rigs cleanly
    for (const slot of this.lobbyTeammateSlots) {
      this.lobbyStage.remove(slot.rig.root);
      this.lobbyStage.remove(slot.nameplate);
    }
    this.lobbyTeammateSlots = [];

    // Rebuild hero nameplate if party size crossed 1 <-> 2+
    this.rebuildLobbyCharacter();

    const mates = members.filter((m) => m.id !== localClientId).slice(0, 3);
    mates.forEach((m, idx) => {
      const pos = FortbloxEngine.LOBBY_SLOT_POSITIONS[idx + 1];
      if (!pos) return;
      const rig = createHumanoidRig(m.skinId || 'recruit', this.textures.contactShadow, 'player', this.textures);
      rig.root.position.set(pos[0], pos[1], pos[2]);
      rig.root.rotation.y = (idx === 0 ? 0.25 : idx === 1 ? -0.25 : 0.35);
      this.lobbyStage.add(rig.root);

      const badge = m.ready ? (m.isLeader ? 'LEADER · READY' : 'READY') : 'NOT READY';
      const accent = m.ready ? '#38bdf8' : '#f59e0b';
      const nameplate = createPlayerNameplate(m.name, badge, accent);
      nameplate.position.set(pos[0], pos[1] + 2.94, pos[2]);
      this.lobbyStage.add(nameplate);

      this.lobbyTeammateSlots.push({
        memberId: m.id,
        skinId: m.skinId,
        name: m.name,
        ready: m.ready,
        isLeader: m.isLeader,
        rig,
        nameplate,
        emoteTimer: 0,
        emoteId: m.emoteId || 'boogie',
      });
    });

    this.textures.applyTierQuality(this.settings.graphicsQuality);
  }

  public triggerLobbyPartyEmote(memberId: string, emoteId: EmoteId): void {
    const def = EMOTES.find((e) => e.id === emoteId);
    const dur = def ? def.duration : 3.8;
    if (memberId === this.lobbyLocalClientId) {
      this.triggerLobbyEmote(emoteId);
      return;
    }
    const slot = this.lobbyTeammateSlots.find((s) => s.memberId === memberId);
    if (slot) {
      slot.emoteId = emoteId;
      slot.emoteTimer = dur;
    }
  }

  public setMultiplayerClient(client: MultiplayerClient | null): void {
    this.mpClient = client;
  }

  public setTeamPreferences(teamMode: TeamMode, fillTeammates: boolean): void {
    this.teamMode = teamMode;
    this.fillTeammates = fillTeammates;
  }

  public setEquippedSkin(skinId: string): void {
    this.equippedSkin = skinId;
    this.previewSkin = null;
    this.rebuildLobbyCharacter();
  }

  public setPreviewSkin(skinId: string | null): void {
    if (this.previewSkin === skinId) return;
    this.previewSkin = skinId;
    this.rebuildLobbyCharacter();
  }

  public setEquippedEmote(emoteId: EmoteId): void {
    this.equippedEmote = emoteId;
    this.previewEmote = null;
  }

  public setPirateState(expiresAt: number, used: boolean): void {
    this.pirateExpiresAt = expiresAt;
    this.pirateTokenUsed = used;
  }

  public updateSettings(next: GameSettings): void {
    this.settings = {
      ...next,
      keybinds: { ...DEFAULT_KEYBINDS, ...(next.keybinds || {}) },
    };
    this.sound.setVolume(next.vol, next.muted);
    this.applyGraphicsSettings();
  }

  public setMatchConfig(mode: MatchMode, difficulty: BotDifficulty, rankedRp: number): void {
    this.matchMode = mode;
    this.botDifficulty = difficulty;
    this.rankedRp = rankedRp;
  }

  public triggerLobbyEmote(overrideEmoteId?: EmoteId): void {
    const id = overrideEmoteId ?? this.equippedEmote;
    const def = EMOTES.find((e) => e.id === id);
    this.previewEmote = overrideEmoteId ?? null;
    this.lobbyEmoteTimer = def ? def.duration : 3.8;
    this.sound.play('heal');
  }

  public setMapCanvases(minimap: HTMLCanvasElement | null, bigMap: HTMLCanvasElement | null): void {
    this.minimapCanvas = minimap;
    this.bigMapCanvas = bigMap;
  }

  private prerenderIslandMap(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(512, 512);
    for (let py = 0; py < 512; py++) {
      for (let px = 0; px < 512; px++) {
        const wx = (px / 512 - 0.5) * MAP_SIZE;
        const wz = (py / 512 - 0.5) * MAP_SIZE;
        const h = getTerrainHeight(wx, wz);
        const idx = (py * 512 + px) * 4;
        if (h < -0.2) {
          img.data[idx] = 14;
          img.data[idx + 1] = 94;
          img.data[idx + 2] = 168;
        } else if (h < 0.7) {
          img.data[idx] = 212;
          img.data[idx + 1] = 192;
          img.data[idx + 2] = 122;
        } else if (wx > 68 && h > 1.2) {
          // Autumn Highlands tint
          img.data[idx] = 128;
          img.data[idx + 1] = 122;
          img.data[idx + 2] = 52;
        } else {
          img.data[idx] = 55;
          img.data[idx + 1] = 145;
          img.data[idx + 2] = 58;
        }
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // =========================================================================
  // MATCH LIFECYCLE
  // =========================================================================

  private clearMatchEntities(): void {
    while (this.matchEntitiesGroup.children.length > 0) {
      this.matchEntitiesGroup.remove(this.matchEntitiesGroup.children[0]);
    }
    this.shotTallies.clear();
    this.chests = [];
    this.playerChestSearch = null;
    this.playerReviveChannel = null;
    this.playerRebootChannel = null;
    this.rebootCards = [];
    this.heldRebootCards = [];
    this.dbnoNetBleedAccum = 0;
    this.activePings = [];
    this.groundLoot = [];
    this.groundAmmo = [];
    this.bots = [];
    this.botById.clear();
    this.botHitboxMeshes = [];
    this.hitboxToBot.clear();
    this.remoteHumans.clear();
    this.remoteHumanHitboxMeshes = [];
    this.hitboxToRemoteHuman.clear();
    this.squadPingText = null;
    this.squadPingTextTimer = 0;
    this.netStateAccum = 0;
    this.hostBotsAccum = 0;
    this.stormTickAccum = 0;
    this.projectiles = [];
    this.shellCasings = [];
    this.battleBus = null;
    this.stormMesh = null;
    this.muzzleLight.intensity = 0;
    this.muzzleLightTimer = 0;
    this.muzzleFlashMesh.visible = false;
    this.muzzleFlashTimer = 0;
    for (const p of this.particlePool) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const dm of this.decalPool) {
      dm.visible = false;
    }
  }

  public startMatch(launchConfig?: MatchLaunchConfig): void {
    this.sound.unlock();
    this.clearMatchEntities();

    this.launchConfig = launchConfig ?? null;
    if (launchConfig) {
      this.matchMode = launchConfig.matchMode;
      this.botDifficulty = launchConfig.botDifficulty;
      this.teamMode = launchConfig.teamMode;
      this.fillTeammates = launchConfig.fillTeammates;
      this.localPlayerId = launchConfig.localPlayerId;
      this.isRoomHost = launchConfig.isRoomHost;
      const localEntry = launchConfig.roster.find((r) => r.isLocal) ?? launchConfig.roster[0];
      this.localTeamId = localEntry ? localEntry.teamId : 0;
      this.busStartX = launchConfig.busStart.x;
      this.busStartZ = launchConfig.busStart.z;
      this.busEndX = launchConfig.busEnd.x;
      this.busEndZ = launchConfig.busEnd.z;
      this.matchRng = seededRng(launchConfig.seed);
    } else {
      this.localPlayerId = 'local';
      this.localTeamId = 0;
      this.isRoomHost = true;
      this.busStartX = BUS_START_X;
      this.busStartZ = BUS_START_Z;
      this.busEndX = BUS_END_X;
      this.busEndZ = BUS_END_Z;
      this.matchRng = Math.random;
    }

    this.previewSkin = null;
    this.keys.clear();
    this.mouseDownLeft = false;
    this.bigMapOpen = false;
    this.backpackOpen = false;
    this.lastChestWasChug = false;
    this.stormProximity = 0;
    this.killFeed = [];
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;

    // Restore all destructible buildings, stairs, props, windows & supply crates on new match
    for (const d of this.destructibles) {
      d.hp = d.maxHp;
      d.broken = false;
      for (const m of d.meshes) {
        m.visible = true;
        if (!this.colliderMeshes.includes(m)) {
          this.colliderMeshes.push(m);
        }
      }
      for (const obIdx of d.obstacleIndices) {
        if (this.obstacles[obIdx]) {
          this.obstacles[obIdx].broken = false;
        }
      }
    }

    this.lobbyStage.visible = false;

    // Launch Battle Bus well before island coastline at high altitude — player starts with NO guns, only Pickaxe!
    this.battleBus = createBattleBusGroup(this.textures);
    const busPose = getBattleBusPose(this.busStartX, this.busStartZ, this.busEndX, this.busEndZ, 0.0, BUS_CRUISE_Y);
    this.battleBus.group.position.set(busPose.x, busPose.y, busPose.z);
    this.battleBus.group.rotation.y = busPose.yaw;
    this.matchEntitiesGroup.add(this.battleBus.group);

    this.player.inBattleBus = true;
    this.player.busProgress = 0.0;
    this.player.isSkydiving = false;
    this.player.x = busPose.x;
    this.player.y = busPose.y;
    this.player.z = busPose.z;
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.vy = 0;
    this.player.yaw = busPose.yaw + Math.PI;
    this.player.pitch = 0.36;
    this.player.hp = 100;
    this.player.shield = 0;
    this.player.alive = true;
    this.player.knocked = false;
    this.player.dbnoHp = 100;
    this.player.beingRevived = false;
    this.player.spectatingId = null;
    this.player.kills = 0;
    this.player.dmgDealt = 0;
    this.player.onGround = false;
    this.player.isGliding = false;
    this.player.skydiveWindTimer = 0;
    this.player.isSwimming = false;
    this.player.swimSplashTimer = 0;
    this.player.reloading = 0;
    this.player.healing = 0;
    this.player.fireCd = 0;
    this.player.equipTimer = 0;
    this.player.hitFlinchTimer = 0;
    this.player.isCrouching = false;
    this.player.isSliding = false;
    this.player.slideTimer = 0;
    this.player.slideCooldown = 0;
    this.player.slideDirX = 0;
    this.player.slideDirZ = 0;
    this.player.slideDustTimer = 0;
    this.player.strafeLean = 0;
    this.player.lastDamager = null;
    this.player.isAiming = false;
    this.player.emoteTimer = 0;
    this.player.squashY = 1;
    this.player.pickaxeEquipped = true;
    this.player.pickaxeSwing = 0;
    this.player.slots = [null, null, null, null, null];
    this.player.ammo = createEmptyAmmoBag();
    this.player.noAmmoHintTimer = 0;
    this.player.activeSlot = 0;

    this.player.rig = createHumanoidRig(this.equippedSkin, this.textures.contactShadow, 'player', this.textures);
    this.player.rig.setWeaponModel('pickaxe');
    this.player.rig.root.position.set(this.player.x, this.player.y, this.player.z);
    this.player.rig.root.visible = false;
    this.matchEntitiesGroup.add(this.player.rig.root);

    // Spawn remote human players (teammates + rival party squads)
    if (launchConfig) {
      for (const rh of launchConfig.roster) {
        if (!rh.isHuman || rh.isLocal) continue;
        const rig = createHumanoidRig(rh.skinId || 'recruit', this.textures.contactShadow, 'player', this.textures);
        rig.setWeaponModel('pickaxe');
        rig.root.position.set(busPose.x, busPose.y, busPose.z);
        rig.root.visible = false;
        this.matchEntitiesGroup.add(rig.root);

        const isAlly = isFriendlyTarget(rh.teamId, this.localTeamId);
        const nameplate = createPlayerNameplate(rh.name, isAlly ? 'SQUAD' : 'HOSTILE', isAlly ? '#38bdf8' : '#ef4444');
        nameplate.position.set(0, 2.88, 0);
        rig.root.add(nameplate);

        for (const hb of rig.hitboxes) {
          this.remoteHumanHitboxMeshes.push(hb.mesh);
          this.hitboxToRemoteHuman.set(hb.mesh, rh.id);
        }

        this.remoteHumans.set(rh.id, {
          id: rh.id,
          name: rh.name,
          skinId: rh.skinId || 'recruit',
          teamId: rh.teamId,
          hp: 100,
          shield: 0,
          alive: true,
          knocked: false,
          kills: 0,
          inBattleBus: true,
          isSkydiving: false,
          isGliding: false,
          isCrouching: false,
          isSliding: false,
          healing: false,
          x: busPose.x,
          y: busPose.y,
          z: busPose.z,
          yaw: busPose.yaw,
          pitch: 0,
          targetX: busPose.x,
          targetY: busPose.y,
          targetZ: busPose.z,
          targetYaw: busPose.yaw,
          speed: 0,
          activeWeaponId: 'pickaxe',
          emoteId: null,
          emoteTimer: 0,
          rig,
          nameplate,
          dyingTimer: 0,
        });
      }
    }

    const bSin = Math.sin(this.player.yaw);
    const bCos = Math.cos(this.player.yaw);
    const bPitch = this.player.pitch;
    this.camPosSmooth.set(
      this.player.x + bSin * 27 * Math.cos(bPitch) + bCos * 4.4,
      this.player.y + 7.6 + Math.sin(bPitch) * 27,
      this.player.z + bCos * 27 * Math.cos(bPitch) - bSin * 4.4,
    );
    this.camLookSmooth.set(
      this.player.x - bSin * 22 * Math.cos(bPitch),
      this.player.y + 7.25 - Math.sin(bPitch) * 18,
      this.player.z - bCos * 22 * Math.cos(bPitch),
    );
    this.camera.fov = 74;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.camPosSmooth);
    this.camera.lookAt(this.camLookSmooth);

    this.storm = {
      cx: (this.matchRng() - 0.5) * 65,
      cz: (this.matchRng() - 0.5) * 65,
      radius: 400,
      targetRadius: 45,
      phaseTimer: 60,
      shrinkRate: 3.0,
    };
    const stormGeo = new THREE.CylinderGeometry(1, 1, 180, 48, 1, true);
    const stormMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stormMesh = new THREE.Mesh(stormGeo, stormMat);
    this.stormMesh.position.set(this.storm.cx, 40, this.storm.cz);
    this.stormMesh.scale.set(this.storm.radius, 1, this.storm.radius);
    this.matchEntitiesGroup.add(this.stormMesh);

    this.spawn90IndoorChests();
    this.spawnIslandFloorLoot();
    this.spawnBots(launchConfig);
    this.textures.applyTierQuality(this.settings.graphicsQuality);

    this.mode = 'playing';
    document.body.dataset.state = 'playing';
    this.callbacks.onModeChange('playing');
    this.sound.play('bus_horn');
    this.emitHud();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.dirLight.target.position.set(this.player.x, 0, this.player.z);
    this.dirLight.position.set(this.player.x + 135, 220, this.player.z + 95);
    this.renderFrame();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.tryLockPointer();
  }

  private spawn90IndoorChests(): void {
    const slots = this.buildingSlots.slice(0, TOTAL_CHESTS);
    slots.forEach((pos, idx) => {
      const { group, lidPivot, halo, shockRing } = createChestGroup(this.textures);
      group.position.set(pos.x, pos.y, pos.z);
      group.rotation.y = this.matchRng() * Math.PI * 2;
      this.matchEntitiesGroup.add(group);
      this.chests.push({
        id: idx,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        opened: false,
        openProgress: 0,
        mesh: group,
        lidPivot,
        halo,
        shockRing,
      });
    });
  }

  private spawnIslandFloorLoot(): void {
    for (const spot of this.floorLootSlots) {
      const drop = pickFloorLootDrop(this.matchRng, this.lastChestWasChug);
      if (drop.kind === 'gun') {
        const rar = pickRandomRarity(this.matchRng);
        this.spawnGroundLoot(spot.x, spot.y, spot.z, makeWeaponItem(drop.weaponId, rar));
        this.spawnGroundAmmo(spot.x + 0.85, spot.y, spot.z + 0.45, drop.ammoType, drop.ammoAmount);
      } else if (drop.kind === 'ammo') {
        this.spawnGroundAmmo(spot.x, spot.y, spot.z, drop.ammoType, drop.ammoAmount);
      } else {
        this.lastChestWasChug = drop.healId === 'chug';
        this.spawnGroundLoot(spot.x, spot.y, spot.z, makeWeaponItem(drop.healId));
      }
    }
  }

  private spawnBots(launchConfig?: MatchLaunchConfig): void {
    const botSkinPool = SKINS.filter((s) => !s.pirateExclusive).map((s) => s.id);
    const policies: BotPolicy[] = ['rusher', 'flanker', 'overwatch'];
    const busStartPose = getBattleBusPose(this.busStartX, this.busStartZ, this.busEndX, this.busEndZ, 0.0, BUS_CRUISE_Y);
    const rng = this.matchRng;

    const roster = launchConfig
      ? launchConfig.roster
      : assignMatchTeams({
          humanMembers: [{ id: 'local', name: 'You', skinId: this.equippedSkin, emoteId: this.equippedEmote }],
          teamMode: this.teamMode,
          fillTeammates: this.fillTeammates,
          totalPlayers: 25,
          difficulty: this.botDifficulty,
          matchMode: this.matchMode,
          rankedRp: this.rankedRp,
          seed: Math.floor(1 + Math.random() * 1_999_999),
        });

    const botEntries = roster.filter((r) => !r.isHuman);
    const totalBots = Math.max(1, botEntries.length);

    botEntries.forEach((entry, i) => {
      const targetSlotIdx = this.chests.length > 0 ? (i * 3) % this.chests.length : -1;
      const targetChest = targetSlotIdx >= 0 ? this.chests[targetSlotIdx] : null;
      const slotMeta = targetSlotIdx >= 0 ? this.buildingSlots[targetSlotIdx] : null;
      const targetBuilding =
        slotMeta?.buildingIdx !== undefined ? this.buildings[slotMeta.buildingIdx] : undefined;
      const poi = POIS[i % POIS.length];
      const ang = rng() * Math.PI * 2;
      const targetX = targetBuilding
        ? targetBuilding.doorX + (rng() - 0.5) * 1.4
        : targetChest
          ? targetChest.x
          : poi.x + Math.cos(ang) * (12 + rng() * 28);
      const targetZ = targetBuilding
        ? targetBuilding.doorZ + 2.0
        : targetChest
          ? targetChest.z
          : poi.z + Math.sin(ang) * (12 + rng() * 28);

      const skinId = entry.skinId || botSkinPool[Math.floor(rng() * botSkinPool.length)];
      const policy = policies[i % policies.length];
      const tier: BotSkillTier = entry.skillTier ?? 'veteran';
      const squadId = entry.teamId;
      const isAllyBot = isFriendlyTarget(squadId, this.localTeamId);
      const pickaxeItem = makeWeaponItem('pickaxe');

      const rig = createHumanoidRig(skinId, this.textures.contactShadow, tier, this.textures);
      rig.setWeaponModel('pickaxe');
      rig.root.position.set(busStartPose.x, busStartPose.y, busStartPose.z);
      rig.root.visible = false;
      this.matchEntitiesGroup.add(rig.root);

      let nameplate: THREE.Sprite | null = null;
      if (isAllyBot) {
        nameplate = createPlayerNameplate(entry.name, 'ALLY BOT', '#22c55e');
        nameplate.position.set(0, 2.88, 0);
        rig.root.add(nameplate);
      }

      let telegraphLine: THREE.Line | null = null;
      if (!isAllyBot && (policy === 'overwatch' || tier === 'pro')) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(0, 0, -1),
        ]);
        const lineMat = new THREE.LineBasicMaterial({
          color: tier === 'pro' ? 0xfb7185 : 0xf87171,
          transparent: true,
          opacity: 0.72,
        });
        telegraphLine = new THREE.Line(lineGeo, lineMat);
        telegraphLine.visible = false;
        this.matchEntitiesGroup.add(telegraphLine);
      }

      const busJumpProgress = Math.min(
        0.78,
        0.2 + (i / Math.max(1, totalBots - 1)) * 0.56 + (rng() - 0.5) * 0.03,
      );

      const bot: BotEntity = {
        id: entry.id,
        name: entry.name,
        squadId,
        skinId,
        nameplate,
        flankSide: i % 2 === 0 ? 1 : -1,
        pingCooldown: 0.5 + rng() * 2.5,
        chestChannel: null,
        policy,
        tier,
        x: busStartPose.x,
        y: busStartPose.y,
        z: busStartPose.z,
        yaw: busStartPose.yaw,
        hp: 100,
        shield: 0,
        alive: true,
        knocked: false,
        dbnoHp: 100,
        reviveProgress: 0,
        revivingTargetId: null,
        beingRevived: false,
        inBattleBus: true,
        busJumpProgress,
        isSkydiving: false,
        isGliding: false,
        dyingTimer: 0,
        hitFlashTimer: 0,
        hitFlinchTimer: 0,
        rig,
        slots: [null, null, null, null, null],
        ammo: createEmptyAmmoBag(),
        activeSlot: -1,
        weapon: pickaxeItem,
        pickaxeSwing: 0,
        midRangeSwitchRoll: rng(),
        midRangeRollTimer: 0.9 + rng() * 0.9,
        fireCd: 0.5 + rng() * 0.6,
        burstRemaining: 0,
        burstShotIndex: 0,
        aimAcquireTimer: tier === 'pro' ? 0.25 : tier === 'veteran' ? 0.42 : 0.65,
        losClear: true,
        losCheckTimer: rng() * 0.2,
        healingTimer: 0,
        healingSlotIdx: -1,
        alertTimer: 0,
        alertTargetX: targetX,
        alertTargetZ: targetZ,
        telegraphLine,
        moveTargetX: targetX,
        moveTargetZ: targetZ,
        retargetTimer: 1.5 + rng() * 1.2,
        strafeDir: rng() < 0.5 ? 1 : -1,
        strafeFlipTimer: 0.7 + rng() * 0.9,
        lastShotTime: -999,
        recoil: 0,
        aimSampleX: targetX,
        aimSampleY: BUS_CRUISE_Y,
        aimSampleZ: targetZ,
        aimSampleTimer: 0.12,
        isSwimming: false,
        isCrouching: false,
        crouchToggleTimer: 0.4 + rng() * 0.6,
        slideTimer: 0,
        slideCooldown: 1.2 + rng() * 1.6,
        deathProgress: 0,
        strafeLean: 0,
        vy: 0,
        onGround: false,
        jumpCooldown: 1 + rng() * 1.5,
        lastCheckX: busStartPose.x,
        lastCheckZ: busStartPose.z,
        stuckCheckTimer: 0.45,
        stuckSteerTimer: 0,
        stuckTurnAngle: 0,
        driftSeed: rng() * 100,
      };

      this.bots.push(bot);
      this.botById.set(bot.id, bot);
      for (const hb of rig.hitboxes) {
        this.botHitboxMeshes.push(hb.mesh);
        this.hitboxToBot.set(hb.mesh, { bot, zone: hb.zone, multiplier: hb.multiplier });
      }
    });
  }

  public pauseMatch(): void {
    if (this.mode !== 'playing') return;
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.keys.clear();
    this.mouseDownLeft = false;
    this.player.isAiming = false;
    this.playerChestSearch = null;
    this.playerReviveChannel = null;
    this.playerRebootChannel = null;
    this.backpackOpen = false;
    this.sound.silenceStormAudio();
    this.mode = 'paused';
    document.body.dataset.state = 'paused';
    this.callbacks.onModeChange('paused');
    this.emitHud();
  }

  public resumeMatch(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    document.body.dataset.state = 'playing';
    this.callbacks.onModeChange('playing');
    this.tryLockPointer();
  }

  public returnToLobby(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.mpClient?.leaveMatch();
    this.launchConfig = null;
    this.sound.silenceStormAudio();
    this.clearMatchEntities();
    this.keys.clear();
    this.mouseDownLeft = false;
    this.bigMapOpen = false;
    this.backpackOpen = false;
    this.mode = 'title';
    document.body.dataset.state = 'title';
    this.lobbyStage.visible = true;
    this.rebuildLobbyCharacter();
    this.callbacks.onModeChange('title');
  }

  private endMatch(isVictory: boolean): void {
    if (this.mode === 'gameover') return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.sound.silenceStormAudio();
    this.keys.clear();
    this.mouseDownLeft = false;
    this.player.isAiming = false;
    this.playerChestSearch = null;
    this.playerReviveChannel = null;
    this.playerRebootChannel = null;
    this.bigMapOpen = false;
    this.backpackOpen = false;
    this.mode = 'gameover';
    document.body.dataset.state = 'gameover';
    this.sound.play(isVictory ? 'victory' : 'defeat');

    const allyHumans = Array.from(this.remoteHumans.values()).filter((r) => isFriendlyTarget(r.teamId, this.localTeamId));
    const allyBots = this.bots.filter((b) => isFriendlyTarget(b.squadId, this.localTeamId));
    const teamAlive =
      allyHumans.filter((r) => r.alive).length +
      allyBots.filter((b) => b.alive).length +
      (this.player.alive ? 1 : 0);
    const teammateNames = [...allyHumans.map((r) => r.name), ...allyBots.map((b) => b.name)];

    const aliveCombatants = [
      { teamId: this.localTeamId, alive: this.player.alive },
      ...Array.from(this.remoteHumans.values()).map((r) => ({ teamId: r.teamId, alive: r.alive })),
      ...this.bots.map((b) => ({ teamId: b.squadId, alive: b.alive })),
    ];
    const remainingTeams = computeAliveTeamsCount(aliveCombatants);
    const totalTeams = Math.max(2, new Set(aliveCombatants.map((c) => c.teamId)).size);

    const summary: MatchSummary = {
      isVictory,
      placement: isVictory ? 1 : Math.min(totalTeams, Math.max(2, remainingTeams)),
      kills: this.player.kills,
      damageDealt: Math.round(this.player.dmgDealt),
      pirateActive: isPirateTokenActive(this.pirateExpiresAt),
      teamMode: this.teamMode,
      teamAlive,
      teammateNames,
      matchMode: this.matchMode,
      botDifficulty: this.botDifficulty,
      eliminatedBy: isVictory
        ? undefined
        : this.player.lastDamager ?? { name: 'Island Hazard', weaponName: 'Elimination', distanceM: 0 },
    };
    this.callbacks.onModeChange('gameover');
    this.callbacks.onMatchEnd(summary);
  }

  public toggleBigMap(): void {
    if (this.mode !== 'playing') return;
    this.bigMapOpen = !this.bigMapOpen;
    if (this.bigMapOpen) {
      this.backpackOpen = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    this.emitHud();
  }

  public toggleBackpack(): void {
    if (this.mode !== 'playing' || this.player.inBattleBus) return;
    this.backpackOpen = !this.backpackOpen;
    if (this.backpackOpen) {
      this.bigMapOpen = false;
      this.mouseDownLeft = false;
      this.player.isAiming = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    } else {
      this.tryLockPointer();
    }
    this.emitHud();
  }

  public swapBackpackSlots(idxA: number, idxB: number): void {
    if (this.mode !== 'playing') return;
    this.player.slots = swapBackpackSlots(this.player.slots, idxA, idxB);
    if (!this.player.pickaxeEquipped) {
      if (this.player.activeSlot === idxA) this.player.activeSlot = idxB;
      else if (this.player.activeSlot === idxB) this.player.activeSlot = idxA;
      const item = this.player.slots[this.player.activeSlot];
      this.player.rig?.setWeaponModel(item ? item.def.id : null);
    }
    this.sound.play('hit');
    this.emitHud();
  }

  public dropBackpackSlot(idx: number): void {
    if (this.mode !== 'playing' || this.player.inBattleBus) return;
    const res = dropBackpackSlot(this.player.slots, idx);
    this.player.slots = res.nextSlots;
    if (res.droppedItem) {
      const fwdX = -Math.sin(this.player.yaw);
      const fwdZ = -Math.cos(this.player.yaw);
      const dropX = this.player.x + fwdX * 1.65;
      const dropZ = this.player.z + fwdZ * 1.65;
      const dropY = Math.max(-0.2, getWalkableSurfaceY(dropX, dropZ, this.player.y + 0.5, this.obstacles));
      this.spawnGroundLoot(dropX, dropY, dropZ, res.droppedItem);
      this.sound.play('drop');
      if (!this.player.pickaxeEquipped && this.player.activeSlot === idx) {
        this.selectPickaxe();
      }
    }
    this.emitHud();
  }

  public selectPickaxe(): void {
    this.player.pickaxeEquipped = true;
    this.player.reloading = 0;
    this.player.healing = 0;
    this.player.healItem = null;
    this.player.isAiming = false;
    this.player.equipTimer = 0.16;
    this.player.rig?.setWeaponModel('pickaxe');
    this.emitHud();
  }

  public selectSlot(idx: number): void {
    if (idx < 0 || idx > 4) return;
    this.player.pickaxeEquipped = false;
    this.player.activeSlot = idx;
    this.player.reloading = 0;
    this.player.healing = 0;
    this.player.healItem = null;
    this.player.equipTimer = 0.16;
    const item = this.player.slots[idx];
    if (this.player.rig) {
      this.player.rig.setWeaponModel(item ? item.def.id : null);
    }
    this.emitHud();
  }

  private jumpFromBattleBus(): void {
    if (!this.player.inBattleBus || this.player.busProgress < BUS_DROP_UNLOCK_PROGRESS) return;
    this.player.inBattleBus = false;
    this.player.isSkydiving = true;
    this.player.isGliding = false;
    this.player.skydiveWindTimer = 0;
    this.player.y = BUS_CRUISE_Y - 7.0;
    this.player.vy = -12;
    this.player.pitch = 0.34;
    this.camPosSmooth.y = Math.min(this.camPosSmooth.y, BUS_CRUISE_Y - 3.2);
    this.camLookSmooth.y = this.player.y + 1.8;
    if (this.player.rig) {
      this.player.rig.root.visible = true;
      this.player.rig.setWeaponModel('pickaxe');
    }
    _v1.set(this.player.x, this.player.y, this.player.z);
    this.spawnBurstParticles(_v1, 0xe0f2fe, 10, 6);
    this.sound.play('glider');
    if (this.launchConfig && this.mpClient) {
      this.mpClient.send('bus:jump', {
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.yaw,
      });
    }
    this.emitHud();
  }

  // =========================================================================
  // INPUT & POINTER LOCK
  // =========================================================================

  private getBind(action: KeybindAction): string {
    return this.settings.keybinds?.[action] ?? DEFAULT_KEYBINDS[action];
  }

  private isBindDown(action: KeybindAction): boolean {
    const code = this.getBind(action);
    if (this.keys.has(code)) return true;
    if (code === 'ShiftLeft' && this.keys.has('ShiftRight')) return true;
    if (code === 'ShiftRight' && this.keys.has('ShiftLeft')) return true;
    return false;
  }

  private hasLivingFriendlyTeammate(): boolean {
    for (const rh of this.remoteHumans.values()) {
      if (rh.alive && isFriendlyTarget(rh.teamId, this.localTeamId)) return true;
    }
    for (const bot of this.bots) {
      if (bot.alive && isFriendlyTarget(bot.squadId, this.localTeamId)) return true;
    }
    return false;
  }

  private getSpectateCandidates(): Array<{ id: string; name: string; x: number; y: number; z: number; yaw: number }> {
    const mates: Array<{ id: string; name: string; x: number; y: number; z: number; yaw: number }> = [];
    for (const rh of this.remoteHumans.values()) {
      if (rh.alive && isFriendlyTarget(rh.teamId, this.localTeamId)) {
        mates.push({ id: rh.id, name: rh.name, x: rh.x, y: rh.y, z: rh.z, yaw: rh.yaw });
      }
    }
    for (const bot of this.bots) {
      if (bot.alive && isFriendlyTarget(bot.squadId, this.localTeamId)) {
        mates.push({ id: bot.id, name: bot.name, x: bot.x, y: bot.y, z: bot.z, yaw: bot.yaw });
      }
    }
    if (mates.length > 0) return mates;
    // Fallback to any living combatant while awaiting victory broadcast
    for (const rh of this.remoteHumans.values()) {
      if (rh.alive) mates.push({ id: rh.id, name: rh.name, x: rh.x, y: rh.y, z: rh.z, yaw: rh.yaw });
    }
    for (const bot of this.bots) {
      if (bot.alive) mates.push({ id: bot.id, name: bot.name, x: bot.x, y: bot.y, z: bot.z, yaw: bot.yaw });
    }
    return mates;
  }

  public cycleSpectateTarget(dir = 1): void {
    const list = this.getSpectateCandidates();
    if (list.length === 0) {
      this.player.spectatingId = null;
      return;
    }
    const curIdx = list.findIndex((c) => c.id === this.player.spectatingId);
    const nextIdx = curIdx === -1 ? 0 : (curIdx + dir + list.length) % list.length;
    this.player.spectatingId = list[nextIdx].id;
    this.emitHud();
  }

  private getDbnoCombatants(): DbnoCombatantLike[] {
    const list: DbnoCombatantLike[] = [
      { id: this.localPlayerId, teamId: this.localTeamId, alive: this.player.alive, knocked: this.player.knocked },
    ];
    for (const rh of this.remoteHumans.values()) {
      list.push({ id: rh.id, teamId: rh.teamId, alive: rh.alive, knocked: rh.knocked });
    }
    for (const bot of this.bots) {
      list.push({ id: bot.id, teamId: bot.squadId, alive: bot.alive, knocked: bot.knocked });
    }
    return list;
  }

  private spawnRebootCardEntity(
    playerId: string,
    name: string,
    teamId: number,
    isHuman: boolean,
    skinId: string,
    x: number,
    y: number,
    z: number,
  ): void {
    if (!isFriendlyTarget(teamId, this.localTeamId)) return;
    if (this.rebootCards.some((c) => c.id === playerId) || this.heldRebootCards.some((c) => c.id === playerId)) {
      return;
    }
    const mesh = createRebootCardGroup();
    const gy = Math.max(-0.2, getWalkableSurfaceY(x, z, y + 0.5, this.obstacles));
    mesh.position.set(x, gy, z);
    this.matchEntitiesGroup.add(mesh);
    this.rebootCards.push({
      id: playerId,
      name,
      teamId,
      isHuman,
      skinId,
      x,
      y: gy,
      z,
      expiresSec: REBOOT_CARD_DURATION,
      mesh,
    });
  }

  private collectRebootCard(idx: number, fromNetwork = false): void {
    const card = this.rebootCards[idx];
    if (!card) return;
    this.matchEntitiesGroup.remove(card.mesh);
    this.rebootCards.splice(idx, 1);
    if (!this.heldRebootCards.some((c) => c.id === card.id)) {
      this.heldRebootCards.push({
        id: card.id,
        name: card.name,
        teamId: card.teamId,
        isHuman: card.isHuman,
        skinId: card.skinId,
        expiresSec: card.expiresSec,
      });
    }
    this.sound.play('pirate');
    _v1.set(card.x, card.y + 0.8, card.z);
    this.spawnBurstParticles(_v1, 0x38bdf8, 14, 6);
    this.killFeed = [`Collected ${card.name}'s Reboot Card`, ...this.killFeed].slice(0, 5);
    if (!fromNetwork && this.launchConfig && this.mpClient) {
      this.mpClient.send('reboot:cardCollected', { cardPlayerId: card.id });
    }
    this.emitHud();
  }

  private dropBotLoot(bot: BotEntity): void {
    const carriedLoot = bot.slots.filter((s): s is InventoryItem => s !== null);
    if (carriedLoot.length > 0) {
      carriedLoot.slice(0, 3).forEach((item, idx) => {
        this.spawnGroundLoot(bot.x + (idx - 1) * 0.95, bot.y, bot.z + (idx % 2) * 0.5, item);
      });
    }
    const droppedCalibers: AmmoType[] = ['medium', 'shells', 'light', 'heavy'];
    let droppedAmmoOffset = 0;
    for (const at of droppedCalibers) {
      const amt = bot.ammo[at] ?? 0;
      if (amt > 0) {
        this.spawnGroundAmmo(bot.x + 0.65 - droppedAmmoOffset * 0.55, bot.y, bot.z - 0.75, at, amt);
        droppedAmmoOffset++;
      }
    }
    if (bot.tier === 'pro' && Math.random() < 0.02) {
      this.spawnGroundLoot(bot.x + 1.1, bot.y, bot.z + 0.7, makeWeaponItem('chug'));
    } else if (Math.random() < 0.18) {
      this.spawnGroundLoot(bot.x + 1.0, bot.y, bot.z + 0.6, makeWeaponItem(Math.random() < 0.86 ? 'mini' : 'big'));
    }
  }

  private eliminateBotFinal(bot: BotEntity, attackerName: string, attackerId = ''): void {
    if (!bot.alive) return;
    bot.alive = false;
    bot.knocked = false;
    bot.beingRevived = false;
    bot.dyingTimer = 0.85;
    bot.deathProgress = 0;
    if (bot.telegraphLine) bot.telegraphLine.visible = false;
    this.dropBotLoot(bot);
    if (attackerName === 'You' || attackerId === this.localPlayerId) {
      this.player.kills++;
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
      this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
      this.killFeed = [`You eliminated ${bot.name}`, ...this.killFeed].slice(0, 5);
    } else {
      this.killFeed = [`${attackerName} eliminated ${bot.name}`, ...this.killFeed].slice(0, 5);
    }
    if (isFriendlyTarget(bot.squadId, this.localTeamId) && this.hasLivingFriendlyTeammate()) {
      this.spawnRebootCardEntity(bot.id, bot.name, bot.squadId, false, bot.skinId, bot.x, bot.y, bot.z);
    }
  }

  private handleLocalPlayerEliminated(sourceName: string, weaponName: string, distanceM: number): void {
    if (!this.player.alive) return;
    this.player.alive = false;
    this.player.knocked = false;
    this.player.dbnoHp = 0;
    this.player.beingRevived = false;
    this.player.hp = 0;
    this.player.shield = 0;
    this.player.isAiming = false;
    this.player.healing = 0;
    this.player.reloading = 0;
    this.playerChestSearch = null;
    this.playerReviveChannel = null;
    this.playerRebootChannel = null;
    this.mouseDownLeft = false;
    this.backpackOpen = false;
    if (this.player.rig) {
      this.player.rig.root.visible = false;
    }
    this.player.lastDamager = {
      name: sourceName,
      weaponName,
      distanceM: Math.max(1, Math.round(distanceM)),
    };
    this.killFeed = [`${sourceName} eliminated You`, ...this.killFeed].slice(0, 5);

    if (this.hasLivingFriendlyTeammate()) {
      this.cycleSpectateTarget(1);
      this.emitHud();
    } else {
      this.endMatch(false);
    }
  }

  private tryLockPointer(): void {
    try {
      const dom = this.renderer.domElement;
      if (document.pointerLockElement !== dom && dom.requestPointerLock) {
        const res = dom.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') res.catch(() => {});
      }
    } catch {
      // Ignore pointer lock rejection in automated/headless browsers
    }
  }

  public setLobbyShowcaseSideView(sideView: boolean): void {
    this.lobbySideView = sideView;
  }

  private applyCameraLookDelta(dx: number, dy: number): void {
    const cdx = THREE.MathUtils.clamp(dx, -60, 60);
    const cdy = THREE.MathUtils.clamp(dy, -60, 60);
    const aimMult = this.player.isAiming ? 0.55 : 1.0;
    const sens = 0.0025 * this.settings.sens * aimMult;
    const ySign = this.settings.invertY ? -1 : 1;
    this.player.yaw -= cdx * sens;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch + cdy * sens * ySign, -0.52, 0.72);
  }

  private onMouseMove = (e: MouseEvent) => {
    if (this.mode !== 'playing' || this.bigMapOpen || this.backpackOpen) return;
    if (performance.now() < this.pointerLockGraceUntil) return;
    if (document.pointerLockElement === this.renderer.domElement) {
      const mx = e.movementX || 0;
      const my = e.movementY || 0;
      if (Math.abs(mx) > 150 || Math.abs(my) > 150) return;
      this.applyCameraLookDelta(mx, my);
    } else {
      if (this.lastClientX !== null && this.lastClientY !== null) {
        const dx = e.clientX - this.lastClientX;
        const dy = e.clientY - this.lastClientY;
        if (Math.abs(dx) < 150 && Math.abs(dy) < 150) {
          this.applyCameraLookDelta(dx * 1.45, dy * 1.45);
        }
      }
      this.lastClientX = e.clientX;
      this.lastClientY = e.clientY;
      this.normMouseX = e.clientX / Math.max(1, window.innerWidth);
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== 'playing' || this.bigMapOpen || this.backpackOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest && target.closest('button')) return;
    this.sound.unlock();
    this.tryLockPointer();

    if (!this.player.alive) {
      if (e.button === 0) this.cycleSpectateTarget(1);
      else if (e.button === 2) this.cycleSpectateTarget(-1);
      return;
    }

    if (this.player.knocked || this.player.inBattleBus || this.player.isSkydiving) return;

    if (e.button === 0) {
      this.mouseDownLeft = true;
      this.tryUseActiveSlot(true);
    } else if (e.button === 2) {
      if (!this.player.pickaxeEquipped && this.player.slots[this.player.activeSlot]?.def.type === 'gun') {
        this.player.isAiming = true;
      }
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDownLeft = false;
    if (e.button === 2) this.player.isAiming = false;
  };

  private onContextMenu = (e: MouseEvent) => {
    if (this.mode === 'playing') e.preventDefault();
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLockGraceUntil = performance.now() + 120;
    this.lastClientX = null;
    this.lastClientY = null;
    this.emitHud();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (document.body.dataset.rebinding === '1') return;
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;

    const code = e.code;
    const firstPress = !this.keys.has(code);
    this.keys.add(code);

    if (this.mode !== 'playing') return;

    if (code === this.getBind('backpack')) {
      e.preventDefault();
      if (firstPress && this.player.alive && !this.player.knocked) {
        this.toggleBackpack();
      }
      return;
    }

    if (firstPress) {
      if (this.backpackOpen) {
        if (code === 'Escape' || code === 'KeyP') {
          this.toggleBackpack();
        }
        return;
      }

      if (!this.player.alive) {
        if (code === this.getBind('jump') || code === 'ArrowRight') {
          this.cycleSpectateTarget(1);
        } else if (code === 'ArrowLeft') {
          this.cycleSpectateTarget(-1);
        } else if (code === this.getBind('map')) {
          this.toggleBigMap();
        } else if (code === 'KeyP' || code === 'Escape') {
          this.pauseMatch();
        }
        return;
      }

      if (code === this.getBind('map')) {
        this.toggleBigMap();
        return;
      }
      if (code === 'KeyP' || code === 'Escape') {
        this.pauseMatch();
        return;
      }
      if (code === this.getBind('ping') && !this.player.inBattleBus) {
        this.triggerPlayerPing();
        return;
      }

      if (this.player.knocked) return;

      if (code === this.getBind('jump')) {
        if (this.player.inBattleBus) {
          this.jumpFromBattleBus();
          return;
        }
        if (this.player.isSkydiving) {
          this.player.isGliding = !this.player.isGliding;
          _v1.set(this.player.x, this.player.y + 1.2, this.player.z);
          this.spawnBurstParticles(_v1, 0x38bdf8, 8, 5.5);
          this.sound.play('glider');
          this.emitHud();
          return;
        }
        this.jumpBufferTimer = 0.12;
      }
      if (code === this.getBind('pickaxe')) this.selectPickaxe();
      if (code === this.getBind('slot1')) this.selectSlot(0);
      if (code === this.getBind('slot2')) this.selectSlot(1);
      if (code === this.getBind('slot3')) this.selectSlot(2);
      if (code === this.getBind('slot4')) this.selectSlot(3);
      if (code === this.getBind('slot5')) this.selectSlot(4);
      if (code === this.getBind('reload')) this.startReload();
      if (code === this.getBind('interact')) this.tryInteract();
      if (code === this.getBind('crouch') && !this.player.isSkydiving && !this.player.inBattleBus && !this.player.isSwimming) {
        const wantsSlide =
          this.isBindDown('sprint') &&
          this.isBindDown('forward') &&
          this.player.onGround &&
          !this.player.isSliding &&
          this.player.slideCooldown <= 0;
        if (wantsSlide) {
          this.player.isSliding = true;
          this.player.slideTimer = 0.62;
          this.player.slideCooldown = 0.9;
          this.player.isCrouching = false;
          this.player.slideDustTimer = 0;
          this.player.slideDirX = -Math.sin(this.player.yaw);
          this.player.slideDirZ = -Math.cos(this.player.yaw);
        } else if (this.player.isSliding) {
          this.player.isSliding = false;
          this.player.slideTimer = 0;
          this.player.isCrouching = true;
        } else {
          this.player.isCrouching = !this.player.isCrouching;
        }
      }
      if (code === this.getBind('emote') && !this.player.isSkydiving && !this.player.inBattleBus) {
        const emoteDef = EMOTES.find((em) => em.id === this.equippedEmote);
        this.player.emoteTimer = emoteDef ? emoteDef.duration : 3.8;
        if (this.launchConfig && this.mpClient) {
          this.sendLocalPlayerState();
        }
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === this.getBind('jump') && !this.player.isGliding && !this.player.isSkydiving && this.player.vy > 3.5) {
      this.player.vy *= 0.55;
    }
    this.keys.delete(e.code);
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== 'playing' || this.backpackOpen || !this.player.alive || this.player.knocked) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectSlot((this.player.activeSlot + dir + 5) % 5);
  };

  private onWindowBlur = () => {
    this.keys.clear();
    this.mouseDownLeft = false;
    this.player.isAiming = false;
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.keys.clear();
      this.mouseDownLeft = false;
      this.player.isAiming = false;
    }
  };

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderFrame();
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLostChange(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLostChange(false);
  };

  private bindEvents(): void {
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('wheel', this.onWheel);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    this.sound.silenceStormAudio();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.textures.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // =========================================================================
  // COMBAT, LOOTING & BALLISTICS
  // =========================================================================

  private startReload(): void {
    if (this.player.pickaxeEquipped) return;
    const item = this.player.slots[this.player.activeSlot];
    if (!item || item.def.type !== 'gun') return;
    if ((item.ammo ?? 0) >= item.def.mag || this.player.reloading > 0) return;
    const reserve = this.player.ammo[item.def.ammoType] ?? 0;
    if (reserve <= 0) {
      this.player.noAmmoHintTimer = 1.6;
      this.emitHud();
      return;
    }
    this.player.reloading = item.def.reload;
    this.player.reloadTotal = item.def.reload;
    this.sound.play('reload');
    this.emitHud();
  }

  private tryInteract(): void {
    if (!this.player.alive || this.player.knocked || this.player.inBattleBus || this.player.isSkydiving) return;

    // 1. Revive knocked friendly human or ally bot
    for (const rh of this.remoteHumans.values()) {
      if (
        rh.alive &&
        rh.knocked &&
        isFriendlyTarget(rh.teamId, this.localTeamId) &&
        Math.hypot(this.player.x - rh.x, this.player.z - rh.z) < 3.6 &&
        Math.abs(this.player.y - rh.y) < 2.6
      ) {
        if (!this.playerReviveChannel || this.playerReviveChannel.targetId !== rh.id) {
          this.playerReviveChannel = { targetId: rh.id, targetName: rh.name, targetType: 'human', elapsed: 0 };
          this.sound.play('step');
          this.emitHud();
        }
        return;
      }
    }
    for (const bot of this.bots) {
      if (
        bot.alive &&
        bot.knocked &&
        isFriendlyTarget(bot.squadId, this.localTeamId) &&
        Math.hypot(this.player.x - bot.x, this.player.z - bot.z) < 3.6 &&
        Math.abs(this.player.y - bot.y) < 2.6
      ) {
        if (!this.playerReviveChannel || this.playerReviveChannel.targetId !== bot.id) {
          this.playerReviveChannel = { targetId: bot.id, targetName: bot.name, targetType: 'bot', elapsed: 0 };
          this.sound.play('step');
          this.emitHud();
        }
        return;
      }
    }

    // 2. Collect friendly Reboot Card
    for (let i = 0; i < this.rebootCards.length; i++) {
      const c = this.rebootCards[i];
      if (Math.hypot(this.player.x - c.x, this.player.z - c.z) < 4.4 && Math.abs(this.player.y - c.y) < 3.2) {
        this.collectRebootCard(i);
        return;
      }
    }

    // 3. Channel Reboot Van if holding friendly Reboot Cards
    if (this.heldRebootCards.length > 0) {
      for (const van of this.rebootVans) {
        if (Math.hypot(this.player.x - van.x, this.player.z - van.z) < 5.0 && Math.abs(this.player.y - van.y) < 3.8) {
          if (!this.playerRebootChannel || this.playerRebootChannel.van.id !== van.id) {
            this.playerRebootChannel = { van, elapsed: 0 };
            this.sound.play('step');
            this.emitHud();
          }
          return;
        }
      }
    }

    // 4. Open Chest
    for (const ch of this.chests) {
      if (!ch.opened && Math.hypot(this.player.x - ch.x, this.player.z - ch.z) < 5.2 && Math.abs(this.player.y - ch.y) < 3.6) {
        if (!this.playerChestSearch || this.playerChestSearch.chest.id !== ch.id) {
          this.playerChestSearch = { chest: ch, elapsed: 0 };
          this.sound.play('step');
          this.emitHud();
        }
        return;
      }
    }

    // 5. Ground Ammo & Loot
    for (let i = 0; i < this.groundAmmo.length; i++) {
      const a = this.groundAmmo[i];
      if (Math.hypot(this.player.x - a.x, this.player.z - a.z) < 4.0 && Math.abs(this.player.y - a.y) < 3.2) {
        this.pickupGroundAmmo(i);
        return;
      }
    }
    for (let i = 0; i < this.groundLoot.length; i++) {
      const l = this.groundLoot[i];
      if (Math.hypot(this.player.x - l.x, this.player.z - l.z) < 4.0 && Math.abs(this.player.y - l.y) < 3.2) {
        this.pickupGroundLoot(i);
        return;
      }
    }
  }

  private openChest(
    chest: ChestEntity,
    openedByPlayer = true,
    openerTier: BotSkillTier = 'veteran',
    fromNetwork = false,
  ): void {
    if (chest.opened) return;
    chest.opened = true;
    chest.openProgress = 0.01;
    chest.halo.visible = false;
    chest.shockRing.visible = true;
    chest.shockRing.scale.setScalar(0.4);
    const ringMat = chest.shockRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.92;

    if (!fromNetwork && this.launchConfig && this.mpClient) {
      this.mpClient.send('chest:open', { chestIdx: chest.id });
    }

    if (openedByPlayer || Math.hypot(this.player.x - chest.x, this.player.z - chest.z) < 42) {
      this.sound.play('chest');
    }
    _v1.set(chest.x, chest.y + 1.0, chest.z);
    this.spawnBurstParticles(_v1, 0xfde047, 18, 7.5);
    this.spawnBurstParticles(_v1, 0x38bdf8, 8, 5.5);

    const chestRng = this.launchConfig
      ? seededRng(((this.launchConfig.seed ^ ((chest.id + 1) * 2654435761)) >>> 0) || 1)
      : Math.random;

    const rar = openedByPlayer ? pickRandomRarity(chestRng) : pickBotRarity(openerTier, chestRng);
    const gId = pickChestWeaponId(chestRng, true);
    const weaponItem = makeWeaponItem(gId, rar);
    this.spawnGroundLoot(chest.x + 0.9, chest.y, chest.z + 0.55, weaponItem);
    if (weaponItem.def.type === 'gun') {
      const at = weaponItem.def.ammoType;
      this.spawnGroundAmmo(chest.x, chest.y, chest.z + 1.15, at, AMMO_DEFS[at].stackSize);
    }

    // Heals are no longer guaranteed in every chest: only ~30% drop a heal (rare Medkits/Mini/Big/Chug)
    const hId = pickChestHealDrop(chestRng, this.lastChestWasChug);
    if (hId) {
      this.lastChestWasChug = hId === 'chug';
      this.spawnGroundLoot(chest.x - 0.9, chest.y, chest.z + 0.55, makeWeaponItem(hId));
    }

    if (openedByPlayer && !fromNetwork) {
      this.emitHud();
      // Unlimited Pirate Token: only prevent re-rolling while timer is still active
      const alreadyActive = isPirateTokenActive(this.pirateExpiresAt);
      const roll = rollPirateToken(Date.now(), Math.random, alreadyActive);
      if (roll.granted) {
        this.pirateExpiresAt = roll.expiresAt;
        this.sound.play('pirate');
        this.callbacks.onPirateTokenFound(roll.expiresAt);
      }
    }
  }

  private spawnGroundLoot(x: number, y: number, z: number, item: InventoryItem): void {
    const mesh = createGroundLootGroup(item, this.textures.getLootLabelTexture, this.textures);
    mesh.position.set(x, y, z);
    this.matchEntitiesGroup.add(mesh);
    this.textures.applyTierQuality(this.settings.graphicsQuality);
    const spinner = mesh.getObjectByName('lootSpinner') ?? null;
    const label = (mesh.getObjectByName('lootLabel') as THREE.Sprite | undefined) ?? null;
    this.groundLoot.push({ x, y, z, item, mesh, spinner, label, popTime: 0.35 });
  }

  private spawnGroundAmmo(x: number, y: number, z: number, ammoType: AmmoType, amount: number): void {
    const mesh = createAmmoPackGroup(ammoType, amount, this.textures.getLootLabelTexture);
    mesh.position.set(x, y, z);
    this.matchEntitiesGroup.add(mesh);
    const spinner = mesh.getObjectByName('lootSpinner') ?? null;
    const label = (mesh.getObjectByName('lootLabel') as THREE.Sprite | undefined) ?? null;
    this.groundAmmo.push({ x, y, z, ammoType, amount, mesh, spinner, label, popTime: 0.35 });
  }

  private pickupGroundAmmo(idx: number): void {
    const ammo = this.groundAmmo[idx];
    this.player.ammo[ammo.ammoType] += ammo.amount;
    this.matchEntitiesGroup.remove(ammo.mesh);
    this.groundAmmo.splice(idx, 1);
    this.sound.play('hit');
    this.emitHud();
  }

  private pickupGroundLoot(idx: number): void {
    const loot = this.groundLoot[idx];
    const replaceSlot = this.player.pickaxeEquipped ? 0 : this.player.activeSlot;
    const result = pickupWithDrop(this.player.slots, replaceSlot, loot.item);
    this.player.slots = result.nextSlots;

    this.matchEntitiesGroup.remove(loot.mesh);
    this.groundLoot.splice(idx, 1);

    if (result.droppedItem) {
      const fwdX = -Math.sin(this.player.yaw);
      const fwdZ = -Math.cos(this.player.yaw);
      const dx = this.player.x + fwdX * 1.45;
      const dz = this.player.z + fwdZ * 1.45;
      const dy = Math.max(-0.2, getWalkableSurfaceY(dx, dz, this.player.y + 0.4, this.obstacles));
      this.spawnGroundLoot(dx, dy, dz, result.droppedItem);
      this.sound.play('drop');
    } else {
      this.sound.play('hit');
    }

    this.selectSlot(result.nextActiveSlot);
  }

  private damageDestructible(
    st: DestructibleStructureDef,
    rawDmg: number,
    isPickaxe: boolean,
    hitPos: THREE.Vector3,
    fromNetwork = false,
  ): void {
    if (st.broken) return;
    const res = applyStructureDamage(st.hp, rawDmg, isPickaxe);
    st.hp = res.nextHp;

    if (!fromNetwork && this.launchConfig && this.mpClient) {
      this.mpClient.send('structure:damage', {
        structId: st.id,
        broken: res.broken,
        hpPct: st.hp / Math.max(1, st.maxHp),
      });
    }

    const particleCol =
      st.materialKind === 'metal'
        ? 0x38bdf8
        : st.materialKind === 'glass'
          ? 0xbae6fd
          : st.materialKind === 'brick'
            ? 0x94a3b8
            : 0xd97706;
    this.spawnBurstParticles(hitPos, particleCol, res.broken ? 14 : 6, res.broken ? 7.5 : 4.5);
    if (isPickaxe) {
      this.sound.play('pickaxe_hit');
    }

    if (res.broken) {
      st.broken = true;
      for (const m of st.meshes) {
        m.visible = false;
        const colIdx = this.colliderMeshes.indexOf(m);
        if (colIdx !== -1) this.colliderMeshes.splice(colIdx, 1);
      }
      for (const obIdx of st.obstacleIndices) {
        if (this.obstacles[obIdx]) {
          this.obstacles[obIdx].broken = true;
        }
      }
      const distPlayer = Math.hypot(st.center.x - this.player.x, st.center.z - this.player.z);
      if (distPlayer < 38) {
        this.sound.play('break');
      }
      if (distPlayer < 9) {
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.14);
      }

      if (st.dropAmmoOnBreak) {
        const dropY = Math.max(-0.2, getWalkableSurfaceY(st.center.x, st.center.z, st.center.y, this.obstacles));
        const brRng = this.launchConfig
          ? seededRng(((this.launchConfig.seed ^ ((st.id + 17) * 2246822519)) >>> 0) || 1)
          : Math.random;
        const roll = brRng();
        if (roll < 0.52) {
          const wg = pickChestWeaponId(brRng, false);
          const crateItem = makeWeaponItem(wg, pickRandomRarity(brRng));
          this.spawnGroundLoot(st.center.x, dropY, st.center.z, crateItem);
          if (crateItem.def.type === 'gun') {
            const at = crateItem.def.ammoType;
            this.spawnGroundAmmo(st.center.x + 0.75, dropY, st.center.z + 0.45, at, AMMO_DEFS[at].stackSize);
          }
        } else if (roll < 0.82) {
          const aPick = brRng();
          const at: AmmoType = aPick < 0.45 ? 'medium' : aPick < 0.8 ? 'shells' : aPick < 0.93 ? 'light' : 'heavy';
          this.spawnGroundAmmo(st.center.x, dropY, st.center.z, at, AMMO_DEFS[at].stackSize);
        } else {
          const hId = pickChestHealId(brRng, this.lastChestWasChug);
          this.lastChestWasChug = hId === 'chug';
          this.spawnGroundLoot(st.center.x, dropY, st.center.z, makeWeaponItem(hId));
        }
      }
    }
  }

  private performPickaxeSwing(): void {
    const axeDef = WEAPON_DEFS.pickaxe;
    if (axeDef.type !== 'melee') return;
    if (this.player.fireCd > 0) return;

    this.player.fireCd = axeDef.swingRate;
    this.player.pickaxeSwing = 1.0;
    this.player.emoteTimer = 0;
    this.sound.play('pickaxe_swing');

    const fwdX = -Math.sin(this.player.yaw);
    const fwdZ = -Math.cos(this.player.yaw);
    let landedHit = false;

    for (const bot of this.bots) {
      if (!bot.alive || bot.inBattleBus || (bot.isSkydiving && !bot.isGliding)) continue;
      if (isFriendlyTarget(bot.squadId, this.localTeamId)) continue;
      const dx = bot.x - this.player.x;
      const dz = bot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      const dy = Math.abs(bot.y - this.player.y);
      if (dist <= axeDef.range && dy < 2.2) {
        const dot = dist > 0.1 ? (dx * fwdX + dz * fwdZ) / dist : 1;
        if (dot > 0.2) {
          _v1.set(bot.x, bot.y + 1.35, bot.z);
          this.applyDamageToBot(bot, axeDef.dmg, 'You', false, _v1, undefined, false, this.localPlayerId, 'Tactical Pickaxe', dist);
          this.sound.play('pickaxe_hit');
          this.callbacks.onHitmarker();
          landedHit = true;
          break;
        }
      }
    }

    if (!landedHit && this.launchConfig && this.mpClient) {
      for (const rh of this.remoteHumans.values()) {
        if (!rh.alive || rh.inBattleBus || isFriendlyTarget(rh.teamId, this.localTeamId)) continue;
        const dx = rh.x - this.player.x;
        const dz = rh.z - this.player.z;
        const dist = Math.hypot(dx, dz);
        const dy = Math.abs(rh.y - this.player.y);
        if (dist <= axeDef.range && dy < 2.2) {
          const dot = dist > 0.1 ? (dx * fwdX + dz * fwdZ) / dist : 1;
          if (dot > 0.2) {
            _v1.set(rh.x, rh.y + 1.35, rh.z);
            this.spawnBurstParticles(_v1, rh.shield > 0 ? 0x38bdf8 : 0xf97316, 8, 5);
            this.mpClient.send('player:hit', {
              targetId: rh.id,
              attackerId: this.localPlayerId,
              damage: axeDef.dmg,
              weaponName: 'Tactical Pickaxe',
              distanceM: Math.max(1, Math.round(dist)),
              isHeadshot: false,
            });
            this.sound.play('pickaxe_hit');
            this.callbacks.onHitmarker();
            landedHit = true;
            break;
          }
        }
      }
    }

    // Harvest / smash any building wall, roof, stair, window, furniture, or prop in melee swing reach
    if (!landedHit) {
      _projRaycaster.setFromCamera(_center2D, this.camera);
      _projRaycaster.far = 9.5;
      const camHits = _projRaycaster.intersectObjects(this.colliderMeshes, false);
      let smashed = false;
      for (const ch of camHits) {
        const dest = this.meshToDestructible.get(ch.object);
        if (!dest || dest.broken) continue;
        const playerDist = Math.hypot(ch.point.x - this.player.x, ch.point.y - (this.player.y + 1.2), ch.point.z - this.player.z);
        if (playerDist <= axeDef.range + 2.4) {
          this.damageDestructible(dest, axeDef.dmg, true, ch.point);
          this.callbacks.onHitmarker();
          smashed = true;
          break;
        }
      }

      if (!smashed) {
        let bestDest: DestructibleStructureDef | null = null;
        let bestDist = axeDef.range + 1.4;
        for (const d of this.destructibles) {
          if (d.broken) continue;
          const dx = d.center.x - this.player.x;
          const dz = d.center.z - this.player.z;
          const dist = Math.hypot(dx, dz);
          if (dist < bestDist && Math.abs(d.center.y - (this.player.y + 1.0)) <= 2.6) {
            const dot = dist > 0.1 ? (dx * fwdX + dz * fwdZ) / dist : 1;
            if (dot > 0.15) {
              bestDist = dist;
              bestDest = d;
            }
          }
        }
        if (bestDest) {
          _v1.set(bestDest.center.x, bestDest.center.y, bestDest.center.z);
          this.damageDestructible(bestDest, axeDef.dmg, true, _v1);
          this.callbacks.onHitmarker();
        }
      }
    }
  }

  private alertBotsOnPlayerShot(fireDir: THREE.Vector3, weaponRange: number): void {
    const hearingRadius = Math.min(100, Math.max(68, weaponRange * 0.42));
    for (const bot of this.bots) {
      if (!bot.alive || bot.inBattleBus || bot.isSkydiving) continue;
      const dx = bot.x - this.player.x;
      const dz = bot.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      const forwardDot = dist > 0.1 ? (dx * fireDir.x + dz * fireDir.z) / dist : 0;
      const nearFlyby = forwardDot > 0.93 && dist < Math.min(110, weaponRange);
      if (dist < hearingRadius || nearFlyby) {
        if (bot.alertTimer <= 0) {
          bot.aimAcquireTimer = bot.tier === 'pro' ? 0.5 : bot.tier === 'veteran' ? 0.72 : 1.0;
        }
        bot.alertTimer = Math.max(bot.alertTimer, 9.0);
        bot.alertTargetX = this.player.x;
        bot.alertTargetZ = this.player.z;
        bot.retargetTimer = Math.min(bot.retargetTimer, 0.35);
      }
    }
  }

  private tryUseActiveSlot(isInitialClick: boolean): void {
    if (!this.player.alive || this.player.knocked || this.player.inBattleBus || this.player.isSkydiving) return;

    if (this.player.pickaxeEquipped) {
      if (isInitialClick || this.player.fireCd <= 0) {
        this.performPickaxeSwing();
      }
      return;
    }

    const item = this.player.slots[this.player.activeSlot];
    if (!item) return;

    if (item.def.type === 'heal') {
      if (!isInitialClick || this.player.healing > 0) return;
      if (item.def.healType === 'shield' && this.player.shield >= item.def.maxCap) return;
      if (item.def.healType === 'hp' && this.player.hp >= item.def.maxCap) return;
      if (item.def.healType === 'both' && this.player.hp >= item.def.maxCap && this.player.shield >= item.def.maxCap) {
        return;
      }
      this.player.healing = item.def.castTime;
      this.player.healTotal = item.def.castTime;
      this.player.healItem = { slotIdx: this.player.activeSlot, def: item.def };
      this.emitHud();
      return;
    }

    if (item.def.type !== 'gun') return;
    if (this.player.fireCd > 0 || this.player.reloading > 0 || this.player.healing > 0) return;
    if (!isInitialClick && !item.def.auto) return;
    if ((item.ammo ?? 0) <= 0) {
      if ((this.player.ammo[item.def.ammoType] ?? 0) > 0) {
        this.startReload();
      } else if (isInitialClick) {
        this.player.noAmmoHintTimer = 1.6;
        this.emitHud();
      }
      return;
    }

    item.ammo = (item.ammo ?? 1) - 1;
    this.player.fireCd = item.def.fireRate;
    this.player.recoil = 1.0;
    this.player.emoteTimer = 0;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - item.def.recoilKick * 0.55, -0.52, 0.72);
    this.cameraTrauma = Math.min(1, this.cameraTrauma + item.def.recoilKick * 2.2);
    this.sound.play(`shoot_${item.def.id}`);
    this.emitHud();

    // Advanced Crosshair Raycast Convergence: find exact 3D point under center reticle
    _projRaycaster.setFromCamera(_center2D, this.camera);
    _projRaycaster.far = item.def.range;
    const botAimHits = _projRaycaster.intersectObjects(this.botHitboxMeshes, false);
    const humanAimHits =
      this.remoteHumanHitboxMeshes.length > 0
        ? _projRaycaster.intersectObjects(this.remoteHumanHitboxMeshes, false)
        : [];
    const worldAimHits = _projRaycaster.intersectObjects(this.colliderMeshes, false);

    let convergeDist = Math.min(220, item.def.range);
    if (worldAimHits.length > 0 && worldAimHits[0].distance > 2.2) {
      convergeDist = worldAimHits[0].distance;
    }
    if (botAimHits.length > 0 && botAimHits[0].distance > 1.5 && botAimHits[0].distance < convergeDist) {
      convergeDist = botAimHits[0].distance;
    }
    if (humanAimHits.length > 0 && humanAimHits[0].distance > 1.5 && humanAimHits[0].distance < convergeDist) {
      convergeDist = humanAimHits[0].distance;
    }

    _v2.copy(_projRaycaster.ray.origin).addScaledVector(_projRaycaster.ray.direction, convergeDist);
    const endX = _v2.x;
    const endY = _v2.y;
    const endZ = _v2.z;

    const muzzleX = this.player.x + Math.cos(this.player.yaw) * 0.42 - Math.sin(this.player.yaw) * 0.65;
    const muzzleY = this.player.y + (this.player.isCrouching ? 1.15 : 1.52);
    const muzzleZ = this.player.z - Math.sin(this.player.yaw) * 0.42 - Math.cos(this.player.yaw) * 0.65;
    _v3.set(muzzleX, muzzleY, muzzleZ);

    const fireDir = _v2.sub(_v3).normalize();
    this.spawnMuzzleFlash(_v3, fireDir);
    this.spawnShellCasing(_v3, this.player.yaw);
    this.alertBotsOnPlayerShot(fireDir, item.def.range);

    if (this.launchConfig && this.mpClient) {
      this.mpClient.send('shot:fire', {
        muzzle: [muzzleX, muzzleY, muzzleZ],
        end: [endX, endY, endZ],
        rarityHex: item.rarity.hex,
        weaponId: item.def.id,
      });
    }

    // Orthonormal camera-basis plane perpendicular to fireDir so shotgun cones are even regardless of facing yaw
    _v5.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    _v6.crossVectors(_v5, fireDir).normalize();
    const crouchScale = this.player.isCrouching ? 0.72 : 1.0;
    const pelletOffsets = computeShotgunPelletSpreadOffsets(
      item.def.pellets,
      item.def.spread * crouchScale,
      this.player.isAiming,
    );

    const shotId = this.nextShotId++;
    for (let p = 0; p < pelletOffsets.length; p++) {
      const off = pelletOffsets[p];
      _v4.copy(fireDir).addScaledVector(_v5, off.right).addScaledVector(_v6, off.up).normalize();
      this.spawnProjectile(
        _v3,
        _v4,
        item.def.bulletSpeed,
        item.damage ?? item.def.dmg,
        item.def.headMult,
        shotId,
        item.rarity.hex,
        true,
        'You',
        item.def.name,
        this.localTeamId,
        this.localPlayerId,
      );
    }

    if (item.ammo === 0) this.startReload();
  }

  private spawnProjectile(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    damage: number,
    headMult: number,
    shotId: number,
    colorHex: number,
    fromPlayer: boolean,
    ownerName: string,
    weaponName = 'Assault Rifle',
    ownerSquadId = -1,
    ownerId = '',
  ): void {
    const mat = this.getBasicMat(colorHex);
    const mesh = new THREE.Mesh(this.sharedBulletGeo, mat);
    mesh.position.copy(origin);
    _v1.copy(origin).add(dir);
    mesh.lookAt(_v1);
    this.matchEntitiesGroup.add(mesh);

    this.projectiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(speed),
      damage,
      headMult,
      shotId,
      fromPlayer,
      ownerName,
      ownerId,
      ownerSquadId,
      weaponName,
      spawnX: origin.x,
      spawnY: origin.y,
      spawnZ: origin.z,
      life: 1.75,
      gravity: speed > 350 ? 2.5 : 0,
      bulletRadius: fromPlayer ? 0.14 : 0.1,
    });
  }

  private spawnBurstParticles(pos: THREE.Vector3, colorHex: number, count = 10, speed = 7): void {
    const mat = this.getBasicMat(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particlePool[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particlePool.length;
      p.active = true;
      p.mesh.material = mat;
      p.mesh.position.copy(pos);
      p.mesh.visible = true;
      p.vx = (Math.random() - 0.5) * speed * 2;
      p.vy = Math.random() * speed + 1.5;
      p.vz = (Math.random() - 0.5) * speed * 2;
      p.life = 0.32 + Math.random() * 0.25;
    }
  }

  private spawnMuzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3): void {
    this.muzzleFlashMesh.position.copy(pos).addScaledVector(dir, 0.55);
    this.muzzleFlashMesh.scale.set(1.2, 1.2, 2.2);
    _v1.copy(this.muzzleFlashMesh.position).add(dir);
    this.muzzleFlashMesh.lookAt(_v1);
    this.muzzleFlashMesh.visible = true;
    this.muzzleFlashTimer = 0.055;

    this.muzzleLight.position.copy(this.muzzleFlashMesh.position);
    this.muzzleLight.intensity = 2.2;
    this.muzzleLightTimer = 0.055;
  }

  private spawnShellCasing(pos: THREE.Vector3, yaw: number): void {
    if (this.shellCasings.length >= 24) return;
    const m = new THREE.Mesh(this.sharedShellGeo, this.sharedShellMat);
    m.position.copy(pos);
    this.matchEntitiesGroup.add(m);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    this.shellCasings.push({
      mesh: m,
      vx: rightX * (2.5 + Math.random() * 1.5) + (Math.random() - 0.5),
      vy: 2.8 + Math.random() * 1.2,
      vz: rightZ * (2.5 + Math.random() * 1.5) + (Math.random() - 0.5),
      life: 1.2,
    });
  }

  private spawnImpactDecal(pos: THREE.Vector3, normal: THREE.Vector3): void {
    const dm = this.decalPool[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decalPool.length;
    dm.position.copy(pos).addScaledVector(normal, 0.025);
    dm.quaternion.setFromUnitVectors(_upVec, normal);
    dm.visible = true;
  }

  private recordPlayerShotDamage(
    wx: number,
    wy: number,
    wz: number,
    dmg: number,
    isCrit: boolean,
    hadShield: boolean,
    shotKey?: string,
  ): void {
    this.player.dmgDealt += dmg;
    let displayDmg = Math.max(1, Math.round(dmg));
    let displayCrit = isCrit;
    let displayShield = hadShield;
    if (shotKey) {
      const existing = this.shotTallies.get(shotKey);
      if (existing) {
        existing.dmg += dmg;
        existing.isCrit = existing.isCrit || isCrit;
        existing.ttl = 0.25;
        displayDmg = Math.max(1, Math.round(existing.dmg));
        displayCrit = existing.isCrit;
        displayShield = existing.hadShield;
      } else {
        this.shotTallies.set(shotKey, { dmg, isCrit, hadShield, ttl: 0.25 });
      }
    }
    _v1.set(wx, wy, wz).project(this.camera);
    if (_v1.z >= -1 && _v1.z <= 1) {
      const sx = (_v1.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-_v1.y * 0.5 + 0.5) * window.innerHeight;
      this.callbacks.onDamageNumber(sx, sy, displayDmg, displayShield, displayCrit, shotKey);
    }
    if (isCrit) this.hitstopTimer = Math.max(this.hitstopTimer, 0.03);
  }

  private applyDamageToBot(
    bot: BotEntity,
    dmg: number,
    attackerName: string,
    isCrit: boolean,
    hitPos: THREE.Vector3 | null,
    shotKey?: string,
    fromNetwork = false,
    attackerId = this.localPlayerId,
    weaponName = 'Rifle',
    distanceM = 0,
  ): void {
    if (!bot.alive) return;
    if (attackerName === 'You' && isFriendlyTarget(bot.squadId, this.localTeamId)) return;

    const hadShield = !bot.knocked && bot.shield > 0;
    const roundedDmg = Math.max(1, Math.round(dmg));

    if (this.launchConfig && this.mpClient && !fromNetwork) {
      if (hitPos) {
        this.spawnBurstParticles(hitPos, hadShield ? 0x38bdf8 : 0xf97316, isCrit ? 12 : 7, 6);
      }
      if (attackerName === 'You' || this.isRoomHost) {
        this.mpClient.send('player:hit', {
          targetId: bot.id,
          attackerId: attackerName === 'You' ? this.localPlayerId : attackerId,
          damage: roundedDmg,
          weaponName,
          distanceM: Math.max(1, Math.round(distanceM)),
          isHeadshot: isCrit,
        });
      }
      if (attackerName === 'You') {
        this.recordPlayerShotDamage(bot.x, bot.y + 2.35, bot.z, dmg, isCrit, hadShield, shotKey);
      }
      return;
    }

    bot.hitFlashTimer = 0.07;
    bot.hitFlinchTimer = 0.2;
    bot.rig.setHitFlash(true);

    if (attackerName === 'You') {
      if (bot.alertTimer <= 0) {
        bot.aimAcquireTimer = bot.tier === 'pro' ? 0.42 : bot.tier === 'veteran' ? 0.65 : 0.9;
      }
      bot.alertTimer = 14;
      bot.alertTargetX = this.player.x;
      bot.alertTargetZ = this.player.z;
      bot.retargetTimer = 0.18;
      for (const ally of this.bots) {
        if (!ally.alive || ally === bot) continue;
        if (Math.hypot(ally.x - bot.x, ally.z - bot.z) < 38) {
          if (ally.alertTimer <= 0) ally.aimAcquireTimer = 0.75;
          ally.alertTimer = Math.max(ally.alertTimer, 10);
          ally.alertTargetX = this.player.x;
          ally.alertTargetZ = this.player.z;
        }
      }
    }

    if (hitPos) {
      this.spawnBurstParticles(hitPos, hadShield ? 0x38bdf8 : 0xf97316, isCrit ? 12 : 7, 6);
    }

    if (attackerName === 'You' && !fromNetwork) {
      this.recordPlayerShotDamage(bot.x, bot.y + 2.35, bot.z, dmg, isCrit, hadShield, shotKey);
    }

    // If bot is already Knocked Down (DBNO), apply damage to DBNO bleed pool
    if (bot.knocked) {
      const dbnoRes = applyDbnoDamage(bot.dbnoHp, dmg);
      bot.dbnoHp = dbnoRes.dbnoHp;
      if (dbnoRes.eliminated) {
        this.eliminateBotFinal(bot, attackerName, attackerId);
        this.emitHud();
        if (!this.launchConfig && this.bots.every((b) => !b.alive || isFriendlyTarget(b.squadId, this.localTeamId))) {
          this.endMatch(true);
        }
      }
      return;
    }

    const res = computeDamageApplication(bot.hp, bot.shield, dmg);
    bot.hp = res.hp;
    bot.shield = res.shield;

    if (res.shieldBroken && attackerName === 'You') {
      this.sound.play('shieldBreak');
    }

    if (res.eliminated) {
      const combatants = this.getDbnoCombatants();
      if (shouldEnterDbno(bot.squadId, bot.id, combatants)) {
        bot.knocked = true;
        bot.hp = 0;
        bot.shield = 0;
        bot.dbnoHp = 100;
        bot.beingRevived = false;
        bot.healingTimer = 0;
        bot.chestChannel = null;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
        this.killFeed = [`${attackerName} knocked ${bot.name}`, ...this.killFeed].slice(0, 5);
        this.emitHud();
        return;
      }

      this.eliminateBotFinal(bot, attackerName, attackerId);
      const wipeIds = findSquadWipeTargets(bot.squadId, bot.id, combatants);
      for (const wid of wipeIds) {
        const wBot = this.botById.get(wid);
        if (wBot && wBot.alive) {
          this.eliminateBotFinal(wBot, attackerName, attackerId);
        } else if (wid === this.localPlayerId && this.player.alive) {
          this.handleLocalPlayerEliminated(attackerName, weaponName, distanceM);
        }
      }
      this.emitHud();
      if (!this.launchConfig && this.bots.every((b) => !b.alive || isFriendlyTarget(b.squadId, this.localTeamId))) {
        this.endMatch(true);
      }
    }
  }

  private applyDamageToPlayer(
    dmg: number,
    sourceName: string,
    weaponName = 'Assault Rifle',
    distanceM = 0,
    fromNetwork = false,
    attackerId = '',
  ): void {
    if (this.mode !== 'playing' || !this.player.alive || this.player.inBattleBus) return;
    if (this.launchConfig && this.mpClient && !fromNetwork) {
      if (this.isRoomHost && attackerId) {
        this.mpClient.send('player:hit', {
          targetId: this.localPlayerId,
          attackerId,
          damage: Math.max(1, Math.round(dmg)),
          weaponName,
          distanceM: Math.max(1, Math.round(distanceM)),
          isHeadshot: false,
        });
      }
      return;
    }

    this.player.lastDamager = {
      name: sourceName,
      weaponName,
      distanceM: Math.max(1, Math.round(distanceM)),
    };
    this.player.hitFlinchTimer = 0.2;
    this.cameraTrauma = Math.min(1, this.cameraTrauma + Math.min(0.45, dmg / 60));
    this.callbacks.onDamageFlash();

    if (this.player.knocked) {
      const dbnoRes = applyDbnoDamage(this.player.dbnoHp, dmg);
      this.player.dbnoHp = dbnoRes.dbnoHp;
      this.emitHud();
      if (dbnoRes.eliminated) {
        this.handleLocalPlayerEliminated(sourceName, weaponName, distanceM);
      }
      return;
    }

    const res = computeDamageApplication(this.player.hp, this.player.shield, dmg);
    this.player.hp = res.hp;
    this.player.shield = res.shield;
    if (res.shieldBroken) this.sound.play('shieldBreak');

    if (res.eliminated) {
      const combatants = this.getDbnoCombatants();
      if (shouldEnterDbno(this.localTeamId, this.localPlayerId, combatants)) {
        this.player.knocked = true;
        this.player.hp = 0;
        this.player.shield = 0;
        this.player.dbnoHp = 100;
        this.player.isAiming = false;
        this.player.healing = 0;
        this.player.reloading = 0;
        this.playerChestSearch = null;
        this.playerReviveChannel = null;
        this.playerRebootChannel = null;
        this.mouseDownLeft = false;
        this.killFeed = [`${sourceName} knocked You`, ...this.killFeed].slice(0, 5);
        this.emitHud();
        return;
      }

      const wipeIds = findSquadWipeTargets(this.localTeamId, this.localPlayerId, combatants);
      for (const wid of wipeIds) {
        const wBot = this.botById.get(wid);
        if (wBot && wBot.alive) {
          this.eliminateBotFinal(wBot, sourceName, attackerId);
        }
      }
      this.handleLocalPlayerEliminated(sourceName, weaponName, distanceM);
      return;
    }

    this.emitHud();
  }

  // =========================================================================
  // MAIN SIMULATION LOOP
  // =========================================================================

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } catch {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(0.08, Math.max(0.001, rawDt));

    // Animate drifting clouds & shimmering ocean across both lobby and gameplay
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (2.4 + (i % 3) * 0.9);
      if (c.position.x > 520) c.position.x = -520;
    }
    this.textures.water.offset.x = (this.textures.water.offset.x + dt * 0.03) % 1;
    this.textures.water.offset.y = (this.textures.water.offset.y + dt * 0.015) % 1;
    this.textures.waterNormal.offset.x = (this.textures.waterNormal.offset.x - dt * 0.022 + 1) % 1;
    this.textures.waterNormal.offset.y = (this.textures.waterNormal.offset.y + dt * 0.018) % 1;

    if (this.mode === 'title') {
      this.dirLight.target.position.set(0, 60, 0);
      this.dirLight.position.set(110, 220, 90);
      if (this.lobbyCharRig) {
        this.lobbyCharRig.root.rotation.y += dt * 0.55;
        if (this.lobbyEmoteTimer > 0) {
          this.lobbyEmoteTimer -= dt;
          if (this.lobbyEmoteTimer <= 0) this.previewEmote = null;
        }
        this.lobbyCharRig.animate(dt, {
          emoteTimer: this.lobbyEmoteTimer,
          emoteId: this.previewEmote ?? this.equippedEmote,
        });
      }
      for (const slot of this.lobbyTeammateSlots) {
        if (slot.emoteTimer > 0) slot.emoteTimer -= dt;
        slot.rig.animate(dt, {
          emoteTimer: Math.max(0, slot.emoteTimer),
          emoteId: slot.emoteId,
        });
      }
      const targetLookX = this.lobbySideView ? -1.25 : 0;
      this.lobbyTargetLookX = THREE.MathUtils.damp(this.lobbyTargetLookX, targetLookX, 8, dt);
      const hasSquadMates = this.lobbyTeammateSlots.length > 0;
      this.camera.fov = hasSquadMates ? 58 : 55;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(this.lobbyTargetLookX * 0.4, hasSquadMates ? 62.42 : 62.18, hasSquadMates ? 5.95 : 4.45);
      this.camera.lookAt(this.lobbyTargetLookX, hasSquadMates ? 61.34 : 61.2, hasSquadMates ? -0.35 : 0);
      this.renderFrame();
      this.scheduleNextTick();
      return;
    }

    if (this.mode === 'playing') {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
      if (this.squadPingTextTimer > 0) {
        this.squadPingTextTimer -= dt;
        if (this.squadPingTextTimer <= 0) this.squadPingText = null;
      }

      // Keep Battle Bus flying across island even after player drops
      if (this.battleBus && this.player.busProgress < 1.25) {
        this.player.busProgress += dt / BUS_DURATION_SEC;
        const pose = getBattleBusPose(
          this.busStartX,
          this.busStartZ,
          this.busEndX,
          this.busEndZ,
          Math.min(1, this.player.busProgress),
          BUS_CRUISE_Y,
        );
        this.battleBus.group.position.set(pose.x, pose.y, pose.z);
        this.battleBus.group.rotation.y = pose.yaw;
        this.battleBus.animate(dt);
        if (this.player.inBattleBus && this.player.busProgress >= 0.94) {
          this.jumpFromBattleBus();
        }
      }

      // Anchor shadow frustum around player for ultra-crisp local shadows
      this.dirLight.target.position.set(this.player.x, Math.max(0, this.player.y), this.player.z);
      this.dirLight.position.set(this.player.x + 135, Math.max(0, this.player.y) + 220, this.player.z + 95);

      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
        this.updateCamera(dt);
      } else {
        this.updatePlayer(dt);
        this.updateRemoteHumans(dt);
        this.updateBots(dt);
        this.updateProjectiles(dt);
        this.updateStorm(dt);
        this.updateFX(dt);
      }

      if (this.launchConfig && this.mpClient) {
        this.netStateAccum += dt;
        if (this.netStateAccum >= 0.05) {
          this.netStateAccum = 0;
          this.sendLocalPlayerState();
        }
        if (this.isRoomHost) {
          this.hostBotsAccum += dt;
          if (this.hostBotsAccum >= 0.1) {
            this.hostBotsAccum = 0;
            this.mpClient.send('bots:snapshot', {
              storm: this.storm,
              busProgress: this.player.busProgress,
              bots: this.bots.map((b) => ({
                id: b.id,
                x: Math.round(b.x * 100) / 100,
                y: Math.round(b.y * 100) / 100,
                z: Math.round(b.z * 100) / 100,
                yaw: Math.round(b.yaw * 1000) / 1000,
                hp: Math.round(b.knocked ? b.dbnoHp : b.hp),
                shield: Math.round(b.shield),
                alive: b.alive,
                knocked: b.knocked,
                activeWeaponId: b.weapon.def.id,
                crouch: b.isCrouching,
                skydiving: b.isSkydiving,
                glider: b.isGliding,
              })),
            });
          }
        }
      }

      if (this.minimapCanvas) {
        const ctx = this.minimapCanvas.getContext('2d');
        if (ctx) this.drawMapToCanvas(ctx, this.minimapCanvas.width, false);
      }
      if (this.bigMapOpen && this.bigMapCanvas) {
        const ctx = this.bigMapCanvas.getContext('2d');
        if (ctx) this.drawMapToCanvas(ctx, this.bigMapCanvas.width, true);
      }

      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.1) {
        this.hudEmitAccum = 0;
        this.emitHud();
      }
    }

    this.renderFrame();
    this.scheduleNextTick();
  }

  private updatePlayer(dt: number): void {
    this.player.fireCd = Math.max(0, this.player.fireCd - dt);
    this.player.recoil = Math.max(0, this.player.recoil - dt * 5.5);
    this.player.pickaxeSwing = Math.max(0, this.player.pickaxeSwing - dt * 2.4);
    this.player.equipTimer = Math.max(0, this.player.equipTimer - dt);
    this.player.hitFlinchTimer = Math.max(0, this.player.hitFlinchTimer - dt);
    this.player.squashY = THREE.MathUtils.lerp(this.player.squashY, 1.0, Math.min(1, dt * 12));
    if (this.player.emoteTimer > 0) this.player.emoteTimer -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    if (!this.backpackOpen) {
      const keyTurnSpeed = 2.3 * this.settings.sens;
      if (this.keys.has('ArrowLeft')) this.player.yaw += keyTurnSpeed * dt;
      if (this.keys.has('ArrowRight')) this.player.yaw -= keyTurnSpeed * dt;
      if (this.keys.has('ArrowUp'))
        this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - keyTurnSpeed * 0.65 * dt, -0.52, 0.72);
      if (this.keys.has('ArrowDown'))
        this.player.pitch = THREE.MathUtils.clamp(this.player.pitch + keyTurnSpeed * 0.65 * dt, -0.52, 0.72);

      if (!this.pointerLocked && !this.bigMapOpen) {
        if (this.normMouseX < 0.08) this.player.yaw += 1.9 * dt;
        else if (this.normMouseX > 0.92) this.player.yaw -= 1.9 * dt;
      }
    }

    // Eliminated Spectator Branch while living teammate remains (or waiting on victory sync)
    if (!this.player.alive) {
      const candidates = this.getSpectateCandidates();
      if (candidates.length === 0) {
        if (!this.launchConfig) {
          this.endMatch(false);
        }
        return;
      }
      if (!this.player.spectatingId || !candidates.some((c) => c.id === this.player.spectatingId)) {
        this.player.spectatingId = candidates[0].id;
      }
      this.updateCamera(dt, false);
      return;
    }

    if (this.player.inBattleBus) {
      const pose = getBattleBusPose(
        this.busStartX,
        this.busStartZ,
        this.busEndX,
        this.busEndZ,
        Math.min(1, this.player.busProgress),
        BUS_CRUISE_Y,
      );
      this.player.x = pose.x;
      this.player.y = pose.y;
      this.player.z = pose.z;
      this.updateCamera(dt, false);
      return;
    }

    // Knocked Down (DBNO) Crawl & Bleedout Branch
    if (this.player.knocked) {
      this.player.isAiming = false;
      this.player.healing = 0;
      this.player.reloading = 0;
      this.playerChestSearch = null;
      this.playerReviveChannel = null;
      this.playerRebootChannel = null;

      let fwd = 0;
      let right = 0;
      if (this.isBindDown('forward')) fwd += 1;
      if (this.isBindDown('backward')) fwd -= 1;
      if (this.isBindDown('right')) right += 1;
      if (this.isBindDown('left')) right -= 1;

      const sinY = Math.sin(this.player.yaw);
      const cosY = Math.cos(this.player.yaw);
      let vx = -sinY * fwd + cosY * right;
      let vz = -cosY * fwd - sinY * right;
      const len = Math.hypot(vx, vz);
      const crawlSpeed = 3.2;
      if (len > 0) {
        vx = (vx / len) * crawlSpeed;
        vz = (vz / len) * crawlSpeed;
      }
      this.player.vx = vx;
      this.player.vz = vz;
      this.player.x += vx * dt;
      this.player.z += vz * dt;
      const resPos = resolveObstacleCollision(this.player.x, this.player.z, this.player.y, this.obstacles, HALF_MAP, 0.58, 1.0);
      this.player.x = resPos.x;
      this.player.z = resPos.z;

      const surfY = getWalkableSurfaceY(this.player.x, this.player.z, this.player.y, this.obstacles);
      this.player.vy -= 28 * dt;
      this.player.y += this.player.vy * dt;
      if (this.player.y <= surfY) {
        this.player.y = surfY;
        this.player.vy = 0;
        this.player.onGround = true;
      }

      if (this.launchConfig && this.mpClient) {
        if (!this.player.beingRevived) {
          this.dbnoNetBleedAccum += dt;
          if (this.dbnoNetBleedAccum >= 0.5) {
            this.dbnoNetBleedAccum = 0;
            this.mpClient.send('combatant:selfDamage', { targetId: this.localPlayerId, damage: 1 });
          }
        }
      } else {
        const bleed = stepDbnoBleed(this.player.dbnoHp, dt, this.player.beingRevived);
        this.player.dbnoHp = bleed.dbnoHp;
        if (bleed.bledOut) {
          this.handleLocalPlayerEliminated(
            this.player.lastDamager?.name ?? 'Bleedout',
            this.player.lastDamager?.weaponName ?? 'Knockdown',
            this.player.lastDamager?.distanceM ?? 0,
          );
          return;
        }
      }

      if (this.player.rig) {
        this.player.rig.root.visible = true;
        this.player.rig.root.position.set(this.player.x, this.player.y, this.player.z);
        this.player.rig.root.rotation.y = this.player.yaw + Math.PI;
        this.player.rig.animate(dt, {
          speed: len > 0 ? crawlSpeed : 0,
          isKnocked: true,
          onGround: true,
          pitch: this.player.pitch,
        });
      }
      this.updateCamera(dt, false);
      return;
    }

    if (this.player.noAmmoHintTimer > 0) {
      this.player.noAmmoHintTimer = Math.max(0, this.player.noAmmoHintTimer - dt);
    }

    if (this.player.reloading > 0) {
      this.player.reloading -= dt;
      if (this.player.reloading <= 0) {
        this.player.reloading = 0;
        const item = this.player.slots[this.player.activeSlot];
        if (item && item.def.type === 'gun') {
          const transfer = computeReloadTransfer(
            item.ammo ?? 0,
            item.def.mag,
            this.player.ammo[item.def.ammoType] ?? 0,
          );
          item.ammo = transfer.nextMag;
          this.player.ammo[item.def.ammoType] = transfer.nextReserve;
        }
        this.emitHud();
      }
    }

    if (this.player.healing > 0 && this.player.healItem) {
      this.player.healing -= dt;
      if (this.player.healing <= 0) {
        const hDef = this.player.healItem.def;
        if (hDef.type === 'heal') {
          const healed = computeHealApplication(
            this.player.hp,
            this.player.shield,
            hDef.healType,
            hDef.amount,
            hDef.maxCap,
          );
          this.player.hp = healed.hp;
          this.player.shield = healed.shield;
        }
        this.player.slots[this.player.healItem.slotIdx] = null;
        this.player.healItem = null;
        this.player.healing = 0;
        this.sound.play('heal');
        this.emitHud();
      }
    }

    if (this.mouseDownLeft && !this.backpackOpen && !this.player.isSkydiving) {
      this.tryUseActiveSlot(false);
    }

    let fwd = 0;
    let right = 0;
    if (!this.backpackOpen) {
      if (this.isBindDown('forward')) fwd += 1;
      if (this.isBindDown('backward')) fwd -= 1;
      if (this.isBindDown('right')) right += 1;
      if (this.isBindDown('left')) right -= 1;
    }

    this.player.slideCooldown = Math.max(0, this.player.slideCooldown - dt);
    if (fwd !== 0 || right !== 0) this.player.emoteTimer = 0;

    const groundSurfaceY = getWalkableSurfaceY(this.player.x, this.player.z, this.player.y, this.obstacles);
    const inDeepWater = !this.player.isSkydiving && groundSurfaceY < -0.28 && this.player.y <= -0.32;
    this.player.isSwimming = inDeepWater;
    if (inDeepWater) {
      this.player.isGliding = false;
      this.player.isCrouching = false;
      this.player.isSliding = false;
      this.player.slideTimer = 0;
    }

    if (this.player.isSliding) {
      this.player.slideTimer -= dt;
      this.player.slideDustTimer -= dt;
      if (this.player.slideDustTimer <= 0) {
        this.player.slideDustTimer = 0.08;
        _v1.set(this.player.x, this.player.y + 0.15, this.player.z);
        this.spawnBurstParticles(_v1, 0xd6d3d1, 3, 2.5);
      }
      if (this.player.slideTimer <= 0 || !this.player.onGround) {
        this.player.isSliding = false;
        this.player.slideTimer = 0;
      }
    }

    const playerHeight = this.player.isSliding ? 1.08 : this.player.isCrouching ? 1.4 : 1.85;

    const sprinting =
      this.isBindDown('sprint') &&
      !this.player.isAiming &&
      !this.player.isCrouching &&
      !this.player.isSliding &&
      fwd > 0;

    const diveInput = this.player.isSkydiving && !this.player.isGliding ? fwd : 0;
    const bankInput = this.player.isSkydiving ? right : 0;

    const slideProgress = this.player.isSliding ? 1 - Math.max(0, this.player.slideTimer) / 0.62 : 0;
    const moveSpeed = this.player.isSliding
      ? 19.5 - slideProgress * 8.0
      : this.player.isSkydiving
        ? this.player.isGliding
          ? 21.5
          : diveInput > 0
            ? 29.0
            : diveInput < 0
              ? 18.0
              : 24.0
        : this.player.isGliding
          ? 17.5
          : this.player.isSwimming
            ? sprinting
              ? 9.2
              : 7.0
            : this.player.isCrouching
              ? 5.6
              : sprinting
                ? 14.5
                : this.player.isAiming
                  ? 6.4
                  : 10.2;

    const sinY = Math.sin(this.player.yaw);
    const cosY = Math.cos(this.player.yaw);
    let vx = 0;
    let vz = 0;
    let len = 0;
    if (this.player.isSliding) {
      vx = this.player.slideDirX * moveSpeed;
      vz = this.player.slideDirZ * moveSpeed;
      len = moveSpeed;
    } else {
      vx = -sinY * fwd + cosY * right;
      vz = -cosY * fwd - sinY * right;
      len = Math.hypot(vx, vz);
      if (len > 0) {
        vx = (vx / len) * moveSpeed;
        vz = (vz / len) * moveSpeed;
      }
    }
    this.player.vx = vx;
    this.player.vz = vz;
    this.player.strafeLean = THREE.MathUtils.lerp(this.player.strafeLean, right * -0.14, Math.min(1, dt * 12));

    this.player.x += vx * dt;
    this.player.z += vz * dt;
    const resolved = resolveObstacleCollision(
      this.player.x,
      this.player.z,
      this.player.y,
      this.obstacles,
      HALF_MAP,
      0.58,
      playerHeight,
    );
    this.player.x = resolved.x;
    this.player.z = resolved.z;

    // Revive teammate channel (3.5s)
    if (this.playerReviveChannel) {
      const rc = this.playerReviveChannel;
      const targetObj =
        rc.targetType === 'human' ? this.remoteHumans.get(rc.targetId) : this.botById.get(rc.targetId);
      const distT = targetObj ? Math.hypot(this.player.x - targetObj.x, this.player.z - targetObj.z) : 999;
      const interrupted =
        !targetObj ||
        !targetObj.alive ||
        !targetObj.knocked ||
        distT > 4.2 ||
        Math.abs(this.player.y - targetObj.y) > 2.8 ||
        this.player.reloading > 0 ||
        this.player.healing > 0 ||
        this.mouseDownLeft ||
        this.backpackOpen;
      if (interrupted) {
        if (targetObj && rc.targetType === 'bot') {
          (targetObj as BotEntity).beingRevived = false;
        }
        this.playerReviveChannel = null;
        this.emitHud();
      } else {
        if (rc.targetType === 'bot') {
          (targetObj as BotEntity).beingRevived = true;
        }
        rc.elapsed += dt;
        if (rc.elapsed >= REVIVE_TIME) {
          this.playerReviveChannel = null;
          this.sound.play('heal');
          _v1.set(targetObj.x, targetObj.y + 1.2, targetObj.z);
          this.spawnBurstParticles(_v1, 0x22c55e, 14, 6);
          if (this.launchConfig && this.mpClient) {
            this.mpClient.send('revive:complete', { targetId: rc.targetId, reviverId: this.localPlayerId });
          } else {
            const revived = computeReviveResult();
            targetObj.knocked = false;
            targetObj.hp = revived.hp;
            targetObj.shield = revived.shield;
            if (rc.targetType === 'bot') {
              (targetObj as BotEntity).beingRevived = false;
              (targetObj as BotEntity).dbnoHp = 100;
            }
            this.killFeed = [`You revived ${rc.targetName}`, ...this.killFeed].slice(0, 5);
          }
          this.emitHud();
        }
      }
    }

    // Reboot Van channel (4.0s)
    if (this.playerRebootChannel) {
      const rbc = this.playerRebootChannel;
      const distVan = Math.hypot(this.player.x - rbc.van.x, this.player.z - rbc.van.z);
      const interrupted =
        this.heldRebootCards.length === 0 ||
        distVan > 5.4 ||
        Math.abs(this.player.y - rbc.van.y) > 4.0 ||
        this.player.reloading > 0 ||
        this.player.healing > 0 ||
        this.mouseDownLeft ||
        this.backpackOpen;
      if (interrupted) {
        this.playerRebootChannel = null;
        this.emitHud();
      } else {
        rbc.elapsed += dt;
        if (rbc.elapsed >= REBOOT_TIME) {
          const van = rbc.van;
          const cardIds = this.heldRebootCards.map((c) => c.id);
          this.playerRebootChannel = null;
          this.heldRebootCards = [];
          this.sound.play('chest');
          _v1.set(van.x, van.y + 2.5, van.z);
          this.spawnBurstParticles(_v1, 0x38bdf8, 22, 9);
          if (this.launchConfig && this.mpClient) {
            this.mpClient.send('reboot:complete', {
              targetIds: cardIds,
              x: van.x,
              y: van.y,
              z: van.z,
            });
          } else {
            const rbRes = computeRebootResult();
            for (const cid of cardIds) {
              const bot = this.botById.get(cid);
              if (bot) {
                bot.alive = rbRes.alive;
                bot.knocked = rbRes.knocked;
                bot.hp = rbRes.hp;
                bot.shield = rbRes.shield;
                bot.dbnoHp = 100;
                bot.dyingTimer = 0;
                bot.x = van.x + (Math.random() - 0.5) * 4;
                bot.y = van.y + 32;
                bot.z = van.z + (Math.random() - 0.5) * 4;
                bot.isSkydiving = true;
                bot.isGliding = true;
                bot.rig.root.visible = true;
                this.matchEntitiesGroup.add(bot.rig.root);
              }
            }
            this.killFeed = [`You rebooted your squad at ${van.name}`, ...this.killFeed].slice(0, 5);
          }
          this.emitHud();
        }
      }
    }

    // Chest search channeling
    if (this.playerChestSearch) {
      const ch = this.playerChestSearch.chest;
      const distCh = Math.hypot(this.player.x - ch.x, this.player.z - ch.z);
      const interrupted =
        ch.opened ||
        Math.abs(this.player.y - ch.y) > 3.6 ||
        this.player.reloading > 0 ||
        this.player.healing > 0 ||
        this.mouseDownLeft ||
        this.backpackOpen;
      const stepRes = stepChestSearchProgress(this.playerChestSearch.elapsed, dt, distCh, 5.8, interrupted, CHEST_OPEN_TIME);
      if (stepRes.canceled) {
        ch.shockRing.visible = false;
        this.playerChestSearch = null;
        this.emitHud();
      } else if (stepRes.completed) {
        this.playerChestSearch = null;
        this.openChest(ch, true);
      } else {
        this.playerChestSearch.elapsed = stepRes.elapsed;
        ch.shockRing.visible = true;
        ch.shockRing.scale.setScalar(0.58 + Math.sin(stepRes.elapsed * 7.5) * 0.14);
        const rMat = ch.shockRing.material as THREE.MeshBasicMaterial;
        rMat.opacity = 0.45 + (stepRes.pct / 100) * 0.45;
      }
    }

    // Auto-collect nearby ground ammo + friendly Reboot Cards on walkover
    if (!this.player.isSkydiving) {
      for (let ri = this.rebootCards.length - 1; ri >= 0; ri--) {
        const c = this.rebootCards[ri];
        if (Math.hypot(this.player.x - c.x, this.player.z - c.z) < 2.6 && Math.abs(this.player.y - c.y) < 2.6) {
          this.collectRebootCard(ri);
        }
      }
      for (let ai = this.groundAmmo.length - 1; ai >= 0; ai--) {
        const ga = this.groundAmmo[ai];
        if (Math.hypot(this.player.x - ga.x, this.player.z - ga.z) < 2.35 && Math.abs(this.player.y - ga.y) < 2.5) {
          this.pickupGroundAmmo(ai);
        }
      }
    }

    for (const lp of this.launchPads) {
      if (Math.hypot(this.player.x - lp.x, this.player.z - lp.z) < 2.2 && Math.abs(this.player.y - lp.y) < 1.6) {
        if (this.player.vy < 20) {
          this.player.vy = 26;
          this.player.onGround = false;
          this.player.isGliding = true;
          this.player.isSwimming = false;
          this.player.isCrouching = false;
          this.player.squashY = 1.24;
          this.sound.play('glider');
          _v1.set(lp.x, lp.y + 0.6, lp.z);
          this.spawnBurstParticles(_v1, 0x38bdf8, 14, 9);
        }
      }
    }

    const surfaceY = getWalkableSurfaceY(this.player.x, this.player.z, this.player.y, this.obstacles);
    const ceilY = getCeilingLimitY(this.player.x, this.player.z, this.player.y, playerHeight, this.obstacles);

    if (surfaceY < -0.28 && this.player.y <= -0.32) {
      this.player.isSwimming = true;
      this.player.isSkydiving = false;
      this.player.isGliding = false;
      this.player.onGround = true;
      const waterSurface = -0.38;
      if (this.jumpBufferTimer > 0) {
        this.player.vy = 10.6;
        this.player.onGround = false;
        this.jumpBufferTimer = 0;
      } else {
        const diff = waterSurface - this.player.y;
        this.player.vy = diff * 7.5;
        this.player.y += this.player.vy * dt;
        if (this.player.y < groundSurfaceY) this.player.y = groundSurfaceY;
      }
      if (len > 0) {
        this.player.swimSplashTimer -= dt;
        if (this.player.swimSplashTimer <= 0) {
          this.player.swimSplashTimer = 0.28;
          _v1.set(this.player.x, -0.42, this.player.z);
          this.spawnBurstParticles(_v1, 0xe0f2fe, 5, 3.2);
        }
      }
    } else {
      if (this.player.onGround) this.coyoteTimer = 0.1;
      else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.player.isSkydiving) {
        this.player.vy = 11.6;
        this.player.onGround = false;
        this.player.isCrouching = false;
        this.player.isSliding = false;
        this.player.slideTimer = 0;
        this.player.squashY = 1.16;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
      }

      const wasInAir = !this.player.onGround;
      const wasSkydiving = this.player.isSkydiving;
      if (this.player.isSkydiving && !this.player.isGliding && this.player.y <= surfaceY + 18) {
        this.player.isGliding = true;
        _v1.set(this.player.x, this.player.y + 1.2, this.player.z);
        this.spawnBurstParticles(_v1, 0x38bdf8, 10, 6.5);
        this.sound.play('glider');
      }

      const grav =
        this.player.isGliding && this.player.vy < 0
          ? 16
          : this.player.isSkydiving
            ? diveInput > 0
              ? 52
              : diveInput < 0
                ? 22
                : 36
            : 28;
      const minVy = this.player.isGliding
        ? -14
        : this.player.isSkydiving
          ? diveInput > 0
            ? -48
            : diveInput < 0
              ? -24
              : -34
          : -60;
      this.player.vy = Math.max(minVy, this.player.vy - grav * dt);
      this.player.y += this.player.vy * dt;

      if (this.player.isSkydiving && !this.player.isGliding) {
        this.player.skydiveWindTimer -= dt;
        if (this.player.skydiveWindTimer <= 0) {
          this.player.skydiveWindTimer = diveInput > 0 ? 0.045 : 0.085;
          _v1.set(
            this.player.x + (Math.random() - 0.5) * 1.9,
            this.player.y - 1.1,
            this.player.z + (Math.random() - 0.5) * 1.9,
          );
          this.spawnBurstParticles(_v1, 0xe0f2fe, 3, 2.2);
        }
      }

      if (this.player.y > ceilY && this.player.vy > 0) {
        this.player.y = ceilY;
        this.player.vy = 0;
      }
      if (this.player.y <= surfaceY) {
        if (wasInAir && (wasSkydiving || this.player.vy < -5)) {
          this.player.squashY = 0.82;
          this.sound.play('step');
          if (wasSkydiving || this.player.vy < -12) {
            _v1.set(this.player.x, surfaceY + 0.18, this.player.z);
            this.spawnBurstParticles(_v1, 0xd6d3d1, 10, 5.5);
          }
        }
        this.player.y = surfaceY;
        this.player.vy = 0;
        this.player.onGround = true;
        this.player.isGliding = false;
        this.player.isSkydiving = false;
      } else {
        this.player.onGround = false;
      }
    }

    if (this.player.rig) {
      this.player.rig.root.position.set(this.player.x, this.player.y, this.player.z);
      this.player.rig.root.rotation.y = this.player.yaw + Math.PI;
      this.player.rig.animate(dt, {
        speed: len > 0 ? moveSpeed : 0,
        isAiming: this.player.isAiming,
        isCrouching: this.player.isCrouching,
        isSliding: this.player.isSliding,
        strafeLean: this.player.strafeLean,
        onGround: this.player.onGround,
        isSkydiving: this.player.isSkydiving && !this.player.isGliding,
        isGliding: this.player.isGliding,
        skydivePitch: diveInput,
        skydiveBank: bankInput,
        isSwimming: this.player.isSwimming,
        recoil: this.player.recoil,
        pickaxeSwing: this.player.pickaxeSwing,
        reloading: this.player.reloading,
        reloadTotal: this.player.reloadTotal,
        healing: this.player.healing,
        emoteTimer: this.player.emoteTimer,
        emoteId: this.equippedEmote,
        hitFlinch: this.player.hitFlinchTimer > 0 ? this.player.hitFlinchTimer * 5 : 0,
        equipTimer: this.player.equipTimer,
        pitch: this.player.pitch,
        playFootsteps: this.player.onGround && !this.player.isSwimming && !this.player.isSliding && len > 0,
        onStep: () => this.sound.play('step'),
        squashY: this.player.squashY,
      });

      const item = this.player.slots[this.player.activeSlot];
      const isSniperAds = !this.player.pickaxeEquipped && this.player.isAiming && item?.def.id === 'sniper';
      this.player.rig.root.visible = !isSniperAds;
    }

    const chSize = (this.player.isAiming ? 16 : len > 0 ? 36 : 26) + this.player.recoil * 16;
    this.callbacks.onCrosshairSize(chSize);

    this.updateCamera(dt, sprinting || this.player.isSliding || this.player.isGliding || this.player.isSkydiving);
  }

  private updateCamera(dt: number, sprinting = false): void {
    const isSpectating = !this.player.alive;
    let targetX = this.player.x;
    let targetY = this.player.y;
    let targetZ = this.player.z;

    if (isSpectating && this.player.spectatingId) {
      const rh = this.remoteHumans.get(this.player.spectatingId);
      const bot = this.botById.get(this.player.spectatingId);
      if (rh && rh.alive) {
        targetX = rh.x;
        targetY = rh.y;
        targetZ = rh.z;
      } else if (bot && bot.alive) {
        targetX = bot.x;
        targetY = bot.y;
        targetZ = bot.z;
      }
    }

    const item = this.player.slots[this.player.activeSlot];
    const isSniperAds =
      !isSpectating &&
      !this.player.knocked &&
      !this.player.inBattleBus &&
      !this.player.pickaxeEquipped &&
      this.player.isAiming &&
      item?.def.id === 'sniper';

    const targetFov = isSpectating
      ? 68
      : this.player.inBattleBus
        ? 74
        : this.player.isAiming && item && item.def.type === 'gun'
          ? item.def.zoom
          : sprinting
            ? 72
            : 65;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 12, dt);
    this.camera.updateProjectionMatrix();

    const sinY = Math.sin(this.player.yaw);
    const cosY = Math.cos(this.player.yaw);
    const camDist = isSpectating
      ? 5.2
      : this.player.inBattleBus
        ? 27
        : isSniperAds
          ? 0.15
          : this.player.isAiming
            ? 2.25
            : this.player.isSkydiving || this.player.isGliding
              ? 5.8
              : 4.2;
    const shoulderOffset = isSpectating
      ? 0.8
      : this.player.inBattleBus
        ? 4.4
        : isSniperAds
          ? 0
          : this.player.isAiming
            ? 0.72
            : 0.88;
    const eyeHeight = isSpectating
      ? 2.25
      : this.player.knocked
        ? 1.15
        : this.player.inBattleBus
          ? 7.6
          : this.player.isSliding
            ? 1.28
            : this.player.isCrouching
              ? 1.65
              : 2.22;

    const anchorX = targetX;
    const anchorY = targetY + eyeHeight;
    const anchorZ = targetZ;

    const desiredX = anchorX + sinY * camDist * Math.cos(this.player.pitch) + cosY * shoulderOffset;
    const desiredZ = anchorZ + cosY * camDist * Math.cos(this.player.pitch) - sinY * shoulderOffset;
    let desiredY = anchorY + Math.sin(this.player.pitch) * camDist;

    if (!this.player.inBattleBus || isSpectating) {
      const minCamGround = Math.max(getTerrainHeight(desiredX, desiredZ) + 0.65, targetY + 1.05);
      if (desiredY < minCamGround) desiredY = minCamGround;
    }

    _camDesired.set(desiredX, desiredY, desiredZ);

    if ((!this.player.inBattleBus || isSpectating) && !isSniperAds && this.colliderMeshes.length > 0) {
      _v1.set(anchorX, anchorY, anchorZ);
      _v2.copy(_camDesired).sub(_v1);
      const maxD = _v2.length();
      if (maxD > 0.25) {
        _v2.normalize();
        _raycaster.set(_v1, _v2);
        _raycaster.far = maxD;
        const hits = _raycaster.intersectObjects(this.colliderMeshes, false);
        if (hits.length > 0 && hits[0].distance < maxD) {
          const safeD = Math.max(0.45, hits[0].distance - 0.3);
          _camDesired.copy(_v1).addScaledVector(_v2, safeD);
        }
      }
    }

    const smoothK = isSniperAds ? 35 : 22;
    const alpha = 1 - Math.exp(-smoothK * dt);
    this.camPosSmooth.lerp(_camDesired, alpha);

    const lookX = targetX - sinY * 22 * Math.cos(this.player.pitch) + cosY * (isSniperAds ? 0 : 0.3);
    const lookZ = targetZ - cosY * 22 * Math.cos(this.player.pitch) - sinY * (isSniperAds ? 0 : 0.3);
    const lookY = targetY + eyeHeight - 0.35 - Math.sin(this.player.pitch) * 18;
    _camLookTarget.set(lookX, lookY, lookZ);
    this.camLookSmooth.lerp(_camLookTarget, alpha);

    this.camera.position.copy(this.camPosSmooth);
    this.camera.lookAt(this.camLookSmooth);

    if (this.cameraTrauma > 0.001) {
      const shake = this.cameraTrauma * this.cameraTrauma;
      this.camera.rotation.z += (Math.random() - 0.5) * 0.035 * shake;
      this.camera.rotation.x += (Math.random() - 0.5) * 0.025 * shake;
    }
  }

  private updateBots(dt: number): void {
    const now = performance.now() / 1000;
    const profile = getBotCombatProfile(this.matchMode, this.botDifficulty, this.rankedRp);
    let activeAttackers = 0;
    const busPose = getBattleBusPose(
      this.busStartX,
      this.busStartZ,
      this.busEndX,
      this.busEndZ,
      Math.min(1, this.player.busProgress),
      BUS_CRUISE_Y,
    );

    // Non-host guests simply interpolate bot transforms from host snapshots
    if (this.launchConfig && !this.isRoomHost) {
      for (const bot of this.bots) {
        if (!bot.alive) {
          if (bot.dyingTimer > 0) {
            bot.dyingTimer -= dt;
            bot.deathProgress = Math.min(1, 1 - bot.dyingTimer / 0.85);
            bot.rig.animate(dt, { isDead: true, deathProgress: bot.deathProgress });
            if (bot.dyingTimer <= 0) this.matchEntitiesGroup.remove(bot.rig.root);
          }
          continue;
        }
        bot.inBattleBus = this.player.busProgress < bot.busJumpProgress && bot.y > BUS_CRUISE_Y - 2;
        if (!bot.inBattleBus) {
          bot.rig.root.visible = true;
          bot.rig.root.position.lerp(_v1.set(bot.x, bot.y, bot.z), Math.min(1, dt * 14));
          bot.rig.root.rotation.y = bot.yaw;
          bot.rig.animate(dt, {
            speed: bot.knocked ? 2.5 : bot.isSkydiving ? 16 : 6,
            isKnocked: bot.knocked,
            isCrouching: bot.isCrouching,
            isSkydiving: bot.isSkydiving && !bot.isGliding,
            isGliding: bot.isGliding,
            onGround: !bot.isSkydiving,
          });
          bot.rig.root.updateMatrixWorld(true);
        }
      }
      return;
    }

    for (const bot of this.bots) {
      if (!bot.alive) {
        if (bot.dyingTimer > 0) {
          bot.dyingTimer -= dt;
          bot.deathProgress = Math.min(1, 1 - bot.dyingTimer / 0.85);
          bot.rig.animate(dt, { isDead: true, deathProgress: bot.deathProgress });
          if (bot.dyingTimer <= 0) this.matchEntitiesGroup.remove(bot.rig.root);
        }
        continue;
      }

      // 1. Battle Bus ride -> Staggered Jump -> Skydive -> Glider toward target chest/POI
      if (bot.inBattleBus) {
        bot.x = busPose.x;
        bot.y = busPose.y;
        bot.z = busPose.z;
        bot.yaw = busPose.yaw;
        if (this.player.busProgress >= bot.busJumpProgress) {
          bot.inBattleBus = false;
          bot.isSkydiving = true;
          bot.isGliding = false;
          bot.x += (Math.random() - 0.5) * 4.5;
          bot.y = BUS_CRUISE_Y - 3.5;
          bot.z += (Math.random() - 0.5) * 4.5;
          bot.vy = -7;
          bot.rig.root.visible = true;
          bot.lastCheckX = bot.x;
          bot.lastCheckZ = bot.z;
        }
        continue;
      }

      if (bot.isSkydiving) {
        const flyDx = bot.moveTargetX - bot.x;
        const flyDz = bot.moveTargetZ - bot.z;
        const flyDist = Math.hypot(flyDx, flyDz);
        const flySpeed = bot.isGliding ? 19.5 : 23.0;
        if (flyDist > 2.0) {
          bot.x += (flyDx / flyDist) * flySpeed * dt;
          bot.z += (flyDz / flyDist) * flySpeed * dt;
          bot.yaw = Math.atan2(flyDx, flyDz);
        }
        const surfaceY = getWalkableSurfaceY(bot.x, bot.z, bot.y, this.obstacles);
        if (!bot.isGliding && bot.y <= surfaceY + 21) {
          bot.isGliding = true;
        }
        const grav = bot.isGliding ? 15 : 36;
        const minVy = bot.isGliding ? -13 : -32;
        bot.vy = Math.max(minVy, bot.vy - grav * dt);
        bot.y += bot.vy * dt;
        if (bot.y <= surfaceY) {
          bot.y = surfaceY;
          bot.vy = 0;
          bot.onGround = true;
          bot.isSkydiving = false;
          bot.isGliding = false;
          bot.lastCheckX = bot.x;
          bot.lastCheckZ = bot.z;
        }
        bot.rig.root.position.set(bot.x, bot.y, bot.z);
        bot.rig.root.rotation.y = bot.yaw;
        bot.rig.animate(dt, {
          speed: flyDist > 2 ? flySpeed : 0,
          onGround: false,
          isSkydiving: !bot.isGliding,
          isGliding: bot.isGliding,
        });
        bot.rig.root.updateMatrixWorld(true);
        continue;
      }

      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer -= dt;
        if (bot.hitFlashTimer <= 0) bot.rig.setHitFlash(false);
      }
      if (bot.hitFlinchTimer > 0) {
        bot.hitFlinchTimer = Math.max(0, bot.hitFlinchTimer - dt);
      }

      if (bot.knocked) {
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
        // Crawl slowly toward nearest standing teammate if any
        let rescueX = this.storm.cx;
        let rescueZ = this.storm.cz;
        let rescueDist = 9999;
        if (isFriendlyTarget(bot.squadId, this.localTeamId) && this.player.alive && !this.player.knocked) {
          rescueDist = Math.hypot(this.player.x - bot.x, this.player.z - bot.z);
          rescueX = this.player.x;
          rescueZ = this.player.z;
        }
        for (const mate of this.bots) {
          if (mate.alive && !mate.knocked && mate !== bot && areBotsTeammates(bot.squadId, mate.squadId)) {
            const md = Math.hypot(mate.x - bot.x, mate.z - bot.z);
            if (md < rescueDist) {
              rescueDist = md;
              rescueX = mate.x;
              rescueZ = mate.z;
            }
          }
        }
        let crawling = false;
        if (rescueDist < 65 && rescueDist > 2.2) {
          const rdx = rescueX - bot.x;
          const rdz = rescueZ - bot.z;
          const rl = Math.hypot(rdx, rdz);
          if (rl > 0.1) {
            bot.x += (rdx / rl) * 2.8 * dt;
            bot.z += (rdz / rl) * 2.8 * dt;
            bot.yaw = Math.atan2(rdx, rdz);
            crawling = true;
          }
        }
        const surfY = getWalkableSurfaceY(bot.x, bot.z, bot.y, this.obstacles);
        bot.y = surfY;
        bot.rig.root.position.set(bot.x, bot.y, bot.z);
        bot.rig.root.rotation.y = bot.yaw;
        bot.rig.animate(dt, { speed: crawling ? 2.8 : 0, isKnocked: true, onGround: true });
        bot.rig.root.updateMatrixWorld(true);

        if (!this.launchConfig) {
          const bleed = stepDbnoBleed(bot.dbnoHp, dt, bot.beingRevived);
          bot.dbnoHp = bleed.dbnoHp;
          if (bleed.bledOut) {
            this.eliminateBotFinal(bot, 'Bleedout', '');
            this.emitHud();
            if (this.bots.every((b) => !b.alive || isFriendlyTarget(b.squadId, this.localTeamId))) {
              this.endMatch(true);
            }
          }
        }
        continue;
      }

      bot.fireCd -= dt;
      bot.pingCooldown = Math.max(0, bot.pingCooldown - dt);
      bot.retargetTimer -= dt;
      bot.pickaxeSwing = Math.max(0, bot.pickaxeSwing - dt * 2.4);
      bot.jumpCooldown = Math.max(0, bot.jumpCooldown - dt);
      bot.aimSampleTimer -= dt;
      bot.recoil = Math.max(0, bot.recoil - dt * 5);
      bot.stuckSteerTimer = Math.max(0, bot.stuckSteerTimer - dt);
      bot.slideCooldown = Math.max(0, bot.slideCooldown - dt);
      if (bot.slideTimer > 0) bot.slideTimer = Math.max(0, bot.slideTimer - dt);
      if (bot.alertTimer > 0) bot.alertTimer = Math.max(0, bot.alertTimer - dt);

      bot.midRangeRollTimer -= dt;
      if (bot.midRangeRollTimer <= 0) {
        bot.midRangeRollTimer = 0.85 + Math.random() * 0.85;
        bot.midRangeSwitchRoll = Math.random();
      }

      bot.strafeFlipTimer -= dt;
      if (bot.strafeFlipTimer <= 0) {
        bot.strafeDir *= -1;
        const tierMult = bot.tier === 'pro' ? 0.72 : bot.tier === 'veteran' ? 0.92 : 1.25;
        bot.strafeFlipTimer = Math.max(0.28, profile.strafeSwitchInterval * tierMult * (0.75 + Math.random() * 0.65));
      }

      if (bot.onGround && bot.hitFlinchTimer > 0.14 && bot.jumpCooldown <= 0 && Math.random() < 0.42) {
        bot.vy = 9.8;
        bot.onGround = false;
        bot.isCrouching = false;
        bot.jumpCooldown = 1.9 + Math.random() * 1.2;
        bot.strafeDir *= -1;
      }

      // 1b. Standing Bot Squad Revive Assist (move to knocked teammate & revive!)
      let knockedMate: { id: string; name: string; type: 'human' | 'bot'; x: number; y: number; z: number; dist: number } | null = null;
      if (isFriendlyTarget(bot.squadId, this.localTeamId) && this.player.alive && this.player.knocked && !this.player.inBattleBus) {
        const dp = Math.hypot(this.player.x - bot.x, this.player.z - bot.z);
        if (dp < 42) {
          knockedMate = { id: this.localPlayerId, name: 'You', type: 'human', x: this.player.x, y: this.player.y, z: this.player.z, dist: dp };
        }
      }
      if (!knockedMate) {
        for (const rh of this.remoteHumans.values()) {
          if (rh.alive && rh.knocked && areBotsTeammates(bot.squadId, rh.teamId)) {
            const dr = Math.hypot(rh.x - bot.x, rh.z - bot.z);
            if (dr < 42 && (!knockedMate || dr < knockedMate.dist)) {
              knockedMate = { id: rh.id, name: rh.name, type: 'human', x: rh.x, y: rh.y, z: rh.z, dist: dr };
            }
          }
        }
      }
      if (!knockedMate) {
        for (const ob of this.bots) {
          if (ob.alive && ob.knocked && ob !== bot && areBotsTeammates(bot.squadId, ob.squadId)) {
            const db = Math.hypot(ob.x - bot.x, ob.z - bot.z);
            if (db < 38 && (!knockedMate || db < knockedMate.dist)) {
              knockedMate = { id: ob.id, name: ob.name, type: 'bot', x: ob.x, y: ob.y, z: ob.z, dist: db };
            }
          }
        }
      }
      if (knockedMate && knockedMate.dist < 3.4 && Math.abs(knockedMate.y - bot.y) < 2.6) {
        bot.revivingTargetId = knockedMate.id;
        bot.reviveProgress += dt;
        bot.yaw = Math.atan2(knockedMate.x - bot.x, knockedMate.z - bot.z);
        if (knockedMate.id === this.localPlayerId) this.player.beingRevived = true;
        else if (knockedMate.type === 'bot') {
          const kb = this.botById.get(knockedMate.id);
          if (kb) kb.beingRevived = true;
        }
        bot.rig.root.position.set(bot.x, bot.y, bot.z);
        bot.rig.root.rotation.y = bot.yaw;
        bot.rig.animate(dt, { speed: 0, isCrouching: true, onGround: true });
        bot.rig.root.updateMatrixWorld(true);
        if (bot.reviveProgress >= REVIVE_TIME) {
          bot.reviveProgress = 0;
          bot.revivingTargetId = null;
          if (this.launchConfig && this.mpClient && knockedMate.type === 'human') {
            this.mpClient.send('revive:complete', { targetId: knockedMate.id, reviverId: bot.id });
          } else {
            const rev = computeReviveResult();
            if (knockedMate.id === this.localPlayerId) {
              this.player.knocked = false;
              this.player.hp = rev.hp;
              this.player.shield = rev.shield;
              this.player.beingRevived = false;
              this.killFeed = [`${bot.name} revived You`, ...this.killFeed].slice(0, 5);
            } else if (knockedMate.type === 'bot') {
              const kb = this.botById.get(knockedMate.id);
              if (kb) {
                kb.knocked = false;
                kb.hp = rev.hp;
                kb.shield = rev.shield;
                kb.beingRevived = false;
                kb.dbnoHp = 100;
              }
            }
          }
          this.emitHud();
        }
        continue;
      } else {
        if (bot.revivingTargetId === this.localPlayerId) {
          this.player.beingRevived = false;
        } else if (bot.revivingTargetId) {
          const prevKb = this.botById.get(bot.revivingTargetId);
          if (prevKb) prevKb.beingRevived = false;
        }
        bot.revivingTargetId = null;
        bot.reviveProgress = 0;
      }

      // 2. Real Inventory Healing
      if (bot.healingTimer > 0) {
        bot.healingTimer -= dt;
        if (bot.healingTimer <= 0) {
          const hItem = bot.healingSlotIdx >= 0 ? bot.slots[bot.healingSlotIdx] : null;
          if (hItem && hItem.def.type === 'heal') {
            const healed = computeHealApplication(bot.hp, bot.shield, hItem.def.healType, hItem.def.amount, hItem.def.maxCap);
            bot.hp = healed.hp;
            bot.shield = healed.shield;
            bot.slots[bot.healingSlotIdx] = null;
          }
          bot.healingSlotIdx = -1;
          _v1.set(bot.x, bot.y + 1.4, bot.z);
          this.spawnBurstParticles(_v1, 0x38bdf8, 10, 4);
        }
        bot.rig.animate(dt, { speed: 0, healing: Math.max(0, bot.healingTimer) });
        bot.rig.root.updateMatrixWorld(true);
        continue;
      }

      // 3. 5-Second Physical Chest Search Channel & 5-Slot Ground Loot Pickup
      if (bot.chestChannel) {
        const ch = this.chests[bot.chestChannel.chestId];
        const distCh = ch ? Math.hypot(ch.x - bot.x, ch.z - bot.z) : 999;
        const playerCloseThreat = !this.player.inBattleBus && !this.player.isSkydiving && Math.hypot(this.player.x - bot.x, this.player.z - bot.z) < 12;
        const chInterrupted = !ch || ch.opened || Math.abs(ch.y - bot.y) > 3.5 || bot.hitFlashTimer > 0 || playerCloseThreat;
        const chRes = stepChestSearchProgress(bot.chestChannel.elapsed, dt, distCh, 5.2, chInterrupted, CHEST_OPEN_TIME);
        if (chRes.canceled) {
          bot.chestChannel = null;
        } else if (chRes.completed) {
          bot.chestChannel = null;
          this.openChest(ch, false, bot.tier);
        } else {
          bot.chestChannel.elapsed = chRes.elapsed;
          bot.yaw = Math.atan2(ch.x - bot.x, ch.z - bot.z);
          bot.rig.root.position.set(bot.x, bot.y, bot.z);
          bot.rig.root.rotation.y = bot.yaw;
          bot.rig.animate(dt, { speed: 0, onGround: bot.onGround });
          bot.rig.root.updateMatrixWorld(true);
          continue;
        }
      } else {
        for (const ch of this.chests) {
          if (!ch.opened && Math.hypot(ch.x - bot.x, ch.z - bot.z) < 4.2 && Math.abs(ch.y - bot.y) < 3.4) {
            bot.chestChannel = { chestId: ch.id, elapsed: 0 };
            break;
          }
        }
      }

      for (let li = this.groundLoot.length - 1; li >= 0; li--) {
        const l = this.groundLoot[li];
        if (Math.hypot(l.x - bot.x, l.z - bot.z) < 3.4 && Math.abs(l.y - bot.y) < 3.0) {
          const res = pickupForBot(bot.slots, l.item);
          if (res.pickedUp) {
            bot.slots = res.nextSlots;
            this.matchEntitiesGroup.remove(l.mesh);
            this.groundLoot.splice(li, 1);
            if (res.replacedItem) {
              this.spawnGroundLoot(bot.x - Math.sin(bot.yaw) * 1.2, bot.y, bot.z - Math.cos(bot.yaw) * 1.2, res.replacedItem);
            }
          }
        }
      }

      for (let ai = this.groundAmmo.length - 1; ai >= 0; ai--) {
        const ga = this.groundAmmo[ai];
        if (Math.hypot(ga.x - bot.x, ga.z - bot.z) < 3.4 && Math.abs(ga.y - bot.y) < 3.0) {
          bot.ammo[ga.ammoType] += ga.amount;
          this.matchEntitiesGroup.remove(ga.mesh);
          this.groundAmmo.splice(ai, 1);
        }
      }

      const gunCount = bot.slots.reduce((acc, s) => acc + (s && s.def.type === 'gun' ? 1 : 0), 0);

      // 4. Target Sensing (Hostile Landed Humans & Non-Squad Rival Bots)
      let nearestTarget: { isPlayer: boolean; targetId: string; x: number; y: number; z: number; hasGun: boolean; healing: boolean } | null = null;
      const baseSenseDist = bot.policy === 'overwatch' ? 84 : bot.policy === 'flanker' ? 58 : 44;
      const dPlayer = Math.hypot(this.player.x - bot.x, this.player.z - bot.z);

      let nearestDist = baseSenseDist;
      const canSensePlayer =
        !this.player.inBattleBus &&
        !this.player.isSkydiving &&
        this.player.hp > 0 &&
        !isFriendlyTarget(bot.squadId, this.localTeamId);
      const playerAlertRange = bot.alertTimer > 0 ? 100 : baseSenseDist;
      if (canSensePlayer && dPlayer < playerAlertRange) {
        nearestDist = dPlayer;
        nearestTarget = {
          isPlayer: true,
          targetId: this.localPlayerId,
          x: this.player.x,
          y: this.player.y,
          z: this.player.z,
          hasGun: true,
          healing: this.player.healing > 0,
        };
      } else {
        const acqSpan = profile.acquireMax - profile.acquireMin;
        const tierMult = bot.tier === 'pro' ? 0.72 : bot.tier === 'veteran' ? 1.0 : 1.35;
        bot.aimAcquireTimer = (profile.acquireMin + Math.random() * acqSpan) * tierMult;
      }

      for (const rh of this.remoteHumans.values()) {
        if (!rh.alive || rh.inBattleBus || rh.isSkydiving || isFriendlyTarget(bot.squadId, rh.teamId)) continue;
        const drh = Math.hypot(rh.x - bot.x, rh.z - bot.z);
        if (drh < nearestDist) {
          nearestDist = drh;
          nearestTarget = {
            isPlayer: true,
            targetId: rh.id,
            x: rh.x,
            y: rh.y,
            z: rh.z,
            hasGun: true,
            healing: rh.healing,
          };
        }
      }

      let botHuntDist = nearestTarget ? nearestDist : 125;
      for (const other of this.bots) {
        if (!other.alive || other === bot || other.inBattleBus || other.isSkydiving || areBotsTeammates(bot.squadId, other.squadId)) continue;
        const d = Math.hypot(other.x - bot.x, other.z - bot.z);
        if (d < botHuntDist) {
          botHuntDist = d;
          nearestDist = d;
          const otherHasGun = other.slots.some((s) => s && s.def.type === 'gun');
          nearestTarget = {
            isPlayer: false,
            targetId: other.id,
            x: other.x,
            y: other.y,
            z: other.z,
            hasGun: otherHasGun,
            healing: other.healingTimer > 0,
          };
        }
      }

      // 5. Smart 5-Slot Decision (Heal / Range-Optimal Loaded Gun / Pickaxe)
      const slotChoice = chooseBestBotSlot(
        bot.slots,
        bot.tier,
        nearestTarget ? nearestDist : 50,
        bot.hp,
        bot.shield,
        bot.midRangeSwitchRoll,
        bot.ammo,
      );
      if (slotChoice.mode === 'heal' && slotChoice.slotIdx >= 0) {
        const hItem = bot.slots[slotChoice.slotIdx];
        if (hItem && hItem.def.type === 'heal') {
          bot.healingTimer = hItem.def.castTime;
          bot.healingSlotIdx = slotChoice.slotIdx;
          bot.isCrouching = false;
          if (bot.telegraphLine) bot.telegraphLine.visible = false;
          bot.rig.animate(dt, { speed: 0, healing: bot.healingTimer });
          bot.rig.root.updateMatrixWorld(true);
          continue;
        }
      } else if (slotChoice.mode === 'gun' && slotChoice.slotIdx >= 0) {
        const chosenGun = bot.slots[slotChoice.slotIdx]!;
        if (bot.weapon !== chosenGun || bot.activeSlot !== slotChoice.slotIdx) {
          bot.activeSlot = slotChoice.slotIdx;
          bot.weapon = chosenGun;
          bot.rig.setWeaponModel(chosenGun.def.id);
        }
      } else if (bot.weapon.def.id !== 'pickaxe') {
        bot.activeSlot = -1;
        bot.weapon = makeWeaponItem('pickaxe');
        bot.rig.setWeaponModel('pickaxe');
      }

      // 6. Nearby Chest / Ground Loot Seeking (prioritize guns until armed with 2+ weapons or full kit!)
      let lootTarget: { x: number; z: number } | null = null;
      const shouldSeekLoot = gunCount === 0 || (gunCount < 3 && (!nearestTarget || nearestDist > 22));
      if (shouldSeekLoot) {
        let bestLootDist = gunCount === 0 ? 85 : 46;
        for (const l of this.groundLoot) {
          if (Math.abs(l.y - bot.y) > 4.5) continue;
          const isGun = l.item.def.type === 'gun';
          if (gunCount >= 5 && !isGun) continue;
          const d = Math.hypot(l.x - bot.x, l.z - bot.z);
          const weightedD = isGun ? d * 0.72 : d;
          if (weightedD < bestLootDist) {
            bestLootDist = weightedD;
            lootTarget = { x: l.x, z: l.z };
          }
        }
        if (!lootTarget || gunCount === 0) {
          let bestChestDist = gunCount === 0 ? 96 : 54;
          for (const ch of this.chests) {
            if (ch.opened || Math.abs(ch.y - bot.y) > 4.5) continue;
            const d = Math.hypot(ch.x - bot.x, ch.z - bot.z);
            if (d < bestChestDist) {
              bestChestDist = d;
              lootTarget = { x: ch.x, z: ch.z };
            }
          }
        }
      }

      const distStorm = Math.hypot(bot.x - this.storm.cx, bot.z - this.storm.cz);
      const baseSpeed = bot.policy === 'rusher' ? 8.6 : bot.policy === 'overwatch' ? 6.4 : 7.5;
      let speed = bot.tier === 'pro' ? baseSpeed * 1.18 : bot.tier === 'veteran' ? baseSpeed * 1.08 : baseSpeed;
      if (nearestTarget && !nearestTarget.isPlayer && nearestDist > 26) {
        speed *= 1.3;
      }

      const stormDanger = distStorm > Math.max(24, this.storm.radius * 0.82 - 12);
      const enemyIsHealing = nearestTarget !== null && nearestTarget.healing;
      const punishHealingTarget =
        nearestTarget !== null &&
        (nearestTarget.isPlayer
          ? shouldBotPunishHeal(this.player.healing, nearestDist, bot.losClear, profile.healPunishDist)
          : enemyIsHealing && nearestDist < profile.healPunishDist && bot.losClear);

      if (stormDanger) {
        // Sprint directly inward ahead of the shrinking storm ring!
        bot.moveTargetX = this.storm.cx;
        bot.moveTargetZ = this.storm.cz;
        bot.isCrouching = false;
        speed *= 1.28;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
      } else if (knockedMate && (!nearestTarget || nearestDist > 16)) {
        bot.moveTargetX = knockedMate.x;
        bot.moveTargetZ = knockedMate.z;
        bot.isCrouching = false;
        speed *= 1.22;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
      } else if (lootTarget && !punishHealingTarget && (gunCount === 0 || (!nearestTarget || nearestDist > 24))) {
        bot.moveTargetX = lootTarget.x;
        bot.moveTargetZ = lootTarget.z;
        bot.isCrouching = false;
        speed *= 1.18;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
      } else if (nearestTarget) {
        bot.yaw = Math.atan2(nearestTarget.x - bot.x, nearestTarget.z - bot.z);

        if (bot.aimSampleTimer <= 0) {
          bot.aimSampleTimer = bot.tier === 'pro' ? 0.14 : bot.tier === 'veteran' ? 0.21 : 0.3;
          bot.aimSampleX = nearestTarget.x;
          bot.aimSampleY = nearestTarget.y + 1.25;
          bot.aimSampleZ = nearestTarget.z;
        }

        bot.losCheckTimer -= dt;
        if (bot.losCheckTimer <= 0) {
          bot.losCheckTimer = 0.16 + Math.random() * 0.08;
          _v1.set(bot.x, bot.y + 1.55, bot.z);
          _v2.set(nearestTarget.x, nearestTarget.y + 1.3, nearestTarget.z).sub(_v1);
          const losDist = _v2.length();
          if (losDist > 1.5) {
            _v2.divideScalar(losDist);
            _projRaycaster.set(_v1, _v2);
            _projRaycaster.far = losDist - 0.8;
            bot.losClear = _projRaycaster.intersectObjects(this.colliderMeshes, false).length === 0;
          } else {
            bot.losClear = true;
          }
        }

        if (bot.losClear) {
          bot.aimAcquireTimer = Math.max(0, bot.aimAcquireTimer - dt);
        }

        // Squad Tactical Communication: ping enemy location + rally squadmates
        if (shouldBotBroadcastPing(bot.pingCooldown, bot.losClear, nearestDist < 95)) {
          bot.pingCooldown = 6.5;
          if (this.activePings.length < 14) {
            const pingMesh = createTacticalPingMarker();
            pingMesh.position.set(nearestTarget.x, nearestTarget.y + 0.12, nearestTarget.z);
            this.matchEntitiesGroup.add(pingMesh);
            this.activePings.push({
              mesh: pingMesh,
              x: nearestTarget.x,
              y: nearestTarget.y + 0.12,
              z: nearestTarget.z,
              ttl: 4.8,
              maxTtl: 4.8,
              squadId: bot.squadId,
            });
          }
          if (nearestTarget.isPlayer || Math.hypot(bot.x - this.player.x, bot.z - this.player.z) < 68) {
            this.sound.play('ping');
          }
          for (const ally of this.bots) {
            if (!ally.alive || ally === bot || !areBotsTeammates(bot.squadId, ally.squadId)) continue;
            if (Math.hypot(ally.x - bot.x, ally.z - bot.z) < 88) {
              if (ally.alertTimer <= 0) ally.aimAcquireTimer = Math.min(ally.aimAcquireTimer, 0.45);
              ally.alertTimer = Math.max(ally.alertTimer, 11.5);
              ally.alertTargetX = nearestTarget.x;
              ally.alertTargetZ = nearestTarget.z;
              ally.retargetTimer = Math.min(ally.retargetTimer, 0.2);
            }
          }
        }

        // Heal Punishment: drop aim-lock immediately, spray, and slide-rush to deny the heal!
        if (punishHealingTarget) {
          bot.aimAcquireTimer = 0;
          bot.retargetTimer = Math.min(bot.retargetTimer, 0.12);
          bot.fireCd = Math.min(bot.fireCd, 0.08);
          speed *= 1.16;
          if (
            bot.slideTimer <= 0 &&
            bot.slideCooldown <= 0 &&
            bot.onGround &&
            nearestDist > 16 &&
            Math.random() < profile.slidePushChance
          ) {
            bot.slideTimer = 0.54;
            bot.slideCooldown = 2.6;
            bot.isCrouching = false;
          }
        }

        // Human-like duel movement: crouch-spam & bunny-hop jumps
        if (bot.losClear && nearestDist < 52 && gunCount > 0) {
          bot.crouchToggleTimer -= dt;
          if (bot.crouchToggleTimer <= 0) {
            bot.crouchToggleTimer = 0.24 + Math.random() * 0.34;
            bot.isCrouching = !bot.isCrouching && Math.random() < profile.crouchSpamChance;
          }
          if (
            bot.onGround &&
            bot.jumpCooldown <= 0 &&
            !bot.isSwimming &&
            bot.slideTimer <= 0 &&
            Math.random() < profile.jumpDodgeChance * dt * 2.2
          ) {
            bot.vy = 10.2;
            bot.onGround = false;
            bot.isCrouching = false;
            bot.jumpCooldown = 1.6 + Math.random() * 1.4;
            bot.strafeDir *= -1;
          }
        } else {
          bot.isCrouching = false;
        }

        const playerReloadingOrHealing =
          nearestTarget.isPlayer && (this.player.reloading > 0 || this.player.healing > 0);
        if (bot.retargetTimer <= 0) {
          if (gunCount === 0) {
            bot.moveTargetX = nearestTarget.x;
            bot.moveTargetZ = nearestTarget.z;
            bot.retargetTimer = 0.5;
          } else if (punishHealingTarget || (enemyIsHealing && nearestDist < 52)) {
            const flankWp = computeBotFlankWaypoint(
              bot.x,
              bot.z,
              nearestTarget.x,
              nearestTarget.z,
              bot.flankSide,
              Math.min(18, Math.max(8, nearestDist * 0.52)),
              1.02,
            );
            bot.moveTargetX = flankWp.x;
            bot.moveTargetZ = flankWp.z;
            bot.retargetTimer = 0.28;
          } else if (bot.hp < 38 && bot.shield === 0 && nearestDist < 34) {
            const awayAng = Math.atan2(bot.z - nearestTarget.z, bot.x - nearestTarget.x);
            bot.moveTargetX = bot.x + Math.cos(awayAng + bot.strafeDir * 0.5) * 18;
            bot.moveTargetZ = bot.z + Math.sin(awayAng + bot.strafeDir * 0.5) * 18;
            bot.retargetTimer = 0.65;
          } else if (
            bot.policy === 'rusher' ||
            bot.weapon.def.id === 'pump' ||
            bot.weapon.def.id === 'tac' ||
            !nearestTarget.isPlayer ||
            (playerReloadingOrHealing && nearestDist < 48)
          ) {
            bot.moveTargetX = nearestTarget.x + bot.strafeDir * 5.2 + (Math.random() - 0.5) * 3.5;
            bot.moveTargetZ = nearestTarget.z + (Math.random() - 0.5) * 5;
            bot.retargetTimer = 0.48;
            if (
              bot.slideTimer <= 0 &&
              bot.slideCooldown <= 0 &&
              bot.onGround &&
              nearestDist > 18 &&
              nearestDist < 42 &&
              Math.random() < profile.slidePushChance * 0.45
            ) {
              bot.slideTimer = 0.52;
              bot.slideCooldown = 3.2;
              bot.isCrouching = false;
            }
          } else if (bot.policy === 'flanker') {
            const flankWp = computeBotFlankWaypoint(
              bot.x,
              bot.z,
              nearestTarget.x,
              nearestTarget.z,
              bot.strafeDir >= 0 ? 1 : -1,
              18 + Math.random() * 9,
              0.78,
            );
            bot.moveTargetX = flankWp.x;
            bot.moveTargetZ = flankWp.z;
            bot.retargetTimer = 0.55;
          } else {
            if (nearestDist < 32) {
              const awayAng = Math.atan2(bot.z - nearestTarget.z, bot.x - nearestTarget.x);
              bot.moveTargetX = bot.x + Math.cos(awayAng) * 22;
              bot.moveTargetZ = bot.z + Math.sin(awayAng) * 22;
            } else {
              const perpAng = bot.yaw + (Math.PI / 2) * bot.strafeDir;
              bot.moveTargetX = bot.x + Math.sin(perpAng) * 11;
              bot.moveTargetZ = bot.z + Math.cos(perpAng) * 11;
            }
            bot.retargetTimer = 0.7;
          }
        }

        // Melee Pickaxe Attack if bot still has no gun and is right beside target
        if (gunCount === 0 && nearestDist <= 3.3 && bot.fireCd <= 0) {
          bot.fireCd = 0.65;
          bot.pickaxeSwing = 1.0;
          if (nearestTarget.targetId === this.localPlayerId) {
            this.applyDamageToPlayer(20, bot.name, 'Tactical Pickaxe', Math.round(nearestDist), false, bot.id);
          } else if (nearestTarget.isPlayer && this.launchConfig && this.mpClient) {
            this.mpClient.send('player:hit', {
              targetId: nearestTarget.targetId,
              attackerId: bot.id,
              damage: 20,
              weaponName: 'Tactical Pickaxe',
              distanceM: Math.max(1, Math.round(nearestDist)),
            });
          } else {
            for (const ob of this.bots) {
              if (ob.alive && ob !== bot && !areBotsTeammates(bot.squadId, ob.squadId) && Math.hypot(ob.x - bot.x, ob.z - bot.z) <= 3.5) {
                _v1.set(ob.x, ob.y + 1.3, ob.z);
                this.applyDamageToBot(ob, 25, bot.name, false, _v1, undefined, false, bot.id, 'Tactical Pickaxe', nearestDist);
                break;
              }
            }
          }
        } else if (gunCount > 0 && bot.weapon.def.type === 'gun') {
          const maxAttackerLimit = bot.alertTimer > 0 || punishHealingTarget ? 4 : 3;
          const canAttackPlayer = !nearestTarget.isPlayer || activeAttackers < maxAttackerLimit;
          const maxEngageRange =
            !nearestTarget.isPlayer ? 95 : bot.policy === 'overwatch' ? 96 : bot.alertTimer > 0 ? 92 : 70;

          if (nearestDist < maxEngageRange && canAttackPlayer && bot.losClear) {
            if (nearestTarget.isPlayer) activeAttackers++;

            if ((bot.policy === 'overwatch' || bot.tier === 'pro') && bot.fireCd <= 0.32 && bot.fireCd > 0 && bot.telegraphLine) {
              const posAttr = bot.telegraphLine.geometry.getAttribute('position') as THREE.BufferAttribute;
              posAttr.setXYZ(0, bot.x, bot.y + 1.55, bot.z);
              posAttr.setXYZ(1, bot.aimSampleX, bot.aimSampleY, bot.aimSampleZ);
              posAttr.needsUpdate = true;
              bot.telegraphLine.visible = true;
            } else if (bot.telegraphLine) {
              bot.telegraphLine.visible = false;
            }

            if (bot.fireCd <= 0 && bot.aimAcquireTimer <= 0 && bot.weapon.def.type === 'gun') {
              const wDef = bot.weapon.def;
              if ((bot.weapon.ammo ?? 0) <= 0) {
                const tr = computeReloadTransfer(0, wDef.mag, bot.ammo[wDef.ammoType] ?? 0);
                if (tr.loaded > 0) {
                  bot.weapon.ammo = tr.nextMag;
                  bot.ammo[wDef.ammoType] = tr.nextReserve;
                  bot.fireCd = wDef.reload;
                }
                continue;
              }
              bot.weapon.ammo = (bot.weapon.ammo ?? 1) - 1;
              const isShotgun = wDef.id === 'pump' || wDef.id === 'tac';
              const botBulletSpeed = wDef.id === 'sniper' ? 240 : 175;
              const leadAccuracy =
                (bot.tier === 'pro' ? 0.52 : bot.tier === 'veteran' ? 0.34 : 0.16) * (0.65 + profile.effectiveLevel * 0.45);
              const swayAmp = (bot.tier === 'pro' ? 0.36 : bot.tier === 'veteran' ? 0.62 : 0.95) * profile.spreadScale;
              const swayX = Math.sin(now * 2.4 + bot.driftSeed) * swayAmp;
              const swayZ = Math.cos(now * 1.9 + bot.driftSeed) * swayAmp;

              const aimPt = nearestTarget.targetId === this.localPlayerId
                ? computeBotLeadPoint(
                    bot.x,
                    bot.z,
                    bot.aimSampleX + swayX,
                    bot.aimSampleY,
                    bot.aimSampleZ + swayZ,
                    this.player.vx,
                    this.player.vz,
                    botBulletSpeed,
                    leadAccuracy,
                  )
                : { x: nearestTarget.x, y: nearestTarget.y + 1.25, z: nearestTarget.z };

              _v1.set(bot.x, bot.y + (bot.isCrouching ? 1.15 : 1.5), bot.z);
              _v2.set(aimPt.x, aimPt.y, aimPt.z);
              const baseDir = _v2.sub(_v1).normalize();

              const rate = wDef.fireRate;
              if (bot.burstRemaining <= 0) {
                if (wDef.id === 'ar') {
                  bot.burstRemaining =
                    profile.burstMin + Math.floor(Math.random() * Math.max(1, profile.burstMax - profile.burstMin + 1));
                } else if (wDef.id === 'smg') {
                  bot.burstRemaining =
                    profile.burstMin + 2 + Math.floor(Math.random() * Math.max(1, profile.burstMax - profile.burstMin + 2));
                } else if (wDef.id === 'tac') {
                  bot.burstRemaining = 2;
                } else {
                  bot.burstRemaining = 1;
                }
                bot.burstShotIndex = 0;
              }
              bot.burstRemaining--;
              bot.burstShotIndex++;

              const tierCadence = bot.tier === 'pro' ? 0.92 : bot.tier === 'veteran' ? 1.06 : 1.28;
              const pauseMult = !nearestTarget.isPlayer ? 1.25 : 2.2 * (1.25 - profile.effectiveLevel * 0.45);
              bot.fireCd =
                bot.burstRemaining > 0
                  ? Math.max(0.095, rate * profile.cadenceMult * tierCadence)
                  : Math.max(0.24, rate * pauseMult);

              bot.lastShotTime = now;
              bot.recoil = 0.85;
              if (bot.telegraphLine) bot.telegraphLine.visible = false;

              const pellets = isShotgun ? 5 : 1;
              const tierDmgMult = bot.tier === 'pro' ? 1.0 : bot.tier === 'veteran' ? 0.86 : 0.72;
              const dmgScale = !nearestTarget.isPlayer ? 1.15 : profile.dmgScale * tierDmgMult;
              const baseSpread =
                (!nearestTarget.isPlayer ? 0.05 : bot.tier === 'pro' ? 0.052 : bot.tier === 'veteran' ? 0.078 : 0.115) *
                profile.spreadScale;

              this.spawnMuzzleFlash(_v1, baseDir);
              for (let p = 0; p < pellets; p++) {
                _v3.copy(baseDir);
                const spreadMag = (isShotgun ? baseSpread * 1.22 : baseSpread) + nearestDist * 0.001 + bot.burstShotIndex * 0.008;
                _v3.x += (Math.random() - 0.5) * spreadMag;
                _v3.y += (Math.random() - 0.5) * (spreadMag * 0.65);
                _v3.z += (Math.random() - 0.5) * spreadMag;
                _v3.normalize();
                this.spawnProjectile(
                  _v1,
                  _v3,
                  botBulletSpeed,
                  (bot.weapon.damage ?? 16) * dmgScale,
                  1.25,
                  0,
                  0xf87171,
                  false,
                  bot.name,
                  wDef.name,
                  bot.squadId,
                  bot.id,
                );
              }
            }
          } else if (bot.telegraphLine) {
            bot.telegraphLine.visible = false;
          }
        } else if (bot.telegraphLine) {
          bot.telegraphLine.visible = false;
        }
      } else {
        bot.isCrouching = false;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
        if (
          isFriendlyTarget(bot.squadId, this.localTeamId) &&
          !this.player.inBattleBus &&
          !this.player.isSkydiving &&
          this.player.hp > 0 &&
          gunCount > 0 &&
          dPlayer > 16
        ) {
          bot.moveTargetX = this.player.x + bot.flankSide * 6.5;
          bot.moveTargetZ = this.player.z + 4.5;
          bot.retargetTimer = 0.65;
        } else if (bot.retargetTimer <= 0) {
          const poi = POIS[Math.floor(Math.random() * POIS.length)];
          bot.moveTargetX = poi.x + (Math.random() - 0.5) * 44;
          bot.moveTargetZ = poi.z + (Math.random() - 0.5) * 44;
          bot.retargetTimer = 3.2 + Math.random() * 2.8;
        }
      }

      // 7. Movement + Building Doorway Waypointing + Stuck Obstacle Recovery
      if (bot.slideTimer > 0) speed *= 1.48;
      const wp = resolveBotBuildingWaypoint(bot.x, bot.z, bot.moveTargetX, bot.moveTargetZ, this.buildings);
      const rawDx = wp.x - bot.x;
      const rawDz = wp.z - bot.z;
      const distMove = Math.hypot(rawDx, rawDz);
      const goalDist = Math.hypot(bot.moveTargetX - bot.x, bot.moveTargetZ - bot.z);

      if (distMove > 0.35 && goalDist > 0.85) {
        bot.stuckCheckTimer -= dt;
        if (bot.stuckCheckTimer <= 0) {
          const progressMoved = Math.hypot(bot.x - bot.lastCheckX, bot.z - bot.lastCheckZ);
          if (progressMoved < 0.55) {
            if (bot.onGround) {
              bot.vy = 10.6;
              bot.onGround = false;
            }
            bot.stuckSteerTimer = 0.75;
            bot.stuckTurnAngle = (Math.random() < 0.5 ? 1 : -1) * 1.25;
          } else {
            bot.stuckSteerTimer = 0;
          }
          bot.lastCheckX = bot.x;
          bot.lastCheckZ = bot.z;
          bot.stuckCheckTimer = 0.45;
        }

        let moveDirX = rawDx / distMove;
        let moveDirZ = rawDz / distMove;
        if (bot.stuckSteerTimer > 0) {
          const ca = Math.cos(bot.stuckTurnAngle);
          const sa = Math.sin(bot.stuckTurnAngle);
          const rx = moveDirX * ca - moveDirZ * sa;
          const rz = moveDirX * sa + moveDirZ * ca;
          moveDirX = rx;
          moveDirZ = rz;
        }

        const stepDist = Math.min(speed * dt, distMove);
        bot.x += moveDirX * stepDist;
        bot.z += moveDirZ * stepDist;
        if (!nearestTarget || stormDanger || lootTarget) {
          bot.yaw = Math.atan2(moveDirX, moveDirZ);
        }
      }

      const resolved = resolveObstacleCollision(bot.x, bot.z, bot.y, this.obstacles, HALF_MAP, 0.58);
      bot.x = resolved.x;
      bot.z = resolved.z;

      const surfaceY = getWalkableSurfaceY(bot.x, bot.z, bot.y, this.obstacles);
      bot.isSwimming = surfaceY < -0.28 && bot.y <= -0.32;
      if (bot.isSwimming) {
        bot.isCrouching = false;
        bot.slideTimer = 0;
        bot.y = THREE.MathUtils.lerp(bot.y, -0.38, Math.min(1, dt * 8));
        bot.vy = 0;
        bot.onGround = true;
      } else {
        bot.vy -= 28 * dt;
        bot.y += bot.vy * dt;
        if (bot.y <= surfaceY) {
          bot.y = surfaceY;
          bot.vy = 0;
          bot.onGround = true;
        } else {
          bot.onGround = false;
        }
      }

      const targetBotLean = nearestTarget && !stormDanger && gunCount > 0 ? bot.strafeDir * -0.14 : 0;
      bot.strafeLean = THREE.MathUtils.lerp(bot.strafeLean, targetBotLean, Math.min(1, dt * 10));

      bot.rig.root.position.set(bot.x, bot.y, bot.z);
      bot.rig.root.rotation.y = bot.yaw;
      bot.rig.animate(dt, {
        speed: distMove > 0.35 && goalDist > 0.85 ? speed : 0,
        isAiming: !!nearestTarget && !stormDanger && gunCount > 0,
        isCrouching: bot.isCrouching,
        isSliding: bot.slideTimer > 0,
        strafeLean: bot.strafeLean,
        onGround: bot.onGround,
        isSwimming: bot.isSwimming,
        recoil: bot.recoil,
        pickaxeSwing: bot.pickaxeSwing,
        hitFlinch: bot.hitFlinchTimer > 0 ? bot.hitFlinchTimer * 5 : 0,
      });
      bot.rig.root.updateMatrixWorld(true);

      if (!this.launchConfig && distStorm > this.storm.radius) {
        this.applyDamageToBot(bot, 5 * dt, 'The Storm', false, null);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const HEAD_COMBINED_R = 0.34;
    const BODY_COMBINED_R = 0.48;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      if (pr.life <= 0) {
        this.matchEntitiesGroup.remove(pr.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      pr.vel.y -= pr.gravity * dt;
      const ax = pr.pos.x;
      const ay = pr.pos.y;
      const az = pr.pos.z;
      const bx = ax + pr.vel.x * dt;
      const by = ay + pr.vel.y * dt;
      const bz = az + pr.vel.z * dt;

      const stepDx = bx - ax;
      const stepDy = by - ay;
      const stepDz = bz - az;
      const stepLen = Math.hypot(stepDx, stepDy, stepDz);

      let wallT = 1.01;
      let hitWall = false;
      let hitTerrain = false;
      let hasSurfaceNormal = false;
      let hitWallMesh: THREE.Object3D | null = null;

      const terrainSamples = stepLen > 6 ? 3 : 1;
      for (let s = 1; s <= terrainSamples; s++) {
        const ts = s / terrainSamples;
        const sx = ax + stepDx * ts;
        const sy = ay + stepDy * ts;
        const sz = az + stepDz * ts;
        if (sy <= getTerrainHeight(sx, sz)) {
          wallT = ts;
          hitTerrain = true;
          _hitNormal.set(0, 1, 0);
          hasSurfaceNormal = true;
          break;
        }
      }

      for (const [k, v] of this.shotTallies) {
        v.ttl -= dt;
        if (v.ttl <= 0) this.shotTallies.delete(k);
      }

      if (stepLen > 1e-5) {
        _v2.set(stepDx / stepLen, stepDy / stepLen, stepDz / stepLen);
        _projRaycaster.set(pr.pos, _v2);
        _projRaycaster.far = stepLen * Math.min(1, wallT);
        const wallRayHits = _projRaycaster.intersectObjects(this.colliderMeshes, false);
        if (wallRayHits.length > 0) {
          const wh = wallRayHits[0];
          const tMesh = wh.distance / stepLen;
          if (tMesh < wallT) {
            wallT = tMesh;
            hitWall = true;
            hitTerrain = false;
            hitWallMesh = wh.object;
            if (wh.face) {
              _normalMat3.getNormalMatrix(wh.object.matrixWorld);
              _hitNormal.copy(wh.face.normal).applyMatrix3(_normalMat3).normalize();
              hasSurfaceNormal = true;
            }
          }
        }
      }

      for (const ob of this.obstacles) {
        if (ob.broken) continue;
        const tObs = segmentIntersectsBoxT(ax, ay, az, bx, by, bz, ob);
        if (tObs !== null && tObs < wallT) {
          wallT = tObs;
          hitWall = true;
          hitTerrain = false;
        }
      }

      let removed = false;

      if (pr.fromPlayer && stepLen > 1e-5) {
        let bestBot: BotEntity | null = null;
        let bestBotT = wallT;
        let bestMult = 1.0;
        let bestIsCrit = false;

        _v2.set(stepDx / stepLen, stepDy / stepLen, stepDz / stepLen);
        _projRaycaster.set(pr.pos, _v2);
        _projRaycaster.far = stepLen * Math.min(1, wallT);
        const rayHits = _projRaycaster.intersectObjects(this.botHitboxMeshes, false);
        for (const rh of rayHits) {
          const info = this.hitboxToBot.get(rh.object);
          if (!info || !info.bot.alive || info.bot.inBattleBus || isFriendlyTarget(info.bot.squadId, pr.ownerSquadId)) continue;
          const tRay = rh.distance / stepLen;
          if (tRay < bestBotT) {
            bestBot = info.bot;
            bestBotT = tRay;
            bestIsCrit = info.zone === 'head';
            bestMult = info.zone === 'head' ? pr.headMult : info.zone === 'arm' || info.zone === 'leg' ? 0.85 : 1.0;
            break;
          }
        }

        if (!bestBot) {
          const headR = HEAD_COMBINED_R + pr.bulletRadius;
          const bodyR = BODY_COMBINED_R + pr.bulletRadius;
          for (const bot of this.bots) {
            if (!bot.alive || bot.inBattleBus || isFriendlyTarget(bot.squadId, pr.ownerSquadId)) continue;
            const headHit = sweptSphereSegmentHit(ax, ay, az, bx, by, bz, bot.x, bot.y + 1.98, bot.z, headR);
            if (headHit.hit && headHit.t < bestBotT) {
              bestBot = bot;
              bestBotT = headHit.t;
              bestMult = pr.headMult;
              bestIsCrit = true;
            }
            const bodyHit = sweptSphereCapsuleHit(ax, ay, az, bx, by, bz, bot.x, bot.y, bot.z, 0.25, 1.72, bodyR);
            if (bodyHit.hit && bodyHit.t < bestBotT) {
              if (bot !== bestBot || !bestIsCrit || bodyHit.t + 0.01 < bestBotT) {
                bestBot = bot;
                bestBotT = bodyHit.t;
                bestMult = 1.0;
                bestIsCrit = false;
              }
            }
          }
        }

        // Check remote humans as well (skipping teammates!)
        let bestHuman: RemoteHumanEntity | null = null;
        if (this.remoteHumanHitboxMeshes.length > 0) {
          const hRayHits = _projRaycaster.intersectObjects(this.remoteHumanHitboxMeshes, false);
          for (const rhHit of hRayHits) {
            const rhId = this.hitboxToRemoteHuman.get(rhHit.object);
            const rh = rhId ? this.remoteHumans.get(rhId) : undefined;
            if (!rh || !rh.alive || rh.inBattleBus || isFriendlyTarget(rh.teamId, pr.ownerSquadId)) continue;
            const tRay = rhHit.distance / stepLen;
            if (tRay < bestBotT) {
              bestBot = null;
              bestHuman = rh;
              bestBotT = tRay;
              bestIsCrit = rhHit.object.name === 'headHitbox';
              bestMult = bestIsCrit ? pr.headMult : 1.0;
              break;
            }
          }
        }

        if (bestHuman && this.mpClient) {
          _v1.set(ax + stepDx * bestBotT, ay + stepDy * bestBotT, az + stepDz * bestBotT);
          const rawDmg = pr.damage * bestMult;
          const dmg = Math.max(1, Math.round(rawDmg));
          const shotDistM = Math.hypot(bestHuman.x - pr.spawnX, bestHuman.z - pr.spawnZ);
          const shotKey = `${pr.shotId}-${bestHuman.id}`;
          const hadShield = !bestHuman.knocked && bestHuman.shield > 0;
          this.spawnBurstParticles(_v1, hadShield ? 0x38bdf8 : 0xf97316, bestIsCrit ? 12 : 7, 6);
          this.mpClient.send('player:hit', {
            targetId: bestHuman.id,
            attackerId: this.localPlayerId,
            damage: dmg,
            weaponName: pr.weaponName,
            distanceM: Math.max(1, Math.round(shotDistM)),
            isHeadshot: bestIsCrit,
          });
          this.recordPlayerShotDamage(bestHuman.x, bestHuman.y + 2.35, bestHuman.z, rawDmg, bestIsCrit, hadShield, shotKey);
          this.sound.play('hit');
          this.callbacks.onHitmarker();
          removed = true;
        } else if (bestBot) {
          _v1.set(ax + stepDx * bestBotT, ay + stepDy * bestBotT, az + stepDz * bestBotT);
          const dmg = pr.damage * bestMult;
          const shotDistM = Math.hypot(bestBot.x - pr.spawnX, bestBot.z - pr.spawnZ);
          const shotKey = `${pr.shotId}-${bestBot.id}`;
          this.applyDamageToBot(bestBot, dmg, pr.ownerName, bestIsCrit, _v1, shotKey, false, pr.ownerId ?? this.localPlayerId, pr.weaponName, shotDistM);
          this.sound.play('hit');
          this.callbacks.onHitmarker();
          removed = true;
        }
      } else if (!pr.fromPlayer && stepLen > 1e-5) {
        let bestT = wallT;
        let hitPlayer = false;
        let hitRemoteHuman: RemoteHumanEntity | null = null;
        let hitOtherBot: BotEntity | null = null;

        if (!this.player.inBattleBus && !this.player.isSkydiving && !isFriendlyTarget(this.localTeamId, pr.ownerSquadId)) {
          const pHead = sweptSphereSegmentHit(
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            this.player.x,
            this.player.y + 1.85,
            this.player.z,
            0.42 + pr.bulletRadius,
          );
          const pBody = sweptSphereCapsuleHit(
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            this.player.x,
            this.player.y,
            this.player.z,
            0.25,
            1.7,
            0.62 + pr.bulletRadius,
          );

          if (pHead.hit && pHead.t < bestT) {
            bestT = pHead.t;
            hitPlayer = true;
          } else if (pBody.hit && pBody.t < bestT) {
            bestT = pBody.t;
            hitPlayer = true;
          } else if (Math.min(pHead.distSq, 99) < 3.2 * 3.2 && Math.random() < 0.25) {
            this.sound.play('whiz');
          }
        }

        if (this.isRoomHost) {
          for (const rh of this.remoteHumans.values()) {
            if (!rh.alive || rh.inBattleBus || rh.isSkydiving || isFriendlyTarget(rh.teamId, pr.ownerSquadId)) continue;
            const rBody = sweptSphereCapsuleHit(ax, ay, az, bx, by, bz, rh.x, rh.y, rh.z, 0.25, 1.72, 0.65 + pr.bulletRadius);
            if (rBody.hit && rBody.t < bestT) {
              bestT = rBody.t;
              hitPlayer = false;
              hitRemoteHuman = rh;
            }
          }
        }

        for (const bot of this.bots) {
          if (!bot.alive || bot.inBattleBus || bot.name === pr.ownerName || areBotsTeammates(bot.squadId, pr.ownerSquadId)) continue;
          const bBody = sweptSphereCapsuleHit(
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            bot.x,
            bot.y,
            bot.z,
            0.25,
            1.72,
            0.68 + pr.bulletRadius,
          );
          if (bBody.hit && bBody.t < bestT) {
            bestT = bBody.t;
            hitPlayer = false;
            hitRemoteHuman = null;
            hitOtherBot = bot;
          }
        }

        if (hitPlayer) {
          _v1.set(ax + stepDx * bestT, ay + stepDy * bestT, az + stepDz * bestT);
          const shotDistM = Math.hypot(this.player.x - pr.spawnX, this.player.z - pr.spawnZ);
          this.applyDamageToPlayer(pr.damage, pr.ownerName, pr.weaponName, shotDistM, false, pr.ownerId ?? '');
          this.spawnBurstParticles(_v1, 0xef4444, 6, 5);
          removed = true;
        } else if (hitRemoteHuman && this.mpClient && this.isRoomHost) {
          _v1.set(ax + stepDx * bestT, ay + stepDy * bestT, az + stepDz * bestT);
          const shotDistM = Math.hypot(hitRemoteHuman.x - pr.spawnX, hitRemoteHuman.z - pr.spawnZ);
          this.mpClient.send('player:hit', {
            targetId: hitRemoteHuman.id,
            attackerId: pr.ownerId ?? '',
            damage: Math.max(1, Math.round(pr.damage)),
            weaponName: pr.weaponName,
            distanceM: Math.max(1, Math.round(shotDistM)),
          });
          this.spawnBurstParticles(_v1, 0xef4444, 6, 5);
          removed = true;
        } else if (hitOtherBot) {
          _v1.set(ax + stepDx * bestT, ay + stepDy * bestT, az + stepDz * bestT);
          const shotDistM = Math.hypot(hitOtherBot.x - pr.spawnX, hitOtherBot.z - pr.spawnZ);
          this.applyDamageToBot(hitOtherBot, pr.damage * 1.55, pr.ownerName, false, _v1, undefined, false, pr.ownerId ?? '', pr.weaponName, shotDistM);
          removed = true;
        }
      }

      if (!removed && (hitWall || hitTerrain)) {
        _v1.set(ax + stepDx * wallT, ay + stepDy * wallT, az + stepDz * wallT);
        if (hitWall && hitWallMesh) {
          const dest = this.meshToDestructible.get(hitWallMesh);
          if (dest && !dest.broken) {
            this.damageDestructible(dest, pr.damage, false, _v1);
          }
        }
        this.spawnBurstParticles(_v1, hitWall ? 0xfef08a : 0xd6d3d1, 6, 4.5);
        if (hitWall && hasSurfaceNormal) {
          this.spawnImpactDecal(_v1, _hitNormal);
        }
        removed = true;
      }

      if (removed) {
        this.matchEntitiesGroup.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      } else {
        pr.pos.set(bx, by, bz);
        pr.mesh.position.set(bx, by, bz);
      }
    }
  }

  private updateStorm(dt: number): void {
    this.storm = stepStorm(this.storm, dt);
    if (this.stormMesh) {
      this.stormMesh.scale.set(this.storm.radius, 1, this.storm.radius);
    }

    const stormAudio = computeStormAudioParams(this.player.x, this.player.z, this.player.yaw, this.storm);
    this.stormProximity = stormAudio.proximity;
    this.sound.updateStormAudio(
      dt,
      stormAudio.intensity,
      stormAudio.pan,
      stormAudio.insideStorm,
      !this.player.inBattleBus,
    );

    if (this.launchConfig && this.mpClient) {
      this.stormTickAccum += dt;
      if (this.stormTickAccum >= 0.5) {
        this.stormTickAccum = 0;
        if (this.player.alive && !this.player.inBattleBus && stormAudio.insideStorm) {
          this.mpClient.send('combatant:selfDamage', { targetId: this.localPlayerId, damage: 2 });
        }
        if (this.isRoomHost) {
          for (const bot of this.bots) {
            if (!bot.alive || bot.inBattleBus) continue;
            if (Math.hypot(bot.x - this.storm.cx, bot.z - this.storm.cz) > this.storm.radius) {
              this.mpClient.send('combatant:selfDamage', { targetId: bot.id, damage: 3 });
            }
          }
        }
      }
      return;
    }

    if (this.player.alive && !this.player.inBattleBus && stormAudio.insideStorm) {
      this.applyDamageToPlayer(3.5 * dt, 'The Storm', 'Storm Surge', 0);
    }
  }

  private updateFX(dt: number): void {
    const nowSec = performance.now() * 0.001;

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleFlashMesh.visible = false;
      }
    }
    if (this.muzzleLightTimer > 0) {
      this.muzzleLightTimer -= dt;
      if (this.muzzleLightTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }

    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life -= dt;
      p.vy -= 18 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      }
    }

    for (let i = this.shellCasings.length - 1; i >= 0; i--) {
      const c = this.shellCasings[i];
      c.life -= dt;
      c.vy -= 20 * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += 12 * dt;
      c.mesh.rotation.z += 9 * dt;
      const gy = getTerrainHeight(c.mesh.position.x, c.mesh.position.z) + 0.05;
      if (c.mesh.position.y < gy) {
        c.mesh.position.y = gy;
        c.vy *= -0.35;
        c.vx *= 0.6;
        c.vz *= 0.6;
      }
      if (c.life <= 0) {
        this.matchEntitiesGroup.remove(c.mesh);
        this.shellCasings.splice(i, 1);
      }
    }

    for (const ch of this.chests) {
      if (ch.opened && ch.openProgress < 1) {
        ch.openProgress = Math.min(1, ch.openProgress + dt * 2.6);
        const eased = 1 - Math.pow(1 - ch.openProgress, 3);
        ch.lidPivot.rotation.x = -1.25 * eased;
        if (ch.shockRing.visible) {
          ch.shockRing.scale.setScalar(0.4 + eased * 3.2);
          const ringMat = ch.shockRing.material as THREE.MeshBasicMaterial;
          ringMat.opacity = Math.max(0, 0.92 * (1 - ch.openProgress));
          if (ch.openProgress >= 1) {
            ch.shockRing.visible = false;
          }
        }
      }
    }

    for (let i = 0; i < this.groundLoot.length; i++) {
      const l = this.groundLoot[i];
      if (l.spinner) {
        l.spinner.rotation.y += dt * 2.1;
        l.spinner.position.y = Math.sin(nowSec * 3.2 + i) * 0.08;
      }
      if (l.popTime > 0) {
        l.popTime -= dt;
        l.mesh.position.y = l.y + Math.sin((Math.max(0, l.popTime) / 0.35) * Math.PI) * 0.9;
      }
      if (l.label) {
        const dist = Math.hypot(this.player.x - l.x, this.player.z - l.z);
        l.label.visible = dist < 56;
        if (l.label.visible) {
          const s = THREE.MathUtils.clamp(0.85 + dist * 0.032, 0.9, 1.9);
          l.label.scale.set(2.35 * s, 0.66 * s, 1);
        }
      }
    }

    for (let i = 0; i < this.groundAmmo.length; i++) {
      const a = this.groundAmmo[i];
      if (a.spinner) {
        a.spinner.rotation.y += dt * 2.1;
        a.spinner.position.y = Math.sin(nowSec * 3.2 + i * 1.3) * 0.07;
      }
      if (a.popTime > 0) {
        a.popTime -= dt;
        a.mesh.position.y = a.y + Math.sin((Math.max(0, a.popTime) / 0.35) * Math.PI) * 0.8;
      }
      if (a.label) {
        const dist = Math.hypot(this.player.x - a.x, this.player.z - a.z);
        a.label.visible = dist < 44;
        if (a.label.visible) {
          const s = THREE.MathUtils.clamp(0.85 + dist * 0.03, 0.9, 1.75);
          a.label.scale.set(2.15 * s, 0.6 * s, 1);
        }
      }
    }

    for (let i = 0; i < this.launchPads.length; i++) {
      const lp = this.launchPads[i];
      const pulse = (Math.sin(nowSec * 4.5 + i) + 1) * 0.5;
      lp.ringMesh.position.y = 0.4 + pulse * 0.45;
      lp.ringMesh.scale.setScalar(0.95 + pulse * 0.14);
    }

    for (let i = 0; i < this.rebootVans.length; i++) {
      const van = this.rebootVans[i];
      if (van.ring) {
        van.ring.rotation.z += dt * 1.4;
        const s = 0.92 + Math.sin(nowSec * 3.8 + i) * 0.12;
        van.ring.scale.setScalar(s);
      }
      if (van.beacon) {
        const bMat = van.beacon.material as THREE.MeshBasicMaterial | undefined;
        if (bMat && typeof bMat.opacity === 'number') {
          bMat.opacity = 0.14 + Math.sin(nowSec * 3.2 + i) * 0.06;
        }
      }
    }

    for (let i = this.rebootCards.length - 1; i >= 0; i--) {
      const card = this.rebootCards[i];
      card.expiresSec -= dt;
      if (card.expiresSec <= 0) {
        this.matchEntitiesGroup.remove(card.mesh);
        this.rebootCards.splice(i, 1);
        continue;
      }
      card.mesh.rotation.y += dt * 2.4;
      const cardInner = card.mesh.getObjectByName('rebootCardSpin');
      if (cardInner) {
        cardInner.position.y = 1.05 + Math.sin(nowSec * 4.0 + i) * 0.16;
      }
    }

    for (let i = this.heldRebootCards.length - 1; i >= 0; i--) {
      this.heldRebootCards[i].expiresSec -= dt;
      if (this.heldRebootCards[i].expiresSec <= 0) {
        this.heldRebootCards.splice(i, 1);
      }
    }

    for (let i = this.activePings.length - 1; i >= 0; i--) {
      const ping = this.activePings[i];
      ping.ttl -= dt;
      if (ping.ttl <= 0) {
        this.matchEntitiesGroup.remove(ping.mesh);
        this.activePings.splice(i, 1);
        continue;
      }
      const diamond = ping.mesh.getObjectByName('pingDiamond');
      if (diamond) {
        diamond.rotation.y += dt * 3.8;
        diamond.position.y = 2.65 + Math.sin(nowSec * 5.2 + i) * 0.24;
      }
      const ring = ping.mesh.getObjectByName('pingRing');
      if (ring) {
        const s = 0.88 + Math.sin(nowSec * 6.5) * 0.22;
        ring.scale.setScalar(s);
      }
    }
  }

  private drawMapToCanvas(ctx: CanvasRenderingContext2D, size: number, isFullMap: boolean): void {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.mapBgCanvas, 0, 0, size, size);

    const toMap = (wx: number, wz: number) => ({
      x: ((wx + HALF_MAP) / MAP_SIZE) * size,
      y: ((wz + HALF_MAP) / MAP_SIZE) * size,
    });

    // Subtle Crystal River highlight line
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = isFullMap ? 4 : 2;
    ctx.beginPath();
    for (let rz = -150; rz <= 310; rz += 20) {
      const rp = toMap(getRiverCenterX(rz), rz);
      if (rz === -150) ctx.moveTo(rp.x, rp.y);
      else ctx.lineTo(rp.x, rp.y);
    }
    ctx.stroke();

    // Battle Bus flight trajectory line while bus is active
    if (this.player.busProgress < 1.15) {
      const p0 = toMap(this.busStartX, this.busStartZ);
      const p1 = toMap(this.busEndX, this.busEndZ);
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = isFullMap ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
      ctx.restore();

      if (this.battleBus) {
        const bp = toMap(this.battleBus.group.position.x, this.battleBus.group.position.z);
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, isFullMap ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.font = isFullMap ? '700 12px "Chakra Petch", sans-serif' : '700 7px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(8, 16, 38, 0.9)';
    ctx.lineWidth = isFullMap ? 3 : 2.2;
    for (const poi of POIS) {
      const p = toMap(poi.x, poi.z);
      const label = isFullMap
        ? poi.name.toUpperCase()
        : (poi.name === 'Red Hangars' ? 'HANGARS' : poi.name.split(' ')[0]).toUpperCase();
      ctx.strokeText(label, p.x, p.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, p.x, p.y);
    }

    ctx.fillStyle = '#fde047';
    for (const ch of this.chests) {
      if (ch.opened) continue;
      if (isFullMap || Math.hypot(ch.x - this.player.x, ch.z - this.player.z) < 90) {
        const cp = toMap(ch.x, ch.z);
        ctx.fillRect(cp.x - 1.5, cp.y - 1.5, 3, 3);
      }
    }

    ctx.fillStyle = '#38bdf8';
    for (const lp of this.launchPads) {
      const p = toMap(lp.x, lp.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, isFullMap ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6 POI Reboot Vans
    for (const van of this.rebootVans) {
      const vp = toMap(van.x, van.z);
      const sz = isFullMap ? 6 : 4;
      ctx.fillStyle = '#06b6d4';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.fillRect(vp.x - sz, vp.y - sz, sz * 2, sz * 2);
      ctx.strokeRect(vp.x - sz, vp.y - sz, sz * 2, sz * 2);
    }

    // Dropped Friendly Reboot Cards
    for (const card of this.rebootCards) {
      const cp = toMap(card.x, card.z);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, isFullMap ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const now = performance.now() / 1000;
    ctx.fillStyle = '#ef4444';
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      if (isFriendlyTarget(bot.squadId, this.localTeamId)) {
        const bp = toMap(bot.x, bot.z);
        ctx.fillStyle = bot.knocked ? '#f59e0b' : '#22c55e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, isFullMap ? 5.2 : 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        continue;
      }
      if (now - bot.lastShotTime < 1.8) {
        const bp = toMap(bot.x, bot.z);
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Human Squadmates on Map
    for (const rh of this.remoteHumans.values()) {
      if (!rh.alive || !isFriendlyTarget(rh.teamId, this.localTeamId)) continue;
      const hp = toMap(rh.x, rh.z);
      ctx.fillStyle = rh.knocked ? '#f59e0b' : '#22c55e';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, isFullMap ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Active Squad Pings on Map
    for (const ping of this.activePings) {
      if (!isFriendlyTarget(ping.squadId, this.localTeamId)) continue;
      const pg = toMap(ping.x, ping.z);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(pg.x, pg.y, isFullMap ? 5.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const sc = toMap(this.storm.cx, this.storm.cz);
    const sr = (this.storm.radius / MAP_SIZE) * size;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, sr, 0, Math.PI * 2);
    ctx.stroke();

    if (this.player.alive) {
      const pp = toMap(this.player.x, this.player.z);
      ctx.save();
      ctx.translate(pp.x, pp.y);
      ctx.rotate(-this.player.yaw);
      ctx.fillStyle = this.player.knocked ? '#f59e0b' : '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  private getInteractText(): string | null {
    if (!this.player.alive || this.player.knocked || this.player.inBattleBus || this.player.isSkydiving) return null;
    const keyLabel = formatKeyCodeLabel(this.getBind('interact'));

    if (this.playerReviveChannel) {
      const left = Math.max(0.1, REVIVE_TIME - this.playerReviveChannel.elapsed).toFixed(1);
      return `Reviving ${this.playerReviveChannel.targetName} (${left}s)...`;
    }
    for (const rh of this.remoteHumans.values()) {
      if (rh.alive && rh.knocked && isFriendlyTarget(rh.teamId, this.localTeamId) && Math.hypot(this.player.x - rh.x, this.player.z - rh.z) < 3.6 && Math.abs(this.player.y - rh.y) < 2.6) {
        return `Press [${keyLabel}] to Revive ${rh.name}`;
      }
    }
    for (const bot of this.bots) {
      if (bot.alive && bot.knocked && isFriendlyTarget(bot.squadId, this.localTeamId) && Math.hypot(this.player.x - bot.x, this.player.z - bot.z) < 3.6 && Math.abs(this.player.y - bot.y) < 2.6) {
        return `Press [${keyLabel}] to Revive ${bot.name}`;
      }
    }
    for (const c of this.rebootCards) {
      if (Math.hypot(this.player.x - c.x, this.player.z - c.z) < 4.4 && Math.abs(this.player.y - c.y) < 3.2) {
        return `Press [${keyLabel}] to Collect ${c.name}'s Reboot Card`;
      }
    }
    if (this.playerRebootChannel) {
      const left = Math.max(0.1, REBOOT_TIME - this.playerRebootChannel.elapsed).toFixed(1);
      return `Rebooting Squad (${left}s)... Stay Near Van`;
    }
    if (this.heldRebootCards.length > 0) {
      for (const van of this.rebootVans) {
        if (Math.hypot(this.player.x - van.x, this.player.z - van.z) < 5.0 && Math.abs(this.player.y - van.y) < 3.8) {
          return `Press [${keyLabel}] to Reboot Squad at ${van.name} (${this.heldRebootCards.length} Card${this.heldRebootCards.length > 1 ? 's' : ''})`;
        }
      }
    }
    for (const ch of this.chests) {
      if (!ch.opened && Math.hypot(this.player.x - ch.x, this.player.z - ch.z) < 5.2 && Math.abs(this.player.y - ch.y) < 3.6) {
        if (this.playerChestSearch && this.playerChestSearch.chest.id === ch.id) {
          const left = Math.max(0.1, CHEST_OPEN_TIME - this.playerChestSearch.elapsed).toFixed(1);
          return `Searching Chest (${left}s)... Stay Near Chest`;
        }
        return `Press [${keyLabel}] to Search Chest (${CHEST_OPEN_TIME}s)`;
      }
    }
    for (const a of this.groundAmmo) {
      if (Math.hypot(this.player.x - a.x, this.player.z - a.z) < 4.0 && Math.abs(this.player.y - a.y) < 3.2) {
        return `Press [${keyLabel}] to Pick Up +${a.amount} ${AMMO_DEFS[a.ammoType].name}`;
      }
    }
    for (const l of this.groundLoot) {
      if (Math.hypot(this.player.x - l.x, this.player.z - l.z) < 4.0 && Math.abs(this.player.y - l.y) < 3.2) {
        const rarLabel = l.item.def.type === 'heal' ? '' : `[${l.item.rarity.name}] `;
        return `Press [${keyLabel}] to Pick Up ${rarLabel}${l.item.def.name}`;
      }
    }
    return null;
  }

  private emitHud(): void {
    const activeItem = this.player.slots[this.player.activeSlot];
    const isSniperAds =
      this.player.alive &&
      !this.player.knocked &&
      !this.player.inBattleBus &&
      !this.player.pickaxeEquipped &&
      this.player.isAiming &&
      activeItem?.def.id === 'sniper';

    const yawDeg = (((-this.player.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const rankLabel = getRankFromRp(this.rankedRp).current.short;

    const revivePct = this.playerReviveChannel
      ? Math.min(100, (this.playerReviveChannel.elapsed / REVIVE_TIME) * 100)
      : null;
    const rebootProgressPct = this.playerRebootChannel
      ? Math.min(100, (this.playerRebootChannel.elapsed / REBOOT_TIME) * 100)
      : null;

    const nearbyRebootVan =
      this.player.alive &&
      !this.player.knocked &&
      this.heldRebootCards.length > 0 &&
      this.rebootVans.some((v) => Math.hypot(this.player.x - v.x, this.player.z - v.z) < 5.0 && Math.abs(this.player.y - v.y) < 3.8);

    const actionText =
      this.playerReviveChannel
        ? `Reviving ${this.playerReviveChannel.targetName} (${Math.max(0.1, REVIVE_TIME - this.playerReviveChannel.elapsed).toFixed(1)}s)`
        : this.playerRebootChannel
          ? `Rebooting Squad (${Math.max(0.1, REBOOT_TIME - this.playerRebootChannel.elapsed).toFixed(1)}s)`
          : this.player.healing > 0 && this.player.healItem
            ? `Using ${this.player.healItem.def.name}`
            : this.playerChestSearch
              ? `Searching Chest (${Math.max(0.1, CHEST_OPEN_TIME - this.playerChestSearch.elapsed).toFixed(1)}s)`
              : null;
    const actionPct =
      this.playerReviveChannel
        ? revivePct
        : this.playerRebootChannel
          ? rebootProgressPct
          : this.player.healing > 0
            ? Math.min(100, (1 - this.player.healing / this.player.healTotal) * 100)
            : this.playerChestSearch
              ? Math.min(100, (this.playerChestSearch.elapsed / CHEST_OPEN_TIME) * 100)
              : null;

    const groundCardMap = new Map(this.rebootCards.map((c) => [c.id, Math.ceil(c.expiresSec)]));
    const heldCardMap = new Map(this.heldRebootCards.map((c) => [c.id, Math.ceil(c.expiresSec)]));

    const teammates: TeammateHudInfo[] = [
      ...Array.from(this.remoteHumans.values())
        .filter((rh) => isFriendlyTarget(rh.teamId, this.localTeamId))
        .map((rh) => {
          const cardSec = groundCardMap.get(rh.id) ?? heldCardMap.get(rh.id);
          return {
            id: rh.id,
            name: rh.name,
            isHuman: true,
            alive: rh.alive,
            knocked: rh.knocked,
            hp: Math.round(rh.hp),
            shield: Math.round(rh.shield),
            kills: rh.kills,
            hasRebootCard: cardSec !== undefined,
            rebootExpiresSec: cardSec,
            skinId: rh.skinId,
          };
        }),
      ...this.bots
        .filter((b) => isFriendlyTarget(b.squadId, this.localTeamId))
        .map((b) => {
          const cardSec = groundCardMap.get(b.id) ?? heldCardMap.get(b.id);
          return {
            id: b.id,
            name: b.name,
            isHuman: false,
            alive: b.alive,
            knocked: b.knocked,
            hp: Math.round(b.hp),
            shield: Math.round(b.shield),
            kills: 0,
            hasRebootCard: cardSec !== undefined,
            rebootExpiresSec: cardSec,
            skinId: b.skinId,
          };
        }),
    ];

    let spectatingName: string | null = null;
    if (!this.player.alive && this.player.spectatingId) {
      spectatingName =
        this.remoteHumans.get(this.player.spectatingId)?.name ??
        this.botById.get(this.player.spectatingId)?.name ??
        null;
    }

    const aliveHumansCount =
      (this.player.alive ? 1 : 0) +
      Array.from(this.remoteHumans.values()).filter((r) => r.alive).length;

    this.callbacks.onHudUpdate({
      hp: Math.ceil(this.player.hp),
      shield: Math.ceil(this.player.shield),
      alive: this.player.alive,
      knocked: this.player.knocked,
      dbnoHp: Math.ceil(this.player.dbnoHp),
      revivePct,
      beingRevived: this.player.beingRevived,
      heldRebootCards: this.heldRebootCards.map((c) => ({
        id: c.id,
        name: c.name,
        expiresSec: Math.ceil(c.expiresSec),
      })),
      spectatingName,
      spectatingId: this.player.spectatingId,
      nearbyRebootVan,
      rebootProgressPct,
      keybinds: { ...this.settings.keybinds },
      kills: this.player.kills,
      aliveCount: this.bots.filter((b) => b.alive).length + aliveHumansCount,
      stormTimerSec: Math.ceil(this.storm.phaseTimer),
      inStorm: this.player.alive && !this.player.inBattleBus && isInsideStorm(this.player.x, this.player.z, this.storm),
      stormProximity: this.player.inBattleBus ? 0 : this.stormProximity,
      poiName: this.player.inBattleBus ? 'BATTLE BUS FLIGHT' : getCurrentPoiName(this.player.x, this.player.z),
      yawDeg,
      teamMode: this.teamMode,
      teammates,
      matchMode: this.matchMode,
      botDifficulty: this.botDifficulty,
      rankLabel,
      pointerLocked: this.pointerLocked,
      inBattleBus: this.player.inBattleBus,
      busProgress: Math.min(1, this.player.busProgress),
      isSkydiving: this.player.isSkydiving,
      isGliding: this.player.isGliding,
      altitude: Math.max(0, Math.round(this.player.y - getTerrainHeight(this.player.x, this.player.z))),
      pickaxeEquipped: this.player.pickaxeEquipped,
      activeSlot: this.player.activeSlot,
      slots: this.player.slots.map((slot) =>
        slot
          ? {
              id: slot.def.id,
              short: slot.def.short,
              name: slot.def.name,
              role: slot.def.role,
              type: slot.def.type,
              rarityName: slot.def.type === 'heal' ? 'Consumable' : slot.rarity.name,
              rarityColor: slot.def.type === 'heal' ? '#38bdf8' : slot.rarity.color,
              ammo: slot.ammo ?? 1,
              mag: slot.def.type === 'gun' ? slot.def.mag : 1,
              ammoType: slot.def.type === 'gun' ? slot.def.ammoType : undefined,
              reserveAmmo: slot.def.type === 'gun' ? (this.player.ammo[slot.def.ammoType] ?? 0) : undefined,
            }
          : null,
      ),
      ammoBag: { ...this.player.ammo },
      noAmmoHint: this.player.noAmmoHintTimer > 0,
      backpackOpen: this.backpackOpen,
      interactText: this.getInteractText(),
      sniperScope: isSniperAds,
      reloadPct:
        this.player.reloading > 0
          ? Math.min(100, (1 - this.player.reloading / this.player.reloadTotal) * 100)
          : null,
      actionText,
      actionPct,
      killFeed: this.killFeed,
      bigMapOpen: this.bigMapOpen,
      activePingText: this.squadPingText,
    });
  }

  // =========================================================================
  // MULTIPLAYER & PARTY SYNC HELPERS
  // =========================================================================

  private triggerPlayerPing(): void {
    _projRaycaster.setFromCamera(_center2D, this.camera);
    _projRaycaster.far = 260;
    const hits = _projRaycaster.intersectObjects(this.colliderMeshes, false);
    let px = 0;
    let py = 0;
    let pz = 0;
    if (hits.length > 0 && hits[0].distance > 2.2) {
      px = hits[0].point.x;
      py = hits[0].point.y;
      pz = hits[0].point.z;
    } else {
      const target = _projRaycaster.ray.origin.clone().addScaledVector(_projRaycaster.ray.direction, 45);
      px = THREE.MathUtils.clamp(target.x, -HALF_MAP + 6, HALF_MAP - 6);
      pz = THREE.MathUtils.clamp(target.z, -HALF_MAP + 6, HALF_MAP - 6);
      py = Math.max(-0.1, getTerrainHeight(px, pz));
    }
    const poiName = getCurrentPoiName(px, pz);
    const label = `Squad Ping · ${poiName}`;
    this.spawnSquadPingMarker(px, py, pz, this.localTeamId, label);
    this.sound.play('ping');
    for (const ally of this.bots) {
      if (!ally.alive || !isFriendlyTarget(ally.squadId, this.localTeamId)) continue;
      ally.alertTimer = Math.max(ally.alertTimer, 10);
      ally.alertTargetX = px;
      ally.alertTargetZ = pz;
      ally.moveTargetX = px;
      ally.moveTargetZ = pz;
      ally.retargetTimer = 0.25;
    }
    if (this.launchConfig && this.mpClient) {
      this.mpClient.send('ping:create', { x: px, y: py, z: pz, label, kind: 'location' });
    }
    this.emitHud();
  }

  private spawnSquadPingMarker(x: number, y: number, z: number, teamId: number, label: string): void {
    const pingMesh = createTacticalPingMarker();
    pingMesh.position.set(x, y + 0.12, z);
    this.matchEntitiesGroup.add(pingMesh);
    this.activePings.push({
      mesh: pingMesh,
      x,
      y: y + 0.12,
      z,
      ttl: 6.5,
      maxTtl: 6.5,
      squadId: teamId,
    });
    if (isFriendlyTarget(teamId, this.localTeamId)) {
      this.squadPingText = label;
      this.squadPingTextTimer = 4.2;
    }
  }

  private sendLocalPlayerState(): void {
    if (!this.mpClient || !this.launchConfig) return;
    const activeItem = this.player.slots[this.player.activeSlot];
    const activeWeaponId = this.player.pickaxeEquipped ? 'pickaxe' : (activeItem?.def.id ?? 'pickaxe');
    const activeRarityHex = activeItem ? activeItem.rarity.hex : 0x38bdf8;
    const speed = Math.hypot(this.player.vx, this.player.vz);
    this.mpClient.send('player:state', {
      x: this.player.x,
      y: this.player.y,
      z: this.player.z,
      yaw: this.player.yaw + Math.PI,
      pitch: this.player.pitch,
      speed,
      crouch: this.player.isCrouching,
      slide: this.player.isSliding,
      glider: this.player.isGliding,
      skydiving: this.player.isSkydiving,
      inBus: this.player.inBattleBus,
      knocked: this.player.knocked,
      activeWeaponId,
      activeRarityHex,
      emoteId: this.player.emoteTimer > 0 ? this.equippedEmote : null,
      healing: this.player.healing > 0,
      hp: Math.round(this.player.knocked ? this.player.dbnoHp : this.player.hp),
      shield: Math.round(this.player.shield),
    });
  }

  private updateRemoteHumans(dt: number): void {
    for (const rh of this.remoteHumans.values()) {
      if (!rh.alive) {
        if (rh.dyingTimer > 0) {
          rh.dyingTimer -= dt;
          rh.rig.animate(dt, { isDead: true, deathProgress: Math.min(1, 1 - rh.dyingTimer / 0.85) });
          if (rh.dyingTimer <= 0) this.matchEntitiesGroup.remove(rh.rig.root);
        }
        continue;
      }
      if (rh.inBattleBus) {
        rh.rig.root.visible = false;
        continue;
      }
      rh.rig.root.visible = true;
      const alpha = Math.min(1, dt * 16);
      rh.x = THREE.MathUtils.lerp(rh.x, rh.targetX, alpha);
      rh.y = THREE.MathUtils.lerp(rh.y, rh.targetY, alpha);
      rh.z = THREE.MathUtils.lerp(rh.z, rh.targetZ, alpha);
      rh.yaw = rh.targetYaw;
      if (rh.emoteTimer > 0) rh.emoteTimer = Math.max(0, rh.emoteTimer - dt);

      rh.rig.root.position.set(rh.x, rh.y, rh.z);
      rh.rig.root.rotation.y = rh.yaw;
      rh.rig.animate(dt, {
        speed: rh.speed,
        isKnocked: rh.knocked,
        isCrouching: rh.isCrouching,
        isSliding: rh.isSliding,
        isSkydiving: rh.isSkydiving && !rh.isGliding,
        isGliding: rh.isGliding,
        onGround: !rh.isSkydiving,
        healing: rh.healing ? 1 : 0,
        emoteTimer: rh.emoteTimer,
        emoteId: rh.emoteId ?? 'boogie',
        pitch: rh.pitch,
      });
      rh.rig.root.updateMatrixWorld(true);
    }
  }

  public handleRemoteJump(data: { playerId: string; x: number; y: number; z: number; yaw: number }): void {
    const rh = this.remoteHumans.get(data.playerId);
    if (!rh) return;
    rh.inBattleBus = false;
    rh.isSkydiving = true;
    rh.isGliding = false;
    rh.x = rh.targetX = data.x;
    rh.y = rh.targetY = data.y;
    rh.z = rh.targetZ = data.z;
    rh.yaw = rh.targetYaw = data.yaw + Math.PI;
    rh.rig.root.visible = true;
    rh.rig.root.position.set(rh.x, rh.y, rh.z);
    _v1.set(rh.x, rh.y, rh.z);
    this.spawnBurstParticles(_v1, 0xe0f2fe, 8, 5);
  }

  public handleRemotePlayerState(data: RemotePlayerSnapshot): void {
    const rh = this.remoteHumans.get(data.playerId);
    if (!rh) return;
    rh.targetX = data.x;
    rh.targetY = data.y;
    rh.targetZ = data.z;
    rh.targetYaw = data.yaw;
    rh.pitch = data.pitch;
    rh.speed = data.speed;
    rh.isCrouching = data.crouch;
    rh.isSliding = data.slide;
    rh.isGliding = data.glider;
    rh.isSkydiving = data.skydiving;
    rh.inBattleBus = data.inBus;
    rh.healing = data.healing;
    rh.knocked = Boolean(data.knocked);
    rh.hp = data.hp;
    rh.shield = data.shield;
    rh.alive = data.alive;
    if (data.activeWeaponId && rh.activeWeaponId !== data.activeWeaponId) {
      rh.activeWeaponId = data.activeWeaponId;
      rh.rig.setWeaponModel(data.activeWeaponId as WeaponId);
    }
    if (data.emoteId) {
      rh.emoteId = data.emoteId as EmoteId;
      rh.emoteTimer = 0.6;
    }
  }

  public handleRemoteShot(data: RemoteShotEvent): void {
    const origin = new THREE.Vector3(data.muzzle[0], data.muzzle[1], data.muzzle[2]);
    const target = new THREE.Vector3(data.end[0], data.end[1], data.end[2]);
    const dir = target.sub(origin);
    if (dir.lengthSq() < 1e-4) return;
    dir.normalize();
    const rh = this.remoteHumans.get(data.shooterId);
    const mat = this.getBasicMat(data.rarityHex || 0xfef08a);
    const tracer = new THREE.Mesh(this.sharedBulletGeo, mat);
    tracer.position.copy(origin);
    _v1.copy(origin).add(dir);
    tracer.lookAt(_v1);
    this.matchEntitiesGroup.add(tracer);
    this.projectiles.push({
      mesh: tracer,
      pos: origin,
      vel: dir.multiplyScalar(220),
      damage: 0, // visual tracer only; shooter already sends authoritative player:hit
      headMult: 1,
      shotId: 0,
      fromPlayer: false,
      ownerName: rh?.name ?? 'Player',
      ownerSquadId: rh?.teamId ?? -1,
      weaponName: data.weaponId,
      spawnX: origin.x,
      spawnY: origin.y,
      spawnZ: origin.z,
      life: 0.38,
      gravity: 0,
      bulletRadius: 0.08,
    });
    if (Math.hypot(origin.x - this.player.x, origin.z - this.player.z) < 75) {
      const gunSoundMap: Record<string, SoundKind> = {
        ar: 'shoot_ar',
        smg: 'shoot_smg',
        pump: 'shoot_pump',
        tac: 'shoot_tac',
        sniper: 'shoot_sniper',
      };
      this.sound.play(gunSoundMap[data.weaponId] ?? 'shoot_ar');
    }
  }

  public handleCombatantDamaged(data: CombatantDamagedEvent): void {
    if (this.mode !== 'playing') return;
    const isLocalTarget = data.targetId === this.localPlayerId;
    const isLocalAttacker = data.attackerId === this.localPlayerId;
    const wasKnockedEvent = Boolean(data.knocked || data.targetKnocked);

    if (isLocalTarget) {
      const hadShield = this.player.shield > 0;
      if (wasKnockedEvent && !this.player.knocked) {
        this.player.knocked = true;
        this.player.hp = 0;
        this.player.shield = 0;
        this.player.dbnoHp = data.hp || 100;
        this.player.isAiming = false;
        this.player.healing = 0;
        this.player.reloading = 0;
        this.playerChestSearch = null;
        this.playerReviveChannel = null;
        this.playerRebootChannel = null;
        this.mouseDownLeft = false;
        this.killFeed = [`${data.attackerName} knocked You`, ...this.killFeed].slice(0, 5);
      } else if (this.player.knocked) {
        this.player.dbnoHp = data.hp;
      } else {
        this.player.hp = data.hp;
        this.player.shield = data.shield;
      }
      this.player.hitFlinchTimer = 0.2;
      if (hadShield && data.shield === 0) this.sound.play('shieldBreak');
      this.player.lastDamager = {
        name: data.attackerName,
        weaponName: data.weaponName,
        distanceM: Math.max(1, Math.round(data.distanceM)),
      };
      this.cameraTrauma = Math.min(1, this.cameraTrauma + Math.min(0.45, data.damage / 60));
      this.callbacks.onDamageFlash();
      if (data.eliminated) {
        this.handleLocalPlayerEliminated(data.attackerName, data.weaponName, data.distanceM);
      }
      this.emitHud();
      return;
    }

    const rh = this.remoteHumans.get(data.targetId);
    if (rh) {
      if (wasKnockedEvent && !rh.knocked) {
        rh.knocked = true;
        rh.hp = data.hp || 100;
        rh.shield = 0;
        this.killFeed = [`${data.attackerName} knocked ${data.targetName}`, ...this.killFeed].slice(0, 5);
      } else {
        rh.hp = data.hp;
        rh.shield = data.shield;
      }
      rh.rig.setHitFlash(true);
      window.setTimeout(() => rh.rig.setHitFlash(false), 70);
      if (data.eliminated) {
        rh.alive = false;
        rh.knocked = false;
        rh.dyingTimer = 0.85;
        if (isLocalAttacker) {
          this.player.kills = Math.max(this.player.kills + 1, data.attackerKills);
        }
        this.killFeed = [`${data.attackerName} eliminated ${data.targetName}`, ...this.killFeed].slice(0, 5);
        const wipedSet = new Set(data.squadWipedIds ?? []);
        if (!wipedSet.has(rh.id) && isFriendlyTarget(rh.teamId, this.localTeamId) && this.hasLivingFriendlyTeammate()) {
          this.spawnRebootCardEntity(rh.id, rh.name, rh.teamId, true, rh.skinId, rh.x, rh.y, rh.z);
        }
      }
      if (data.squadWipedIds) {
        for (const wid of data.squadWipedIds) {
          if (wid === this.localPlayerId && this.player.alive) {
            this.handleLocalPlayerEliminated(data.attackerName, data.weaponName, data.distanceM);
          } else {
            const wRh = this.remoteHumans.get(wid);
            if (wRh && wRh.alive) {
              wRh.alive = false;
              wRh.knocked = false;
              wRh.dyingTimer = 0.85;
            }
            const wBot = this.botById.get(wid);
            if (wBot && wBot.alive) {
              wBot.alive = false;
              wBot.knocked = false;
              wBot.dyingTimer = 0.85;
            }
          }
        }
      }
      this.emitHud();
      return;
    }

    const bot = this.botById.get(data.targetId);
    if (bot) {
      const prevShield = bot.shield;
      if (wasKnockedEvent && !bot.knocked) {
        bot.knocked = true;
        bot.hp = 0;
        bot.shield = 0;
        bot.dbnoHp = data.hp || 100;
        this.killFeed = [`${data.attackerName} knocked ${bot.name}`, ...this.killFeed].slice(0, 5);
      } else if (bot.knocked) {
        bot.dbnoHp = data.hp;
      } else {
        bot.hp = data.hp;
        bot.shield = data.shield;
      }
      bot.hitFlashTimer = 0.07;
      bot.hitFlinchTimer = 0.2;
      bot.rig.setHitFlash(true);
      if (isLocalAttacker && prevShield > 0 && data.shield === 0) {
        this.sound.play('shieldBreak');
      }
      if (data.eliminated && bot.alive) {
        bot.alive = false;
        bot.knocked = false;
        bot.dyingTimer = 0.85;
        bot.deathProgress = 0;
        if (bot.telegraphLine) bot.telegraphLine.visible = false;
        if (isLocalAttacker) {
          this.player.kills = Math.max(this.player.kills + 1, data.attackerKills);
          this.hitstopTimer = Math.max(this.hitstopTimer, 0.045);
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.35);
          this.killFeed = [`You eliminated ${bot.name}`, ...this.killFeed].slice(0, 5);
        } else {
          this.killFeed = [`${data.attackerName} eliminated ${bot.name}`, ...this.killFeed].slice(0, 5);
        }
        const wipedSet = new Set(data.squadWipedIds ?? []);
        if (!wipedSet.has(bot.id) && isFriendlyTarget(bot.squadId, this.localTeamId) && this.hasLivingFriendlyTeammate()) {
          this.spawnRebootCardEntity(bot.id, bot.name, bot.squadId, false, bot.skinId, bot.x, bot.y, bot.z);
        }
      }
      if (data.squadWipedIds) {
        for (const wid of data.squadWipedIds) {
          if (wid === this.localPlayerId && this.player.alive) {
            this.handleLocalPlayerEliminated(data.attackerName, data.weaponName, data.distanceM);
          } else {
            const wBot = this.botById.get(wid);
            if (wBot && wBot.alive) {
              wBot.alive = false;
              wBot.knocked = false;
              wBot.dyingTimer = 0.85;
            }
          }
        }
      }
      this.emitHud();
    }
  }

  public handleReviveCompleted(data: ReviveCompletedEvent): void {
    if (this.mode !== 'playing') return;
    if (data.targetId === this.localPlayerId) {
      this.player.knocked = false;
      this.player.beingRevived = false;
      this.player.hp = data.hp;
      this.player.shield = data.shield;
      this.player.dbnoHp = 100;
      this.sound.play('heal');
      this.killFeed = [`${data.reviverName} revived You`, ...this.killFeed].slice(0, 5);
    } else {
      const rh = this.remoteHumans.get(data.targetId);
      if (rh) {
        rh.knocked = false;
        rh.hp = data.hp;
        rh.shield = data.shield;
      }
      const bot = this.botById.get(data.targetId);
      if (bot) {
        bot.knocked = false;
        bot.beingRevived = false;
        bot.hp = data.hp;
        bot.shield = data.shield;
        bot.dbnoHp = 100;
      }
      this.killFeed = [`${data.reviverName} revived ${data.targetName}`, ...this.killFeed].slice(0, 5);
    }
    this.emitHud();
  }

  public handleRebootCardCollected(data: RebootCardCollectedEvent): void {
    if (this.mode !== 'playing') return;
    const idx = this.rebootCards.findIndex((c) => c.id === data.cardPlayerId);
    if (idx >= 0) {
      this.collectRebootCard(idx, true);
    }
  }

  public handleRebootCompleted(data: RebootCompletedEvent): void {
    if (this.mode !== 'playing') return;
    const revivedSet = new Set(data.revivedIds);
    this.heldRebootCards = this.heldRebootCards.filter((c) => !revivedSet.has(c.id));

    if (revivedSet.has(this.localPlayerId)) {
      const rb = computeRebootResult();
      this.player.alive = rb.alive;
      this.player.knocked = rb.knocked;
      this.player.hp = rb.hp;
      this.player.shield = rb.shield;
      this.player.dbnoHp = 100;
      this.player.spectatingId = null;
      this.player.x = data.x;
      this.player.y = data.y + 34;
      this.player.z = data.z;
      this.player.vy = -8;
      this.player.isSkydiving = true;
      this.player.isGliding = true;
      this.player.pickaxeEquipped = true;
      this.player.rig?.setWeaponModel('pickaxe');
      if (this.player.rig) {
        this.player.rig.root.visible = true;
      }
      this.sound.play('glider');
    }

    for (const cid of data.revivedIds) {
      if (cid === this.localPlayerId) continue;
      const rh = this.remoteHumans.get(cid);
      if (rh) {
        rh.alive = true;
        rh.knocked = false;
        rh.hp = 100;
        rh.shield = 0;
        rh.x = rh.targetX = data.x + (Math.random() - 0.5) * 4;
        rh.y = rh.targetY = data.y + 34;
        rh.z = rh.targetZ = data.z + (Math.random() - 0.5) * 4;
        rh.isSkydiving = true;
        rh.isGliding = true;
        rh.dyingTimer = 0;
        rh.rig.root.visible = true;
        this.matchEntitiesGroup.add(rh.rig.root);
      }
      const bot = this.botById.get(cid);
      if (bot) {
        bot.alive = true;
        bot.knocked = false;
        bot.hp = 100;
        bot.shield = 0;
        bot.dbnoHp = 100;
        bot.dyingTimer = 0;
        bot.x = data.x + (Math.random() - 0.5) * 4;
        bot.y = data.y + 34;
        bot.z = data.z + (Math.random() - 0.5) * 4;
        bot.isSkydiving = true;
        bot.isGliding = true;
        bot.rig.root.visible = true;
        this.matchEntitiesGroup.add(bot.rig.root);
      }
    }

    _v1.set(data.x, data.y + 2.5, data.z);
    this.spawnBurstParticles(_v1, 0x38bdf8, 20, 8);
    this.killFeed = [`${data.rebooterName} rebooted squad (${data.revivedIds.length})`, ...this.killFeed].slice(0, 5);
    this.emitHud();
  }

  public handleChestOpened(data: { chestIdx: number; openerId: string }): void {
    if (data.openerId === this.localPlayerId) return;
    const ch = this.chests[data.chestIdx];
    if (ch && !ch.opened) {
      this.openChest(ch, false, 'veteran', true);
    }
  }

  public handleStructureDamaged(data: { structId: number; broken: boolean; hpPct: number }): void {
    const st = this.destructibles[data.structId];
    if (!st || st.broken) return;
    st.hp = Math.max(0, Math.round(st.maxHp * data.hpPct));
    if (data.broken) {
      this.damageDestructible(st, st.hp + 999, false, new THREE.Vector3(st.center.x, st.center.y, st.center.z), true);
    }
  }

  public handlePingCreated(data: SquadPingEvent): void {
    if (data.senderId === this.localPlayerId) return;
    if (!isFriendlyTarget(data.teamId, this.localTeamId)) return;
    this.spawnSquadPingMarker(data.x, data.y, data.z, data.teamId, `${data.senderName}: ${data.label}`);
    this.sound.play('ping');
    this.emitHud();
  }

  public handleBotsSnapshot(data: BotsSnapshotEvent): void {
    if (this.isRoomHost || !this.launchConfig) return;
    if (data.storm) {
      this.storm = { ...data.storm };
    }
    if (typeof data.busProgress === 'number' && data.busProgress > this.player.busProgress) {
      this.player.busProgress = data.busProgress;
    }
    for (const snap of data.bots) {
      const bot = this.botById.get(snap.id);
      if (!bot) continue;
      bot.x = snap.x;
      bot.y = snap.y;
      bot.z = snap.z;
      bot.yaw = snap.yaw;
      bot.hp = snap.hp;
      bot.shield = snap.shield;
      bot.knocked = Boolean(snap.knocked);
      bot.isCrouching = snap.crouch;
      bot.isSkydiving = snap.skydiving;
      bot.isGliding = snap.glider;
      if (snap.activeWeaponId && bot.weapon.def.id !== snap.activeWeaponId) {
        bot.weapon = makeWeaponItem(snap.activeWeaponId as WeaponId);
        bot.rig.setWeaponModel(snap.activeWeaponId as WeaponId);
      }
      if (!snap.alive && bot.alive) {
        bot.alive = false;
        bot.knocked = false;
        bot.dyingTimer = 0.85;
      } else if (snap.alive && !bot.alive) {
        bot.alive = true;
        bot.knocked = Boolean(snap.knocked);
        bot.dyingTimer = 0;
        bot.rig.root.visible = true;
        this.matchEntitiesGroup.add(bot.rig.root);
      }
    }
  }

  public handleMatchVictory(data: { winningTeamId: number }): void {
    if (this.mode !== 'playing') return;
    this.endMatch(isFriendlyTarget(data.winningTeamId, this.localTeamId));
  }

  public handleHostPromoted(): void {
    this.isRoomHost = true;
  }
}
