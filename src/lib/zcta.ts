import fs from 'node:fs';
import path from 'node:path';

let _cache: Record<string, any> | null = null;

export function loadZctaData(): Record<string, any> {
  if (_cache) return _cache;
  _cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/zcta-data.json'), 'utf-8'));
  return _cache!;
}
