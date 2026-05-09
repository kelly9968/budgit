import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  computeDashboard,
  fmtUSD,
  fmtUSDk,
  recoveryDays,
} from '../lib/budget';
import type { Transaction } from '../lib/types';

type SelectedMonth = { year: number; month: number };

type Props = {
  txns: Transaction[];
  budget: number;
  onBudgetChange: (n: number) => void;
};

const GREEN = '#639922';
const RED = '#e24b4a';
const AMBER = '#ba7517';
const BLUE = '#378add';

const colourFor = (rate: number, dr: number): string =>
  rate <= dr ? GREEN : rate <= dr * 1.15 ? AMBER : RED;

// Build a Date that points to the right "today" for the selected month:
//  - if it's the actual current month, use the real today
//  - past months: last day of that month (so todayDay = daysInMonth, full
//    cumulative shown)
//  - future months: first day (so the chart starts blank)
function effectiveToday(sel: SelectedMonth): Date {
  const now = new Date();
  if (sel.year === now.getFullYear() && sel.month === now.getMonth()) {
    return now;
  }
  const isPast =
    sel.year < now.getFullYear() ||
    (sel.year === now.getFullYear() && sel.month < now.getMonth());
  if (isPast) {
    // last day of selected month
    return new Date(sel.year, sel.month + 1, 0);
  }
  // future
  return new Date(sel.year, sel.month, 1);
}

