import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-static';

export function GET() {
  const filePath = join(process.cwd(), 'brand', 'Onboarding Preview Video.html');
  let html = readFileSync(filePath, 'utf8');

  // Point CTA buttons at the waitlist
  html = html.replaceAll('href="Onboarding Screen 1.html"', 'href="/waitlist"');
  // Resolve the relative JSX dependency to its served route (absolute path)
  html = html.replaceAll('src="animations.jsx"', 'src="/onboarding-preview-video/animations"');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
