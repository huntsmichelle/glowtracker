import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

export function GET() {
  const filePath = join(process.cwd(), 'brand', 'homepage.html');
  let html = readFileSync(filePath, 'utf8');

  // Wire all three buttons to the waitlist page
  html = html.replaceAll(
    'href="Onboarding Screen 1.html"',
    'href="/waitlist"'
  );

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
