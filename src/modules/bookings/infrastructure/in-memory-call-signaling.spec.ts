import type { CallEvent } from '../application/ports/call-signaling.port.js';
import { InMemoryCallSignaling } from './in-memory-call-signaling.js';

function connection() {
  const events: CallEvent[] = [];
  return { events, push: (e: CallEvent) => events.push(e), close: vi.fn() };
}

describe('InMemoryCallSignaling', () => {
  it('a second tab of the same user replaces the first without a peer-left', () => {
    const hub = new InMemoryCallSignaling();
    const mentee = connection();
    const firstTab = connection();
    const secondTab = connection();

    hub.join('call-1', 'mentee', mentee);
    const leaveFirst = hub.join('call-1', 'mentor', firstTab);
    hub.join('call-1', 'mentor', secondTab);

    expect(firstTab.events.at(-1)).toEqual({ type: 'replaced' });
    expect(firstTab.close).toHaveBeenCalled();
    // The old tab disconnecting must not remove the new one.
    leaveFirst();
    expect(mentee.events).not.toContainEqual({ type: 'peer-left' });
    expect(hub.send('call-1', 'mentor', { type: 'peer-joined' })).toBe(true);
    expect(secondTab.events.at(-1)).toEqual({ type: 'peer-joined' });
  });

  it('keeps calls apart', () => {
    const hub = new InMemoryCallSignaling();
    hub.join('call-1', 'mentee', connection());
    expect(hub.send('call-2', 'mentee', { type: 'peer-left' })).toBe(false);
  });
});
