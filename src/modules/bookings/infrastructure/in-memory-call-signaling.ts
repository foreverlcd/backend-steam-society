import { Injectable } from '@nestjs/common';
import type {
  CallConnection,
  CallEvent,
  CallSignalingPort,
} from '../application/ports/call-signaling.port.js';

/**
 * Signaling inside this process. Enough while the API runs as a single
 * instance; several instances would need a shared channel (e.g. Postgres
 * LISTEN/NOTIFY) behind the same port.
 */
@Injectable()
export class InMemoryCallSignaling implements CallSignalingPort {
  private readonly calls = new Map<string, Map<string, CallConnection>>();

  join(callId: string, userId: string, connection: CallConnection): () => void {
    let participants = this.calls.get(callId);
    if (!participants) {
      participants = new Map();
      this.calls.set(callId, participants);
    }

    // Install the new connection first: closing the old one runs its
    // teardown, which must then see it was replaced (no peer-left).
    const previous = participants.get(userId);
    participants.set(userId, connection);
    if (previous) {
      previous.push({ type: 'replaced' });
      previous.close();
    }

    const peers = [...participants].filter(([id]) => id !== userId);
    connection.push({ type: 'ready', peerPresent: peers.length > 0 });
    for (const [, peer] of peers) peer.push({ type: 'peer-joined' });

    return () => {
      const current = this.calls.get(callId);
      // A newer tab of the same user may have replaced this connection.
      if (!current || current.get(userId) !== connection) return;
      current.delete(userId);
      for (const [, peer] of current) peer.push({ type: 'peer-left' });
      if (current.size === 0) this.calls.delete(callId);
    };
  }

  end(callId: string): void {
    const participants = this.calls.get(callId);
    if (!participants) return;
    // Removed first, so the teardowns do not announce peer-left.
    this.calls.delete(callId);
    for (const [, connection] of participants) connection.close();
  }

  send(callId: string, toUserId: string, event: CallEvent): boolean {
    const connection = this.calls.get(callId)?.get(toUserId);
    if (!connection) return false;
    connection.push(event);
    return true;
  }
}
