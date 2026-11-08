import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { PropensityService } from './propensity.service';
import { DEMO_PARTNERS } from './partner.constants';
import {
  StaffJwtPayload,
  StaffRole,
  LeadStatus,
  ActivityType,
  DroppedLeadListItemDto,
  DroppedLeadDetailDto,
  LeadActivityDto,
  RecordLeadActivityDto,
  UpdateLeadStatusDto,
  AssignLeadDto,
  PartnerDashboardMetricsDto,
  Segment
} from '@udyamone/shared-types';

@Injectable()
export class PartnerService implements OnModuleInit {
  private readonly logger = new Logger(PartnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propensityService: PropensityService
  ) {}

  async onModuleInit() {
    await this.seedDemoPartnersAndStaff();
  }

  /**
   * Seed demo channel partners and their authenticated user accounts
   */
  async seedDemoPartnersAndStaff(): Promise<void> {
    for (const p of DEMO_PARTNERS) {
      // 1. Upsert Partner
      const partner = await this.prisma.partner.upsert({
        where: { partnerCode: p.partnerCode },
        update: {
          agencyName: p.agencyName,
          territoryCity: p.territoryCity,
          commissionRate: p.commissionRate
        },
        create: {
          partnerCode: p.partnerCode,
          agencyName: p.agencyName,
          contactName: p.contactName,
          phone: p.phone,
          email: p.email,
          territoryCity: p.territoryCity,
          commissionRate: p.commissionRate,
          isActive: true
        }
      });

      // 2. Upsert corresponding StaffUser with PARTNER role
      const existingUser = await this.prisma.staffUser.findUnique({
        where: { email: p.email }
      });
      if (!existingUser) {
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(p.plainPassword, salt);
        await this.prisma.staffUser.create({
          data: {
            email: p.email,
            fullName: `${p.contactName} (${p.agencyName})`,
            role: 'PARTNER' as any,
            passwordHash,
            partnerId: partner.id,
            isActive: true
          }
        });
        this.logger.log(`Seeded demo partner account: ${p.email} [${partner.partnerCode}]`);
      }

      // 3. Assign territory dropped leads if none assigned yet
      const assignedCount = await this.prisma.droppedLead.count({
        where: { assignedPartnerId: partner.id }
      });
      if (assignedCount === 0) {
        // Find top dropped leads in the partner's territory city (excluding Activated)
        const territoryLeads = await this.prisma.droppedLead.findMany({
          where: {
            city: partner.territoryCity,
            assignedPartnerId: null,
            stageReached: { not: 'Activated' }
          },
          take: 15
        });

        if (territoryLeads.length > 0) {
          const leadIds = territoryLeads.map((l) => l.id);
          await this.prisma.droppedLead.updateMany({
            where: { id: { in: leadIds } },
            data: {
              assignedPartnerId: partner.id,
              status: 'ASSIGNED'
            }
          });
          this.logger.log(`Assigned ${leadIds.length} ${partner.territoryCity} leads to partner ${partner.partnerCode}`);
        }
      }
    }
  }

  /**
   * Get dropped leads with strict partner isolation and rich search/filter
   */
  async getLeads(
    query: {
      status?: LeadStatus;
      priorityRank?: 'HIGH' | 'MEDIUM' | 'LOW';
      city?: string;
      search?: string;
      partnerId?: string;
      limit?: number;
      offset?: number;
    },
    staff: StaffJwtPayload
  ): Promise<{ leads: DroppedLeadListItemDto[]; total: number; limit: number; offset: number }> {
    const where: any = {
      stageReached: { not: 'Activated' }
    };

    // STRICT PARTNER ISOLATION:
    // If the authenticated actor is a PARTNER, they can ONLY see leads assigned to their partner agency
    if (staff.role === StaffRole.PARTNER) {
      if (!staff.partnerId) {
        throw new ForbiddenException('Partner account is not linked to a valid agency.');
      }
      where.assignedPartnerId = staff.partnerId;
    } else if (query.partnerId) {
      // Operations or Admin can filter by specific partner
      where.assignedPartnerId = query.partnerId;
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.priorityRank) {
      where.propensityRank = query.priorityRank;
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.search) {
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { id: { contains: query.search, mode: 'insensitive' } },
        { dropReason: { contains: query.search, mode: 'insensitive' } }
      ];
    }

    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = Math.max(0, Number(query.offset) || 0);

