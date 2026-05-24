import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Series, Category } from '@/types';

export default async function SeriesListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: seriesList } = await supabase
    .from('series')
    .select('*, category:categories(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name');

  // Group by category
  const grouped: Record<string, (Series & { category?: Category })[]> = {};
  const uncategorized: (Series & { category?: Category })[] = [];

  for (const s of seriesList ?? []) {
    const cat = (s as Series & { category?: Category }).category;
    if (cat) {
      if (!grouped[cat.name]) grouped[cat.name] = [];
      grouped[cat.name].push(s as Series & { category?: Category });
    } else {
      uncategorized.push(s as Series & { category?: Category });
    }
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Routines</h1>
        <Link href="/series/new" className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5">
          + New
        </Link>
      </div>

      {(seriesList ?? []).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-4">No routines yet.</p>
          <Link href="/series/new" className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5">
            Create your first routine
          </Link>
        </div>
      ) : (
        <>
          {sortedGroups.map(([catName, items]) => (
            <section key={catName}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{catName}</h2>
              <div className="space-y-2">
                {items.map(s => <SeriesRow key={s.id} series={s} />)}
              </div>
            </section>
          ))}
          {uncategorized.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Other</h2>
              <div className="space-y-2">
                {uncategorized.map(s => <SeriesRow key={s.id} series={s} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SeriesRow({ series }: { series: Series & { category?: Category } }) {
  const intervalLabel =
    series.interval_min_days === series.interval_max_days
      ? `Every ${series.interval_min_days}d`
      : `Every ${series.interval_min_days}–${series.interval_max_days}d`;

  return (
    <Link
      href={`/series/${series.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-pink-200 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: series.category?.color ?? '#6B7280' }}
        />
        <span className="text-sm font-medium text-gray-800">{series.name}</span>
      </div>
      <span className="text-xs text-gray-400">{intervalLabel}</span>
    </Link>
  );
}
