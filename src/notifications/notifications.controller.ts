import {
  Controller,
  Body,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { idclient?: number } },
  ) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.markAsRead(idclient, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  markAllAsRead(@Req() req: { user?: { idclient?: number } }) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.markAllAsRead(idclient);
  }

  @UseGuards(JwtAuthGuard)
  @Post('broadcast')
  broadcast(
    @Body()
    body: {
      titre: string;
      message: string;
      type?: string;
      idclient?: number;
    },
  ) {
    return this.service.broadcast(body);
  }
}