export function Dashboard({ txns, budget, onBudgetChange }: Props) {
  const now = new Date();
  const [sel, setSel] = useState<SelectedMonth>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const today = useMemo(() => effectiveToday(sel), [sel]);
  const m = useMemo(() => computeDashboard(txns, budget, today), [txns, budget, today]);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budget));
  const [assumed, setAssumed] = useState(0);

  const recovery = recoveryDays(m.spent, m.dailyRate, m.todayDay, assumed);
  const monthLbl = new Date(m.year, m.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const isCurrentMonth =
    sel.year === now.getFullYear() && sel.month === now.getMonth();
  const isFuture =
    sel.year > now.getFullYear() ||
    (sel.year === now.getFullYear() && sel.month > now.getMonth());

  const navMonth = (delta: number) => {
    const next = new Date(sel.year, sel.month + delta, 1);
    setSel({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <div className="dash">
      <div className="dash-monthnav">
        <button
          type="button"
          className="dash-nav-btn"
          onClick={() => navMonth(-1)}
          aria-label="Previous month"
        >‹</button>
        <div className="dash-monthnav-lbl">
          <div className="dash-month">{monthLbl}</div>
          {!isCurrentMonth && (
            <button
              type="button"
              className="dash-today-btn"
              onClick={() =>
                setSel({ year: now.getFullYear(), month: now.getMonth() })
              }
            >
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          className="dash-nav-btn"
          onClick={() => navMonth(1)}
          aria-label="Next month"
        >›</button>
      </div>

      {isFuture && (
        <div className="dash-future-note">
          Looking ahead — no spend logged for this month yet.
        </div>
      )}

      {/* Spend hero */}
      <div className="dash-card">
        <div className="dash-hero">
          <div>
            <div className="dash-lbl">Spend to date</div>
            <div className="dash-hero-amt">
              <SerifAmount value={m.spent} />
            </div>
            <div
              className={`dash-pill ${
                m.onTrack ? 'on' : m.nearTrack ? 'warn' : 'over'
              }`}
            >
              <span className="dash-dot" />
              {m.onTrack
                ? 'On track'
                : m.nearTrack
                ? 'Slightly over'
                : 'Over budget pace'}
            </div>
          </div>
          <div className="dash-hero-r">
            <div className="dash-lbl">Day {m.todayDay} target</div>
            <div className="dash-hero-tgt">{fmtUSD(m.target, 0)}</div>
            <div
              className="dash-vs"
              style={{ color: m.vs > 0 ? RED : GREEN }}
            >
              {fmtUSD(Math.abs(m.vs), 0)} {m.vs > 0 ? 'over' : 'under'}
            </div>
          </div>
        </div>
        <div className="dash-bar">
          <div
            className="dash-bar-fill"
            style={{
              width: `${Math.min(100, Math.round((m.spent / Math.max(budget, 1)) * 100))}%`,
              background: colourFor(
                m.spent / Math.max(m.todayDay, 1),
                m.dailyRate,
              ),
            }}
          />
        </div>
        <div className="dash-foot">
          <span>
            Budget{' '}
            {editingBudget ? (
              <>
                <input
                  className="dash-budget-input"
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  autoFocus
                />
                <button
                  className="dash-mini"
                  onClick={() => {
                    const v = parseFloat(budgetInput);
                    if (v > 0) {
                      onBudgetChange(v);
                      setEditingBudget(false);
                    }
                  }}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <strong>{fmtUSD(budget, 0)}</strong>{' '}
                <button
                  className="dash-mini"
                  onClick={() => {
                    setBudgetInput(String(budget));
                    setEditingBudget(true);
                  }}
                >
                  edit
                </button>
              </>
            )}
          </span>
          <span>
            <strong>{fmtUSD(m.left, 0)}</strong> left
          </span>
        </div>
      </div>

      {/* Averages */}
      <div className="dash-card">
        <div className="dash-row">
          <span className="dash-lbl">Forecast end of month</span>
          <strong
            className="dash-row-val"
            style={{
              color:
                m.eom <= budget ? GREEN : m.eom <= budget * 1.08 ? AMBER : RED,
            }}
          >
            {fmtUSD(m.eom, 0)}
          </strong>
        </div>
        <Bar label="7-day avg" value={m.avg7} dr={m.dailyRate} avg7={m.avg7} avgM={m.avgM} />
        <Bar label="Month avg" value={m.avgM} dr={m.dailyRate} avg7={m.avg7} avgM={m.avgM} />
        <div className="dash-foot">
          <span style={{ color: 'var(--ink2)' }}>Blended avg / day</span>
          <span>
            <span style={{ color: 'var(--ink3)', fontSize: 11, marginRight: 6 }}>
              target {fmtUSDk(m.dailyRate)}
            </span>
            <strong style={{ color: colourFor(m.blended, m.dailyRate) }}>
              {fmtUSD(m.blended)}
            </strong>
          </span>
        </div>
      </div>

      {/* Recovery */}
      <div className="dash-card">
        <div className="dash-rec">
          {m.onTrack && m.spent <= m.target ? (
            <>
              <div className="dash-rec-check">✓</div>
              <div className="dash-rec-text">
                <strong>You're on track!</strong>
                <br />
                Blended avg {fmtUSD(m.blended)}/day under {fmtUSDk(m.dailyRate)}{' '}
                daily rate.
              </div>
            </>
          ) : (
            <>
              <div className="dash-rec-num">{recovery}</div>
              <div className="dash-rec-text">
                <strong>{recovery === 1 ? 'day' : 'days'} of low spend</strong>{' '}
                to get back under the budget line.
                <br />
                <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                  Assumes:{' '}
                  {assumed === 0 ? '$0 spend days' : `$${assumed}/day`}
                </span>
              </div>
            </>
          )}
        </div>
        <div className="dash-rec-slider">
          <input
            type="range"
            min={0}
            max={300}
            step={5}
            value={assumed}
            onChange={(e) => setAssumed(parseInt(e.target.value))}
          />
          <span>
            {assumed === 0 ? '$0 / day' : `$${assumed} / day`}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="dash-card">
        <div className="dash-lbl" style={{ marginBottom: 10 }}>
          Cumulative spend vs. budget
        </div>
        <ChartCanvas metrics={m} budget={budget} />
        <div className="dash-legend">
          <span><span className="dot" style={{ background: BLUE }} /> Actual</span>
          <span><span className="dot" style={{ background: GREEN }} /> Forecast</span>
          <span><span className="dot" style={{ background: RED }} /> Budget</span>
        </div>
      </div>

      {/* Daily tracker */}
      <div className="dash-card dash-table-card">
        <div className="dash-lbl" style={{ marginBottom: 10 }}>
          Daily tracker
        </div>
        <DailyTable metrics={m} />
      </div>
    </div>
  );
}

// Editorial number rendering: dollars set in serif, cents reduced and
// raised like a pull-quote price tag. Splits the formatted string from
// fmtUSD on the decimal — main amount stays inline, cents wrap into
// .amt-cents (CSS shrinks + superscripts).
function SerifAmount({ value }: { value: number }) {
  const formatted = fmtUSD(value);
  const dotIdx = formatted.lastIndexOf('.');
  if (dotIdx < 0) return <>{formatted}</>;
  return (
    <>
      {formatted.slice(0, dotIdx)}
      <span className="amt-cents">{formatted.slice(dotIdx)}</span>
    </>
  );
}

function Bar({
  label,
  value,
  dr,
  avg7,
  avgM,
}: {
  label: string;
  value: number;
  dr: number;
  avg7: number;
  avgM: number;
}) {
  const max = Math.max(avg7, avgM, dr) * 1.1;
  const pct = Math.min(100, Math.round((value / Math.max(max, 0.01)) * 100));
  const c = colourFor(value, dr);
  return (
    <div className="dash-brow">
      <span className="dash-blbl">{label}</span>
      <div className="dash-bbar">
        <div className="dash-bfil" style={{ width: `${pct}%`, background: c }} />
      </div>
      <span className="dash-bnum" style={{ color: c }}>{fmtUSD(value)}</span>
    </div>
  );
}

function ChartCanvas({
  metrics,
  budget,
}: {
  metrics: ReturnType<typeof computeDashboard>;
  budget: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const m = metrics;
    const labels = Array.from({ length: m.daysInMonth }, (_, i) =>
      new Date(m.year, m.month, i + 1).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    );
    const bLine = Array.from({ length: m.daysInMonth }, (_, i) =>
      Math.round(m.dailyRate * (i + 1) * 100) / 100,
    );
    const aData = Array.from({ length: m.daysInMonth }, (_, i) =>
      i < m.todayDay ? m.cum[i] : null,
    );
    const fData = Array.from({ length: m.daysInMonth }, (_, i) => {
      const d = i + 1;
      if (d < m.todayDay) return null;
      if (d === m.todayDay) return m.spent;
      return Math.round((m.spent + m.blended * (d - m.todayDay)) * 100) / 100;
    });

    const yMax = Math.max(budget, ...m.cum, ...fData.filter((v): v is number => v != null)) + 300;

    const chart = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual',
            data: aData,
            borderColor: BLUE,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Forecast',
            data: fData,
            borderColor: GREEN,
            borderWidth: 1.8,
            borderDash: [4, 3],
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Budget',
            data: bLine,
            borderColor: RED,
            borderWidth: 1.5,
            borderDash: [5, 3],
            pointRadius: 0,
            tension: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff',
            titleColor: '#0a0a0a',
            bodyColor: '#0a0a0a',
            borderColor: '#e8e8e2',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${fmtUSD(Number(ctx.raw))}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 9 }, color: '#aaa', maxTicksLimit: 6, autoSkip: true, maxRotation: 0 },
            grid: { color: 'rgba(0,0,0,.04)' },
            border: { display: false },
          },
          y: {
            ticks: { font: { size: 9 }, color: '#aaa', callback: (v) => fmtUSDk(Number(v)) },
            grid: { color: 'rgba(0,0,0,.04)' },
            border: { display: false },
            min: 0,
            max: yMax,
          },
        },
      },
    });

    return () => chart.destroy();
  }, [metrics, budget]);

  return (
    <div className="dash-chart-wrap">
      <canvas ref={ref} />
    </div>
  );
}

