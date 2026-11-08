import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  StaffLoginRequestDto,
  StaffLoginResponseDto,
  StaffJwtPayload
} from '@udyamone/shared-types';
import { DEMO_STAFF_USERS } from './auth.constants';

@Controller('auth/staff')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: StaffLoginRequestDto): Promise<StaffLoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: StaffJwtPayload) {
    return { user };
  }

  @Get('demo-accounts')
  getDemoAccounts() {
    return {
      message: 'Demo staff accounts for evaluation and testing. Passwords configured per challenge security requirements.',
      accounts: DEMO_STAFF_USERS.map((u) => ({
        email: u.email,
        fullName: u.fullName,
        role: u.role
      }))
    };
  }
}
