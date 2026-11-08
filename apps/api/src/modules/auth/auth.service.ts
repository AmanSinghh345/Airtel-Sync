import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  Logger
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import {
  StaffLoginRequestDto,
  StaffLoginResponseDto,
  StaffJwtPayload,
  StaffRole
} from '@udyamone/shared-types';
import { AUTH_CONFIG, DEMO_STAFF_USERS } from './auth.constants';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDemoStaffAccounts();
  }

  /**
   * Seed demo staff accounts if they do not exist
   */
  async seedDemoStaffAccounts(): Promise<void> {
    for (const demoUser of DEMO_STAFF_USERS) {
      const existing = await this.prisma.staffUser.findUnique({
        where: { email: demoUser.email }
      });
      if (!existing) {
        const salt = bcrypt.genSaltSync(10);
        const passwordHash = bcrypt.hashSync(demoUser.plainPassword, salt);
        await this.prisma.staffUser.create({
          data: {
            email: demoUser.email,
            fullName: demoUser.fullName,
            role: demoUser.role as any,
            passwordHash,
            isActive: true
          }
        });
        this.logger.log(`Seeded demo staff account: ${demoUser.email} [${demoUser.role}]`);
      }
    }
  }

  /**
   * Authenticate staff user and issue signed RFC 7519 JWT
   */
  async login(dto: StaffLoginRequestDto): Promise<StaffLoginResponseDto> {
    if (!dto.email || !dto.password) {
      throw new UnauthorizedException('Email and password are required.');
    }

    const user = await this.prisma.staffUser.findUnique({
      where: { email: dto.email.trim().toLowerCase() }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive account.');
    }

    const isMatch = bcrypt.compareSync(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials or inactive account.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as unknown as StaffRole,
      partnerId: user.partnerId || undefined
    };

    const accessToken = jwt.sign(payload, AUTH_CONFIG.JWT_SECRET, {
      expiresIn: AUTH_CONFIG.JWT_EXPIRES_IN as any,
      issuer: AUTH_CONFIG.JWT_ISSUER,
      audience: AUTH_CONFIG.JWT_AUDIENCE
    });

    // 8 hours in seconds
    const expiresInSeconds = 8 * 60 * 60;

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as unknown as StaffRole,
        partnerId: user.partnerId || null
      }
    };
  }

  /**
   * Strictly verify JWT signature, issuer, audience, and expiration
   */
  verifyToken(token: string): StaffJwtPayload {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing or invalid authentication token.');
    }

    try {
      const decoded = jwt.verify(token, AUTH_CONFIG.JWT_SECRET, {
        issuer: AUTH_CONFIG.JWT_ISSUER,
        audience: AUTH_CONFIG.JWT_AUDIENCE
      }) as StaffJwtPayload;

      if (!decoded.sub || !decoded.role) {
        throw new UnauthorizedException('Token payload is malformed.');
      }

      return decoded;
    } catch (err: any) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Authentication token has expired.');
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException(`Invalid authentication token: ${err.message}`);
      }
      throw new UnauthorizedException('Authentication failed.');
    }
  }
}
