import { Module } from '@nestjs/common';
import { AdvisorController } from './advisor.controller';
import { AdvisorService } from './advisor.service';
import { DeterministicExtractionService } from './deterministic-extraction.service';
import { GeminiExtractionService } from './gemini-extraction.service';
import { ProductRecommendationEngine } from './product-recommendation.engine';
import { CatalogModule } from '../catalog/catalog.module';
import { QuoteModule } from '../quote/quote.module';

@Module({
  imports: [CatalogModule, QuoteModule],
  controllers: [AdvisorController],
  providers: [
    AdvisorService,
    DeterministicExtractionService,
    GeminiExtractionService,
    ProductRecommendationEngine
  ],
  exports: [AdvisorService]
})
export class AdvisorModule {}
