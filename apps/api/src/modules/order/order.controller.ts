import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { Request } from 'express';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CheckoutRequestDto,
  CheckoutResponseDto,
  OrderTransitionRequestDto,
  OrderDetailDto,
  PublicTrackingResponseDto,
  StaffRole,
  StaffJwtPayload
} from '@udyamone/shared-types';

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * POST /api/orders/checkout
   * Creates an order from a verified, valid quote.
   * Guarded by KYC verification gate and catalogue integrity checks.
   * Returns a high-entropy tracking secret token ONCE.
   */
  @Post('orders/checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(@Body() dto: CheckoutRequestDto): Promise<CheckoutResponseDto> {
    if (!dto) {
      throw new BadRequestException('Checkout request body is required.');
    }
    return this.orderService.checkout(dto);
  }

  /**
   * GET /api/orders/:orderNumber
   * Protected internal operations endpoint for authorized staff.
   * Guarded by JWT authentication: unauthenticated requests rejected with 401.
   * Exposes unmasked customer PII only to authenticated staff with permitted roles.
   */
  @Get('orders/:orderNumber')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OPERATIONS, StaffRole.ADMIN, StaffRole.TECHNICIAN, StaffRole.COMPLIANCE_OFFICER)
  async getOrder(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<OrderDetailDto> {
    if (!orderNumber) {
      throw new BadRequestException('orderNumber is required.');
    }
    return this.orderService.getOrderByNumber(orderNumber, staff.role);
  }

  /**
   * POST /api/orders/:orderNumber/transition
   * Protected operations endpoint for authorized staff to advance order through state machine.
   * Guarded by JWT authentication: requires OPERATIONS, ADMIN, or TECHNICIAN role.
   * Derives verified actor identity and role from verified JWT context.
   */
  @Post('orders/:orderNumber/transition')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OPERATIONS, StaffRole.ADMIN, StaffRole.TECHNICIAN)
  async transitionOrder(
    @Param('orderNumber') orderNumber: string,
    @Body() dto: OrderTransitionRequestDto,
    @CurrentUser() staff: StaffJwtPayload
  ): Promise<OrderDetailDto> {
    if (!orderNumber) {
      throw new BadRequestException('orderNumber is required.');
    }
    if (!dto || !dto.toStatus) {
      throw new BadRequestException('toStatus is required for state transition.');
    }

    return this.orderService.transitionOrder(
      orderNumber,
      dto,
      staff.role,
      staff.sub
    );
  }

  /**
   * GET /api/tracking/:token
   * Public, token-protected, read-only tracking endpoint.
   * Hashes token with SHA-256, applies anti-spoofing rate limiting, and returns zero sensitive PII.
   */
  @Get('tracking/:token')
  async trackOrder(
    @Param('token') token: string,
    @Req() req: Request
  ): Promise<PublicTrackingResponseDto> {
    if (!token) {
      throw new BadRequestException('Tracking token is required.');
    }

    // Anti-spoofing client IP extraction:
    // Only trust X-Forwarded-For if TRUST_PROXY is set to true in the environment
    const trustProxy = process.env.TRUST_PROXY === 'true';
    let clientIp = req.socket.remoteAddress || '127.0.0.1';
    if (trustProxy && req.headers['x-forwarded-for']) {
      const forwarded = req.headers['x-forwarded-for'];
      const rawFirst = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      if (rawFirst && rawFirst.trim()) {
        clientIp = rawFirst.trim();
      }
    }

    return this.orderService.trackByToken(token, clientIp);
  }
}

