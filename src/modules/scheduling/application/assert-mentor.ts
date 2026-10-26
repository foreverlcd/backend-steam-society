import type { AuthUser } from '../../auth/auth.types.js';
import { mentorOnly } from './scheduling.errors.js';

export function assertMentor(user: AuthUser): void {
  if (user.role !== 'mentor') {
    throw mentorOnly();
  }
}
