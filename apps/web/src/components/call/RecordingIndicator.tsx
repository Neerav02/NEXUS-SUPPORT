import React from 'react';

interface RecordingIndicatorProps {
    status: 'RECORDING' | 'PROCESSING' | 'READY' | 'NONE';
    downloadUrl?: string;
}

export const RecordingIndicator: React.FC<RecordingIndicatorProps> = ({ status, downloadUrl }) => {
    if (status === 'NONE') return null;

    return (
        <div className="recording-indicator-wrapper">
            {status === 'RECORDING' && (
                <div className="rec-badge">
                    <span className="rec-dot" />
                    <span className="rec-label">REC</span>
                </div>
            )}
            {status === 'PROCESSING' && (
                <div className="rec-badge processing">
                    <span className="rec-label">Processing...</span>
                </div>
            )}
            {status === 'READY' && downloadUrl && (
                <a href={downloadUrl} download className="rec-badge ready">
                    <span className="rec-label">⬇ Download Recording</span>
                </a>
            )}

            <style>{`
        .recording-indicator-wrapper {
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
        }
        .rec-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 100px;
          background: rgba(13, 13, 20, 0.92);
          border: 1px solid rgba(217, 64, 64, 0.5);
          backdrop-filter: blur(12px);
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.08em;
        }
        .rec-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #d94040;
          animation: recPulse 1.5s ease-in-out infinite;
        }
        .rec-label {
          color: #f2ede8;
        }
        .rec-badge.processing {
          border-color: rgba(240, 165, 0, 0.5);
        }
        .rec-badge.processing .rec-label {
          color: #f0a500;
        }
        .rec-badge.ready {
          text-decoration: none;
          border-color: rgba(90, 173, 120, 0.5);
          cursor: pointer;
          transition: background 0.2s;
        }
        .rec-badge.ready:hover {
          background: rgba(90, 173, 120, 0.15);
        }
        .rec-badge.ready .rec-label {
          color: #5aad78;
        }
        @keyframes recPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
        </div>
    );
};