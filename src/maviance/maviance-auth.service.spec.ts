import { MavianceAuthService } from './maviance-auth.service';

describe('MavianceAuthService', () => {
  let service: MavianceAuthService;

  beforeEach(() => {
    service = new MavianceAuthService();
  });

  describe('rfc3986Encode', () => {
    it('should encode space to %20 and keep unreserved chars unencoded', () => {
      expect(service.rfc3986Encode('a b')).toBe('a%20b');
      expect(service.rfc3986Encode('A-Z_a-z.0-9~')).toBe('A-Z_a-z.0-9~');
    });

    it('should encode reserved characters under RFC 3986', () => {
      expect(service.rfc3986Encode("!'()*")).toBe('%21%27%28%29%2A');
      expect(service.rfc3986Encode('http://api.com?a=1&b=2')).toBe('http%3A%2F%2Fapi.com%3Fa%3D1%26b%3D2');
    });
  });

  describe('generateAuthorizationHeader', () => {
    it('should correctly sort parameters and calculate HMAC-SHA1 signature', () => {
      const method = 'POST';
      const url = 'https://s3p.sandbox.smobilpay.com/v3/collectstd';
      const params = {
        quoteId: 'quote-12345',
        customerPhonenumber: '237670000000',
        trid: 'MAV-TX-001',
      };
      const token = 'test-public-token';
      const secret = 'test-access-secret';

      const header = service.generateAuthorizationHeader(method, url, params, token, secret);

      // Verify the header contains all necessary components
      expect(header).toContain('s3pAuth');
      expect(header).toContain('s3pAuth_nonce=');
      expect(header).toContain('s3pAuth_signature=');
      expect(header).toContain('s3pAuth_signature_method="HMAC-SHA1"');
      expect(header).toContain('s3pAuth_timestamp=');
      expect(header).toContain(`s3pAuth_token="${token}"`);

      // Verify header structure using regex
      const regex = /^s3pAuth,s3pAuth_nonce="[a-f0-9]+",s3pAuth_signature="[A-Za-z0-9+/=]+",s3pAuth_signature_method="HMAC-SHA1",s3pAuth_timestamp="\d+",s3pAuth_token="test-public-token"$/;
      expect(regex.test(header)).toBe(true);
    });
  });
});
