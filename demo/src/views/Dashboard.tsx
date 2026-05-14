import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import {
  computeDashboard,
  fmtUSD,
  fmtUSDk,
  leftPerDay,
  rolling7,
  spendingTrend,
} from '../lib/budget';
import { getCategory, type Category } from '../lib/categories';
import type { Transaction } from '../lib/types';

export type SelectedMonth = { year: number; month: number };
type ChartType = 'line' | 'pie';

type Props = {
  txns: Transaction[];
  budget: number;
  categories: Category[];
  onBudgetChange: (n: number) => void;
  selectedMonth: SelectedMonth;
};

// Saturated palette for the pie chart (pastels wash out at small sizes).
const PIE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#14b8a6', '#a3a3a3',
];

// Chart palette — muted earth-tones to match the editorial paper look.
const C_ACTUAL = '#3b5e8e';     // deep blue
const C_FORECAST = '#a8b3bd';   // dusty grey-blue
const C_SLIDER = '#b89146';     // ochre / mustard
const C_BUDGET = '#c25b3f';     // terracotta
const C_UNDER = '#6b8c4a';      // muted moss green
const C_OVER = '#c97a64';       // dusty terracotta

// Build the "today" date for the selected month — actual today for the
// current month, last day for past months (full cumulative), first day
// for future months (empty chart).
function effectiveToday(sel: SelectedMonth): Date {
  const now = new Date();
  if (sel.year === now.getFullYear() && sel.month === now.getMonth()) return now;
  const isPast =
    sel.year < now.getFullYear() ||
    (sel.year === now.getFullYear() && sel.month < now.getMonth());
  if (isPast) return new Date(sel.year, sel.month + 1, 0);
  return new Date(sel.year, sel.month, 1);
}

