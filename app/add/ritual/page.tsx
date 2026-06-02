import { createClient } from '@/lib/supabase/server';
import { RitualLibraryClient } from './RitualLibraryClient';

export const dynamic = 'force-dynamic';

export default async function AddRitualPage() {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from('common_tasks')
    .select('id, name, category, recommended_cadence_label, interval_min_days, interval_max_days, recovery_days, prep_steps')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  return <RitualLibraryClient tasks={tasks ?? []} />;
}
