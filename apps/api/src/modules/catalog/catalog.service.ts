import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProductDto,
  ProductCategory,
  Segment,
  LeadProfileDto,
  BundleItemDto,
  BundleValidationError,
  BundleValidationResult
} from '@udyamone/shared-types';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch all catalogue products with their normalized relationships.
   */
  async getAllProducts(filters?: {
    category?: ProductCategory;
    cityTier?: number;
    segment?: Segment;
    isActive?: boolean;
  }): Promise<ProductDto[]> {
    const whereClause: any = {};

    if (filters?.category) {
      whereClause.category = filters.category;
    }
    if (filters?.isActive !== undefined) {
      whereClause.isActive = filters.isActive;
    }

    const products = await this.prisma.product.findMany({
      where: whereClause,
      include: {
        availableCityTiers: true,
        targetSegments: true,
        prerequisites: true
      },
      orderBy: { id: 'asc' }
    });

    // Map into shared DTOs
    const mapped: ProductDto[] = products.map((p) => ({
      id: p.id,
      category: p.category as ProductCategory,
      productName: p.productName,
      description: p.description,
      unit: p.unit,
      priceMinInr: Number(p.priceMinInr),
      priceMaxInr: Number(p.priceMaxInr),
      oneTimeSetupInr: Number(p.oneTimeSetupInr),
      minContractMonths: p.minContractMonths,
      minEmployees: p.minEmployees,
      minSites: p.minSites,
      requiresGstin: p.requiresGstin,
      typicalInstallDays: p.typicalInstallDays,
      isActive: p.isActive,
      availableCityTiers: p.availableCityTiers.map((t) => t.cityTier),
      targetSegments: p.targetSegments.map((s) => s.segment as Segment),
      prerequisites: p.prerequisites.map((req) => req.prerequisiteProductId)
    }));

    // In-memory filter for relational fields if provided
    let result = mapped;
    if (filters?.cityTier) {
      result = result.filter((p) => p.availableCityTiers.includes(filters.cityTier!));
    }
    if (filters?.segment) {
      result = result.filter((p) => p.targetSegments.includes(filters.segment!));
    }

    return result;
  }

  /**
   * Fetch a single product by ID.
   */
  async getProductById(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        availableCityTiers: true,
        targetSegments: true,
        prerequisites: true
      }
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found in catalogue`);
    }

    return {
      id: product.id,
      category: product.category as ProductCategory,
      productName: product.productName,
      description: product.description,
      unit: product.unit,
      priceMinInr: Number(product.priceMinInr),
      priceMaxInr: Number(product.priceMaxInr),
      oneTimeSetupInr: Number(product.oneTimeSetupInr),
      minContractMonths: product.minContractMonths,
      minEmployees: product.minEmployees,
      minSites: product.minSites,
      requiresGstin: product.requiresGstin,
      typicalInstallDays: product.typicalInstallDays,
      isActive: product.isActive,
      availableCityTiers: product.availableCityTiers.map((t) => t.cityTier),
      targetSegments: product.targetSegments.map((s) => s.segment as Segment),
      prerequisites: product.prerequisites.map((req) => req.prerequisiteProductId)
    };
  }

  /**
   * Validates bundle eligibility, city tiers, GSTIN requirements, headcount, site minimums,
   * and recursive prerequisite chains.
   */
  async validateBundle(
    leadProfile: LeadProfileDto = {},
    items: BundleItemDto[] = []
  ): Promise<BundleValidationResult> {
    const errors: BundleValidationError[] = [];
    const warnings: string[] = [];

    if (!items || items.length === 0) {
      return {
        valid: false,
        errors: [
          {
            productId: 'NONE',
            code: 'INVALID_QUANTITY',
            message: 'Bundle must contain at least one product item.'
          }
        ],
        warnings: [],
        eligibleProducts: [],
        installationSlaDays: 0
      };
    }

    // 1. Fetch all products in the catalogue with their relations
    const allProducts = await this.prisma.product.findMany({
      include: {
        availableCityTiers: true,
        targetSegments: true,
        prerequisites: true
      }
    });

    const productMap = new Map<string, typeof allProducts[0]>();
    for (const prod of allProducts) {
      productMap.set(prod.id, prod);
    }

    const selectedProductIds = new Set<string>();
    const availableProductIds = new Set<string>(leadProfile.existingProductIds || []);

    // 2. Initial item inspection
    for (const item of items) {
      if (!item.quantity || item.quantity < 1) {
        errors.push({
          productId: item.productId,
          code: 'INVALID_QUANTITY',
          message: `Quantity for product '${item.productId}' must be at least 1 (received ${item.quantity}).`
        });
      }

      const product = productMap.get(item.productId);
      if (!product) {
        errors.push({
          productId: item.productId,
          code: 'PRODUCT_NOT_FOUND',
          message: `Product '${item.productId}' does not exist in the official catalogue.`
        });
        continue;
      }

      if (!product.isActive) {
        errors.push({
          productId: item.productId,
          code: 'PRODUCT_INACTIVE',
          message: `Product '${product.productName}' (${product.id}) is discontinued or inactive.`
        });
      }

      selectedProductIds.add(item.productId);
      availableProductIds.add(item.productId);
    }

    // 3. Eligibility rules for each valid selected product
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) continue;

      // Rule A: City Tier Check
      if (leadProfile.cityTier !== undefined) {
        const allowedTiers = product.availableCityTiers.map((t) => t.cityTier);
        if (!allowedTiers.includes(leadProfile.cityTier)) {
          errors.push({
            productId: product.id,
            code: 'CITY_TIER_INCOMPATIBLE',
            message: `Product '${product.productName}' (${product.id}) is only available in City Tier ${allowedTiers.join(', ')}, but customer is located in Tier ${leadProfile.cityTier}.`,
            details: { allowedTiers, currentTier: leadProfile.cityTier }
          });
        }
      }

      // Rule B: GSTIN Requirement Check
      if (product.requiresGstin) {
        if (!leadProfile.hasGstin) {
          errors.push({
            productId: product.id,
            code: 'GSTIN_REQUIRED',
            message: `Product '${product.productName}' (${product.id}) requires a registered GSTIN for enterprise tax invoicing. Customer has no verified GSTIN.`,
            details: { requiresGstin: true }
          });
        }
      }

      // Rule C: Minimum Employees Headcount
      if (leadProfile.employeeCount !== undefined && leadProfile.employeeCount < product.minEmployees) {
        errors.push({
          productId: product.id,
          code: 'INSUFFICIENT_EMPLOYEES',
          message: `Product '${product.productName}' (${product.id}) requires at least ${product.minEmployees} employees, but customer profile indicates ${leadProfile.employeeCount}.`,
          details: { minEmployees: product.minEmployees, currentEmployees: leadProfile.employeeCount }
        });
      }

      // Rule D: Minimum Sites
      if (leadProfile.numSites !== undefined && leadProfile.numSites < product.minSites) {
        errors.push({
          productId: product.id,
          code: 'INSUFFICIENT_SITES',
          message: `Product '${product.productName}' (${product.id}) requires a minimum of ${product.minSites} sites for deployment, but customer profile indicates ${leadProfile.numSites}.`,
          details: { minSites: product.minSites, currentSites: leadProfile.numSites }
        });
      }

      // Rule E: Target Segment Advisory Warning
      if (leadProfile.segment) {
        const segments = product.targetSegments.map((s) => s.segment);
        if (!segments.includes(leadProfile.segment as any)) {
          warnings.push(
            `Product '${product.productName}' (${product.id}) is typically designed for segments [${segments.join(', ')}], while customer is classified as '${leadProfile.segment}'.`
          );
        }
      }
    }

    // 4. Recursive Prerequisite Check
    // For every product with prerequisites, at least one prerequisite must be present
    // in `availableProductIds`. If found, recursively ensure the prerequisite itself
    // has all its dependencies satisfied.
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || product.prerequisites.length === 0) continue;

      const visitedInChain = new Set<string>();
      const prereqCheckResult = this.validatePrerequisiteRecursive(
        product.id,
        availableProductIds,
        productMap,
        visitedInChain
      );

      if (!prereqCheckResult.satisfied) {
        errors.push({
          productId: product.id,
          code: 'PREREQUISITE_MISSING',
          message: prereqCheckResult.message,
          details: {
            requiredAnyOf: prereqCheckResult.requiredAnyOf,
            missingFor: prereqCheckResult.failedProduct
          }
        });
      }
    }

    // 5. Calculate Order Installation SLA
    // Rule: Order SLA = max(typicalInstallDays across all products in bundle)
    let maxInstallDays = 0;
    for (const item of items) {
      const prod = productMap.get(item.productId);
      if (prod && prod.typicalInstallDays > maxInstallDays) {
        maxInstallDays = prod.typicalInstallDays;
      }
    }

    const eligibleProducts = Array.from(selectedProductIds).filter((id) =>
      !errors.some((e) => e.productId === id)
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      eligibleProducts,
      installationSlaDays: maxInstallDays
    };
  }

  /**
   * Helper to recursively validate product prerequisites.
   */
  private validatePrerequisiteRecursive(
    productId: string,
    availableProductIds: Set<string>,
    productMap: Map<string, any>,
    visited: Set<string>
  ): { satisfied: boolean; message: string; requiredAnyOf: string[]; failedProduct: string } {
    if (visited.has(productId)) {
      // Circular reference guard
      return { satisfied: true, message: '', requiredAnyOf: [], failedProduct: '' };
    }
    visited.add(productId);

    const product = productMap.get(productId);
    if (!product || product.prerequisites.length === 0) {
      return { satisfied: true, message: '', requiredAnyOf: [], failedProduct: '' };
    }

    const requiredPrereqIds: string[] = product.prerequisites.map((p: any) => p.prerequisiteProductId);

    // Rule: Product requires AT LEAST ONE of its prerequisite products
    const satisfyingPrereqs = requiredPrereqIds.filter((pId) => availableProductIds.has(pId));

    if (satisfyingPrereqs.length === 0) {
      const prereqNames = requiredPrereqIds
        .map((pId) => {
          const p = productMap.get(pId);
          return p ? `${p.productName} (${p.id})` : pId;
        })
        .join(', ');

      return {
        satisfied: false,
        message: `Product '${product.productName}' (${product.id}) requires at least one of the following base connectivity products: [${prereqNames}]. None were found in your bundle or active services.`,
        requiredAnyOf: requiredPrereqIds,
        failedProduct: product.id
      };
    }

    // Recursively check each satisfying prerequisite
    for (const prereqId of satisfyingPrereqs) {
      const nextCheck = this.validatePrerequisiteRecursive(
        prereqId,
        availableProductIds,
        productMap,
        new Set(visited)
      );
      if (!nextCheck.satisfied) {
        return nextCheck;
      }
    }

    return { satisfied: true, message: '', requiredAnyOf: [], failedProduct: '' };
  }
}
