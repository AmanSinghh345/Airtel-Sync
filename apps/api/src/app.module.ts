import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { QuoteModule } from './modules/quote/quote.module';
import { AdvisorModule } from './modules/advisor/advisor.module';
import { KycModule } from './modules/kyc/kyc.module';
import { OrderModule } from './modules/order/order.module';
import { AuthModule } from './modules/auth/auth.module';
import { PartnerModule } from './modules/partner/partner.module';

@Module({
  imports: [PrismaModule, HealthModule, CatalogModule, QuoteModule, AdvisorModule, KycModule, OrderModule, AuthModule, PartnerModule],
})
export class AppModule {}
