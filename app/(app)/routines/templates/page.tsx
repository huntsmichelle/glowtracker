import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine } from '@/types';

export const dynamic = 'force-dynamic';

const CATEGORY_ORDER = ['Skincare', 'Hair Care', 'Body & Nails', 'Treatments'];

export default async function RoutineTemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: allTemplates } = await supabase
    .from('routines')
    .select('*')
    .eq('is_template', true)
    .or(`is_system_template.eq.true,user_id.eq.${user.id}`)
    .order('name');

  const templates = (allTemplates ?? []) as Routine[];

  const systemTemplates = templates.filter(t => t.is_system_template);
  const myTemplates     = templates.filter(t => !t.is_system_template && t.user_id === user.id);

  // Group system templates by template_category, respecting CATEGORY_ORDER
  const grouped = new Map<string, Routine[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);

  for (const t of systemTemplates) {
    const cat = t.template_category ?? 'Other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(t);
  }

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/routines" className="text-sm text-warm-light hover:text-charcoal">
          Routines
        </Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid">Templates</span>
      </div>

      <div>
        <p className="label-overline mb-1">Collections</p>
        <h1 className="font-display text-3xl text-charcoal">Templates</h1>
        <p className="text-warm-mid text-sm mt-1">
          Start from a curated routine or reuse one you&apos;ve saved.
        </p>
      </div>

      {/* System templates grouped by category */}
      {[...grouped.entries()].map(([cat, items]) => {
        if (items.length === 0) return null;
        return (
          <div key={cat} className="space-y-3">
            <p className="label-overline">{cat}</p>
            {items.map(t => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        );
      })}

      {/* User's saved templates */}
      {myTemplates.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-glow-border">
          <p className="label-overline">Your Templates</p>
          {myTemplates.map(t => (
            <TemplateCard key={t.id} template={t} isOwn />
          ))}
        </div>
      )}

      {templates.length === 0 && (
        <div className="text-center py-16">
          <p className="text-warm-mid text-sm mb-6">No templates available yet.</p>
          <Link
            href="/routines"
            className="inline-block text-warm-mid text-sm font-medium hover:text-charcoal underline-offset-2 hover:underline"
          >
            Back to Routines
          </Link>
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template: t, isOwn }: { template: Routine; isOwn?: boolean }) {
  return (
    <Link
      href={`/routines/new/from-template/${t.id}`}
      className="flex items-center justify-between bg-stone border border-glow-border rounded-lg shadow-card px-4 py-3 card-lift"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: t.color }}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-charcoal truncate">{t.name}</p>
          {(t.template_description ?? t.description) && (
            <p className="text-xs text-warm-light truncate mt-0.5">
              {t.template_description ?? t.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        {t.template_task_count != null && (
          <span className="text-xs text-warm-light">
            {t.template_task_count} ritual{t.template_task_count !== 1 ? 's' : ''}
          </span>
        )}
        <span className="text-xs text-warm-mid">
          {isOwn ? 'Use' : 'Use template'}
        </span>
      </div>
    </Link>
  );
}
