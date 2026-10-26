import Navigation from '@/components/Navigation';
import RealtimeSync from '@/components/RealtimeSync';
import SplashScreen from '@/components/SplashScreen';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <main
        className="flex-1 px-4 pt-safe-t"
        // Reserves the bar's exact height up front so content never reflows
        // once the fixed nav paints.
        style={{ paddingBottom: 'calc(var(--nav-h) + env(safe-area-inset-bottom) + 16px)' }}
      >
        {children}
      </main>

      <Navigation />
      <RealtimeSync />
      <SplashScreen />
    </div>
  );
}
