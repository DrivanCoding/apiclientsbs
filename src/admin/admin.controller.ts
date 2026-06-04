import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { CreateAdminAgenceDto } from './dto/create-admin-agence.dto';
import { CreateAgenceCompteDto } from './dto/create-agence-compte.dto';
import { UpdateAgenceCompteDto } from './dto/update-agence-compte.dto';
import { UpdateAdminAgenceDto } from './dto/update-admin-agence.dto';
import { CreateAdminClientDto } from './dto/create-admin-client.dto';
import { UpdateAdminClientDto } from './dto/update-admin-client.dto';
import { CreateAdminTypecompteDto } from './dto/create-admin-typecompte.dto';
import { UpdateAdminTypecompteDto } from './dto/update-admin-typecompte.dto';
import { CreateClientCompteDto } from './dto/create-client-compte.dto';
import { UpdateClientCompteDto } from './dto/update-client-compte.dto';
import { CreateAdminOperatorDto } from './dto/create-admin-operator.dto';
import { UpdateAdminOperatorActivationDto } from './dto/update-admin-operator-activation.dto';
import { CreateAdminAppDto } from './dto/create-admin-app.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard)
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

  @Get('users/:iduser')
  findUserById(@Param('iduser', ParseIntPipe) iduser: number) {
    return this.adminService.findUserById(iduser);
  }

  @Patch('users/:iduser')
  updateUser(
    @Param('iduser', ParseIntPipe) iduser: number,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(iduser, dto);
  }

  @Delete('users/:iduser')
  removeUser(@Param('iduser', ParseIntPipe) iduser: number) {
    return this.adminService.removeUser(iduser);
  }

  @Get('agences')
  findAgences() {
    return this.adminService.findAgences();
  }

  @Get('agences/:idag')
  findAgenceById(@Param('idag', ParseIntPipe) idag: number) {
    return this.adminService.findAgenceById(idag);
  }

  @Post('agences')
  createAgence(@Body() dto: CreateAdminAgenceDto) {
    return this.adminService.createAgence(dto);
  }

  @Patch('agences/:idag')
  updateAgence(
    @Param('idag', ParseIntPipe) idag: number,
    @Body() dto: UpdateAdminAgenceDto,
  ) {
    return this.adminService.updateAgence(idag, dto);
  }

  @Delete('agences/:idag')
  removeAgence(@Param('idag', ParseIntPipe) idag: number) {
    return this.adminService.removeAgence(idag);
  }

  @Get('clients')
  findClients() {
    return this.adminService.findClients();
  }

  @Get('clients/:idclient')
  findClientById(@Param('idclient', ParseIntPipe) idclient: number) {
    return this.adminService.findClientById(idclient);
  }

  @Post('clients')
  createClient(@Body() dto: CreateAdminClientDto) {
    return this.adminService.createClient(dto);
  }

  @Patch('clients/:idclient')
  updateClient(
    @Param('idclient', ParseIntPipe) idclient: number,
    @Body() dto: UpdateAdminClientDto,
  ) {
    return this.adminService.updateClient(idclient, dto);
  }

  @Delete('clients/:idclient')
  removeClient(@Param('idclient', ParseIntPipe) idclient: number) {
    return this.adminService.removeClient(idclient);
  }

  @Get('typecomptes')
  findTypecomptes() {
    return this.adminService.findTypecomptes();
  }

  @Get('preouvertures-tampon')
  findPreouverturesTampon(@Query('status') status?: string) {
    return this.adminService.findPreouverturesTampon(status);
  }

  @Patch('preouvertures-tampon/:id')
  updatePreouvertureTamponStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    payload: { statut_validation?: string; message_validation?: string },
  ) {
    return this.adminService.updatePreouvertureTamponStatus(id, payload);
  }

  @Get('ouvertures-compte-tampon')
  findOuverturesCompteTampon(@Query('status') status?: string) {
    return this.adminService.findOuverturesCompteTampon(status);
  }

  @Patch('ouvertures-compte-tampon/:id')
  updateOuvertureCompteTamponStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    payload: { statut_validation?: string; message_validation?: string },
  ) {
    return this.adminService.updateOuvertureCompteTamponStatus(id, payload);
  }

  @Get('typecomptes/:idtype')
  findTypecompteById(@Param('idtype', ParseIntPipe) idtype: number) {
    return this.adminService.findTypecompteById(idtype);
  }

  @Post('typecomptes')
  createTypecompte(@Body() dto: CreateAdminTypecompteDto) {
    return this.adminService.createTypecompte(dto);
  }

  @Patch('typecomptes/:idtype')
  updateTypecompte(
    @Param('idtype', ParseIntPipe) idtype: number,
    @Body() dto: UpdateAdminTypecompteDto,
  ) {
    return this.adminService.updateTypecompte(idtype, dto);
  }

  @Delete('typecomptes/:idtype')
  removeTypecompte(@Param('idtype', ParseIntPipe) idtype: number) {
    return this.adminService.removeTypecompte(idtype);
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

  @Patch('agences/:idag/comptes/:idcompte')
  updateCompteForAgence(
    @Param('idag', ParseIntPipe) idag: number,
    @Param('idcompte', ParseIntPipe) idcompte: number,
    @Body() dto: UpdateAgenceCompteDto,
  ) {
    return this.adminService.updateCompteForAgence(idag, idcompte, dto);
  }

  @Delete('agences/:idag/comptes/:idcompte')
  removeCompteForAgence(
    @Param('idag', ParseIntPipe) idag: number,
    @Param('idcompte', ParseIntPipe) idcompte: number,
  ) {
    return this.adminService.removeCompteForAgence(idag, idcompte);
  }

  @Get('clients/:idclient/comptes')
  findComptesByClient(@Param('idclient', ParseIntPipe) idclient: number) {
    return this.adminService.findComptesByClient(idclient);
  }

  @Post('clients/:idclient/comptes')
  createCompteForClient(
    @Param('idclient', ParseIntPipe) idclient: number,
    @Body() dto: CreateClientCompteDto,
  ) {
    return this.adminService.createCompteForClient(idclient, dto);
  }

  @Patch('clients/:idclient/comptes/:idcompte')
  updateCompteForClient(
    @Param('idclient', ParseIntPipe) idclient: number,
    @Param('idcompte', ParseIntPipe) idcompte: number,
    @Body() dto: UpdateClientCompteDto,
  ) {
    return this.adminService.updateCompteForClient(idclient, idcompte, dto);
  }

  @Patch('clients/:idclient/comptes/:idcompte/reset-pin')
  resetComptePinForClient(
    @Param('idclient', ParseIntPipe) idclient: number,
    @Param('idcompte', ParseIntPipe) idcompte: number,
  ) {
    return this.adminService.resetComptePinForClient(idclient, idcompte);
  }

  @Delete('clients/:idclient/comptes/:idcompte')
  removeCompteForClient(
    @Param('idclient', ParseIntPipe) idclient: number,
    @Param('idcompte', ParseIntPipe) idcompte: number,
  ) {
    return this.adminService.removeCompteForClient(idclient, idcompte);
  }

  @Get('stats/deposits/clients')
  getDepositStatsByClient(@Query('limit') limit?: string) {
    return this.adminService.getDepositStatsByClient(Number(limit || 10));
  }

  @Get('stats/deposits/operators')
  getDepositStatsByOperator() {
    return this.adminService.getDepositStatsByOperator();
  }

  @Get('settings/operators')
  getSettingsOperators() {
    return this.adminService.getSettingsOperators();
  }

  @Post('settings/operators')
  createSettingsOperator(@Body() dto: CreateAdminOperatorDto) {
    return this.adminService.createSettingsOperator(dto);
  }

  @Patch('settings/operators/:code/activation')
  updateSettingsOperatorActivation(
    @Param('code') code: string,
    @Body() dto: UpdateAdminOperatorActivationDto,
  ) {
    return this.adminService.updateSettingsOperatorActivation(code, dto);
  }

  @Get('settings/apps')
  getSettingsApps() {
    return this.adminService.getSettingsApps();
  }

  @Post('settings/apps')
  createSettingsApp(@Body() dto: CreateAdminAppDto) {
    return this.adminService.createSettingsApp(dto);
  }
}
