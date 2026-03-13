import { useEffect, useRef, useState } from "react";
import { TrendingUp, DollarSign, Users, Zap } from "lucide-react";

/* ── Colour helpers ── */

/** Returns a Tailwind-friendly HSL colour string for the overall gauge. */
function gaugeColor(score) {
  if (score <= 33) return "hsl(0 84% 60%)";        // red
  if (score <= 66) return "hsl(38 92% 50%)";        // amber
  return "hsl(160 84% 39%)";                         // emerald
}

/** Tailwind class string for the gradient background glow behind the gauge. */
function gaugeGlow(score) {
  if (score <= 33) return "from-red-500/20 to-red-600/5";
  if (score <= 66) return "from-amber-500/20 to-amber-600/5";
  return "from-emerald-500/20 to-emerald-600/5";
}

/** Label for the overall score tier. */
function tierLabel(score) {
  if (score <= 20) return "Very Weak";
  if (score <= 40) return "Weak";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "Strong";
  return "Very Strong";
}

/* ── Sub-score bar config ── */
const SUB_SCORES = [
  { key: "money",      label: "Money",      icon: DollarSign, bar: "bg-emerald-500", track: "bg-emerald-500/15", text: "text-emerald-400" },
  { key: "market",     label: "Market",     icon: TrendingUp,  bar: "bg-blue-500",    track: "bg-blue-500/15",    text: "text-blue-400"    },
  { key: "momentum",   label: "Momentum",   icon: Zap,         bar: "bg-purple-500",  track: "bg-purple-500/15",  text: "text-purple-400"  },
  { key: "management", label: "Management", icon: Users,       bar: "bg-amber-500",   track: "bg-amber-500/15",   text: "text-amber-400"   },
];

const MAX_SUB = 25;

/* ── Circular Gauge SVG ── */
const GAUGE_SIZE = 120;
const STROKE_WIDTH = 8;
const RADIUS = (GAUGE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function CircularGauge({ value, animated }) {
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * (animated ? value : 0)) / 100;
  const color = gaugeColor(value);

  return (
    <div className="relative flex items-center justify-center">
      {/* Soft radial glow */}
      <div
        className={`absolute inset-0 rounded-full bg-gradient-radial ${gaugeGlow(value)} blur-2xl opacity-60`}
      />
      <svg
        width={GAUGE_SIZE}
        height={GAUGE_SIZE}
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        className="rotate-[-90deg]"
      >
        {/* Background track */}
        <circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={STROKE_WIDTH}
          opacity={0.5}
        />
        {/* Foreground arc */}
        <circle
          cx={GAUGE_SIZE / 2}
          cy={GAUGE_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      {/* Center number */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums tracking-tight"
          style={{ color }}
        >
          {animated ? value : 0}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          {tierLabel(value)}
        </span>
      </div>
    </div>
  );
}

/* ── Mini Progress Bar ── */
function SubScoreBar({ label, value, icon: Icon, bar, track, text, animated, delay }) {
  const pct = Math.min(100, (((animated ? value : 0) / MAX_SUB) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3 w-3 ${text}`} />
          <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
            {label}
          </span>
        </div>
        <span className={`text-xs font-semibold tabular-nums ${text}`}>
          {value}/{MAX_SUB}
        </span>
      </div>
      <div className={`h-1.5 w-full rounded-full ${track} overflow-hidden`}>
        <div
          className={`h-full rounded-full ${bar}`}
          style={{
            width: `${pct}%`,
            transition: `width 1s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
          }}
        />
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function InvestmentScoreCard({ score }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  // Trigger animation when the card enters the viewport (or immediately if no IO support).
  useEffect(() => {
    if (!ref.current) {
      setVisible(true);
      return;
    }
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  if (!score) return null;

  const { overall = 0, rationale } = score;

  return (
    <div
      ref={ref}
      className="animate-init animate-fade-in-up rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/80 backdrop-blur-xl p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          Investment Readiness
        </h3>
        <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]/60 tabular-nums">
          0 — 100
        </span>
      </div>

      {/* Gauge */}
      <div className="flex justify-center py-2">
        <CircularGauge value={overall} animated={visible} />
      </div>

      {/* Sub-scores 2x2 grid */}
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {SUB_SCORES.map((s, i) => (
          <SubScoreBar
            key={s.key}
            label={s.label}
            value={score[s.key] ?? 0}
            icon={s.icon}
            bar={s.bar}
            track={s.track}
            text={s.text}
            animated={visible}
            delay={0.15 + i * 0.1}
          />
        ))}
      </div>

      {/* Rationale */}
      {rationale && (
        <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-4">
          {rationale}
        </p>
      )}
    </div>
  );
}
