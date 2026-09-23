import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  Partials,
} from 'discord.js';
import { getAllVerifications } from './db.js';

export const GUILD_ID = process.env.DISCORD_GUILD_ID || '1509580529958129794';
export const ROLE_REMOVE_ID = process.env.DISCORD_ROLE_REMOVE_ID || '1535239314798149673';
export const ROLE_ADD_ID = process.env.DISCORD_ROLE_ADD_ID || '1518517334413672519';
export const STAFF_LOG_CHANNEL_ID = process.env.DISCORD_STAFF_LOG_CHANNEL_ID || '1512120600263659690';

let discordClient: Client | null = null;
let isBotReady = false;
let botError: string | null = null;

// Initialize Discord Client
export function getDiscordClient(): Client | null {
  if (discordClient) return discordClient;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token.trim() === '' || token.includes('MY_DISCORD_BOT_TOKEN')) {
    botError = 'DISCORD_BOT_TOKEN non configuré';
    console.log('[Discord Bot] Aucun token configuré. Le bot fonctionnera en mode attente.');
    return null;
  }

  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.GuildMember, Partials.User],
    });

    client.once('ready', async () => {
      isBotReady = true;
      botError = null;
      console.log(`[Discord Bot] Connecté en tant que ${client.user?.tag} (ID: ${client.user?.id})`);

      // Register slash command /dd-rblx
      await registerSlashCommands(client);
    });

    client.on('error', (err) => {
      console.error('[Discord Bot] Erreur client:', err);
      botError = err.message;
    });

    // Handle slash command interactions
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'dd-rblx') {
        await handleDdRblxCommand(interaction);
      }
    });

    client.login(token).catch((err) => {
      console.error('[Discord Bot] Échec de la connexion (login):', err.message);
      botError = `Échec de connexion Discord: ${err.message}`;
      isBotReady = false;
    });

    discordClient = client;
    return discordClient;
  } catch (err: any) {
    console.error('[Discord Bot] Erreur initialisation:', err);
    botError = err.message;
    return null;
  }
}

/**
 * Register slash command /dd-rblx on Guild or Global
 */
async function registerSlashCommands(client: Client) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID || client.user?.id;

  if (!token || !clientId) {
    console.warn('[Discord Bot] Impossible d’enregistrer la commande: CLIENT_ID ou TOKEN manquant');
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('dd-rblx')
      .setDescription('Affiche le tableau des comptes Discord et Roblox liés pour Tarbes RP')
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`[Discord Bot] Enregistrement de la commande /dd-rblx pour le serveur ${GUILD_ID}...`);
    await rest.put(
      Routes.applicationGuildCommands(clientId, GUILD_ID),
      { body: commands }
    );
    console.log('[Discord Bot] Commande slash /dd-rblx enregistrée avec succès sur le serveur !');
  } catch (err: any) {
    console.warn('[Discord Bot] Impossible d’enregistrer la commande sur la guild (essai en global):', err.message);
    try {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('[Discord Bot] Commande slash /dd-rblx enregistrée globalement !');
    } catch (globalErr: any) {
      console.error('[Discord Bot] Échec de l’enregistrement global de la commande:', globalErr.message);
    }
  }
}

/**
 * Commande /dd-rblx : affiche un tableau avec les comptes Discord et Roblox liés
 */
