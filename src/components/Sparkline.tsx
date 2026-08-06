export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  values,
  width = 72,
  height = 24,
  color = '#315a82',
}: SparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        (index / (values.length - 1)) * width;
      const y =
        height -
        ((value - min) / range) * height;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Punkteverlauf"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
