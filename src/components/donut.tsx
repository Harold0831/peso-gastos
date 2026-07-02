/** Donut SVG sin dependencias — para el mini donut del dashboard. */
export function Donut({
  income,
  expenses,
  size = 44,
  stroke = 5,
}: {
  income: number;
  expenses: number;
  size?: number;
  stroke?: number;
}) {
  const total = income + expenses;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const expensePct = total > 0 ? expenses / total : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className="stroke-income"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className="stroke-expense"
        strokeWidth={stroke}
        strokeDasharray={`${circumference * expensePct} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
