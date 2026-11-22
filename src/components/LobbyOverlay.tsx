import { useEffect, useState } from 'react';
import {
  BOT_DIFFICULTY_DEFS,
  DEFAULT_KEYBINDS,
  EMOTES,
  GRAPHICS_PRESETS,
  KEYBIND_ACTION_META,
  RANK_TIERS,
  SKINS,
  TEAM_MODE_DEFS,
} from '../game/constants';
import { formatKeyCodeLabel, getRankFromRp, isPirateTokenActive, updateKeybind } from '../game/rules';
import { RECOMMENDED_SETTINGS } from '../game/storage';
import type {
  BotDifficulty,
  EmoteDef,
  EmoteId,
  GraphicsQuality,
  KeybindAction,
  LobbyTab,
  MatchMode,
  PartyState,
  RarityId,
  SaveState,
  ShadowQuality,
  SkinDef,
  TeamMode,
} from '../game/types';
import { FortbloxEmblem, RankCrestIcon, SkinEmblemIcon } from './GameIcons';

interface LobbyOverlayProps {
  saveState: SaveState;
  activeTab: LobbyTab;
  party: PartyState | null;
  mpConnected: boolean;
  localClientId: string | null;
  partyError: string | null;
  onTabChange: (tab: LobbyTab) => void;
  onEquipSkin: (skinId: string) => void;
  onUnlockSkin: (skinId: string, spendPirateToken: boolean) => void;
  onEquipEmote: (emoteId: EmoteId) => void;
  onUnlockEmote: (emoteId: EmoteId, spendPirateToken: boolean) => void;
  onPreviewSkin: (skinId: string | null) => void;
  onPreviewEmote: (emoteId: EmoteId) => void;
  onSetMatchMode: (mode: MatchMode) => void;
  onSetBotDifficulty: (difficulty: BotDifficulty) => void;
  onSetTeamMode: (mode: TeamMode) => void;
  onSetFillTeammates: (fill: boolean) => void;
  onUpdatePlayerName: (name: string) => void;
  onJoinParty: (code: string) => void;
  onLeaveParty: () => void;
  onCreateParty: () => void;
  onToggleReady: () => void;
  onKickMember: (targetId: string) => void;
  onUpdateSettings: (partial: Partial<SaveState['settings']>) => void;
  onEmote: () => void;
  onStartMatch: () => void;
}

type ShopCategory = 'all' | 'outfits' | 'emotes';
type InspectTarget = { kind: 'skin'; id: string } | { kind: 'emote'; id: EmoteId };

const RARITY_STYLES: Record<RarityId, { accent: string; bgTop: string; bgBottom: string; badge: string }> = {
  common: { accent: '#9ca3af', bgTop: '#475569', bgBottom: '#1e293b', badge: '#94a3b8' },
  uncommon: { accent: '#22c55e', bgTop: '#15803d', bgBottom: '#052e16', badge: '#4ade80' },
  rare: { accent: '#38bdf8', bgTop: '#0369a1', bgBottom: '#082f49', badge: '#38bdf8' },
  epic: { accent: '#a855f7', bgTop: '#7e22ce', bgBottom: '#2e1065', badge: '#c084fc' },
  legendary: { accent: '#f59e0b', bgTop: '#d97706', bgBottom: '#451a03', badge: '#fbbf24' },
  mythic: { accent: '#fde047', bgTop: '#ca8a04', bgBottom: '#422006', badge: '#fef08a' },
};

