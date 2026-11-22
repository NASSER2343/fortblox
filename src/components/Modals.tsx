import { useEffect, useState, type RefObject } from 'react';
import { AMMO_DEFS, DEFAULT_KEYBINDS, TEAM_MODE_DEFS } from '../game/constants';
import { formatKeyCodeLabel } from '../game/rules';
import type { AmmoBag, AmmoType, HudSlotSummary, KeybindsConfig, MatchSummary } from '../game/types';
import { CrownEmblemIcon, CrosshairSkullIcon, WeaponIcon } from './GameIcons';

interface TacticalMapModalProps {
  open: boolean;
  bigMapRef: RefObject<HTMLCanvasElement | null>;
  keybinds?: KeybindsConfig;
  onClose: () => void;
}

export function TacticalMapModal({ open, bigMapRef, keybinds, onClose }: TacticalMapModalProps) {
  if (!open) return null;
  const mapKey = formatKeyCodeLabel((keybinds ?? DEFAULT_KEYBINDS).map);
  return (
    <div className="fixed inset-0 z-30 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-4">
      <div className="flex items-center justify-between w-full max-w-[560px]">
        <div className="px-4 py-1 -skew-x-6 bg-[#facc15] text-slate-950">
          <h2 className="skew-x-6 font-display text-base font-black tracking-widest uppercase">
            Island Tactical Map
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 -skew-x-6 bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-display font-bold uppercase tracking-wider text-white cursor-pointer"
        >
          <span className="inline-block skew-x-6">Close [{mapKey}]</span>
        </button>
      </div>
      <canvas
        ref={bigMapRef}
        width={560}
        height={560}
        className="w-[560px] h-[560px] max-w-[90vw] max-h-[78vh] rounded-lg border-2 border-[#facc15]"
      />
    </div>
  );
}

interface BackpackModalProps {
  open: boolean;
  slots: Array<HudSlotSummary | null>;
  ammoBag: AmmoBag;
  activeSlot: number;
  pickaxeEquipped: boolean;
  keybinds?: KeybindsConfig;
  onSelectSlot: (idx: number) => void;
  onSwapSlots: (idxA: number, idxB: number) => void;
  onDropSlot: (idx: number) => void;
  onClose: () => void;
}

