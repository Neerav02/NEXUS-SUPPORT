import React, { useEffect, useRef } from 'react';
import { MicOff, User } from 'lucide-react';
import './VideoTile.css';

interface VideoTileProps {
  stream: MediaStream | null;
  displayName: string;
  role: 'agent' | 'admin' | 'customer';
  isLocal?: boolean;
  isMuted?: boolean;
  isCamOff?: boolean;
}

export const VideoTile: React.FC<VideoTileProps> = ({
  stream,
  displayName,
  role,
  isLocal = false,
  isMuted = false,
  isCamOff = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideoTrack = stream && stream.getVideoTracks().length > 0 && !isCamOff;

  useEffect(() => {
    if (videoRef.current) {
      if (stream && hasVideoTrack) {
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream, hasVideoTrack]);

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`video-tile ${isLocal ? 'local-tile' : ''}`}>
      {hasVideoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="video-element"
        />
      ) : (
        <div className="video-avatar-container">
          <div className={`video-avatar ${role}-avatar`}>
            {initials || <User size={32} />}
          </div>
        </div>
      )}

      {/* Info Overlay */}
      <div className="video-tile-info">
        <span className={`role-badge role-${role}`}>
          {role.toUpperCase()}
        </span>
        <span className="participant-name">
          {displayName} {isLocal && '(You)'}
        </span>
      </div>

      {/* Status Overlay */}
      {isMuted && (
        <div className="video-status-overlay">
          <MicOff size={16} className="mic-off-icon" />
        </div>
      )}
    </div>
  );
};
