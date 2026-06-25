import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Notification } from '../entities/notification.entity';

export type NotificationPayload = {
  idnotification?: number;
  idclient?: number;
  titre: string;
  message: string;
  type?: string;
  date_creation?: Date | string;
};

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: process.env.ADMIN_APP_ORIGIN ?? process.env.FRONTEND_URL ?? '*',
    credentials: true,
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  private readonly server: Server;

  emitNotification(notification: Notification | NotificationPayload) {
    const payload = this.toPayload(notification);
    this.server.emit('notification:new', payload);
    if (payload.idclient) {
      this.server
        .to(`client:${payload.idclient}`)
        .emit('notification:new', payload);
    }
  }

  @SubscribeMessage('client:join')
  joinClientRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { idclient?: number },
  ) {
    if (body?.idclient) {
      client.join(`client:${body.idclient}`);
    }

    return {
      ok: true,
      room: body?.idclient ? `client:${body.idclient}` : null,
    };
  }

  private toPayload(
    notification: Notification | NotificationPayload,
  ): NotificationPayload {
    return {
      idnotification: notification.idnotification,
      idclient: notification.idclient,
      titre: notification.titre,
      message: notification.message,
      type: notification.type,
      date_creation: notification.date_creation,
    };
  }
}
