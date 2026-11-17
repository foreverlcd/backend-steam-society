import { describe, expect, it } from 'vitest';
import {
  PersonalDataRegistry,
  type PersonalDataContributor,
} from './personal-data.registry.js';

function contributor(
  section: string,
  eraseOrder: number,
): PersonalDataContributor {
  return {
    section,
    eraseOrder,
    exportFor: () => Promise.resolve({}),
    erase: () => Promise.resolve(),
  };
}

describe('PersonalDataRegistry', () => {
  it('lists contributors by erase order', () => {
    const registry = new PersonalDataRegistry();
    registry.register(contributor('account', 100));
    registry.register(contributor('bookings', 10));
    registry.register(contributor('profile', 30));

    expect(registry.list().map((c) => c.section)).toEqual([
      'bookings',
      'profile',
      'account',
    ]);
  });

  it('refuses the same section twice', () => {
    const registry = new PersonalDataRegistry();
    registry.register(contributor('profile', 30));

    expect(() => registry.register(contributor('profile', 40))).toThrow(
      /registered twice/,
    );
  });
});