async function handleDdRblxCommand(interaction: any) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const verifications = getAllVerifications();

    if (verifications.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle('📋 Tarbes RP — Comptes Vérifiés')
        .setDescription('Aucun compte Discord/Roblox n’a encore été lié dans la base de données.')
        .setTimestamp();
      return await interaction.editReply({ embeds: [emptyEmbed] });
    }

    const total = verifications.length;
    // Format up to 20 most recent verifications in a clean table/embed
    const recent = verifications.slice(0, 20);

    const embed = new EmbedBuilder()
      .setColor(0x10b981)
      .setTitle('📋 Tarbes RP — Comptes Discord & Roblox Liés')
      .setDescription(`Voici les liaisons Discord ⇄ Roblox enregistrées (**${total}** au total) :`)
      .setFooter({ text: 'Tarbes RP • Système de vérification officiel' })
      .setTimestamp();

    // Group items into readable formatted text
    let descriptionText = `**Total vérifiés :** ${total}\n\n`;
    descriptionText += '```prolog\n';
    descriptionText += 'DISCORD                   ROBLOX (ID)\n';
    descriptionText += '---------------------------------------------------\n';

    recent.forEach((v) => {
      const discPart = (v.discordTag || v.discordId).padEnd(25).slice(0, 25);
      const rblxPart = `${v.robloxUsername} (${v.robloxId})`.slice(0, 25);
      descriptionText += `${discPart} ${rblxPart}\n`;
    });
    descriptionText += '```\n';

    if (total > 20) {
      descriptionText += `*... et ${total - 20} autres comptes enregistrés.*`;
    }

    embed.setDescription(descriptionText);

    // Also add inline fields for clear reading
    const sampleFields = recent.slice(0, 6).map((v) => ({
      name: `👤 ${v.discordTag}`,
      value: `• **Discord ID :** \`${v.discordId}\`\n• **Roblox :** [${v.robloxUsername}](https://www.roblox.com/users/${v.robloxId}/profile) (\`${v.robloxId}\`)\n• **Date :** <t:${Math.floor(new Date(v.verifiedAt).getTime() / 1000)}:R>`,
      inline: true,
    }));

    if (sampleFields.length > 0) {
      embed.addFields(sampleFields);
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    console.error('[Discord Bot] Erreur dans /dd-rblx:', error);
    try {
      await interaction.editReply({
        content: `❌ Une erreur est survenue lors de l’affichage du tableau : ${error.message}`,
      });
    } catch {}
  }
}

/**
 * Met à jour les rôles d'un membre sur le serveur Discord de Tarbes RP :
 * - Retire le rôle 1535239314798149673
 * - Ajoute le rôle 1518517334413672519
 * - Envoie un message privé (DM) confirmant que le compte Discord est lié au compte Roblox
 */
