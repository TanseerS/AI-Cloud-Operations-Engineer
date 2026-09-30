import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Measured container width.
 *
 * Charts are drawn at exact pixel coordinates rather than scaled with
 * preserveAspectRatio, which would stretch strokes and text unevenly.
 */
export function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const element = ref.current;
    setWidth(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (ref.current && width === 0) setWidth(ref.current.getBoundingClientRect().width);
  }, [width]);

  return [ref, width];
}

export default useElementWidth;
