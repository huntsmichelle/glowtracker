import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine, Category } from '@/types';

export default async function RoutinesListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: routinesList } = await supabase
    .from('routines')
    .select('*, category:categories(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name');

  // Group by category
  const grouped: Record<string, (Routine & { category?: Category })[]> = {};
  const uncategorized: (Routine & { category?: Category })[] = [];

  for (const r of routinesList ?? []) {
    const cat = (r as Routine & { category?: Category }).category;
    if (cat) {
      if (!grouped[cat.name]) grouped[cat.name] = [];
      grouped[cat.name].push(r as Routine & { category?: Category });
    } else {
      uncategorized.push(r as Routine & { category?: Category });
    }
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Routines</h1>
        <Link href="/routines/new" className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5">
          + New
        </Link>
      </div>

      {(routinesList ?? []).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-4">No routines yet.</p>
          <Link href="/routines/new" className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5">
            Create your first routine
          </Link>
        </div>
      ) : (
        <>
          {sortedGroups.map(([catName, items]) => (
            <section key={catName}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{catName}</h2>
              <div className="space-y-2">
                {items.map(r => <RoutineRow key={r.id} routine={r} />)}
              </div>
            </section>
          ))}
          {uncategorized.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Other</h2>
              <div className="space-y-2">
                {uncategorized.map(r => <RoutineRow key={r.id} routine={r} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RoutineRow({ routine }: { routine: Routine & { category?: Category } }) {
  const intervalLabel =
    routine.interval_min_days === routine.interval_max_days
      ? `Every ${routine.interval_min_days}d`
      : `Every ${routine.interval_min_days}–${routine.interval_max_days}d`;

  const modeLabel = routine.mode === 'countdown' ? ' · Countdown' : '';

  return (
    <Link
      href={`/routines/${routine.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-pink-200 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: routine.category?.color ?? '#6B7280' }}
        />
        <span className="text-sm font-medium text-gray-800">{routine.name}</span>
      </div>
      <span className="text-xs text-gray-400">{intervalLabel}{modeLabel}</span>
    </Link>
  );
}
