import { UserStatuses } from '../models';

export interface StatusChangeEvent {
  status: UserStatuses;
}

export interface StatusChangedEvent {
  userId: string;
  status: UserStatuses;
}

export const StatusEvents = {
  CHANGE: 'status:change', //  (client → server)
  CHANGED: 'status:changed', // (server → others)
} as const;
export type StatusEvents = (typeof StatusEvents)[keyof typeof StatusEvents];
