import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SchedulingModule } from '../scheduling/scheduling.module.js';
import { CatalogService } from './application/catalog.service.js';
import { CatalogController } from './presentation/catalog.controller.js';

@Module({
  imports: [ProfilesModule, SchedulingModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
