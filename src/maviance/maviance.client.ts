import {
  Injectable,
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
} from '@nestjs/common';
import { MavianceAuthService } from './maviance-auth.service';

@Injectable()
export class MavianceClient {
  private readonly logger = new Logger(MavianceClient.name);

  constructor(private readonly authService: MavianceAuthService) {}

  private getBaseUrl(): string {
    const configuredUrl = (
      process.env.MAVIANCE_BASE_URL ||
      'https://s3p.smobilpay.staging.maviance.info/v2'
    ).replace(/\/+$/, '');

    if (configuredUrl === 'https://s3p.sandbox.smobilpay.com/v3') {
      return 'https://s3p.smobilpay.staging.maviance.info/v2';
    }

    return configuredUrl;
  }

  private getPublicToken(): string {
    return process.env.MAVIANCE_PUBLIC_TOKEN || '';
  }

  private getAccessSecret(): string {
    return process.env.MAVIANCE_ACCESS_SECRET || '';
  }

  private getTimeoutMs(): number {
    const seconds = Number(process.env.MAVIANCE_HTTP_TIMEOUT || 30);
    return seconds > 0 ? seconds * 1000 : 30000;
  }

  /**
   * Executes a signed HTTP request to the Maviance S3P API.
   * 
   * @param method HTTP Method (GET, POST)
   * @param path The endpoint path (e.g. '/service', '/quotestd', '/collectstd', '/verifytx')
   * @param params Query params (for GET) or Body params (for POST)
   */
  async request<T>(method: 'GET' | 'POST', path: string, params: Record<string, any> = {}): Promise<T> {
    const token = this.getPublicToken();
    const secret = this.getAccessSecret();

    if (!token || !secret) {
      throw new BadGatewayException('Configuration Maviance incomplète (MAVIANCE_PUBLIC_TOKEN ou MAVIANCE_ACCESS_SECRET manquant)');
    }

    const cleanPath = '/' + path.replace(/^\/+/, '');
    const baseUrl = this.getBaseUrl();
    const fullUrl = `${baseUrl}${cleanPath}`;

    // For S3P Authorization:
    // GET parameters come from query string.
    // POST parameters come from request body.
    let requestUrl = fullUrl;
    let fetchOptions: RequestInit = {
      method,
      headers: {
        'Accept': 'application/json',
      },
    };

    const authHeader = this.authService.generateAuthorizationHeader(
      method,
      fullUrl,
      params,
      token,
      secret,
    );
    fetchOptions.headers!['Authorization'] = authHeader;

    if (method === 'GET') {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
      const queryString = queryParams.toString();
      if (queryString) {
        requestUrl = `${fullUrl}?${queryString}`;
      }
    } else {
      // POST request
      fetchOptions.headers!['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(params);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(requestUrl, fetchOptions);
      clearTimeout(timeout);

      const responseText = await response.text();
      let responseData: any = {};
      try {
        if (responseText) {
          responseData = JSON.parse(responseText);
        }
      } catch (err) {
        throw new BadGatewayException(`Réponse de Maviance non JSON: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        // Maviance API errors typically contain a 'code' and 'message' in JSON
        const errorCode =
          responseData?.respCode ??
          responseData?.code ??
          responseData?.errorCode ??
          response.status;
        const errorMessage =
          responseData?.usrMsg ||
          responseData?.message ||
          responseData?.errorMessage ||
          responseData?.devMsg ||
          `Erreur HTTP ${response.status}`;

        this.logger.error(
          `Maviance HTTP error: ${JSON.stringify({
            method,
            url: requestUrl,
            httpStatus: response.status,
            code: errorCode,
            message: errorMessage,
            devMsg: responseData?.devMsg,
            usrMsg: responseData?.usrMsg,
            respCode: responseData?.respCode,
            raw: responseData,
            params: this.maskLogParams(params),
          })}`,
        );

        throw new BadGatewayException({
          message: `Maviance API Error: ${errorMessage}`,
          code: errorCode,
          raw: responseData,
        });
      }

      return responseData as T;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new GatewayTimeoutException(`Le service Maviance a expiré après ${this.getTimeoutMs()}ms`);
      }
      if (error instanceof BadGatewayException) {
        throw error;
      }
      const cause = error?.cause;
      const details = [error?.message, cause?.code, cause?.message]
        .filter(Boolean)
        .join(' - ');
      this.logger.error(
        `Maviance connection error: ${JSON.stringify({
          method,
          url: requestUrl,
          details: details || String(error),
          causeCode: cause?.code,
          causeMessage: cause?.message,
          params: this.maskLogParams(params),
        })}`,
      );
      throw new BadGatewayException(
        `Echec de la connexion a Maviance (${baseUrl}): ${details || error}`,
      );
    }
  }

  private maskLogParams(params: Record<string, any>) {
    const masked = { ...params };
    for (const key of Object.keys(masked)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('phone') ||
        normalizedKey.includes('email') ||
        normalizedKey.includes('name') ||
        normalizedKey.includes('address') ||
        normalizedKey.includes('customer') ||
        normalizedKey.includes('service')
      ) {
        masked[key] = '*****';
      }
    }
    return masked;
  }
}
