import React from 'react';
import { BookOpen, Database, Sparkles } from 'lucide-react';
import type { BotStatus } from '../types';

interface HeaderProps {
  onOpenRules: () => void;
  onToggleAdmin: () => void;
  showAdmin: boolean;
  botStatus: BotStatus | null;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenRules,
  onToggleAdmin,
  showAdmin,
  botStatus,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-[#090b10]/95 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand with Official Tarbes RP Round Logo & Text */}
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-red-700/80 shadow-md shadow-red-950/40 ring-2 ring-red-900/30 shrink-0 bg-[#0e121d]">
            <img
              src="/tarbes-round.png"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://adrien-barron.tech/tarbes.png';
              }}
              alt="Logo Tarbes RP"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-wide text-white">
              Tarbes <span className="text-red-500">RP</span>
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-red-950/60 text-red-300 border border-red-800/40">
              Officiel
            </span>
          </div>
        </div>

        {/* Center / Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Button: Règlement */}
          <button
            id="view-rules-header-btn"
            onClick={onOpenRules}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#121624] hover:bg-[#181d30] text-slate-200 border border-slate-700/80 hover:border-red-700/60 transition-all cursor-pointer shadow-sm"
          >
            <BookOpen className="w-3.5 h-3.5 text-red-500" />
            <span>Règlement</span>
          </button>
        </div>
      </div>
    </header>
  );
};
