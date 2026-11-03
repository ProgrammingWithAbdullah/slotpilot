import { describe, expect, it } from 'vitest';
import { directUrl, isPooledUrl } from '../../src/db/pool.js';

const pooled = 'postgresql://owner:secret@ep-cool-name-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

describe('database URLs', () => {
  it('recognises a pooled endpoint', () => {
    expect(isPooledUrl(pooled)).toBe(true);
    expect(isPooledUrl('postgres://u:p@localhost:5432/db')).toBe(false);
  });

  it('derives the direct URL used for migrations', () => {
    expect(directUrl(pooled)).toBe(
      'postgresql://owner:secret@ep-cool-name-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require',
    );
    expect(directUrl('postgres://u:p@localhost:5432/db')).toBe('postgres://u:p@localhost:5432/db');
  });
});
