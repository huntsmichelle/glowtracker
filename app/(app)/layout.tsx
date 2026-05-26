import NavBar from '@/components/NavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      {/* Offset for fixed sidebar on desktop; pad bottom for mobile tab bar */}
      <main className="lg:pl-[240px] pb-24 lg:pb-0">
        {children}
      </main>
    </div>
  );
}
