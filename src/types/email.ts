import type { JsonValue } from "@prisma/client/runtime/library";

export interface EmailWebhookData {
  emailId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string; // ISO date string
  metadata?: JsonValue;
}
