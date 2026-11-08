import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UsePipes,
  ValidationPipe
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  ProductCategory,
  Segment,
  LeadProfileDto,
  BundleItemDto,
  BundleValidationResult,
  ProductDto
} from '@udyamone/shared-types';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('products')
  async listProducts(
    @Query('category') category?: ProductCategory,
    @Query('cityTier') cityTierStr?: string,
    @Query('segment') segment?: Segment,
    @Query('isActive') isActiveStr?: string
  ): Promise<ProductDto[]> {
    const cityTier = cityTierStr ? parseInt(cityTierStr, 10) : undefined;
    const isActive = isActiveStr !== undefined ? isActiveStr === 'true' : undefined;

    return this.catalogService.getAllProducts({
      category,
      cityTier,
      segment,
      isActive
    });
  }

  @Get('products/:id')
  async getProduct(@Param('id') id: string): Promise<ProductDto> {
    return this.catalogService.getProductById(id);
  }

  @Post('validate-bundle')
  async validateBundle(
    @Body()
    body: {
      profile?: LeadProfileDto;
      items: BundleItemDto[];
    }
  ): Promise<BundleValidationResult> {
    return this.catalogService.validateBundle(body.profile, body.items);
  }
}
