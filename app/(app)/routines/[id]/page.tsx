import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineDetailRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/tasks/${id}`);
}
