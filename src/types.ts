export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
  avatarUrl?: string;
  email?: string;
}

export interface RobloxUser {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  hasVerifiedBadge?: boolean;
  previousUsernames?: string[];
  headshotUrl?: string;
  avatarUrl?: string;
}

export interface VerificationRecord {
  id: string;
  discordId: string;
  discordTag: string;
  discordAvatar?: string | null;
  robloxId: string;
  robloxUsername: string;
  robloxDisplayName: string;
  robloxAvatarUrl?: string;
  verifiedAt: string;
  guildId: string;
  rolesUpdated: boolean;
  rulesAccepted?: boolean;
  rulesAcceptedAt?: string;
  roleDetails?: {
    removedRole: string;
    addedRole: string;
    success: boolean;
    message?: string;
  };
  sheetsSynced: boolean;
  sheetsError?: string;
}

export interface BotStatus {
  online: boolean;
  botTag: string | null;
  botId: string | null;
  guildId: string;
  guildFound: boolean;
  guildName: string | null;
  memberCount: number | null;
  roleRemoveId: string;
  roleAddId: string;
  roleRemoveFound: boolean;
  roleAddFound: boolean;
  roleRemoveName?: string;
  roleAddName?: string;
  totalVerifications: number;
  hasCredentials: {
    discordClientId: boolean;
    discordClientSecret: boolean;
    discordBotToken: boolean;
    googleSheets: boolean;
  };
}

export interface GoogleSheetsConfig {
  webhookUrl?: string;
  sheetId?: string;
  lastSyncAt?: string;
}
