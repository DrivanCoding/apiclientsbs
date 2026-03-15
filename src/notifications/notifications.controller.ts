import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findForCurrentClient(@Req() req: { user?: { idclient?: number } }) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.findByClient(idclient);
  }
}
