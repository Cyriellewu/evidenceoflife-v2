import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  CalendarClock,
  PlayCircle,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';
import { BrandLogo } from '@/components/BrandLogo';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';

const steps = [
  { number: '01', id: 'plan', labelKey: 'landing.phase.plan', titleKey: 'landing.step.plan.title', bodyKey: 'landing.step.plan.body' },
  { number: '02', id: 'focus', labelKey: 'landing.phase.live', titleKey: 'landing.step.live.title', bodyKey: 'landing.step.live.body' },
  { number: '03', id: 'recap', labelKey: 'landing.phase.capture', titleKey: 'landing.step.capture.title', bodyKey: 'landing.step.capture.body' },
  { number: '04', id: 'calendar', labelKey: 'landing.phase.revisit', titleKey: 'landing.step.revisit.title', bodyKey: 'landing.step.revisit.body' },
];

const featurePillars = [
  { icon: CalendarClock, titleKey: 'landing.pillar.center.title', bodyKey: 'landing.pillar.center.body' },
  { icon: Brain, titleKey: 'landing.pillar.capture.title', bodyKey: 'landing.pillar.capture.body' },
  { icon: Route, titleKey: 'landing.pillar.recall.title', bodyKey: 'landing.pillar.recall.body' },
];

const outcomeKeys = [
  ['landing.outcome.1.title', 'landing.outcome.1.body'],
  ['landing.outcome.2.title', 'landing.outcome.2.body'],
  ['landing.outcome.3.title', 'landing.outcome.3.body'],
];

const framePresets: Record<string, { scale: number; x: number; y: number; width: string; height: string }> = {
  plan: { scale: 0.84, x: -12, y: -6, width: '118%', height: '118%' },
  focus: { scale: 0.84, x: -12, y: -6, width: '118%', height: '118%' },
  recap: { scale: 0.92, x: -22, y: -74, width: '132%', height: '138%' },
  calendar: { scale: 0.9, x: -8, y: -10, width: '114%', height: '114%' },
  map: { scale: 0.9, x: -8, y: -10, width: '114%', height: '114%' },
};