function DailyTable({ metrics }: { metrics: ReturnType<typeof computeDashboard> }) {
  const m = metrics;
  let cum = 0;
  const rows = Array.from({ length: m.daysInMonth }, (_, i) => {
    const d = i + 1;
    const ds = d <= m.todayDay ? m.raw[d - 1] : null;
    if (ds !== null) cum = Math.round((cum + ds) * 100) / 100;
    const bd = Math.round(m.dailyRate * d * 100) / 100;
    const st = ds !== null ? cum : null;
    const pm = ds !== null ? Math.round((cum - bd) * 100) / 100 : null;
    const dLbl = new Date(m.year, m.month, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const stClass = st === null ? '' : st <= bd ? 'cg' : 'cr';
    const dsClass = ds === null ? '' : ds === 0 ? 'cd' : ds <= m.dailyRate ? 'cg' : 'cr';
    const pmClass = pm === null ? '' : pm < 0 ? 'cg' : pm > 0 ? 'cr' : 'cd';
    return (
      <tr key={d} className={d === m.todayDay ? 'today' : ''}>
        <td>{dLbl}</td>
        <td>{fmtUSDk(bd)}</td>
        <td className={stClass}>{st !== null ? fmtUSDk(st) : '—'}</td>
        <td className={dsClass}>
          {ds === null ? '—' : ds === 0 ? '—' : fmtUSD(ds)}
        </td>
        <td className={pmClass}>
          {pm === null
            ? '—'
            : pm === 0
            ? '$0'
            : (pm > 0 ? '+' : '') + fmtUSD(pm, 0)}
        </td>
      </tr>
    );
  });
  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th>Day</th>
          <th>Budget</th>
          <th>Total</th>
          <th>Day</th>
          <th>+/−</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
