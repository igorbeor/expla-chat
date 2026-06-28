export const UserBusEvents = {
  DISCONNECTED: 'user.disconnected',
} as const;

export interface UserDisconnectedEvent {
  userId: string;
}
