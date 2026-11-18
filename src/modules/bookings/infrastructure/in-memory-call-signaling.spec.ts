import type { CallEvent } from '../application/ports/call-signaling.port.js';
import { InMemoryCallSignaling } from './in-memory-call-signaling.js';

/** Like the real SSE stream: closing it runs its teardown (leave). */
function join(hub: InMemoryCallSignaling, callId: string, userId: string) {
  const events: CallEvent[] = [];
  const connection = {
    events,
    closed: false,
    push: (event: CallEvent) => events.push(event),
    close: () => {
      connection.closed = true;
      leave();
    },
  };
  const leave = hub.join(callId, userId, connection);
  return connection;
}

describe('InMemoryCallSignaling', () => {
  it('a second tab replaces the first without announcing peer-left', () => {
    const hub = new InMemoryCallSignaling();
    const mentee = join(hub, 'call-1', 'mentee');
    const firstTab = join(hub, 'call-1', 'mentor');
    const secondTab = join(hub, 'call-1', 'mentor');

    expect(firstTab.events.at(-1)).toEqual({ type: 'replaced' });
    expect(firstTab.closed).toBe(true);
    expect(mentee.events).not.toContainEqual({ type: 'peer-left' });
    expect(hub.send('call-1', 'mentor', { type: 'peer-joined' })).toBe(true);
    expect(secondTab.events.at(-1)).toEqual({ type: 'peer-joined' });
  });

  it('announces peer-left when a participant leaves', () => {
    const hub = new InMemoryCallSignaling();
    const mentee = join(hub, 'call-1', 'mentee');
    const mentor = join(hub, 'call-1', 'mentor');

    mentor.close();

    expect(mentee.events.at(-1)).toEqual({ type: 'peer-left' });
    expect(hub.send('call-1', 'mentor', { type: 'ping' })).toBe(false);
  });

  it('ending a call closes every stream quietly', () => {
    const hub = new InMemoryCallSignaling();
    const mentee = join(hub, 'call-1', 'mentee');
    const mentor = join(hub, 'call-1', 'mentor');

    hub.end('call-1');

    expect(mentee.closed && mentor.closed).toBe(true);
    expect(mentee.events).not.toContainEqual({ type: 'peer-left' });
    expect(hub.send('call-1', 'mentee', { type: 'ping' })).toBe(false);
  });

  it('keeps calls apart', () => {
    const hub = new InMemoryCallSignaling();
    join(hub, 'call-1', 'mentee');
    expect(hub.send('call-2', 'mentee', { type: 'peer-left' })).toBe(false);
  });
});
