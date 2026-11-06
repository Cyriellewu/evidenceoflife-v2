# City map widget (Scriptable, iOS)

This is a large home-screen widget that shows the map around where you are. It marks the places you've logged by category:

| Mark | Category |
| --- | --- |
| 🍚 | Food |
| ☕️ | Coffee |
| 🌳 | Outdoors |
| 🏛 | Culture |
| 📍 | Other |

In New York, each everyday area you have been to, such as Upper West Side or Midtown, is shaded in its own colour, like the app's Map view. Neighbouring areas never share a colour. Tapping the widget opens a one-tap capture in the app: take a photo, your location fills in, save — it lands in today's Recap and on the Map.

## Setup

1. In [Scriptable](https://scriptable.app), create a new script and paste in `evidence-map-widget.js`.
2. In Evidence of Life, open **Map** and tap **Copy to widget**.
3. Run the script once inside Scriptable. It reads the clipboard and saves your places on the phone.
4. Add a large Scriptable widget to the home screen, edit it, and choose this script.

After you log new places, tap **Copy to widget** again and run the script once more.

## What it reads

- **Your places.** Only the payload you copy from the app: coordinates rounded to about 10 m, the category, and the place name. It contains no photos and no notes. The widget never signs in or calls the database.
- **Location.** Read on the phone at about 3 km accuracy, to show places within 25 km of you (or all of them if none are nearby).
- **Map tiles.** Esri tiles, cached on the device for 14 days.
- **NYC boundaries.** NYC Open Data neighborhood boundaries, cached on the device for 30 days.
