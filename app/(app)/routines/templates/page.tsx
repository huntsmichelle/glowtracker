import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine } from '@/types';

export const dynamic = 'force-dynamic';

export default async function RoutineTemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: templates } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_template', true)
    .order('name');

  const myTemplates = (templates ?? []) as Routine[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/routines" className="text-sm text-warm-light hover:text-charcoal">
          Routines
        </Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid">Templates</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-charcoal">Templates</h1>
      </div>

      {myTemplates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-warm-mid text-sm mb-2">No templates yet.</p>
          <p className="text-warm-light text-xs mb-6">
            Save a routine as a template to reuse it — names, intervals, and overlap rules are copied, but dates and costs are removed.
          </p>
          <Link
            href="/routines"
            className="inline-block text-warm-mid text-sm font-medium hover:text-charcoal underline-offset-2 hover:underline"
          >
            Back to Routines
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="label-overline">Your Templates</p>
          {myTemplates.map(t => (
            <Link
              key={t.id}
              href={`/routines/templates/${t.id}`}
              className="flex items-center justify-between bg-stone border border-glow-border rounded-lg shadow-card px-4 py-3 card-lift"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{t.name}</p>
                  {t.description && (
                    <p className="text-xs text-warm-light truncate">{t.description}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-warm-light flex-shrink-0 ml-3">Use template</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
