import type { VerificationRecord } from '../src/types.js';

/**
 * Service pour la synchronisation Google Sheets.
 * Gère l'envoi vers le Webhook Google Apps Script et formate les données des comptes liés et du bot.
 */

export async function syncVerificationToSheet(
  record: VerificationRecord,
  customWebhookUrl?: string
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = customWebhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL;

  if (!webhookUrl || !webhookUrl.startsWith('http')) {
    console.log('[Sheets] Aucun webhook Google Sheets configuré dans GOOGLE_SHEETS_WEBHOOK_URL');
    return {
      success: false,
      message: 'GOOGLE_SHEETS_WEBHOOK_URL non configuré. Enregistré localement uniquement.',
    };
  }

  try {
    const payload = {
      action: 'ADD_VERIFICATION',
      timestamp: record.verifiedAt,
      dateFormatted: new Date(record.verifiedAt).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris',
      }),
      discordId: record.discordId,
      discordTag: record.discordTag,
      robloxId: record.robloxId,
      robloxUsername: record.robloxUsername,
      robloxDisplayName: record.robloxDisplayName,
      rolesStatus: record.rolesUpdated ? 'Rôles Appliqués (Membre)' : 'Rôles en attente',
      rulesAccepted: Boolean(record.rulesAccepted) ? 'Règlement Accepté' : 'Non validé',
      botTag: 'Tarbes RP 🇫🇷🤖#6342',
      guildName: 'Tarbes RP',
      linkStatus: 'Compte Lié & Vérifié',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    const responseText = await response.text().catch(() => '');

    if (response.status === 403 || responseText.includes('403') || responseText.includes("n'avez pas accès")) {
      return {
        success: false,
        message:
          "Erreur 403 Google : Votre Webhook Apps Script a l'option 'Qui a accès' réglée sur 'Uniquement moi'. Dans Apps Script : cliquez sur 'Déployer' > 'Gérer les déploiements' > modifiez le déploiement > et réglez 'Qui a accès' sur 'Tout le monde' (Anyone).",
      };
    }

    let isSuccess = response.ok;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.status === 'success') {
        isSuccess = true;
      }
    } catch {
      // not JSON, fallback to response.ok
    }

    if (isSuccess) {
      console.log(`[Sheets] Synchronisation réussie pour ${record.discordTag} (${record.robloxUsername})`);
      return { success: true, message: 'Ligne ajoutée avec succès au Google Sheets' };
    } else {
      console.warn(`[Sheets] Erreur HTTP ${response.status}: ${responseText}`);
      return {
        success: false,
        message: `Erreur HTTP ${response.status} Google Sheets: ${responseText.slice(0, 100)}`,
      };
    }
  } catch (error: any) {
    console.error('[Sheets] Échec de la synchronisation:', error.message);
    return {
      success: false,
      message: `Erreur de connexion au Webhook Google Sheets: ${error.message}`,
    };
  }
}

/**
 * Vérifie si un ID Discord est présent dans la feuille Google Sheet active.
 * Utilise l'export public CSV de Google Sheets en temps réel.
 */
export async function checkDiscordIdInGoogleSheet(discordId: string): Promise<boolean> {
  const cleanId = (discordId || '').trim();
  if (!cleanId) return false;

  const sheetUrl = process.env.GOOGLE_SHEET_ID || '';
  if (!sheetUrl) return false;

  try {
    let sheetId = '';
    const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      sheetId = match[1];
    } else {
      sheetId = sheetUrl.trim();
    }

    if (!sheetId) return false;

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const res = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TarbesRP-Bot/1.0)',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`[Sheets Check] Erreur HTTP ${res.status} lors de la lecture du Google Sheet`);
      return false;
    }

    const csvText = await res.text();
    // Recherche de l'ID Discord numérique dans le texte du Google Sheet
    const found = csvText.includes(cleanId);
    console.log(`[Sheets Check] Recherche Discord ID "${cleanId}" dans Google Sheet : ${found ? 'PRÉSENT' : 'ABSENT'}`);
    return found;
  } catch (err: any) {
    console.warn('[Sheets Check] Impossible de vérifier le Google Sheet:', err.message || err);
    return false;
  }
}

/**
 * Génère le script Google Apps Script prêt à l'emploi pour le Google Sheet de Tarbes RP.
 */
