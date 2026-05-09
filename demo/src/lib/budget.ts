import type { Transaction } from './types';

// Dashboard metrics. Ported from index.html:982-1014.
export type DashMetrics = {
  year: number;
  month: number; // 0-indexed
  daysInMonth: number;
  todayDay: number;
  dailyRate: number;
  raw: number[]; // spend per day-of-month, length=daysInMonth
  cum: number[]; // cumulative
  spent: number;
  avg7: number;
  avgM: number;
  blended: number;
  target: number; // dailyRate * todayDay
  eom: number; // forecast end of month
  left: number; // budget - spent
  vs: number; // spent - target (positive = over)
  onTrack: boolean; // blended <= dailyRate
  nearTrack: boolean; // blended <= dailyRate * 1.15
};

export function computeDashboard(
  txns: Transaction[],
  budget: number,
  today: Date = new Date(),
): DashMetrics {
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDay = today.getDate();
  const dailyRate = budget / daysInMonth;

  const raw = new Array<number>(daysInMonth).fill(0);
  for (const t of txns) {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (day >= 1 && day <= daysInMonth) raw[day - 1] += t.amount;
    }
  }

  const cum: number[] = [];
  let running = 0;
  for (const s of raw) {
    running = round2(running + s);
    cum.push(running);
  }

  const spent = cum[todayDay - 1] ?? 0;
  const last7 = raw.slice(Math.max(0, todayDay - 7), todayDay);
  const avg7 = round2(last7.reduce((a, b) => a + b, 0) / Math.max(last7.length, 1));
  const avgM = round2(spent / Math.max(todayDay, 1));
  const blended = todayDay > 7 ? round2(0.5 * avg7 + 0.5 * avgM) : avg7;
  const target = round2(dailyRate * todayDay);
  const eom = round2(spent + blended * (daysInMonth - todayDay));
  const left = round2(budget - spent);
  const vs = round2(spent - target);
  const onTrack = blended <= dailyRate;
  const nearTrack = blended <= dailyRate * 1.15;

  return {
    year, month, daysInMonth, todayDay, dailyRate,
    raw, cum, spent, avg7, avgM, blended, target, eom, left, vs,
    onTrack, nearTrack,
  };
}

// How many days at `assumed` daily spend until cumulative spend drops back
// below the cumulative budget line. Capped at 120 days.
export function recoveryDays(
  spent: number,
  dailyRate: number,
  todayDay: number,
  assumed: number,
): number {
  let n = 0;
  let p = spent;
  while (p > dailyRate * (todayDay + n) && n < 120) {
    p = round2(p + assumed);
    n++;
  }
  return n;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtUSD(n: number, decimals = 2): string {
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtUSDk(n: number): string {
  return '$' + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0));
}
