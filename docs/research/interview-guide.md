# Interview guide

Two kinds of sessions live here. Use **Part A** to understand how people manage
their days today, before showing them anything. Use **Part B** to watch someone
use Evidence of Life for the first time, with tasks that map to our activation
definition (≥ 1 plan item and ≥ 1 moment within 72 h of signup; see
[`../metrics/metric-definitions.md`](../metrics/metric-definitions.md)).

Evidence of Life is a planner and daily recap app for adults who struggle with
time blindness, including many with ADHD. It is **not** a medical tool, and these
sessions are not clinical research.

## Ground rules (both parts)

- **Do not ask about diagnosis or medication.** If a participant brings it up,
  listen, don't probe, and don't write it down.
- Ask about **what they actually did** recently, not what they would do or might
  want. "Tell me about the last time…" beats "Would you use…?"
- Keep questions **neutral**. Avoid wording that hints at the answer you hope for
  ("Isn't it frustrating when…?").
- Follow up with "What happened next?", "Why do you think that was?", "Can you
  show me?" Silence is fine; let them fill it.
- Don't pitch, defend, or explain the product. You are there to learn.
- Get consent first ([`consent-form.md`](consent-form.md)). Use a pseudonym in all notes.
- Fill in a [snapshot](interview-snapshot-template.md) right after each session.

## Part A: Problem interview (about 20 minutes)

Warm up with one or two easy questions about their work or study routine, then
move through these. Pick what fits; you don't need all of them.

1. Walk me through yesterday from when you woke up. What did you plan to do, and
   what actually happened?
2. The last time you planned a day, where did that plan live (paper, phone,
   calendar, your head)? Can you show me?
3. Tell me about a recent time you lost track of time. What were you doing, and
   how did you notice?
4. When a plan falls apart halfway through the day, what do you usually do next?
5. What tools or tricks have you tried for planning or keeping track of time?
   Which ones did you stop using, and what made you stop?
6. Which of those are you still using today? What keeps that one around?
7. At the end of a day, how do you know what you got done, if at all?
8. Tell me about the last time you looked back on a day or a week. What prompted
   it, and what did you look at?
9. When did you last miss something you'd meant to do? What happened around it?
10. Is there anything about how you handle your days that we haven't talked about
    and you think matters?

Close by thanking them and asking whether they'd be open to trying an early
product in a later session (Part B).

## Part B: Usability session script (30 minutes)

**Setup (before they join):** a clean browser profile, the landing page open, a
fresh email inbox the participant can access (signup requires confirming the
email), screen recording ready if they consented. Note-taker uses the snapshot
template.

### Intro (about 3 minutes, in your own natural words)

- Thank them. Explain we are testing the product, not them; nothing they do is
  wrong, and confusion is useful to us.
- Ask them to **think aloud**: say what they're looking at, expecting, and
  wondering.
- Explain you will mostly stay quiet and won't help unless they're fully stuck,
  because we need to see what happens without us.
- Remind them what is recorded and that they can stop at any time.
- Remind them we will not ask about diagnosis or medication.

### Tasks (about 20 minutes)

Read each task aloud as written. Don't name buttons or point at the screen.
Note time taken, where they hesitate, and what they say.

**Task 1 — "Starting from this page, create an account."**
Watch for: whether the landing page explains what the app is for; which signup
path they choose (email or Google); how they react to the "check your email"
step; whether the confirmation email arrives and where they land after clicking
it; whether they give up.

**Task 2 — "Add one thing you want to do today."**
Watch for: whether they notice the first-run checklist ("Get started") at the top
of the Plan list; whether they use it or go straight to the composer; whether
they understand where the item landed (list vs. timeline); any confusion about
setting a time.

**Task 3 (optional) — "Start a timer on it."**
Watch for: whether they find ▶ on the task without help; whether they understand
the timer is running; whether they find how to stop it. Skip this if time is
short; it is not part of activation.

**Task 4 — "Log a moment of what just happened."**
Watch for: whether they find the capture entry (记录 / Log, or "Log a moment" in
the checklist); whether "moment" makes sense to them; what they type; whether
optional fields (mood, photo, location) help or distract; whether they see the
moment appear on their timeline.

**Task 5 — "Find today's recap."**
Watch for: whether they find the Recap pane or the checklist's "See today's
recap" link; what they expect to see there; whether planned vs. actual makes
sense to them; their first reaction in their own words.

### Wrap-up (about 5 minutes)

- "What was the hardest part?" / "What stood out, good or bad?"
- "Is there anything you expected to find and didn't?"
- "Thinking of your last week, when, if ever, would you have opened this?"
- Thank them; mention compensation if any.

> TODO (owner): decide recruiting channels and compensation before scheduling sessions.

### After the session

- Mark **activation reached Y/N** in the snapshot (plan item + moment both created).
- Delete or securely store the recording outside the repo; never commit it.
- After 3–5 sessions, fill in [`session-synthesis-template.md`](session-synthesis-template.md).

---

Method adapted from Columbia AI Startup Studio coursework (rewritten; no course text reproduced).