const DEMO_ADVANCE_MS = 6000;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function Reveal({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '-10% 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const reduced = useReducedMotion();
  const activeStep = steps[activeStepIndex];
  const activeFrame = framePresets[activeStep.id] ?? framePresets.plan;

  useEffect(() => {
    trackEvent('landing_page_view', { page: '/' });
  }, []);

  useEffect(() => {
    if (!autoplay || reduced) return;
    const id = window.setInterval(() => {
      setActiveStepIndex((i) => (i + 1) % steps.length);
    }, DEMO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [autoplay, reduced]);

  const selectStep = useCallback((index: number) => {
    setActiveStepIndex(index);
    setAutoplay(false);
  }, []);

  const handleStart = () => {
    trackEvent('landing_cta_clicked', { cta: 'start_free', page: '/' });
    navigate('/auth');
  };

  const handleDemo = () => {
    trackEvent('landing_cta_clicked', { cta: 'open_demo', page: '/' });
    navigate('/demo-app');
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[rgb(var(--lp-cream))] text-[rgb(var(--lp-ink))] antialiased selection:bg-[rgb(var(--lp-terracotta)/0.25)] selection:text-[rgb(var(--lp-ink))]">
      <header className="sticky top-0 z-30 border-b border-[rgb(var(--lp-border)/0.08)] bg-[rgb(var(--lp-cream)/0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5 lg:px-8">
          <button
            type="button"
            className="flex items-center gap-3 rounded-full text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--lp-terracotta)/0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--lp-cream))]"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <BrandLogo alt="Evidence of Life" className="h-10 w-10" />
            <div className="leading-tight">
              <div className="font-brand text-[22px] text-[rgb(var(--lp-brown-650))]">Evidence of life</div>
              <div className="text-xs text-[rgb(var(--lp-brown-300))]">{t('landing.tagline')}</div>
            </div>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-medium text-[rgb(var(--lp-brown-500))] md:flex">
            <a className="transition-colors hover:text-[rgb(var(--lp-terracotta-accent))]" href="#product">{t('landing.nav.product')}</a>
          </nav>

          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-sm font-medium text-[rgb(var(--lp-brown-400))] transition-colors hover:text-[rgb(var(--lp-terracotta-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--lp-terracotta)/0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--lp-cream))]"
          >
            {t('landing.cta.signIn')}
          </button>
        </div>
      </header>

      <main>
        {/* ── 1. Hero + live demo (the entire opener) ──────────────── */}
        <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 text-center lg:px-8 lg:pt-24">
          <div className="pointer-events-none absolute left-1/2 top-[-12%] -z-0 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(var(--lp-terracotta)/0.22),transparent)] blur-2xl" />
          <div className="pointer-events-none absolute left-[12%] top-[18%] -z-0 hidden h-[200px] w-[200px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--lp-sage)/0.18),transparent)] blur-2xl lg:block" />

          <Reveal className="relative mx-auto flex max-w-3xl flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgb(var(--lp-terracotta)/0.22)] bg-[rgb(var(--lp-warm-white)/0.92)] px-3.5 py-1.5 text-sm font-medium text-[rgb(var(--lp-terracotta-accent))] shadow-[0_4px_14px_-6px_rgb(var(--lp-terracotta)/0.4)]">
              <Sparkles size={14} />
              {t('landing.eyebrow')}
            </div>

            <h1 className="mt-7 text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-[rgb(var(--lp-ink))] sm:text-6xl">
              {t('landing.heroTitle1')}
              <br />
              <span className="bg-gradient-to-br from-[rgb(var(--lp-terracotta-light))] via-[rgb(var(--lp-terracotta))] to-[rgb(var(--lp-terracotta-dark))] bg-clip-text text-transparent">
                {t('landing.heroTitle2')}
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-[rgb(var(--lp-brown-600))]">
              {t('landing.heroSub')}
            </p>

            <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="group h-12 w-full rounded-full bg-[rgb(var(--lp-cta))] px-7 text-base text-white shadow-[0_16px_32px_-14px_rgb(var(--lp-cta)/0.9)] transition-transform hover:bg-[rgb(var(--lp-cta-hover))] active:scale-[0.985] sm:w-auto"
                onClick={handleStart}
              >
                {t('landing.cta.createAccount')}
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full rounded-full border-[rgb(var(--lp-brown-650)/0.22)] bg-white/80 px-7 text-base text-[rgb(var(--lp-brown-700))] hover:bg-white sm:w-auto"
                onClick={handleDemo}
              >
                <PlayCircle />
                {t('landing.cta.exploreDemo')}
              </Button>
            </div>

            <p className="mt-4 text-sm text-[rgb(var(--lp-brown-300))]">
              {t('landing.hero.note')}
            </p>
          </Reveal>

          {/* Live demo frame — this IS the "how it works" content (each tab is a phase) */}
          <Reveal delay={120} className="relative mx-auto mt-14 max-w-4xl">
            <div
              className="overflow-hidden rounded-2xl border border-[rgb(var(--lp-border-dark)/0.12)] bg-[rgb(var(--lp-mockup-bg))] shadow-[0_44px_88px_-36px_rgb(var(--lp-ink)/0.6)]"
              onMouseEnter={() => setAutoplay(false)}
            >
              <div className="flex items-center gap-2 border-b border-white/5 bg-[rgb(var(--lp-mockup-bar))] px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <div className="ml-3 flex-1 truncate rounded-full bg-[rgb(var(--lp-mockup-input))] px-4 py-1 text-center text-[11px] text-[rgb(var(--lp-mockup-url))]">
                  evidenceoflife-v2.vercel.app/demo-app
                </div>
              </div>

              <div className="relative aspect-[16/10] overflow-hidden bg-[rgb(var(--lp-mockup-viewport))]">
                <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-full border border-[rgb(var(--lp-terracotta-soft)/0.24)] bg-[rgb(var(--lp-mockup-viewport)/0.82)] px-3 py-1.5 text-[11px] font-medium text-[rgb(var(--lp-cream-200))] backdrop-blur-sm">
                  <span className="text-[rgb(var(--lp-terracotta))]">{activeStep.number}</span>
                  <span className="h-1 w-1 rounded-full bg-[rgb(var(--lp-brown-300)/0.6)]" />
                  {t(activeStep.labelKey)}
                </div>
                <iframe
                  src={`/demo-app?embed=1&demoStep=${activeStep.id}`}
                  title="Evidence of Life demo app"
                  className="absolute left-0 top-0 origin-top-left border-0"
                  loading="eager"
                  style={{
                    width: activeFrame.width,
                    height: activeFrame.height,
                    transform: `translate(${activeFrame.x}px, ${activeFrame.y}px) scale(${activeFrame.scale})`,
                    transformOrigin: 'top left',
                  }}
                />
                <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full border border-[rgb(var(--lp-terracotta-soft)/0.18)] bg-[rgb(var(--lp-mockup-viewport)/0.82)] px-3 py-1 text-[10px] font-medium text-[rgb(var(--lp-cream-200))] backdrop-blur-sm">
                  {t('landing.demo.caption')}
                </div>
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Demo steps"
              className="mt-5 flex flex-wrap items-center justify-center gap-2"
            >
              {steps.map((step, index) => {
                const isActive = step.id === activeStep.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="demo-step-caption"
                    onClick={() => selectStep(index)}
                    className={cn(
                      'relative overflow-hidden rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--lp-terracotta)/0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--lp-cream))]',
                      isActive
                        ? 'bg-[rgb(var(--lp-cta))] text-white shadow-[0_10px_22px_-12px_rgb(var(--lp-cta)/0.9)]'
                        : 'border border-[rgb(var(--lp-border)/0.14)] bg-white/70 text-[rgb(var(--lp-brown-500))] hover:bg-white hover:text-[rgb(var(--lp-brown-700))]',
                    )}
                  >
                    <span className="relative z-10 inline-flex items-center gap-1.5">
                      <span className={cn('text-[10px] font-semibold tracking-[0.1em]', isActive ? 'text-white/80' : 'text-[rgb(var(--lp-brown-300))]')}>
                        {step.number}
                      </span>
                      {t(step.labelKey)}
                    </span>
                    {isActive && autoplay && !reduced && (
                      <span
                        key={`${step.id}-progress`}
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left bg-white/70"
                        style={{ animation: `eolProgress ${DEMO_ADVANCE_MS}ms linear forwards` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <p id="demo-step-caption" className="mt-3 text-center text-[15px] leading-7 text-[rgb(var(--lp-brown-550))]">
              <span className="font-semibold text-[rgb(var(--lp-ink-strong))]">{t(activeStep.titleKey)}.</span>{' '}
              {t(activeStep.bodyKey)}
            </p>
          </Reveal>
        </section>

        {/* ── 2. Product — 3 pillars + 6 modules (one combined section) ── */}
        <section id="product" className="border-t border-[rgb(var(--lp-border)/0.08)] bg-[rgb(var(--lp-warm-white)/0.55)]">
          <div className="mx-auto max-w-6xl px-6 py-24 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[rgb(var(--lp-ink))] sm:text-4xl">
                {t('landing.product.h2')}
              </h2>
              <p className="mt-4 text-lg leading-8 text-[rgb(var(--lp-brown-600))]">
                {t('landing.product.body')}
              </p>
            </Reveal>

            {/* 3 pillars — the "why" */}
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {featurePillars.map((feature, i) => (
                <Reveal key={feature.titleKey} delay={i * 80}>
                  <div className="flex h-full flex-col rounded-2xl border border-[rgb(var(--lp-border)/0.1)] bg-[rgb(var(--lp-warm-white)/0.82)] p-5 shadow-[0_20px_48px_-34px_rgb(var(--lp-ink)/0.45)] transition-shadow duration-300 hover:shadow-[0_28px_56px_-30px_rgb(var(--lp-ink)/0.55)]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[rgb(var(--lp-terracotta)/0.22)] to-[rgb(var(--lp-terracotta)/0.08)] text-[rgb(var(--lp-terracotta-accent))]">
                      <feature.icon size={19} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-[rgb(var(--lp-ink-strong))]">{t(feature.titleKey)}</h3>
                    <p className="mt-2 text-sm leading-6 text-[rgb(var(--lp-brown-550))]">{t(feature.bodyKey)}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Positioning — 3 angles only ───────────────────────── */}
        {/* ── 4. Promise — dark outcomes block (kept private-by-default inline as footnote) ── */}
        <section className="border-y border-[rgb(var(--lp-border)/0.08)] bg-[rgb(var(--lp-warm-white)/0.58)]">
          <div className="mx-auto max-w-5xl px-6 py-24 lg:px-8">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl border border-[rgb(var(--lp-border)/0.12)] bg-[rgb(var(--lp-ink))] p-8 text-[rgb(var(--lp-cream))] shadow-[0_40px_80px_-40px_rgb(var(--lp-ink)/0.75)] sm:p-10">
                <div className="pointer-events-none absolute -left-px top-8 h-24 w-1 rounded-r bg-gradient-to-b from-[rgb(var(--lp-terracotta))] to-transparent" />
                <div className="pointer-events-none absolute right-[-15%] top-[-30%] h-[320px] w-[320px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--lp-terracotta)/0.28),transparent)] blur-2xl" />

                <div className="relative">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[rgb(var(--lp-terracotta))]">{t('landing.promise.eyebrow')}</p>
                  <h3 className="mt-4 text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                    {t('landing.promise.h3')}
                  </h3>

                  <ol className="mt-8 grid gap-4 sm:grid-cols-3">
                    {outcomeKeys.map(([titleKey, bodyKey], i) => (
                      <li
                        key={titleKey}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.07]"
                      >
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[rgb(var(--lp-terracotta)/0.4)] bg-[rgb(var(--lp-terracotta)/0.1)] text-xs font-semibold text-[rgb(var(--lp-cream-200))]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <h4 className="mt-3 font-semibold text-white">{t(titleKey)}</h4>
                        <p className="mt-2 text-sm leading-6 text-[rgb(var(--lp-cream-muted))]">{t(bodyKey)}</p>
                      </li>
                    ))}
                  </ol>

                  {/* Private-by-default folded in as a quiet footnote */}
                  <div className="mt-7 flex items-start gap-3 border-t border-white/10 pt-5 text-sm leading-6 text-[rgb(var(--lp-cream-muted))]">
                    <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-[rgb(var(--lp-terracotta))]" />
                    <p>
                      <span className="font-semibold text-white">{t('landing.private.title')}.</span>{' '}
                      {t('landing.private.body')}
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 5. Final CTA (narrative quote folded in as lead-in) ──── */}
        <section className="mx-auto max-w-6xl px-6 py-24 lg:px-8">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl bg-[rgb(var(--lp-ink))] px-8 py-14 text-center shadow-[0_44px_88px_-44px_rgb(var(--lp-ink)/0.75)] sm:px-16 sm:py-16">
              <div className="pointer-events-none absolute left-1/2 top-0 h-[320px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(var(--lp-terracotta)/0.38),transparent)] blur-2xl" />
              <div className="pointer-events-none absolute bottom-[-30%] right-[-10%] h-[260px] w-[260px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--lp-sage)/0.22),transparent)] blur-2xl" />
              <div className="relative mx-auto max-w-2xl">
                <blockquote className="text-pretty font-serif text-xl italic leading-[1.55] text-[rgb(var(--lp-cream-muted))] sm:text-2xl">
                  {t('landing.narrative')}
                </blockquote>
                <div className="mx-auto mt-7 h-px w-12 bg-[rgb(var(--lp-terracotta)/0.4)]" />
                <h2 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-[rgb(var(--lp-cream))] sm:text-4xl">
                  {t('landing.final.h2')}
                </h2>
                <p className="mt-4 text-lg leading-8 text-[rgb(var(--lp-cream-muted))]">
                  {t('landing.final.body')}
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    size="lg"
                    className="group h-12 w-full rounded-full bg-[rgb(var(--lp-cta))] px-7 text-base text-white shadow-[0_16px_32px_-14px_rgb(var(--lp-cta)/0.9)] hover:bg-[rgb(var(--lp-cta-hover))] active:scale-[0.985] sm:w-auto"
                    onClick={handleStart}
                  >
                    {t('landing.cta.createAccount')}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 w-full rounded-full border-white/25 bg-transparent px-7 text-base text-[rgb(var(--lp-cream-100))] hover:bg-white/10 hover:text-white sm:w-auto"
                    onClick={handleDemo}
                  >
                    <PlayCircle />
                    {t('landing.cta.exploreDemo')}
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-[rgb(var(--lp-border)/0.1)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row lg:px-8">
          <div className="flex items-center gap-3">
            <BrandLogo alt="Evidence of Life" className="h-8 w-8" />
            <span className="font-brand text-lg text-[rgb(var(--lp-brown-650))]">Evidence of life</span>
          </div>
          <p className="text-sm text-[rgb(var(--lp-brown-300))]">© {new Date().getFullYear()} Evidence of Life</p>
        </div>
      </footer>

      <style>{`@keyframes eolProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
    </div>
  );
}
