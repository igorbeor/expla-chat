export interface User {
  id: string;         // uuid assigned by the server
  name: string;
  avatarUrl: string;
  status: UserStatus;
  type: UserType;
}

export interface Message {
  id: string;         // uuid assigned by the server
  senderId: string;
  recipientId: string;
  content: string;
  sentAt: string;     // ISO 8601 JSON-safe
}

// as const instead of enum: gives both a runtime object (iteration for validation/options)
// and a derived union-tip — without the drawbacks of enum (extra runtime code, not erased).
export const UserStatus = {
  ONLINE: 'online',
  AWAY: 'away',
} as const;
export type UserStatus = typeof UserStatus[keyof typeof UserStatus];

export const UserType = {
  USER: 'user',
  BOT: 'bot',
} as const;
export type UserType = typeof UserType[keyof typeof UserType];