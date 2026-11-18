export const CALL_SIGNALING_PORT = Symbol('CALL_SIGNALING_PORT');
export const ICE_SERVERS_PORT = Symbol('ICE_SERVERS_PORT');

/** What the server pushes to a participant connected to a call. */
export type CallEvent =
  | { type: 'ready'; peerPresent: boolean }
  | { type: 'peer-joined' }
  | { type: 'peer-left' }
  | { type: 'signal'; data: CallSignal }
  /** The same account opened the call elsewhere: this tab must stop. */
  | { type: 'replaced' }
  | { type: 'ping' };

/** WebRTC negotiation relayed as-is between the two participants. */
export type CallSignal =
  | {
      kind: 'description';
      description: { type: 'offer' | 'answer' | 'rollback'; sdp?: string };
    }
  | {
      kind: 'candidate';
      candidate: {
        candidate: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      } | null;
    };

export interface CallConnection {
  /** Sends one event to this participant. */
  push(event: CallEvent): void;
  /** Ends this participant's stream. */
  close(): void;
}

/**
 * Relays signals between the two participants of a booking. Holds no media
 * and stores nothing: the audio and video go peer to peer.
 */
export interface CallSignalingPort {
  /** Registers a participant; returns the function that removes it. */
  join(callId: string, userId: string, connection: CallConnection): () => void;
  /** Delivers to the participant if connected; returns whether it was. */
  send(callId: string, toUserId: string, event: CallEvent): boolean;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceServersPort {
  /** STUN/TURN servers for one participant; TURN credentials are short-lived. */
  forCall(): Promise<IceServer[]>;
}
