import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

type AuthenticatedRequest = {
  user?: {
    accountType?: string;
    roles?: unknown[];
  };
};

@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const roles = (user?.roles || [])
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.toUpperCase());
    if (user?.accountType !== 'admin' && !roles.includes('ADMIN')) {
      throw new ForbiddenException('Acces reserve aux administrateurs');
    }
    return true;
  }
}
