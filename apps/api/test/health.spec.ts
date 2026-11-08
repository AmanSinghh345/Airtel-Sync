import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../src/modules/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController (Unit)', () => {
  let controller: HealthController;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [PrismaService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prisma = module.get<PrismaService>(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should return status UP with connected PostgreSQL', async () => {
    const res = await controller.getHealth();
    expect(res.status).toBe('UP');
    expect(res.database.connected).toBe(true);
    expect(res.database.provider).toBe('postgresql');
    expect(res.version).toBe('1.0.0');
    console.log('Health check output verified:', res);
  });
});
