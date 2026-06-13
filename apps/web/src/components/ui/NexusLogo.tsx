import React from 'react';

interface NexusLogoProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Custom SVG hexagonal logo with radiating signal lines.
 * Hand-crafted — no icon libraries.
 * Amber-to-coral gradient stroke with angular inner star.
 */
export const NexusLogo: React.FC<NexusLogoProps> = ({
  size = 48,
  className = '',
  animate = false,
}) => {
  const animClass = animate ? 'animate-orbit' : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animClass} ${className}`}
      style={{ display: 'inline-block' }}
    >
      <defs>
        {/* Ember to Coral gradient */}
        <linearGradient id="nexus-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8622a" />
          <stop offset="100%" stopColor="#c94b8a" />
        </linearGradient>
        <linearGradient id="nexus-gradient-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0a500" />
          <stop offset="100%" stopColor="#e8622a" />
        </linearGradient>
        {/* Glow filter */}
        <filter id="nexus-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer hexagon */}
      <polygon
        points="50,5 90,27.5 90,72.5 50,95 10,72.5 10,27.5"
        stroke="url(#nexus-gradient)"
        strokeWidth="2.5"
        fill="none"
        filter="url(#nexus-glow)"
      />

      {/* Inner angular star shape */}
      <polygon
        points="50,18 65,38 85,42 70,58 74,78 50,68 26,78 30,58 15,42 35,38"
        stroke="url(#nexus-gradient-gold)"
        strokeWidth="1.5"
        fill="none"
        opacity="0.85"
      />

      {/* Center node */}
      <circle
        cx="50"
        cy="50"
        r="4"
        fill="url(#nexus-gradient)"
      />

      {/* Radiating signal lines */}
      <line x1="50" y1="46" x2="50" y2="22" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.5" />
      <line x1="54" y1="48" x2="78" y2="32" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="54" y1="52" x2="78" y2="68" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="50" y1="54" x2="50" y2="78" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.5" />
      <line x1="46" y1="52" x2="22" y2="68" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.4" />
      <line x1="46" y1="48" x2="22" y2="32" stroke="url(#nexus-gradient)" strokeWidth="1" opacity="0.4" />

      {/* Signal dots at endpoints */}
      <circle cx="50" cy="20" r="1.5" fill="#e8622a" opacity="0.6" />
      <circle cx="80" cy="30" r="1.5" fill="#e8622a" opacity="0.5" />
      <circle cx="80" cy="70" r="1.5" fill="#c94b8a" opacity="0.5" />
      <circle cx="50" cy="80" r="1.5" fill="#c94b8a" opacity="0.6" />
      <circle cx="20" cy="70" r="1.5" fill="#c94b8a" opacity="0.5" />
      <circle cx="20" cy="30" r="1.5" fill="#e8622a" opacity="0.5" />
    </svg>
  );
};
