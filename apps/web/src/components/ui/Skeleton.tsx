import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

/**
 * Animated shimmer skeleton loader.
 * Uses the project's dark palette for the shimmer effect.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '8px',
  className = '',
}) => {
  return (
    <div
      className={`animate-shimmer ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
      }}
      aria-hidden="true"
    />
  );
};

/** Skeleton variant for session cards */
export const SessionCardSkeleton: React.FC = () => {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-card)',
      border: '1px solid var(--border-default)',
      padding: 'var(--space-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
    }}>
      <Skeleton width="60%" height={20} />
      <Skeleton width="40%" height={14} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <Skeleton width={70} height={24} borderRadius="9999px" />
        <Skeleton width={90} height={24} borderRadius="9999px" />
      </div>
    </div>
  );
};
