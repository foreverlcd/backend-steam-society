export type MentorStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type MentorStatusEvent =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'suspend'
  | 'reactivate';

export class InvalidMentorStatusTransitionError extends Error {
  constructor(
    readonly from: MentorStatus,
    readonly event: MentorStatusEvent,
  ) {
    super(`Cannot apply ${event} to mentor profile in status ${from}`);
    this.name = 'InvalidMentorStatusTransitionError';
  }
}

const TRANSITIONS: Record<
  MentorStatus,
  Partial<Record<MentorStatusEvent, MentorStatus>>
> = {
  draft: { submit: 'pending_review' },
  pending_review: { approve: 'approved', reject: 'rejected' },
  approved: { suspend: 'suspended' },
  rejected: { submit: 'pending_review' },
  suspended: { reactivate: 'approved' },
};

export function transitionMentorStatus(
  current: MentorStatus,
  event: MentorStatusEvent,
): MentorStatus {
  const next = TRANSITIONS[current][event];

  if (!next) {
    throw new InvalidMentorStatusTransitionError(current, event);
  }

  return next;
}
