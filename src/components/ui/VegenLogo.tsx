import React from 'react';

interface VegenLogoProps {
  compact?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const VegenLogo: React.FC<VegenLogoProps> = ({ compact = false, size = 'md' }) => {
  const iconSize = size === 'lg' ? 'h-11 w-11' : size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      {/* Vegen Digital two-leaf sprout isotipo */}
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className={`${iconSize} shrink-0`}
        aria-hidden="true"
      >
        <path
          d="M29 54V36C29 25 21 17 7 17C7 30 15 39 27 41V54C27 56.209 28.791 58 31 58C33.209 58 35 56.209 35 54V38C35 33.5 32.5 29.5 28.5 27.5"
          fill="#28C76F"
        />
        <path
          d="M32 31.5C32 19 41.5 10.5 57 10.5C57 24 47.5 33 34 33.5C32.8 33.5 32 32.6 32 31.5Z"
          fill="#228B22"
          className="dark:fill-[#32CD32]"
        />
        <path
          d="M7 17C20.5 17 31 25.5 31 39V54"
          stroke="#28C76F"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>

      {compact ? (
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Vegen
          </span>
          <span className="hidden text-xs font-semibold tracking-tight text-[#228B22] dark:text-[#28C76F] sm:inline">
            Finance Hub
          </span>
        </span>
      ) : (
        <span className="flex flex-col leading-none">
          <span
            className={`font-display font-bold tracking-tight text-slate-900 dark:text-slate-50 ${
              size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-base'
            }`}
          >
            Vegen
          </span>
          <span
            className={`mt-1 font-display font-semibold tracking-[0.18em] text-[#228B22] dark:text-[#28C76F] ${
              size === 'lg' ? 'text-[11px]' : 'text-[9px]'
            }`}
          >
            FINANCE HUB
          </span>
        </span>
      )}
    </span>
  );
};
