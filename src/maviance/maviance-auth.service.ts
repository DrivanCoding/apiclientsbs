import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class MavianceAuthService {
  /**
   * Generates the complete S3P Authorization header value for a request.
   * 
   * @param method The HTTP method (GET, POST, etc.)
   * @param url The fully qualified URL of the endpoint (without query string)
   * @param requestParams The parameters sent in the body (POST) or query string (GET)
   * @param token The public access token
   * @param secret The access secret
   */
  generateAuthorizationHeader(
    method: string,
    url: string,
    requestParams: Record<string, any>,
    token: string,
    secret: string,
  ): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // 1. Prepare and merge all parameters for signature calculation
    const signParams: Record<string, string> = {};

    // Add request parameters (query or body) converted to string
    for (const [key, value] of Object.entries(requestParams)) {
      if (value !== undefined && value !== null) {
        signParams[key] = String(value);
      }
    }

    // Add S3P Auth parameters
    signParams['s3pAuth_nonce'] = nonce;
    signParams['s3pAuth_signature_method'] = 'HMAC-SHA1';
    signParams['s3pAuth_timestamp'] = timestamp;
    signParams['s3pAuth_token'] = token;

    // 2. Sort keys alphabetically
    const sortedKeys = Object.keys(signParams).sort();

    // 3. Construct the parameter string with RFC 3986 encoding
    const paramPairs = sortedKeys.map((key) => {
      const encodedKey = this.rfc3986Encode(key);
      const encodedVal = this.rfc3986Encode(signParams[key]);
      return `${encodedKey}=${encodedVal}`;
    });
    const paramString = paramPairs.join('&');

    // 4. Construct the Signature Base String
    // Format: UPPERCASE_METHOD & ENCODED_URL & ENCODED_PARAM_STRING
    const baseString = [
      method.toUpperCase(),
      this.rfc3986Encode(url),
      this.rfc3986Encode(paramString),
    ].join('&');

    // 5. Calculate HMAC-SHA1 and encode in Base64
    const signature = crypto
      .createHmac('sha1', secret)
      .update(baseString)
      .digest('base64');

    // 6. Build the final Authorization header (keys/values are double-quoted, comma-separated)
    return [
      's3pAuth',
      `s3pAuth_nonce="${nonce}"`,
      `s3pAuth_signature="${signature}"`,
      `s3pAuth_signature_method="HMAC-SHA1"`,
      `s3pAuth_timestamp="${timestamp}"`,
      `s3pAuth_token="${token}"`,
    ].join(',');
  }

  /**
   * Encodes a string according to RFC 3986.
   * Unreserved characters: A-Z a-z 0-9 - _ . ~
   * All other characters must be percent-encoded.
   */
  rfc3986Encode(str: string): string {
    return encodeURIComponent(str).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }
}
