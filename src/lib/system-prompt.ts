import crypto from 'crypto';
import type { ChatMessage } from 'llmapi/types.js';
import { getUnifiedApiKey } from '../db/index.js';

// Protocol adapters still validate the unified key internally. The headless
// app injects it for callers already trusted by the private network.

// Constant-time string comparison for inference credentials. Plain `===` leaks
// length and per-character timing, which a network attacker could in principle
// use to recover the key one byte at a time.
export function timingSafeStringEqual(provided: string, expected: string): boolean {
  // Use HMAC to produce fixed-length digests so timingSafeEqual always
  // receives same-length buffers regardless of input length. This eliminates
  // both the per-character timing leak and the length-branch timing leak that
  // the Buffer.alloc-on-mismatch approach had.
  const key = Buffer.alloc(32);
  const a = crypto.createHmac('sha256', key).update(provided).digest();
  const b = crypto.createHmac('sha256', key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export type ResolvedAuth = { kind: 'unified'; systemPrompt: null };

/**
 * Resolve the single internal inference credential.
 */
export function resolveAuth(token: string | undefined): ResolvedAuth | null {
  if (!token) return null;
  if (timingSafeStringEqual(token, getUnifiedApiKey())) {
    return { kind: 'unified', systemPrompt: null };
  }
  return null;
}

/**
 * Preserve the protocol adapter contract. The headless router currently has
 * no server-enforced prompt, so null is a neutral passthrough.
 */
export function prependSystemPrompt(messages: ChatMessage[], prompt: string | null | undefined): ChatMessage[] {
  if (prompt == null || prompt.trim().length === 0) return messages;
  return [{ role: 'system', content: prompt }, ...messages];
}
