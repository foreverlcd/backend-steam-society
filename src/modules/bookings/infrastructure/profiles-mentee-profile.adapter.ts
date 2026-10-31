import { Injectable } from '@nestjs/common';
import { ProfilesService } from '../../profiles/profiles.service.js';
import type { MenteeProfilePort } from '../application/ports/mentee-profile.port.js';

@Injectable()
export class ProfilesMenteeProfileAdapter implements MenteeProfilePort {
  constructor(private readonly profiles: ProfilesService) {}

  async exists(userId: string): Promise<boolean> {
    return this.profiles.hasMenteeProfile(userId);
  }
}
