import React from 'react';
import { useMediasoup } from '../../hooks/useMediasoup';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Radio,
} from 'lucide-react';
import './ControlBar.css';

interface ControlBarProps {
  onLeave: () => void;
  isAgent?: boolean;
  recordingStatus: 'RECORDING' | 'PROCESSING' | 'READY' | 'NONE';
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  onLeave,
  isAgent = false,
  onStartRecording,
  onStopRecording,
  recordingStatus,
}) => {
  const {
    isMicMuted,
    isCamOff,
    isScreenSharing,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    isConnecting,
  } = useMediasoup();

  return (
    <div className="control-bar-wrapper">
      <div className="control-bar">
        {/* Left Indicator */}
        <div className="control-left">
          <div className="connection-status">
            <Radio size={14} className="live-icon-pulse" />
            <span>{isConnecting ? 'Connecting...' : 'Live'}</span>
            {recordingStatus === 'RECORDING' && (
              <span className="rec-status-tag">
                ● REC
              </span>
            )}
          </div>
        </div>

        {/* Center Actions */}
        <div className="control-center">
          {/* Microphone Toggle */}
          <button
            onClick={toggleMic}
            className={`control-btn ${isMicMuted ? 'btn-danger' : 'btn-active'}`}
            title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
            disabled={isConnecting}
          >
            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleCam}
            className={`control-btn ${isCamOff ? 'btn-danger' : 'btn-active'}`}
            title={isCamOff ? 'Turn Cam On' : 'Turn Cam Off'}
            disabled={isConnecting}
          >
            {isCamOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={toggleScreenShare}
            className={`control-btn ${isScreenSharing ? 'btn-active-screenshare' : 'btn-inactive-screenshare'}`}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            disabled={isConnecting}
          >
            <Monitor size={20} />
          </button>

          {/* Recording Toggle (Agent Only) */}
          {isAgent && (
            <button
              className={`ctrl-btn record-btn ${recordingStatus === 'RECORDING' ? 'active-rec' : ''}`}
              onClick={recordingStatus === 'RECORDING' ? onStopRecording : onStartRecording}
              disabled={recordingStatus === 'PROCESSING'}
              title={recordingStatus === 'RECORDING' ? 'Stop Recording' : 'Start Recording'}
            >
              {recordingStatus === 'RECORDING' ? (
                <span className="stop-icon" />
              ) : (
                <span className="record-icon" />
              )}
              <style>{`
      .record-btn { position: relative; }
      .record-icon {
        display: block;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #d94040;
      }
      .stop-icon {
        display: block;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background: #d94040;
      }
      .active-rec {
        background: rgba(217, 64, 64, 0.2);
        border-color: rgba(217, 64, 64, 0.6);
        animation: recButtonPulse 2s ease-in-out infinite;
      }
      @keyframes recButtonPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(217, 64, 64, 0); }
        50% { box-shadow: 0 0 0 6px rgba(217, 64, 64, 0.2); }
      }
    `}</style>
            </button>
          )}
        </div>

        {/* Right Exit Action */}
        <div className="control-right">
          <button
            onClick={onLeave}
            className="control-btn btn-leave"
            title={isAgent ? 'End Support Session' : 'Leave Support Session'}
          >
            <PhoneOff size={20} />
            <span className="btn-label-desktop">
              {isAgent ? 'End Session' : 'Leave Call'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