export async function updateMemberRoles(
  discordUserId: string,
  robloxData?: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  }
): Promise<{
  success: boolean;
  removedRole: string;
  addedRole: string;
  message: string;
  memberTag?: string;
  dmSent?: boolean;
}> {
  const client = getDiscordClient();

  if (!client || !isBotReady) {
    console.warn(`[Discord Bot] Rôles non modifiés pour ${discordUserId}: Bot non connecté`);
    return {
      success: false,
      removedRole: ROLE_REMOVE_ID,
      addedRole: ROLE_ADD_ID,
      message: botError || 'Bot Discord non connecté (DISCORD_BOT_TOKEN non configuré)',
      dmSent: false,
    };
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      const msg = `Serveur Discord (${GUILD_ID}) introuvable ou le bot n'en est pas membre`;
      console.warn(`[Discord Bot] ${msg}`);
      return {
        success: false,
        removedRole: ROLE_REMOVE_ID,
        addedRole: ROLE_ADD_ID,
        message: msg,
        dmSent: false,
      };
    }

    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      const msg = `Membre (${discordUserId}) introuvable sur le serveur Discord Tarbes RP (${GUILD_ID})`;
      console.warn(`[Discord Bot] ${msg}`);
      return {
        success: false,
        removedRole: ROLE_REMOVE_ID,
        addedRole: ROLE_ADD_ID,
        message: msg,
        dmSent: false,
      };
    }

    // 1. Remove role 1535239314798149673
    let removeSuccess = false;
    try {
      if (member.roles.cache.has(ROLE_REMOVE_ID)) {
        await member.roles.remove(ROLE_REMOVE_ID, 'Tarbes RP - Vérification réussie (suppression ancien rôle)');
        removeSuccess = true;
      } else {
        removeSuccess = true; // Not having the role is fine
      }
    } catch (err: any) {
      console.warn(`[Discord Bot] Impossible de retirer le rôle ${ROLE_REMOVE_ID}:`, err.message);
    }

    // 2. Add role 1518517334413672519
    let addSuccess = false;
    try {
      await member.roles.add(ROLE_ADD_ID, 'Tarbes RP - Vérification réussie (attribution rôle vérifié)');
      addSuccess = true;
    } catch (err: any) {
      console.error(`[Discord Bot] Impossible d'ajouter le rôle ${ROLE_ADD_ID}:`, err.message);
      return {
        success: false,
        removedRole: ROLE_REMOVE_ID,
        addedRole: ROLE_ADD_ID,
        message: `Erreur permissions: impossible d'ajouter le rôle (${err.message}). Vérifiez que le rôle du bot est au-dessus du rôle à attribuer !`,
        memberTag: member.user.tag,
        dmSent: false,
      };
    }

    // 3. Send Discord DM confirmation
    let dmSent = false;
    const rblxName = robloxData?.displayName || robloxData?.username || 'Inconnu';
    const rblxHandle = robloxData?.username ? `@${robloxData.username}` : '';
    const rblxId = robloxData?.id || '';

    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('✅ Tarbes RP — Vérification & Liaison Validées')
        .setColor(0x10b981)
        .setDescription(
          `Bonjour **${member.user.username}**,\n\n` +
          `Votre liaison a été validée avec succès sur le serveur officiel **Tarbes RP** :\n\n` +
          `🔹 **Compte Discord :** <@${discordUserId}> (\`${member.user.tag}\`)\n` +
          `🔸 **Compte Roblox lié :** **${rblxName}** ${rblxHandle ? `(${rblxHandle})` : ''}\n` +
          (rblxId ? `🆔 **ID Roblox :** \`${rblxId}\`\n\n` : '\n') +
          `📜 **Règlement accepté :** Oui (Règlement Officiel Tarbes RP validé)\n\n` +
          `⚠️ **Important :** Si le compte Roblox ou Discord ne correspond pas au vôtre, veuillez demander de l'aide à un membre du staff sur le serveur.\n\n` +
          `Bienvenue sur le serveur et bon roleplay sur Tarbes RP ! 🚗`
        )
        .setFooter({ text: 'Tarbes RP • Système de Vérification Officiel' })
        .setTimestamp();

      if (robloxData?.avatarUrl) {
        dmEmbed.setThumbnail(robloxData.avatarUrl);
      }

      await member.send({ embeds: [dmEmbed] });
      dmSent = true;
      console.log(`[Discord Bot] Message privé (MP) envoyé à ${member.user.tag}`);
    } catch (dmErr: any) {
      console.warn(`[Discord Bot] Impossible d'envoyer le MP à ${member.user.tag} (MP privés désactivés ou bloqués):`, dmErr.message);
    }

    // 4. Send Staff Log Embed in channel #logs-vérifications (1512120600263659690)
    try {
      const logChannel = await guild.channels.fetch(STAFF_LOG_CHANNEL_ID).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const robloxProfileUrl = rblxId ? `https://www.roblox.com/users/${rblxId}/profile` : 'https://www.roblox.com';
        const logEmbed = new EmbedBuilder()
          .setTitle('🛡️ Nouvelle Vérification Citoyenne Validée')
          .setColor(0xdc2626) // Rouge Tarbes RP
          .setDescription(
            `Un nouveau joueur a validé sa vérification officielle sur le site :\n\n` +
            `👤 **Membre Discord :** <@${discordUserId}> (\`${member.user.tag}\` — \`${discordUserId}\`)\n` +
            `🎮 **Compte Roblox :** [**${rblxName}** (${rblxHandle})](${robloxProfileUrl})\n` +
            (rblxId ? `🆔 **ID Roblox :** \`${rblxId}\`\n` : '') +
            `📜 **Règlement officiel :** Lu et approuvé ✅\n` +
            `🎭 **Rôles mis à jour :**\n` +
            `• Retiré : <@&${ROLE_REMOVE_ID}>\n` +
            `• Attribué : <@&${ROLE_ADD_ID}>`
          )
          .setFooter({ text: 'Tarbes RP • Logs Staff Vérification' })
          .setTimestamp();

        if (robloxData?.avatarUrl) {
          logEmbed.setThumbnail(robloxData.avatarUrl);
        }

        await (logChannel as any).send({ embeds: [logEmbed] });
        console.log(`[Discord Bot] Embed de log staff envoyé dans le salon ${STAFF_LOG_CHANNEL_ID}`);
      } else {
        console.warn(`[Discord Bot] Salon de logs staff ${STAFF_LOG_CHANNEL_ID} introuvable ou non textuel`);
      }
    } catch (logErr: any) {
      console.warn(`[Discord Bot] Impossible d'envoyer le log dans le salon staff:`, logErr.message);
    }

    console.log(`[Discord Bot] Rôles mis à jour avec succès pour ${member.user.tag} (${discordUserId}) !`);
    return {
      success: true,
      removedRole: ROLE_REMOVE_ID,
      addedRole: ROLE_ADD_ID,
      message: `Rôle retiré (${ROLE_REMOVE_ID}) et rôle ajouté (${ROLE_ADD_ID}) avec succès !`,
      memberTag: member.user.tag,
      dmSent,
    };
  } catch (err: any) {
    console.error(`[Discord Bot] Erreur lors de la modification des rôles:`, err);
    return {
      success: false,
      removedRole: ROLE_REMOVE_ID,
      addedRole: ROLE_ADD_ID,
      message: `Erreur inattendue Discord: ${err.message}`,
      dmSent: false,
    };
  }
}