function formatCountdown(expiresAt: number, nowMs: number): string {
  const rem = Math.max(0, expiresAt - nowMs);
  const hrs = Math.floor(rem / 3600000);
  const mins = Math.floor((rem % 3600000) / 60000);
  const secs = Math.floor((rem % 60000) / 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getDailyShopCountdown(nowMs: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const rem = dayMs - (nowMs % dayMs);
  return formatCountdown(nowMs + rem, nowMs);
}

export function LobbyOverlay({
  saveState,
  activeTab,
  party,
  mpConnected,
  localClientId,
  partyError,
  onTabChange,
  onEquipSkin,
  onUnlockSkin,
  onEquipEmote,
  onUnlockEmote,
  onPreviewSkin,
  onPreviewEmote,
  onSetMatchMode,
  onSetBotDifficulty,
  onSetTeamMode,
  onSetFillTeammates,
  onUpdatePlayerName,
  onJoinParty,
  onLeaveParty,
  onCreateParty,
  onToggleReady,
  onKickMember,
  onUpdateSettings,
  onEmote,
  onStartMatch,
}: LobbyOverlayProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [shopCategory, setShopCategory] = useState<ShopCategory>('all');
  const [inspectTarget, setInspectTarget] = useState<InspectTarget | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [nameDraft, setNameDraft] = useState(saveState.playerName);
  const [rebindingAction, setRebindingAction] = useState<KeybindAction | null>(null);

  const shopSkins = SKINS.filter((s) => !s.defaultOwned);
  const shopEmotes = EMOTES.filter((e) => !e.defaultOwned);

  useEffect(() => {
    setNameDraft(saveState.playerName);
  }, [saveState.playerName]);

  useEffect(() => {
    if (activeTab !== 'settings') {
      setRebindingAction(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!rebindingAction) {
      delete document.body.dataset.rebinding;
      return;
    }
    document.body.dataset.rebinding = '1';
    const onKeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRebindingAction(null);
        return;
      }
      if (!e.code) return;
      onUpdateSettings({
        keybinds: updateKeybind(saveState.settings.keybinds, rebindingAction, e.code),
      });
      setRebindingAction(null);
    };
    window.addEventListener('keydown', onKeyCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyCapture, true);
      delete document.body.dataset.rebinding;
    };
  }, [rebindingAction, saveState.settings.keybinds, onUpdateSettings]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (activeTab !== 'shop') {
      setInspectTarget(null);
      onPreviewSkin(null);
      return;
    }
    if (inspectTarget?.kind === 'skin') {
      onPreviewSkin(inspectTarget.id);
    } else {
      onPreviewSkin(null);
    }
  }, [activeTab, inspectTarget, onPreviewSkin]);

  const kb = saveState.settings.keybinds ?? DEFAULT_KEYBINDS;
  const kMoveStr = `${formatKeyCodeLabel(kb.forward)}${formatKeyCodeLabel(kb.left)}${formatKeyCodeLabel(kb.backward)}${formatKeyCodeLabel(kb.right)}`;
  const kSlideStr = `${formatKeyCodeLabel(kb.sprint)}+${formatKeyCodeLabel(kb.forward)}+${formatKeyCodeLabel(kb.crouch)}`;
  const kJumpStr = formatKeyCodeLabel(kb.jump);
  const kInteractStr = formatKeyCodeLabel(kb.interact);
  const kPingStr = formatKeyCodeLabel(kb.ping);
  const kEmoteStr = formatKeyCodeLabel(kb.emote);
  const kBagStr = formatKeyCodeLabel(kb.backpack);
  const kAxeStr = formatKeyCodeLabel(kb.pickaxe);

  const pirateActive = isPirateTokenActive(saveState.pirateExpiresAt, nowMs);
  const equippedSkinObj = SKINS.find((s) => s.id === saveState.equippedSkin) || SKINS[0];
  const equippedEmoteObj = EMOTES.find((e) => e.id === saveState.equippedEmote) || EMOTES[0];
  const rankInfo = getRankFromRp(saveState.rankedRp);
  const diffDef = BOT_DIFFICULTY_DEFS[saveState.botDifficulty];
  const teamDef = TEAM_MODE_DEFS[saveState.teamMode];

  const isLeader = !party || !localClientId || party.leaderId === localClientId;
  const partyMembers = party?.members ?? [];
  const isInMultiParty = partyMembers.length > 1;
  const localMember = partyMembers.find((m) => m.id === localClientId) ?? null;
  const startBlockedByLeader = isInMultiParty && !isLeader;

  const handleCopyInviteLink = () => {
    if (!party?.code) return;
    const url = `${window.location.origin}/?party=${encodeURIComponent(party.code)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  const commitNameDraft = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== saveState.playerName) {
      onUpdatePlayerName(trimmed);
    } else if (!trimmed) {
      setNameDraft(saveState.playerName);
    }
  };

  const featuredIds = new Set(['galaxy', 'mecha_titan', 'solar_paladin', 'cyber_ronin', 'pirate', 'goldman']);
  const featuredSkins = shopSkins.filter((s) => featuredIds.has(s.id));
  const dailySkins = shopSkins.filter((s) => !featuredIds.has(s.id));

  const tabs: Array<{ id: LobbyTab; label: string }> = [
    { id: 'play', label: 'Play' },
    { id: 'locker', label: 'Locker' },
    { id: 'shop', label: 'Item Shop' },
    { id: 'ranked', label: 'Ranked' },
    { id: 'settings', label: 'Settings' },
  ];

  const openSkinInspect = (skinId: string) => {
    setInspectTarget({ kind: 'skin', id: skinId });
    onPreviewSkin(skinId);
  };

  const openEmoteInspect = (emoteId: EmoteId) => {
    setInspectTarget({ kind: 'emote', id: emoteId });
    onPreviewEmote(emoteId);
  };

  const renderSkinCard = (skin: SkinDef, isFeatured: boolean) => {
    const owned = saveState.ownedSkins.includes(skin.id) || (skin.pirateExclusive && pirateActive);
    const equipped = saveState.equippedSkin === skin.id;
    const locked = Boolean(skin.pirateExclusive && !pirateActive && !owned);
    const style = RARITY_STYLES[skin.rarity];

    return (
      <button
        key={skin.id}
        type="button"
        onClick={() => openSkinInspect(skin.id)}
        className={`group relative overflow-hidden rounded-lg text-left flex flex-col justify-between transition-all cursor-pointer border-2 border-white/15 hover:border-[#fde047] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(250,204,21,0.28)] ${
          isFeatured ? 'h-56' : 'h-48'
        } ${locked ? 'opacity-85' : ''}`}
        style={{
          background: `radial-gradient(circle at 50% 35%, ${style.bgTop}, ${style.bgBottom} 82%)`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            background: 'linear-gradient(125deg, transparent 30%, rgba(255,255,255,0.45) 48%, transparent 65%)',
          }}
        />
        <div className="relative z-10 flex items-center justify-between px-3 pt-2.5">
          <span
            className="text-[10px] font-display font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-950/75"
            style={{ color: style.badge }}
          >
            {skin.rarity} · Outfit
          </span>
          {equipped && (
            <span className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded bg-[#fde047] text-slate-950">
              Equipped
            </span>
          )}
          {!equipped && owned && (
            <span className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950">
              Owned
            </span>
          )}
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="transition-transform duration-200 group-hover:scale-110">
            <SkinEmblemIcon icon={skin.icon} className={isFeatured ? 'w-16 h-16' : 'w-12 h-12'} />
          </div>
        </div>

        <div className="relative z-10 bg-slate-950/92 px-3.5 py-2.5 border-t-4" style={{ borderColor: style.accent }}>
          <div className={`font-display font-bold uppercase tracking-wide text-white truncate ${isFeatured ? 'text-base' : 'text-xs'}`}>
            {skin.name}
          </div>
          <div className="flex items-center justify-between mt-1 text-xs font-bold">
            {locked ? (
              <span className="text-amber-300">Pirate Chest Token</span>
            ) : owned ? (
              <span className="text-emerald-300">{equipped ? 'Active Outfit' : 'Inspect Outfit'}</span>
            ) : pirateActive ? (
              <span className="text-amber-300">FREE · UNLIMITED PASS</span>
            ) : (
              <span className="text-sky-300 flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-3.5 rounded-full bg-sky-400 text-slate-950 text-[9px] font-black leading-[14px] text-center">
                  V
                </span>
                {skin.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderEmoteCard = (emote: EmoteDef) => {
    const owned = saveState.ownedEmotes.includes(emote.id);
    const equipped = saveState.equippedEmote === emote.id;
    const style = RARITY_STYLES[emote.rarity];

    return (
      <button
        key={emote.id}
        type="button"
        onClick={() => openEmoteInspect(emote.id)}
        className="group relative overflow-hidden rounded-lg text-left flex flex-col justify-between transition-all cursor-pointer border-2 border-white/15 hover:border-sky-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(56,189,248,0.28)] h-44"
        style={{
          background: `radial-gradient(circle at 50% 35%, ${style.bgTop}, ${style.bgBottom} 82%)`,
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            background: 'linear-gradient(125deg, transparent 30%, rgba(255,255,255,0.45) 48%, transparent 65%)',
          }}
        />
        <div className="relative z-10 flex items-center justify-between px-3 pt-2.5">
          <span
            className="text-[10px] font-display font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-950/75"
            style={{ color: style.badge }}
          >
            {emote.rarity} · Emote
          </span>
          {equipped && (
            <span className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded bg-[#fde047] text-slate-950">
              Equipped
            </span>
          )}
          {!equipped && owned && (
            <span className="text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded bg-emerald-400 text-slate-950">
              Owned
            </span>
          )}
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center">
          <div className="transition-transform duration-200 group-hover:scale-110">
            <SkinEmblemIcon icon={emote.icon} className="w-12 h-12" />
          </div>
        </div>

        <div className="relative z-10 bg-slate-950/92 px-3.5 py-2 border-t-4" style={{ borderColor: style.accent }}>
          <div className="font-display text-xs font-bold uppercase tracking-wide text-white truncate">
            {emote.name}
          </div>
          <div className="flex items-center justify-between mt-1 text-xs font-bold">
            {owned ? (
              <span className="text-emerald-300">{equipped ? 'Active Dance' : 'Preview & Equip'}</span>
            ) : pirateActive ? (
              <span className="text-amber-300">FREE · UNLIMITED PASS</span>
            ) : (
              <span className="text-sky-300 flex items-center gap-1.5">
                <span className="inline-block w-3.5 h-3.5 rounded-full bg-sky-400 text-slate-950 text-[9px] font-black leading-[14px] text-center">
                  V
                </span>
                {emote.price.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const inspectedSkin = inspectTarget?.kind === 'skin' ? SKINS.find((s) => s.id === inspectTarget.id) ?? null : null;
  const inspectedEmote = inspectTarget?.kind === 'emote' ? EMOTES.find((e) => e.id === inspectTarget.id) ?? null : null;

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none"
      style={{
        background:
          activeTab === 'shop' && !inspectTarget
            ? 'radial-gradient(circle at 50% 32%, rgba(23, 55, 130, 0.92), rgba(7, 13, 35, 0.96) 78%)'
            : activeTab === 'shop' && inspectTarget
              ? 'linear-gradient(90deg, rgba(6, 12, 34, 0.86) 0%, rgba(6, 12, 34, 0.35) 55%, rgba(6, 12, 34, 0.12) 100%)'
              : 'radial-gradient(circle at 50% 52%, rgba(15, 23, 42, 0.02) 26%, rgba(5, 10, 30, 0.68) 100%)',
      }}
    >
      {/* Top Fortnite Chapter Navigation Shell */}
      <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 px-7 py-3 bg-[#060d24]/92 border-b border-white/15">
        <FortbloxEmblem className="w-48 h-10 shrink-0" />

        <div className="flex items-center gap-1.5" role="tablist" aria-label="Lobby Views">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.id)}
                className={`px-4 py-2 text-xs font-display font-black uppercase tracking-widest cursor-pointer transition-all whitespace-nowrap shrink-0 -skew-x-6 border-b-2 ${
                  active
                    ? 'bg-[#facc15] text-slate-950 border-white shadow-[0_0_16px_rgba(250,204,21,0.35)]'
                    : 'bg-white/5 text-slate-200 border-transparent hover:bg-white/15 hover:text-white'
                }`}
              >
                <span className="inline-block skew-x-6">{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs font-bold whitespace-nowrap shrink-0">
          <button
            type="button"
            onClick={() => onTabChange('ranked')}
            className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90"
            title="View Ranked Progression"
          >
            <RankCrestIcon color={rankInfo.current.color} accent={rankInfo.current.accent} className="w-7 h-7" />
            <div className="leading-tight">
              <div className="font-display text-[11px] font-black uppercase tracking-wider" style={{ color: rankInfo.current.color }}>
                {rankInfo.current.name}
              </div>
              <div className="font-mono-num text-[11px] text-slate-300">{saveState.rankedRp.toLocaleString()} RP</div>
            </div>
          </button>

          <span className="text-slate-600" aria-hidden="true">
            |
          </span>

          <div className="text-right leading-tight">
            <div className={pirateActive ? 'text-amber-300 font-bold text-[11px]' : 'text-sky-300 font-bold text-[11px]'}>
              {pirateActive
                ? `PIRATE PASS · ${formatCountdown(saveState.pirateExpiresAt, nowMs)}`
                : 'V-BUCKS · UNLIMITED'}
            </div>
            <div className="text-[10px] text-slate-400">
              {pirateActive ? 'Unlimited Free Shop Active' : 'Pirate Token 1/10 Chests'}
            </div>
          </div>
        </div>
      </div>

      {/* Center Stage / Tab Panels */}
      <div className="flex-1 flex items-end justify-between px-7 py-5 pointer-events-none overflow-hidden">
        {activeTab === 'play' && (
          <div className="w-full flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
            {/* Left Column: Multiplayer Party Roster + Active Loadout (Center stays wide open for 3D squad showcase) */}
            <div className="pointer-events-auto w-full max-w-sm flex flex-col gap-2.5">
              {/* Squad & Party Card */}
              <div
                data-party-card="true"
                className="bg-[#070f28]/92 border-l-4 border-[#facc15] rounded-r-lg p-3.5 shadow-2xl flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs font-black uppercase tracking-widest text-[#fde047]">
                      Squad Lobby
                    </span>
                    <span
                      className={`text-[9px] font-display font-bold uppercase px-1.5 py-0.5 rounded ${
                        mpConnected
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                          : 'bg-slate-800 text-slate-400 border border-white/10'
                      }`}
                    >
                      {mpConnected ? 'Online' : 'Solo Offline'}
                    </span>
                  </div>

                  {party?.code && (
                    <div className="flex items-center gap-1.5">
                      <span
                        data-party-code={party.code}
                        className="font-mono-num text-[11px] font-black tracking-wider px-2 py-0.5 rounded bg-slate-900 border border-amber-300/45 text-amber-200"
                      >
                        {party.code}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="px-2 py-0.5 rounded bg-sky-500/25 hover:bg-sky-400 hover:text-slate-950 border border-sky-400/50 text-[10px] font-display font-bold uppercase tracking-wider text-sky-100 cursor-pointer transition-colors"
                      >
                        {copiedLink ? 'Copied!' : 'Invite'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Editable Callsign */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={nameDraft}
                    maxLength={16}
                    aria-label="Player Callsign"
                    placeholder="Callsign..."
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={commitNameDraft}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        commitNameDraft();
                        e.currentTarget.blur();
                      }
                    }}
                    className="flex-1 min-w-0 px-2.5 py-1 rounded bg-slate-950/90 border border-white/15 focus:border-sky-400 outline-none text-xs font-bold text-white"
                  />
                  <button
                    type="button"
                    onClick={commitNameDraft}
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-display font-bold uppercase tracking-wider text-slate-200 cursor-pointer shrink-0"
                  >
                    Set Name
                  </button>
                </div>

                {/* Party Roster (1-4 Members) */}
                <div className="flex flex-col gap-1 max-h-28 overflow-y-auto custom-scroll">
                  {(partyMembers.length > 0
                    ? partyMembers
                    : [
                        {
                          id: 'local',
                          name: saveState.playerName,
                          skinId: saveState.equippedSkin,
                          emoteId: saveState.equippedEmote,
                          ready: true,
                          isLeader: true,
                        },
                      ]
                  ).map((member) => {
                    const isSelf = member.id === localClientId || member.id === 'local';
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-slate-950/75 border border-white/10 text-xs"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {member.isLeader && (
                            <span className="text-[10px] text-[#facc15] font-black" title="Party Leader">
                              ★
                            </span>
                          )}
                          <span className="font-bold text-white truncate">
                            {member.name}
                            {isSelf ? ' (You)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`text-[9px] font-display font-black uppercase px-1.5 py-0.5 rounded ${
                              member.ready ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {member.ready ? 'Ready' : 'Wait'}
                          </span>
                          {isLeader && !isSelf && member.id !== 'local' && (
                            <button
                              type="button"
                              aria-label={`Kick ${member.name}`}
                              onClick={() => onKickMember(member.id)}
                              className="w-4 h-4 rounded bg-rose-500/25 hover:bg-rose-500 text-rose-200 hover:text-white text-[10px] font-black leading-none cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Join Code + Ready / Leave Actions */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={joinCodeInput}
                    maxLength={10}
                    aria-label="Join Party Code"
                    placeholder="Join code (FBX-XXXX)"
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && joinCodeInput.trim()) {
                        onJoinParty(joinCodeInput.trim());
                        setJoinCodeInput('');
                      }
                    }}
                    className="flex-1 min-w-0 px-2.5 py-1 rounded bg-slate-950/90 border border-white/15 focus:border-[#facc15] outline-none font-mono-num text-[11px] font-bold text-white uppercase"
                  />
                  <button
                    type="button"
                    disabled={!mpConnected || !joinCodeInput.trim()}
                    onClick={() => {
                      if (!joinCodeInput.trim()) return;
                      onJoinParty(joinCodeInput.trim());
                      setJoinCodeInput('');
                    }}
                    className="px-2.5 py-1 rounded bg-[#facc15] disabled:bg-slate-700 disabled:text-slate-400 hover:bg-[#fde047] text-slate-950 text-[10px] font-display font-black uppercase tracking-wider cursor-pointer shrink-0"
                  >
                    Join
                  </button>
                  {isInMultiParty ? (
                    <>
                      <button
                        type="button"
                        onClick={onToggleReady}
                        className={`px-2.5 py-1 rounded text-[10px] font-display font-black uppercase tracking-wider cursor-pointer shrink-0 ${
                          localMember?.ready
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-sky-500/25 border border-sky-400 text-sky-100'
                        }`}
                      >
                        {localMember?.ready ? 'Ready ✓' : 'Ready'}
                      </button>
                      <button
                        type="button"
                        onClick={onLeaveParty}
                        className="px-2 py-1 rounded bg-rose-500/25 hover:bg-rose-500 text-rose-200 hover:text-white text-[10px] font-display font-bold uppercase tracking-wider cursor-pointer shrink-0"
                      >
                        Leave
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!mpConnected}
                      onClick={onCreateParty}
                      className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 text-slate-200 text-[10px] font-display font-bold uppercase tracking-wider cursor-pointer shrink-0"
                    >
                      New Code
                    </button>
                  )}
                </div>

                {partyError && (
                  <div className="px-2.5 py-1 rounded bg-rose-950/85 border border-rose-400/50 text-[11px] font-semibold text-rose-200">
                    {partyError}
                  </div>
                )}
              </div>

              {/* Active Loadout & Compact Controls Card */}
              <div className="bg-[#070f28]/88 border-l-4 border-sky-400 rounded-r-lg p-3.5 shadow-2xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-sky-300">
                      Active Loadout
                    </div>
                    <div className="font-display text-base font-black uppercase tracking-wide text-white">
                      {equippedSkinObj.name}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onEmote}
                    className="px-3 py-1.5 bg-sky-500/20 hover:bg-sky-400 hover:text-slate-950 border border-sky-400/70 text-sky-100 text-[11px] font-display font-bold uppercase tracking-wider cursor-pointer transition-colors -skew-x-6 shrink-0"
                  >
                    <span className="inline-block skew-x-6">
                      Emote [{kEmoteStr}]: {equippedEmoteObj.name}
                    </span>
                  </button>
                </div>

                <div className="border-t border-white/10 pt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
                  <span>
                    <strong className="text-white">{kMoveStr}</strong> Move / Swim
                  </span>
                  <span>
                    <strong className="text-amber-300">{kSlideStr}</strong> Slide
                  </span>
                  <span>
                    <strong className="text-white">
                      {kJumpStr} / {kInteractStr}
                    </strong>{' '}
                    Drop / Interact
                  </span>
                  <span>
                    <strong className="text-white">
                      {kPingStr} / {kEmoteStr}
                    </strong>{' '}
                    Ping / Emote
                  </span>
                  <span>
                    <strong className="text-white">LMB / RMB</strong> Shoot / Aim
                  </span>
                  <span>
                    <strong className="text-white">
                      {kBagStr} / {kAxeStr}
                    </strong>{' '}
                    Bag / Axe
                  </span>
                </div>
              </div>
            </div>

            {/* Right-Bottom Fortnite Mode Card + Team Size + Difficulty Selector + PLAY Button */}
            <div className="pointer-events-auto w-full max-w-sm flex flex-col items-stretch gap-3">
              <div className="bg-[#070f28]/92 border-2 border-white/20 rounded-lg p-4 shadow-2xl flex flex-col gap-3">
                {/* Team Size Selector (Solo / Duos / Trios / Squads) + Fill Toggle */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wider">
                    <span className="text-slate-300">Team Size</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#fde047]">{teamDef.subtitle}</span>
                      {saveState.teamMode !== 'solo' && (
                        <button
                          type="button"
                          disabled={startBlockedByLeader}
                          onClick={() => onSetFillTeammates(!saveState.fillTeammates)}
                          className={`px-2 py-0.5 rounded text-[10px] font-display font-black uppercase border cursor-pointer disabled:opacity-60 ${
                            saveState.fillTeammates
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                              : 'bg-slate-900 border-white/20 text-slate-300'
                          }`}
                        >
                          {saveState.fillTeammates ? 'Fill Squad' : 'No Fill'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Team Size">
                    {(['solo', 'duos', 'trios', 'squads'] as TeamMode[]).map((tm) => {
                      const d = TEAM_MODE_DEFS[tm];
                      const active = saveState.teamMode === tm;
                      return (
                        <button
                          key={tm}
                          type="button"
                          data-team-mode={tm}
                          aria-pressed={active}
                          disabled={startBlockedByLeader}
                          onClick={() => onSetTeamMode(tm)}
                          className={`py-1.5 rounded text-[11px] font-display font-black uppercase tracking-wider cursor-pointer border transition-colors disabled:opacity-65 ${
                            active
                              ? 'bg-[#facc15] text-slate-950 border-[#fef08a]'
                              : 'bg-slate-900/90 text-slate-300 border-white/15 hover:bg-white/10'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Match Mode Switch */}
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Match Mode">
                  <button
                    type="button"
                    data-mode="battle_royale"
                    aria-pressed={saveState.matchMode === 'battle_royale'}
                    disabled={startBlockedByLeader}
                    onClick={() => onSetMatchMode('battle_royale')}
                    className={`py-2 px-3 text-xs font-display font-black uppercase tracking-widest cursor-pointer transition-colors border disabled:opacity-65 ${
                      saveState.matchMode === 'battle_royale'
                        ? 'bg-sky-400 text-slate-950 border-sky-200'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Battle Royale
                  </button>
                  <button
                    type="button"
                    data-mode="ranked"
                    aria-pressed={saveState.matchMode === 'ranked'}
                    disabled={startBlockedByLeader}
                    onClick={() => onSetMatchMode('ranked')}
                    className={`py-2 px-3 text-xs font-display font-black uppercase tracking-widest cursor-pointer transition-colors border flex items-center justify-center gap-1.5 disabled:opacity-65 ${
                      saveState.matchMode === 'ranked'
                        ? 'bg-purple-500 text-white border-purple-300'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10'
                    }`}
                  >
                    <span>Ranked</span>
                    <span className="font-mono-num text-[10px] opacity-90">{rankInfo.current.short}</span>
                  </button>
                </div>

                {saveState.matchMode === 'battle_royale' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-display font-bold uppercase tracking-wider">
                      <span className="text-slate-300">Lobby Difficulty</span>
                      <span style={{ color: diffDef.color }}>{diffDef.label}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Bot Difficulty">
                      {(['easy', 'normal', 'hard', 'extreme'] as BotDifficulty[]).map((diff) => {
                        const d = BOT_DIFFICULTY_DEFS[diff];
                        const active = saveState.botDifficulty === diff;
                        return (
                          <button
                            key={diff}
                            type="button"
                            data-difficulty={diff}
                            aria-pressed={active}
                            disabled={startBlockedByLeader}
                            onClick={() => onSetBotDifficulty(diff)}
                            style={active ? { backgroundColor: d.color, borderColor: '#ffffff' } : undefined}
                            className={`py-1.5 rounded text-[11px] font-display font-black uppercase tracking-wider cursor-pointer border transition-colors disabled:opacity-65 ${
                              active
                                ? 'text-slate-950'
                                : 'bg-slate-900/90 text-slate-300 border-white/15 hover:bg-white/10'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-snug">{diffDef.tagline}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 bg-slate-950/60 border border-purple-400/35 rounded p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <RankCrestIcon
                          color={rankInfo.current.color}
                          accent={rankInfo.current.accent}
                          className="w-9 h-9 shrink-0"
                        />
                        <div>
                          <div
                            className="font-display text-sm font-black uppercase tracking-wide"
                            style={{ color: rankInfo.current.color }}
                          >
                            {rankInfo.current.name}
                          </div>
                          <div className="text-[11px] font-mono-num text-slate-300">
                            {saveState.rankedRp.toLocaleString()} RP
                            {rankInfo.next ? ` · ${rankInfo.rpToNext} RP to ${rankInfo.next.name}` : ' · MAX RANK'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTabChange('ranked')}
                        className="text-[10px] font-display font-bold uppercase tracking-wider text-purple-300 hover:text-white cursor-pointer"
                      >
                        Ladder →
                      </button>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${rankInfo.progressPct}%`,
                          backgroundColor: rankInfo.current.color,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                data-start="true"
                disabled={startBlockedByLeader}
                onClick={onStartMatch}
                className={`w-full py-4 font-display font-black uppercase -skew-x-6 border-2 transition-transform ${
                  startBlockedByLeader
                    ? 'bg-slate-700 border-slate-500 text-slate-200 text-base tracking-[0.12em] cursor-not-allowed'
                    : 'bg-[#facc15] hover:bg-[#fde047] text-slate-950 text-2xl tracking-[0.2em] cursor-pointer shadow-[0_10px_32px_rgba(250,204,21,0.4)] active:scale-95 border-[#fef08a]'
                }`}
              >
                <span className="inline-block skew-x-6">
                  {startBlockedByLeader ? 'WAITING FOR PARTY LEADER' : `PLAY · ${teamDef.label.toUpperCase()}`}
                </span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'ranked' && (
          <div className="pointer-events-auto self-center w-full max-w-[700px] max-h-[calc(100vh-135px)] overflow-y-auto custom-scroll bg-[#08102b]/95 border border-purple-400/40 rounded-lg p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15 pb-4">
              <div className="flex items-center gap-3.5">
                <RankCrestIcon color={rankInfo.current.color} accent={rankInfo.current.accent} className="w-14 h-14" />
                <div>
                  <div className="text-[11px] font-display font-bold uppercase tracking-[0.2em] text-purple-300">
                    Competitive Division
                  </div>
                  <h2
                    className="font-display text-2xl font-black uppercase tracking-wider"
                    style={{ color: rankInfo.current.color }}
                  >
                    {rankInfo.current.name}
                  </h2>
                  <div className="text-xs font-mono-num text-slate-300">
                    {saveState.rankedRp.toLocaleString()} RP
                    {rankInfo.next ? ` · ${rankInfo.rpToNext} RP to ${rankInfo.next.name}` : ' · Pinnacle Tier'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5 text-center font-mono-num">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Peak RP</div>
                  <div className="text-lg font-bold text-amber-300">{saveState.bestRankRp.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Ranked Wins</div>
                  <div className="text-lg font-bold text-purple-300">{saveState.rankedWins}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">BR Wins</div>
                  <div className="text-lg font-bold text-sky-300">{saveState.brWins}</div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className="text-slate-300 uppercase font-display tracking-wider">Division Progress</span>
                <span className="font-mono-num text-white">{Math.round(rankInfo.progressPct)}%</span>
              </div>
              <div className="w-full h-3 bg-slate-950 border border-white/15 rounded overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{ width: `${rankInfo.progressPct}%`, backgroundColor: rankInfo.current.color }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {RANK_TIERS.map((tier, idx) => {
                const isCurrent = rankInfo.tierIndex === idx;
                const unlocked = saveState.rankedRp >= tier.minRp;
                return (
                  <div
                    key={tier.id}
                    className={`rounded-lg px-3 py-2.5 border flex items-center gap-2.5 ${
                      isCurrent
                        ? 'bg-purple-950/60 border-[#facc15] ring-1 ring-[#facc15]'
                        : unlocked
                          ? 'bg-slate-900/90 border-white/20'
                          : 'bg-slate-950/70 border-white/10 opacity-55'
                    }`}
                  >
                    <RankCrestIcon color={tier.color} accent={tier.accent} className="w-8 h-8 shrink-0" />
                    <div className="min-w-0">
                      <div
                        className="font-display text-xs font-black uppercase tracking-wide truncate"
                        style={{ color: tier.color }}
                      >
                        {tier.name}
                      </div>
                      <div className="font-mono-num text-[10px] text-slate-300">
                        {tier.minRp.toLocaleString()}+ RP
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
              <span className="text-xs text-slate-300">
                Ranked queues scale opponent bots cleanly to your current RP tier.
              </span>
              <button
                type="button"
                disabled={startBlockedByLeader}
                onClick={() => {
                  onSetMatchMode('ranked');
                  onStartMatch();
                }}
                className="px-6 py-2.5 bg-purple-500 hover:bg-purple-400 disabled:bg-slate-700 text-white font-display text-xs font-black uppercase tracking-widest cursor-pointer -skew-x-6 shrink-0"
              >
                <span className="inline-block skew-x-6">
                  {startBlockedByLeader ? 'Leader Starts Match' : 'Queue Ranked'}
                </span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'locker' && (
          <div className="pointer-events-auto self-center w-full max-w-[680px] max-h-[calc(100vh-135px)] overflow-y-auto custom-scroll bg-[#0a122d]/95 border border-white/15 rounded-lg p-6 shadow-2xl flex flex-col gap-6">
            <div>
              <div className="flex items-baseline justify-between border-b border-white/15 pb-3 mb-4">
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">Locker — Outfits</h2>
                <span className="text-xs text-slate-300">Equip any owned outfit</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {SKINS.filter((s) => saveState.ownedSkins.includes(s.id) || (s.pirateExclusive && pirateActive)).map(
                  (skin) => {
                    const equipped = saveState.equippedSkin === skin.id;
                    const c1 = `#${skin.torso.toString(16).padStart(6, '0')}`;
                    const c2 = `#${skin.accent.toString(16).padStart(6, '0')}`;
                    return (
                      <button
                        key={skin.id}
                        type="button"
                        onClick={() => onEquipSkin(skin.id)}
                        className={`text-left rounded-lg p-3 bg-[#0f172a] border-2 cursor-pointer transition-transform hover:-translate-y-0.5 flex flex-col justify-between gap-2.5 ${
                          equipped ? 'border-[#fde047]' : 'border-slate-600 hover:border-slate-400'
                        }`}
                      >
                        <div
                          className="h-14 rounded flex items-center justify-center"
                          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                        >
                          <SkinEmblemIcon icon={skin.icon} className="w-8 h-8" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            {skin.rarity}
                          </div>
                          <div className="text-xs font-bold text-white truncate">{skin.name}</div>
                        </div>
                        <span
                          className={`w-full py-1 rounded text-center text-[11px] font-display font-bold uppercase tracking-wider ${
                            equipped ? 'bg-[#fde047] text-slate-950' : 'bg-emerald-500 text-slate-950'
                          }`}
                        >
                          {equipped ? 'Equipped' : 'Equip'}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between border-b border-white/15 pb-3 mb-4">
                <h2 className="font-display text-lg font-bold uppercase tracking-wide text-sky-300">
                  Emotes &amp; Dances (Press {kEmoteStr} In-Match)
                </h2>
                <span className="text-xs text-slate-300">Click to equip &amp; dance on pedestal</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {EMOTES.filter((e) => saveState.ownedEmotes.includes(e.id)).map((emote) => {
                  const equipped = saveState.equippedEmote === emote.id;
                  const st = RARITY_STYLES[emote.rarity];
                  return (
                    <button
                      key={emote.id}
                      type="button"
                      onClick={() => {
                        onEquipEmote(emote.id);
                        onPreviewEmote(emote.id);
                      }}
                      className={`text-left rounded-lg p-3 bg-[#0f172a] border-2 cursor-pointer transition-transform hover:-translate-y-0.5 flex flex-col justify-between gap-2 ${
                        equipped ? 'border-[#fde047]' : 'border-slate-600 hover:border-sky-400'
                      }`}
                    >
                      <div
                        className="h-12 rounded flex items-center justify-center"
                        style={{ background: `radial-gradient(circle, ${st.bgTop}, ${st.bgBottom})` }}
                      >
                        <SkinEmblemIcon icon={emote.icon} className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: st.badge }}>
                          {emote.rarity}
                        </div>
                        <div className="text-xs font-bold text-white truncate">{emote.name}</div>
                      </div>
                      <span
                        className={`w-full py-1 rounded text-center text-[11px] font-display font-bold uppercase tracking-wider ${
                          equipped ? 'bg-[#fde047] text-slate-950' : 'bg-sky-400 text-slate-950'
                        }`}
                      >
                        {equipped ? 'Equipped' : 'Equip & Dance'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shop' && !inspectTarget && (
          <div className="pointer-events-auto w-full max-w-6xl mx-auto h-full max-h-[calc(100vh-120px)] overflow-y-auto custom-scroll pr-2 flex flex-col gap-6 self-start">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 rounded-xl bg-[#0d193d]/90 border-2 border-sky-400/35 shadow-xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded bg-[#fde047] text-slate-950 font-display text-base font-black uppercase tracking-widest">
                  Item Shop
                </span>
                <div className="flex items-center gap-2">
                  {(
                    [
                      { id: 'all', label: 'All Sections' },
                      { id: 'outfits', label: 'Outfits' },
                      { id: 'emotes', label: `Emotes (${shopEmotes.length})` },
                    ] as Array<{ id: ShopCategory; label: string }>
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setShopCategory(cat.id)}
                      className={`px-3.5 py-1.5 rounded text-xs font-display font-bold uppercase tracking-wider cursor-pointer border transition-colors ${
                        shopCategory === cat.id
                          ? 'bg-sky-400 text-slate-950 border-sky-200'
                          : 'bg-slate-950/60 text-slate-200 border-white/15 hover:bg-white/10'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                {pirateActive && (
                  <span className="px-3 py-1 rounded bg-amber-400/20 border border-amber-300 text-amber-200 uppercase tracking-wider">
                    Pirate Pass Active · Unlimited Free Unlocks ({formatCountdown(saveState.pirateExpiresAt, nowMs)})
                  </span>
                )}
                <span className="font-mono-num text-amber-300 uppercase">
                  Shop Rotation {getDailyShopCountdown(nowMs)}
                </span>
              </div>
            </div>

            {(shopCategory === 'all' || shopCategory === 'outfits') && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-black uppercase tracking-widest text-white">
                    Featured Outfits
                  </h2>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Click Any Item For Full 3D Preview
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {featuredSkins.map((skin) => renderSkinCard(skin, true))}
                </div>
              </section>
            )}

            {(shopCategory === 'all' || shopCategory === 'emotes') && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-black uppercase tracking-widest text-sky-300">
                    Emotes &amp; Dances
                  </h2>
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-200">
                    Live 3D Choreography Preview
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {shopEmotes.map((emote) => renderEmoteCard(emote))}
                </div>
              </section>
            )}

            {(shopCategory === 'all' || shopCategory === 'outfits') && (
              <section className="pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-xl font-black uppercase tracking-widest text-white">
                    Daily Offers
                  </h2>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Refreshes Daily
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {dailySkins.map((skin) => renderSkinCard(skin, false))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'shop' && inspectTarget && (inspectedSkin || inspectedEmote) && (
          <div className="pointer-events-auto self-center w-full max-w-md bg-[#080e26]/94 border-2 border-white/20 rounded-xl p-6 shadow-2xl flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setInspectTarget(null)}
              className="self-start px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-display font-bold uppercase tracking-wider text-slate-100 cursor-pointer"
            >
              ← Back To Item Shop
            </button>

            {inspectedSkin && (() => {
              const owned =
                saveState.ownedSkins.includes(inspectedSkin.id) ||
                (inspectedSkin.pirateExclusive && pirateActive);
              const equipped = saveState.equippedSkin === inspectedSkin.id;
              const locked = Boolean(inspectedSkin.pirateExclusive && !pirateActive && !owned);
              const canSpendPirate = pirateActive && !owned && !locked;
              const style = RARITY_STYLES[inspectedSkin.rarity];

              return (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-display font-bold uppercase tracking-widest"
                      style={{ color: style.badge }}
                    >
                      {inspectedSkin.rarity} Outfit
                    </span>
                    <button
                      type="button"
                      onClick={onEmote}
                      className="px-3 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-xs font-display font-bold uppercase text-sky-200 cursor-pointer"
                    >
                      Test Emote
                    </button>
                  </div>
                  <div className="font-display text-3xl font-black uppercase tracking-wide text-white">
                    {inspectedSkin.name}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Full 3D battle-ready outfit previewing live on the lobby pedestal. Rotate and admire before equipping!
                  </p>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => {
                      if (locked) return;
                      if (owned) onEquipSkin(inspectedSkin.id);
                      else onUnlockSkin(inspectedSkin.id, canSpendPirate);
                    }}
                    className={`w-full py-4 rounded-lg font-display text-base font-black uppercase tracking-widest transition-transform active:scale-95 ${
                      locked
                        ? 'bg-slate-700 text-slate-300 cursor-not-allowed'
                        : equipped
                          ? 'bg-[#fde047] text-slate-950 cursor-pointer'
                          : owned
                            ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 cursor-pointer'
                            : canSpendPirate
                              ? 'bg-amber-300 hover:bg-amber-200 text-slate-950 cursor-pointer'
                              : 'bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer'
                    }`}
                  >
                    {locked
                      ? 'Find Pirate Token In Chest'
                      : equipped
                        ? 'Equipped On Pedestal'
                        : owned
                          ? 'Equip Outfit'
                          : canSpendPirate
                            ? 'Claim Free (Unlimited Pass)'
                            : `Purchase · ${inspectedSkin.price.toLocaleString()} V-Bucks`}
                  </button>
                </>
              );
            })()}

            {inspectedEmote && (() => {
              const owned = saveState.ownedEmotes.includes(inspectedEmote.id);
              const equipped = saveState.equippedEmote === inspectedEmote.id;
              const canSpendPirate = pirateActive && !owned;
              const style = RARITY_STYLES[inspectedEmote.rarity];

              return (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className="text-xs font-display font-bold uppercase tracking-widest"
                      style={{ color: style.badge }}
                    >
                      {inspectedEmote.rarity} Emote
                    </span>
                    <button
                      type="button"
                      onClick={() => onPreviewEmote(inspectedEmote.id)}
                      className="px-3 py-1 rounded bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/50 text-xs font-display font-bold uppercase text-sky-200 cursor-pointer"
                    >
                      Replay Dance
                    </button>
                  </div>
                  <div className="font-display text-3xl font-black uppercase tracking-wide text-white">
                    {inspectedEmote.name}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{inspectedEmote.description}</p>
                  <button
                    type="button"
                    onClick={() => {
                      if (owned) onEquipEmote(inspectedEmote.id);
                      else onUnlockEmote(inspectedEmote.id, canSpendPirate);
                    }}
                    className={`w-full py-4 rounded-lg font-display text-base font-black uppercase tracking-widest transition-transform active:scale-95 ${
                      equipped
                        ? 'bg-[#fde047] text-slate-950 cursor-pointer'
                        : owned
                          ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 cursor-pointer'
                          : canSpendPirate
                            ? 'bg-amber-300 hover:bg-amber-200 text-slate-950 cursor-pointer'
                            : 'bg-sky-400 hover:bg-sky-300 text-slate-950 cursor-pointer'
                    }`}
                  >
                    {equipped
                      ? `Equipped Emote (Press ${kEmoteStr})`
                      : owned
                        ? 'Equip Emote'
                        : canSpendPirate
                          ? 'Claim Free (Unlimited Pass)'
                          : `Purchase Emote · ${inspectedEmote.price.toLocaleString()} V-Bucks`}
                  </button>
                </>
              );
            })()}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="pointer-events-auto self-center w-full max-w-[620px] max-h-[calc(100vh-140px)] overflow-y-auto custom-scroll bg-[#0a122d]/95 border border-white/15 rounded-lg p-6 shadow-2xl">
            <div className="flex items-baseline justify-between border-b border-white/15 pb-3 mb-4">
              <div>
                <h2 className="font-display text-xl font-bold uppercase tracking-wide">Graphics &amp; Settings</h2>
                <span className="text-xs text-slate-400">Default preset: High (Recommended) · Saved automatically</span>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ ...RECOMMENDED_SETTINGS })}
                className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-display font-bold uppercase tracking-wider text-amber-300 cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset Recommended
              </button>
            </div>

            <div className="divide-y divide-white/10 text-sm font-semibold">
              <div className="py-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span>Graphics Preset</span>
                  <span className="text-xs text-amber-300 uppercase font-bold">
                    {GRAPHICS_PRESETS[saveState.settings.graphicsQuality].label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((preset) => {
                    const active = saveState.settings.graphicsQuality === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          const p = GRAPHICS_PRESETS[preset];
                          onUpdateSettings({
                            graphicsQuality: preset,
                            shadowQuality: p.shadowQuality,
                            renderDistance: p.renderDistance,
                          });
                        }}
                        className={`px-3 py-2 rounded text-xs font-display font-bold uppercase tracking-wider cursor-pointer border transition-colors ${
                          active
                            ? 'bg-[#facc15] text-slate-950 border-[#fef08a]'
                            : 'bg-slate-900/90 text-slate-200 border-white/15 hover:bg-white/10'
                        }`}
                      >
                        {preset === 'high' ? 'High · Rec' : preset}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {GRAPHICS_PRESETS[saveState.settings.graphicsQuality].description}
                </p>
              </div>

              <div className="py-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span>Shadows Quality</span>
                  <span className="text-xs text-sky-300 uppercase font-bold">
                    {saveState.settings.shadowQuality === 'ultra'
                      ? 'Ultra (4K)'
                      : saveState.settings.shadowQuality === 'high'
                        ? 'High (2K)'
                        : saveState.settings.shadowQuality === 'low'
                          ? 'Low'
                          : 'Off'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(['off', 'low', 'high', 'ultra'] as ShadowQuality[]).map((sq) => {
                    const active = saveState.settings.shadowQuality === sq;
                    return (
                      <button
                        key={sq}
                        type="button"
                        onClick={() => onUpdateSettings({ shadowQuality: sq })}
                        className={`px-3 py-1.5 rounded text-xs font-display font-bold uppercase tracking-wider cursor-pointer border transition-colors ${
                          active
                            ? 'bg-sky-400 text-slate-950 border-sky-200'
                            : 'bg-slate-900/90 text-slate-200 border-white/15 hover:bg-white/10'
                        }`}
                      >
                        {sq}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <label htmlFor="renderDistSlider">
                  Render Distance ({saveState.settings.renderDistance}m)
                </label>
                <input
                  id="renderDistSlider"
                  type="range"
                  min={350}
                  max={1350}
                  step={50}
                  value={saveState.settings.renderDistance}
                  onChange={(e) => onUpdateSettings({ renderDistance: parseInt(e.target.value, 10) })}
                  className="w-48 accent-[#facc15]"
                />
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <label htmlFor="sensSlider">Mouse Sensitivity ({saveState.settings.sens.toFixed(1)}x)</label>
                <input
                  id="sensSlider"
                  type="range"
                  min={0.4}
                  max={2.5}
                  step={0.1}
                  value={saveState.settings.sens}
                  onChange={(e) => onUpdateSettings({ sens: parseFloat(e.target.value) })}
                  className="w-48 accent-[#facc15]"
                />
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <label htmlFor="volSlider">Master Audio Volume ({Math.round(saveState.settings.vol * 100)}%)</label>
                <input
                  id="volSlider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={saveState.settings.vol}
                  onChange={(e) => onUpdateSettings({ vol: parseFloat(e.target.value) })}
                  className="w-48 accent-[#facc15]"
                />
              </div>

              <div className="flex items-center justify-between py-3.5 gap-4">
                <label htmlFor="invertYCheck">Invert Y-Axis</label>
                <input
                  id="invertYCheck"
                  type="checkbox"
                  checked={saveState.settings.invertY}
                  onChange={(e) => onUpdateSettings({ invertY: e.target.checked })}
                  className="w-5 h-5 accent-[#facc15]"
                />
              </div>

              <div className="pt-4 pb-2 flex flex-col gap-3" data-testid="settings-keybinds">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-black uppercase tracking-wider text-[#fde047]">
                      Controls &amp; Keybinds
                    </h3>
                    <p className="text-[11px] font-normal text-slate-300">
                      Click any binding then press a new key (Esc cancels). Conflicting keys swap automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRebindingAction(null);
                      onUpdateSettings({ keybinds: { ...DEFAULT_KEYBINDS } });
                    }}
                    className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-display font-bold uppercase tracking-wider text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Reset Keybinds
                  </button>
                </div>

                {(['Movement', 'Combat', 'Inventory & UI'] as const).map((groupName) => (
                  <div key={groupName} className="flex flex-col gap-1.5">
                    <div className="text-[10px] font-display font-black uppercase tracking-[0.18em] text-sky-300 border-b border-white/10 pb-1">
                      {groupName}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {KEYBIND_ACTION_META.filter((m) => m.group === groupName).map((item) => {
                        const isListening = rebindingAction === item.action;
                        const code = kb[item.action] ?? DEFAULT_KEYBINDS[item.action];
                        return (
                          <div
                            key={item.action}
                            className="flex items-center justify-between gap-2 bg-slate-950/75 border border-white/10 rounded px-2.5 py-1.5"
                          >
                            <span className="text-xs font-semibold text-slate-200 truncate">{item.label}</span>
                            <button
                              type="button"
                              data-keybind-action={item.action}
                              aria-label={`Rebind ${item.label}`}
                              onClick={() => setRebindingAction(isListening ? null : item.action)}
                              className={`min-w-[72px] px-2.5 py-1 rounded text-[11px] font-mono-num font-black uppercase tracking-wider cursor-pointer border transition-colors ${
                                isListening
                                  ? 'bg-[#facc15] text-slate-950 border-white animate-pulse'
                                  : 'bg-slate-900 hover:bg-slate-800 text-amber-200 border-white/20 hover:border-sky-300'
                              }`}
                            >
                              {isListening ? 'Press Key...' : formatKeyCodeLabel(code)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
