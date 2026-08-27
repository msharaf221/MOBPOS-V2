import React from 'react';

interface AnimatedNumberProps {
  /** The target numeric value to animate towards. */
  value: number;
  /**
   * Optional formatter applied to the interpolated value on every animation
   * frame (e.g. currency formatting). Defaults to a plain integer string.
   */
  formatter?: (n: number) => string;
  /** Animation duration in milliseconds. Defaults to 700ms. */
  duration?: number;
  className?: string;
}

// Ease-out cubic: fast start, gentle settle.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Renders a number that smoothly counts up (or down) from its previous
 * value to the current `value` prop whenever it changes, using
 * requestAnimationFrame. Purely presentational and dependency-free.
 */
export default function AnimatedNumber({
  value,
  formatter,
  duration = 700,
  className
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = React.useState(value);
  const fromRef = React.useRef(value);
  const rafRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const from = fromRef.current;
    const to = value;

    if (from === to) {
      setDisplayValue(to);
      return;
    }

    const startTime = performance.now();

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = from + (to - from) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const rounded = Math.round(displayValue);
  const text = formatter ? formatter(rounded) : String(rounded);

  return <span className={className}>{text}</span>;
}
