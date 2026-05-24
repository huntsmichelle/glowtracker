import NavBar from '@/components/NavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
