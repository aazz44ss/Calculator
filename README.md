# Calculator

**Live: https://aazz44ss.github.io/Calculator/**

A Windows 11 style calculator as a web app: plain HTML, CSS and ES modules, no
framework and no build step. It installs to the iOS home screen and keeps
working offline.

- **Standard mode** — 4 × 6 keypad, same key placement as Windows 11.
- **Scientific mode** — 5 × 8 keypad with 2nd / HYP, DEG-RAD-GRAD, F-E and
  stacked brackets.
- **Programmer mode** — 5 × 8 keypad with HEX/DEC/OCT/BIN shown side by side,
  BYTE to QWORD widths, two's complement, AND/OR/XOR/NOT/NAND/NOR, shifts and
  rotations.
- **Exact decimals** — `0.1 + 0.2` shows `0.3` and `0.07 × 100` is `7`, because
  arithmetic runs on a BigInt fixed-point decimal rather than on doubles.
- **Modes from the title bar menu** — the hamburger lists the three keypads,
  there is no tab strip taking up a row.
- **A tape of recent calculations** above the display, newest closest to it, so
  the last few results stay in view; tap one to bring it back.
- **History and memory** — a bottom drawer on phones, a side rail from 720px up.
- **Themes** — light, dark or follow the system, persisted with the mode,
  history and memory in `localStorage`.
- **Keyboard** — the Windows shortcut set, see below.

## Running it

```bash
npm install          # dev dependencies only, the app itself has no runtime deps
npm start            # http://localhost:4173
```

The dev server prints a LAN URL and a QR code so you can open it on a phone.

> A LAN address over plain `http://` is **not** a secure origin, so the service
> worker will not register there: no offline mode and no proper "Add to Home
> Screen" install. Use `http://localhost:4173` on the machine itself, or put an
> https tunnel in front of the server when testing on a device.

### Publishing on GitHub Pages

The app is a static site, so the simplest route needs no workflow at all:
**Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder
`/ (root)` → Save**. It then lives at `https://<user>.github.io/<repo>/`.

If you would rather deploy from Actions, set the source to "GitHub Actions"
instead and run the *Deploy to GitHub Pages* workflow, which publishes only the
app shell. That first setup click cannot be automated: creating a Pages site
through the API also requires repository administration rights, and the Actions
`GITHUB_TOKEN` never has them, so the workflow is manual (`workflow_dispatch`)
and says so when the site is missing.

Every path in the app is relative, so being served from a subdirectory needs no
changes: the service worker registers with the `/<repo>/` scope, the manifest's
`start_url` and `scope` resolve to the same folder, and the icons sit next to
them. Pages serves over https, which is a secure origin, so offline mode and
"Add to Home Screen" both work there — unlike a plain `http://` LAN address.

GitHub Pages needs a public repository unless the account has a paid plan.
`.nojekyll` is committed so the files are published untouched.

### Install on iOS

Open the site in Safari, tap **Share → Add to Home Screen**. The app then runs
full screen, and the service worker keeps the whole shell cached for offline
use. `icons/apple-touch-icon.png` (180×180) is linked from the HTML because
Safari prefers that link over the icons in the web manifest.

## Layout of the project

```
index.html                the shell: display, keypad container, panels, PWA meta
styles/app.css            Fluent-flavoured styling, theme tokens, responsive rules
manifest.webmanifest      PWA manifest
sw.js                     precaches the shell, stale-while-revalidate afterwards
src/decimal.js            BigInt fixed-point decimal + angle aware maths
src/programmer.js         BigInt integer maths: bit widths, bases, bitwise ops
src/format.js             display strings: 16 significant digits, grouping, F-E
src/engine.js             pure calculator state machine, never touches the DOM
src/layout.js             keypads and keyboard bindings as data
src/app.js                the only module that talks to the DOM
scripts/serve.js          zero-dependency dev server (LAN URL + QR code)
scripts/generate-icons.js draws the icon and rasterises the PNG variants
test/decimal.test.js      decimal arithmetic and formatting
test/engine.test.js       state machine behaviour
test/programmer.test.js   bit widths, bases and the programmer keypad
test/shell.test.js        keeps sw.js precaching every module the page loads
test/browser.test.js      WebKit end-to-end suite + a Chromium offline check
```

### Architecture notes

`src/decimal.js` stores a value as `n / 10^scale` with `n` as a `BigInt`, so
addition, subtraction and multiplication are exact. Division and square roots
are computed to 40 decimals and rounded half away from zero; the display shows
16 significant digits. Trigonometry and logarithms fall back to double
precision and then snap the result, except that degree and gradian angles are
first reduced against a quarter turn with exact decimal arithmetic — that is
what makes `sin(180°)` exactly `0`, `cos(180°)` exactly `-1` and `tan(90°)`
report `Invalid input`.

