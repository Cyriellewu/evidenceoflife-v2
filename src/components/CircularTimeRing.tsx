import { useRef, useState, useCallback, useEffect } from 'react';

interface CircularTimeRingProps {
  wakeHour: number;
  wakeMinute: number;
  bedtimeHour: number;
  bedtimeMinute: number;
  lang?: 'zh' | 'en';
  onWakeChange: (h: number, m: number) => void;
  onBedtimeChange: (h: number, m: number) => void;
}

const SIZE = 228;
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 84;
const HANDLE_R = 14;
const TRACK_WIDTH = 20;

function timeToAngle(h: number, m: number): number {
  const totalMin = h * 60 + m;
  const refMin = 7 * 60;
  return ((totalMin - refMin) / (24 * 60)) * 360 - 90;
}

function angleToTime(angleDeg: number): { h: number; m: number } {
  let a = angleDeg + 90;
  if (a < 0) a += 360;
  a = a % 360;
  const totalMin = Math.round((a / 360) * 24 * 60);
  const clamped = ((totalMin + 7 * 60) % (24 * 60) + 24 * 60) % (24 * 60);
  const snapped = Math.round(clamped / 5) * 5;
  const final = snapped % (24 * 60);
  return { h: Math.floor(final / 60), m: final % 60 };
}

function polarToXY(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function describeArc(startAngle: number, endAngle: number, r: number): string {
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;
  const start = polarToXY(startAngle, r);
  const end = polarToXY(endAngle, r);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function fmt12(h: number, m: number) {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hour12}:${pad(m)} ${ampm}`;
}

export function CircularTimeRing({
  wakeHour, wakeMinute, bedtimeHour, bedtimeMinute,
  lang = 'zh', onWakeChange, onBedtimeChange,
}: CircularTimeRingProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<'wake' | 'bedtime' | null>(null);

  const wakeAngle = timeToAngle(wakeHour, wakeMinute);
  const bedAngle = timeToAngle(bedtimeHour, bedtimeMinute);
  const wakePos = polarToXY(wakeAngle, RADIUS);
  const bedPos = polarToXY(bedAngle, RADIUS);

  const getAngleFromEvent = useCallback((e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    const x = clientX - rect.left - CX * (rect.width / SIZE);
    const y = clientY - rect.top - CY * (rect.height / SIZE);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }, []);

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const angle = getAngleFromEvent(e);
    const { h, m } = angleToTime(angle);
    if (dragging === 'wake') onWakeChange(h, m);
    else onBedtimeChange(h, m);
  }, [dragging, getAngleFromEvent, onWakeChange, onBedtimeChange]);

  const handleUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragging, handleMove, handleUp]);

  const wakeTotal = wakeHour * 60 + wakeMinute;
  const bedTotal = bedtimeHour * 60 + bedtimeMinute;
  let awakeMins = bedTotal - wakeTotal;
  if (awakeMins < 0) awakeMins += 24 * 60;
  const awakeHrs = Math.floor(awakeMins / 60);
  const awakeMinsRem = awakeMins % 60;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Time chips */}
      <div className="w-full grid grid-cols-2 gap-2">
        <div className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border border-border/55 bg-muted/40 px-3 py-2.5">
          <span className="text-[12px] font-medium text-muted-foreground">
            {lang === 'zh' ? '睡觉' : 'Bedtime'}
          </span>
          <span className="text-[18px] font-semibold tabular-nums leading-none text-foreground">
            {fmt12(bedtimeHour, bedtimeMinute)}
          </span>
        </div>
        <div className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border border-border/55 bg-muted/40 px-3 py-2.5">
          <span className="text-[12px] font-medium text-muted-foreground">
            {lang === 'zh' ? '起床' : 'Wake up'}
          </span>
          <span className="text-[18px] font-semibold tabular-nums leading-none text-foreground">
            {fmt12(wakeHour, wakeMinute)}
          </span>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="touch-none"
      >
        {/* Background track */}
        <circle
          cx={CX} cy={CY} r={RADIUS}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={TRACK_WIDTH}
          opacity={0.55}
        />

        {/* 4 subtle cardinal dots */}
        {[-90, 0, 90, 180].map(angle => {
          const pos = polarToXY(angle, RADIUS + TRACK_WIDTH / 2 + 7);
          return <circle key={angle} cx={pos.x} cy={pos.y} r={1.8} fill="hsl(var(--muted-foreground))" opacity={0.2} />;
        })}

        {/* Awake arc */}
        <path
          d={describeArc(wakeAngle, bedAngle, RADIUS)}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={TRACK_WIDTH}
          strokeLinecap="round"
          opacity={0.9}
        />

        {/* Wake handle (sun) */}
        <circle
          cx={wakePos.x} cy={wakePos.y} r={HANDLE_R}
          fill="hsl(43 96% 56%)"
          stroke="hsl(var(--background))"
          strokeWidth={3}
          className="cursor-grab active:cursor-grabbing"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }}
          onMouseDown={e => { e.preventDefault(); setDragging('wake'); }}
          onTouchStart={e => { e.preventDefault(); setDragging('wake'); }}
        />
        <text x={wakePos.x} y={wakePos.y} textAnchor="middle" dominantBaseline="central" fontSize={12} className="pointer-events-none select-none">☀️</text>

        {/* Bedtime handle (moon) */}
        <circle
          cx={bedPos.x} cy={bedPos.y} r={HANDLE_R}
          fill="hsl(237 44% 38%)"
          stroke="hsl(var(--background))"
          strokeWidth={3}
          className="cursor-grab active:cursor-grabbing"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }}
          onMouseDown={e => { e.preventDefault(); setDragging('bedtime'); }}
          onTouchStart={e => { e.preventDefault(); setDragging('bedtime'); }}
        />
        <text x={bedPos.x} y={bedPos.y} textAnchor="middle" dominantBaseline="central" fontSize={12} className="pointer-events-none select-none">🌙</text>

        {/* Center: awake duration */}
        <text
          x={CX} y={CY - 10}
          textAnchor="middle" dominantBaseline="central"
          className="fill-foreground"
          fontSize={26} fontWeight={700}
          fontFamily="'Outfit', sans-serif"
          letterSpacing="-0.5"
        >
          {awakeHrs}h{awakeMinsRem > 0 ? pad(awakeMinsRem) : ''}
        </text>
        <text
          x={CX} y={CY + 15}
          textAnchor="middle" dominantBaseline="central"
          className="fill-muted-foreground"
          fontSize={12}
          fontFamily="'Outfit', sans-serif"
          opacity={0.72}
        >
          {lang === 'zh' ? '清醒时长' : 'awake'}
        </text>
      </svg>
    </div>
  );
}
