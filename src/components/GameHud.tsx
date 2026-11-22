import type { RefObject } from 'react';
import { AMMO_DEFS, BUS_DURATION_SEC } from '../game/constants';
import { formatKeyCodeLabel } from '../game/rules';
import type { AmmoType, HudSnapshot, KeybindAction } from '../game/types';
import { WeaponIcon } from './GameIcons';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  minimapRef: RefObject<HTMLCanvasElement | null>;
  crosshairRef: RefObject<HTMLDivElement | null>;
  hitmarkerRef: RefObject<HTMLDivElement | null>;
  damageFlashRef: RefObject<HTMLDivElement | null>;
  damageNumbersRef: RefObject<HTMLDivElement | null>;
  onSelectPickaxe: () => void;
  onSelectSlot: (idx: number) => void;
  onToggleBackpack: () => void;
  onToggleMute: () => void;
  onToggleMap: () => void;
  onPause: () => void;
  onCycleSpectate?: (dir: number) => void;
}

const COMPASS_MARKS: Array<{ deg: number; label: string; cardinal?: boolean }> = [
  { deg: 0, label: 'N', cardinal: true },
  { deg: 15, label: '15' },
  { deg: 30, label: '30' },
  { deg: 45, label: 'NE', cardinal: true },
  { deg: 60, label: '60' },
  { deg: 75, label: '75' },
  { deg: 90, label: 'E', cardinal: true },
  { deg: 105, label: '105' },
  { deg: 120, label: '120' },
  { deg: 135, label: 'SE', cardinal: true },
  { deg: 150, label: '150' },
  { deg: 165, label: '165' },
  { deg: 180, label: 'S', cardinal: true },
  { deg: 195, label: '195' },
  { deg: 210, label: '210' },
  { deg: 225, label: 'SW', cardinal: true },
  { deg: 240, label: '240' },
  { deg: 255, label: '255' },
  { deg: 270, label: 'W', cardinal: true },
  { deg: 285, label: '285' },
  { deg: 300, label: '300' },
  { deg: 315, label: 'NW', cardinal: true },
  { deg: 330, label: '330' },
  { deg: 345, label: '345' },
];

