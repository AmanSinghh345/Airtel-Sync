import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        database: {
          connected: true,
          provider: 'postgresql',
        },
        version: '1.0.0',
      };
    } catch (error: any) {
      return {
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        database: {
          connected: false,
          error: error.message,
        },
        version: '1.0.0',
      };
    }
  }
}
