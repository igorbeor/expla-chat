export const MessageBusEvents = {
  DELIVER: 'message.deliver',
} as const;
export type MessageBusEvents =
  (typeof MessageBusEvents)[keyof typeof MessageBusEvents];
