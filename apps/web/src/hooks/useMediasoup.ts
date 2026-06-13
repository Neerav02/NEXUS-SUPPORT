import { useContext } from 'react';
import { MediasoupContext } from '../providers/MediasoupProvider';

export function useMediasoup() {
  const context = useContext(MediasoupContext);
  if (!context) {
    throw new Error('useMediasoup must be used within a MediasoupProvider');
  }
  return context;
}