export function BackpackModal({
  open,
  slots,
  ammoBag,
  activeSlot,
  pickaxeEquipped,
  keybinds,
  onSelectSlot,
  onSwapSlots,
  onDropSlot,
  onClose,
}: BackpackModalProps) {
  const [selectedSwapIdx, setSelectedSwapIdx] = useState<number | null>(null);
  const bagKey = formatKeyCodeLabel((keybinds ?? DEFAULT_KEYBINDS).backpack);

  useEffect(() => {
    if (!open) setSelectedSwapIdx(null);
  }, [open]);

  if (!open) return null;

  const handleSlotAction = (idx: number) => {
    if (selectedSwapIdx === null) {
      if (slots[idx]) setSelectedSwapIdx(idx);
      return;
    }
    if (selectedSwapIdx === idx) {
      setSelectedSwapIdx(null);
      return;
    }
    onSwapSlots(selectedSwapIdx, idx);
    setSelectedSwapIdx(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tactical Backpack"
      data-backpack-modal="true"
      className="fixed inset-0 z-30 bg-slate-950/80 flex items-center justify-center p-4"
    >
      <div className="bg-[#0a122d] border-2 border-sky-400 rounded-xl p-6 shadow-2xl max-w-2xl w-full flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-3">
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-widest text-sky-300">
              Backpack &amp; Loadout
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              {selectedSwapIdx !== null
                ? `Selected Slot ${selectedSwapIdx + 1} — click any other slot to swap positions.`
                : 'Select an item to reorder slots, equip directly, or drop it onto the island.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-display font-bold uppercase tracking-wider text-white cursor-pointer shrink-0"
          >
            Close [{bagKey}]
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {slots.map((slot, idx) => {
            const isSelectedForSwap = selectedSwapIdx === idx;
            const isEquipped = !pickaxeEquipped && activeSlot === idx && slot !== null;
            const borderColor = isSelectedForSwap
              ? '#fde047'
              : slot
                ? slot.rarityColor
                : 'rgba(255,255,255,0.22)';

            return (
              <div
                key={idx}
                style={{ borderColor }}
                className={`rounded-lg bg-[#0f172a] border-2 p-2.5 flex flex-col justify-between gap-2 min-h-[176px] ${
                  isSelectedForSwap ? 'ring-2 ring-[#fde047]' : ''
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono-num font-bold">
                  <span className="text-slate-400">SLOT {idx + 1}</span>
                  {isEquipped && <span className="text-[#fde047] uppercase">ACTIVE</span>}
                </div>

                <button
                  type="button"
                  disabled={!slot && selectedSwapIdx === null}
                  aria-label={
                    selectedSwapIdx !== null
                      ? `Move slot ${selectedSwapIdx + 1} to slot ${idx + 1}`
                      : slot
                        ? `Select slot ${idx + 1} to move: ${slot.name}`
                        : `Empty slot ${idx + 1}`
                  }
                  onClick={() => handleSlotAction(idx)}
                  className={`flex-1 rounded bg-slate-950/75 border border-white/10 p-2 flex flex-col items-center justify-center gap-1.5 text-center ${
                    slot || selectedSwapIdx !== null
                      ? 'hover:border-sky-300 cursor-pointer'
                      : 'opacity-50 cursor-default'
                  }`}
                >
                  {slot ? (
                    <>
                      <WeaponIcon id={slot.id} className="w-8 h-8" />
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: slot.rarityColor }}>
                        {slot.rarityName}
                      </div>
                      <div className="text-xs font-display font-bold text-white leading-tight">{slot.name}</div>
                      <div className="text-[10px] font-mono-num font-bold text-amber-300">
                        {slot.type === 'gun' ? `${slot.ammo}/${slot.mag} · RES ${slot.reserveAmmo ?? 0}` : 'CONSUMABLE'}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      {selectedSwapIdx !== null ? 'Move Here' : 'Empty'}
                    </span>
                  )}
                </button>

                {slot ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      aria-label={`Equip slot ${idx + 1}: ${slot.name}`}
                      onClick={() => {
                        onSelectSlot(idx);
                        onClose();
                      }}
                      className="py-1 rounded bg-sky-400 hover:bg-sky-300 text-slate-950 font-display text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Equip
                    </button>
                    <button
                      type="button"
                      aria-label={`Drop slot ${idx + 1}: ${slot.name}`}
                      onClick={() => {
                        if (selectedSwapIdx === idx) setSelectedSwapIdx(null);
                        onDropSlot(idx);
                      }}
                      className="py-1 rounded bg-rose-500/85 hover:bg-rose-400 text-white font-display text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Drop
                    </button>
                  </div>
                ) : (
                  <div className="h-[22px]" />
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10">
          {(['medium', 'shells', 'light', 'heavy'] as AmmoType[]).map((at) => {
            const def = AMMO_DEFS[at];
            return (
              <div
                key={at}
                className="bg-slate-950/75 border border-white/10 rounded px-2.5 py-1.5 flex items-center justify-between text-xs font-mono-num font-bold"
              >
                <span style={{ color: def.color }}>{def.name.split(' ')[0].toUpperCase()}</span>
                <span className="text-white">{ammoBag[at] ?? 0}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PirateTokenBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="fixed top-[14%] left-1/2 -translate-x-1/2 z-50 pointer-events-none rounded-2xl px-8 py-5 text-center shadow-[0_20px_60px_rgba(245,158,11,0.55)] border-2 border-[#fef08a] animate-bounce"
      style={{
        background: 'linear-gradient(135deg, rgba(69,26,3,0.96) 0%, rgba(120,53,15,0.96) 50%, rgba(45,16,4,0.98) 100%)',
      }}
    >
      <div className="flex items-center justify-center gap-4">
        <svg viewBox="0 0 48 48" className="w-12 h-12 shrink-0" aria-hidden="true">
          <circle cx="24" cy="24" r="21" fill="#f59e0b" stroke="#fef08a" strokeWidth="3" />
          <circle cx="24" cy="24" r="16" fill="#78350f" stroke="#fde047" strokeWidth="1.5" />
          <path
            d="M24 12a9 9 0 0 0-9 9c0 3 1.5 5.4 3.6 6.8V32h10.8v-4.2C31.5 26.4 33 24 33 21a9 9 0 0 0-9-9zm-3.2 10.8a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z"
            fill="#fef08a"
          />
          <path d="M14 35l20-20M34 35L14 15" stroke="#fde047" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
        </svg>
        <div className="text-left">
          <div className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-amber-300">
            Mythic Treasure Reward
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-black uppercase tracking-wider text-[#fef08a] leading-tight">
            Pirate Token Found!
          </h2>
          <p className="text-xs sm:text-sm font-semibold text-white/95 mt-0.5">
            24H Unlimited Free Item Shop Access &amp; Mythic Gold Man Skin Unlocked!
          </p>
        </div>
      </div>
    </div>
  );
}

interface PauseModalProps {
  open: boolean;
  onResume: () => void;
  onRestart: () => void;
  onLobby: () => void;
}

export function PauseModal({ open, onResume, onRestart, onLobby }: PauseModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Match Paused"
      className="fixed inset-0 z-40 bg-slate-950/88 flex flex-col items-center justify-center gap-5 p-6 text-center"
    >
      <div className="bg-[#0a122d] border border-white/20 rounded-xl px-10 py-8 flex flex-col items-center gap-5 shadow-2xl max-w-md w-full">
        <h2 className="font-display text-3xl font-bold uppercase tracking-widest text-sky-300">Match Paused</h2>
        <div className="flex flex-wrap items-center justify-center gap-3 w-full">
          <button
            type="button"
            onClick={onResume}
            className="px-6 py-3 rounded bg-[#facc15] hover:bg-[#fde047] text-slate-950 font-display text-sm font-bold uppercase tracking-wider cursor-pointer"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="px-6 py-3 rounded bg-white/10 hover:bg-white/20 text-white font-display text-sm font-bold uppercase tracking-wider cursor-pointer"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={onLobby}
            className="px-6 py-3 rounded bg-sky-400 hover:bg-sky-300 text-slate-950 font-display text-sm font-bold uppercase tracking-wider cursor-pointer"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}

interface EndMatchModalProps {
  summary: MatchSummary | null;
  onPlayAgain: () => void;
  onLobby: () => void;
}

export function EndMatchModal({ summary, onPlayAgain, onLobby }: EndMatchModalProps) {
  if (!summary) return null;

  const isWin = summary.isVictory;
  const teamLabel = TEAM_MODE_DEFS[summary.teamMode].label.toUpperCase();
  const modeLabel =
    summary.matchMode === 'ranked'
      ? `${teamLabel} · Ranked Battle Royale`
      : `${teamLabel} · Battle Royale · ${summary.botDifficulty.toUpperCase()}`;
  const rpDelta = summary.rankUpdate?.delta ?? 0;
  const rpSign = rpDelta >= 0 ? '+' : '';
  const victoryHeadline =
    summary.teamMode !== 'solo' ? 'TEAM #1 VICTORY ROYALE' : '#1 VICTORY ROYALE';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isWin ? 'Victory Royale' : 'Eliminated'}
      className="fixed inset-0 z-40 bg-slate-950/88 flex flex-col items-center justify-center p-6 text-center overflow-hidden"
    >
      {isWin && (
        <div
          aria-hidden="true"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[780px] h-[780px] pointer-events-none opacity-25 animate-spin-slow"
          style={{
            background:
              'repeating-conic-gradient(from 0deg, rgba(250,204,21,0.55) 0deg 10deg, transparent 10deg 24deg)',
            maskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
            WebkitMaskImage: 'radial-gradient(circle, black 12%, transparent 66%)',
          }}
        />
      )}

      <div
        className={`relative z-10 w-full max-w-xl rounded-xl border-2 px-8 py-7 shadow-2xl flex flex-col items-center gap-5 ${
          isWin
            ? 'bg-[#09122e] border-[#fde047] shadow-[0_0_70px_rgba(250,204,21,0.38)]'
            : 'bg-[#091128] border-rose-500/70 shadow-[0_0_55px_rgba(244,63,94,0.28)]'
        }`}
      >
        {isWin ? (
          <div className="flex flex-col items-center gap-2 w-full">
            <CrownEmblemIcon className="w-16 h-16 drop-shadow-[0_6px_14px_rgba(250,204,21,0.55)]" />
            <div className="w-full py-2.5 px-6 -skew-x-12 bg-gradient-to-r from-[#fef08a] via-[#facc15] to-[#eab308] border-2 border-white shadow-lg">
              <div className="skew-x-12 font-display text-2xl sm:text-4xl font-black uppercase tracking-[0.14em] text-slate-950 leading-none">
                {victoryHeadline}
              </div>
            </div>
            <div className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-amber-200 mt-1">
              {modeLabel}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 w-full">
            <div className="flex items-center gap-3">
              <CrosshairSkullIcon className="w-12 h-12 shrink-0" />
              <div className="text-left">
                <div className="text-[11px] font-display font-bold uppercase tracking-[0.22em] text-slate-400">
                  {modeLabel}
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-[0.14em] text-rose-400 leading-none">
                  ELIMINATED · #{summary.placement}
                </h2>
              </div>
            </div>

            {summary.eliminatedBy && (
              <div className="w-full rounded-lg bg-slate-950/85 border border-rose-500/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-left">
                  <span className="text-slate-400 uppercase font-display tracking-wider mr-1.5">Eliminated By</span>
                  <strong className="font-display text-sm font-black uppercase text-white">
                    {summary.eliminatedBy.name}
                  </strong>
                </div>
                <div className="flex items-center gap-3 font-mono-num text-slate-200">
                  <span className="text-rose-300 font-bold">{summary.eliminatedBy.weaponName}</span>
                  {summary.eliminatedBy.distanceM > 0 && (
                    <span className="text-amber-300 font-bold">{summary.eliminatedBy.distanceM}m</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {summary.teamMode !== 'solo' && summary.teammateNames && summary.teammateNames.length > 0 && (
          <div className="w-full rounded-lg bg-emerald-950/35 border border-emerald-400/35 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-display font-bold uppercase tracking-wider text-emerald-300">
              Squadmates: <strong className="text-white ml-1">{summary.teammateNames.join(' · ')}</strong>
            </span>
            {typeof summary.teamAlive === 'number' && (
              <span className="font-mono-num font-bold text-amber-300">{summary.teamAlive} Alive At Finish</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 w-full border-y border-white/15 py-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Placement</div>
            <div className="font-mono-num text-2xl font-black text-white mt-1">#{summary.placement} / 25</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Eliminations</div>
            <div className="font-mono-num text-2xl font-black text-[#fde047] mt-1">{summary.kills}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Damage Dealt</div>
            <div className="font-mono-num text-2xl font-black text-sky-300 mt-1">{summary.damageDealt}</div>
          </div>
        </div>

        {summary.rankUpdate && (
          <div className="w-full rounded-lg bg-purple-950/50 border border-purple-400/50 px-4 py-3 flex items-center justify-between gap-4">
            <div className="text-left">
              <div className="text-[10px] font-display font-bold uppercase tracking-widest text-purple-300">
                Ranked Rating Update
              </div>
              <div className="font-display text-base font-black uppercase tracking-wide" style={{ color: summary.rankUpdate.nextColor }}>
                {summary.rankUpdate.prevLabel === summary.rankUpdate.nextLabel
                  ? summary.rankUpdate.nextLabel
                  : `${summary.rankUpdate.prevLabel} → ${summary.rankUpdate.nextLabel}`}
              </div>
            </div>
            <div className="text-right font-mono-num">
              <div className={`text-lg font-black ${rpDelta >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                {rpSign}
                {rpDelta} RP
              </div>
              <div className="text-xs text-slate-300">{summary.rankUpdate.nextRp.toLocaleString()} Total RP</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-4 w-full">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="px-8 py-3.5 -skew-x-6 bg-[#facc15] hover:bg-[#fde047] text-slate-950 font-display text-sm font-black uppercase tracking-widest cursor-pointer shadow-lg border border-[#fef08a]"
          >
            <span className="inline-block skew-x-6">Play Again</span>
          </button>
          <button
            type="button"
            onClick={onLobby}
            className="px-8 py-3.5 -skew-x-6 bg-sky-400 hover:bg-sky-300 text-slate-950 font-display text-sm font-black uppercase tracking-widest cursor-pointer shadow-lg"
          >
            <span className="inline-block skew-x-6">Return To Lobby</span>
          </button>
        </div>
      </div>
    </div>
  );
}

