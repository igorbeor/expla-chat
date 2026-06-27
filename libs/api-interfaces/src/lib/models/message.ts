export interface Message {
  id: string;         // uuid assigned by the server
  senderId: string;
  recipientId: string;
  content: string;
  sentAt: string;     // ISO 8601 JSON-safe
}