export function getAppsScriptTemplate(): string {
  return `/**
 * TARBES RP - Google Apps Script de Synchronisation automatique
 * 
 * ⚠️ POUR RÉSOUDRE L'ERREUR 403 GOOGLE ("Désolé, vous n'avez pas accès à cette page") :
 * 1. Ouvrez Google Apps Script dans une fenêtre de NAVIGATION PRIVÉE si vous avez plusieurs comptes Google connectés.
 * 2. Cliquez sur le bouton bleu "Déployer" (en haut à droite) > "Gérer les déploiements" (ou "Nouveau déploiement").
 * 3. IMPÉRATIF :
 *    - Type : Application Web
 *    - "Exécuter en tant que" : Sélectionner "Moi (votre_email@gmail.com)" (JAMAIS "Utilisateur accédant à l'application Web" !)
 *    - "Qui a accès" : Sélectionner "Tout le monde" (Anyone).
 * 4. Cliquez sur Modifier (crayon) > Version : "Nouvelle version" > Déployer.
 */

// Fonction pour initialiser la feuille manuellement en 1 clic dans Apps Script
function initialiserFeuille() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  setupSheetHeadersAndAdmin(sheet);
}

function setupSheetHeadersAndAdmin(sheet) {
  // Colonnes A à I : Vérifications des membres joueurs
  var headers = [
    "Date & Heure",
    "Compte Discord",
    "ID Discord",
    "Compte Roblox",
    "ID Roblox",
    "Statut Rôles Discord",
    "Règlement Officiel",
    "Bot d'attribution",
    "Serveur Discord"
  ];
  sheet.getRange(1, 1, 1, 9).setValues([headers]);
  sheet.getRange(1, 1, 1, 9)
    .setFontWeight("bold")
    .setBackground("#0f172a")
    .setFontColor("#f8fafc");

  // Colonne J (Case J1 à J15) : Base de données & Paramètres Admin de Tarbes RP
  var adminBlock = [
    ["⚙️ BASE DE DONNÉES & INFOS ADMIN"],               // J1
    ["Actions automatiques du Bot Discord"],              // J2
    ["🤖 Bot Officiel : Tarbes RP 🇫🇷🤖#6342"],            // J3
    ["🛡️ Serveur Discord : Tarbes RP"],                  // J4
    ["🆔 ID Serveur : 1509580529958129794"],              // J5
    ["❌ Retrait automatique : Membre non vérifié"],     // J6
    ["🆔 ID Rôle retiré : 1535239314798149673"],          // J7
    ["✅ Attribution automatique : Membre vérifié"],      // J8
    ["🆔 ID Rôle attribué : 1518517334413672519"],        // J9
    ["🔒 Liaison : 1 compte Discord = 1 compte Roblox"], // J10
    ["📜 Règlement : Acceptation obligatoire"],           // J11
    ["💬 MP Discord : Confirmation envoyée par le bot"],  // J12
    ["⌨️ Commande in-game / staff : /dd-rblx"],           // J13
    ["📡 Synchronisation : Temps réel Google Sheets"],    // J14
    ["👤 Administration : Staff Tarbes RP"]               // J15
  ];

  sheet.getRange(1, 10, adminBlock.length, 1).setValues(adminBlock);
  sheet.getRange("J1")
    .setFontWeight("bold")
    .setBackground("#7f1d1d")
    .setFontColor("#ffffff");
  sheet.getRange(2, 10, adminBlock.length - 1, 1)
    .setBackground("#1e293b")
    .setFontColor("#e2e8f0")
    .setFontSize(9);

  sheet.setFrozenRows(1);
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Initialisation automatique des colonnes A:I et du bloc Admin en J2:J15 si vierge
    if (!sheet.getRange("A1").getValue() || !sheet.getRange("J1").getValue()) {
      setupSheetHeadersAndAdmin(sheet);
    }
    
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    // Trouver la prochaine ligne vide dans la colonne A (préserve intacte la colonne J)
    var colA = sheet.getRange("A:A").getValues();
    var nextRow = 1;
    for (var i = 0; i < colA.length; i++) {
      if (colA[i][0] !== "") {
        nextRow = i + 2;
      }
    }

    // Insérer la vérification uniquement dans les colonnes A à I
    sheet.getRange(nextRow, 1, 1, 9).setValues([[
      data.dateFormatted || new Date().toISOString(),
      data.discordTag || "N/A",
      "'" + (data.discordId || ""),
      data.robloxUsername || "N/A",
      "'" + (data.robloxId || ""),
      data.rolesStatus || "Rôles Appliqués (Membre)",
      data.rulesAccepted || "Règlement Accepté",
      data.botTag || "Tarbes RP 🇫🇷🤖#6342",
      data.guildName || "Tarbes RP"
    ]]);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      rowAdded: nextRow,
      message: "Ligne enregistrée dans la feuille Tarbes RP" 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Fonction GET pour tests dans le navigateur et requêtes légères
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.discordId) {
      return doPost(e);
    }

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>Tarbes RP - Webhook Connecté</title>' +
      '<style>body{font-family:system-ui,sans-serif;background:#090d16;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}' +
      '.card{background:#111625;border:2px solid #22c55e;padding:32px;border-radius:18px;text-align:center;max-width:500px;box-shadow:0 15px 35px rgba(0,0,0,0.6);}' +
      'h1{color:#4ade80;font-size:22px;margin:0 0 8px;}' +
      'p{color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 16px;}' +
      '.badge{background:#1e293b;border:1px solid #334155;padding:6px 14px;border-radius:8px;font-family:monospace;font-size:12px;color:#cbd5e1;display:inline-block;}' +
      '</style></head><body>' +
      '<div class="card">' +
      '<h1>✅ Webhook Google Sheets Opérationnel !</h1>' +
      '<p>Le Webhook de synchronisation <strong>Tarbes RP 🇫🇷🤖#6342</strong> est accessible sans erreur 403.<br>La base de données dans la feuille (colonnes A-I pour les joueurs et J2-J15 pour les infos admin) est prête.</p>' +
      '<div class="badge">Tarbes RP • 1 Discord = 1 Roblox</div>' +
      '</div></body></html>';

    return HtmlService.createHtmlOutput(html);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      service: "Tarbes RP Webhook Google Sheets",
      bot: "Tarbes RP 🇫🇷🤖#6342"
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
}