const SLOT_KEYBIND_ACTIONS: KeybindAction[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

export function GameHud({
  hud,
  muted,
  minimapRef,
  crosshairRef,
  hitmarkerRef,
  damageFlashRef,
  damageNumbersRef,
  onSelectPickaxe,
  onSelectSlot,
  onToggleBackpack,
  onToggleMute,
  onToggleMap,
  onPause,
  onCycleSpectate,
}: GameHudProps) {
  const m = Math.floor(hud.stormTimerSec / 60);
  const s = Math.floor(hud.stormTimerSec % 60);
  const stormFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const activeItem = hud.slots[hud.activeSlot];
  const hideCrosshair = !hud.alive || hud.knocked || hud.inBattleBus || hud.isSkydiving || hud.backpackOpen;

  const kb = hud.keybinds;
  const kFwd = formatKeyCodeLabel(kb.forward);
  const kBack = formatKeyCodeLabel(kb.backward);
  const kLeft = formatKeyCodeLabel(kb.left);
  const kRight = formatKeyCodeLabel(kb.right);
  const kJump = formatKeyCodeLabel(kb.jump);
  const kSprint = formatKeyCodeLabel(kb.sprint);
  const kCrouch = formatKeyCodeLabel(kb.crouch);
  const kInteract = formatKeyCodeLabel(kb.interact);
  const kPickaxe = formatKeyCodeLabel(kb.pickaxe);
  const kBag = formatKeyCodeLabel(kb.backpack);
  const kMap = formatKeyCodeLabel(kb.map);
  const kEmote = formatKeyCodeLabel(kb.emote);
  const kPing = formatKeyCodeLabel(kb.ping);

  const controlsHint = !hud.alive
    ? 'Spectating Squadmate · LMB / RMB Cycle View · P Pause'
    : hud.knocked
      ? `${kFwd}${kLeft}${kBack}${kRight} Crawl to Cover · Teammates Can Hold ${kInteract} to Revive`
      : hud.inBattleBus
        ? `${kJump} Jump From Bus · ${kMap} Map · P Pause`
        : hud.isSkydiving
          ? `${kFwd}${kLeft}${kBack}${kRight} Steer · ${kJump} Glider · ${kMap} Map`
          : hud.pointerLocked
            ? `${kSprint}+${kFwd}+${kCrouch} Slide · ${kInteract} Interact · ${kPing} Ping · ${kPickaxe} Axe · ${kBag} Bag · ${kEmote} Emote`
            : `Click Canvas Lock Look · ${kPing} Ping · ${kPickaxe} Axe · ${kBag} Bag`;

  const stormAlpha = hud.inStorm ? 0.28 : Math.min(0.18, hud.stormProximity * 0.16);
  const modeBadge =
    hud.matchMode === 'ranked' ? `RANKED · ${hud.rankLabel}` : `BR · ${hud.botDifficulty.toUpperCase()}`;

  // Shortest signed angular offset from camera yaw (-180..+180)
  const visibleCompassMarks = COMPASS_MARKS.map((mark) => {
    const delta = ((mark.deg - hud.yawDeg + 540) % 360) - 180;
    return { ...mark, delta };
  }).filter((mk) => Math.abs(mk.delta) <= 78);

  const isReviveBar =
    hud.revivePct !== null || Boolean(hud.actionText && hud.actionText.toLowerCase().includes('reviv'));
  const isRebootBar =
    hud.rebootProgressPct !== null || Boolean(hud.actionText && hud.actionText.toLowerCase().includes('reboot'));
  const isChestBar = Boolean(hud.actionText && hud.actionText.toLowerCase().includes('chest'));

  const channelBorderClass = isReviveBar
    ? 'border-emerald-400'
    : isRebootBar
      ? 'border-cyan-400'
      : isChestBar
        ? 'border-[#facc15]'
        : 'border-sky-400';
  const channelTextClass = isReviveBar
    ? 'text-emerald-200'
    : isRebootBar
      ? 'text-cyan-200'
      : isChestBar
        ? 'text-amber-200'
        : 'text-sky-100';
  const channelFillClass = isReviveBar
    ? 'bg-emerald-400'
    : isRebootBar
      ? 'bg-cyan-400'
      : isChestBar
        ? 'bg-[#facc15]'
        : 'bg-sky-400';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Spatial Storm Vignette */}
      {(hud.inStorm || hud.stormProximity > 0.08) && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle, rgba(109, 40, 217, 0) 48%, rgba(126, 34, 206, ${stormAlpha.toFixed(2)}) 100%)`,
          }}
        />
      )}

      {/* Low HP / DBNO / Hit Damage Vignette */}
      <div
        ref={damageFlashRef}
        className="fixed inset-0 pointer-events-none transition-shadow duration-150"
        style={{
          boxShadow: hud.knocked
            ? 'inset 0 0 115px rgba(220, 38, 38, 0.55)'
            : hud.hp <= 25 && hud.alive
              ? 'inset 0 0 90px rgba(239, 68, 68, 0.45)'
              : 'inset 0 0 80px rgba(239, 68, 68, 0)',
        }}
      />

      {/* Sniper Scope */}
      {hud.sniperScope && !hideCrosshair && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(circle, transparent 28%, rgba(0, 0, 0, 0.94) 30%)' }}
        >
          <div className="absolute left-1/2 top-0 w-px h-full bg-white/45" />
          <div className="absolute top-1/2 left-0 h-px w-full bg-white/45" />
        </div>
      )}

      {/* Top-Center Fortnite Chapter Rotating Compass Strip */}
      <div
        data-testid="hud-compass"
        className="fixed top-2.5 left-1/2 -translate-x-1/2 w-80 sm:w-[440px] flex flex-col items-center pointer-events-none"
      >
        <div className="relative w-full h-7 bg-[#060d24]/85 border-b-2 border-white/25 overflow-hidden -skew-x-6">
          <div className="relative w-full h-full skew-x-6">
            {visibleCompassMarks.map((mk) => (
              <div
                key={mk.deg}
                className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                style={{ left: `${50 + (mk.delta / 75) * 48}%` }}
              >
                <div className={mk.cardinal ? 'w-[2px] h-2 bg-[#facc15]' : 'w-px h-1.5 bg-white/50'} />
                <span
                  className={
                    mk.cardinal
                      ? 'font-display text-[11px] font-black tracking-wider text-white leading-none mt-0.5'
                      : 'font-mono-num text-[9px] font-bold text-slate-300 leading-none mt-0.5'
                  }
                >
                  {mk.label}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-l-transparent border-r-transparent border-b-[#facc15]" />
        </div>
        <div className="px-2.5 py-0.5 bg-[#060d24]/95 border-x border-b border-white/15 text-[10px] font-mono-num font-bold text-[#fde047] leading-none">
          {Math.round(hud.yawDeg)}°
        </div>
      </div>

      {/* Center Dynamic Crosshair */}
      <div
        ref={crosshairRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ width: 26, height: 26, opacity: hideCrosshair ? 0 : 1 }}
      >
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[2px] h-[7px] bg-white/95 shadow-[0_0_3px_#000]" />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[2px] h-[7px] bg-white/95 shadow-[0_0_3px_#000]" />
        <div className="absolute top-1/2 left-0 -translate-y-1/2 h-[2px] w-[7px] bg-white/95 shadow-[0_0_3px_#000]" />
        <div className="absolute top-1/2 right-0 -translate-y-1/2 h-[2px] w-[7px] bg-white/95 shadow-[0_0_3px_#000]" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-[#fde047]" />
      </div>

      {/* Hitmarker */}
      <div
        ref={hitmarkerRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 w-6 h-6 pointer-events-none opacity-0 transition-opacity duration-75"
      >
        <div className="absolute left-[11px] top-0 w-[2px] h-6 bg-[#fde047]" />
        <div className="absolute top-[11px] left-0 h-[2px] w-6 bg-[#fde047]" />
      </div>

      {/* Top-Center Status Banners: Bus / Skydive / DBNO / Spectate / Storm / Squad Ping */}
      <div className="fixed top-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {hud.alive && hud.inBattleBus && (
          <div
            data-bus-banner="true"
            className={`bg-[#060d24]/95 border-2 -skew-x-6 px-6 py-2 text-center shadow-xl min-w-[330px] ${
              hud.busProgress < 0.14 ? 'border-sky-400' : 'border-[#facc15]'
            }`}
          >
            <div className="skew-x-6">
              <div
                className={`font-display text-sm font-black uppercase tracking-widest ${
                  hud.busProgress < 0.14 ? 'text-sky-300' : 'text-[#fde047]'
                }`}
              >
                {hud.busProgress < 0.14
                  ? `APPROACHING ISLAND · DROP READY IN ${Math.max(1, Math.ceil((0.14 - hud.busProgress) * BUS_DURATION_SEC))}S`
                  : `BATTLE BUS OVER ISLAND · PRESS [${kJump}] TO DROP`}
              </div>
              <div className="w-full h-1.5 mt-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    hud.busProgress < 0.14 ? 'bg-sky-400' : 'bg-[#facc15]'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, Math.round(hud.busProgress * 100)))}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {hud.alive && !hud.inBattleBus && hud.isSkydiving && (
          <div
            data-skydive-banner="true"
            className="bg-[#060d24]/95 border-2 border-sky-400 -skew-x-6 px-6 py-2 text-center shadow-xl"
          >
            <div className="skew-x-6">
              <div className="font-display text-sm font-black uppercase tracking-widest text-sky-300">
                {hud.isGliding ? 'GLIDER DEPLOYED' : 'SKYDIVING'} · ALTITUDE{' '}
                <span className="font-mono-num text-white">{Math.round(hud.altitude)}M</span>
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300 mt-0.5">
                PRESS [{kJump}] TO TOGGLE GLIDER · LAND WITH PICKAXE TO LOOT
              </div>
            </div>
          </div>
        )}

        {hud.alive && hud.knocked && (
          <div
            data-testid="hud-dbno-banner"
            className={`px-6 py-2 border-2 -skew-x-6 text-center shadow-xl ${
              hud.beingRevived
                ? 'bg-emerald-950/95 border-emerald-400'
                : 'bg-rose-950/95 border-rose-400'
            }`}
          >
            <div className="skew-x-6">
              <div
                className={`font-display text-sm font-black uppercase tracking-[0.16em] ${
                  hud.beingRevived ? 'text-emerald-300' : 'text-rose-200'
                }`}
              >
                {hud.beingRevived ? 'BEING REVIVED · HOLD POSITION' : 'KNOCKED DOWN · CRAWL TO COVER'}
              </div>
              <div className="text-[11px] font-mono-num font-bold text-white/90 mt-0.5">
                DBNO HEALTH {Math.max(0, hud.dbnoHp)} / 100 · {hud.beingRevived ? 'BLEEDOUT PAUSED' : 'BLEEDING OUT'}
              </div>
            </div>
          </div>
        )}

        {!hud.alive && (
          <div
            data-testid="hud-spectator-banner"
            className="pointer-events-auto bg-[#060d24]/95 border-2 border-cyan-400 -skew-x-6 px-5 py-2.5 flex items-center gap-4 shadow-2xl"
          >
            <div className="skew-x-6 flex items-center gap-4">
              <button
                type="button"
                aria-label="Previous Squadmate"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleSpectate?.(-1);
                }}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-cyan-400 hover:text-slate-950 text-xs font-display font-black text-white cursor-pointer"
              >
                ◀
              </button>
              <div className="text-center">
                <div className="text-[10px] font-display font-black uppercase tracking-[0.2em] text-cyan-300">
                  Eliminated · Awaiting Squad Reboot
                </div>
                <div className="font-display text-sm font-black uppercase tracking-wider text-white">
                  Spectating: {hud.spectatingName ?? 'Living Squadmate'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Next Squadmate"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCycleSpectate?.(1);
                }}
                className="px-2.5 py-1 rounded bg-white/10 hover:bg-cyan-400 hover:text-slate-950 text-xs font-display font-black text-white cursor-pointer"
              >
                ▶
              </button>
            </div>
          </div>
        )}

        {(hud.inStorm || hud.stormProximity > 0.2) && (
          <div
            className={`px-4 py-1.5 border font-display text-xs font-black uppercase tracking-widest shadow-lg -skew-x-6 ${
              hud.inStorm
                ? 'bg-purple-950/95 border-purple-400 text-purple-200'
                : 'bg-[#060d24]/95 border-amber-400 text-amber-300'
            }`}
          >
            <span className="inline-block skew-x-6">
              {hud.inStorm ? 'INSIDE STORM · TAKE COVER' : 'STORM APPROACHING · MOVE TO SAFE ZONE'}
            </span>
          </div>
        )}

        {hud.activePingText && (
          <div
            data-testid="hud-ping-banner"
            className="px-4 py-1 -skew-x-6 bg-sky-950/95 border border-sky-400 font-display text-[11px] font-black uppercase tracking-wider text-sky-200 shadow-lg"
          >
            <span className="inline-block skew-x-6">{hud.activePingText}</span>
          </div>
        )}
      </div>

      {/* Reload Bar */}
      {hud.reloadPct !== null && !hideCrosshair && (
        <div className="fixed left-1/2 top-[56%] -translate-x-1/2 w-28 h-2 bg-slate-950/85 border border-white/40 rounded overflow-hidden pointer-events-none">
          <div className="h-full bg-[#facc15]" style={{ width: `${hud.reloadPct}%` }} />
        </div>
      )}

      {/* Out of Ammo Warning */}
      {hud.noAmmoHint && !hideCrosshair && (
        <div className="fixed left-1/2 top-[58%] -translate-x-1/2 bg-rose-950/95 border border-rose-400 px-3.5 py-1 rounded text-[11px] font-display font-bold uppercase tracking-wider text-rose-200 shadow-lg pointer-events-none whitespace-nowrap">
          OUT OF RESERVE AMMO · LOOT AMMO BOXES OR CHESTS
        </div>
      )}

      {/* Revive / Reboot / Healing / Chest Channel Progress Bar */}
      {hud.actionText && hud.actionPct !== null && !hideCrosshair && (
        <div
          data-channel-bar="true"
          className={`fixed left-1/2 top-[61%] -translate-x-1/2 w-64 bg-[#060d24]/95 border-2 -skew-x-6 px-4 py-2 text-center pointer-events-none shadow-xl ${channelBorderClass}`}
        >
          <div className="skew-x-6">
            <div className={`text-xs font-display font-black uppercase tracking-wider ${channelTextClass}`}>
              {hud.actionText}
            </div>
            <div className="w-full h-2 mt-1.5 bg-slate-800 rounded overflow-hidden">
              <div className={`h-full ${channelFillClass}`} style={{ width: `${hud.actionPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Interact Prompt */}
      {hud.interactText && !hud.backpackOpen && !hud.inBattleBus && hud.alive && !hud.knocked && (
        <div className="fixed left-1/2 top-[53%] -translate-x-1/2 bg-[#060d24]/95 border-2 border-[#facc15] -skew-x-6 px-4 py-1.5 text-xs font-display font-bold uppercase tracking-wider text-amber-200 shadow-lg pointer-events-none whitespace-nowrap">
          <span className="inline-block skew-x-6">{hud.interactText}</span>
        </div>
      )}

      {/* Damage Numbers Overlay */}
      <div ref={damageNumbersRef} className="fixed inset-0 pointer-events-none overflow-hidden" />

      {/* Top-Left Cluster: POI Location + Squad Roster + Kill Feed */}
      <div className="fixed top-4 left-4 flex flex-col gap-1.5 max-w-xs">
        <div className="bg-[#060d24]/92 border-l-4 border-[#facc15] px-3.5 py-1.5 rounded-r flex items-center justify-between gap-4 shadow-lg">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">Sector</div>
            <div className="font-display text-sm font-black tracking-wider text-white">{hud.poiName}</div>
          </div>
          <div className="text-[10px] font-display font-black uppercase tracking-wider text-sky-300 border-l border-white/15 pl-3">
            {hud.teamMode.toUpperCase()} · {modeBadge}
          </div>
        </div>

        {(hud.teammates.length > 0 || hud.teamMode !== 'solo') && (
          <div
            data-testid="hud-squad-roster"
            className="bg-[#060d24]/92 border-l-4 border-emerald-400 px-3 py-2 rounded-r flex flex-col gap-1.5 shadow-lg"
          >
            <div className="flex items-center justify-between text-[10px] font-display font-black uppercase tracking-wider">
              <span className="text-emerald-300">{hud.teamMode.toUpperCase()} SQUAD</span>
              <span className="font-mono-num text-slate-300">
                {hud.teammates.filter((t) => t.alive).length + (hud.alive ? 1 : 0)} ACTIVE
              </span>
            </div>
            {hud.teammates.length === 0 ? (
              <div className="text-[11px] font-semibold text-slate-400">No Fill · Solo Squad</div>
            ) : (
              hud.teammates.map((mate) => (
                <div key={mate.id} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span
                      className={`truncate ${
                        mate.alive ? (mate.knocked ? 'text-amber-300' : 'text-white') : 'text-slate-400 line-through'
                      }`}
                    >
                      {mate.name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {mate.alive && mate.knocked && (
                        <span className="text-[9px] font-display font-black px-1.5 py-0.2 rounded bg-rose-500/30 border border-rose-400/50 text-rose-200 uppercase">
                          DBNO
                        </span>
                      )}
                      <span
                        className={`text-[9px] font-display px-1.5 py-0.2 rounded ${
                          mate.isHuman ? 'bg-sky-500/25 text-sky-300' : 'bg-emerald-500/25 text-emerald-300'
                        }`}
                      >
                        {mate.isHuman ? 'ALLY' : 'BOT'}
                      </span>
                      {mate.kills > 0 && (
                        <span className="font-mono-num text-[10px] text-amber-300">{mate.kills}K</span>
                      )}
                    </div>
                  </div>
                  {mate.alive ? (
                    mate.knocked ? (
                      <div className="bg-slate-800 h-1.5 rounded overflow-hidden">
                        <div
                          className="h-full bg-rose-500 transition-all duration-150"
                          style={{ width: `${Math.max(0, Math.min(100, mate.hp))}%` }}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-1 h-1.5">
                        <div className="bg-slate-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 transition-all duration-150"
                            style={{ width: `${Math.max(0, Math.min(100, mate.hp))}%` }}
                          />
                        </div>
                        <div className="bg-slate-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-sky-400 transition-all duration-150"
                            style={{ width: `${Math.max(0, Math.min(100, mate.shield))}%` }}
                          />
                        </div>
                      </div>
                    )
                  ) : mate.hasRebootCard ? (
                    <div className="text-[9px] font-display font-bold uppercase tracking-wider text-cyan-300">
                      REBOOT CARD · {mate.rebootExpiresSec ?? 0}S
                    </div>
                  ) : (
                    <div className="text-[9px] font-display uppercase tracking-wider text-rose-400">ELIMINATED</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {hud.heldRebootCards.length > 0 && hud.alive && (
          <div
            data-testid="hud-reboot-cards"
            className="bg-cyan-950/92 border-l-4 border-cyan-400 px-3 py-2 rounded-r flex flex-col gap-1 shadow-lg"
          >
            <div className="flex items-center justify-between text-[10px] font-display font-black uppercase tracking-wider text-cyan-300">
              <span>Reboot Cards ({hud.heldRebootCards.length})</span>
              <span>{hud.nearbyRebootVan ? `[${kInteract}] Reboot!` : 'Visit Van'}</span>
            </div>
            {hud.heldRebootCards.map((card) => (
              <div key={card.id} className="flex items-center justify-between text-[11px] font-bold text-white">
                <span className="truncate">{card.name}</span>
                <span className="font-mono-num text-cyan-300">{card.expiresSec}s</span>
              </div>
            ))}
          </div>
        )}

        {hud.killFeed.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {hud.killFeed.map((entry, idx) => (
              <div
                key={`${entry}-${idx}`}
                className="bg-[#060d24]/85 px-2.5 py-1 rounded text-[11px] font-semibold text-slate-200 border border-white/10"
              >
                {entry}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-Right Cluster: Minimap + Match Stats + Utility Buttons */}
      <div className="fixed top-4 right-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Toggle Tactical Map"
            title={`Tactical Map [${kMap}]`}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMap();
            }}
            className="w-8 h-8 rounded bg-[#060d24]/90 border border-white/20 hover:border-amber-300 flex items-center justify-center text-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            title={muted ? 'Unmute' : 'Mute'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-8 h-8 rounded bg-[#060d24]/90 border border-white/20 hover:border-sky-300 flex items-center justify-center text-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {muted ? (
                <path d="M22 9l-6 6M16 9l6 6" />
              ) : (
                <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
              )}
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Match"
            title="Pause [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-8 h-8 rounded bg-[#060d24]/90 border border-white/20 hover:border-amber-300 flex items-center justify-center text-slate-100 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </div>

        <canvas
          ref={minimapRef}
          width={196}
          height={196}
          className="w-40 h-40 sm:w-44 sm:h-44 rounded-lg border-2 border-white/40 bg-[#060d24]/90 shadow-lg"
        />

        <div className="flex items-center gap-2 bg-[#060d24]/92 border border-white/20 px-3 py-1.5 -skew-x-6 text-xs font-bold tabular-nums">
          <div className="skew-x-6 flex items-center gap-2">
            <span className="text-slate-200">
              ALIVE <strong className="font-mono-num text-white ml-1">{hud.aliveCount}</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-amber-300">
              ELIMS <strong className="font-mono-num ml-1">{hud.kills}</strong>
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="text-purple-300">
              STORM <strong className="font-mono-num ml-1">{stormFormatted}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom-Left Authentic Fortnite Chapter Vitals: Shield & Health Bars (or DBNO Bleedout Bar) */}
      <div className="fixed bottom-5 left-5 w-72 sm:w-80 max-w-[44vw] flex flex-col gap-1.5">
        <div className="bg-[#060d24]/88 border border-white/15 px-2.5 py-1 rounded text-[10px] font-medium text-sky-200 truncate">
          {controlsHint}
        </div>

        {hud.knocked ? (
          <div className="relative h-7 bg-[#060d24]/95 border-2 border-rose-400/70 -skew-x-6 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                hud.beingRevived
                  ? 'bg-gradient-to-r from-emerald-500 to-lime-400'
                  : 'bg-gradient-to-r from-rose-600 to-red-400'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, hud.dbnoHp))}%` }}
            />
            <div className="absolute inset-0 skew-x-6 flex items-center justify-between px-3 text-xs font-display font-black tracking-wider text-white drop-shadow">
              <span>{hud.beingRevived ? 'REVIVING...' : 'DBNO · BLEEDOUT'}</span>
              <span className="font-mono-num">{hud.dbnoHp}</span>
            </div>
          </div>
        ) : (
          <>
            <div className="relative h-5 bg-[#060d24]/92 border border-sky-300/45 -skew-x-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, hud.shield))}%` }}
              />
              <div className="absolute inset-0 skew-x-6 flex items-center justify-between px-3 text-[11px] font-display font-bold tracking-wider text-white drop-shadow">
                <span>SHIELD</span>
                <span className="font-mono-num">{hud.shield}</span>
              </div>
            </div>
            <div className="relative h-6 bg-[#060d24]/92 border border-emerald-300/50 -skew-x-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, hud.hp))}%` }}
              />
              <div className="absolute inset-0 skew-x-6 flex items-center justify-between px-3 text-xs font-display font-black tracking-wider text-white drop-shadow">
                <span>HEALTH</span>
                <span className="font-mono-num">{hud.hp}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom-Right Cluster: Ammo Reserve + Active Item Info + Backpack + Pickaxe + 5-Slot Loadout */}
      <div className="fixed bottom-5 right-5 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="flex items-center gap-1.5 bg-[#060d24]/92 border border-white/15 px-2.5 py-1 rounded text-[10px] font-mono-num font-bold">
          {(['medium', 'shells', 'light', 'heavy'] as AmmoType[]).map((at) => {
            const def = AMMO_DEFS[at];
            const count = hud.ammoBag[at] ?? 0;
            const matchesActive = !hud.pickaxeEquipped && activeItem?.ammoType === at;
            return (
              <span
                key={at}
                className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                  matchesActive ? 'bg-white/15 ring-1 ring-white/35' : ''
                }`}
                style={{ color: count > 0 ? def.color : '#64748b' }}
              >
                <span>{def.short}</span>
                <span className={count > 0 ? 'text-white' : 'text-slate-500'}>{count}</span>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-[#060d24]/90 border border-white/15 px-2.5 py-1 rounded text-[11px] font-semibold text-slate-200">
            {hud.pickaxeEquipped ? (
              <>
                Tactical Pickaxe · <span className="text-sky-300">Harvesting &amp; Melee (25 DMG)</span>
              </>
            ) : activeItem ? (
              <>
                {activeItem.name} ·{' '}
                <span className="text-slate-400">
                  {activeItem.type === 'gun'
                    ? `${activeItem.ammo} / ${activeItem.reserveAmmo ?? 0} ${AMMO_DEFS[activeItem.ammoType ?? 'medium'].short}`
                    : activeItem.role}
                </span>
              </>
            ) : (
              <span className="text-slate-400">Empty Slot · Find Weapons Or Open Chests</span>
            )}
          </div>

          <button
            type="button"
            tabIndex={-1}
            data-backpack-toggle="true"
            aria-label={`Open Backpack [${kBag}]`}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleBackpack();
            }}
            className={`px-3 py-1 -skew-x-6 border text-[11px] font-display font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              hud.backpackOpen
                ? 'bg-sky-400 border-sky-200 text-slate-950'
                : 'bg-[#060d24]/92 border-white/25 text-sky-200 hover:border-sky-300'
            }`}
          >
            <span className="inline-block skew-x-6">[{kBag}] Backpack</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            data-pickaxe-slot="true"
            aria-label={`Equip Tactical Pickaxe [${kPickaxe}]`}
            onClick={(e) => {
              e.currentTarget.blur();
              onSelectPickaxe();
            }}
            style={{ borderColor: '#38bdf8' }}
            className={`relative w-[70px] h-[72px] rounded-md bg-[#060d24]/92 border-2 flex flex-col items-center justify-between p-1.5 cursor-pointer transition-transform ${
              hud.pickaxeEquipped
                ? '-translate-y-1.5 shadow-[0_6px_14px_rgba(56,189,248,0.35)]'
                : 'opacity-85 hover:opacity-100'
            }`}
          >
            <span className="self-start text-[10px] font-mono-num font-bold text-sky-300 leading-none">
              {kPickaxe}
            </span>
            <WeaponIcon id="pickaxe" className="w-6 h-6" />
            <span className="text-[9px] font-display font-bold uppercase tracking-wider text-white leading-none">
              AXE
            </span>
            <span className="text-[10px] font-mono-num font-bold text-sky-300 leading-none">MELEE</span>
          </button>

          {hud.slots.map((slot, idx) => {
            const isActive = !hud.pickaxeEquipped && idx === hud.activeSlot;
            const slotKey = formatKeyCodeLabel(kb[SLOT_KEYBIND_ACTIONS[idx]]);
            return (
              <button
                key={idx}
                type="button"
                tabIndex={-1}
                aria-label={slot ? `Slot ${idx + 1}: ${slot.name}` : `Empty Slot ${idx + 1}`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectSlot(idx);
                }}
                style={{
                  borderColor: slot ? slot.rarityColor : 'rgba(255,255,255,0.22)',
                  background: slot
                    ? `linear-gradient(180deg, rgba(6,13,36,0.92) 0%, ${slot.rarityColor}26 100%)`
                    : 'rgba(6,13,36,0.9)',
                }}
                className={`relative w-[70px] h-[72px] rounded-md border-2 flex flex-col items-center justify-between p-1.5 cursor-pointer transition-transform ${
                  isActive ? '-translate-y-1.5 ring-2 ring-white/80' : 'opacity-85 hover:opacity-100'
                }`}
              >
                <span className="self-start text-[10px] font-mono-num font-bold text-slate-300 leading-none">
                  {slotKey}
                </span>
                {slot ? (
                  <>
                    <WeaponIcon id={slot.id} className="w-6 h-6" />
                    <span className="text-[9px] font-display font-bold uppercase tracking-wider text-white leading-none">
                      {slot.short}
                    </span>
                    <span
                      className={`text-[10px] font-mono-num font-bold leading-none ${
                        slot.type === 'gun' && slot.ammo === 0 && (slot.reserveAmmo ?? 0) === 0
                          ? 'text-rose-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {slot.type === 'gun' ? `${slot.ammo}/${slot.reserveAmmo ?? 0}` : 'USE'}
                    </span>
                  </>
                ) : (
                  <span className="m-auto text-slate-600 text-sm font-bold">—</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

