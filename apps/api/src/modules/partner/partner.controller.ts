import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { PartnerService } from './partner.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  StaffRole,
  StaffJwtPayload,
  LeadStatus,
  RecordLeadActivityDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  DroppedLeadListItemDto,
  DroppedLeadDetailDto,
  LeadActivityDto,
  PartnerDashboardMetricsDto
} from '@udyamone/shared-types';

@Controller('partner')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  /**
   * GET /api/partner/leads
   * Protected lead listing.
   * If caller is PARTNER, strictly isolates leads to their own agency.
   * If caller is ADMIN or OPERATIONS, allows cross-agency querying and filters.
   */
  @Get('leads')
  @Roles(StaffRole.PARTNER, StaffRole.ADMIN, StaffRole.OPERATIONS)
  async getLeads(
    @Query('status') status?: LeadStatus,
    @Query('priorityRank') priorityRank?: 'HIGH' | 'MEDIUM' | 'LOW',
    @Query('city') city?: string,
    @Query('search') search?: string,
    @Query('partnerId') partnerId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() staff?: StaffJwtPayload
  ): Promise<{ leads: DroppedLeadListItemDto[]; total: number; limit: number; offset: number }> {
    return this.partnerService.getLeads(
      { status, priorityRank, city, search, partnerId, limit, offset },
      staff!
    );
  }

  /**
   * GET /api/partner/leads/:id
   * Detailed lead inspection with explainable scoring factors and activities.
   * Strictly enforces partner isolation: unauthorized partners receive 403.
   */
  @Get('leads/:id')
  @Roles(StaffRole.PARTNER, StaffRole.ADMIN, StaffRole.OPERATIONS)
  async getLeadById(
    @Param('id') id: string,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<DroppedLeadDetailDto> {
    return this.partnerService.getLeadById(id, staff);
  }

  /**
   * POST /api/partner/leads/:id/activity
   * Records follow-up call, visit, WhatsApp message, or note.
   */
  @Post('leads/:id/activity')
  @HttpCode(HttpStatus.CREATED)
  @Roles(StaffRole.PARTNER, StaffRole.ADMIN, StaffRole.OPERATIONS)
  async recordActivity(
    @Param('id') id: string,
    @Body() dto: RecordLeadActivityDto,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<LeadActivityDto> {
    return this.partnerService.recordActivity(id, dto, staff);
  }

  /**
   * POST or PATCH /api/partner/leads/:id/status
   * Updates lead recovery status (e.g. mark RECOVERED or CLOSED_LOST).
   */
  @Post('leads/:id/status')
  @Patch('leads/:id/status')
  @HttpCode(HttpStatus.OK)
  @Roles(StaffRole.PARTNER, StaffRole.ADMIN, StaffRole.OPERATIONS)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<DroppedLeadDetailDto> {
    return this.partnerService.updateLeadStatus(id, dto, staff);
  }

  /**
   * POST /api/partner/leads/assign or /api/partner/leads/:id/assign
   * Assigns lead to partner agency (Admin or Operations only).
   */
  @Post('leads/assign')
  @Post('leads/:id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(StaffRole.ADMIN, StaffRole.OPERATIONS)
  async assignLead(
    @Param('id') paramId: string | undefined,
    @Body() dto: AssignLeadDto,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<DroppedLeadDetailDto> {
    const leadId = dto.leadId || paramId;
    return this.partnerService.assignLead({ ...dto, leadId: leadId! }, staff);
  }

  /**
   * GET /api/partner/dashboard/metrics
   * Calculates KPI metrics for the authenticated partner's dashboard.
   */
  @Get('dashboard/metrics')
  @Roles(StaffRole.PARTNER, StaffRole.ADMIN, StaffRole.OPERATIONS)
  async getMetrics(
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<PartnerDashboardMetricsDto> {
    return this.partnerService.getPartnerMetrics(staff);
  }
}
