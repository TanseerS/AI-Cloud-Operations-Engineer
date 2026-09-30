/** Placeholder geometry while a request is in flight. Carries no invented values. */
export function Skeleton({ width = '100%', height = 14 }) {
  return <span className="skeleton" style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <div className="card skeleton-card">
      <Skeleton width="38%" height={16} />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} width={`${85 - index * 12}%`} />
      ))}
    </div>
  );
}

export default Skeleton;
