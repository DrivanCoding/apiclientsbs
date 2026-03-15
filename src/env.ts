import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

for (const envPath of candidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}
