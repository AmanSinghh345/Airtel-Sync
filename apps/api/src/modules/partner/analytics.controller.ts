import { Controller, Get, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  StaffRole,
  FunnelAnalyticsDto,
  DropReasonAnalyticsDto,
  SegmentAnalyticsDto,
  PartnerPerformanceDto
} from '@udyamone/shared-types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * GET /api/analytics/funnel
   * Stage-by-stage funnel progression and drop-off leakage metrics (Aggregated Public Telemetry)
   */
  @Get('funnel')
  async getFunnel(): Promise<FunnelAnalyticsDto> {
    return this.analyticsService.getFunnelAnalytics();
  }

  /**
   * GET /api/analytics/drop-reasons
   * Aggregate distribution of drop-off reasons with recoverability classification (Aggregated Public Telemetry)
   */
  @Get('drop-reasons')
  async getDropReasons(): Promise<{ totalDropped: number; dropReasons: DropReasonAnalyticsDto[] }> {
    return this.analyticsService.getDropReasonAnalytics();
  }

  /**
   * GET /api/analytics/segments
   * MSME segment-wise conversion and drop statistics (Aggregated Public Telemetry)
   */
  @Get('segments')
  async getSegments(): Promise<{ segments: SegmentAnalyticsDto[] }> {
    return this.analyticsService.getSegmentAnalytics();
  }

  /**
   * GET /api/analytics/partners
   * Channel partner performance and commission leaderboard (Authenticated Partner & Staff Only)
   */
  @Get('partners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.ADMIN, StaffRole.OPERATIONS, StaffRole.PARTNER, StaffRole.COMPLIANCE_OFFICER)
  async getPartners(): Promise<{ partners: PartnerPerformanceDto[] }> {
    return this.analyticsService.getPartnerPerformance();
  }

  /**
   * GET /api/analytics/recovery-impact
   * Lead recovery volume and cumulative revenue impact (Aggregated Public Telemetry)
   */
  @Get('recovery-impact')
  async getRecoveryImpact(): Promise<{
    highPriorityLeadsCount: number;
    mediumPriorityLeadsCount: number;
    recoveredCount: number;
    totalRecoveredRevenueInr: number;
    averageRecoveryDays: number;
  }> {
    return this.analyticsService.getRecoveryImpact();
  }
}
