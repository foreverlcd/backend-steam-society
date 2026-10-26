import { Injectable } from '@nestjs/common';
import { ProfilesService } from '../../profiles/profiles.service.js';
import type { MentorSettings } from '../domain/availability-rule.js';
import type { MentorSettingsPort } from '../application/ports/mentor-settings.port.js';

@Injectable()
export class ProfilesMentorSettingsAdapter implements MentorSettingsPort {
  constructor(private readonly profiles: ProfilesService) {}

  findMentorSettings(userId: string): Promise<MentorSettings | null> {
    return this.profiles.getMentorSchedulingSettings(userId);
  }
}
