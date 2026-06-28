export const UserBusEvents = {
  DISCONNECTED: 'user.disconnected',
} as const;
export type UserBusEvents = (typeof UserBusEvents)[keyof typeof UserBusEvents];

export interface UserDisconnectedEvent {
  userId: string;
}
