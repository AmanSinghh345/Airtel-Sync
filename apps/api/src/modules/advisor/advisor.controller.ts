import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { AdvisorService } from './advisor.service';
import {
  AdvisorTurnRequestDto,
  AdvisorTurnResponseDto,
  ConversationSessionDto
} from '@udyamone/shared-types';

@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisorService: AdvisorService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async handleChatTurn(
    @Body() dto: AdvisorTurnRequestDto
  ): Promise<AdvisorTurnResponseDto> {
    return this.advisorService.handleTurn(dto);
  }

  @Get('session/:sessionToken')
  async getSession(
    @Param('sessionToken') sessionToken: string
  ): Promise<ConversationSessionDto> {
    return this.advisorService.getSession(sessionToken);
  }
}
