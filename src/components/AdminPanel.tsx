import React, { useState, useEffect } from 'react';
import {
  Database,
  Table,
  Bot,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Send,
  Trash2,
  Download,
  ExternalLink,
  Shield,
  Key,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import type { VerificationRecord, BotStatus } from '../types';

interface AdminPanelProps {
  botStatus: BotStatus | null;
  onRefreshStatus: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ botStatus, onRefreshStatus }) => {
  const [activeTab, setActiveTab] = useState<'table' | 'bot' | 'sheets'>('table');
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [appsScriptCode, setAppsScriptCode] = useState<string>('');
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [testWebhookUrl, setTestWebhookUrl] = useState<string>('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTestingSheets, setIsTestingSheets] = useState<boolean>(false);

  useEffect(() => {
    loadVerifications();
    loadScriptTemplate();
  }, []);

  const loadVerifications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/verifications');
      const data = await res.json();
      if (data.verifications) {
        setVerifications(data.verifications);
      }
    } catch (err) {
      console.error('Error fetching verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadScriptTemplate = async () => {
    try {
      const res = await fetch('/api/sheets/template');
      const data = await res.json();
      if (data.script) {
        setAppsScriptCode(data.script);
      }
    } catch (err) {
      console.error('Error fetching script template:', err);
    }
  };

  const handleDeleteVerification = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette liaison Discord-Roblox ?')) {
      return;
    }
    try {
      const res = await fetch(`/api/verifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setVerifications((prev) => prev.filter((v) => v.id !== id));
      }
    } catch (err) {
      alert('Erreur lors de la suppression');
    }
  };

  const handleSyncSingleSheets = async (id: string) => {
    try {
      const res = await fetch(`/api/verifications/${id}/sync-sheets`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('Ligne synchronisée avec succès dans votre Google Sheets !');
        loadVerifications();
      } else {
        alert(`Échec de la synchronisation : ${data.message}`);
      }
    } catch (err: any) {
      alert(`Erreur de connexion : ${err.message}`);
    }
  };

  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const handleSyncAllSheets = async () => {
    setIsSyncingAll(true);
    try {
      const res = await fetch('/api/verifications/sync-all-sheets', { method: 'POST' });
      const data = await res.json();
      alert(`Synchronisation terminée : ${data.syncedCount} / ${data.total} lignes insérées dans le Google Sheets.`);
      loadVerifications();
    } catch (err: any) {
      alert(`Erreur lors de la synchronisation générale : ${err.message}`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTestSheets = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingSheets(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sheets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: testWebhookUrl.trim() || undefined }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsTestingSheets(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const handleExportCSV = () => {
    if (verifications.length === 0) return;
    const headers = [
      'Date',
      'Discord Tag',
      'Discord ID',
      'Roblox Username',
      'Roblox Display Name',
      'Roblox ID',
      'Statut Rôles',
      'Règlement',
      'Bot',
      'Serveur',
    ];
    const rows = verifications.map((v) => [
      new Date(v.verifiedAt).toLocaleString('fr-FR'),
      v.discordTag,
      v.discordId,
      v.robloxUsername,
      v.robloxDisplayName,
      v.robloxId,
      v.rolesUpdated ? 'Rôles Appliqués' : 'En attente',
      v.rulesAccepted ? 'Accepté' : 'Non',
      'Tarbes RP 🇫🇷🤖#6342',
      'Tarbes RP',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${val}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tarbes_rp_verifications_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSheetTemplate = () => {
    const rows = [
      ["Date & Heure", "Compte Discord", "ID Discord", "Compte Roblox", "ID Roblox", "Statut Rôles Discord", "Règlement Officiel", "Bot d'attribution", "Serveur Discord", "⚙️ BASE DE DONNÉES & INFOS ADMIN"],
      ["", "", "", "", "", "", "", "", "", "Actions automatiques du Bot Discord"],
      ["", "", "", "", "", "", "", "", "", "🤖 Bot Officiel : Tarbes RP 🇫🇷🤖#6342"],
      ["", "", "", "", "", "", "", "", "", "🛡️ Serveur Discord : Tarbes RP"],
      ["", "", "", "", "", "", "", "", "", "🆔 ID Serveur : 1509580529958129794"],
      ["", "", "", "", "", "", "", "", "", "❌ Retrait automatique : Membre non vérifié"],
      ["", "", "", "", "", "", "", "", "", "🆔 ID Rôle retiré : 1535239314798149673"],
      ["", "", "", "", "", "", "", "", "", "✅ Attribution automatique : Membre vérifié"],
      ["", "", "", "", "", "", "", "", "", "🆔 ID Rôle attribué : 1518517334413672519"],
      ["", "", "", "", "", "", "", "", "", "🔒 Liaison : 1 compte Discord = 1 compte Roblox"],
      ["", "", "", "", "", "", "", "", "", "📜 Règlement : Acceptation obligatoire"],
      ["", "", "", "", "", "", "", "", "", "💬 MP Discord : Confirmation envoyée par le bot"],
      ["", "", "", "", "", "", "", "", "", "⌨️ Commande in-game / staff : /dd-rblx"],
      ["", "", "", "", "", "", "", "", "", "📡 Synchronisation : Temps réel Google Sheets"],
      ["", "", "", "", "", "", "", "", "", "👤 Administration : Staff Tarbes RP"],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      rows.map((row) => row.map((val) => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Modele_Tarbes_RP_Google_Sheets.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredVerifications = verifications.filter(
    (v) =>
      v.discordTag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.robloxUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.discordId.includes(searchTerm) ||
      v.robloxId.includes(searchTerm)
  );

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e121d] border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-red-700/80 shadow-md shadow-red-950/40 shrink-0">
            <img src="/tarbes_logo.jpg" alt="Tarbes RP" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Gestion Base de Données & Bot</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-red-950/80 text-red-300 font-bold border border-red-800/40">
                Tarbes RP
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Bot : <strong>Tarbes RP 🇫🇷🤖#6342</strong> • Liaison 1 Discord = 1 Roblox
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#090b10] border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'table'
                ? 'bg-red-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Comptes liés ({verifications.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sheets'
                ? 'bg-red-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Google Sheets</span>
          </button>
          <button
            onClick={() => setActiveTab('bot')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bot'
                ? 'bg-red-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Bot Discord</span>
          </button>
        </div>
      </div>

      {/* ---------------- TAB 1: TABLE DES COMPTES LIÉS ---------------- */}
      {activeTab === 'table' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Rechercher par pseudo ou ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#0e121d] border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncAllSheets}
                disabled={isSyncingAll || verifications.length === 0}
                className="px-3.5 py-2 rounded-xl bg-[#0e121d] hover:bg-[#141a2b] border border-slate-800 hover:border-red-700/60 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                title="Synchronise toutes les liaisons vers Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin text-red-400' : 'text-emerald-400'}`} />
                <span>{isSyncingAll ? 'Synchro en cours...' : 'Tout synchroniser (Sheets)'}</span>
              </button>

              <button
                onClick={handleExportCSV}
                disabled={verifications.length === 0}
                className="px-3.5 py-2 rounded-xl bg-[#0e121d] hover:bg-[#141a2b] border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span>Exporter CSV</span>
              </button>

              <button
                onClick={loadVerifications}
                className="p-2 rounded-xl bg-[#0e121d] hover:bg-[#141a2b] border border-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                title="Rafraîchir les données"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl bg-[#0e121d] border border-slate-800 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#121626] text-slate-400">
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Compte Discord</th>
                    <th className="py-3 px-2 text-center font-semibold">Liaison</th>
                    <th className="py-3 px-4 font-semibold">Compte Roblox</th>
                    <th className="py-3 px-4 font-semibold">Règlement</th>
                    <th className="py-3 px-4 font-semibold">Rôles Discord</th>
                    <th className="py-3 px-4 font-semibold">Google Sheets</th>
                    <th className="py-3 px-4 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Chargement des liaisons...
                      </td>
                    </tr>
                  ) : filteredVerifications.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 space-y-1">
                        <p className="font-semibold text-slate-400">Aucune liaison trouvée.</p>
                        <p className="text-[11px]">Les comptes vérifiés apparaîtront ici automatiquement.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredVerifications.map((item) => (
                      <tr key={item.id} className="hover:bg-[#121727] transition-colors">
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(item.verifiedAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {item.discordAvatar ? (
                              <img
                                src={item.discordAvatar}
                                alt=""
                                className="w-7 h-7 rounded-full bg-slate-950"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-red-950 text-red-300 flex items-center justify-center font-bold text-[10px]">
                                {item.discordTag.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-200">{item.discordTag}</div>
                              <div className="font-mono text-[10px] text-slate-500">{item.discordId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-red-950/70 border border-red-800/40 text-red-300 font-extrabold text-[11px] shadow-sm">
                            =
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            {item.robloxAvatarUrl && (
                              <img
                                src={item.robloxAvatarUrl}
                                alt=""
                                className="w-7 h-7 rounded-lg bg-slate-950 object-cover"
                                referrerPolicy="no-referrer"
                              />
                            )}
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.robloxDisplayName}
                              </div>
                              <a
                                href={`https://www.roblox.com/users/${item.robloxId}/profile`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-red-400 hover:underline font-mono text-[10px] inline-flex items-center gap-1"
                              >
                                @{item.robloxUsername} ({item.robloxId})
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            Accepté
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {item.rolesUpdated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Appliqués
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" />
                              En attente
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {item.sheetsSynced ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Synchronisé
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSyncSingleSheets(item.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/60 hover:bg-red-900/60 text-red-300 text-[10px] font-semibold border border-red-800/40 cursor-pointer transition-colors"
                              title={item.sheetsError || 'Cliquer pour synchroniser avec Google Sheets'}
                            >
                              <FileSpreadsheet className="w-3 h-3" />
                              Synchroniser
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSyncSingleSheets(item.id)}
                              className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                              title="Forcer la synchronisation vers Google Sheets"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteVerification(item.id)}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Supprimer la liaison"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: BOT DISCORD ---------------- */}
      {activeTab === 'bot' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-red-500" />
                Bot Discord Officiel
              </span>
              <div className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>Tarbes RP 🇫🇷🤖#6342</span>
              </div>
              <p className="text-xs text-emerald-400 font-medium">
                Prêt pour la gestion des rôles
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                Serveur Discord
              </span>
              <div className="text-lg font-extrabold text-slate-100">
                Tarbes RP Officiel
              </div>
              <p className="text-xs text-slate-400">
                Liaison 1 Compte Discord = 1 Compte Roblox
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-red-500" />
                Rôles Discord Automatiques
              </span>
              <div className="text-xs space-y-1 font-medium">
                <div className="text-red-400 flex items-center gap-1">
                  <span>- Retrait :</span>
                  <span className="bg-slate-900 px-1 rounded">Membre non-vérifié</span>
                </div>
                <div className="text-emerald-400 flex items-center gap-1">
                  <span>+ Attribution :</span>
                  <span className="bg-slate-900 px-1 rounded font-bold">Membre vérifié</span>
                </div>
              </div>
            </div>
          </div>

          {/* Commande /dd-rblx Section */}
          <div className="p-6 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-red-950 text-red-300 font-mono text-xs font-bold border border-red-800/40">
                  /dd-rblx
                </div>
                <h3 className="text-sm font-bold text-slate-100">
                  Commande de vérification en jeu
                </h3>
              </div>
              <span className="text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                Actif
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              La commande <code>/dd-rblx</code> permet de consulter instantanément la liste des comptes Discord et Roblox associés sur le serveur Tarbes RP.
            </p>

            <div className="bg-[#090b10] p-4 rounded-xl border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
              <div className="text-slate-500">// Aperçu de la base enregistrée :</div>
              <div className="text-red-400 font-bold">📋 Tarbes RP — Comptes Discord & Roblox Liés</div>
              <div className="text-slate-400">Total vérifiés : {verifications.length}</div>
              <div className="text-red-500/50 mt-2">---------------------------------------------------</div>
              {verifications.slice(0, 3).map((v) => (
                <div key={v.id} className="text-slate-200">
                  {v.discordTag.padEnd(20)} ➔ {v.robloxUsername} (ID: {v.robloxId})
                </div>
              ))}
              <div className="text-red-500/50">---------------------------------------------------</div>
            </div>
          </div>

          {/* OAUTH 403 FIX & REDIRECT URI */}
          <div className="p-6 rounded-2xl bg-[#0e121d] border-2 border-[#5865F2]/40 space-y-4 shadow-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#5865F2]/20 flex items-center justify-center text-[#5865F2]">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  Configuration OAuth2 Discord (Résolution de l'erreur Google 403)
                </h3>
                <p className="text-xs text-slate-400">
                  L'erreur 403 survient quand Discord redirige vers l'adresse interne non publique.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#090b10] border border-slate-800 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">
                URL de redirection officielle à inscrire dans Discord Developer Portal &gt; OAuth2 &gt; Redirects :
              </span>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2.5 rounded-lg bg-[#111624] border border-slate-700 text-xs font-mono text-emerald-400 select-all overflow-x-auto">
                  https://ais-pre-jj4fayfhj3dkqcr22ghtgv-600024054941.europe-west2.run.app/auth/callback
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('https://ais-pre-jj4fayfhj3dkqcr22ghtgv-600024054941.europe-west2.run.app/auth/callback');
                    alert('URL de redirection copiée ! Collez-la dans le Discord Developer Portal > OAuth2 > Redirects.');
                  }}
                  className="px-3.5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier l'URL</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                💡 <strong>Alternative 100% sans erreur :</strong> Vos joueurs peuvent aussi utiliser l'onglet <strong>« Saisie Directe »</strong> pour lier leur compte Discord en 1 seconde sans passer par le popup Discord.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: GOOGLE SHEETS ---------------- */}
      {activeTab === 'sheets' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* QUICK ACTIONS BANNER */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0e121d] border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 justify-center sm:justify-start">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Base de Données Google Sheets — Tarbes RP
              </h3>
              <p className="text-xs text-slate-400">
                Colonnes A à I pour les membres vérifiés • Colonne J (J2 à J15) réservée à la base de données & configuration admin.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                onClick={handleDownloadSheetTemplate}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md transition-colors"
                title="Télécharger le modèle de feuille pré-rempli au format CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger Modèle (.CSV)</span>
              </button>
              <a
                href="https://sheets.new"
                target="_blank"
                rel="noreferrer noopener"
                className="px-3.5 py-2 rounded-xl bg-[#172033] hover:bg-[#1e2a42] border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Créer Google Sheet (sheets.new)</span>
              </a>
            </div>
          </div>

          {/* VISUAL REPRESENTATION OF THE SHEET ARCHITECTURE */}
          <div className="p-5 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Table className="w-4 h-4 text-red-500" />
                Organisation de votre feuille Google Sheets :
              </span>
              <span className="text-[11px] text-slate-400">Colonnes A à I : Joueurs | Colonne J : Admin</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
              {/* Columns A-I */}
              <div className="md:col-span-8 p-3.5 rounded-xl bg-[#090b10] border border-slate-800 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Colonnes A à I : Vérifications des Membres
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono text-slate-300">
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">A : Date & Heure</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">B : Tag Discord</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">C : ID Discord</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">D : Pseudo Roblox</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">E : ID Roblox</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">F : Statut Rôles</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">G : Règlement</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">H : Bot d'attribution</div>
                  <div className="bg-[#111624] p-1.5 rounded border border-slate-800">I : Serveur Discord</div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Chaque nouvelle vérification s'ajoute automatiquement sur la prochaine ligne libre sans jamais toucher à la colonne J.
                </p>
              </div>

              {/* Column J */}
              <div className="md:col-span-4 p-3.5 rounded-xl bg-[#090b10] border border-red-900/40 space-y-2">
                <div className="font-bold text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Colonne J (Lignes J1 à J15) : Base Admin
                </div>
                <div className="text-[11px] font-mono text-slate-300 space-y-1 bg-[#111624] p-2 rounded border border-slate-800 max-h-36 overflow-y-auto">
                  <div className="text-red-300 font-bold">J1: ⚙️ BASE DE DONNÉES & INFOS ADMIN</div>
                  <div>J2: Actions automatiques Bot Discord</div>
                  <div>J3: 🤖 Bot : Tarbes RP 🇫🇷🤖#6342</div>
                  <div>J4: 🛡️ Serveur : Tarbes RP</div>
                  <div>J5: 🆔 ID Serveur : 1509580529958129794</div>
                  <div>J6: ❌ Retrait : Membre non vérifié</div>
                  <div>J7: 🆔 ID Rôle retiré : 1535239314798149673</div>
                  <div>J8: ✅ Ajout : Membre vérifié</div>
                  <div>J9: 🆔 ID Rôle ajouté : 1518517334413672519</div>
                  <div>J10: 🔒 Règle : 1 Discord = 1 Roblox</div>
                  <div>J11: 📜 Règlement : Accepté</div>
                  <div>J12: 💬 MP Discord : Envoyé</div>
                  <div>J13: ⌨️ Commande : /dd-rblx</div>
                  <div>J14: 📡 Synchronisation : Directe</div>
                  <div>J15: 👤 Admin : Staff Tarbes RP</div>
                </div>
              </div>
            </div>
          </div>

          {/* CRITICAL GOOGLE 403 ERROR EXPLANATION & STEP-BY-STEP FIX */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-red-950/40 via-[#0e121d] to-[#0e121d] border-2 border-red-700/70 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 font-black text-red-400 text-sm sm:text-base">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <span>Résolution définitive de l'erreur Google 403 (« Désolé, vous n'avez pas accès à cette page ») :</span>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Google renvoie le message <em>« 403. Il s'agit d'une erreur. Désolé, vous n'avez pas accès à cette page. C'est tout ce que nous savons »</em> pour l'une des 4 raisons suivantes :
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#090b10] border border-red-900/60 space-y-1.5">
                <span className="font-bold text-red-300 flex items-center gap-1.5">
                  1. Conflit de comptes Google (90% des cas)
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Si vous êtes connecté à plusieurs adresses Google dans le même navigateur, Google bloque Apps Script.
                  <br />
                  <strong className="text-emerald-400">Solution :</strong> Ouvrez votre navigateur en <strong>Navigation Privée</strong> (Ctrl+Shift+N), connectez-vous uniquement avec le compte Google propriétaire de la feuille, puis déployez le script.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#090b10] border border-red-900/60 space-y-1.5">
                <span className="font-bold text-red-300 flex items-center gap-1.5">
                  2. "Exécuter en tant que" mal réglé
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Dans la fenêtre de déploiement Apps Script :
                  <br />
                  <strong className="text-emerald-400">Solution :</strong> Le paramètre <strong>« Exécuter en tant que »</strong> doit être impérativement réglé sur <strong>« Moi (votre_email@gmail.com) »</strong>. Ne mettez JAMAIS <em>« Utilisateur accédant à l'application web »</em>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#090b10] border border-red-900/60 space-y-1.5">
                <span className="font-bold text-red-300 flex items-center gap-1.5">
                  3. "Qui a accès" mal sélectionné
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Lors du déploiement de l'application Web :
                  <br />
                  <strong className="text-emerald-400">Solution :</strong> Le paramètre <strong>« Qui a accès »</strong> doit impérativement être réglé sur <strong>« Tout le monde » (Anyone)</strong>, et non <em>« Uniquement moi »</em>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#090b10] border border-red-900/60 space-y-1.5">
                <span className="font-bold text-red-300 flex items-center gap-1.5">
                  4. Créer une "Nouvelle version"
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Si vous aviez déjà cliqué sur Déployer par le passé :
                  <br />
                  <strong className="text-emerald-400">Solution :</strong> Allez dans <strong>Déployer</strong> &gt; <strong>Gérer les déploiements</strong> &gt; Cliquez sur le <strong>Crayon (Modifier)</strong> &gt; Version : choisissez <strong>« Nouvelle version »</strong> &gt; Déployer.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#0e121d] border border-slate-800 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Script Google Apps Script Officiel
                </h3>
                <p className="text-xs text-slate-400">
                  Initialise automatiquement les colonnes A à I et remplit la colonne J (J2 à J15) avec la base de données.
                </p>
              </div>
            </div>

            {/* Code Box */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Code Google Apps Script complet à copier-coller :
                </span>
                <button
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'Copié !' : 'Copier le script'}</span>
                </button>
              </div>

              <pre className="p-4 rounded-xl bg-[#090b10] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed">
                {appsScriptCode || '// Chargement du script...'}
              </pre>
            </div>

            {/* Test Webhook Form */}
            <form onSubmit={handleTestSheets} className="pt-4 border-t border-slate-800 space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                Tester votre URL Webhook Apps Script :
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={testWebhookUrl}
                  onChange={(e) => setTestWebhookUrl(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#090b10] border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-600"
                />
                <button
                  type="submit"
                  disabled={isTestingSheets}
                  className="px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isTestingSheets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Tester l'envoi</span>
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-3.5 rounded-xl text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                      : 'bg-red-950/60 border border-red-800 text-red-200'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  )}
                  <div>
                    <span className="font-semibold block">
                      {testResult.success ? 'Succès !' : 'Résultat du test :'}
                    </span>
                    <span className="text-[11px] leading-relaxed block mt-0.5">
                      {testResult.message}
                    </span>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
