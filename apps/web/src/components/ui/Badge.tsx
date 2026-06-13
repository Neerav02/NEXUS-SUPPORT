import React from 'react';
import './Badge.css';

type BadgeVariant = 'waiting' | 'active' | 'ended' | 'recording' | 'success' | 'danger' | 'warning' | 'muted';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

/**
 * Status chip with pulse animation for active states.
 * Uses the project's custom color palette.
 */
export const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  pulse = false,
  className = '',
}) => {
  const shouldPulse = pulse || variant === 'active' || variant === 'recording';

  return (
    <span className={`nx-badge nx-badge--${variant} ${shouldPulse ? 'animate-pulse-scale' : ''} ${className}`}>
      {(variant === 'active' || variant === 'recording') && (
        <span className="nx-badge__dot" />
      )}
      {children}
    </span>
  );
};
