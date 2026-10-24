import {
  InvalidMentorStatusTransitionError,
  transitionMentorStatus,
  type MentorStatus,
  type MentorStatusEvent,
} from './mentor-status.js';

const validTransitions: Array<[MentorStatus, MentorStatusEvent, MentorStatus]> = [
  ['draft', 'submit', 'pending_review'],
  ['rejected', 'submit', 'pending_review'],
  ['pending_review', 'approve', 'approved'],
  ['pending_review', 'reject', 'rejected'],
  ['approved', 'suspend', 'suspended'],
  ['suspended', 'reactivate', 'approved'],
];

const statuses: MentorStatus[] = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'suspended',
];

const events: MentorStatusEvent[] = [
  'submit',
  'approve',
  'reject',
  'suspend',
  'reactivate',
];

describe('transitionMentorStatus', () => {
  it.each(validTransitions)(
    'moves %s with %s to %s',
    (current, event, expected) => {
      expect(transitionMentorStatus(current, event)).toBe(expected);
    },
  );

  it.each(
    statuses.flatMap((current) =>
      events
        .filter(
          (event) =>
            !validTransitions.some(
              ([validCurrent, validEvent]) =>
                validCurrent === current && validEvent === event,
            ),
        )
        .map((event) => [current, event] as const),
    ),
  )('rejects %s with %s', (current, event) => {
    expect(() => transitionMentorStatus(current, event)).toThrow(
      InvalidMentorStatusTransitionError,
    );
  });
});