export function Dashboard({ txns, budget, categories, onBudgetChange, selectedMonth }: Props) {
  const sel = selectedMonth;
  const [chartType, setChartType] = useState<ChartType>('line');

  const today = useMemo(() => effectiveToday(sel), [sel]);
  const m = useMemo(() => computeDashboard(txns, budget, today), [txns, budget, today]);

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

  // Per-day-per-category spend for the selected month — used by the
  // daily bar chart when the user picks the pie view, so each day's
  // bar segments by category (matching the pie's slice colors).
  const perDayByCat = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const t of txns) {
      const d = new Date(t.date + 'T00:00:00');
      if (d.getFullYear() !== sel.year || d.getMonth() !== sel.month) continue;
      const day = d.getDate();
      if (day < 1 || day > m.daysInMonth) continue;
      let arr = map.get(t.cat);
      if (!arr) {
        arr = new Array(m.daysInMonth).fill(0);
        map.set(t.cat, arr);
      }
      arr[day - 1] += t.amount;
    }
    return map;
  }, [txns, sel, m.daysInMonth]);

  // Stable color-per-category map, indexed by catTotals' descending sort
  // so the same hue lights up the pie wedge and the stacked bar segment.
  const catColorMap = useMemo(() => {
    const map = new Map<string, string>();
    catTotals.forEach((t, i) => {
      map.set(t.name, PIE_PALETTE[i % PIE_PALETTE.length]);
    });
    return map;
  }, [catTotals]);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState(String(budget));
  // Slider seeds at the user's current blended daily spend so dragging
  // tells them something useful out of the gate. Re-seeded when the
  // blended figure changes (e.g., switching months).
  const [assumed, setAssumed] = useState(0);
  useEffect(() => {
    setAssumed(Math.round(m.blended));
  }, [m.blended]);

  const isFuture =
    sel.year > new Date().getFullYear() ||
    (sel.year === new Date().getFullYear() && sel.month > new Date().getMonth());

  return (
    <div className="dash">
      {isFuture && (
        <div className="dash-future-note">
          Looking ahead — no spend logged for this month yet.
        </div>
      )}

      <HeroCard
        m={m}
        budget={budget}
        editingBudget={editingBudget}
        setEditingBudget={setEditingBudget}
        budgetInput={budgetInput}
        setBudgetInput={setBudgetInput}
        onBudgetChange={onBudgetChange}
      />

      <SectionRow
        title="This month"
        right={<ChartTypeToggle type={chartType} onChange={setChartType} />}
      />
      {chartType === 'line' ? (
        <LineChartCard m={m} budget={budget} assumed={assumed} setAssumed={setAssumed} />
      ) : (
        <PieCard totals={catTotals} categories={categories} />
      )}

      <SectionRow title="By day" />
      <DailyBarCard
        m={m}
        byCategory={chartType === 'pie' ? perDayByCat : null}
        categoryColors={catColorMap}
        orderedCategories={catTotals.map((t) => t.name)}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Section heading row — italic serif title left, optional right slot
 * (used for the chart-type toggle).
 * ──────────────────────────────────────────────────────────────────── */
function SectionRow({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="dash-section-row">
      <h3 className="dash-section">{title}</h3>
      {right && <div className="dash-section-aside">{right}</div>}
    </div>
  );
}

function ChartTypeToggle({
  type,
  onChange,
}: {
  type: ChartType;
  onChange: (t: ChartType) => void;
}) {
  return (
    <div className="dash-viewtoggle" role="group" aria-label="Chart type">
      <button
        type="button"
        className={`dash-viewtoggle-btn ${type === 'line' ? 'on' : ''}`}
        onClick={() => onChange('line')}
        aria-pressed={type === 'line'}
        title="Line chart"
      >
        <ChartLineIcon />
      </button>
      <button
        type="button"
        className={`dash-viewtoggle-btn ${type === 'pie' ? 'on' : ''}`}
        onClick={() => onChange('pie')}
        aria-pressed={type === 'pie'}
        title="By category"
      >
        <PieIcon />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * FlipCard — wraps a dash-card with a 3D flip. The (i) button on each
 * face toggles flipped state; clicking elsewhere on the card does
 * nothing. Card visuals (background, border, shadow, border-radius)
 * live on the outer; padding lives on each face so the back face's
 * absolutely-positioned overlay sizes the same as the front.
 * ──────────────────────────────────────────────────────────────────── */
function FlipCard({
  frontClass = '',
  backClass = '',
  back,
  children,
}: {
  frontClass?: string;
  backClass?: string;
  back: React.ReactNode;
  children: React.ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);
  return (
    <div className="dash-card dash-card-flip">
      {/* The button lives outside the rotating inner so it sits above
          the 3D-transformed faces (preserve-3d ignores plain z-index)
          and stays clickable in either state. */}
      <button
        type="button"
        className="dash-flip-btn"
        onClick={toggle}
        aria-label={flipped ? 'Hide explanation' : 'Explain this card'}
        aria-pressed={flipped}
      >
        {flipped ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5 L11.5 11.5 M11.5 4.5 L4.5 11.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 7 L8 11.5" />
            <circle cx="8" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        )}
      </button>
      <div className={`dash-flip-inner ${flipped ? 'is-flipped' : ''}`}>
        <div className={`dash-flip-face dash-flip-front ${frontClass}`} inert={flipped}>
          {children}
        </div>
        <div className={`dash-flip-face dash-flip-back ${backClass}`} inert={!flipped}>
          {back}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Hero card — eyebrow + big amount + on-track pill + progress bar with
 * notch + trend chip + EOM chip + 3-tile metric row.
 * ──────────────────────────────────────────────────────────────────── */
function HeroCard({
  m, budget, editingBudget, setEditingBudget, budgetInput, setBudgetInput,
  onBudgetChange,
}: {
  m: ReturnType<typeof computeDashboard>;
  budget: number;
  editingBudget: boolean;
  setEditingBudget: (v: boolean) => void;
  budgetInput: string;
  setBudgetInput: (v: string) => void;
  onBudgetChange: (n: number) => void;
}) {
  const trend = spendingTrend(m.avg7, m.avgM);
  const leftDay = leftPerDay(m.left, m.daysInMonth, m.todayDay);
  const targetPct = Math.min(100, Math.max(0, (m.target / Math.max(budget, 1)) * 100));
  const spentPct = Math.min(100, Math.max(0, (m.spent / Math.max(budget, 1)) * 100));

  return (
    <FlipCard frontClass="dash-hero-card" back={<HeroBack m={m} budget={budget} />}>
      <div className="dash-hero-head">
        <div className="dash-lbl">Spent this month</div>
        {editingBudget ? (
          <div className="dash-budget-edit">
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
          </div>
        ) : (
          <button
            type="button"
            className="dash-budget-btn"
            onClick={() => {
              setBudgetInput(String(budget));
              setEditingBudget(true);
            }}
            title="Edit budget"
            aria-label={`Edit budget (currently ${fmtUSD(budget, 0)})`}
          >
            <span className="dash-budget-lbl">Budget</span>
            <span className="dash-budget-val">{fmtUSD(budget, 0)}</span>
          </button>
        )}
      </div>

      <div className="dash-hero-amt">{fmtUSD(m.spent, 0)}</div>

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

      <div className="dash-pbar-wrap">
        <div className="dash-pbar">
          <div className="dash-pbar-fill" style={{ width: `${spentPct}%` }} />
          <div
            className="dash-pbar-notch"
            style={{ left: `${targetPct}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="dash-pbar-axis">
          <span>$0</span>
          <span className="dash-pbar-target">
            ↑ Day {m.todayDay} target {fmtUSD(m.target, 0)}
          </span>
          <span>{fmtUSD(budget, 0)}</span>
        </div>
      </div>

      <div className="dash-chips">
        {trend !== 'flat' && (
          <span className={`dash-pill ${trend === 'slowing' ? 'on' : 'over'}`}>
            {trend === 'slowing' ? '↓ Spending slowing' : '↑ Spending rising'}
          </span>
        )}
        <span className="dash-pill neutral">
          EOM forecast {fmtUSD(m.eom, 0)}
        </span>
      </div>

      <div className="dash-tiles">
        <Tile
          label="Avg / day"
          value={fmtUSD(m.avgM, 0)}
          color={m.avgM <= m.dailyRate ? 'good' : 'bad'}
        />
        <Tile
          label="Target / day"
          value={fmtUSD(m.dailyRate, 0)}
          color="neutral"
        />
        <Tile
          label="Left / day"
          value={fmtUSD(leftDay, 0)}
          color={leftDay >= 0 ? 'good' : 'bad'}
        />
      </div>
    </FlipCard>
  );
}

function HeroBack({
  m,
  budget,
}: {
  m: ReturnType<typeof computeDashboard>;
  budget: number;
}) {
  const daysLeft = Math.max(m.daysInMonth - m.todayDay, 0);
  return (
    <div className="dash-explain">
      <div className="dash-explain-title">How the numbers work</div>
      <p>
        You've spent <b>{fmtUSD(m.spent, 0)}</b> of your{' '}
        <b>{fmtUSD(budget, 0)}</b> budget over the first{' '}
        <b>{m.todayDay}</b> day{m.todayDay === 1 ? '' : 's'} of the month.
      </p>
      <div className="dash-explain-formula">
        <b>Target / day</b> = budget ÷ days in month
        <br />
        = {fmtUSD(budget, 0)} ÷ {m.daysInMonth} = {fmtUSD(m.dailyRate, 0)}
      </div>
      <div className="dash-explain-formula">
        <b>Pace</b> = (last 7-day avg + month-to-date avg) ÷ 2
        <br />
        = ({fmtUSD(m.avg7, 0)} + {fmtUSD(m.avgM, 0)}) ÷ 2 ={' '}
        {fmtUSD(m.blended, 0)} / day
      </div>
      <div className="dash-explain-formula">
        <b>EOM forecast</b> = spent + pace × days left
        <br />
        = {fmtUSD(m.spent, 0)} + {fmtUSD(m.blended, 0)} × {daysLeft} ={' '}
        <b>{fmtUSD(m.eom, 0)}</b>
      </div>
      <p className="dash-explain-note">
        The <b>notch</b> on the progress bar is where you'd be if you spent
        exactly your daily target each day. Left of it = ahead; right of it
        = behind.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'good' | 'bad' | 'neutral';
}) {
  return (
    <div className={`dash-tile dash-tile-${color}`}>
      <div className="dash-tile-val">{value}</div>
      <div className="dash-tile-lbl">{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * "This month" — cumulative line chart card with slider.
 * ──────────────────────────────────────────────────────────────────── */
function LineChartCard({
  m,
  budget,
  assumed,
  setAssumed,
}: {
  m: ReturnType<typeof computeDashboard>;
  budget: number;
  assumed: number;
  setAssumed: (n: number) => void;
}) {
  return (
    <FlipCard back={<LineChartBack m={m} budget={budget} assumed={assumed} />}>
      <ChartCanvas metrics={m} budget={budget} assumed={assumed} />
      <div className="dash-legend">
        <span><span className="dot" style={{ background: C_ACTUAL }} /> Actual</span>
        <span><span className="dot dot-dashed" style={{ borderColor: C_FORECAST }} /> Forecast</span>
        <span><span className="dot dot-dashed" style={{ borderColor: C_SLIDER }} /> Slider</span>
        <span><span className="dot dot-dashed" style={{ borderColor: C_BUDGET }} /> Budget</span>
      </div>
      <div className="dash-slider">
        <span className="dash-slider-lbl">Slider</span>
        <input
          type="range"
          min={0}
          max={Math.max(300, Math.ceil((m.dailyRate * 3) / 25) * 25)}
          step={5}
          value={assumed}
          onChange={(e) => setAssumed(parseInt(e.target.value))}
          aria-label="Assumed daily spend"
        />
        <span className="dash-slider-val">${assumed} / day</span>
      </div>
    </FlipCard>
  );
}

function LineChartBack({
  m,
  budget,
  assumed,
}: {
  m: ReturnType<typeof computeDashboard>;
  budget: number;
  assumed: number;
}) {
  const daysLeft = Math.max(m.daysInMonth - m.todayDay, 0);
  const sliderEom = Math.round(m.spent + assumed * daysLeft);
  return (
    <div className="dash-explain">
      <div className="dash-explain-title">Reading the chart</div>
      <ul className="dash-explain-list">
        <li>
          <span className="dot" style={{ background: C_ACTUAL }} />
          <span>
            <b>Actual</b> — running total of what you've spent so far.
          </span>
        </li>
        <li>
          <span className="dot dot-dashed" style={{ borderColor: C_FORECAST }} />
          <span>
            <b>Forecast</b> — where you'll likely end up if you keep your
            current pace ({fmtUSD(m.blended, 0)}/day).
          </span>
        </li>
        <li>
          <span className="dot dot-dashed" style={{ borderColor: C_SLIDER }} />
          <span>
            <b>Slider</b> — a "what if" line. Drag the slider to see where
            you'd land at any daily spend. At ${assumed}/day you'd finish
            around <b>{fmtUSD(sliderEom, 0)}</b>.
          </span>
        </li>
        <li>
          <span className="dot dot-dashed" style={{ borderColor: C_BUDGET }} />
          <span>
            <b>Budget</b> — a straight line from $0 to{' '}
            <b>{fmtUSD(budget, 0)}</b> over the month. Stay below it and
            you're within budget.
          </span>
        </li>
      </ul>
      <p className="dash-explain-note">
        The forecast and slider lines start from today and project forward;
        the actual line stops at today.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * "This month" — pie chart card variant. No inner heading; the parent
 * section row provides the title (and the chart-type toggle).
 * ──────────────────────────────────────────────────────────────────── */
function PieCard({
  totals,
  categories,
}: {
  totals: { name: string; amount: number; pct: number }[];
  categories: Category[];
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
      <FlipCard back={<PieBack totals={[]} total={0} />}>
        <div className="dash-future-note" style={{ marginTop: 0 }}>
          No transactions logged for this month.
        </div>
      </FlipCard>
    );
  }

  return (
    <FlipCard back={<PieBack totals={totals} total={total} />}>
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
    </FlipCard>
  );
}

function PieBack({
  totals,
  total,
}: {
  totals: { name: string; amount: number; pct: number }[];
  total: number;
}) {
  const top = totals[0];
  return (
    <div className="dash-explain">
      <div className="dash-explain-title">How spending breaks down</div>
      <p>
        Each slice is one category. Slice size = that category's share of
        your total spend this month ({fmtUSD(total, 0)}).
      </p>
      <div className="dash-explain-formula">
        <b>% of total</b> = category total ÷ month total × 100
      </div>
      {top && (
        <p>
          Biggest category so far: <b>{top.name}</b> at{' '}
          <b>{fmtUSD(top.amount, 0)}</b> ({Math.round(top.pct * 100)}%).
        </p>
      )}
      <p className="dash-explain-note">
        The legend list is sorted by amount, biggest first.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * "By day" — bar chart card. When byCategory is provided, each day's
 * bar is segmented by category (matching the pie's slice colors);
 * otherwise bars are single-color under/over-target.
 * ──────────────────────────────────────────────────────────────────── */
function DailyBarCard({
  m,
  byCategory,
  categoryColors,
  orderedCategories,
}: {
  m: ReturnType<typeof computeDashboard>;
  byCategory: Map<string, number[]> | null;
  categoryColors: Map<string, string>;
  orderedCategories: string[];
}) {
  const isStacked = byCategory !== null && orderedCategories.length > 0;
  return (
    <FlipCard back={<DailyBarBack m={m} isStacked={isStacked} />}>
      <DailyBarChart
        metrics={m}
        byCategory={byCategory}
        categoryColors={categoryColors}
        orderedCategories={orderedCategories}
      />
      <div className="dash-legend">
        {isStacked ? (
          <>
            {orderedCategories.map((name) => (
              <span key={name}>
                <span
                  className="dot"
                  style={{ background: categoryColors.get(name) ?? '#999' }}
                />{' '}
                {name}
              </span>
            ))}
            <span>
              <span className="dot" style={{ background: C_ACTUAL }} /> 7-day avg
            </span>
          </>
        ) : (
          <>
            <span><span className="dot" style={{ background: C_UNDER }} /> Under target</span>
            <span><span className="dot" style={{ background: C_OVER }} /> Over target</span>
            <span><span className="dot" style={{ background: C_ACTUAL }} /> 7-day avg</span>
          </>
        )}
      </div>
    </FlipCard>
  );
}

function DailyBarBack({
  m,
  isStacked,
}: {
  m: ReturnType<typeof computeDashboard>;
  isStacked: boolean;
}) {
  return (
    <div className="dash-explain">
      <div className="dash-explain-title">Reading the bars</div>
      <p>
        Each bar is one day's total spending. The dashed horizontal line is
        your daily target — budget ÷ days in month ={' '}
        <b>{fmtUSD(m.dailyRate, 0)}/day</b>.
      </p>
      {isStacked ? (
        <p>
          Bars are split by category, using the same colors as the pie. A
          taller bar means a bigger day; a tall stack of one color means
          most of that day went to one category.
        </p>
      ) : (
        <p>
          <span className="dot" style={{ background: C_UNDER, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
          <b>Green</b> = at or under target.{' '}
          <span className="dot" style={{ background: C_OVER, display: 'inline-block', verticalAlign: 'middle', marginRight: 4, marginLeft: 8 }} />
          <b>Red</b> = over target.
        </p>
      )}
      <div className="dash-explain-formula">
        <b>7-day avg line</b> = average of the surrounding 7 days, smoothed
        so a single big day doesn't dominate the trend.
      </div>
      <p className="dash-explain-note">
        Future days aren't drawn — the chart stops at today.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Cumulative chart canvas — Actual (solid), Forecast (dashed grey-blue),
 * Slider scenario (dashed ochre), Budget (dashed terracotta).
 * ──────────────────────────────────────────────────────────────────── */
function ChartCanvas({
  metrics,
  budget,
  assumed,
}: {
  metrics: ReturnType<typeof computeDashboard>;
  budget: number;
  assumed: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  // Build / rebuild the chart only when the underlying metrics or budget
  // change (e.g., month-switch, budget edit, txn add). Slider movement
  // (assumed) is applied via a cheap dataset update in a separate effect.
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
    const sData = Array.from({ length: m.daysInMonth }, (_, i) => {
      const d = i + 1;
      if (d < m.todayDay) return null;
      return Math.round((m.spent + assumed * (d - m.todayDay)) * 100) / 100;
    });

    const yMax = Math.max(
      budget,
      ...m.cum,
      ...fData.filter((v): v is number => v != null),
      ...sData.filter((v): v is number => v != null),
    ) + 300;

    const chart = new Chart(ref.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual',
            data: aData,
            borderColor: C_ACTUAL,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Forecast',
            data: fData,
            borderColor: C_FORECAST,
            borderWidth: 1.8,
            borderDash: [4, 3],
            pointRadius: 0,
            pointHoverRadius: 5,
            tension: 0.3,
            fill: false,
          },
          {
            label: 'Slider',
            data: sData,
            borderColor: C_SLIDER,
            borderWidth: 1.8,
            borderDash: [2, 3],
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0,
            fill: false,
          },
          {
            label: 'Budget',
            data: bLine,
            borderColor: C_BUDGET,
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
            ticks: { font: { size: 9 }, color: '#aaa', maxTicksLimit: 5, autoSkip: true, maxRotation: 0 },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            ticks: { display: false },
            grid: { color: 'rgba(0,0,0,.05)', drawTicks: false },
            border: { display: false },
            min: 0,
            max: yMax,
          },
        },
      },
    });

    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [metrics, budget]);

  // Slider scenario — patch dataset 2 in place; no chart rebuild.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const m = metrics;
    const sData = Array.from({ length: m.daysInMonth }, (_, i) => {
      const d = i + 1;
      if (d < m.todayDay) return null;
      return Math.round((m.spent + assumed * (d - m.todayDay)) * 100) / 100;
    });
    chart.data.datasets[2].data = sData;
    chart.update('none');
  }, [assumed, metrics]);

  return (
    <div className="dash-chart-wrap">
      <canvas ref={ref} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Daily bar chart canvas — per-day spend, colored by under/over daily
 * target, with a 7-day rolling-avg line overlay and dashed target ref.
 * ──────────────────────────────────────────────────────────────────── */
function DailyBarChart({
  metrics,
  byCategory,
  categoryColors,
  orderedCategories,
}: {
  metrics: ReturnType<typeof computeDashboard>;
  byCategory: Map<string, number[]> | null;
  categoryColors: Map<string, string>;
  orderedCategories: string[];
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const m = metrics;
    const labels = Array.from({ length: m.todayDay }, (_, i) => String(i + 1));
    const bars = m.raw.slice(0, m.todayDay);
    const rolling = rolling7(m.raw, m.todayDay).slice(0, m.todayDay);
    const isStacked = byCategory !== null && orderedCategories.length > 0;

    const barDatasets = isStacked
      ? // One stacked bar dataset per category (ordered to match the pie).
        orderedCategories.map((catName) => {
          const fullArr = byCategory!.get(catName) ?? [];
          return {
            type: 'bar' as const,
            label: catName,
            data: fullArr.slice(0, m.todayDay),
            backgroundColor: categoryColors.get(catName) ?? '#999',
            borderWidth: 0,
            barPercentage: 0.8,
            categoryPercentage: 0.9,
            stack: 'day',
          };
        })
      : [
          {
            type: 'bar' as const,
            label: 'Spent',
            data: bars,
            backgroundColor: bars.map((v) => (v <= m.dailyRate ? C_UNDER : C_OVER)),
            borderRadius: 3,
            borderSkipped: false,
            barPercentage: 0.7,
            categoryPercentage: 0.85,
          },
        ];

    const chart = new Chart(ref.current, {
      data: {
        labels,
        datasets: [
          ...barDatasets,
          {
            type: 'line',
            label: '7-day avg',
            data: rolling,
            borderColor: C_ACTUAL,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.35,
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
              title: (items) =>
                new Date(m.year, m.month, parseInt(items[0].label)).toLocaleDateString(
                  'en-US',
                  { month: 'short', day: 'numeric' },
                ),
              label: (ctx) => {
                const v = Number(ctx.raw);
                if (ctx.dataset.label === '7-day avg') {
                  return `7-day avg: ${fmtUSD(v)}`;
                }
                if (isStacked && v === 0) return '';
                return `${ctx.dataset.label}: ${fmtUSD(v)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { font: { size: 9 }, color: '#aaa', maxTicksLimit: 12, autoSkip: true, maxRotation: 0 },
            grid: { display: false },
            border: { display: false },
            stacked: isStacked,
          },
          y: {
            ticks: { display: false },
            grid: { color: 'rgba(0,0,0,.05)', drawTicks: false },
            border: { display: false },
            min: 0,
            suggestedMax: Math.max(m.dailyRate * 2.2, ...bars, 1),
            stacked: isStacked,
          },
        },
      },
      plugins: [
        {
          // Dashed horizontal target line at dailyRate (per-day budget).
          id: 'targetLine',
          afterDatasetsDraw: (chart) => {
            const yScale = chart.scales.y;
            const xScale = chart.scales.x;
            const y = yScale.getPixelForValue(m.dailyRate);
            const ctx = chart.ctx;
            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = 'rgba(194, 91, 63, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xScale.left, y);
            ctx.lineTo(xScale.right, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(194, 91, 63, 0.85)';
            ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(fmtUSDk(m.dailyRate), xScale.right - 2, y - 2);
            ctx.restore();
          },
        },
      ],
    });

    return () => chart.destroy();
  }, [metrics, byCategory, categoryColors, orderedCategories]);

  return (
    <div className="dash-chart-wrap dash-chart-bars">
      <canvas ref={ref} />
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
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="7.5" />
      <path d="M11 11 L11 3.5" />
      <path d="M11 11 L18.5 11" />
    </svg>
  );
}
