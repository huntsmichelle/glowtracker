import { redirect } from 'next/navigation';

export default function NewRoutineRedirect() {
  redirect('/tasks/new');
}
