/**
 * Tarbes RP - Système de Vérification Officiel
 * Discord & Roblox Verification with Role Management & Google Sheets Sync
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { VerificationFlow } from './components/VerificationFlow';
import { RulesModal } from './components/RulesModal';
import { AdminPanel } from './components/AdminPanel';
import type { BotStatus } from './types';
import { Shield, BookOpen, ExternalLink, Bot, ArrowLeft } from 'lucide-react';

export default function App() {
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);

  const fetchBotStatus = async () => {
    try {
      const res = await fetch('/api/bot/status');
      const data = await res.json();
      setBotStatus(data);
    } catch (err) {
      console.error('Failed to fetch bot status:', err);
    }
  };

  useEffect(() => {
    fetchBotStatus();
    // Poll status periodically (every 15s)
    const interval = setInterval(fetchBotStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#080a0f] text-slate-100 font-sans selection:bg-red-700 selection:text-white">
      {/* Background ambient emergency lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[500px] bg-red-800/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[600px] h-[500px] bg-blue-700/10 rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-red-900/10 rounded-full blur-[160px]" />
      </div>

      {/* Header */}
      <Header
        onOpenRules={() => setShowRulesModal(true)}
        onToggleAdmin={() => setShowAdmin(!showAdmin)}
        showAdmin={showAdmin}
        botStatus={botStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center relative z-10 py-6 sm:py-10">
        {showAdmin ? (
          <div className="space-y-4">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <button
                onClick={() => setShowAdmin(false)}
                className="inline-flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Retour au portail de vérification</span>
              </button>
            </div>
            <AdminPanel botStatus={botStatus} onRefreshStatus={fetchBotStatus} />
          </div>
        ) : (
          <VerificationFlow
            onOpenRules={() => setShowRulesModal(true)}
            botStatus={botStatus}
            onVerificationDone={fetchBotStatus}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/90 bg-[#090b10] py-5 px-4 relative z-10 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 text-slate-400">
          <div className="w-4 h-4 rounded-full overflow-hidden border border-red-700 shrink-0">
            <img
              src="/tarbes-round.png"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://adrien-barron.tech/tarbes.png';
              }}
              alt="Logo Tarbes RP"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="font-semibold text-slate-300">Tarbes RP</span>
          <span>•</span>
          <span>Système de vérification officiel Discord & Roblox</span>
        </div>
      </footer>

      {/* Rules Modal */}
      <RulesModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />
    </div>
  );
}
