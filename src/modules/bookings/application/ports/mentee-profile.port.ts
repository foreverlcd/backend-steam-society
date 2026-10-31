export const MENTEE_PROFILE_PORT = Symbol('MENTEE_PROFILE_PORT');

export interface MenteeProfilePort {
  exists(userId: string): Promise<boolean>;
}