/**
 * Vérifie les rôles actuels d'un membre sur le serveur Tarbes RP
 */
export async function getMemberRoleStatus(discordUserId: string): Promise<{
  onServer: boolean;
  hasUnverifiedRole: boolean;
  hasVerifiedRole: boolean;
  isVerified: boolean;
  memberTag?: string;
  error?: string;
}> {
  const client = getDiscordClient();
  if (!client || !isBotReady) {
    return {
      onServer: false,
      hasUnverifiedRole: false,
      hasVerifiedRole: false,
      isVerified: false,
      error: 'Bot non connecté',
    };
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      return {
        onServer: false,
        hasUnverifiedRole: false,
        hasVerifiedRole: false,
        isVerified: false,
        error: 'Serveur Tarbes RP introuvable pour le bot',
      };
    }

    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) {
      return {
        onServer: false,
        hasUnverifiedRole: false,
        hasVerifiedRole: false,
        isVerified: false,
        error: 'Membre introuvable sur le serveur Discord',
      };
    }

    const hasUnverified = member.roles.cache.has(ROLE_REMOVE_ID);
    const hasVerified = member.roles.cache.has(ROLE_ADD_ID);

    return {
      onServer: true,
      hasUnverifiedRole: hasUnverified,
      hasVerifiedRole: hasVerified,
      isVerified: hasVerified,
      memberTag: member.user.tag,
    };
  } catch (err: any) {
    return {
      onServer: false,
      hasUnverifiedRole: false,
      hasVerifiedRole: false,
      isVerified: false,
      error: err.message,
    };
  }
}

/**
 * Renvoie l'état complet du bot et de la guilde
 */
export async function getBotStatus() {
  const client = getDiscordClient();
  const hasToken = Boolean(process.env.DISCORD_BOT_TOKEN && !process.env.DISCORD_BOT_TOKEN.includes('MY_DISCORD_BOT_TOKEN'));
  const hasClientId = Boolean(process.env.DISCORD_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.DISCORD_CLIENT_SECRET);
  const hasSheets = Boolean(process.env.GOOGLE_SHEETS_WEBHOOK_URL);

  let guildName: string | null = null;
  let memberCount: number | null = null;
  let guildFound = false;
  let roleRemoveFound = false;
  let roleAddFound = false;
  let roleRemoveName: string | undefined;
  let roleAddName: string | undefined;

  if (client && isBotReady) {
    try {
      const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
      if (guild) {
        guildFound = true;
        guildName = guild.name;
        memberCount = guild.memberCount;

        const roleRemove = guild.roles.cache.get(ROLE_REMOVE_ID);
        if (roleRemove) {
          roleRemoveFound = true;
          roleRemoveName = roleRemove.name;
        }

        const roleAdd = guild.roles.cache.get(ROLE_ADD_ID);
        if (roleAdd) {
          roleAddFound = true;
          roleAddName = roleAdd.name;
        }
      }
    } catch (err) {
      console.warn('[Discord Bot] Impossible de récupérer les détails de la guilde:', err);
    }
  }

  const verifications = getAllVerifications();

  return {
    online: isBotReady,
    botTag: client?.user?.tag || null,
    botId: client?.user?.id || process.env.DISCORD_CLIENT_ID || null,
    guildId: GUILD_ID,
    guildFound,
    guildName,
    memberCount,
    roleRemoveId: ROLE_REMOVE_ID,
    roleAddId: ROLE_ADD_ID,
    roleRemoveFound,
    roleAddFound,
    roleRemoveName,
    roleAddName,
    totalVerifications: verifications.length,
    botError,
    hasCredentials: {
      discordClientId: hasClientId,
      discordClientSecret: hasClientSecret,
      discordBotToken: hasToken,
      googleSheets: hasSheets,
    },
  };
}
