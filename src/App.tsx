import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { LobbyOverlay } from './components/LobbyOverlay';
import { BackpackModal, EndMatchModal, PauseModal, PirateTokenBanner, TacticalMapModal } from './components/Modals';
import { DEFAULT_KEYBINDS } from './game/constants';
import { FortbloxEngine } from './game/FortbloxEngine';
import { MultiplayerClient } from './game/multiplayerClient';
import { computeRankedRpDelta, getRankFromRp, sanitizePlayerName } from './game/rules';
import { loadSaveState, writeSaveState } from './game/storage';
import type {
  BotDifficulty,
  EmoteId,
  GameMode,
  HudSnapshot,
  LobbyTab,
  MatchMode,
  MatchSummary,
  PartyState,
  SaveState,
  TeamMode,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  shield: 0,
  kills: 0,
  aliveCount: 25,
  stormTimerSec: 60,
  inStorm: false,
  stormProximity: 0,
  poiName: 'BATTLE BUS',
  yawDeg: 0,
  teamMode: 'duos',
  teammates: [],
  matchMode: 'battle_royale',
  botDifficulty: 'normal',
  rankLabel: 'BRZ III',
  pointerLocked: false,
  inBattleBus: false,
  busProgress: 0,
  isSkydiving: false,
  isGliding: false,
  altitude: 0,
  pickaxeEquipped: true,
  activeSlot: 0,
  slots: [null, null, null, null, null],
  ammoBag: { medium: 0, shells: 0, light: 0, heavy: 0 },
  noAmmoHint: false,
  backpackOpen: false,
  interactText: null,
  sniperScope: false,
  reloadPct: null,
  actionText: null,
  actionPct: null,
  killFeed: [],
  bigMapOpen: false,
  activePingText: null,
  alive: true,
  knocked: false,
  dbnoHp: 100,
  revivePct: null,
  beingRevived: false,
  heldRebootCards: [],
  spectatingName: null,
  spectatingId: null,
  nearbyRebootVan: false,
  rebootProgressPct: null,
  keybinds: { ...DEFAULT_KEYBINDS },
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FortbloxEngine | null>(null);
  const mpClientRef = useRef<MultiplayerClient | null>(null);

  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const bigMapRef = useRef<HTMLCanvasElement | null>(null);
  const crosshairRef = useRef<HTMLDivElement | null>(null);
  const hitmarkerRef = useRef<HTMLDivElement | null>(null);
  const damageFlashRef = useRef<HTMLDivElement | null>(null);
  const damageNumbersRef = useRef<HTMLDivElement | null>(null);

  const [saveState, setSaveState] = useState<SaveState>(() => loadSaveState());
  const [mode, setMode] = useState<GameMode>('title');
  const [activeTab, setActiveTab] = useState<LobbyTab>('play');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [pirateBannerVisible, setPirateBannerVisible] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [party, setParty] = useState<PartyState | null>(null);
  const [mpConnected, setMpConnected] = useState(false);
  const [localClientId, setLocalClientId] = useState<string | null>(null);
  const [partyError, setPartyError] = useState<string | null>(null);

  const modeRef = useRef<GameMode>(mode);
  modeRef.current = mode;
  const saveStateRef = useRef<SaveState>(saveState);
  saveStateRef.current = saveState;

  // Mount Three.js engine + Multiplayer WebSocket client once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    document.body.dataset.state = 'title';

    const engine = new FortbloxEngine(
      container,
      saveState.settings,
      saveState.equippedSkin,
      saveState.equippedEmote,
      saveState.pirateExpiresAt,
      saveState.pirateTokenUsed,
      {
        onModeChange: (nextMode) => {
          setMode(nextMode);
          if (nextMode === 'playing') setMatchSummary(null);
        },
        onHudUpdate: (snapshot) => {
          setHud(snapshot);
        },
        onMatchEnd: (summary) => {
          const prev = saveStateRef.current;
          let nextState: SaveState = prev;
          let enrichedSummary: MatchSummary = summary;

          if (summary.matchMode === 'ranked') {
            const prevRank = getRankFromRp(prev.rankedRp).current;
            const rpRes = computeRankedRpDelta(summary.placement, summary.kills, prev.rankedRp);
            const nextRank = getRankFromRp(rpRes.nextRp).current;
            nextState = {
              ...prev,
              rankedRp: rpRes.nextRp,
              bestRankRp: Math.max(prev.bestRankRp, rpRes.nextRp),
              rankedWins: prev.rankedWins + (summary.isVictory ? 1 : 0),
            };
            enrichedSummary = {
              ...summary,
              rankUpdate: {
                prevLabel: prevRank.name,
                nextLabel: nextRank.name,
                prevColor: prevRank.color,
                nextColor: nextRank.color,
                prevRp: prev.rankedRp,
                nextRp: rpRes.nextRp,
                delta: rpRes.delta,
              },
            };
          } else if (summary.isVictory) {
            nextState = {
              ...prev,
              brWins: prev.brWins + 1,
            };
          }

          if (nextState !== prev) {
            writeSaveState(nextState);
            setSaveState(nextState);
            engineRef.current?.setMatchConfig(nextState.matchMode, nextState.botDifficulty, nextState.rankedRp);
          }

          setMatchSummary(enrichedSummary);
        },
        onPirateTokenFound: (expiresAt) => {
          setSaveState((prev) => {
            const owned = prev.ownedSkins.includes('goldman')
              ? prev.ownedSkins
              : [...prev.ownedSkins, 'goldman'];
            const next: SaveState = { ...prev, ownedSkins: owned, pirateExpiresAt: expiresAt };
            writeSaveState(next);
            return next;
          });
          setPirateBannerVisible(true);
          window.setTimeout(() => setPirateBannerVisible(false), 6500);
        },
        onDamageNumber: (sx, sy, dmg, isShield, isCrit, shotKey) => {
          const parent = damageNumbersRef.current;
          if (!parent) return;
          if (shotKey) {
            const existing = parent.querySelector<HTMLDivElement>(`[data-shot-key="${shotKey}"]`);
            if (existing) {
              existing.style.left = `${sx}px`;
              existing.style.top = `${sy}px`;
              existing.style.color = isCrit ? '#fde047' : isShield ? '#38bdf8' : '#ffffff';
              existing.textContent = `${Math.round(dmg)}${isCrit ? '!' : ''}`;
              return;
            }
          }
          const el = document.createElement('div');
          el.className = 'dmg-num';
          if (shotKey) el.dataset.shotKey = shotKey;
          el.style.left = `${sx}px`;
          el.style.top = `${sy}px`;
          el.style.color = isCrit ? '#fde047' : isShield ? '#38bdf8' : '#ffffff';
          el.textContent = `${Math.round(dmg)}${isCrit ? '!' : ''}`;
          parent.appendChild(el);
          window.setTimeout(() => el.remove(), 720);
        },
        onHitmarker: () => {
          const hm = hitmarkerRef.current;
          if (!hm) return;
          hm.style.opacity = '1';
          window.setTimeout(() => {
            if (hm) hm.style.opacity = '0';
          }, 90);
        },
        onDamageFlash: () => {
          const df = damageFlashRef.current;
          if (!df) return;
          df.style.boxShadow = 'inset 0 0 95px rgba(239, 68, 68, 0.8)';
          window.setTimeout(() => {
            if (df) df.style.boxShadow = 'inset 0 0 80px rgba(239, 68, 68, 0)';
          }, 160);
        },
        onCrosshairSize: (sizePx) => {
          const ch = crosshairRef.current;
          if (!ch) return;
          ch.style.width = `${sizePx}px`;
          ch.style.height = `${sizePx}px`;
        },
        onContextLostChange: (lost) => {
          setContextLost(lost);
        },
      },
      saveState.matchMode,
      saveState.botDifficulty,
      saveState.rankedRp,
    );

    engineRef.current = engine;
    engine.setTeamPreferences(saveState.teamMode, saveState.fillTeammates);

    const params = new URLSearchParams(window.location.search);
    const joinCodeParam = params.get('party') || undefined;
    const autostart = params.get('autostart') === '1';

    const mpClient = new MultiplayerClient(
      {
        name: saveState.playerName,
        skinId: saveState.equippedSkin,
        emoteId: saveState.equippedEmote,
        teamMode: saveState.teamMode,
        matchMode: saveState.matchMode,
        botDifficulty: saveState.botDifficulty,
        fillTeammates: saveState.fillTeammates,
        joinCode: joinCodeParam,
      },
      {
        onConnectionChange: (connected, cid) => {
          setMpConnected(connected);
          setLocalClientId(cid);
        },
        onPartyState: (nextParty) => {
          setParty(nextParty);
          setPartyError(null);
          const cid = mpClient.getClientId();
          setLocalClientId(cid);
          engine.updateLobbyParty(nextParty.members, cid);

          if (nextParty.members.length > 1 && cid && nextParty.leaderId !== cid) {
            const cur = saveStateRef.current;
            if (
              cur.teamMode !== nextParty.teamMode ||
              cur.matchMode !== nextParty.matchMode ||
              cur.botDifficulty !== nextParty.botDifficulty ||
              cur.fillTeammates !== nextParty.fillTeammates
            ) {
              const synced: SaveState = {
                ...cur,
                teamMode: nextParty.teamMode,
                matchMode: nextParty.matchMode,
                botDifficulty: nextParty.botDifficulty,
                fillTeammates: nextParty.fillTeammates,
              };
              saveStateRef.current = synced;
              writeSaveState(synced);
              setSaveState(synced);
              engine.setMatchConfig(synced.matchMode, synced.botDifficulty, synced.rankedRp);
              engine.setTeamPreferences(synced.teamMode, synced.fillTeammates);
            }
          }
        },
        onPartyError: (message) => {
          setPartyError(message);
        },
        onPartyEmote: (memberId, emoteId) => {
          engine.triggerLobbyPartyEmote(memberId, emoteId);
        },
        onMatchStart: (config) => {
          engine.setMatchConfig(config.matchMode, config.botDifficulty, saveStateRef.current.rankedRp);
          engine.setTeamPreferences(config.teamMode, config.fillTeammates);
          engine.startMatch(config);
        },
        onRemoteJump: (data) => engine.handleRemoteJump(data),
        onRemotePlayerState: (data) => engine.handleRemotePlayerState(data),
        onRemoteShot: (data) => engine.handleRemoteShot(data),
        onCombatantDamaged: (data) => engine.handleCombatantDamaged(data),
        onReviveCompleted: (data) => engine.handleReviveCompleted(data),
        onRebootCardCollected: (data) => engine.handleRebootCardCollected(data),
        onRebootCompleted: (data) => engine.handleRebootCompleted(data),
        onChestOpened: (data) => engine.handleChestOpened(data),
        onStructureDamaged: (data) => engine.handleStructureDamaged(data),
        onPingCreated: (data) => engine.handlePingCreated(data),
        onBotsSnapshot: (data) => engine.handleBotsSnapshot(data),
        onMatchVictory: (data) => engine.handleMatchVictory(data),
        onHostPromoted: () => engine.handleHostPromoted(),
      },
    );

    mpClientRef.current = mpClient;
    engine.setMultiplayerClient(mpClient);
    mpClient.connect();

    if (autostart) {
      engine.startMatch();
    }

    return () => {
      mpClient.dispose();
      mpClientRef.current = null;
      engine.setMultiplayerClient(null);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep minimap and bigMap canvas refs synced to the engine
  useEffect(() => {
    engineRef.current?.setMapCanvases(minimapRef.current, bigMapRef.current);
  }, [mode, hud.bigMapOpen]);

  // Offset lobby camera to frame character neatly when browsing subtabs
  useEffect(() => {
    engineRef.current?.setLobbyShowcaseSideView(activeTab !== 'play');
  }, [activeTab]);

  const handleStartMatch = useCallback(() => {
    const cur = saveStateRef.current;
    engineRef.current?.setMatchConfig(cur.matchMode, cur.botDifficulty, cur.rankedRp);
    engineRef.current?.setTeamPreferences(cur.teamMode, cur.fillTeammates);
    if (mpClientRef.current?.isConnected()) {
      mpClientRef.current.requestStartMatch(cur.rankedRp);
    } else {
      engineRef.current?.startMatch();
    }
  }, []);

  // Enter / Space starts match from Title screen (when on Play tab)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modeRef.current === 'title' && activeTab === 'play' && (e.code === 'Enter' || e.code === 'Space')) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'BUTTON') return;
        e.preventDefault();
        handleStartMatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, handleStartMatch]);

  const handleEquipSkin = useCallback((skinId: string) => {
    setSaveState((prev) => {
      const next: SaveState = { ...prev, equippedSkin: skinId };
      writeSaveState(next);
      return next;
    });
    engineRef.current?.setEquippedSkin(skinId);
    mpClientRef.current?.updatePartyProfile({ skinId });
  }, []);

  const handleUnlockSkin = useCallback((skinId: string, _spendPirateToken: boolean) => {
    setSaveState((prev) => {
      const owned = prev.ownedSkins.includes(skinId) ? prev.ownedSkins : [...prev.ownedSkins, skinId];
      const next: SaveState = {
        ...prev,
        ownedSkins: owned,
        equippedSkin: skinId,
      };
      writeSaveState(next);
      return next;
    });
    engineRef.current?.setEquippedSkin(skinId);
    mpClientRef.current?.updatePartyProfile({ skinId });
  }, []);

  const handleEquipEmote = useCallback((emoteId: EmoteId) => {
    setSaveState((prev) => {
      const next: SaveState = { ...prev, equippedEmote: emoteId };
      writeSaveState(next);
      return next;
    });
    engineRef.current?.setEquippedEmote(emoteId);
    mpClientRef.current?.updatePartyProfile({ emoteId });
  }, []);

  const handleUnlockEmote = useCallback((emoteId: EmoteId, _spendPirateToken: boolean) => {
    setSaveState((prev) => {
      const ownedEmotes = prev.ownedEmotes.includes(emoteId)
        ? prev.ownedEmotes
        : [...prev.ownedEmotes, emoteId];
      const next: SaveState = {
        ...prev,
        ownedEmotes,
        equippedEmote: emoteId,
      };
      writeSaveState(next);
      return next;
    });
    engineRef.current?.setEquippedEmote(emoteId);
    engineRef.current?.triggerLobbyEmote(emoteId);
    mpClientRef.current?.updatePartyProfile({ emoteId });
    mpClientRef.current?.triggerPartyEmote(emoteId);
  }, []);

  const handlePreviewSkin = useCallback((skinId: string | null) => {
    engineRef.current?.setPreviewSkin(skinId);
  }, []);

  const handlePreviewEmote = useCallback((emoteId: EmoteId) => {
    engineRef.current?.triggerLobbyEmote(emoteId);
    mpClientRef.current?.triggerPartyEmote(emoteId);
  }, []);

  const handleSetMatchMode = useCallback((matchMode: MatchMode) => {
    const next: SaveState = { ...saveStateRef.current, matchMode };
    saveStateRef.current = next;
    writeSaveState(next);
    engineRef.current?.setMatchConfig(next.matchMode, next.botDifficulty, next.rankedRp);
    mpClientRef.current?.updatePartyProfile({ matchMode });
    setSaveState(next);
  }, []);

  const handleSetBotDifficulty = useCallback((botDifficulty: BotDifficulty) => {
    const next: SaveState = { ...saveStateRef.current, botDifficulty };
    saveStateRef.current = next;
    writeSaveState(next);
    engineRef.current?.setMatchConfig(next.matchMode, next.botDifficulty, next.rankedRp);
    mpClientRef.current?.updatePartyProfile({ botDifficulty });
    setSaveState(next);
  }, []);

  const handleSetTeamMode = useCallback((teamMode: TeamMode) => {
    const next: SaveState = { ...saveStateRef.current, teamMode };
    saveStateRef.current = next;
    writeSaveState(next);
    engineRef.current?.setTeamPreferences(next.teamMode, next.fillTeammates);
    mpClientRef.current?.updatePartyProfile({ teamMode });
    setSaveState(next);
  }, []);

  const handleSetFillTeammates = useCallback((fillTeammates: boolean) => {
    const next: SaveState = { ...saveStateRef.current, fillTeammates };
    saveStateRef.current = next;
    writeSaveState(next);
    engineRef.current?.setTeamPreferences(next.teamMode, next.fillTeammates);
    mpClientRef.current?.updatePartyProfile({ fillTeammates });
    setSaveState(next);
  }, []);

  const handleUpdatePlayerName = useCallback((rawName: string) => {
    const playerName = sanitizePlayerName(rawName);
    const next: SaveState = { ...saveStateRef.current, playerName };
    saveStateRef.current = next;
    writeSaveState(next);
    setSaveState(next);
    mpClientRef.current?.updatePartyProfile({ name: playerName });
  }, []);

  const handleJoinParty = useCallback((code: string) => {
    setPartyError(null);
    mpClientRef.current?.joinParty(code);
  }, []);

  const handleLeaveParty = useCallback(() => {
    setPartyError(null);
    mpClientRef.current?.leaveParty();
  }, []);

  const handleCreateParty = useCallback(() => {
    setPartyError(null);
    mpClientRef.current?.createParty();
  }, []);

  const handleToggleReady = useCallback(() => {
    const curParty = mpClientRef.current?.getParty();
    const cid = mpClientRef.current?.getClientId();
    const self = curParty?.members.find((m) => m.id === cid);
    mpClientRef.current?.updatePartyProfile({ ready: !(self?.ready ?? true) });
  }, []);

  const handleKickMember = useCallback((targetId: string) => {
    mpClientRef.current?.kickMember(targetId);
  }, []);

  const handleUpdateSettings = useCallback((partial: Partial<SaveState['settings']>) => {
    const prev = saveStateRef.current;
    const nextSettings = { ...prev.settings, ...partial };
    const next: SaveState = { ...prev, settings: nextSettings };
    saveStateRef.current = next;
    writeSaveState(next);
    engineRef.current?.updateSettings(nextSettings);
    setSaveState(next);
  }, []);

  const handleEmote = useCallback(() => {
    engineRef.current?.triggerLobbyEmote();
    mpClientRef.current?.triggerPartyEmote(saveStateRef.current.equippedEmote);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#081026]">
      {/* Isolated WebGL mount container */}
      <div ref={mountRef} data-testid="game-canvas" className="fixed inset-0 w-full h-full" />

      {contextLost && (
        <div className="fixed inset-0 z-50 bg-[#081026] flex items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-amber-400/50 rounded-lg px-6 py-5 max-w-md">
            <h2 className="font-display text-xl font-bold text-amber-300 mb-2">WebGL Context Paused</h2>
            <p className="text-sm text-slate-300">Restoring 3D graphics context automatically...</p>
          </div>
        </div>
      )}

      {mode === 'title' && (
        <LobbyOverlay
          saveState={saveState}
          activeTab={activeTab}
          party={party}
          mpConnected={mpConnected}
          localClientId={localClientId}
          partyError={partyError}
          onTabChange={setActiveTab}
          onEquipSkin={handleEquipSkin}
          onUnlockSkin={handleUnlockSkin}
          onEquipEmote={handleEquipEmote}
          onUnlockEmote={handleUnlockEmote}
          onPreviewSkin={handlePreviewSkin}
          onPreviewEmote={handlePreviewEmote}
          onSetMatchMode={handleSetMatchMode}
          onSetBotDifficulty={handleSetBotDifficulty}
          onSetTeamMode={handleSetTeamMode}
          onSetFillTeammates={handleSetFillTeammates}
          onUpdatePlayerName={handleUpdatePlayerName}
          onJoinParty={handleJoinParty}
          onLeaveParty={handleLeaveParty}
          onCreateParty={handleCreateParty}
          onToggleReady={handleToggleReady}
          onKickMember={handleKickMember}
          onUpdateSettings={handleUpdateSettings}
          onEmote={handleEmote}
          onStartMatch={handleStartMatch}
        />
      )}

      {(mode === 'playing' || mode === 'paused') && (
        <GameHud
          hud={hud}
          muted={saveState.settings.muted}
          minimapRef={minimapRef}
          crosshairRef={crosshairRef}
          hitmarkerRef={hitmarkerRef}
          damageFlashRef={damageFlashRef}
          damageNumbersRef={damageNumbersRef}
          onSelectPickaxe={() => engineRef.current?.selectPickaxe()}
          onSelectSlot={(idx) => engineRef.current?.selectSlot(idx)}
          onToggleBackpack={() => engineRef.current?.toggleBackpack()}
          onToggleMute={() => handleUpdateSettings({ muted: !saveState.settings.muted })}
          onToggleMap={() => engineRef.current?.toggleBigMap()}
          onPause={() => engineRef.current?.pauseMatch()}
          onCycleSpectate={(dir) => engineRef.current?.cycleSpectateTarget(dir)}
        />
      )}

      <BackpackModal
        open={mode === 'playing' && hud.backpackOpen}
        slots={hud.slots}
        ammoBag={hud.ammoBag}
        activeSlot={hud.activeSlot}
        pickaxeEquipped={hud.pickaxeEquipped}
        keybinds={hud.keybinds}
        onSelectSlot={(idx) => engineRef.current?.selectSlot(idx)}
        onSwapSlots={(idxA, idxB) => engineRef.current?.swapBackpackSlots(idxA, idxB)}
        onDropSlot={(idx) => engineRef.current?.dropBackpackSlot(idx)}
        onClose={() => engineRef.current?.toggleBackpack()}
      />

      <TacticalMapModal
        open={mode === 'playing' && hud.bigMapOpen}
        bigMapRef={bigMapRef}
        keybinds={hud.keybinds}
        onClose={() => engineRef.current?.toggleBigMap()}
      />

      <PirateTokenBanner visible={pirateBannerVisible} />

      <PauseModal
        open={mode === 'paused'}
        onResume={() => engineRef.current?.resumeMatch()}
        onRestart={() => handleStartMatch()}
        onLobby={() => engineRef.current?.returnToLobby()}
      />

      <EndMatchModal
        summary={mode === 'gameover' ? matchSummary : null}
        onPlayAgain={() => handleStartMatch()}
        onLobby={() => engineRef.current?.returnToLobby()}
      />
    </main>
  );
}

