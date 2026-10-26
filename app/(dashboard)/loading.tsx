export default function DashboardLoading() {
  return (
    <div className="space-y-4 py-4" aria-busy="true" aria-label="Đang tải">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface" />
      <div className="h-36 animate-pulse rounded-card bg-surface" />
      <div className="h-56 animate-pulse rounded-card bg-surface" />
      <div className="h-28 animate-pulse rounded-card bg-surface" />
    </div>
  );
}
