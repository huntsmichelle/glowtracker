'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Package } from 'lucide-react';

const navLinks = [
  {
    href: '/',
    label: 'Today',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </svg>
    ),
  },
  {
    href: '/horizon',
    label: 'Horizon',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 22H2" />
        <path d="M5 22a7 7 0 0 1 14 0" />
        <path d="M12 15v-3" />
        <path d="M7.05 17.05 4.93 14.93" />
        <path d="M16.95 17.05 19.07 14.93" />
      </svg>
    ),
  },
  {
    href: '/library',
    label: 'Library',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
];

// Shelf is shown but non-functional — coming soon
function ShelfDisabled({ mobile }: { mobile?: boolean }) {
  if (mobile) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        height: '100%',
        opacity: 0.35,
        cursor: 'default',
        pointerEvents: 'none',
      }}>
        <Package size={16} strokeWidth={1.5} color="var(--ink-faint)" />
        <span style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.05em', color: 'var(--ink-faint)' }}>Shelf</span>
      </div>
    );
  }
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '7px 12px',
      borderRadius: '6px',
      opacity: 0.35,
      cursor: 'default',
      pointerEvents: 'none',
    }}>
      <Package size={16} strokeWidth={1.5} color="var(--ink-faint)" />
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-faint)' }}>Shelf</span>
    </div>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    if (href === '/library') return pathname.startsWith('/library') || pathname.startsWith('/tasks') || pathname.startsWith('/routines');
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col bg-stone border-r border-glow-border z-20">
        <div className="flex-1 px-5 pt-7 pb-4 space-y-8">
          {/* Logo */}
          <Link href="/" className="block">
            <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', color: '#352720', fontWeight: 400 }}>tend, too</h1>
            <p style={{ fontSize: '11px', color: '#a8998e', letterSpacing: '0.01em', marginTop: '2px', marginBottom: 0 }}>Because you're also on the list.</p>
          </Link>

          {/* Nav links */}
          <div className="space-y-0.5">
            {navLinks.map(link => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderRadius: '6px', position: 'relative', textDecoration: 'none' }}
                  className="transition-colors hover:bg-taupe"
                >
                  {active && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      width: '3px',
                      height: '16px',
                      backgroundColor: '#6e8c82',
                      borderRadius: '0 2px 2px 0',
                    }} />
                  )}
                  <span style={{ color: active ? '#352720' : '#6b5c52' }}>{link.icon}</span>
                  <span style={{ color: active ? '#352720' : '#6b5c52', fontSize: '14px', fontWeight: active ? 500 : 400 }}>{link.label}</span>
                </Link>
              );
            })}
            <ShelfDisabled />
          </div>
        </div>

        {/* Sign out — pinned to bottom */}
        <div className="px-5 py-5 border-t border-glow-border">
          <button
            onClick={handleSignOut}
            className="text-xs text-warm-light hover:text-charcoal w-full text-left transition-colors cursor-pointer"
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
        <ShelfDisabled mobile />
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
