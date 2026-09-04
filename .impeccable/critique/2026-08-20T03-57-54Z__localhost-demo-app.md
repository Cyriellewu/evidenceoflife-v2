---
target: "http://localhost:8080/demo-app"
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-08-20T03-57-54Z
slug: localhost-demo-app
---
⚠️ DEGRADED: single-context (two isolated assessment sub-agents each failed twice with no output in this harness; per critique.md fallback, Assessment A + B ran sequentially inline)

# Design Health Score (Nielsen 10)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Timers, floating widgets, loading states present; no skeletons for data-heavy views |
| 2 | Match System / Real World | 3 | Warm human copy ("what made today worth keeping?") + full EN/ZH i18n |
| 3 | User Control and Freedom | 3 | Undo toasts + moment restore + timer pause/resume; coverage of destructive actions incomplete |
| 4 | Consistency and Standards | 3 | Excellent token system but mid-migration: two token files + leftover hard-coded hex in Links/StickyNotes; 4 font families |
| 5 | Error Prevention | 3 | photoValidation, IME-composition guard, per-section error boundaries |
| 6 | Recognition Rather Than Recall | 3 | Quick tags, emoji grid, auto-tag chips, activity icons |
| 7 | Flexibility and Efficiency | 3 | Voice capture, inline timeline insert, parallel multi-timers; no visible keyboard shortcuts |
| 8 | Aesthetic and Minimalist Design | 2 | Today view stacks composer + plan + recap cards + tiles + paintings + breathing animations |
| 9 | Error Recovery | 2 | Error boundary renders "{label} crashed" + raw error message (developer-facing) |
| 10 | Help and Documentation | 2 | Demo tour exists; real first-run guidance unverified |
| **Total** | | **27/40** | **Decent — functional and thoughtful, under-polished** |

# Anti-Patterns Verdict

LLM assessment: The app core does not look template-generated — the token system is intentional and documented, the dark theme is a deliberate OLED-neutral ramp (reasoning recorded in comments), and EvidenceReviewCard shows real product thinking ("don't show an empty trophy"). The AI tells concentrate on the Landing marketing page (gradient hero text; fixed warm cream/terracotta palette that sits squarely in the 2026 "warm minimal" monoculture band) and in decorative-motion tics (infinite breathing rule/label animations, bouncing chevron). Typography carries four families (Nunito / Crimson Pro / LXGW WenKai TC / Nanum Pen Script) — more-fonts-as-personality rather than a system.

Deterministic scan (detect.mjs, exit code 2, 6 findings):
- gradient-text x1 — Landing.tsx:191 (real; absolute ban)
- side-tab x3 — Calendar/DayView.tsx:522 and Calendar/WeekView.tsx:496 use border-l-3, which is NOT a Tailwind v3 default utility and tailwind.config.ts adds no borderWidth scale → likely inert dead classes (an intended side-tab that never renders); TodayView.tsx:2184 border-l-2 border-primary/20 on the details textarea — real but faint
- broken-image x1 — StorageImage.tsx:4 — suspected FALSE POSITIVE (component resolves signed src at runtime)
- bounce-easing x1 — TodayView.tsx:1393 animate-bounce chevron in the recap empty state (real, minor)

Visual overlays: unavailable — no browser binaries installed in this sandbox (ms-playwright empty); source-level review + CLI detector only.

# Overall Impression
Good bones: a coherent warm identity, disciplined tokens, genuine emotional product thinking. The biggest opportunity is twofold: (1) strip the decorative tics so the product register reads confident; (2) give the "photo abstract editorial" ambition ONE deliberate home — the daily recap — instead of sprinkling it (paintings, breathing rules, handwriting fonts) across task UI.

# What's Working
1. Token architecture (src/styles/tokens.css) — documented HSL system with light/dark counterparts and original hex preserved for review. Rare discipline.
2. Dark theme decision — near-neutral OLED ramp with a "whisper of warmth," the why written into the comments. Design thinking, not defaults.
3. EvidenceReviewCard — hides empty stats, calm 1.4s celebration, one reflective question: peak-end rule handled with intent.

# Priority Issues
1. [P1] Gradient text in Landing hero (Landing.tsx:191) — absolute ban, and the first thing visitors see; instant AI tell. Fix: solid --lp-ink headline, emphasis via weight/size only. Command: quieter / typeset.
2. [P1] Decorative infinite motion — today-rule-breathe + today-label-breathe (4s infinite) in tailwind.config.ts; animate-bounce at TodayView.tsx:1393. Product register bans motion that does not convey state; infinite breathing competes for attention on the OLED canvas. Fix: remove, or gate to one-shot state transitions (150–250ms ease-out). Command: animate (audit) then quieter.
3. [P2] Capture-composer cognitive load (TodayView) — emoji + location + photos + links + tags + time all visible at once: >4 decision points on the app's core verb. Fix: text-first, move the rest behind progressive disclosure (InputPlusMenu already exists — lean on it). Command: distill.
4. [P2] Typography sprawl — four families. Fix: one system: Nunito carries UI; reserve Crimson Pro as the single editorial voice for recap/moments (that is where "photo abstract editorial" belongs); drop or strictly scope Nanum Pen Script. Command: typeset.
5. [P3] Side-tab dead classes + faint stripe — border-l-3 x2 inert (delete); TodayView:2184 textarea stripe → replace with a bg tint. Command: polish.
6. [P3] Error-boundary copy (Index.tsx AppSectionErrorBoundary) — "{label} crashed" + raw message. Fix: human sentence + retry action. Command: clarify / harden.

# Persona Red Flags
Mia (busy first-timer, demo route): the floating demo pill (fixed top-3, z-[120]) overlaps page content on short screens; the demo date is pinned to 2026-04-08 with no visible cue it is scripted — risks reading as "wrong," not "demo." Sign-in is the only exit ramp and competes with small banner text.
Devon (daily power user): multiple simultaneous floating timers are intentional (Index.tsx comment) — three timers + composer + recap cards becomes floating-widget soup on a laptop; no visible keyboard path for the core capture loop.
June (returning after a week): the recap empty state is honest ("Nothing logged yet") but the way back in is a single bouncing chevron; OnThisDay/MemoryHorizons reward paths unverified for sparse history — a returning user with two moments could face a thin, echoey page.

# Minor Observations
- Landing palette is fixed warm cream #f8f1e8 — the saturated 2026 AI-default band; established brand so keep, but do not extend cream to new surfaces.
- tokens.css documents an unfinished migration (call sites still inline bg-[#xxxxxx]) — finish it or delete the roadmap comments.
- PublicDemo "Preparing demo..." is unstyled text on a white screen — that is the first paint of the public demo URL.
- Monet painting assets imported into TodayView — verify they earn their bytes on the surfaces where they appear.

# Questions to Consider
- If "today" were one photo with a three-line caption, how much of the current screen would survive?
- What if the recap became the editorial home — full-bleed photo spread, Crimson Pro headline, folio-style date header — while plan/timeline stays strictly product?
- Does EvidenceReview need six stat tiles, or is one sentence + one photo the stronger trophy?
