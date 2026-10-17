import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedSizes = new Set(['180', '192', '512']);

/** Plesk intercepts some .png URLs at nginx before Next.js receives them. */
export async function GET(_request: NextRequest, context: { params: Promise<{ size: string }> }) {
  const { size } = await context.params;
  if (!allowedSizes.has(size)) return new Response('Not found', { status: 404 });
  // npm builds from frontend/, while the unified Passenger process starts at repo root.
  // Both locations contain the same versioned public icons.
  const frontendPublic = join(process.cwd(), 'frontend', 'public', 'icons');
  const directory = process.cwd().endsWith('frontend') ? join(process.cwd(), 'public', 'icons') : frontendPublic;
  try {
    const bytes = await readFile(join(directory, 'sia-' + size + '.png'));
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Icon unavailable', { status: 503 });
  }
}
