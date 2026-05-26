import NavBar from '@/components/NavBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream">
      <NavBar />
      {/* Offset for fixed sidebar on desktop; pad bottom for mobile tab bar */}
      <main className="lg:pl-[220px] pb-24 lg:pb-0">
        <div className="max-w-2xl mx-auto px-5 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
