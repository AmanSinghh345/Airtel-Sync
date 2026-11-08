import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { KycModule } from '../kyc/kyc.module';
import { CatalogModule } from '../catalog/catalog.module';
import { QuoteModule } from '../quote/quote.module';

@Module({
  imports: [KycModule, CatalogModule, QuoteModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService]
})
export class OrderModule {}
