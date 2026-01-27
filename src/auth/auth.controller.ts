import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user?: any;
}
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  async login(@Body() dto: LoginDto) {
    console.log('Login attempt for email:', dto.email);
    return await this.authService.authenticate(dto.email, dto.mot_de_passe);
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/profile')
  profile(@Request() req: RequestWithUser) {
    return req.user;
  }
}
