import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SeriesDetailRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/routines/${id}`);
}
