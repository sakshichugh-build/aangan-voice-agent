/**
 * VoiceProvider interface. The rest of the app NEVER imports Vaani directly —
 * this lets us swap providers or add WhatsApp/web later (§0, §11). Phase 4 fills
 * in the Vaani adapter (webhook verification, normalisation, tools, outbound).
 */

export interface NormalizedCallEvent {
  type: 'call.started' | 'call.ended';
  providerCallId: string;
  provider: string;
  direction: 'inbound' | 'outbound';
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  answeredAt: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  language: string | null;
  status: 'in_progress' | 'completed' | 'missed' | 'dropped' | 'failed';
  transcript: string | null;
  raw: unknown;
}

export interface VoiceProvider {
  readonly name: string;
  /** Verify the webhook signature / shared secret. */
  verifyWebhook(req: Request, rawBody: string): boolean;
  /** Normalise a provider webhook payload into our shape. */
  parseWebhook(payload: unknown): NormalizedCallEvent | null;
  /** Place an outbound callback, if supported. Returns provider call id. */
  placeCallback?(toNumber: string): Promise<string | null>;
}
