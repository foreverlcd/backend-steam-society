import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { Roles } from '../../shared/http/roles.decorator.js';
import {
  listMentorsQuerySchema,
  onboardingUpdateSchema,
  rejectMentorSchema,
  updateProfileSchema,
  type ListMentorsQuery,
  type OnboardingUpdateInput,
  type RejectMentorInput,
  type UpdateProfileInput,
} from './profiles.schemas.js';
import { ProfilesService } from './profiles.service.js';

@Controller('me')
@Roles('mentor', 'mentee')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profiles.getProfile(user);
  }

  @Put('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateProfileSchema }) body: UpdateProfileInput,
  ) {
    return this.profiles.updateProfile(user, body);
  }

  @Post('profile/submit')
  @HttpCode(200)
  @Roles('mentor')
  submitProfile(@CurrentUser() user: AuthUser) {
    return this.profiles.submitMentorProfile(user);
  }

  @Get('onboarding')
  getOnboarding(@CurrentUser() user: AuthUser) {
    return this.profiles.getOnboarding(user);
  }

  @Put('onboarding')
  updateOnboarding(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingUpdateSchema }) body: OnboardingUpdateInput,
  ) {
    return this.profiles.updateOnboarding(user, body);
  }
}

@Controller('admin/mentors')
@Roles('admin')
export class AdminMentorsController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  listMentors(
    @Query({ schema: listMentorsQuerySchema }) query: ListMentorsQuery,
  ) {
    return this.profiles.listMentors(query);
  }

  @Get(':id')
  getMentor(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profiles.getMentorForAdmin(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profiles.approveMentor(admin, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body({ schema: rejectMentorSchema }) body: RejectMentorInput,
  ) {
    return this.profiles.rejectMentor(admin, id, body.reason);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profiles.suspendMentor(admin, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.profiles.reactivateMentor(admin, id);
  }
}
