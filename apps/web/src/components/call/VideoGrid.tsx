import React from 'react';
import { useMediasoup } from '../../hooks/useMediasoup';
import { useAuth } from '../../hooks/useAuth';
import { VideoTile } from './VideoTile';
import './VideoGrid.css';

export const VideoGrid: React.FC = () => {
  const {
    localStream,
    localScreenStream,
    remoteParticipants,
    isCamOff,
    isMicMuted,
    isScreenSharing,
  } = useMediasoup();
  const { user } = useAuth();

  // Find active remote screenshares
  const activeRemoteScreenshare = remoteParticipants.find(p => p.screenStream !== null);

  // Check if spotlight layout is needed
  const isSpotlight = isScreenSharing || !!activeRemoteScreenshare;

  // Compile all webcam tiles (local + remote)
  const webcamTiles = [
    // Local feed
    {
      id: 'local',
      stream: localStream,
      displayName: user?.displayName || 'You',
      role: (user?.role || 'agent') as any,
      isLocal: true,
      isMuted: isMicMuted,
      isCamOff: isCamOff,
    },
    // Remote feeds
    ...remoteParticipants.map(p => ({
      id: p.id,
      stream: p.stream,
      displayName: p.displayName,
      role: p.role,
      isLocal: false,
      isMuted: !p.audioProducerId,
      isCamOff: !p.videoProducerId,
    })),
  ];

  if (isSpotlight) {
    const screenshareStream = isScreenSharing
      ? localScreenStream
      : activeRemoteScreenshare!.screenStream;

    const screenshareName = isScreenSharing
      ? 'Your Screen'
      : `${activeRemoteScreenshare!.displayName}'s Screen`;

    return (
      <div className="call-spotlight-container">
        {/* Central Spotlight Pane */}
        <div className="spotlight-main">
          <VideoTile
            stream={screenshareStream}
            displayName={screenshareName}
            role={isScreenSharing ? (user?.role as any) : activeRemoteScreenshare!.role}
            isLocal={isScreenSharing}
            isMuted={true} // screenshares are muted by default
            isCamOff={false}
          />
        </div>

        {/* Sidebar/Horizontal camera strip */}
        <div className="spotlight-strip">
          {webcamTiles.map((tile) => (
            <div key={tile.id} className="strip-item">
              <VideoTile
                stream={tile.stream}
                displayName={tile.displayName}
                role={tile.role}
                isLocal={tile.isLocal}
                isMuted={tile.isMuted}
                isCamOff={tile.isCamOff}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Equal Grid Layout (no screenshare)
  const totalFeeds = webcamTiles.length;
  let gridLayoutClass = 'grid-1';
  if (totalFeeds === 2) gridLayoutClass = 'grid-2';
  if (totalFeeds >= 3) gridLayoutClass = 'grid-4';

  return (
    <div className={`call-grid-container ${gridLayoutClass}`}>
      {webcamTiles.map((tile) => (
        <div key={tile.id} className="grid-item">
          <VideoTile
            stream={tile.stream}
            displayName={tile.displayName}
            role={tile.role}
            isLocal={tile.isLocal}
            isMuted={tile.isMuted}
            isCamOff={tile.isCamOff}
          />
        </div>
      ))}
    </div>
  );
};
