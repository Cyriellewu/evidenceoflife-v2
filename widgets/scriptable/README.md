# Home-screen widget (Scriptable, iOS)

A large widget with:

- **Map.** Shows where you are, with your places marked by category (🍚 food, ☕️ coffee, 🌳 outdoors, 🏛 culture, 📍 other). In New York, each area you've been to has its own colour.
- **Today.** Up to three of today's todos. Tap a todo to tick it.
- **Three buttons:**
  - **Camera** opens the iOS camera.
  - **Photos** opens your photo library.
  - **Todo** adds a todo to today.

  A photo is saved with your current location, so it shows up in today's Recap and on the Map. If you're within 60 m of a place you've already logged, the photo is filed under that place's name.

## Connect (once)

1. In [Scriptable](https://scriptable.app), create a new script named **Evidence Map** and paste in `evidence-map-widget.js`.
2. In Evidence of Life, open **Map** and tap **Connect widget**. This copies a personal widget key to the clipboard.
3. Run the script once inside Scriptable. It saves the key to the iOS Keychain and clears it from the clipboard.
4. Add a **large** Scriptable widget to the home screen and choose this script.

## How it talks to your account

- **Calls.** The widget calls the `widget-api` edge function with its key in the `x-widget-token` header.
- **Key storage.** The server stores only a SHA-256 hash of each key (`public.widget_tokens`). Each account can have up to 5 keys, and creating a new key retires the oldest.
- **What a key can do.** Read today's todos and your places, add or tick a todo, and add a moment with a photo and location. It can do nothing else.
- **Photos.** Photos are downscaled to 1600 px before upload and stored in your private `moment-photos` folder.
- **Revoking.** Call `widget-api` with `action: "revoke-tokens"` while signed in. If a key stops working, the widget asks you to connect again.
