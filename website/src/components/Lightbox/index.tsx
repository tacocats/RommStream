import { useEffect } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import styles from './styles.module.css';

export type LightboxImage = {
  src: string;
  alt: string;
};

type Props = {
  images: LightboxImage[];
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
};

export default function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
}: Props): ReactNode {
  const open = index !== null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        onNavigate((index! - 1 + images.length) % images.length);
      } else if (event.key === 'ArrowRight') {
        onNavigate((index! + 1) % images.length);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [open, index, images.length, onClose, onNavigate]);

  if (index === null) {
    return null;
  }

  const image = images[index];

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
    >
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Close"
      >
        &times;
      </button>
      {images.length > 1 && (
        <button
          type="button"
          className={clsx(styles.nav, styles.prev)}
          onClick={event => {
            event.stopPropagation();
            onNavigate((index - 1 + images.length) % images.length);
          }}
          aria-label="Previous image"
        >
          &#8249;
        </button>
      )}
      <img
        src={image.src}
        alt={image.alt}
        className={styles.image}
        onClick={event => event.stopPropagation()}
      />
      {images.length > 1 && (
        <button
          type="button"
          className={clsx(styles.nav, styles.next)}
          onClick={event => {
            event.stopPropagation();
            onNavigate((index + 1) % images.length);
          }}
          aria-label="Next image"
        >
          &#8250;
        </button>
      )}
    </div>
  );
}
