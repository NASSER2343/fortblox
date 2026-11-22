import type { WeaponId } from '../game/types';

export function FortbloxEmblem({ className = 'w-56 h-11' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 280 52"
      className={className}
      role="img"
      aria-label="Fortblox Royale"
    >
      <defs>
        <linearGradient id="fbGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>
      {/* Shield Crest Icon */}
      <path
        d="M8 8 L28 4 L48 8 L44 31 L28 46 L12 31 Z"
        fill="#0f172a"
        stroke="#facc15"
        strokeWidth="2.5"
      />
      <path d="M28 11 L39 14 L37 28 L28 38 L19 28 L17 14 Z" fill="#1e3a8a" />
      <path d="M28 15 L34 25 H22 Z" fill="url(#fbGold)" />
      {/* Wordmark */}
      <text
        x="62"
        y="29"
        fill="#f8fafc"
        fontFamily="Chakra Petch, sans-serif"
        fontWeight="700"
        fontSize="24"
        letterSpacing="2"
      >
        FORTBLOX
      </text>
      <text
        x="63"
        y="44"
        fill="#facc15"
        fontFamily="Chakra Petch, sans-serif"
        fontWeight="700"
        fontSize="12"
        letterSpacing="5"
      >
        ROYALE
      </text>
    </svg>
  );
}

export function WeaponIcon({ id, className = 'w-6 h-6' }: { id: WeaponId; className?: string }) {
  switch (id) {
    case 'pickaxe':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path
            d="M4 20L15.5 8.5"
            stroke="#94a3b8"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M5 19L15 9"
            stroke="#0f172a"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M9.5 4.5C13.5 4.2 17.5 6.2 19.8 10.5L17.4 11.4C15.8 8.6 13.4 7.3 10.3 7.5L9.5 4.5Z"
            fill="#38bdf8"
            stroke="#e0f2fe"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <rect x="13.5" y="6.8" width="3.6" height="3.6" rx="0.6" transform="rotate(-45 15.3 8.6)" fill="#334155" stroke="#e2e8f0" strokeWidth="1" />
        </svg>
      );
    case 'ar':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M2 10h16l3 2v2h-4l-1 4h-2l.5-4H11l-1.5 5H7l1-5H2v-4z" fill="#0f172a" stroke="#e2e8f0" strokeWidth="1.4" />
          <path d="M6 11h10v2H6z" fill="#94a3b8" />
        </svg>
      );
    case 'pump':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M2 11h19v2.5H13l-1.5 3.5H9l1-3.5H4L2.5 16H1l1-5z" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.4" />
          <path d="M9 11.5h7v1.5H9z" fill="#b45309" />
        </svg>
      );
    case 'tac':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M2 10h19v3h-6l-1 4h-3l1-4H5l-1.5 3H2v-6z" fill="#0f172a" stroke="#ef4444" strokeWidth="1.4" />
          <path d="M10 10.5h7v2h-7z" fill="#dc2626" />
        </svg>
      );
    case 'smg':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M4 9h14l2 2v2h-5l-1 6h-2.5l1-6H8l-1 3H4V9z" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.4" />
          <path d="M7 10h8v2H7z" fill="#38bdf8" />
        </svg>
      );
    case 'sniper':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M1 12h21v2H12l-1 4H8.5l1-4H3l-1.5 2H1v-4z" fill="#0f172a" stroke="#fde047" strokeWidth="1.3" />
          <rect x="7" y="8.5" width="7" height="2.2" rx="0.8" fill="#cbd5e1" />
        </svg>
      );
    case 'mini':
    case 'big':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <path d="M9 3h6v3l3 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9l3-4V3z" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.6" />
          <path d="M7.5 12h9v6.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V12z" fill="#38bdf8" />
          <rect x="9.5" y="2.5" width="5" height="2" fill="#e2e8f0" />
        </svg>
      );
    case 'medkit':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="3" y="6" width="18" height="14" rx="2" fill="#f8fafc" stroke="#0f172a" strokeWidth="1.6" />
          <path d="M9 6V4h6v2" fill="none" stroke="#f8fafc" strokeWidth="1.8" />
          <path d="M10.5 9.5h3v2.5H16v3h-2.5v2.5h-3V15H8v-3h2.5V9.5z" fill="#16a34a" />
        </svg>
      );
    case 'chug':
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <rect x="6" y="6" width="12" height="15" rx="3" fill="#0891b2" stroke="#67e8f9" strokeWidth="1.5" />
          <rect x="5" y="10" width="14" height="7" rx="1" fill="#22d3ee" opacity="0.85" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.2" />
          <path d="M4 9.5h2v5H4zM18 9.5h2v5h-2z" fill="#94a3b8" />
          <path d="M12 10.5v6M9 13.5h6" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}

