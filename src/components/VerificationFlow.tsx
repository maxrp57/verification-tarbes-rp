import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  RotateCcw,
  Sparkles,
  UserCheck,
  Check,
  Bot,
  Loader2,
  BookOpen,
  Hash,
} from 'lucide-react';
import type { DiscordUser, RobloxUser, VerificationRecord, BotStatus } from '../types';

interface VerificationFlowProps {
  onOpenRules: () => void;
  botStatus: BotStatus | null;
  onVerificationDone: () => void;
}

type Step = 'HOME' | 'DISCORD' | 'ROBLOX' | 'RULES' | 'ALREADY_VERIFIED' | 'SUCCESS';

export const VerificationFlow: React.FC<VerificationFlowProps> = ({
  onOpenRules,
  botStatus,
  onVerificationDone,
}) => {
  const [step, setStep] = useState<Step>('HOME');

  // Discord State
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [discordAuthError, setDiscordAuthError] = useState<string | null>(null);
  const [directDiscordInput, setDirectDiscordInput] = useState<string>('');
  const [isDirectConnecting, setIsDirectConnecting] = useState<boolean>(false);
  const [isReverifying, setIsReverifying] = useState<boolean>(false);

  // Roblox State
  const [robloxQuery, setRobloxQuery] = useState<string>('');
  const [isSearchingRoblox, setIsSearchingRoblox] = useState<boolean>(false);
  const [robloxResults, setRobloxResults] = useState<RobloxUser[]>([]);
  const [selectedRobloxUser, setSelectedRobloxUser] = useState<RobloxUser | null>(null);
  const [robloxError, setRobloxError] = useState<string | null>(null);

  // Rules Acceptance State
  const [rulesAccepted, setRulesAccepted] = useState<boolean>(false);

  // Verification Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [existingRecord, setExistingRecord] = useState<VerificationRecord | null>(null);
  const [completedRecord, setCompletedRecord] = useState<VerificationRecord | null>(null);
  const [dmSentSuccess, setDmSentSuccess] = useState<boolean>(false);
  const [autoReturnCountdown, setAutoReturnCountdown] = useState<number>(20);
  const [memberRoleStatus, setMemberRoleStatus] = useState<{
    onServer?: boolean;
    hasUnverifiedRole?: boolean;
    hasVerifiedRole?: boolean;
    isVerified?: boolean;
  } | null>(null);

  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check saved session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tarbes_verified_user');
      if (saved) {
        const u: DiscordUser = JSON.parse(saved);
        if (u && u.id) {
          setDiscordUser(u);
          checkDiscordVerification(u.id);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Countdown timer for automatic return to home on SUCCESS (20 seconds)
  useEffect(() => {
    if (step === 'SUCCESS') {
      setAutoReturnCountdown(20);
      countdownTimerRef.current = setInterval(() => {
        setAutoReturnCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current as NodeJS.Timeout);
            resetFlow();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [step]);

  const resetFlow = () => {
    setStep('HOME');
    setDiscordUser(null);
    setSelectedRobloxUser(null);
    setRobloxResults([]);
    setRobloxQuery('');
    setExistingRecord(null);
    setCompletedRecord(null);
    setDiscordAuthError(null);
    setRobloxError(null);
    setIsDirectConnecting(false);
    setIsReverifying(false);
    setIsSubmitting(false);
    setMemberRoleStatus(null);
    setRulesAccepted(false);
    setDmSentSuccess(false);
    onVerificationDone();
  };

  // Check if a Discord ID is already verified in Google Sheet and check roles
  const checkDiscordVerification = async (discordId: string) => {
    try {
      const res = await fetch(`/api/verifications/check/${discordId}`);
      const data = await res.json();
      if (data.roleStatus) {
        setMemberRoleStatus(data.roleStatus);
      }
      if (data.verified && data.record) {
        setExistingRecord(data.record);
        setStep('ALREADY_VERIFIED');
      }
    } catch (err) {
      console.error('Error checking verification:', err);
    }
  };

  // Direct Discord Connection by ID (or Username fallback)
  const handleDirectDiscordConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = directDiscordInput.trim();
    if (!val) {
      setDiscordAuthError('Veuillez saisir votre identifiant Discord (ID numérique).');
      return;
    }

    setIsDirectConnecting(true);
    setDiscordAuthError(null);

    try {
      const res = await fetch('/api/auth/discord/search-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: val }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Impossible de trouver ou valider ce compte Discord.');
      }

      const user: DiscordUser = data.user;
      setDiscordUser(user);
      if (data.onServer !== undefined) {
        setMemberRoleStatus({
          onServer: data.onServer,
          hasUnverifiedRole: data.hasUnverifiedRole,
          hasVerifiedRole: data.hasVerifiedRole,
          isVerified: data.alreadyVerified,
        });
      }
      if (data.existingVerification) {
        setExistingRecord(data.existingVerification);
      }
      try {
        localStorage.setItem('tarbes_verified_user', JSON.stringify(user));
      } catch {
        // ignore
      }
      await checkDiscordVerification(user.id);
    } catch (err: any) {
      setDiscordAuthError(err.message || 'Erreur lors de la recherche du compte Discord');
    } finally {
      setIsDirectConnecting(false);
    }
  };

  // Search Roblox users
  const handleSearchRoblox = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = robloxQuery.trim();
    if (!query) return;

    setIsSearchingRoblox(true);
    setRobloxError(null);
    setSelectedRobloxUser(null);

    try {
      const res = await fetch(`/api/roblox/search?keyword=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.users && data.users.length > 0) {
        setRobloxResults(data.users);
      } else {
        setRobloxResults([]);
        setRobloxError(`Aucun compte Roblox trouvé pour le pseudo « ${query} ». Vérifiez l'orthographe.`);
      }
    } catch (err: any) {
      setRobloxError('Erreur de communication avec l’API Roblox. Veuillez réessayer.');
    } finally {
      setIsSearchingRoblox(false);
    }
  };

  // Final verification submit
  const handleFinalSubmit = async () => {
    if (!discordUser || !selectedRobloxUser) return;

    if (!rulesAccepted) {
      alert('Veuillez lire et accepter le règlement officiel de Tarbes RP pour valider votre vérification.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUser,
          robloxUser: selectedRobloxUser,
          rulesAccepted: true,
          forceReverify: isReverifying,
        }),
      });

      const data = await res.json();

      if (res.status === 409 || data.error?.includes('déjà')) {
        setExistingRecord(data.record || null);
        setStep('ALREADY_VERIFIED');
      } else if (res.ok && data.success) {
        setCompletedRecord(data.record);
        setDmSentSuccess(Boolean(data.dmSent));
        setStep('SUCCESS');
        setIsReverifying(false);
        onVerificationDone();
      } else {
        throw new Error(data.message || data.error || 'Erreur lors de la validation');
      }
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* ----------------- STEP 0: HOME ----------------- */}
      {step === 'HOME' && (
        <div id="home-view" className="text-center py-8 px-4 sm:px-8 space-y-7 animate-in fade-in duration-300">
          {/* Official Tarbes RP Logos */}
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="relative group">
              <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 border-red-700/90 shadow-2xl shadow-red-950/70 ring-4 ring-blue-600/30 transition-transform duration-300 group-hover:scale-105 bg-[#0e121d]">
                <img
                  src="/tarbes-round.png"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://adrien-barron.tech/tarbes.png';
                  }}
                  alt="Logo Rond Tarbes RP"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="absolute -bottom-1 -right-1 px-2.5 py-0.5 rounded-full bg-red-950 border border-red-700 text-red-200 text-[10px] font-extrabold uppercase tracking-wider shadow-md">
                RP 🇫🇷
              </div>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black text-slate-100 tracking-tight uppercase">
              Vérification Tarbes RP
            </h1>
            <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
              Associez votre compte Discord officiel à votre personnage Roblox pour obtenir vos accès et rôles sur le serveur de jeu.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-center">
            <button
              id="start-verification-btn"
              onClick={() => setStep('DISCORD')}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-base text-white bg-red-700 hover:bg-red-600 shadow-xl shadow-red-950/50 transform hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer flex items-center justify-center gap-2.5"
            >
              <span>Faire la vérification</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 1: DISCORD ID ----------------- */}
      {step === 'DISCORD' && (
        <div id="discord-step-view" className="py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-200">
          <div className="text-center space-y-2">
            <span className="px-2.5 py-1 rounded-full bg-red-950/80 text-red-300 text-xs font-semibold border border-red-800/40">
              Étape 1 sur 3
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
              Votre Identifiant Discord
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Saisissez votre ID Discord numérique pour associer votre compte au serveur Tarbes RP.
            </p>
          </div>

          {/* Discord Card */}
          <div className="p-6 rounded-2xl bg-[#0e121d] border border-slate-800 shadow-xl space-y-6 max-w-2xl mx-auto">
            {!discordUser ? (
              <div className="space-y-6 py-2">
                {discordAuthError && (
                  <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs text-center flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{discordAuthError}</span>
                  </div>
                )}

                {/* Direct ID Form */}
                <form onSubmit={handleDirectDiscordConnect} className="space-y-5">
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-200">
                        Identifiant Discord (ID numérique) :
                      </label>
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Rapide & Garanti
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <div className="absolute left-3.5 text-red-500">
                        <Hash className="w-5 h-5" />
                      </div>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ex : 1509579941187026985"
                        value={directDiscordInput}
                        onChange={(e) => setDirectDiscordInput(e.target.value)}
                        className="w-full pl-11 pr-36 py-3.5 rounded-xl bg-[#090b10] border border-slate-700 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-600 font-mono tracking-wide shadow-inner font-semibold"
                      />
                      <button
                        type="submit"
                        disabled={isDirectConnecting || !directDiscordInput.trim()}
                        className="absolute right-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white bg-red-700 hover:bg-red-600 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-red-950/40 active:scale-95"
                      >
                        {isDirectConnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        <span>Valider mon ID</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400">
                      Entrez votre ID Discord (ou votre pseudo). Le bot <strong className="text-slate-300">Tarbes RP 🇫🇷🤖</strong> récupère instantanément votre compte et vos rôles.
                    </p>
                  </div>
                </form>
              </div>
            ) : (
              /* Discord User Connected Card */
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#121626] border border-slate-700/80">
                  <div className="flex items-center gap-4">
                    <img
                      src={discordUser.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt={discordUser.username}
                      className="w-14 h-14 rounded-full ring-2 ring-red-600/50 bg-slate-950 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 text-base">
                          {discordUser.global_name || discordUser.username}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          @{discordUser.username}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        ID Discord : <span className="text-red-400 font-semibold">{discordUser.id}</span>
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-1 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Compte Discord associé avec succès</span>
                      </div>

                      {memberRoleStatus?.onServer && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                          {memberRoleStatus.hasUnverifiedRole && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Rôle actuel : Membre non vérifié
                            </span>
                          )}
                          {memberRoleStatus.hasVerifiedRole && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Rôle actuel : Membre vérifié
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setDiscordUser(null)}
                    className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer p-1"
                  >
                    Changer
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => setStep('HOME')}
                    className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    id="next-step-btn"
                    onClick={() => setStep('ROBLOX')}
                    className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-red-700 hover:bg-red-600 shadow-lg shadow-red-950/40 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>Étape suivante : Compte Roblox</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- STEP 2: ROBLOX SEARCH ----------------- */}
      {step === 'ROBLOX' && (
        <div id="roblox-step-view" className="py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-200">
          <div className="text-center space-y-2">
            <span className="px-2.5 py-1 rounded-full bg-red-950/80 text-red-300 text-xs font-semibold border border-red-800/40">
              Étape 2 sur 3
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
              Sélectionnez votre compte Roblox
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Recherchez votre pseudo Roblox et confirmez votre photo de profil pour passer à l'étape suivante.
            </p>
          </div>

          {/* Discord Account Summary Banner */}
          {discordUser && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-[#0e121d] border border-slate-800 text-xs">
              <span className="text-slate-400">Compte Discord connecté :</span>
              <div className="flex items-center gap-2 font-medium text-slate-200">
                <img
                  src={discordUser.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  className="w-5 h-5 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <span>{discordUser.global_name || discordUser.username}</span>
                <span className="text-slate-500">({discordUser.id})</span>
              </div>
            </div>
          )}

          {/* Search Box */}
          <form onSubmit={handleSearchRoblox} className="relative">
            <div className="relative flex items-center">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
              <input
                id="roblox-search-input"
                type="text"
                value={robloxQuery}
                onChange={(e) => setRobloxQuery(e.target.value)}
                placeholder="Entrez votre nom d'utilisateur Roblox (ex: Tarbes_Player)..."
                className="w-full pl-12 pr-28 py-3.5 bg-[#0e121d] border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-red-600 transition-all shadow-inner"
              />
              <button
                type="submit"
                id="submit-roblox-search-btn"
                disabled={isSearchingRoblox || !robloxQuery.trim()}
                className="absolute right-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSearchingRoblox ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Rechercher</span>
              </button>
            </div>
          </form>

          {robloxError && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{robloxError}</span>
            </div>
          )}

          {/* Selected Roblox Account Preview */}
          {selectedRobloxUser && (
            <div
              id="selected-roblox-card"
              className="p-5 rounded-2xl bg-gradient-to-b from-[#141829] to-[#0e121d] border-2 border-red-700/80 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Compte Roblox sélectionné
                </span>
                <span className="text-[11px] text-slate-400">
                  ID Roblox : {selectedRobloxUser.id}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5 py-2">
                {/* Profile Picture */}
                <div className="relative group shrink-0">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-slate-950 border-2 border-red-700/60 overflow-hidden shadow-xl ring-4 ring-red-950/40 flex items-center justify-center">
                    <img
                      src={
                        selectedRobloxUser.headshotUrl ||
                        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${selectedRobloxUser.id}&size=150x150&format=Png&isCircular=true`
                      }
                      alt={selectedRobloxUser.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="absolute -bottom-2 -right-2 p-1.5 bg-emerald-500 text-white rounded-full shadow-md">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </div>

                <div className="text-center sm:text-left space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h3 className="text-xl font-bold text-slate-100">
                      {selectedRobloxUser.displayName}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      @{selectedRobloxUser.name}
                    </span>
                    {selectedRobloxUser.hasVerifiedBadge && (
                      <span className="p-0.5 rounded-full bg-blue-500 text-white text-[10px]">
                        ✓
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300">
                    Vérifiez bien qu’il s’agit de <strong>votre photo de profil et avatar</strong>.
                  </p>

                  <a
                    href={`https://www.roblox.com/users/${selectedRobloxUser.id}/profile`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-medium pt-1"
                  >
                    <span>Voir le profil sur Roblox</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Navigation to Step 3: Rules */}
              <div className="pt-3 flex items-center justify-end border-t border-slate-800">
                <button
                  id="go-to-rules-btn"
                  type="button"
                  onClick={() => setStep('RULES')}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm text-white bg-red-700 hover:bg-red-600 shadow-lg shadow-red-950/40 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Continuer vers le Règlement</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Search Results List */}
          {!selectedRobloxUser && robloxResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400 font-medium">
                Cliquez sur votre compte Roblox pour afficher votre photo :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                {robloxResults.map((user) => (
                  <button
                    key={user.id}
                    id={`select-roblox-user-${user.id}`}
                    type="button"
                    onClick={() => setSelectedRobloxUser(user)}
                    className="flex items-center gap-3.5 p-3 rounded-xl bg-[#0e121d] hover:bg-[#131826] border border-slate-800 hover:border-red-700/60 transition-all cursor-pointer text-left group"
                  >
                    <img
                      src={user.headshotUrl || 'https://tr.rbxcdn.com/30DAY-AvatarHeadshot-150x150.png'}
                      alt={user.name}
                      className="w-12 h-12 rounded-xl bg-slate-950 object-cover border border-slate-700 group-hover:border-red-500 transition-colors shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-200 text-sm truncate group-hover:text-red-300 transition-colors">
                        {user.displayName}
                      </div>
                      <div className="text-xs text-slate-400 font-mono truncate">
                        @{user.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ID: {user.id}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setStep('DISCORD')}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retour à l'étape Discord</span>
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 3: RULES ACCEPTANCE ----------------- */}
      {step === 'RULES' && (
        <div id="rules-step-view" className="py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-200">
          <div className="text-center space-y-2">
            <span className="px-2.5 py-1 rounded-full bg-red-950/80 text-red-300 text-xs font-semibold border border-red-800/40">
              Étape 3 sur 3
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-100">
              Règlement Officiel de Tarbes RP
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Prenez connaissance du règlement officiel et validez votre engagement pour recevoir vos rôles.
            </p>
          </div>

          {/* Summary Recap Cards (Discord & Roblox) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {discordUser && (
              <div className="p-3.5 rounded-xl bg-[#0e121d] border border-slate-800 flex items-center gap-3">
                <img
                  src={discordUser.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  className="w-10 h-10 rounded-full border border-slate-700 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Compte Discord</div>
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {discordUser.global_name || discordUser.username}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">ID: {discordUser.id}</div>
                </div>
              </div>
            )}

            {selectedRobloxUser && (
              <div className="p-3.5 rounded-xl bg-[#0e121d] border border-slate-800 flex items-center gap-3">
                <img
                  src={
                    selectedRobloxUser.headshotUrl ||
                    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${selectedRobloxUser.id}&size=150x150&format=Png&isCircular=true`
                  }
                  alt=""
                  className="w-10 h-10 rounded-xl border border-slate-700 shrink-0 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-400 font-semibold uppercase">Compte Roblox</div>
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {selectedRobloxUser.displayName} (@{selectedRobloxUser.name})
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">ID: {selectedRobloxUser.id}</div>
                </div>
              </div>
            )}
          </div>

          {/* Rules Acceptance Card */}
          <div className="p-6 rounded-2xl bg-[#0e121d] border border-slate-800 shadow-xl space-y-6 max-w-2xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-red-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Charte communautaire & Règles du serveur
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Version 2.0 • S'applique à l'ensemble des joueurs
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenRules}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-950/70 hover:bg-red-900/70 border border-red-800/40 text-red-300 hover:text-red-200 text-xs font-semibold cursor-pointer transition-all shrink-0 shadow-sm"
              >
                <BookOpen className="w-4 h-4" />
                <span>Ouvrir le texte complet du règlement</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Mandatory Checkbox */}
            <label
              htmlFor="accept-rules-step-checkbox"
              className={`flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer select-none text-left ${
                rulesAccepted
                  ? 'bg-emerald-950/20 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-[#090b10] border-slate-700 hover:border-red-600'
              }`}
            >
              <input
                id="accept-rules-step-checkbox"
                type="checkbox"
                checked={rulesAccepted}
                onChange={(e) => setRulesAccepted(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded text-red-600 bg-slate-900 border-slate-700 focus:ring-red-600 focus:ring-offset-slate-950 cursor-pointer"
              />
              <div className="text-xs">
                <span className="text-slate-100 font-bold block text-sm">
                  J'ai lu et j'accepte sans réserve le règlement officiel de Tarbes RP
                </span>
                <span className="text-slate-400 text-[11px] block mt-1">
                  Je certifie respecter les règles en jeu sur Roblox et sur le Discord officiel. En cas de non-respect, j'accepte les sanctions prévues par le staff.
                </span>
              </div>
            </label>

            {!rulesAccepted && (
              <p className="text-xs text-amber-400/90 flex items-center justify-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Veuillez cocher la case d'acceptation du règlement pour finaliser votre vérification.</span>
              </p>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStep('ROBLOX')}
                className="w-full sm:w-auto px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Retour à l'étape Roblox</span>
              </button>

              <button
                id="confirm-verification-btn"
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting || !rulesAccepted}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-white transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  rulesAccepted && !isSubmitting
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/30 active:scale-98'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Attribution des rôles en cours...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>Valider la vérification et mes rôles</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- STEP 3: ALREADY VERIFIED ----------------- */}
      {step === 'ALREADY_VERIFIED' && (
        <div id="already-verified-view" className="py-12 px-4 sm:px-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="relative mx-auto w-24 h-24">
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-red-700 shadow-xl shadow-red-950/60">
              <img src="/tarbes_logo.jpg" alt="Tarbes RP" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-500 text-white shadow-md">
              <Check className="w-4 h-4 stroke-[3]" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
              Compte déjà vérifié
            </h2>
            <p className="text-slate-300 text-sm max-w-md mx-auto">
              Ce compte Discord est déjà associé et vérifié sur le serveur de jeu Tarbes RP.
            </p>
          </div>

          {existingRecord && (
            <div className="max-w-md mx-auto p-4 rounded-xl bg-[#0e121d] border border-slate-800 text-left text-xs space-y-2.5">
              <div className="text-slate-400 font-semibold border-b border-slate-800 pb-2">
                Détails de la vérification enregistrée :
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Discord :</span>
                <span className="text-slate-200 font-bold">{existingRecord.discordTag}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Roblox lié :</span>
                <span className="text-red-400 font-bold">{existingRecord.robloxUsername} (ID: {existingRecord.robloxId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date de vérification :</span>
                <span className="text-slate-300">
                  {new Date(existingRecord.verifiedAt).toLocaleString('fr-FR')}
                </span>
              </div>

              {memberRoleStatus?.onServer && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Statut sur le serveur :</span>
                  {memberRoleStatus.hasUnverifiedRole ? (
                    <span className="text-amber-400 font-semibold">
                      Rôle non-vérifié encore présent
                    </span>
                  ) : memberRoleStatus.hasVerifiedRole ? (
                    <span className="text-emerald-400 font-semibold">
                      Rôle Membre vérifié actif
                    </span>
                  ) : (
                    <span className="text-slate-400">Rôle en attente</span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-4 flex items-center justify-center">
            <button
              id="return-home-btn"
              onClick={resetFlow}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-red-700 hover:bg-red-600 shadow-lg shadow-red-950/40 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Retour à l'accueil</span>
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STEP 4: SUCCESS ----------------- */}
      {step === 'SUCCESS' && (
        <div id="verification-success-view" className="py-12 px-4 sm:px-8 text-center space-y-6 animate-in zoom-in-95 duration-200">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-emerald-400 tracking-tight">
              Vérification terminée
            </h2>
            <p className="text-slate-300 text-sm max-w-md mx-auto">
              Félicitations ! Vos comptes Discord et Roblox sont désormais officiellement liés pour Tarbes RP.
            </p>
          </div>

          {completedRecord && (
            <div className="max-w-md mx-auto p-5 rounded-2xl bg-[#0e121d] border border-emerald-500/30 text-left text-xs space-y-3 shadow-xl">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                {completedRecord.robloxAvatarUrl && (
                  <img
                    src={completedRecord.robloxAvatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full bg-slate-950 border border-slate-700"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <div className="text-sm font-bold text-slate-100">
                    {completedRecord.robloxDisplayName} (@{completedRecord.robloxUsername})
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Discord : {completedRecord.discordTag}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Rôle retiré : Membre non vérifié
                </div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Rôle attribué : Membre vérifié
                </div>
                <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Règlement officiel de Tarbes RP : Lu et accepté
                </div>

                {/* Discord DM confirmation card */}
                <div className="mt-3 p-3 rounded-xl bg-red-950/30 border border-red-800/40 flex items-start gap-2.5 text-red-200">
                  <Bot className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-semibold text-xs block text-slate-100">
                      Message privé Discord envoyé !
                    </span>
                    <span className="text-[11px] text-slate-300 block">
                      Le bot <strong>Tarbes RP</strong> vous a envoyé un MP confirmant la liaison de vos comptes.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Auto return countdown message with prominent button */}
          <div className="pt-4 flex flex-col items-center gap-3">
            <button
              id="success-return-home-btn"
              onClick={resetFlow}
              className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-red-700 hover:bg-red-600 shadow-lg shadow-red-950/40 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Retour à l'accueil</span>
            </button>

            <span className="text-xs text-slate-400">
              Redirection automatique vers l'accueil dans{' '}
              <strong className="text-red-400 font-bold">{autoReturnCountdown} seconde{autoReturnCountdown > 1 ? 's' : ''}</strong>...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
