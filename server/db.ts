import fs from 'fs';
import path from 'path';
import type { VerificationRecord } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'verifications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// In-memory cache synced with disk
let cachedVerifications: VerificationRecord[] = [];

// Initial load
try {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    cachedVerifications = JSON.parse(raw);
  } else {
    cachedVerifications = [];
    fs.writeFileSync(DB_FILE, JSON.stringify(cachedVerifications, null, 2), 'utf-8');
  }
} catch (err) {
  console.error('Error loading verifications DB:', err);
  cachedVerifications = [];
}

function persist(): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(cachedVerifications, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save verifications to disk:', err);
  }
}

export function getAllVerifications(): VerificationRecord[] {
  return [...cachedVerifications].sort(
    (a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime()
  );
}

export function getVerificationByDiscordId(discordId: string): VerificationRecord | undefined {
  return cachedVerifications.find((v) => v.discordId.trim() === discordId.trim());
}

export function getVerificationByRobloxId(robloxId: string): VerificationRecord | undefined {
  return cachedVerifications.find((v) => v.robloxId.toString().trim() === robloxId.toString().trim());
}

export function saveVerification(record: VerificationRecord): VerificationRecord {
  const existingIndex = cachedVerifications.findIndex((v) => v.discordId === record.discordId);
  if (existingIndex >= 0) {
    cachedVerifications[existingIndex] = record;
  } else {
    cachedVerifications.unshift(record);
  }
  persist();
  return record;
}

export function updateVerification(id: string, updates: Partial<VerificationRecord>): VerificationRecord | null {
  const record = cachedVerifications.find((v) => v.id === id);
  if (!record) return null;
  Object.assign(record, updates);
  persist();
  return record;
}

export function deleteVerification(id: string): boolean {
  const initialLength = cachedVerifications.length;
  cachedVerifications = cachedVerifications.filter((v) => v.id !== id);
  if (cachedVerifications.length !== initialLength) {
    persist();
    return true;
  }
  return false;
}