export function SkinEmblemIcon({ icon, className = 'w-8 h-8' }: { icon: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {icon === 'crown' ? (
        <path d="M3 18h18l-1.5-9-4.5 4-3-6-3 6-4.5-4L3 18z" fill="#fef08a" stroke="#0f172a" strokeWidth="1.5" />
      ) : icon === 'skull' ? (
        <path
          d="M12 3a7 7 0 0 0-7 7c0 2.5 1.3 4.6 3 5.8V19h8v-3.2c1.7-1.2 3-3.3 3-5.8a7 7 0 0 0-7-7zm-2.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
          fill="#fef3c7"
          stroke="#0f172a"
          strokeWidth="1.4"
        />
      ) : icon === 'bolt' ? (
        <path d="M13 2L4 14h7l-1 8 10-12h-7l0-8z" fill="#38bdf8" stroke="#0f172a" strokeWidth="1.4" />
      ) : icon === 'sword' ? (
        <path d="M19 3l2 2-9 9 2 2-1.5 1.5-2.5-2.5L6 19l-2-2 4-4-2.5-2.5L7 9l2 2 9-8z" fill="#e2e8f0" stroke="#0f172a" strokeWidth="1.4" />
      ) : icon === 'star' ? (
        <path d="M12 2l2.9 6.2 6.8.9-5 4.7 1.3 6.8L12 17.3 6 20.6l1.3-6.8-5-4.7 6.8-.9L12 2z" fill="#c084fc" stroke="#0f172a" strokeWidth="1.4" />
      ) : icon === 'music' ? (
        <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" fill="#fde047" stroke="#0f172a" strokeWidth="1.4" />
      ) : icon === 'wave' ? (
        <path d="M3 12c2.5-4 5.5-4 8 0s5.5 4 8 0M3 17c2.5-4 5.5-4 8 0s5.5 4 8 0" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      ) : icon === 'halo' ? (
        <g>
          <ellipse cx="12" cy="7.5" rx="7.5" ry="2.8" fill="none" stroke="#fde047" strokeWidth="2.4" />
          <path d="M12 11l2.2 4.4 4.8.7-3.5 3.4.8 4.8-4.3-2.3-4.3 2.3.8-4.8-3.5-3.4 4.8-.7z" fill="#fbbf24" stroke="#0f172a" strokeWidth="1.2" />
        </g>
      ) : (
        <path d="M12 3L4 7v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4z" fill="#cbd5e1" stroke="#0f172a" strokeWidth="1.5" />
      )}
    </svg>
  );
}

export function RankCrestIcon({
  color,
  accent,
  className = 'w-8 h-8',
}: {
  color: string;
  accent: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <path
        d="M18 3L31 8.5V18.5C31 25.5 25.4 30.8 18 33.5C10.6 30.8 5 25.5 5 18.5V8.5L18 3Z"
        fill={accent}
        stroke={color}
        strokeWidth="2.4"
      />
      <path d="M18 7.5L26.5 11.2V18.3C26.5 23.2 22.8 26.9 18 29C13.2 26.9 9.5 23.2 9.5 18.3V11.2L18 7.5Z" fill="#091128" />
      <path d="M18 10.5L21 16.5L25 17.5L21.5 21L22.3 25.5L18 23.2L13.7 25.5L14.5 21L11 17.5L15 16.5Z" fill={color} />
    </svg>
  );
}

export function CrownEmblemIcon({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="vrCrown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="55%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </linearGradient>
      </defs>
      <path
        d="M6 36L10 15L18 24L24 10L30 24L38 15L42 36H6Z"
        fill="url(#vrCrown)"
        stroke="#422006"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="7" y="36" width="34" height="5" rx="2" fill="#f59e0b" stroke="#422006" strokeWidth="2" />
      <circle cx="24" cy="10" r="2.6" fill="#fef08a" />
      <circle cx="10" cy="15" r="2.2" fill="#fef08a" />
      <circle cx="38" cy="15" r="2.2" fill="#fef08a" />
    </svg>
  );
}

export function CrosshairSkullIcon({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="20" fill="#450a0a" stroke="#f43f5e" strokeWidth="2.4" />
      <path
        d="M24 12a9.5 9.5 0 0 0-9.5 9.5c0 3.2 1.6 5.9 3.8 7.5V34h11.4v-5c2.2-1.6 3.8-4.3 3.8-7.5A9.5 9.5 0 0 0 24 12z"
        fill="#ffe4e6"
      />
      <circle cx="20.2" cy="21.5" r="2.1" fill="#450a0a" />
      <circle cx="27.8" cy="21.5" r="2.1" fill="#450a0a" />
      <path d="M21 31v3M24 31v3M27 31v3" stroke="#450a0a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

