import { DEFAULT_KEYBINDS, EMOTES, GRAPHICS_PRESETS } from './constants';
import { sanitizePlayerName } from './rules';
import type {
  BotDifficulty,
  EmoteId,
  GameSettings,
  GraphicsQuality,
  KeybindAction,
  KeybindsConfig,
  MatchMode,
  SaveState,
  ShadowQuality,
  TeamMode,
} from './types';

const STORAGE_KEY = 'fortblox_save_v2';

export const RECOMMENDED_SETTINGS: GameSettings = {
  sens: 1.0,
  vol: 0.7,
  invertY: false,
  graphicsQuality: 'high',
  shadowQuality: GRAPHICS_PRESETS.high.shadowQuality,
  renderDistance: GRAPHICS_PRESETS.high.renderDistance,
  muted: false,
  keybinds: { ...DEFAULT_KEYBINDS },
};

export const DEFAULT_SAVE_STATE: SaveState = {
  playerName: 'AgentZero',
  ownedSkins: ['recruit'],
  equippedSkin: 'recruit',
  ownedEmotes: ['boogie'],
  equippedEmote: 'boogie',
  pirateExpiresAt: 0,
  pirateTokenUsed: false,
  teamMode: 'duos',
  fillTeammates: true,
  matchMode: 'battle_royale',
  botDifficulty: 'normal',
  rankedRp: 350,
  bestRankRp: 350,
  rankedWins: 0,
  brWins: 0,
  settings: { ...RECOMMENDED_SETTINGS },
};

const VALID_GRAPHICS = new Set<GraphicsQuality>(['low', 'medium', 'high', 'ultra']);
const VALID_SHADOWS = new Set<ShadowQuality>(['off', 'low', 'high', 'ultra']);
const VALID_EMOTES = new Set<EmoteId>(EMOTES.map((e) => e.id));
const VALID_MODES = new Set<MatchMode>(['battle_royale', 'ranked']);
const VALID_TEAM_MODES = new Set<TeamMode>(['solo', 'duos', 'trios', 'squads']);
const VALID_DIFFICULTIES = new Set<BotDifficulty>(['easy', 'normal', 'hard', 'extreme']);

