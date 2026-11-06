'use client';

import Image, { type ImageProps } from 'next/image';
import { useState } from 'react';
import { shouldBypassImageOptimization } from '@/lib/images';
import styles from './DetailPopup.module.css';

function imageSource(src: ImageProps['src']) {
  return typeof src === 'string' ? src : 'default' in src ? src.default.src : src.src;
}

/** Retry an optimizer failure once against the same original image URL. */
export function StorefrontImage(props: ImageProps) {
  return <StorefrontImageAttempt key={imageSource(props.src)} {...props} />;
}

function StorefrontImageAttempt({ unoptimized, onError, ...props }: ImageProps) {
  const [retryOriginal, setRetryOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const bypassOptimization = Boolean(unoptimized) || shouldBypassImageOptimization(imageSource(props.src));

  const handleError: NonNullable<ImageProps['onError']> = (event) => {
    if (!bypassOptimization && !retryOriginal) {
      setRetryOriginal(true);
    } else {
      setFailed(true);
    }
    onError?.(event);
  };

  return (
    <>
      <Image
        {...props}
        alt={props.alt}
        key={retryOriginal ? 'original' : 'initial'}
        unoptimized={bypassOptimization || retryOriginal}
        onError={handleError}
      />
      {failed && <span className={styles.imageFailure} role="status">이미지를 불러오지 못했습니다.</span>}
    </>
  );
}
