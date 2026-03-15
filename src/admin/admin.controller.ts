import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { CreateAdminAgenceDto } from './dto/create-admin-agence.dto';
import { CreateAgenceCompteDto } from './dto/create-agence-compte.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  findUsers() {
    return this.adminService.findUsers();
  }

  @Post('users')
  createUser(@Body() dto: CreateAdminUserDto) {
    return this.adminService.createUser(dto);
  }

  @Get('agences')
  findAgences() {
    return this.adminService.findAgences();
  }

  @Post('agences')
  createAgence(@Body() dto: CreateAdminAgenceDto) {
    return this.adminService.createAgence(dto);
  }

  @Get('agences/:idag/comptes')
  findComptesByAgence(@Param('idag', ParseIntPipe) idag: number) {
    return this.adminService.findComptesByAgence(idag);
  }

  @Post('agences/:idag/comptes')
  createCompteForAgence(
    @Param('idag', ParseIntPipe) idag: number,
    @Body() dto: CreateAgenceCompteDto,
  ) {
    return this.adminService.createCompteForAgence(idag, dto);
  }
}