export function loadSaveState(): SaveState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = structuredClone(DEFAULT_SAVE_STATE);
      fresh.playerName = `Agent-${Math.floor(100 + Math.random() * 900)}`;
      writeSaveState(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<SaveState> & {
      settings?: Partial<GameSettings> & { shadows?: boolean };
    };
    const owned = Array.isArray(parsed.ownedSkins) ? [...parsed.ownedSkins] : ['recruit'];
    if (!owned.includes('recruit')) owned.push('recruit');

    const ownedEmotes: EmoteId[] = Array.isArray(parsed.ownedEmotes)
      ? parsed.ownedEmotes.filter((e): e is EmoteId => VALID_EMOTES.has(e))
      : ['boogie'];
    if (!ownedEmotes.includes('boogie')) ownedEmotes.push('boogie');

    const equippedEmote: EmoteId =
      typeof parsed.equippedEmote === 'string' && VALID_EMOTES.has(parsed.equippedEmote as EmoteId)
        ? (parsed.equippedEmote as EmoteId)
        : 'boogie';

    const teamMode: TeamMode = VALID_TEAM_MODES.has(parsed.teamMode as TeamMode)
      ? (parsed.teamMode as TeamMode)
      : 'duos';

    const fillTeammates = typeof parsed.fillTeammates === 'boolean' ? parsed.fillTeammates : true;
    const playerName =
      typeof parsed.playerName === 'string' && parsed.playerName.trim().length > 0
        ? sanitizePlayerName(parsed.playerName)
        : DEFAULT_SAVE_STATE.playerName;

    const matchMode: MatchMode = VALID_MODES.has(parsed.matchMode as MatchMode)
      ? (parsed.matchMode as MatchMode)
      : 'battle_royale';

    const botDifficulty: BotDifficulty = VALID_DIFFICULTIES.has(parsed.botDifficulty as BotDifficulty)
      ? (parsed.botDifficulty as BotDifficulty)
      : 'normal';

    const rankedRp =
      typeof parsed.rankedRp === 'number' && Number.isFinite(parsed.rankedRp)
        ? Math.max(0, Math.round(parsed.rankedRp))
        : DEFAULT_SAVE_STATE.rankedRp;

    const bestRankRp =
      typeof parsed.bestRankRp === 'number' && Number.isFinite(parsed.bestRankRp)
        ? Math.max(rankedRp, Math.round(parsed.bestRankRp))
        : rankedRp;

    const rankedWins =
      typeof parsed.rankedWins === 'number' && Number.isFinite(parsed.rankedWins)
        ? Math.max(0, Math.round(parsed.rankedWins))
        : 0;

    const brWins =
      typeof parsed.brWins === 'number' && Number.isFinite(parsed.brWins)
        ? Math.max(0, Math.round(parsed.brWins))
        : 0;

    const rawSettings: Partial<GameSettings> & { shadows?: boolean } = parsed.settings ?? {};
    const graphicsQuality = VALID_GRAPHICS.has(rawSettings.graphicsQuality as GraphicsQuality)
      ? (rawSettings.graphicsQuality as GraphicsQuality)
      : RECOMMENDED_SETTINGS.graphicsQuality;

    let shadowQuality: ShadowQuality = RECOMMENDED_SETTINGS.shadowQuality;
    if (VALID_SHADOWS.has(rawSettings.shadowQuality as ShadowQuality)) {
      shadowQuality = rawSettings.shadowQuality as ShadowQuality;
    } else if (typeof rawSettings.shadows === 'boolean') {
      shadowQuality = rawSettings.shadows ? 'high' : 'off';
    }

    const renderDistance =
      typeof rawSettings.renderDistance === 'number' && Number.isFinite(rawSettings.renderDistance)
        ? Math.max(300, Math.min(1400, rawSettings.renderDistance))
        : RECOMMENDED_SETTINGS.renderDistance;

    const mergedKeybinds: KeybindsConfig = { ...DEFAULT_KEYBINDS };
    if (rawSettings.keybinds && typeof rawSettings.keybinds === 'object') {
      for (const action of Object.keys(DEFAULT_KEYBINDS) as KeybindAction[]) {
        const val = (rawSettings.keybinds as Record<string, unknown>)[action];
        if (typeof val === 'string' && val.trim().length > 0) {
          mergedKeybinds[action] = val.trim();
        }
      }
    }

    return {
      playerName,
      ownedSkins: owned,
      equippedSkin: typeof parsed.equippedSkin === 'string' ? parsed.equippedSkin : 'recruit',
      ownedEmotes,
      equippedEmote,
      pirateExpiresAt: typeof parsed.pirateExpiresAt === 'number' ? parsed.pirateExpiresAt : 0,
      pirateTokenUsed: typeof parsed.pirateTokenUsed === 'boolean' ? parsed.pirateTokenUsed : false,
      teamMode,
      fillTeammates,
      matchMode,
      botDifficulty,
      rankedRp,
      bestRankRp,
      rankedWins,
      brWins,
      settings: {
        sens: typeof rawSettings.sens === 'number' ? rawSettings.sens : RECOMMENDED_SETTINGS.sens,
        vol: typeof rawSettings.vol === 'number' ? rawSettings.vol : RECOMMENDED_SETTINGS.vol,
        invertY: typeof rawSettings.invertY === 'boolean' ? rawSettings.invertY : RECOMMENDED_SETTINGS.invertY,
        muted: typeof rawSettings.muted === 'boolean' ? rawSettings.muted : RECOMMENDED_SETTINGS.muted,
        graphicsQuality,
        shadowQuality,
        renderDistance,
        keybinds: mergedKeybinds,
      },
    };
  } catch {
    return structuredClone(DEFAULT_SAVE_STATE);
  }
}

export function writeSaveState(state: SaveState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}
