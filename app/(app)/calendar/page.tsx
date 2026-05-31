import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CalendarClient from '@/components/CalendarClient';
import { format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const [{ data: scheduled }, { data: completed }] = await Promise.all([
    supabase
      .from('instances')
      .select('id, due_date_start, due_date_end, task:tasks(name, category:categories(name))')
      .eq('user_id', user.id)
      .in('status', ['upcoming', 'due', 'snoozed'])
      .eq('archived', false)
      .gte('due_date_start', firstDay)
      .lte('due_date_start', lastDay)
      .order('due_date_start', { ascending: true }),
    supabase
      .from('instances')
      .select('id, actual_completion_date, task:tasks(name, category:categories(name))')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('actual_completion_date', firstDay)
      .lte('actual_completion_date', lastDay)
      .order('actual_completion_date', { ascending: true }),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <CalendarClient
        userId={user.id}
        initialYear={year}
        initialMonth={month}
        initialScheduled={(scheduled ?? []) as CalendarInstance[]}
        initialCompleted={(completed ?? []) as CalendarCompletedInstance[]}
      />
    </div>
  );
}

export type CalendarInstance = {
  id: string;
  due_date_start: string;
  due_date_end: string;
  task?: { name?: string; category?: { name?: string } | null } | null;
};

export type CalendarCompletedInstance = {
  id: string;
  actual_completion_date: string;
  task?: { name?: string; category?: { name?: string } | null } | null;
};
