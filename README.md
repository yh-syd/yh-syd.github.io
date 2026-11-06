# Water Words

A wall of words that moves like water. Grab a word and drag it through the others: each letter sits on a spring, so the words it hits bend out of the way, then drift back home. A soft light follows the cursor and brightens the letters under it.

**Live:** https://yh-syd.github.io/

## Use it

- Hold the left mouse button, or touch with a finger, to pick up the biggest word within 60 px, then drag it through the others. Drag it around fast to charge it. Fast dragging builds power, shown by a bar at the top of the screen: the word grows, shakes and heats from yellow through orange to red. Slow down and it cools and shrinks again, so holding still never sets it off. When the bar fills, the word bursts into loose letters and pushes everything near it away. Then all the words drift back home.
- The **⚙ settings** button (top right) opens the settings; a click outside closes them. Your changes stay in your own browser (localStorage); **reset** clears them.

## Change it

Everything you would want to change is in `config.json`:

- `words`: one plain list of words.
- `sizes`: how the sizes are shared out. On every load the list is shuffled and 200 words are dealt sizes: each row takes its `share` of them and gives each a random size within its `size` range (0 is the smallest, 1 the biggest). Every word also turns up as small filler in the gaps. So the words, their sizes and their spots change on each load, while the overall mix of big and small stays the same.
- `fun`: a few titles placed first, each load at a random spot and a random size within `size`.
- `settings`: the default, range and label of every switch and slider in the menu.
- `colours`: the letter colours.

## Run it locally

No build step and no dependencies. The page loads `config.json`, so serve the folder over http:

```bash
python -m http.server
```

Then open http://localhost:8000.

## How it works

`water.js` does three things:

1. **Places the words.** Big words go first along a spiral from scattered start points. Small words then fill the gaps. Each word has a pixel mask, so letters pack tightly.
2. **Moves the letters.** Each letter is a small body on a spring to its home spot. Letters in one word are linked, so a word bends instead of breaking apart, and letters push each other away. Only letters the dragged word touches wake up. Letters at rest stay on a cached canvas; only moving letters are redrawn each frame.
3. **Lights the cursor.** The light is a small circle with a CSS `backdrop-filter` that brightens whatever is under it, so it costs no script time.

With `prefers-reduced-motion` set, the letters stay still and only the light moves.

## Analytics

The page loads Google Analytics (GA4) to count visits. Nothing you do on the wall is sent.

## Licence

MIT
