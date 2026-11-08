import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { KycVerificationService } from '../kyc/kyc-verification.service';
import { CatalogService } from '../catalog/catalog.service';
import {
  OrderStatus,
  TriggeredBy,
  CheckoutRequestDto,
  CheckoutResponseDto,
  OrderTransitionRequestDto,
  OrderDetailDto,
  PublicTrackingResponseDto,
  OrderTimelineStepDto,
  ProductCategory
} from '@udyamone/shared-types';

// In-memory rate limiting map for public tracking endpoint
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const trackingRateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_MAX_QUERIES = 30; // Max 30 queries per minute
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// State Machine transition map
const PERMITTED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.ORDER_RECEIVED]: [OrderStatus.KYC_VALIDATED, OrderStatus.CANCELLED],
  [OrderStatus.KYC_VALIDATED]: [OrderStatus.FEASIBILITY_CLEARED, OrderStatus.CANCELLED],
  [OrderStatus.FEASIBILITY_CLEARED]: [OrderStatus.TECHNICIAN_DISPATCHED, OrderStatus.CANCELLED],
  [OrderStatus.TECHNICIAN_DISPATCHED]: [OrderStatus.INSTALLED_AND_ACTIVE, OrderStatus.CANCELLED],
  [OrderStatus.INSTALLED_AND_ACTIVE]: [], // Terminal state
  [OrderStatus.CANCELLED]: []             // Terminal state
};

