import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  getAllVerifications,
  getVerificationByDiscordId,
  getVerificationByRobloxId,
  saveVerification,
  deleteVerification,
} from './server/db.js';
import {
  getDiscordClient,
  getBotStatus,
  updateMemberRoles,
  getMemberRoleStatus,
  GUILD_ID,
  ROLE_REMOVE_ID,
  ROLE_ADD_ID,
} from './server/discordBot.js';
import { syncVerificationToSheet, getAppsScriptTemplate, checkDiscordIdInGoogleSheet } from './server/sheets.js';
import { OFFICIAL_RULES_TEXT } from './server/rulesText.js';
import type { VerificationRecord, DiscordUser, RobloxUser } from './src/types.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const PORT = 3000;

  app.use(express.json());

  // Initialize Discord bot in the background
  try {
    getDiscordClient();
  } catch (err) {
    console.error('Failed to start Discord bot client:', err);
  }

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 2. Fetch Rules (Official Tarbes RP Charter)
  app.get('/api/rules', async (req, res) => {
    try {
      const response = await fetch('https://adrien-barron.tech/rules.txt', {
        headers: { 'User-Agent': 'TarbesRP-Verification/1.0' },
      });
      if (response.ok) {
        const text = await response.text();
        if (text && text.length > 500) {
          return res.json({ success: true, text });
        }
      }
    } catch {
      // Use official bundled text
    }
    res.json({ success: true, text: OFFICIAL_RULES_TEXT });
  });

  // 3. Discord Bot status and config
  app.get('/api/bot/status', async (req, res) => {
    try {
      const status = await getBotStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // In-memory store for OAuth completions to allow cross-window polling and exact redirectUri tracking
  const latestOAuthSessions = new Map<string, { user: DiscordUser; alreadyVerified: boolean; timestamp: number }>();
  const sessionRedirectUris = new Map<string, string>();

  function getOAuthRedirectUri(req: express.Request): string {
    // 1. If explicit query parameter provided by frontend
    const clientRedirect = (req.query.redirectUri as string || '').trim();
    if (clientRedirect) {
      try {
        const u = new URL(clientRedirect);
        if (u.hostname.endsWith('.run.app') || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return clientRedirect;
        }
      } catch {
        // ignore
      }
    }

    // 2. If APP_URL environment variable is set (AI Studio preview environment)
    if (process.env.APP_URL) {
      const raw = process.env.APP_URL.replace(/\/+$/, '');
      return `${raw}/auth/callback`;
    }

    // 3. Fallback to request host
    const host = req.get('host') || 'localhost:3000';
    const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${proto}://${host}/auth/callback`;
  }

  // Check OAuth status by sessionId (polling fallback)
  app.get('/api/auth/discord/latest-session', (req, res) => {
    const sessionId = (req.query.sessionId as string || '').trim();
    if (!sessionId) return res.json({ ready: false });
    const session = latestOAuthSessions.get(sessionId);
    if (session && Date.now() - session.timestamp < 120000) {
      return res.json({
        ready: true,
        user: session.user,
        alreadyVerified: session.alreadyVerified,
      });
    }
    return res.json({ ready: false });
  });

  // 4. Construct Discord OAuth2 URL
  app.get('/api/auth/discord/url', (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId || clientId.trim() === '') {
      return res.json({
        configured: false,
        message: 'DISCORD_CLIENT_ID non configuré.',
      });
    }

    const sessionId = ((req.query.sessionId as string) || '').trim();
    const redirectUri = getOAuthRedirectUri(req);
    if (sessionId) {
      sessionRedirectUris.set(sessionId, redirectUri);
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds guilds.members.read',
      prompt: 'consent',
      ...(sessionId ? { state: sessionId } : {}),
    });

    const url = `https://discord.com/oauth2/authorize?${params.toString()}`;
    res.json({
      configured: true,
      url,
      redirectUri,
    });
  });

  // 4b. Recherche de compte Discord par Identifiant (ID) ou Pseudo
  app.post('/api/auth/discord/search-user', async (req, res) => {
    try {
      const query = (req.body.query || req.body.usernameOrId || '').trim();
      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Veuillez saisir votre identifiant Discord (ID numérique) ou votre pseudo.',
        });
      }

      const input = query.replace(/^@/, '');
      const cleanDigits = input.replace(/\D/g, '');
      const isNumericId = cleanDigits.length >= 16 && cleanDigits.length <= 22;

      const botToken = process.env.DISCORD_BOT_TOKEN;
      let discordUser: DiscordUser | null = null;
      let onServer = false;
      let serverNick: string | null = null;
      let roles: string[] = [];

      // 1. Si identifiant numérique : appel direct à l'API officielle Discord via le token du Bot
      if (isNumericId && botToken) {
        const userRes = await fetch(`https://discord.com/api/v10/users/${cleanDigits}`, {
          headers: { Authorization: `Bot ${botToken}` },
        }).catch(() => null);

        if (userRes && userRes.ok) {
          const u: any = await userRes.json();
          const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;

          discordUser = {
            id: u.id,
            username: u.username,
            global_name: u.global_name || u.username,
            discriminator: u.discriminator || '0',
            avatar: u.avatar,
            avatarUrl,
          };

          // Vérifier si le membre est sur le serveur Tarbes RP et récupérer ses rôles
          const memberRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${cleanDigits}`, {
            headers: { Authorization: `Bot ${botToken}` },
          }).catch(() => null);

          if (memberRes && memberRes.ok) {
            const m: any = await memberRes.json();
            onServer = true;
            serverNick = m.nick || null;
            roles = m.roles || [];
          }
        }
      }

      // 2. Si non trouvé par ID direct ou si recherche par pseudo : chercher sur le serveur Tarbes RP
      if (!discordUser && botToken) {
        // Essai avec l'endpoint de recherche officiel Discord
        const searchRes = await fetch(
          `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(input)}&limit=5`,
          { headers: { Authorization: `Bot ${botToken}` } }
        ).catch(() => null);

        if (searchRes && searchRes.ok) {
          const members: any[] = await searchRes.json();
          if (members && members.length > 0) {
            const m = members[0];
            const u = m.user;
            const avatarUrl = u.avatar
              ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
              : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;

            discordUser = {
              id: u.id,
              username: u.username,
              global_name: u.global_name || u.username,
              discriminator: u.discriminator || '0',
              avatar: u.avatar,
              avatarUrl,
            };
            onServer = true;
            serverNick = m.nick || null;
            roles = m.roles || [];
          }
        }

        // Fallback complet : parcourir les membres du serveur pour correspondance exacte ou partielle (username, display name, nickname)
        if (!discordUser) {
          const allMembersRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000`, {
            headers: { Authorization: `Bot ${botToken}` },
          }).catch(() => null);

          if (allMembersRes && allMembersRes.ok) {
            const allMembers: any[] = await allMembersRes.json();
            if (Array.isArray(allMembers)) {
              const lowerInput = input.toLowerCase();
              const matched = allMembers.find((m) => {
                const uname = (m.user?.username || '').toLowerCase();
                const gname = (m.user?.global_name || '').toLowerCase();
                const nick = (m.nick || '').toLowerCase();
                return (
                  uname === lowerInput ||
                  gname === lowerInput ||
                  nick === lowerInput ||
                  nick.includes(lowerInput) ||
                  uname.includes(lowerInput) ||
                  gname.includes(lowerInput)
                );
              });

              if (matched) {
                const u = matched.user;
                const avatarUrl = u.avatar
                  ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
                  : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;

                discordUser = {
                  id: u.id,
                  username: u.username,
                  global_name: u.global_name || u.username,
                  discriminator: u.discriminator || '0',
                  avatar: u.avatar,
                  avatarUrl,
                };
                onServer = true;
                serverNick = matched.nick || null;
                roles = matched.roles || [];
              }
            }
          }
        }
      }

      // 3. Fallback client Discord.js si disponible
      if (!discordUser) {
        const client = getDiscordClient();
        if (client && client.isReady()) {
          try {
            const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
            if (guild) {
              let member: any = null;
              if (isNumericId) {
                member = await guild.members.fetch(cleanDigits).catch(() => null);
              } else {
                const searchResults = await guild.members.search({ query: input, limit: 1 }).catch(() => null);
                member = searchResults?.first() || null;
              }

              if (member) {
                discordUser = {
                  id: member.user.id,
                  username: member.user.username,
                  global_name: member.user.globalName || member.displayName,
                  discriminator: member.user.discriminator || '0',
                  avatar: member.user.avatar,
                  avatarUrl: member.user.displayAvatarURL({ size: 256 }),
                };
                onServer = true;
                serverNick = member.nickname || null;
                roles = member.roles.cache.map((r: any) => r.id);
              }
            }
          } catch {
            // ignore
          }
        }
      }

      if (!discordUser) {
        return res.status(404).json({
          success: false,
          error: `Compte Discord introuvable pour "${input}". Veuillez entrer votre identifiant Discord numérique (ex : 1509579941187026985) ou vérifier que vous êtes bien sur le serveur Tarbes RP.`,
        });
      }

      const existing = getVerificationByDiscordId(discordUser.id);
      const inSheet = await checkDiscordIdInGoogleSheet(discordUser.id);
      const hasUnverifiedRole = roles.includes('1535239314798149673');
      const hasVerifiedRole = roles.includes('1518517334413672519');

      // Pour qu'un compte soit considéré comme déjà vérifié, il DOIT être présent dans la feuille Google Sheet !
      const isAlreadyVerified = inSheet;

      res.json({
        success: true,
        user: discordUser,
        onServer,
        serverNick,
        hasUnverifiedRole,
        hasVerifiedRole,
        alreadyVerified: isAlreadyVerified,
        inGoogleSheet: inSheet,
        existingVerification: existing || null,
      });
    } catch (err: any) {
      console.error('[Discord Search Error]:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Erreur lors de la recherche du compte Discord.',
      });
    }
  });

  // Alias pour route /api/auth/discord/direct
  app.post('/api/auth/discord/direct', async (req, res) => {
    const query = req.body.usernameOrId || req.body.query;
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const input = (query || '').trim().replace(/^@/, '');
    const cleanDigits = input.replace(/\D/g, '');
    const isNumericId = cleanDigits.length >= 16 && cleanDigits.length <= 22;

    try {
      if (isNumericId && botToken) {
        const userRes = await fetch(`https://discord.com/api/v10/users/${cleanDigits}`, {
          headers: { Authorization: `Bot ${botToken}` },
        }).catch(() => null);

        if (userRes && userRes.ok) {
          const u: any = await userRes.json();
          const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;

          const discordUser: DiscordUser = {
            id: u.id,
            username: u.username,
            global_name: u.global_name || u.username,
            discriminator: u.discriminator || '0',
            avatar: u.avatar,
            avatarUrl,
          };
          const existing = getVerificationByDiscordId(discordUser.id);
          return res.json({ success: true, user: discordUser, alreadyVerified: Boolean(existing) });
        }
      }

      // Si pas trouvé par ID, rechercher sur la guild
      if (botToken) {
        const searchRes = await fetch(
          `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=${encodeURIComponent(input)}&limit=1`,
          { headers: { Authorization: `Bot ${botToken}` } }
        ).catch(() => null);

        if (searchRes && searchRes.ok) {
          const members: any[] = await searchRes.json();
          if (members && members.length > 0) {
            const m = members[0];
            const u = m.user;
            const avatarUrl = u.avatar
              ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
              : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;
            const discordUser: DiscordUser = {
              id: u.id,
              username: u.username,
              global_name: u.global_name || u.username,
              discriminator: u.discriminator || '0',
              avatar: u.avatar,
              avatarUrl,
            };
            const inSheet = await checkDiscordIdInGoogleSheet(discordUser.id);
            const existing = getVerificationByDiscordId(discordUser.id);
            return res.json({ success: true, user: discordUser, alreadyVerified: inSheet, inGoogleSheet: inSheet, existingVerification: existing || null });
          }
        }
      }

      return res.status(404).json({
        success: false,
        error: `Compte Discord introuvable pour "${input}". Veuillez saisir votre identifiant Discord numérique (ex : 1509579941187026985).`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Erreur lors de la validation Discord' });
    }
  });

  // 5. OAuth Callback (handles popup callback)
  const oauthCallbackHandler = async (req: express.Request, res: express.Response) => {
    const { code, error } = req.query;

    if (error || !code) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; background: #0f1117; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh;">
            <div style="text-align: center; max-width: 400px; padding: 24px; border: 1px solid #ef4444; border-radius: 12px; background: #1e1e2d;">
              <h2 style="color: #ef4444; margin-top: 0;">Connexion annulée ou échouée</h2>
              <p>${error || 'Code d’autorisation manquant'}</p>
              <button onclick="window.close()" style="background: #3b82f6; border: none; color: #fff; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">Fermer la fenêtre</button>
            </div>
          </body>
        </html>
      `);
    }

    try {
      const clientId = (process.env.DISCORD_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
      const clientSecret = (process.env.DISCORD_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
      const state = String(req.query.state || '').trim();
      const redirectUri = (state && sessionRedirectUris.get(state)) || getOAuthRedirectUri(req);

      if (!clientId || !clientSecret) {
        throw new Error('Variables DISCORD_CLIENT_ID ou DISCORD_CLIENT_SECRET manquantes ou vides.');
      }

      // Exchange code for token using standard Discord x-www-form-urlencoded body
      const tokenBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenBody.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        let parsedError: any = {};
        try {
          parsedError = JSON.parse(errorText);
        } catch {
          // ignore
        }

        if (parsedError.error === 'invalid_client') {
          throw new Error(
            'Erreur Discord OAuth: {"error": "invalid_client"}. Le Client Secret (DISCORD_CLIENT_SECRET) ou le Client ID est incorrect ou a été réinitialisé ("Reset Secret") dans le Discord Developer Portal.'
          );
        }

        throw new Error(`Erreur Discord OAuth: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // Fetch user profile from Discord
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userResponse.ok) {
        throw new Error('Impossible de récupérer le profil Discord');
      }

      const userData = await userResponse.json();

      const discordUser: DiscordUser = {
        id: userData.id,
        username: userData.username,
        global_name: userData.global_name,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        avatarUrl: userData.avatar
          ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=256`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || '0', 10) % 5}.png`,
        email: userData.email,
      };

      // Check if user is already verified
      const existing = getVerificationByDiscordId(discordUser.id);
      const isAlreadyVerified = Boolean(existing);

      if (state) {
        latestOAuthSessions.set(state, {
          user: discordUser,
          alreadyVerified: isAlreadyVerified,
          timestamp: Date.now(),
        });
      }

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Connexion Discord Réussie</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #0f1117;
                color: #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
              }
              .card {
                text-align: center;
                padding: 32px;
                border-radius: 16px;
                background: #1a1e29;
                border: 1px solid #334155;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
              }
              .spinner {
                border: 3px solid rgba(255,255,255,0.1);
                border-top: 3px solid #6366f1;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                animation: spin 1s linear infinite;
                margin: 0 auto 16px;
              }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="spinner"></div>
              <h2 style="color: #6366f1; margin: 0 0 8px;">Connexion réussie !</h2>
              <p style="margin: 0; color: #94a3b8;">Redirection vers Tarbes RP...</p>
            </div>
            <script>
              const payload = {
                type: 'DISCORD_AUTH_SUCCESS',
                user: ${JSON.stringify(discordUser)},
                alreadyVerified: ${isAlreadyVerified}
              };

              if (window.opener) {
                window.opener.postMessage(payload, '*');
                setTimeout(() => window.close(), 600);
              } else {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('OAuth Callback Error:', err);
      const isInvalidClient = String(err.message || '').includes('invalid_client');
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Erreur Connexion Discord</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0e14; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { max-width: 500px; width: 100%; padding: 28px; border: 1px solid #ef4444; border-radius: 16px; background: #161a23; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
              h3 { color: #f87171; margin-top: 0; font-size: 18px; }
              p { color: #cbd5e1; font-size: 13px; line-height: 1.5; }
              .box { background: #0e1219; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #fca5a5; word-break: break-all; margin: 12px 0; }
              .help { background: #1e1b4b; border: 1px solid #4338ca; border-radius: 8px; padding: 12px; font-size: 12px; color: #c7d2fe; margin-top: 14px; text-align: left; }
              .btn { background: #4f46e5; border: none; color: #fff; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 13px; margin-top: 16px; width: 100%; }
              .btn:hover { background: #4338ca; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3>⚠️ Échec de la validation OAuth Discord</h3>
              <div class="box">${err.message}</div>
              ${
                isInvalidClient
                  ? `
                <div class="help">
                  <strong>💡 Comment corriger cette erreur :</strong><br>
                  1. Rendez-vous sur le <a href="https://discord.com/developers/applications" target="_blank" style="color: #93c5fd;">Discord Developer Portal</a>.<br>
                  2. Sélectionnez votre application <code>1551173253693702265</code>.<br>
                  3. Allez dans <strong>OAuth2</strong> &gt; <strong>General</strong>.<br>
                  4. Sous <strong>Client Secret</strong>, cliquez sur <strong>"Reset Secret"</strong>.<br>
                  5. Copiez la nouvelle clé et mettez à jour votre variable <code>DISCORD_CLIENT_SECRET</code>.<br>
                  6. Allez aussi dans l'onglet <strong>Bot</strong> &gt; <strong>"Reset Token"</strong> pour mettre à jour <code>DISCORD_BOT_TOKEN</code>.
                </div>
              `
                  : ''
              }
              <button class="btn" onclick="window.close()">Fermer cette fenêtre</button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({
                  type: 'DISCORD_AUTH_ERROR',
                  error: ${JSON.stringify(err.message || 'Erreur OAuth inconnue')},
                  isInvalidClient: ${isInvalidClient}
                }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }
  };

  app.get(['/auth/callback', '/auth/callback/'], oauthCallbackHandler);

  // 6. Test / Simulation Discord Login (Allows immediate preview testing)
  app.post('/api/auth/discord/simulate', (req, res) => {
    const { username, id } = req.body;
    const discordId = (id || `1509${Math.floor(100000000000000 + Math.random() * 900000000000000)}`).trim();
    const tag = (username || 'JoueurTarbesRP').trim();

    const mockUser: DiscordUser = {
      id: discordId,
      username: tag,
      global_name: tag,
      discriminator: '0',
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${discordId}`,
    };

    const existing = getVerificationByDiscordId(discordId);

    res.json({
      success: true,
      user: mockUser,
      alreadyVerified: Boolean(existing),
      existingRecord: existing || null,
    });
  });

  // 7. Roblox User Search
  app.get('/api/roblox/search', async (req, res) => {
    const keyword = (req.query.keyword as string || '').trim();
    if (!keyword) {
      return res.json({ users: [] });
    }

    try {
      // Search Roblox users
      const searchRes = await fetch(
        `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(keyword)}&limit=10`,
        { headers: { 'User-Agent': 'TarbesRP-Bot/1.0' } }
      );

      if (!searchRes.ok) {
        throw new Error(`Roblox Search Error ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
      const rawUsers: any[] = searchData.data || [];

      if (rawUsers.length === 0) {
        return res.json({ users: [] });
      }

      const userIds = rawUsers.map((u) => u.id).join(',');

      // Fetch headshot avatar thumbnails in batch
      const thumbRes = await fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userIds}&size=150x150&format=Png&isCircular=true`,
        { headers: { 'User-Agent': 'TarbesRP-Bot/1.0' } }
      );

      let thumbsMap: Record<number, string> = {};
      if (thumbRes.ok) {
        const thumbData = await thumbRes.json();
        if (thumbData.data) {
          thumbData.data.forEach((item: any) => {
            if (item.imageUrl) {
              thumbsMap[item.targetId] = item.imageUrl;
            }
          });
        }
      }

      const users: RobloxUser[] = rawUsers.map((u) => ({
        id: u.id,
        name: u.name,
        displayName: u.displayName || u.name,
        hasVerifiedBadge: u.hasVerifiedBadge || false,
        previousUsernames: u.previousUsernames || [],
        headshotUrl: thumbsMap[u.id] || `https://tr.rbxcdn.com/30DAY-AvatarHeadshot-150x150.png`,
      }));

      res.json({ users });
    } catch (err: any) {
      console.error('Roblox search error:', err.message);
      res.status(500).json({ error: `Impossible de joindre l'API Roblox: ${err.message}` });
    }
  });

  // 8. Roblox User Details & Full Avatar
  app.get('/api/roblox/user/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const userRes = await fetch(`https://users.roblox.com/v1/users/${id}`);
      if (!userRes.ok) {
        return res.status(404).json({ error: 'Compte Roblox introuvable' });
      }
      const userData = await userRes.json();

      // Fetch headshot & full avatar
      const [headshotRes, fullAvatarRes] = await Promise.all([
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png&isCircular=true`),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=352x352&format=Png&isCircular=false`),
      ]);

      let headshotUrl = '';
      let avatarUrl = '';

      if (headshotRes.ok) {
        const hsData = await headshotRes.json();
        headshotUrl = hsData.data?.[0]?.imageUrl || '';
      }
      if (fullAvatarRes.ok) {
        const avData = await fullAvatarRes.json();
        avatarUrl = avData.data?.[0]?.imageUrl || '';
      }

      res.json({
        id: userData.id,
        name: userData.name,
        displayName: userData.displayName,
        description: userData.description || '',
        created: userData.created,
        headshotUrl: headshotUrl || `https://tr.rbxcdn.com/30DAY-AvatarHeadshot-150x150.png`,
        avatarUrl: avatarUrl || headshotUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Check if Discord account is already verified in Google Sheet
  app.get('/api/verifications/check/:discordId', async (req, res) => {
    const { discordId } = req.params;
    const cleanId = (discordId || '').trim();
    const inSheet = await checkDiscordIdInGoogleSheet(cleanId);
    const existing = getVerificationByDiscordId(cleanId);
    const roleStatus = await getMemberRoleStatus(cleanId).catch(() => null);

    // Pour qu'un compte soit considéré comme déjà vérifié, son ID doit être présent dans le Google Sheet !
    if (inSheet) {
      return res.json({
        verified: true,
        inSheet: true,
        record: existing || {
          id: `sheet-${cleanId}`,
          discordId: cleanId,
          discordTag: roleStatus?.memberTag || cleanId,
          robloxId: '',
          robloxUsername: 'Compte vérifié',
          robloxDisplayName: 'Joueur Tarbes RP',
          verifiedAt: new Date().toISOString(),
          rolesUpdated: true,
          sheetsSynced: true,
        },
        roleStatus,
      });
    }

    // Si absent du Google Sheet, le joueur PEUT faire / refaire la vérification !
    return res.json({
      verified: false,
      inSheet: false,
      canReverify: true,
      hadPreviousRecord: Boolean(existing),
      record: existing || null,
      roleStatus,
    });
  });

  // 10. Get all verifications
  app.get('/api/verifications', (req, res) => {
    const list = getAllVerifications();
    res.json({ verifications: list });
  });

  // 11. Complete Verification
  app.post('/api/verify', async (req, res) => {
    const { discordUser, robloxUser, rulesAccepted, forceReverify } = req.body;

    if (!discordUser?.id || !robloxUser?.id) {
      return res.status(400).json({ error: 'Données Discord ou Roblox incomplètes' });
    }

    if (rulesAccepted !== true) {
      return res.status(400).json({
        error: 'Règlement non accepté',
        message: 'Vous devez lire et accepter le règlement officiel de Tarbes RP pour valider votre vérification.',
      });
    }

    // Pour qu'un compte soit considéré déjà vérifié, il faut qu'il soit dans la feuille Google Sheet.
    // Si absent de la feuille Google Sheet OU si l'utilisateur force la revérification, on autorise la vérif !
    const inSheet = await checkDiscordIdInGoogleSheet(discordUser.id);
    if (inSheet && !forceReverify) {
      const existing = getVerificationByDiscordId(discordUser.id);
      return res.status(409).json({
        error: 'Compte déjà vérifié',
        message: 'Ce compte Discord est déjà enregistré dans le Google Sheet officiel. Vous pouvez refaire la vérification pour changer votre compte Roblox lié.',
        canReverify: true,
        record: existing || null,
      });
    }

    // Check if Roblox account is ALREADY linked to another Discord account
    const existingRoblox = getVerificationByRobloxId(String(robloxUser.id));
    if (existingRoblox && existingRoblox.discordId !== String(discordUser.id) && !forceReverify) {
      return res.status(409).json({
        error: 'Compte Roblox déjà associé',
        message: `Ce compte Roblox (${robloxUser.name}) est déjà associé à un autre compte Discord.`,
        record: existingRoblox,
      });
    }

    const verificationRecord: VerificationRecord = {
      id: `verif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      discordId: String(discordUser.id),
      discordTag: discordUser.global_name || discordUser.username || discordUser.id,
      discordAvatar: discordUser.avatarUrl || null,
      robloxId: String(robloxUser.id),
      robloxUsername: robloxUser.name,
      robloxDisplayName: robloxUser.displayName || robloxUser.name,
      robloxAvatarUrl: robloxUser.headshotUrl || robloxUser.avatarUrl,
      verifiedAt: new Date().toISOString(),
      rulesAccepted: true,
      rulesAcceptedAt: new Date().toISOString(),
      guildId: GUILD_ID,
      rolesUpdated: false,
      sheetsSynced: false,
    };

    // Update Discord Member Roles via Bot and send confirmation DM
    const roleResult = await updateMemberRoles(discordUser.id, {
      id: String(robloxUser.id),
      username: robloxUser.name,
      displayName: robloxUser.displayName || robloxUser.name,
      avatarUrl: robloxUser.headshotUrl || robloxUser.avatarUrl,
    });

    verificationRecord.rolesUpdated = roleResult.success;
    verificationRecord.roleDetails = {
      removedRole: roleResult.removedRole,
      addedRole: roleResult.addedRole,
      success: roleResult.success,
      message: roleResult.message,
    };

    // Save directly to the Database (data/verifications.json)
    saveVerification(verificationRecord);
    console.log(`[Database] Liaison enregistrée : Discord ${verificationRecord.discordTag} (${verificationRecord.discordId}) = Roblox ${verificationRecord.robloxUsername} (${verificationRecord.robloxId})`);

    // Sync to Google Sheets in background
    syncVerificationToSheet(verificationRecord)
      .then((sheetsRes) => {
        verificationRecord.sheetsSynced = sheetsRes.success;
        if (!sheetsRes.success) {
          verificationRecord.sheetsError = sheetsRes.message;
        }
        saveVerification(verificationRecord);
      })
      .catch((err) => {
        console.error('Error syncing to sheets:', err);
      });

    return res.json({
      success: true,
      message: 'Vérification terminée',
      record: verificationRecord,
      dmSent: roleResult.dmSent,
    });
  });

  // 12. Public API Link Lookup by Discord ID (Discord -> Roblox)
  app.get('/api/link/discord/:discordId', (req, res) => {
    const record = getVerificationByDiscordId(req.params.discordId);
    if (!record) {
      return res.status(404).json({ linked: false, message: 'Aucun compte Roblox lié à ce compte Discord.' });
    }
    return res.json({
      linked: true,
      discordId: record.discordId,
      discordTag: record.discordTag,
      robloxId: record.robloxId,
      robloxUsername: record.robloxUsername,
      robloxDisplayName: record.robloxDisplayName,
      robloxAvatarUrl: record.robloxAvatarUrl,
      verifiedAt: record.verifiedAt,
      rulesAccepted: record.rulesAccepted ?? true,
    });
  });

  // 13. Public API Link Lookup by Roblox ID (Roblox -> Discord) for game scripts
  app.get('/api/link/roblox/:robloxId', (req, res) => {
    const record = getVerificationByRobloxId(req.params.robloxId);
    if (!record) {
      return res.status(404).json({ linked: false, message: 'Aucun compte Discord lié à ce compte Roblox.' });
    }
    return res.json({
      linked: true,
      robloxId: record.robloxId,
      robloxUsername: record.robloxUsername,
      robloxDisplayName: record.robloxDisplayName,
      discordId: record.discordId,
      discordTag: record.discordTag,
      verifiedAt: record.verifiedAt,
      rulesAccepted: record.rulesAccepted ?? true,
    });
  });

  // 14. Export Database to CSV
  app.get('/api/verifications/export/csv', (req, res) => {
    const list = getAllVerifications();
    const headers = ['Date', 'Discord ID', 'Discord Tag', 'Roblox ID', 'Roblox Pseudo', 'Roblox Display Name', 'Reglement Accepte', 'Roles Appliques'];
    const rows = list.map((v) => [
      `"${v.verifiedAt}"`,
      `"${v.discordId}"`,
      `"${(v.discordTag || '').replace(/"/g, '""')}"`,
      `"${v.robloxId}"`,
      `"${(v.robloxUsername || '').replace(/"/g, '""')}"`,
      `"${(v.robloxDisplayName || '').replace(/"/g, '""')}"`,
      `"${v.rulesAccepted !== false ? 'OUI' : 'NON'}"`,
      `"${v.rolesUpdated ? 'OUI' : 'NON'}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tarbes-rp-verifications.csv"');
    res.send(csvContent);
  });

  // 15. Refresh / Reapply Discord Roles & Sync to Database + Google Sheets
  app.post('/api/roles/refresh', async (req, res) => {
    const { discordId } = req.body;
    if (!discordId) {
      return res.status(400).json({ error: 'discordId manquant' });
    }
    const existing = getVerificationByDiscordId(discordId);
    const robloxData = existing
      ? {
          id: existing.robloxId,
          username: existing.robloxUsername,
          displayName: existing.robloxDisplayName,
          avatarUrl: existing.robloxAvatarUrl,
        }
      : undefined;

    const result = await updateMemberRoles(discordId, robloxData);

    let sheetResult: { success: boolean; message: string } | null = null;
    if (existing) {
      existing.rolesUpdated = result.success;
      existing.roleDetails = {
        removedRole: result.removedRole,
        addedRole: result.addedRole,
        success: result.success,
        message: result.message,
      };

      // Automatically sync to Google Sheets upon role refresh
      sheetResult = await syncVerificationToSheet(existing);
      existing.sheetsSynced = sheetResult.success;
      if (!sheetResult.success) {
        existing.sheetsError = sheetResult.message;
      } else {
        delete existing.sheetsError;
      }
      saveVerification(existing);
      console.log(`[Sync] Rôles et Google Sheets synchronisés pour ${existing.discordTag} (${existing.robloxUsername}) : Sheets=${sheetResult.success}`);
    }

    res.json({
      ...result,
      sheetsSynced: sheetResult ? sheetResult.success : false,
      sheetsMessage: sheetResult ? sheetResult.message : 'Aucune fiche trouvée en base de données',
    });
  });

  // 16. Manually sync a specific verification to Google Sheets
  app.post('/api/verifications/:id/sync-sheets', async (req, res) => {
    const list = getAllVerifications();
    const record = list.find((v) => v.id === req.params.id || v.discordId === req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Fiche introuvable' });
    }

    const result = await syncVerificationToSheet(record);
    record.sheetsSynced = result.success;
    if (!result.success) {
      record.sheetsError = result.message;
    } else {
      delete record.sheetsError;
    }
    saveVerification(record);
    res.json({ success: result.success, message: result.message, record });
  });

  // 17. Sync all records to Google Sheets
  app.post('/api/verifications/sync-all-sheets', async (req, res) => {
    const list = getAllVerifications();
    let syncedCount = 0;
    const errors: string[] = [];

    for (const record of list) {
      const resSync = await syncVerificationToSheet(record);
      record.sheetsSynced = resSync.success;
      if (resSync.success) {
        delete record.sheetsError;
        syncedCount++;
      } else {
        record.sheetsError = resSync.message;
        errors.push(`${record.discordTag}: ${resSync.message}`);
      }
      saveVerification(record);
    }

    res.json({
      success: errors.length === 0,
      syncedCount,
      total: list.length,
      errors,
    });
  });

  // 13. Delete verification (Admin)
  app.delete('/api/verifications/:id', (req, res) => {
    const success = deleteVerification(req.params.id);
    res.json({ success });
  });

  // 13. Test Google Sheets Webhook
  app.post('/api/sheets/test', async (req, res) => {
    const { webhookUrl } = req.body;
    const testRecord: VerificationRecord = {
      id: 'test-sync',
      discordId: '123456789012345678',
      discordTag: 'TestTarbes#0000',
      robloxId: '1',
      robloxUsername: 'RobloxTest',
      robloxDisplayName: 'Test Display',
      verifiedAt: new Date().toISOString(),
      guildId: GUILD_ID,
      rolesUpdated: true,
      sheetsSynced: false,
    };

    const result = await syncVerificationToSheet(testRecord, webhookUrl);
    res.json(result);
  });

  // 14. Get Google Apps Script template code
  app.get('/api/sheets/template', (req, res) => {
    res.json({ script: getAppsScriptTemplate() });
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Tarbes RP] Serveur lancé sur le port ${PORT}`);
    console.log(`[Tarbes RP] Serveur Discord Guild ID: ${GUILD_ID}`);
    console.log(`[Tarbes RP] Rôle à retirer: ${ROLE_REMOVE_ID} | Rôle à ajouter: ${ROLE_ADD_ID}`);
  });
}

startServer();
