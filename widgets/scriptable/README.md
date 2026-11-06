# City map widget (Scriptable, iOS)

This is a home-screen widget that shows the map around where you are. Each place you've logged is marked by its category:

| Mark | Category |
| --- | --- |
| 🍚 | Food |
| ☕️ | Coffee |
| 🌳 | Outdoors |
| 🏛 | Culture |
| 📍 | Other |

It uses the same light or dark gray base map as the app's Map view. Tapping the widget opens the app.

## Setup

1. **Enable sign-in codes.** In the Supabase dashboard, go to **Authentication → Email Templates → Magic Link** and add `{{ .Token }}` to the email body, for example `Your code: {{ .Token }}`. The widget signs in with that 6-digit code. It can't follow a link.
2. **Create the script.** Make a new script in [Scriptable](https://scriptable.app) and paste in `evidence-map-widget.js`. Then fill in `SUPABASE_URL` and `SUPABASE_KEY` with the project URL and **publishable (anon) key**, the same public values as `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Never use a service-role key here.
3. **Sign in once.** Run the script inside Scriptable. Enter your email and then the code you receive. The widget gets its own session, stored in the iOS Keychain, so it never shares or rotates the web app's session.
4. **Add the widget.** Add a Scriptable widget (medium or large) to the home screen, edit it, and choose this script.

## What it reads

- **Data.** Each refresh runs one query, `places?select=name,category,lat,lng`. Row-level security limits it to your own places. The result is cached on the phone, so the widget still shows the last map when offline.
- **Location.** Your location is read at about 3 km accuracy and is only used on the phone. The widget shows places within 25 km of you, or all places if none are nearby.
- **Map tiles.** Tiles come from Esri and are cached on the device for 14 days.
- **Refresh rate.** The widget asks iOS for a refresh about every 30 minutes, though iOS decides the actual timing.

## Signing out

Delete the script, or remove the Keychain item `evidence-of-life.widget.refresh-token` with `Keychain.remove(...)` in a Scriptable scratch script.
