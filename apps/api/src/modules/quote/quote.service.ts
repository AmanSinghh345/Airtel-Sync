import {
  Injectable,
  BadRequestException,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import {
  CalculateQuoteRequestDto,
  QuoteBreakdownDto,
  QuoteItemCalculation,
  ProductCategory
} from '@udyamone/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService
  ) {}

  /**
   * Generates a deterministic, transparent quote breakdown using Decimal arithmetic.
   * Optionally persists the quote if save=true or a valid businessId is provided.
   */
  async calculateQuote(dto: CalculateQuoteRequestDto): Promise<QuoteBreakdownDto> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one product item is required to generate a quote.');
    }

    // 1. If businessId is provided, load the profile from the database if not explicitly passed
    let effectiveProfile = dto.businessProfile || {};
    let existingBusiness: any = null;

    if (dto.businessId) {
      existingBusiness = await this.prisma.business.findUnique({
        where: { id: dto.businessId }
      });

      if (!existingBusiness) {
        throw new NotFoundException(`Business with ID '${dto.businessId}' was not found.`);
      }

      // Merge database profile with any caller overrides
      effectiveProfile = {
        businessId: existingBusiness.id,
        segment: effectiveProfile.segment || existingBusiness.segment,
        cityTier: effectiveProfile.cityTier ?? existingBusiness.cityTier,
        employeeCount: effectiveProfile.employeeCount ?? existingBusiness.employeeCount,
        numSites: effectiveProfile.numSites ?? existingBusiness.numSites,
        hasGstin: effectiveProfile.hasGstin ?? existingBusiness.hasGstin,
        existingProductIds: effectiveProfile.existingProductIds || []
      };
    }

    // 2. Validate bundle eligibility and recursive prerequisites
    const validation = await this.catalogService.validateBundle(effectiveProfile, dto.items);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Selected bundle is ineligible or has missing dependencies.',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // 3. Fetch products from database
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 4. Strict Decimal calculation
    let subtotalMonthly = new Prisma.Decimal(0);
    let subtotalSetup = new Prisma.Decimal(0);
    const calculatedItems: QuoteItemCalculation[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found.`);
      }

      const qty = new Prisma.Decimal(item.quantity);
      if (qty.lessThanOrEqualTo(0)) {
        throw new BadRequestException(`Quantity for product ${item.productId} must be positive.`);
      }

      // Determine unit price within allowed range [priceMinInr, priceMaxInr]
      let unitPrice: Prisma.Decimal;
      if (item.configuredUnitPriceInr !== undefined && item.configuredUnitPriceInr !== null) {
        const configured = new Prisma.Decimal(item.configuredUnitPriceInr);
        if (configured.lessThan(product.priceMinInr) || configured.greaterThan(product.priceMaxInr)) {
          throw new BadRequestException(
            `Configured price ₹${configured.toFixed(2)} for '${product.productName}' (${product.id}) is outside the catalogue range [₹${product.priceMinInr.toFixed(2)}, ₹${product.priceMaxInr.toFixed(2)}].`
          );
        }
        unitPrice = configured;
      } else {
        // Indicative baseline defaults to priceMinInr
        unitPrice = product.priceMinInr;
      }

      const unitSetup = product.oneTimeSetupInr;
      const lineMonthly = unitPrice.mul(qty);
      const lineSetup = unitSetup.mul(qty);

      subtotalMonthly = subtotalMonthly.add(lineMonthly);
      subtotalSetup = subtotalSetup.add(lineSetup);

      calculatedItems.push({
        productId: product.id,
        productName: product.productName,
        category: product.category as ProductCategory,
        unit: product.unit,
        quantity: item.quantity,
        unitPriceInr: Number(unitPrice),
        unitSetupInr: Number(unitSetup),
        totalMonthlyInr: Number(lineMonthly),
        totalSetupInr: Number(lineSetup),
        rangeMinMonthlyInr: Number(product.priceMinInr.mul(qty)),
        rangeMaxMonthlyInr: Number(product.priceMaxInr.mul(qty))
      });
    }

    // 5. Configurable discounts (Default 0%; do not invent arbitrary rules)
    const discountPercent = new Prisma.Decimal(dto.discountPercent || 0);
    if (discountPercent.lessThan(0) || discountPercent.greaterThan(100)) {
      throw new BadRequestException('Discount percent must be between 0 and 100.');
    }
    const discountAmountMonthly = subtotalMonthly.mul(discountPercent).div(100);
    const netMonthly = subtotalMonthly.sub(discountAmountMonthly);

    // 6. Configurable tax / GST (Default 0%; do not invent arbitrary tax)
    const taxPercent = new Prisma.Decimal(dto.taxPercent || 0);
    if (taxPercent.lessThan(0) || taxPercent.greaterThan(100)) {
      throw new BadRequestException('Tax percent must be between 0 and 100.');
    }
    const taxAmountMonthly = netMonthly.mul(taxPercent).div(100);
    const totalMonthlyRecurring = netMonthly.add(taxAmountMonthly);

    const taxAmountSetup = subtotalSetup.mul(taxPercent).div(100);
    const totalOneTimeSetup = subtotalSetup.add(taxAmountSetup);

    const contractMonths = dto.contractMonths || 12;
    const contractMonthsDec = new Prisma.Decimal(contractMonths);
    const totalIndicativeFirstYear = totalMonthlyRecurring.mul(contractMonthsDec).add(totalOneTimeSetup);

    // 7. Transparent commercial notes
    const notes: string[] = [
      'Indicative pricing based on standard Accel Telecom 2026 enterprise rate card.',
      'One-time setup fees include initial CPE provisioning and standard physical installation.',
      `Calculated Order SLA: ${validation.installationSlaDays} business days based on deployment requirements.`
    ];

    if (discountPercent.greaterThan(0)) {
      notes.push(`Contract discount of ${discountPercent.toFixed(1)}% applied to monthly recurring charges.`);
    }

    if (taxPercent.greaterThan(0)) {
      notes.push(`Applicable GST of ${taxPercent.toFixed(1)}% applied to recurring and setup fees.`);
    } else {
      notes.push('Taxes (GST) are excluded and will be assessed at statutory rates upon formal billing.');
    }

    // 30 days quote validity
    const validUntilDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const generatedQuoteNumber = this.generateQuoteNumber();

    // 8. Persist if requested and businessId is present
    if (dto.save && dto.businessId) {
      await this.prisma.$transaction(async (tx) => {
        const createdQuote = await tx.quote.create({
          data: {
            quoteNumber: generatedQuoteNumber,
            businessId: dto.businessId!,
            status: 'PRESENTED',
            contractMonths,
            monthlyRecurringInr: totalMonthlyRecurring,
            oneTimeSetupInr: totalOneTimeSetup,
            isIndicative: true,
            validUntil: validUntilDate
          }
        });

        for (const item of calculatedItems) {
          await tx.quoteItem.create({
            data: {
              quoteId: createdQuote.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPriceInr: new Prisma.Decimal(item.unitPriceInr),
              unitSetupInr: new Prisma.Decimal(item.unitSetupInr),
              totalPriceInr: new Prisma.Decimal(item.totalMonthlyInr).add(new Prisma.Decimal(item.totalSetupInr))
            }
          });
        }
      });
    }

    return {
      quoteNumber: generatedQuoteNumber,
      businessId: dto.businessId,
      contractMonths,
      items: calculatedItems,
      subtotalMonthlyInr: Number(subtotalMonthly),
      discountPercent: Number(discountPercent),
      discountAmountMonthlyInr: Number(discountAmountMonthly),
      netMonthlyInr: Number(netMonthly),
      taxPercent: Number(taxPercent),
      taxAmountMonthlyInr: Number(taxAmountMonthly),
      totalMonthlyRecurringInr: Number(totalMonthlyRecurring),
      subtotalSetupInr: Number(subtotalSetup),
      taxAmountSetupInr: Number(taxAmountSetup),
      totalOneTimeSetupInr: Number(totalOneTimeSetup),
      totalIndicativeFirstYearInr: Number(totalIndicativeFirstYear),
      isIndicative: true,
      validUntil: validUntilDate.toISOString(),
      installationSlaDays: validation.installationSlaDays,
      notes
    };
  }

  /**
   * Fetch a saved quote by quoteNumber with full item breakdown.
   */
  async getQuoteByNumber(quoteNumber: string): Promise<QuoteBreakdownDto> {
    const quote = await this.prisma.quote.findUnique({
      where: { quoteNumber },
      include: {
        items: {
          include: {
            product: true
          }
        },
        business: true
      }
    });

    if (!quote) {
      throw new NotFoundException(`Quote '${quoteNumber}' was not found.`);
    }

    const items: QuoteItemCalculation[] = quote.items.map((i) => ({
      productId: i.productId,
      productName: i.product.productName,
      category: i.product.category as ProductCategory,
      unit: i.product.unit,
      quantity: i.quantity,
      unitPriceInr: Number(i.unitPriceInr),
      unitSetupInr: Number(i.unitSetupInr),
      totalMonthlyInr: Number(i.unitPriceInr.mul(i.quantity)),
      totalSetupInr: Number(i.unitSetupInr.mul(i.quantity)),
      rangeMinMonthlyInr: Number(i.product.priceMinInr.mul(i.quantity)),
      rangeMaxMonthlyInr: Number(i.product.priceMaxInr.mul(i.quantity))
    }));

    const maxInstallDays = Math.max(...quote.items.map((i) => i.product.typicalInstallDays), 5);

    const subtotalMonthly = items.reduce((acc, curr) => acc + curr.totalMonthlyInr, 0);
    const subtotalSetup = items.reduce((acc, curr) => acc + curr.totalSetupInr, 0);

    return {
      quoteNumber: quote.quoteNumber,
      businessId: quote.businessId,
      contractMonths: quote.contractMonths,
      items,
      subtotalMonthlyInr: subtotalMonthly,
      discountPercent: 0,
      discountAmountMonthlyInr: 0,
      netMonthlyInr: subtotalMonthly,
      taxPercent: 0,
      taxAmountMonthlyInr: 0,
      totalMonthlyRecurringInr: Number(quote.monthlyRecurringInr),
      subtotalSetupInr: subtotalSetup,
      taxAmountSetupInr: 0,
      totalOneTimeSetupInr: Number(quote.oneTimeSetupInr),
      totalIndicativeFirstYearInr:
        Number(quote.monthlyRecurringInr) * quote.contractMonths + Number(quote.oneTimeSetupInr),
      isIndicative: quote.isIndicative,
      validUntil: quote.validUntil.toISOString(),
      installationSlaDays: maxInstallDays,
      notes: [
        `Quote record retrieved for ${quote.business.tradeName || quote.business.legalName}.`,
        'All prices indicative subject to site readiness survey.'
      ]
    };
  }

  /**
   * Generates a unique, non-sequential quote number (e.g. QUO-2026-A8F3D).
   */
  private generateQuoteNumber(): string {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `QUO-2026-${randomSuffix}`;
  }
}
