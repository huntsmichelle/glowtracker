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
        <Link href="/routines" className="text-sm text-gray-400 hover:text-gray-600">
          Routines
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600">Templates</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Templates</h1>
      </div>

      {myTemplates.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-2">No templates yet.</p>
          <p className="text-gray-400 text-xs mb-6">
            Save a routine as a template to reuse it — names, intervals, and conflict rules are copied, but dates and costs are removed.
          </p>
          <Link
            href="/routines"
            className="inline-block text-pink-500 text-sm font-medium"
          >
            Back to Routines
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Your Templates</h2>
          {myTemplates.map(t => (
            <Link
              key={t.id}
              href={`/routines/templates/${t.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-pink-200 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                  {t.description && (
                    <p className="text-xs text-gray-400 truncate">{t.description}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-3">Use template</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
