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
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface RequestWithUser extends ExpressRequest {
  user?: any;
}
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/login')
  async loginClient(@Body() dto: LoginDto) {
    return this.authService.authenticateClient(dto.email, dto.mot_de_passe);
  }

  @Post('auth/admin/login')
  async loginAdmin(@Body() dto: AdminLoginDto) {
    return this.authService.authenticateAdmin(dto.login, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  me(@Request() req: RequestWithUser) {
    const user = req.user || {};

    if (user.accountType === 'admin') {
      return {
        id: user.iduser ?? user.sub,
        email: user.email ?? null,
        firstName: user.prenom ?? null,
        lastName: user.nom ?? null,
        login: user.login ?? null,
        accountType: 'admin',
        roles: Array.isArray(user.roles) ? user.roles : ['ADMIN'],
      };
    }

    return {
      id: user.idclient ?? user.sub,
      email: user.email ?? null,
      firstName: null,
      lastName: null,
      accountType: 'client',
      roles: Array.isArray(user.roles) ? user.roles : ['CLIENT'],
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/profile')
  profile(@Request() req: RequestWithUser) {
    return this.me(req);
  }
}