// Step configuration for public tracker
const PROGRESS_STEPS: Array<{ status: OrderStatus; title: string; description: string }> = [
  {
    status: OrderStatus.ORDER_RECEIVED,
    title: 'Order Placed',
    description: 'Order received and logged in system. Awaiting verification review.'
  },
  {
    status: OrderStatus.KYC_VALIDATED,
    title: 'KYC Validated',
    description: 'Government registry checks and identity verification cleared.'
  },
  {
    status: OrderStatus.FEASIBILITY_CLEARED,
    title: 'Network Feasibility Cleared',
    description: 'Optical fiber route and exchange port feasibility confirmed.'
  },
  {
    status: OrderStatus.TECHNICIAN_DISPATCHED,
    title: 'Technician Dispatched',
    description: 'Field engineer assigned and dispatched for on-site CPE installation.'
  },
  {
    status: OrderStatus.INSTALLED_AND_ACTIVE,
    title: 'Installed & Active',
    description: 'Telecom link installed, tested, and actively operational.'
  }
];

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kycVerificationService: KycVerificationService,
    private readonly catalogService: CatalogService
  ) {}

  /**
   * CHECKOUT & ORDER CREATION
   * Transactional, collision-safe, guarded by KYC gate and catalog validation.
   * Generates a high-entropy secret tracking token returned only once!
   */
  async checkout(dto: CheckoutRequestDto): Promise<CheckoutResponseDto> {
    if (!dto.quoteId || !dto.businessId) {
      throw new BadRequestException('quoteId and businessId are required for checkout.');
    }
    if (!dto.contactName || !dto.contactPhone || !dto.installationAddress) {
      throw new BadRequestException('contactName, contactPhone, and installationAddress are required.');
    }
    if (!dto.city || !dto.state || !dto.pincode) {
      throw new BadRequestException('city, state, and pincode are required.');
    }

    // 1. Verify business existence
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId }
    });
    if (!business) {
      throw new NotFoundException(`Business '${dto.businessId}' was not found.`);
    }

    // 2. Verify quote existence and validity
    const quote = await this.prisma.quote.findUnique({
      where: { id: dto.quoteId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });
    if (!quote) {
      throw new NotFoundException(`Quote '${dto.quoteId}' was not found.`);
    }
    if (quote.businessId !== dto.businessId) {
      throw new BadRequestException(
        `Quote '${dto.quoteId}' belongs to business '${quote.businessId}', not '${dto.businessId}'.`
      );
    }
    if (new Date() > quote.validUntil) {
      throw new BadRequestException(`Quote '${quote.quoteNumber}' has expired on ${quote.validUntil.toISOString()}.`);
    }

    // 3. KYC ELIGIBILITY GATE: Sourced directly from KYC service immediately before order creation
    const kycEligibility = await this.kycVerificationService.getCheckoutEligibility(dto.businessId);
    if (!kycEligibility.eligible) {
      throw new ForbiddenException(
        `Checkout Rejected: Business KYC status is '${kycEligibility.kycStatus}'. Allowed only for VERIFIED or OVERRIDDEN_VERIFIED. Reason: ${kycEligibility.reason}`
      );
    }

    // 4. IDEMPOTENCY & DUPLICATE PREVENTION CHECK
    // If order already exists for this quote, return existing order safely without re-creating
    const existingOrder = await this.prisma.order.findUnique({
      where: { quoteId: dto.quoteId },
      include: { items: true }
    });
    if (existingOrder) {
      this.logger.warn(`Idempotent checkout request detected for quote '${quote.quoteNumber}'. Returning existing order.`);
      const firstYearInr =
        Number(quote.monthlyRecurringInr) * (quote.contractMonths || 12) + Number(quote.oneTimeSetupInr);
      return {
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        trackingToken: '[ALREADY_ISSUED_ON_INITIAL_CHECKOUT]',
        status: existingOrder.status as unknown as OrderStatus,
        calculatedSlaDays: existingOrder.calculatedSlaDays,
        estimatedActiveDate: existingOrder.estimatedActiveDate.toISOString().split('T')[0],
        isGuaranteedSla: false,
        totalMonthlyRecurringInr: Number(quote.monthlyRecurringInr),
        totalOneTimeSetupInr: Number(quote.oneTimeSetupInr),
        totalIndicativeFirstYearInr: firstYearInr,
        createdAt: existingOrder.createdAt.toISOString(),
        itemCount: existingOrder.items.length,
        trackingUrl: `/tracking?orderNumber=${existingOrder.orderNumber}`
      };
    }

    // 5. RE-VALIDATE CATALOGUE ELIGIBILITY & PREREQUISITES
    const bundleItems = quote.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPriceInr: Number(i.unitPriceInr),
      unitSetupInr: Number(i.unitSetupInr)
    }));

    const leadProfile = {
      id: business.id,
      companyName: business.tradeName,
      segment: business.segment as any,
      city: business.city,
      cityTier: business.cityTier as any,
      state: business.state,
      employeeCount: business.employeeCount,
      numSites: business.numSites,
      hasGstin: business.hasGstin,
      gstin: business.gstin || undefined,
      preferredLanguage: 'English'
    };

    const validationResult = await this.catalogService.validateBundle(leadProfile, bundleItems);

    if (!validationResult.valid) {
      const errorMsg = validationResult.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new BadRequestException(`Catalogue validation failed for quote items: ${errorMsg}`);
    }

    // 6. INSTALLATION SLA: Sourced as maximum typical_install_days among selected products
    const calculatedSlaDays = Math.max(
      ...quote.items.map((i) => i.product.typicalInstallDays || 5),
      5
    );
    const now = new Date();
    const estimatedActiveDate = new Date(now.getTime() + calculatedSlaDays * 24 * 60 * 60 * 1000);

    // 7. GENERATE COLLISION-SAFE ORDER NUMBER (ORD-2026-XXXXX)
    let orderNumber = '';
    let isCollisionSafe = false;
    while (!isCollisionSafe) {
      const randSuffix = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
      orderNumber = `ORD-2026-${randSuffix}`;
      const existing = await this.prisma.order.findUnique({ where: { orderNumber } });
      if (!existing) isCollisionSafe = true;
    }

    // 8. GENERATE HIGH-ENTROPY RAW TRACKING TOKEN & CRYPTOGRAPHIC HASH
    // Token entropy: 24 cryptographically random bytes (192 bits)
    const rawTrackingToken = `TRK-2026-${crypto.randomBytes(24).toString('base64url')}`;
    const trackingTokenHash = crypto.createHash('sha256').update(rawTrackingToken).digest('hex');

    // 9. DATABASE TRANSACTION WITH REVALIDATION INSIDE TRANSACTION BOUNDARY
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      // 9.1 REVALIDATION INSIDE TRANSACTION (TOCTOU & RACE-CONDITION PROTECTION)
      // Assert affirmative, unrevoked DPDP consent still exists inside transaction boundary
      const txConsent = await tx.consentRecord.findFirst({
        where: {
          businessId: dto.businessId,
          consentGiven: true,
          revokedAt: null
        },
        orderBy: { consentTimestamp: 'desc' }
      });
      if (!txConsent) {
        throw new ForbiddenException(
          `Checkout Transaction Blocked: DPDP consent for business '${dto.businessId}' is missing or was revoked before transaction commit.`
        );
      }

      // Assert latest KYC status is strictly VERIFIED or OVERRIDDEN_VERIFIED inside transaction boundary
      const txKyc = await tx.kycVerification.findFirst({
        where: { businessId: dto.businessId },
        orderBy: { createdAt: 'desc' }
      });
      if (!txKyc || (txKyc.status !== 'VERIFIED' && txKyc.status !== 'OVERRIDDEN_VERIFIED')) {
        throw new ForbiddenException(
          `Checkout Transaction Blocked: KYC verification status is invalid ('${txKyc?.status || 'NONE'}'). Only VERIFIED or OVERRIDDEN_VERIFIED may be checked out.`
        );
      }

      // Re-verify Quote status inside transaction to prevent concurrent duplicate checkout
      const txQuote = await tx.quote.findUnique({
        where: { id: quote.id }
      });
      if (!txQuote || txQuote.status === 'EXPIRED') {
        throw new BadRequestException(`Quote '${quote.quoteNumber}' has expired or is invalid.`);
      }

      // Transition Quote to ACCEPTED
      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'ACCEPTED' }
      });

      // Create Order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          trackingTokenHash,
          businessId: dto.businessId,
          quoteId: dto.quoteId,
          status: 'ORDER_RECEIVED',
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          installationAddress: dto.installationAddress,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          calculatedSlaDays,
          estimatedActiveDate
        }
      });

      // Create OrderItems with exact Decimal values from accepted quote
      for (const item of quote.items) {
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceInr: item.unitPriceInr,
            unitSetupInr: item.unitSetupInr,
            siteIndex: 1
          }
        });
      }

      // Create initial OrderEvent
      await tx.orderEvent.create({
        data: {
          orderId: newOrder.id,
          fromStatus: null,
          toStatus: 'ORDER_RECEIVED',
          eventName: 'ORDER_PLACED',
          description: `Customer completed digital checkout following affirmative KYC verification. Estimated activation in ${calculatedSlaDays} days.`,
          triggeredBy: 'CUSTOMER',
          metadata: {
            actor: dto.contactName,
            contactPhone: dto.contactPhone,
            quoteNumber: quote.quoteNumber,
            calculatedSlaDays,
            estimatedActiveDate: estimatedActiveDate.toISOString().split('T')[0]
          }
        }
      });

      // Link latest KycVerification to order if available
      const latestKyc = await tx.kycVerification.findFirst({
        where: { businessId: dto.businessId },
        orderBy: { createdAt: 'desc' }
      });
      if (latestKyc && !latestKyc.orderId) {
        await tx.kycVerification.update({
          where: { id: latestKyc.id },
          data: { orderId: newOrder.id }
        });
      }

      return newOrder;
    });

    this.logger.log(`Order '${createdOrder.orderNumber}' successfully placed for business '${dto.businessId}'.`);

    // Return raw tracking token ONCE in the response (Never logged, never stored in DB!)
    return {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      trackingToken: rawTrackingToken,
      status: createdOrder.status as unknown as OrderStatus,
      calculatedSlaDays: createdOrder.calculatedSlaDays,
      estimatedActiveDate: createdOrder.estimatedActiveDate.toISOString().split('T')[0],
      isGuaranteedSla: false,
      totalMonthlyRecurringInr: Number(quote.monthlyRecurringInr),
      totalOneTimeSetupInr: Number(quote.oneTimeSetupInr),
      totalIndicativeFirstYearInr:
        Number(quote.monthlyRecurringInr) * (quote.contractMonths || 12) + Number(quote.oneTimeSetupInr),
      createdAt: createdOrder.createdAt.toISOString(),
      itemCount: quote.items.length,
      trackingUrl: `/tracking?token=${rawTrackingToken}`
    };
  }

  /**
   * ORDER STATE MACHINE TRANSITION
   * Validates strict sequential progression, enforces staff roles, and records audit events.
   */
  async transitionOrder(
    orderNumber: string,
    dto: OrderTransitionRequestDto,
    actorRole: string,
    actorUserId: string
  ): Promise<OrderDetailDto> {
    const allowedRoles = ['OPERATIONS', 'ADMIN', 'TECHNICIAN'];
    const cleanRole = (actorRole || '').trim().toUpperCase();
    if (!allowedRoles.includes(cleanRole)) {
      throw new ForbiddenException(
        `Role '${cleanRole || 'UNAUTHENTICATED'}' is not authorized to transition order state. Required: OPERATIONS, ADMIN, or TECHNICIAN.`
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: { include: { product: true } },
        events: { orderBy: { createdAt: 'asc' } },
        business: true,
        quote: true
      }
    });

    if (!order) {
      throw new NotFoundException(`Order '${orderNumber}' was not found.`);
    }

    const currentStatus = order.status as unknown as OrderStatus;
    const allowedNext = PERMITTED_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(dto.toStatus)) {
      throw new BadRequestException(
        `Invalid state transition: Cannot transition from '${currentStatus}' to '${dto.toStatus}'. Permitted transitions from '${currentStatus}': ${allowedNext.join(', ') || 'None (Terminal State)'}.`
      );
    }

    // Transactional state update and event creation
    await this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        status: dto.toStatus
      };
      if (dto.assignedTechnician) updateData.assignedTechnician = dto.assignedTechnician;
      if (dto.technicianPhone) updateData.technicianPhone = dto.technicianPhone;
      if (dto.toStatus === OrderStatus.INSTALLED_AND_ACTIVE) {
        updateData.actualActivatedDate = new Date();
      }

      await tx.order.update({
        where: { id: order.id },
        data: updateData
      });

      let triggeredBy: TriggeredBy = TriggeredBy.SYSTEM;
      if (cleanRole === 'TECHNICIAN') triggeredBy = TriggeredBy.TECHNICIAN;
      if (cleanRole === 'ADMIN') triggeredBy = TriggeredBy.ADMIN_OVERRIDE;
      if (cleanRole === 'OPERATIONS') triggeredBy = TriggeredBy.ADMIN_OVERRIDE;

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: dto.toStatus as any,
          eventName: `STATE_TRANSITION_${dto.toStatus}`,
          description: dto.reason || `Order status advanced to ${dto.toStatus} by ${cleanRole} (${actorUserId}).`,
          triggeredBy: triggeredBy as any,
          metadata: {
            actorRole: cleanRole,
            actorUserId,
            notes: dto.notes || null,
            assignedTechnician: dto.assignedTechnician || null,
            timestamp: new Date().toISOString()
          }
        }
      });
    });

    return this.getOrderByNumber(orderNumber, cleanRole);
  }

  /**
   * AUTHENTICATED ORDER LOOKUP BY ORDER NUMBER
   */
  async getOrderByNumber(orderNumber: string, actorRole?: string): Promise<OrderDetailDto> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: { include: { product: true } },
        events: { orderBy: { createdAt: 'asc' } },
        business: true,
        quote: true
      }
    });

    if (!order) {
      throw new NotFoundException(`Order '${orderNumber}' was not found.`);
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      businessId: order.businessId,
      businessName: order.business.tradeName,
      quoteId: order.quoteId,
      quoteNumber: order.quote.quoteNumber,
      status: order.status as unknown as OrderStatus,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      installationAddress: order.installationAddress,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
      calculatedSlaDays: order.calculatedSlaDays,
      estimatedActiveDate: order.estimatedActiveDate.toISOString().split('T')[0],
      actualActivatedDate: order.actualActivatedDate ? order.actualActivatedDate.toISOString().split('T')[0] : null,
      assignedTechnician: order.assignedTechnician,
      technicianPhone: order.technicianPhone,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.productName,
        quantity: i.quantity,
        unitPriceInr: Number(i.unitPriceInr),
        unitSetupInr: Number(i.unitSetupInr),
        siteIndex: i.siteIndex
      })),
      events: order.events.map((e) => ({
        id: e.id,
        fromStatus: e.fromStatus as unknown as OrderStatus | null,
        toStatus: e.toStatus as unknown as OrderStatus,
        eventName: e.eventName,
        description: e.description,
        triggeredBy: e.triggeredBy as unknown as TriggeredBy,
        createdAt: e.createdAt.toISOString(),
        metadata: e.metadata
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString()
    };
  }

  /**
   * SECURE PUBLIC TRACKING (TOKEN-PROTECTED, RATE-LIMITED, ZERO PII EXPOSURE)
   */
  async trackByToken(rawToken: string, clientIp?: string): Promise<PublicTrackingResponseDto> {
    // 1. Sliding window rate limiting
    const rateLimitKey = clientIp || 'global_public';
    this.enforceRateLimit(rateLimitKey);

    if (!rawToken || typeof rawToken !== 'string') {
      throw new NotFoundException('Order not found or tracking token expired.');
    }

    // 2. Hash raw token with SHA-256 for secure comparison
    const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

    // 3. Query order by hash
    const order = await this.prisma.order.findUnique({
      where: { trackingTokenHash: tokenHash },
      include: {
        items: { include: { product: true } },
        events: { orderBy: { createdAt: 'asc' } },
        business: true
      }
    });

    // Uniform safe 404 response to prevent enumeration
    if (!order) {
      throw new NotFoundException('Order not found or tracking token expired.');
    }

    const currentStatus = order.status as unknown as OrderStatus;

    // 4. Calculate progress percentage
    const progressMap: Record<OrderStatus, number> = {
      [OrderStatus.ORDER_RECEIVED]: 20,
      [OrderStatus.KYC_VALIDATED]: 40,
      [OrderStatus.FEASIBILITY_CLEARED]: 60,
      [OrderStatus.TECHNICIAN_DISPATCHED]: 80,
      [OrderStatus.INSTALLED_AND_ACTIVE]: 100,
      [OrderStatus.CANCELLED]: 0
    };
    const progressPercentage = progressMap[currentStatus] || 0;

    // 5. Construct timeline steps
    const steps: OrderTimelineStepDto[] = PROGRESS_STEPS.map((s, idx) => {
      let state: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'CANCELLED' = 'PENDING';
      if (currentStatus === OrderStatus.CANCELLED) {
        state = 'CANCELLED';
      } else {
        const currentIdx = PROGRESS_STEPS.findIndex((p) => p.status === currentStatus);
        if (idx < currentIdx) state = 'COMPLETED';
        else if (idx === currentIdx) state = 'CURRENT';
        else state = 'PENDING';
      }

      // Find event completion time
      const matchingEvent = order.events.find((e) => e.toStatus === (s.status as any));

      return {
        stepStatus: s.status,
        title: s.title,
        description: s.description,
        state,
        completedAt: matchingEvent ? matchingEvent.createdAt.toISOString() : null
      };
    });

    // 6. Installation SLA calculation
    const now = new Date();
    const diffMs = order.estimatedActiveDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    // 7. Zero PII Exposure Masking
    const maskedCustomer = {
      companyTradeName: order.business.tradeName,
      contactName: this.maskCustomerName(order.contactName),
      contactPhone: this.maskPhoneNumber(order.contactPhone),
      city: order.city,
      state: order.state,
      installationAddress: this.maskStreetAddress(order.installationAddress, order.city)
    };

    const statusDescriptions: Record<OrderStatus, string> = {
      [OrderStatus.ORDER_RECEIVED]: 'Order has been placed and received. Our fulfillment team is initializing your onboarding package.',
      [OrderStatus.KYC_VALIDATED]: 'Government identity and MSME certificates have been verified successfully.',
      [OrderStatus.FEASIBILITY_CLEARED]: 'Optical fiber link feasibility and exchange port allocation have been verified.',
      [OrderStatus.TECHNICIAN_DISPATCHED]: 'A certified field engineer has been dispatched with equipment for on-site deployment.',
      [OrderStatus.INSTALLED_AND_ACTIVE]: 'Your enterprise telecom service is successfully installed, tested, and active.',
      [OrderStatus.CANCELLED]: 'This order has been cancelled.'
    };

    return {
      orderNumber: order.orderNumber,
      currentStatus,
      statusDescription: statusDescriptions[currentStatus] || `Current status: ${currentStatus}`,
      progressPercentage,
      steps,
      installationSla: {
        calculatedSlaDays: order.calculatedSlaDays,
        estimatedActiveDate: order.estimatedActiveDate.toISOString().split('T')[0],
        isGuaranteed: false,
        slaStartTimestamp: order.createdAt.toISOString(),
        remainingDays,
        disclaimer: 'The installation timeline is an engineering estimate based on fiber feasibility, site survey, and technician deployment. It is not a guaranteed SLA.'
      },
      maskedCustomer,
      items: order.items.map((i) => ({
        productName: i.product.productName,
        category: i.product.category as unknown as ProductCategory,
        quantity: i.quantity
      })),
      recentEvents: order.events.map((e) => ({
        eventName: e.eventName,
        description: e.description,
        timestamp: e.createdAt.toISOString()
      }))
    };
  }

  /**
   * Helper: In-memory sliding window rate limiter
   */
  private enforceRateLimit(key: string): void {
    const now = Date.now();
    const existing = trackingRateLimits.get(key);

    if (!existing || now > existing.resetAt) {
      trackingRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return;
    }

    existing.count++;
    if (existing.count > RATE_LIMIT_MAX_QUERIES) {
      throw new HttpException(
        'Too Many Requests: Public tracking rate limit exceeded. Please wait 1 minute before trying again.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Helper: Masks customer contact name (e.g. "Anita Kulkarni" -> "A**** K*******")
   */
  private maskCustomerName(name: string): string {
    if (!name) return 'Customer';
    return name
      .split(' ')
      .map((part) => {
        if (part.length <= 2) return part;
        return part.charAt(0) + '*'.repeat(part.length - 1);
      })
      .join(' ');
  }

  /**
   * Helper: Masks phone number (e.g. "+91 9876543210" -> "+91 ********10")
   */
  private maskPhoneNumber(phone: string): string {
    if (!phone) return '+91 **********';
    const clean = phone.trim();
    if (clean.length < 4) return '**********';
    const last2 = clean.slice(-2);
    return `+91 ********${last2}`;
  }

  /**
   * Helper: Masks street address (e.g. "Shop 217, Civil Lines, Visakhapatnam" -> "***, Civil Lines, Visakhapatnam")
   */
  private maskStreetAddress(address: string, city: string): string {
    if (!address) return city;
    const parts = address.split(',');
    if (parts.length > 1) {
      return `***, ${parts.slice(1).join(',').trim()}`;
    }
    return `***, ${city}`;
  }
}
