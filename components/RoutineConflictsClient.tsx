'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LinkRulesPanel from '@/components/LinkRulesPanel';

interface Props {
  routineId: string;
  userId: string;
  routineName: string;
}

// Dedicated host for the conflict rules editor (relocated from the routine
// detail page). Reuses LinkRulesPanel as-is — it reads/writes routine_task_pairs.
export default function RoutineConflictsClient({ routineId, userId, routineName }: Props) {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div>
        <Link href={`/routines/${routineId}`} style={{ fontSize: '13px', color: '#a8998e', textDecoration: 'none' }}>
          ← {routineName}
        </Link>
        <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#352720', marginTop: '8px' }}>
          Conflict Rules
        </h1>
        <p className="text-sm text-warm-mid mt-1">
          Choose what happens when these rituals land near each other.
        </p>
      </div>

      <LinkRulesPanel
        routineId={routineId}
        userId={userId}
        onRulesSaved={() => router.refresh()}
      />
    </div>
  );
}
