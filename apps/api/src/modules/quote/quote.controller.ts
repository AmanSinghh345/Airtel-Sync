import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { QuoteService } from './quote.service';
import { CalculateQuoteRequestDto, QuoteBreakdownDto } from '@udyamone/shared-types';

@Controller('quote')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  async calculateQuote(
    @Body() dto: CalculateQuoteRequestDto
  ): Promise<QuoteBreakdownDto> {
    return this.quoteService.calculateQuote(dto);
  }

  @Get(':quoteNumber')
  async getQuote(
    @Param('quoteNumber') quoteNumber: string
  ): Promise<QuoteBreakdownDto> {
    return this.quoteService.getQuoteByNumber(quoteNumber);
  }
}
