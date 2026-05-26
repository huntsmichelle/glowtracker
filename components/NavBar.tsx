'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const navLinks = [
  {
    href: '/',
    label: 'Today',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  {
    href: '/horizon',
    label: 'Horizon',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Rituals',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM12 6v6l4 2" />
      </svg>
    ),
  },
  {
    href: '/routines',
    label: 'Routines',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col bg-stone border-r border-glow-border z-20">
        <div className="flex-1 p-6 space-y-8">
          {/* Logo */}
          <Link href="/" className="block">
            <h1 className="font-display text-xl text-charcoal tracking-tight">GlowLoop</h1>
            <p className="text-[10px] text-warm-light uppercase tracking-widest mt-0.5">Ritual Tracker</p>
          </Link>

          {/* Nav links */}
          <div className="space-y-1">
            <p className="label-overline mb-3">Navigate</p>
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive(link.href)
                    ? 'bg-charcoal text-cream font-medium'
                    : 'text-warm-mid hover:bg-taupe hover:text-charcoal'
                }`}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Sign out — pinned to bottom */}
        <div className="p-6 border-t border-glow-border">
          <button
            onClick={handleSignOut}
            className="text-xs text-warm-light hover:text-charcoal w-full text-left transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-stone border-t border-glow-border z-20 flex items-center">
        {navLinks.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors ${
              isActive(link.href) ? 'text-charcoal' : 'text-warm-light hover:text-charcoal'
            }`}
          >
            {link.icon}
            <span className="text-[10px] font-medium tracking-wide">{link.label}</span>
          </Link>
        ))}
        <button
          onClick={handleSignOut}
          className="flex-1 flex flex-col items-center justify-center gap-1 h-full text-warm-light hover:text-charcoal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="text-[10px] font-medium tracking-wide">Sign out</span>
        </button>
      </nav>
    </>
  );
}