`src/engine.js` is a pure state machine with immediate-execution semantics, the
same as Windows Calculator: `2 + 3 × 4 = 20`, and `=` repeats the previous
operator and operand. Percentages follow the same rules as Windows too:
`50 + 10% = 55` (a share of the first operand) while `50 × 10% = 5` (a plain
division by 100). After `=` the expression line keeps showing `12 × 12 =` until
a new calculation starts, which is what the engine's `settledExpression` field
is for.

`src/programmer.js` does the same job for programmer mode, on plain BigInts
read as two's complement numbers of the chosen width. That is why `NOT 0` is
`-1` in DEC and `FFFF FFFF FFFF FFFF` in HEX at the same time, why `200` becomes
`-56` when you switch to BYTE, and why division truncates instead of rounding.
The keypad greys out whatever the active base cannot accept, so `A`-`F` only
light up in HEX and `8`/`9` go dark in OCT.

`src/layout.js` holds every key as data — label, accessible name, engine action,
2nd/HYP variants and keyboard bindings — and both the renderer and the keyboard
handler read from it, so a key cannot behave differently depending on how it was
pressed. Keys that only exist in scientific mode are rejected by the engine
while standard mode is active.

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `0`–`9` `.` | digits | `Esc` | C |
| `+ - * /` | operators | `Delete` | CE |
| `Enter` `=` | equals | `Backspace` | backspace |
| `R` | 1/x | `Q` | x² |
| `@` | √ | `F9` | ± |
| `%` | percent | `!` | n! |
| `Ctrl+M` | MS | `Ctrl+P` | M+ |
| `Ctrl+Q` | M− | `Ctrl+R` | MR |
| `Ctrl+L` | MC | `H` | history panel |
| `Alt+1` `Alt+2` `Alt+3` | standard / scientific / programmer | | |

Scientific keypad only:

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `S` `O` `T` | sin / cos / tan | `N` `L` `G` | ln / log / 10ˣ |
| `Y` `^` | xʸ | `X` | exp |
| `(` `)` | brackets | `P` `E` | π / e |
| `I` | 2nd | `V` | F-E |
| `F3` `F4` `F5` | DEG / RAD / GRAD | | |

Programmer keypad only:

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `A`–`F` | hex digits | `&` `\|` `^` `~` | AND / OR / XOR / NOT |
| `<` `>` | shift left / right | `M` | mod |
| `F5`–`F8` | HEX / DEC / OCT / BIN | `F2` `F3` `F4` `F12` | BYTE / WORD / DWORD / QWORD |

Shortcuts belonging to another keypad do nothing, which is why `F3` can mean
RAD in scientific mode and WORD in programmer mode.

## Tests

```bash
npm test          # 88 unit tests: decimals, formatting, state machine, bases
npm run test:e2e  # 22 WebKit end-to-end tests + 1 Chromium offline test
```

The end-to-end suite drives the real dev server through Playwright and covers
six viewport widths from 320px to 1280px (no horizontal overflow, keys keep
their aspect ratio), touch and keyboard input, all three modes, persistence
across reloads, the manifest and iOS meta tags, service worker precaching and an
offline reload. It also asserts that the console stays free of errors.

The browsers have to be downloaded once:

```bash
npx playwright install chromium webkit
```

## Details that are easy to get wrong

These are all covered by tests, so they stay fixed:

1. The iOS install hint sits in the normal layout flow. As an absolutely
   positioned banner it covered the equals key and swallowed taps.
2. The keypad height is derived from its width with `aspect-ratio`
   (key height ≈ key width × 0.95) plus `max-height: 100%`, and the tape above
   it uses `flex-basis: 0` so it can only take space the keypad does not want.
   Otherwise keys stretch into tall strips on phones with a lot of vertical
   room, or a long history squeezes them flat.
3. A browser tab is much shorter than the screen because of the URL bar, which
   left the tape with zero height and no visible history at all. It now keeps a
   minimum of a few lines once it has entries, and the keypad gives up the
   difference; the browser suite checks three short viewports.
4. `<link rel="apple-touch-icon">` in the HTML wins over the manifest icons in
   Safari, so that file has to exist at 180×180.
5. Degree and gradian angles are reduced against a quarter turn with exact
   decimal arithmetic before any double precision maths happens.
6. Playwright's WebKit cannot reload after `setOffline(true)` (it throws an
   internal error), so the offline reload test runs in Chromium while the
   WebKit suite asserts that the cache holds the complete shell.
7. `http://` on a LAN address is not a secure origin, so no service worker
   there — the dev server says so explicitly.
8. The expression line keeps `12 × 12 =` after pressing equals until a new
   calculation begins.