    const [total, leads] = await Promise.all([
      this.prisma.droppedLead.count({ where }),
      this.prisma.droppedLead.findMany({
        where,
        include: { assignedPartner: true },
        orderBy: [{ propensityScore: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset
      })
    ]);

    const formattedLeads: any[] = leads.map((l) => ({
      id: l.id,
      businessId: l.id,
      businessName: l.businessName,
      companyTradeName: l.businessName,
      businessType: l.businessType,
      segment: l.segment as unknown as Segment,
      city: l.city,
      cityTier: l.cityTier,
      state: l.state,
      contactName: l.contactName,
      contactRole: l.contactRole,
      contactPhone: l.contactRole || '9876543210',
      contactEmail: `${l.contactName.toLowerCase().replace(/\s+/g, '.')}@msme.in`,
      stageReached: l.stageReached,
      stageAtDrop: l.stageReached,
      dropReason: l.dropReason,
      propensityScore: Number(l.propensityScore),
      propensityRank: l.propensityRank as 'HIGH' | 'MEDIUM' | 'LOW',
      propensityPriority: l.propensityRank as 'HIGH' | 'MEDIUM' | 'LOW',
      status: l.status as unknown as LeadStatus,
      assignedPartnerId: l.assignedPartnerId,
      assignedPartnerName: l.assignedPartner ? l.assignedPartner.agencyName : null,
      monthlySpendInr: l.monthlyTelecomSpendInr ? Number(l.monthlyTelecomSpendInr) : null,
      hasGstin: l.hasGstin,
      hasUdyam: l.hasUdyam,
      createdAt: l.createdAt.toISOString()
    }));

    return { leads: formattedLeads, total, limit, offset };
  }

  /**
   * Get single lead by ID with explainable propensity scoring & activities
   */
  async getLeadById(leadId: string, staff: StaffJwtPayload): Promise<DroppedLeadDetailDto> {
    const lead = await this.prisma.droppedLead.findUnique({
      where: { id: leadId },
      include: {
        assignedPartner: true,
        activities: {
          include: { partner: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!lead) {
      throw new NotFoundException(`Lead '${leadId}' was not found.`);
    }

    // STRICT PARTNER ISOLATION:
    if (staff.role === StaffRole.PARTNER && lead.assignedPartnerId !== staff.partnerId) {
      throw new ForbiddenException(
        `Access Denied: Lead '${leadId}' is not assigned to your partner agency.`
      );
    }

    // Compute explainable scoring factors
    const evalResult = this.propensityService.evaluateLead({
      stageReached: lead.stageReached,
      dropReason: lead.dropReason,
      hasGstin: lead.hasGstin,
      hasUdyam: lead.hasUdyam,
      employeeCount: lead.employeeCount,
      numSites: lead.numSites,
      monthlyTelecomSpendInr: lead.monthlyTelecomSpendInr,
      businessName: lead.businessName,
      preferredLanguage: lead.preferredLanguage
    });

    const activities: LeadActivityDto[] = lead.activities.map((a) => ({
      id: a.id,
      droppedLeadId: a.droppedLeadId,
      partnerId: a.partnerId,
      partnerName: a.partner ? a.partner.agencyName : null,
      activityType: a.activityType as unknown as ActivityType,
      notes: a.notes,
      outcome: a.outcome,
      followUpDate: a.followUpDate ? a.followUpDate.toISOString().split('T')[0] : null,
      createdAt: a.createdAt.toISOString()
    }));

    return {
      id: lead.id,
      businessId: lead.id,
      businessName: lead.businessName,
      companyTradeName: lead.businessName,
      companyLegalName: lead.businessName,
      businessType: lead.businessType,
      segment: lead.segment as unknown as Segment,
      city: lead.city,
      cityTier: lead.cityTier,
      state: lead.state,
      contactName: lead.contactName,
      contactRole: lead.contactRole,
      contactPhone: lead.contactRole || '9876543210',
      contactEmail: `${lead.contactName.toLowerCase().replace(/\s+/g, '.')}@msme.in`,
      stageReached: lead.stageReached,
      stageAtDrop: lead.stageReached,
      dropReason: lead.dropReason,
      propensityScore: evalResult.score,
      propensityRank: evalResult.priorityRank,
      propensityPriority: evalResult.priorityRank,
      priorityReason: evalResult.priorityReason,
      recommendedAction: evalResult.recommendedAction,
      status: lead.status as unknown as LeadStatus,
      assignedPartnerId: lead.assignedPartnerId,
      assignedPartnerName: lead.assignedPartner ? lead.assignedPartner.agencyName : null,
      monthlySpendInr: lead.monthlyTelecomSpendInr ? Number(lead.monthlyTelecomSpendInr) : null,
      hasGstin: lead.hasGstin,
      hasUdyam: lead.hasUdyam,
      employeeCount: lead.employeeCount,
      numSites: lead.numSites,
      annualTurnoverBand: lead.annualTurnoverBand,
      gstin: lead.gstin,
      udyamNumber: lead.udyamNumber,
      currentInternet: lead.currentInternet,
      currentProvider: lead.currentProvider,
      productsOfInterest: lead.productsOfInterest,
      preferredLanguage: lead.preferredLanguage,
      recoveryPitch: evalResult.recoveryPitch,
      scoringFactors: evalResult.scoringFactors,
      activities,
      createdAt: lead.createdAt.toISOString()
    } as any;
  }

  /**
   * Record follow-up activity on an assigned lead
   */
  async recordActivity(
    leadId: string,
    dto: RecordLeadActivityDto,
    staff: StaffJwtPayload
  ): Promise<LeadActivityDto> {
    if (!dto.activityType || !dto.notes) {
      throw new BadRequestException('activityType and notes are required.');
    }

    const lead = await this.prisma.droppedLead.findUnique({
      where: { id: leadId }
    });
    if (!lead) {
      throw new NotFoundException(`Lead '${leadId}' was not found.`);
    }

    // STRICT ISOLATION
    if (staff.role === StaffRole.PARTNER && lead.assignedPartnerId !== staff.partnerId) {
      throw new ForbiddenException(
        `Access Denied: You cannot record activities on a lead not assigned to your partner agency.`
      );
    }

    const partnerId = staff.role === StaffRole.PARTNER ? staff.partnerId : lead.assignedPartnerId;

    const followUpDate = dto.followUpDate ? new Date(dto.followUpDate) : null;

    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadActivity.create({
        data: {
          droppedLeadId: leadId,
          partnerId,
          activityType: dto.activityType as any,
          notes: dto.notes,
          outcome: dto.outcome || null,
          followUpDate
        },
        include: { partner: true }
      });

      // Advance lead status if requested or default to CONTACTED if UNASSIGNED/ASSIGNED
      let nextStatus = dto.nextStatus;
      if (!nextStatus && (lead.status === 'UNASSIGNED' || lead.status === 'ASSIGNED')) {
        nextStatus = LeadStatus.CONTACTED;
      }

      if (nextStatus) {
        await tx.droppedLead.update({
          where: { id: leadId },
          data: { status: nextStatus as any }
        });
      }

      return created;
    });

    return {
      id: activity.id,
      droppedLeadId: activity.droppedLeadId,
      partnerId: activity.partnerId,
      partnerName: activity.partner ? activity.partner.agencyName : null,
      activityType: activity.activityType as unknown as ActivityType,
      notes: activity.notes,
      outcome: activity.outcome,
      followUpDate: activity.followUpDate ? activity.followUpDate.toISOString().split('T')[0] : null,
      createdAt: activity.createdAt.toISOString()
    };
  }

  /**
   * Update lead recovery status (e.g. mark RECOVERED or CLOSED_LOST)
   */
  async updateLeadStatus(
    leadId: string,
    dto: UpdateLeadStatusDto,
    staff: StaffJwtPayload
  ): Promise<DroppedLeadDetailDto> {
    if (!dto.status) {
      throw new BadRequestException('status is required.');
    }

    const lead = await this.prisma.droppedLead.findUnique({
      where: { id: leadId }
    });
    if (!lead) {
      throw new NotFoundException(`Lead '${leadId}' was not found.`);
    }

    // STRICT ISOLATION
    if (staff.role === StaffRole.PARTNER && lead.assignedPartnerId !== staff.partnerId) {
      throw new ForbiddenException(
        `Access Denied: You cannot update status of a lead not assigned to your partner agency.`
      );
    }

    const partnerId = staff.role === StaffRole.PARTNER ? staff.partnerId : lead.assignedPartnerId;

    await this.prisma.$transaction(async (tx) => {
      await tx.droppedLead.update({
        where: { id: leadId },
        data: { status: dto.status as any }
      });

      // Log status change activity
      await tx.leadActivity.create({
        data: {
          droppedLeadId: leadId,
          partnerId,
          activityType: 'STATUS_CHANGE',
          notes: dto.notes || `Lead status updated to ${dto.status} by ${staff.fullName}.`,
          outcome: dto.outcome || `Status changed from ${lead.status} to ${dto.status}`
        }
      });
    });

    return this.getLeadById(leadId, staff);
  }

  /**
   * Assign or reassign lead to a partner (Admin/Ops only)
   */
  async assignLead(dto: AssignLeadDto, staff: StaffJwtPayload): Promise<DroppedLeadDetailDto> {
    if (staff.role !== StaffRole.ADMIN && staff.role !== StaffRole.OPERATIONS) {
      throw new ForbiddenException('Only ADMIN or OPERATIONS roles can assign leads to partners.');
    }

    if (!dto.leadId || !dto.partnerId) {
      throw new BadRequestException('leadId and partnerId are required.');
    }

    const [lead, partner] = await Promise.all([
      this.prisma.droppedLead.findUnique({ where: { id: dto.leadId } }),
      this.prisma.partner.findUnique({ where: { id: dto.partnerId } })
    ]);

    if (!lead) throw new NotFoundException(`Lead '${dto.leadId}' was not found.`);
    if (lead.stageReached === 'Activated') {
      throw new BadRequestException(
        `Cannot assign lead '${dto.leadId}': customer is already activated and cannot enter the recovery queue.`
      );
    }
    if (!partner) throw new NotFoundException(`Partner '${dto.partnerId}' was not found.`);

    await this.prisma.$transaction(async (tx) => {
      await tx.droppedLead.update({
        where: { id: dto.leadId },
        data: {
          assignedPartnerId: partner.id,
          status: 'ASSIGNED'
        }
      });

      await tx.leadActivity.create({
        data: {
          droppedLeadId: dto.leadId,
          partnerId: partner.id,
          activityType: 'STATUS_CHANGE',
          notes: dto.notes || `Lead assigned to partner agency ${partner.agencyName} (${partner.partnerCode}) by ${staff.fullName}.`,
          outcome: `Assigned to ${partner.agencyName}`
        }
      });
    });

    return this.getLeadById(dto.leadId, staff);
  }

  /**
   * Partner dashboard KPI metrics
   */
  async getPartnerMetrics(staff: StaffJwtPayload): Promise<PartnerDashboardMetricsDto> {
    let partnerId = staff.partnerId;
    if (staff.role !== StaffRole.PARTNER) {
      // Default to first demo partner if admin/ops accesses metrics without partnerId
      const firstPartner = await this.prisma.partner.findFirst({ orderBy: { partnerCode: 'asc' } });
      partnerId = firstPartner?.id || null;
    }

    if (!partnerId) {
      throw new NotFoundException('No partner found for metrics calculation.');
    }

    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
    if (!partner) throw new NotFoundException('Partner was not found.');

    const [totalAssigned, contacted, recovered, closedLost, highPriority] = await Promise.all([
      this.prisma.droppedLead.count({ where: { assignedPartnerId: partner.id } }),
      this.prisma.droppedLead.count({
        where: { assignedPartnerId: partner.id, status: { in: ['CONTACTED', 'RECOVERED'] } }
      }),
      this.prisma.droppedLead.count({ where: { assignedPartnerId: partner.id, status: 'RECOVERED' } }),
      this.prisma.droppedLead.count({ where: { assignedPartnerId: partner.id, status: 'CLOSED_LOST' } }),
      this.prisma.droppedLead.count({
        where: { assignedPartnerId: partner.id, propensityRank: 'HIGH' }
      })
    ]);

    const recoveryRatePercent = totalAssigned > 0 ? Number(((recovered / totalAssigned) * 100).toFixed(1)) : 0;

    // Configurable Demo Commission Assumption: Flat ₹2,500 acquisition bounty per recovered & active subscriber
    const estimatedCommissionInr = recovered * 2500;

    return {
      partnerId: partner.id,
      partnerCode: partner.partnerCode,
      agencyName: partner.agencyName,
      territoryCity: partner.territoryCity,
      totalAssignedLeads: totalAssigned,
      contactedLeads: contacted,
      recoveredLeads: recovered,
      closedLostLeads: closedLost,
      recoveryRatePercent,
      estimatedCommissionInr,
      highPriorityCount: highPriority
    };
  }
}
