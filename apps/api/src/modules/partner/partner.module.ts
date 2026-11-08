import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PropensityService } from './propensity.service';
import { PartnerService } from './partner.service';
import { AnalyticsService } from './analytics.service';
import { PartnerController } from './partner.controller';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PartnerController, AnalyticsController],
  providers: [PropensityService, PartnerService, AnalyticsService],
  exports: [PropensityService, PartnerService, AnalyticsService]
})
export class PartnerModule {}
