import { useEffect, useRef } from 'react';
import type { AvatarConfig, PlayerDirection } from '@enico/protocol';
import { AVATAR_HEIGHT, AVATAR_WIDTH, drawAvatarFrame } from './avatarRenderer';

interface AvatarPreviewProps {
  avatar: AvatarConfig;
  size?: number;
  direction?: PlayerDirection;
  testId?: string;
  label?: string;
}

export function AvatarPreview({
  avatar,
  size = 160,
  direction = 'south',
  testId,
  label = 'Avatar preview',
}: AvatarPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d');
    if (context) drawAvatarFrame(context, avatar, direction, 0);
  }, [avatar, direction]);

  return (
    <canvas
      ref={canvasRef}
      width={AVATAR_WIDTH}
      height={AVATAR_HEIGHT}
      data-testid={testId}
      className="avatar-preview-canvas"
      role="img"
      aria-label={label}
      style={{ width: size * 0.8, height: size }}
    />
  );
}
