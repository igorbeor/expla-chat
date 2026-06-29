import { Contact, User } from '../models';

export interface PresenceInitEvent {
  selfId: string;
  contacts: Contact[];
}

export type PresenceJoinedEvent = User;

export interface PresenceDisconnectedEvent {
  userId: string;
}

export const PresenceEvents = {
  INIT: 'presence:init', // (server → new)
  JOINED: 'presence:joined', // (server → others)
  DISCONNECTED: 'presence:disconnected', // (server → others)
} as const;
export type PresenceEvents = (typeof PresenceEvents)[keyof typeof PresenceEvents];
