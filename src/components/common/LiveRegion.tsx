import { useEffect, useRef, useState } from 'react';

let announceFn: ((msg: string) => void) | null = null;

export function announce(msg: string): void {
  announceFn?.(msg);
}

export function LiveRegion() {
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    announceFn = (msg: string) => {
      setMessage('');
      clearTimeout(timeoutRef.current);
      requestAnimationFrame(() => setMessage(msg));
    };
    return () => {
      announceFn = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}
