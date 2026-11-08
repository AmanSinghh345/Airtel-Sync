import { Injectable } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { QuoteService } from '../quote/quote.service';
import {
  ExtractedBusinessIntent,
  Segment,
  ProductRecommendationDto,
  AdvisorRecommendationResult,
  BundleItemDto
} from '@udyamone/shared-types';

@Injectable()
export class ProductRecommendationEngine {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly quoteService: QuoteService
  ) {}

  /**
   * Generates a deterministic bundle recommendation and transparent quote from extracted intent.
   * AI never invents or calculates prices; all quotes are calculated strictly by QuoteService.
   */
  async generateRecommendation(
    intent: ExtractedBusinessIntent,
    businessId?: string
  ): Promise<AdvisorRecommendationResult> {
    const candidateItems: Array<{ productId: string; quantity: number; reason: string }> = [];

    const cityTier = intent.cityTier || 2;
    const employeeCount = intent.employeeCount || 1;
    const numSites = intent.numSites || 1;
    const hasGstin = intent.hasGstin || false;
    const segment = intent.segment || Segment.MICRO_RETAIL;

    // 1. Primary Connectivity Selection (Mandatory Foundation)
    if (employeeCount <= 10) {
      // 100 Mbps Fibre
      candidateItems.push({
        productId: 'P01',
        quantity: 1,
        reason: `Biz Fibre 100 Mbps provides dedicated high-speed broadband suitable for your team of ${employeeCount} users.`
      });
    } else if (employeeCount <= 30) {
      // 300 Mbps Fibre
      candidateItems.push({
        productId: 'P02',
        quantity: 1,
        reason: `Biz Fibre 300 Mbps delivers high throughput and symmetrical speed ideal for your team of ${employeeCount} users.`
      });
    } else {
      // > 30 employees or manufacturing enterprise
      if (cityTier === 1 && segment === Segment.PROFESSIONAL_OFFICE) {
        // 1 Gbps available in Tier 1
        candidateItems.push({
          productId: 'P03',
          quantity: 1,
          reason: `Biz Fibre 1 Gbps Gigabit connectivity delivers ultra-high bandwidth for heavy data workflows in Tier 1 locations.`
        });
      } else {
        // High capacity 300M or dedicated leased line
        candidateItems.push({
          productId: 'P02',
          quantity: 1,
          reason: `Biz Fibre 300 Mbps provides robust enterprise connectivity for large office operations.`
        });
      }
    }

    // 2. Multi-Site Interconnection (Managed SD-WAN)
    if (numSites >= 3 && hasGstin && employeeCount >= 10) {
      candidateItems.push({
        productId: 'P10',
        quantity: 1,
        reason: `Managed SD-WAN securely interconnects all ${numSites} branch sites with centralized traffic management and policy control.`
      });
    }

    // 3. High Availability / Business Continuity (Failover Backup)
    const needsBackup =
      intent.specificProductInterests?.includes('P09') ||
      /backup|failover|redundancy|no downtime|fail-safe/i.test(intent.primaryNeed || '') ||
      segment === Segment.MICRO_RETAIL;

    if (needsBackup) {
      candidateItems.push({
        productId: 'P09',
        quantity: 1,
        reason: 'Backup 4G/5G Wireless Failover guarantees 99.9% uptime for billing and point-of-sale during fiber cuts.'
      });
    }

    // 4. Static IP / Enterprise Hosting / ERP
    const needsStaticIp =
      intent.specificProductInterests?.includes('P11') ||
      /static ip|tally|erp|server|remote access/i.test(intent.primaryNeed || '') ||
      segment === Segment.MANUFACTURING;

    if (needsStaticIp) {
      candidateItems.push({
        productId: 'P11',
        quantity: 1,
        reason: 'Static IP Bundle enables secure remote access to internal ERP, accounting servers (Tally), and VPN gateways.'
      });
    }

    // 5. Cloud Telephony / SIP Trunk
    const needsTelephony =
      intent.specificProductInterests?.includes('P12') ||
      /calling|telephony|sip|call center|ivr/i.test(intent.primaryNeed || '');

    if (needsTelephony && hasGstin && employeeCount >= 3) {
      candidateItems.push({
        productId: 'P12',
        quantity: 1,
        reason: 'Cloud Telephony / SIP Trunk provides multi-channel business voice and IVR for customer communications.'
      });
    }

    // 6. Security Surveillance (Cloud CCTV)
    const needsCctv =
      intent.specificProductInterests?.includes('P23') ||
      /cctv|camera|surveillance/i.test(intent.primaryNeed || '') ||
      segment === Segment.MICRO_RETAIL;

    if (needsCctv) {
      candidateItems.push({
        productId: 'P23',
        quantity: 1,
        reason: 'Cloud CCTV provides AI-enabled HD security monitoring with cloud storage for physical premises.'
      });
    }

    // 7. Validate bundle through CatalogService to ensure 100% compliance with prerequisites and constraints
    const bundleItems: BundleItemDto[] = candidateItems.map((c) => ({
      productId: c.productId,
      quantity: c.quantity
    }));

    const validation = await this.catalogService.validateBundle(
      {
        businessId,
        segment,
        cityTier,
        employeeCount,
        numSites,
        hasGstin
      },
      bundleItems
    );

    // Filter candidate items to only eligible products
    const eligibleItemMap = new Map<string, typeof candidateItems[0]>();
    for (const item of candidateItems) {
      if (validation.eligibleProducts.includes(item.productId)) {
        eligibleItemMap.set(item.productId, item);
      }
    }

    const finalBundleItems: BundleItemDto[] = Array.from(eligibleItemMap.values()).map((c) => ({
      productId: c.productId,
      quantity: c.quantity
    }));

    // 8. Generate transparent indicative Quote using existing QuoteModule
    const quote = await this.quoteService.calculateQuote({
      businessId,
      businessProfile: {
        segment,
        cityTier,
        employeeCount,
        numSites,
        hasGstin
      },
      items: finalBundleItems,
      contractMonths: 12,
      discountPercent: 0,
      taxPercent: 0,
      save: !!businessId
    });

    const recommendations: ProductRecommendationDto[] = [];
    for (const item of quote.items) {
      const candidate = eligibleItemMap.get(item.productId);
      recommendations.push({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        reason: candidate?.reason || `Enterprise solution for ${item.productName}.`,
        indicativeMonthlyInr: item.totalMonthlyInr,
        oneTimeSetupInr: item.totalSetupInr
      });
    }

    const summary = `Based on your ${intent.businessName || 'business'} profile in ${intent.city || 'your city'} (${employeeCount} employees, ${numSites} location${numSites > 1 ? 's' : ''}), we have assembled an optimized enterprise telecom package with an installation SLA of ${quote.installationSlaDays} business days.`;

    return {
      summary,
      items: recommendations,
      quote,
      installationSlaDays: quote.installationSlaDays
    };
  }
}
