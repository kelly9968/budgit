import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  computeDashboard,
  fmtUSD,
  fmtUSDk,
  recoveryDays,
} from '../lib/budget';
import { getCategory, type Category } from '../lib/categories';
import { useSwipe } from '../lib/swipe';
import type { Transaction } from '../lib/types';

type SelectedMonth = { year: number; month: number };
type DashView = 'metrics' | 'pie';

type Props = {
  txns: Transaction[];
  budget: number;
  categories: Category[];
  onBudgetChange: (n: number) => void;
};

// Slice palette for the pie chart. Saturated counterparts to the pastel
// category swatches — those wash out at small sizes. Round-robin assigned
// in order of category list.
const PIE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#a3a3a3',
];

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

export function Dashboard({ txns, budget, categories, onBudgetChange }: Props) {
  const now = new Date();
  const [sel, setSel] = useState<SelectedMonth>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [view, setView] = useState<DashView>('metrics');

  const today = useMemo(() => effectiveToday(sel), [sel]);
  const m = useMemo(() => computeDashboard(txns, budget, today), [txns, budget, today]);

  // Category totals for the selected month — the pie view's input.
  const catTotals = useMemo(() => {
    const sums = new Map<string, number>();
    for (const t of txns) {
      const d = new Date(t.date + 'T00:00:00');
      if (d.getFullYear() === sel.year && d.getMonth() === sel.month) {
        sums.set(t.cat, (sums.get(t.cat) ?? 0) + t.amount);
      }
    }
    const total = Array.from(sums.values()).reduce((a, b) => a + b, 0);
    return Array.from(sums.entries())
      .map(([name, amount]) => ({ name, amount, pct: total > 0 ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [txns, sel]);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budget));
  // Slider seeds at the user's current blended daily spend so dragging
  // tells them something useful out of the gate. Re-seeded when the
  // blended figure changes (e.g., switching months) but stays put once
  // the user grabs the handle within a given month.
  const [assumed, setAssumed] = useState(0);
  useEffect(() => {
    setAssumed(Math.round(m.blended));
  }, [m.blended]);

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

  // Swipe across the dashboard to nav months. Threshold is set high
  // enough to coexist with vertical scrolling on long content.
  const dashRef = useRef<HTMLDivElement | null>(null);
  useSwipe(dashRef, {
    onLeft: () => navMonth(1),
    onRight: () => navMonth(-1),
  });

  return (
    <div className="dash" ref={dashRef}>
      <div className="dash-monthnav">
        <button
          type="button"
          className="dash-nav-btn"
          onClick={() => navMonth(-1)}
          aria-label="Previous month"
        >‹</button>
        <div className="dash-monthnav-lbl">
          <div className="dash-month">{monthLbl}</div>
          <div className="dash-monthnav-meta">
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
            <div className="dash-view-toggle" role="group" aria-label="Dashboard view">
              <button
                type="button"
                className={`dash-view-btn ${view === 'metrics' ? 'on' : ''}`}
                onClick={() => setView('metrics')}
                aria-pressed={view === 'metrics'}
                aria-label="Metrics view"
                title="Metrics"
              >
                <ChartLineIcon />
              </button>
              <button
                type="button"
                className={`dash-view-btn ${view === 'pie' ? 'on' : ''}`}
                onClick={() => setView('pie')}
                aria-pressed={view === 'pie'}
                aria-label="Category breakdown"
                title="By category"
              >
                <PieIcon />
              </button>
            </div>
          </div>
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

      {view === 'pie' && (
        <PieBreakdown
          totals={catTotals}
          categories={categories}
          monthLbl={monthLbl}
        />
      )}

      {view === 'metrics' && (
        <DashMetricsView
          m={m}
          budget={budget}
          editingBudget={editingBudget}
          setEditingBudget={setEditingBudget}
          budgetInput={budgetInput}
          setBudgetInput={setBudgetInput}
          onBudgetChange={onBudgetChange}
          assumed={assumed}
          setAssumed={setAssumed}
          recovery={recovery}
        />
      )}
    </div>
  );
}

function DashMetricsView({
  m, budget, editingBudget, setEditingBudget, budgetInput, setBudgetInput,
  onBudgetChange, assumed, setAssumed, recovery,
}: {
  m: ReturnType<typeof computeDashboard>;
  budget: number;
  editingBudget: boolean;
  setEditingBudget: (v: boolean) => void;
  budgetInput: string;
  setBudgetInput: (v: string) => void;
  onBudgetChange: (n: number) => void;
  assumed: number;
  setAssumed: (n: number) => void;
  recovery: number;
}) {
  return (
    <>
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

      {/* Surplus / recovery card — same affordance, different framing
          depending on whether you're on or off track. The slider
          models a steady future daily spend; the headline number
          adapts so dragging always tells the user something useful. */}
      {(() => {
        const onTrackState = m.onTrack && m.spent <= m.target;
        const daysLeft = Math.max(m.daysInMonth - m.todayDay, 0);
        const projectedSurplus = Math.round((m.left - assumed * daysLeft) * 100) / 100;
        // Slider scales with the user's daily rate so it can always
        // push past breakeven on a high-budget month.
        const sliderMax = Math.max(300, Math.ceil((m.dailyRate * 3) / 25) * 25);
        return (
          <div className="dash-card">
            <div className="dash-rec">
              {onTrackState ? (
                projectedSurplus >= 0 ? (
                  <>
                    <div className="dash-rec-check">✓</div>
                    <div className="dash-rec-text">
                      <strong style={{ color: GREEN }}>
                        {fmtUSD(projectedSurplus, 0)} surplus
                      </strong>
                      <br />
                      {daysLeft === 0
                        ? 'Month is closed — locked in.'
                        : `if you spend ${assumed === 0 ? '$0' : `$${assumed}`}/day for the next ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}.`}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="dash-rec-num" style={{ color: RED }}>
                      {fmtUSD(Math.abs(projectedSurplus), 0)}
                    </div>
                    <div className="dash-rec-text">
                      <strong>over budget</strong> at this pace.
                      <br />
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                        ${assumed}/day × {daysLeft} {daysLeft === 1 ? 'day' : 'days'} would spend the cushion.
                      </span>
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="dash-rec-num">{recovery}</div>
                  <div className="dash-rec-text">
                    <strong>
                      {recovery === 1 ? 'day' : 'days'} of{' '}
                      {assumed === 0 ? 'no spending' : 'low spending'}
                    </strong>{' '}
                    to get back under the budget line.
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--ink3)' }}>
                      Assumes:{' '}
                      {assumed === 0 ? '$0 / day' : `$${assumed} / day`}
                    </span>
                  </div>
                </>
              )}
            </div>
            {daysLeft > 0 && (
              <div className="dash-rec-slider">
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={5}
                  value={assumed}
                  onChange={(e) => setAssumed(parseInt(e.target.value))}
                />
                <span>
                  {assumed === 0 ? '$0 / day' : `$${assumed} / day`}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Chart */}
      <div className="dash-card">
        <div className="dash-lbl" style={{ marginBottom: 10 }}>
          Cumulative spend vs. budget
        </div>
        <ChartCanvas
          metrics={m}
          budget={budget}
          assumed={assumed}
          recoveryDays={recovery}
        />
        <div className="dash-legend">
          <span><span className="dot" style={{ background: BLUE }} /> Actual</span>
          <span><span className="dot" style={{ background: GREEN }} /> Forecast</span>
          <span><span className="dot" style={{ background: RED }} /> Budget</span>
          {((m.onTrack && m.spent <= m.target) || recovery > 0) && (
            <span>
              <span className="dot" style={{ background: AMBER }} />{' '}
              {m.onTrack && m.spent <= m.target ? 'Scenario' : 'Recovery'}
            </span>
          )}
        </div>
      </div>

      {/* Daily tracker */}
      <div className="dash-card dash-table-card">
        <div className="dash-lbl" style={{ marginBottom: 10 }}>
          Daily tracker
        </div>
        <DailyTable metrics={m} recoveryDays={recovery} onTrack={m.onTrack} />
      </div>
    </>
  );
}

function PieBreakdown({
  totals,
  categories,
  monthLbl,
}: {
  totals: { name: string; amount: number; pct: number }[];
  categories: Category[];
  monthLbl: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const colorOf = (i: number) => PIE_PALETTE[i % PIE_PALETTE.length];
  const total = totals.reduce((a, b) => a + b.amount, 0);

  useEffect(() => {
    if (!ref.current || totals.length === 0) return;
    const chart = new Chart(ref.current, {
      type: 'doughnut',
      data: {
        labels: totals.map((t) => t.name),
        datasets: [
          {
            data: totals.map((t) => t.amount),
            backgroundColor: totals.map((_, i) => colorOf(i)),
            borderColor: '#fff',
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
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
              label: (ctx) => {
                const v = Number(ctx.raw);
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `${ctx.label}: ${fmtUSD(v)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [totals, total]);

  if (totals.length === 0) {
    return (
      <div className="dash-card">
        <div className="dash-lbl" style={{ marginBottom: 8 }}>
          By category — {monthLbl}
        </div>
        <div className="dash-future-note" style={{ marginTop: 0 }}>
          No transactions logged for this month.
        </div>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-lbl" style={{ marginBottom: 10 }}>
        By category — {monthLbl}
      </div>
      <div className="dash-pie-wrap">
        <canvas ref={ref} />
        <div className="dash-pie-center">
          <div className="dash-pie-center-lbl">Total</div>
          <div className="dash-pie-center-amt">{fmtUSD(total, 0)}</div>
        </div>
      </div>
      <ul className="dash-pie-list">
        {totals.map((t, i) => {
          const cat = getCategory(t.name, categories);
          return (
            <li key={t.name} className="dash-pie-row">
              <span className="dash-pie-swatch" style={{ background: colorOf(i) }} />
              <span className="dash-pie-ico" aria-hidden="true">{cat.icon}</span>
              <span className="dash-pie-name">{t.name}</span>
              <span className="dash-pie-pct">{Math.round(t.pct * 100)}%</span>
              <span className="dash-pie-amt">{fmtUSD(t.amount, 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChartLineIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3 16 L8 10 L12 13 L19 5" />
      <circle cx="19" cy="5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PieIcon() {
  // Pie with a single slice cut out — reads as "category breakdown".
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M11 11 L11 3.5" />
      <path d="M11 11 L18.5 11" />
    </svg>
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
  assumed,
  recoveryDays,
}: {
  metrics: ReturnType<typeof computeDashboard>;
  budget: number;
  assumed: number;
  recoveryDays: number;
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

    // Slider scenario line: projects today's spend forward at the
    // assumed daily-spend rate. Always drawn when on track (so the
    // surplus slider has a visual). When off track, stops at the day
    // cumulative dips back below the budget line — preserves the
    // original "recovery" framing.
    const onTrackChart = m.onTrack && m.spent <= m.target;
    const showScenario = onTrackChart || recoveryDays > 0;
    const rData = Array.from({ length: m.daysInMonth }, (_, i) => {
      if (!showScenario) return null;
      const d = i + 1;
      if (d < m.todayDay) return null;
      const offset = d - m.todayDay;
      if (!onTrackChart && offset > recoveryDays) return null;
      return Math.round((m.spent + assumed * offset) * 100) / 100;
    });

    const yMax = Math.max(
      budget,
      ...m.cum,
      ...fData.filter((v): v is number => v != null),
      ...rData.filter((v): v is number => v != null),
    ) + 300;

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
          {
            label: m.onTrack && m.spent <= m.target ? 'Scenario' : 'Recovery',
            data: rData,
            borderColor: AMBER,
            borderWidth: 2,
            borderDash: [2, 2],
            pointRadius: 0,
            pointHoverRadius: 4,
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
  }, [metrics, budget, assumed, recoveryDays]);

  return (
    <div className="dash-chart-wrap">
      <canvas ref={ref} />
    </div>
  );
}

function DailyTable({
  metrics,
  recoveryDays,
  onTrack,
}: {
  metrics: ReturnType<typeof computeDashboard>;
  recoveryDays: number;
  onTrack: boolean;
}) {
  const m = metrics;
  let cum = 0;
  const showRecovery = !onTrack && recoveryDays > 0;
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
    const isToday = d === m.todayDay;
    const isRecovery =
      showRecovery && d > m.todayDay && d <= m.todayDay + recoveryDays;
    const cls = [isToday && 'today', isRecovery && 'recovery']
      .filter(Boolean)
      .join(' ');
    return (
      <tr key={d} className={cls}>
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
