import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, RefreshCw, FileText, Check } from 'lucide-react';
import { RulesViewer } from './RulesViewer';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmRead?: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  onConfirmRead,
}) => {
  const [rules, setRules] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      if (data.text) {
        setRules(data.text);
      } else {
        throw new Error('Aucun texte reçu');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnderstand = () => {
    if (onConfirmRead) {
      onConfirmRead();
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      id="rules-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="rules-modal-container"
        className="relative w-full max-w-4xl h-[90vh] flex flex-col bg-[#141824] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#191e2e] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                Règlement Officiel de Tarbes RP
              </h2>
              <p className="text-xs text-slate-400">
                Charte communautaire & Règles du serveur Roblox Tarbes RP
              </p>
            </div>
          </div>
          <button
            id="close-rules-btn"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content with clean scrollable view */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-300 text-sm leading-relaxed">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-sm font-medium">Chargement du règlement officiel...</p>
            </div>
          ) : error ? (
            <div className="p-5 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm space-y-3">
              <p className="font-semibold text-red-300">
                Impossible d'actualiser le règlement en direct.
              </p>
              <button
                onClick={loadRules}
                className="px-4 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Réessayer le chargement
              </button>
            </div>
          ) : (
            <RulesViewer
              rawText={rules}
              onAgree={handleUnderstand}
              showAgreeButton={Boolean(onConfirmRead)}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#161a27] shrink-0">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 hidden sm:flex">
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            Tout joueur de Tarbes RP s'engage à respecter l'ensemble des règles.
          </span>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              id="confirm-read-rules-btn"
              onClick={handleUnderstand}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>J'ai lu et compris le règlement</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
