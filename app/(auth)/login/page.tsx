'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-10">
          <h1 className="font-display text-4xl text-charcoal">tend, too</h1>
          <p className="text-warm-mid text-sm mt-1">Because you're also on the list.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-stone border border-glow-border rounded-lg shadow-card p-8 space-y-5"
        >
          <div>
            <p className="label-overline mb-4">Sign in</p>
          </div>

          {error && (
            <div className="bg-dust-lt border border-[#C4A882] text-charcoal text-sm rounded-md px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide" htmlFor="email">
              Email
            </label>
            <input
              id="email" type="email" required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide" htmlFor="password">
              Password
            </label>
            <input
              id="password" type="password" required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-charcoal text-cream text-sm font-medium rounded-pill py-3 hover:bg-charcoal/90 disabled:opacity-50 mt-2"
          >
            {loading ? 'Signing in…' : 'Continue'}
          </button>

          <p className="text-center text-sm text-warm-mid pt-1">
            No account?{' '}
            <Link href="/signup" className="text-charcoal font-medium hover:underline underline-offset-2">
              Create one
            </Link>
          </p>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link
            href="/onboarding"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px',
              color: 'var(--sage)',
              textDecoration: 'none',
            }}
          >
            New here? Find out more →
          </Link>
        </div>
      </div>
    </div>
  );
}
