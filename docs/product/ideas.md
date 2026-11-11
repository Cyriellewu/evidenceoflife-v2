# Ideas

Ideas the owner raised that are not built yet. Each entry says what is
possible with the app as it is (a web app / PWA, no native iOS app) and what
would need more.

## Ask to log a photo right after it's taken

**Idea (owner, 2026-11):** after taking a photo, the app asks "save this as a
moment?" so capturing a memory costs one tap.

**What a web app can and can't do**

- A web app cannot watch the camera roll or get notified when a photo is
  taken. iOS gives that only to native apps (PhotoKit change observers), and
  even they can't pop a prompt over the Camera app.
- iOS Safari does not support the Web Share Target API, so the PWA can't
  appear in the iPhone share sheet. (Android Chrome does support it.)

**Ways to get close, cheapest first**

1. **iPhone Shortcut in the share sheet (works today, no app needed).**
   The `widget-api` edge function already has `add-moment`, which takes a
   photo, optional text and location with a per-user widget key (see
   `supabase/functions/widget-api/index.ts`). A Shortcut "Save to Evidence of
   Life" that accepts images from the share sheet can call it: in Photos,
   tap Share → Save to Evidence of Life → optional caption. Two taps, no
   prompt after every photo. Needs: a published Shortcut + a short setup
   guide; the key is minted from Map → Connect widget.
2. **Android: Web Share Target.** Declare `share_target` in the PWA
   manifest so the installed app shows up in the Android share sheet.
3. **"Recent photos" nudge in the app.** When the app opens, a quiet row
   "Add today's photos?" opens the photo picker filtered to today. The page
   still can't see photos until the user picks them.
4. **Native iOS app (later).** A small app could watch for new photos and
   send a notification "Save this as a moment?". Needs an Apple developer
   account ($99/year).

**Open questions:** prompt after every photo would be noisy; a daily
"you took 6 photos today — add any?" may be the better default.
