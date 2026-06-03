import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

// Serves brand/animations.jsx (the Stage/useTime engine the preview depends on).
// Compiled client-side by Babel standalone via <script type="text/babel">.
export function GET() {
  const filePath = join(process.cwd(), 'brand', 'animations.jsx');
  const js = readFileSync(filePath, 'utf8');

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
