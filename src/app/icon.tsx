import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 20,
          background: '#b8001f',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontFamily: 'monospace',
          fontWeight: 900,
          borderRadius: '8px',
          border: '1.5px solid #111827',
          lineHeight: 1,
        }}
      >
        E
      </div>
    ),
    {
      ...size,
    }
  );
}
