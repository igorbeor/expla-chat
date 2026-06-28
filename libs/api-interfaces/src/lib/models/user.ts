export interface User {
  id: string;         // uuid assigned by the server
  name: string;
  avatarUrl: string;
  status: UserStatuses;
  type: UserTypes;
}

export interface UserHandshakeAuth {
  id?: string;
  name: string;
  avatarUrl: string;
}

// as const instead of enum: gives both a runtime object (iteration for validation/options)
// and a derived union-tip — without the drawbacks of enum (extra runtime code, not erased).
export const UserStatuses = {
  ONLINE: 'online',
  AWAY: 'away',
} as const;
export type UserStatuses = typeof UserStatuses[keyof typeof UserStatuses];

export const UserTypes = {
  USER: 'user',
  BOT: 'bot',
} as const;
export type UserTypes = typeof UserTypes[keyof typeof UserTypes];