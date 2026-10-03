# Objectives

Where blueprint42 goes next: closer to a game, fun to use, and every picture
clear about what it means. Sizes are rough: **S** a session, **M** a few,
**L** a milestone.

Skin polish is not on this list. It's optional and guided by the author one
skin at a time; `docs/SKINS.md` says which skins are reviewed.

## Next (2026-10-03): smooth in every browser

The main objective: every skin plays smoothly in Chromium and in Firefox
(Zen), focus mode and zooming included, and a frame's cost is measured on
the GPU as well as in JS. No new looks: pictures stay the same (pixcmp),
and each step gives its numbers before and after, in Chromium and in Zen.

Why now. In Zen (the author's browser), PS3 in focus mode on the line
reader project drops to 20 fps when it dims and zooms. Measured 2026-10-03
in headless Zen on the RTX 4060 (scratch copies of `tools/bench.mjs`;
`--sample reader-project --mode focus`):
- PS3 and PS4 run at 20 fps (worst frame 100 ms); Minimal 60. Our JS is
  about 4 ms a frame; GFX Simple or Off gives 60, and so does forcing the
  page layer onto WebGL2. PS2 (WebGPU, the grid's layer) gives 60.
- The page layer (decision 045) draws every other frame (30 a second, by
  design). Frame by frame: `17 66P 17 66P 17 83P 17 99P …` (P: the
  background drew): every frame after one that didn't draw it takes 66–100
  ms. Firefox seems to wait for a WebGPU canvas that didn't present until
  a timeout; it only shows while the grid redraws every frame (playing,
  dimming, zooming). PS2 draws every frame while playing, so it never hits
  this. Not the sparkles (merged into one draw: no change), not `#page-bg`
  over it (hidden: no change), not GPU work (ten frames in a row cost
  about what one does).
- Drawing the page layer every frame (a temporary edit): PS4 60, PS3
  47–54 (noisy single runs).
- Headless Chromium on the GPU: PS3 about 130–140 fps, so Chromium's bench
  never saw it. The headed bench can't run from an agent's session (no
  terminal window to put the browser beside); headless Zen can.

Steps, in this order (1 and 2 first: 2 is the reported lag):
1. [ ] **Measure in Zen, and on the GPU** (S). `tools/bench.mjs
   --headless` (Zen with `--headless`, Chromium with the GPU flags), a
   `--pre <js>` to switch parts off from the command line (as the scratch
   copies did), and which backend drew the page and grid layers in its
   report. The GFX readout gives the GPU's own time where the browser can
   (WebGPU `timestamp-query`, WebGL2 `EXT_disjoint_timer_query_webgl2`),
   else says it can't. Done when one command prints the table above.
2. [ ] **The page layer draws every frame the grid draws** (S). While the
   grid redraws (playing, moving, input), PS3's and PS4's background draws
   with it; at rest it keeps 30 (check at rest in Zen that a frame without
   it doesn't stall input). A note in decision 045 (its 30 fps "by
   design"). Done when PS4 holds 60 in Zen in focus mode, and Chromium's
   extra cost is measured (expected about 1 ms of CPU a frame).
3. [ ] **PS3's remaining gap** (S). With step 2, PS3 was 47–54 in Zen
   against PS4's 60. Find what's left (the backdrop shader's cost at full
   size, the frame pass's copy, the grid's PS3 drawing in Firefox) with
   step 1's tools. Done when PS3 holds 60 in Zen, or the cause is written
   here with what fixing it would take.
4. [ ] **A frame-rate cap while playing** (S). A setting: 60, 120 or the
   screen's rate (the author's is 240 Hz, where the grid is redrawn up to
   240 times a second while playing). Playback is timed per event, so the
   picture is the same, only fewer of them. Done when 60 on a 240 Hz
   screen draws a quarter of the frames and pixcmp is unchanged.
5. [ ] **GPU layer tidy-ups** (S). A scene with no regions (PS4) draws its
   backdrop straight to the canvas (no offscreen image and full-screen
   copy); both layers share one GPU device; pipelines are built ahead
   (`createRenderPipelineAsync`) so a skin's first switch doesn't hitch;
   `#page-bg` hidden while the GPU draws (no change in Zen; measure the
   compositing in Chromium). Done when each is measured, and kept only if
   it saves something.
6. [ ] **Heavy skins' effects** (M). Gradients built once per size, not
   per frame; blur shadows (`shadowBlur`: aqua, amp, the Macs, PS3's tiles
   and jelly icons) become pre-drawn shadow images stretched to fit
   (9-slice). Firefox pays more for gradients (the skin picker says so).
   The heavy skins from `tools/bench.mjs --skins all` first. The look
   doesn't change (pixcmp; reviewed skins with the author's OK); each pass
   logged in `docs/SKINS.md`. Done when the heaviest skins' frame cost
   drops in both browsers.
7. [ ] **Synthwave's background on the GPU** (M), as decision 044's next
   step, matched against the canvas original as PS3 and PS4 were.
8. [ ] **Draw what changed** (L). Each machine and belt drawn once into
   its own bitmap per zoom step, redrawn only when it changes; a frame
   mostly copies bitmaps, and panning shifts what's there and draws the
   strip that comes into view. The skins draw as they do now. A later
   step (the author is interested): tiles of these composited on the GPU,
   which revises decision 044's "nothing else runs on the GPU" (a new
   decision). Done when a frame's cost follows what moved, not what's on
   screen, and pixcmp says 0 differing at rest.
9. [ ] **three.js for the backgrounds?** (S, the author's call). Worth it
   only if GPU backgrounds spread to many skins: its WebGPU renderer falls
   back to WebGL2 by itself, and its shader language (TSL) writes each
   shader once instead of in WGSL and GLSL by hand. It wouldn't help the
   grid (a 2D diagram; text there would be glyph-atlas text). A deviation
   from the stack: a decision either way.

Dropped (the author, 2026-10-03): backgrounds drawn at half resolution.
Not planned: a GPU renderer of our own for the grid, or PixiJS (every skin
rewritten, text from a glyph atlas).

Rules for these steps:
- Pictures don't change: pixcmp says 0 differing; `npm run check` and
  `npm test` pass.
- Every number before and after, in Chromium and in Zen; headless
  Chromium only on the GPU flags (its software compositor misleads).
- One step per commit series; each leaves the app working.

## Next (2026-10-03): fast at any size

The main objective: a frame costs what's on screen, not what's in the
program, and a long run never stops the page. No new features and no new
looks: every step keeps the pictures and the behaviour the same, proves it,
and says what it saved with the same measurement before and after (step 1
first, so the others can be measured).

Why now. Measured 2026-10-03 with throwaway scripts, on generated projects
(files of 5 Norm-sized functions, each calling the next one and one in the
next file), in Node and in headless Chromium (JS time only: headless paint
isn't the author's):
- A frame redoes whole-program work even when nothing moved. The scene
  (every host, and every belt's route: `route.ts` `buildScene`) is built 3
  times a frame: by `frameState`, by the minimap, and by `activeHostRect`,
  which the minimap calls. `sceneAt` builds it twice while a live call has
  no belt of its own (from a recursion copy, or through a function
  pointer), and a mouse move builds it twice more (`entityAt`,
  `stationAt`). 50 files with every module open (251 machines, 495 belts):
  18.6 ms a build, 21 frames a second headless, the slowest 117 ms. 500
  machines: 69 ms a build.
- At M5's own size (50 files, collapsed) a frame walks the whole node list
  208 times. `Layout.nodesOf` copies and filters every node, once per
  module, in `moduleRect` and `wall` (inside `buildScene`) and in
  `moduleInfo` and `wallInfo` (the paint passes). `draw` alone is 11 ms of
  JS there, 5 of it the modules pass.
- Belt crossings are found pair by pair every frame (`render.ts`
  `passBelts`): with everything on screen, 40 ms at 495 belts, 140 ms at
  990.
- A keystroke re-walks every file's tree. Parsed files are cached, but
  `structTable` (from `attachFields`) visits every node of every tree on
  each edit (9.4 of the 11 ms at 250 functions), so an edit costs as much
  as parsing everything: 16 ms at 250 functions, 33–36 ms at 500.
- A gdb window of 20,000 steps takes 18 s to record (about 1,100 steps a
  second) and arrives as 5.6 MB. Then `convertGdb` (0.74 s) and
  `timelineOf` (0.5 s) run on the main thread, so the page stops for about
  1.25 s; about 30 MB once converted. The window cache (`session.ts`) keeps
  raw responses: a prefetched window is converted only when playback
  reaches it (the pause lands exactly at the edge), and going back to a
  window converts it again.

Already fine, left as is: tree-sitter itself (about 0.06 ms a function); a
long trace's frame (`frameState` 0.1–0.3 ms at 33,000 events: snapshots are
made once and share what didn't change); collapsed modules' scenes (1–4 ms);
layout sync; `validateTrace`. web-tree-sitter frees old trees itself (a
FinalizationRegistry), so re-parsing doesn't leak. The interpreter's 4,000
events are by design (long runs are gdb's). The disk poll walks the folder
every 2 s, fine under `project.mjs`'s 800-file cap. A new picture costs the
kit (22 of the 26 skins are `makeSkin`) plus the 4 hand-written skins.

Steps, in this order (2–4 save the most for the least work):
1. [x] **Measure at size** (S). Done 2026-10-03: `tools/scale.mjs` (parts
   code, frame, gdb and window; `--b HEAD` measures two versions in one
   run). It measures in the app's own page (the engine the app runs in,
   rather than Node), crossings as the belts pass of frames with the grid on
   screen, and long tasks with the browser's own observer.
   `tools/pixcmp.mjs --folders … --open` compares a project's pictures; the
   dev profiler times the whole frame (playbar, minimap, feed…) and keeps
   the slowest frame part by part (`__ftb.diag().worstFrame`).
   `test/scale.test.ts` counts the work each step below removed.
   `tools/scale.mjs` generates projects of a
   given size in the OS temp dir (never `samples/`) and prints the numbers
   above: parse (cold, one edit), layout sync, a scene (collapsed, open)
   and crossings in Node; per frame in headless Chromium (the dev server
   opening the generated folder): scene builds, node sweeps and who makes
   them, `draw`'s JS time; one gdb window of 2,000 to 20,000 steps: record
   time, bytes, `convertGdb`, `timelineOf`, memory. Paint stays
   `tools/bench.mjs`'s job (a real window). Done when one command prints
   these tables on today's code, and each step below gives its before and
   after with it.
2. [x] **One scene per change** (M). Done 2026-10-03 (decision 049):
   `buildScene` keeps each layout's last few scenes, keyed on `Layout.rev`
   (`touch()`, `setRoute`), the model, the trace, folded and shut machines
   and the live pairs; `computeScene` builds one for real. A frame and a
   mouse move build none (3 before); dev builds report a layout change made
   without `touch()`. `geomOf`'s fold key was left as it is (a join of a
   set that's usually empty). Steps 2–6 were measured together, HEAD → now,
   ms of JS a frame: 100 files open 98.1 → 6.4, collapsed 20.5 → 9.7; 50
   files open 32.0 → 6.6, collapsed 8.5 → 5.2. Pixels: the samples in every
   skin 1,485 frames, 0 differing; a 30-file project with every module
   open, 660 frames (one run had 3 PS4 frames differ by glyphs, which three
   reruns didn't repeat: a font loading at another moment).
   `sceneAt` keeps its last scene and
   builds again only when something it reads changed: the layout (a
   revision number, bumped by every `Layout` method that moves, opens,
   closes, pins or re-routes anything; the writes from outside, the
   restores in `sample-ui.ts` and the waypoints in `main.ts`, become
   methods), the model, the trace, the folded and shut machines
   (`machine.ts`; `geomOf`'s fold key becomes that number, not a string
   joined on every call) and the live pairs. Whatever calls `buildScene` or
   `computeBelts` directly (`stageRect`, `fit`, `panels.ts`, `main.ts`)
   goes through it too. Done when a test counts builds (a counter in
   `buildScene`) through what a frame and a mouse move call (`frameState`,
   `activeHostRect`, `entityAt`, `stationAt`): 1 for a new state, 0 for the
   same one again, 1 after a `setPos`; a drag still routes live; pixcmp
   says 0 differing. Estimate: 2–3 builds a frame saved, about 40–55 ms at
   250 open machines and 3 ms at 50 collapsed files.
3. [x] **Nodes by file** (S). Done 2026-10-03: the node map counts machines
   added and removed, and `nodesOf` reads a per-file index rebuilt only
   then; `fileCap` counts once per model. A frame's sweeps of the node
   list: 407 → 0 at 100 collapsed files (207 → 0 at 50); the test counts
   them at 10 and 50 files. `Layout` keeps each file's nodes as it keeps
   `nodes`, so `nodesOf`, `wall` and `moduleRect` look them up instead of
   scanning, and `fileCap` (`norm.ts`) counts once per model, not once per
   module per frame. Done when a frame's sweeps of the node list don't grow
   with the number of modules (208 at 50 files today) and the modules pass
   is under 1 ms there.
4. [x] **Crossings once per scene** (S). Done 2026-10-03: `crossingsOf`
   (once per scene, through a grid of cells) and `gapsFor` (a frame's gaps
   for its drawing order): the same points in the same order as the
   pairwise loop for any order (tested), from under a tenth of the pairs;
   the next frame tries none. Belts pass, 100 collapsed files: 9.3 → 4.7 ms
   a frame. Which belts cross and where is
   worked out when the scene is built, and kept with it (found through a
   grid of cells, each segment in the cells it passes, not every pair). A
   frame only picks each belt's crossings with the belts drawn after it:
   the order changes with what's live, the crossings don't. Done when the
   belts pass no longer grows with the square of the belts on screen and
   the gaps are the same (pixcmp 0 differing).
5. [x] **An edit parses one file** (S). Done 2026-10-03: each tree's
   structs and typedef names are kept with it (an anonymous struct's key
   unique to its tree), its type definitions too, and `bufferShapes` once
   per model (the inspector asked for it per variable, every step). One
   edit: 500 functions 34.1 → 1.3 ms, 250 functions 16.9 → 1.2 ms; the
   test counts one struct walk per edit. Each file's struct and union tags
   and typedef names are kept with its parse (`unitCache`), and the
   project's table is merged from them (anonymous structs numbered per
   file). Done when one edit at 500 functions costs one file's parse plus
   linking, not 33 ms, with `test/structs.test.ts` and the project tests
   unchanged.
6. [x] **Routing that scales** (M). Done 2026-10-03: obstacles in a grid of
   cells (`Near`), taken corridors by half-cell row, an edge's verticals by
   a map. A fresh scene, 500 machines open: 70.3 → 11.8 ms (250: 18.8 →
   8.0). The same scenes field for field as the old code, checked on every
   sample and on generated projects up to 60 files (open, half open,
   dragged, hand-routed, live extras, folded); the test checks the work
   grows with the program, not its square. In `buildScene` each edge finds its
   verticals through a map (not `verts.find` over all of them), and
   obstacles through a grid of cells (not every obstacle, per edge and per
   corridor try, up to 120 tries a corridor). It still matters after step
   2: a drag builds on every move, and opening, packing and tidying a big
   project build too. Done when a build at 500 open machines is well under
   today's 69 ms and the routes are the same (`test/route.test.ts`, pixcmp
   0 differing).
7. [x] **Long runs without a pause** (M). Done 2026-10-03, in slices rather
   than a worker: a structured clone of a converted 20,000-step window
   takes 240–260 ms (a worker's round trip 460 ms), one block the page
   can't split, and a worker would need its own parser for the model.
   `src/slices.ts` runs generators between frames: `convertGdbSliced`,
   `timelineSliced`, `validateSliced` (dev), and `jsonSteps` (a window's
   answer, its stops a piece at a time: the same value as `JSON.parse`).
   `main.ts` `windowTrace` converts a window and works out what its first
   frames need (deepest stacks, return cards, the kill feed, the playbar's
   bars, the past values of the frames alive at its end) before it's
   shown, the next one while this one plays; the window shown and its
   neighbours stay converted. A row's past values are scanned from its
   text alone, skipping snapshots that share its frame. Measured
   (`--parts window`, 20,000-step windows, HEAD → now): the first window, 3
   long tasks (the longest 790 ms) → none; playing into the next, 3 (745
   ms) → none, no wait at the edge; back a window, 676 ms → 11 ms, none.
   Left: a jump far into a window still costs its first frame one 58 ms
   task (181 before). Nothing a window does blocks the
   page for more than about 50 ms. First measure what sending a converted
   20,000-step trace from a Web Worker costs (a structured clone keeps its
   Maps and shared snapshots; the beats are plain data and typed arrays).
   If it's small, `convertGdb` and `timelineOf` run in a worker that parses
   the sources itself (a `Model` holds tree-sitter nodes and can't be
   sent), prefetched windows included. If not, `convertGdb` works in
   slices between frames and playback starts after the first. Either way
   the cache keeps converted traces for the window playing and its
   neighbours. Done when loading a 20,000-step window shows no long task in
   the browser's profile, playback crosses into the next window without
   stopping, and going back a window doesn't convert again.
8. [x] **Faster recording** (L, the author's call). Done 2026-10-03
   (decision 050): none for now, the author's call. With windows converted
   ahead, playback no longer waits on recording; it shows only when a run
   starts and after a far jump. The three ways past it are weighed there
   for when that becomes the pain. gdb's line step is the
   ceiling: recording runs at about 1,100 steps a second and stepping with
   nothing recorded at 1,500–2,000 (decision 043), so even free recording
   would be at most about 2× faster. Going further needs another way to
   reach each line, each with its own decision in `docs/decisions/`
   (principle 4; the student's source stays untouched):
   - windows in parallel: record the run once with `rr` (close to full
     speed; needs the CPU's performance counters), then several replays
     each step through their own window at the same time;
   - the program reports its own lines (a hook the compiler adds to each
     block) and gdb reads memory only there: much faster, but the binary is
     no longer the plain `-g -O0` build, so the picture has to be shown to
     still be what really runs.

   Done when the author has picked one, or none, recorded as a decision.

Rules for these steps:
- Pictures and behaviour don't change: pixcmp says 0 differing for each
  step, and `npm run check` and `npm test` pass.
- A cache keys on everything its result depends on, or clears on the event
  that changes it (as text fitting clears on a font load).
- Each step's Done note gives step 1's numbers before and after; the
  estimates above are only estimates.
- One step per commit series; each leaves the app working.

## Next (2026-10-01): nice to have

The main objective: answer the questions a 42 student really asks of a run
("when did this change?", "why is it garbage?", "does it leak?", "does it
pass my tests?"), from data the trace already has. Every picture obeys the
hard rule (SPEC principle 4: draw less, never something false); new
pictures are prototyped in Minimal and Barebone; every step is checked with
`tools/pixcmp.mjs` (other pictures unchanged), the frame tests and the
contract tests. A browser opened to look goes to the terminal's desktop.

In this order (the first three are the most value for the least work):
1. [x] **When did this change?** (S). Done 2026-10-01: `src/history.ts`
   (`changesOf`: every call's copy of a local, a static, a block; under gdb
   the change is credited to the line before the stop; a pointer's value is
   its address, so freeing its block isn't its change), the row's menu item,
   pins on the timeline, a chip that steps through them (`src/changes-ui.ts`).
   `test/history.test.ts`: main's `list` changes 4 times, each by a `list =`
   line. Right-click a variable (a storage row,
   a heap card, a static): "show when it changed". The timeline marks every
   write to it (the cell's `write` events, and gdb steps where its value
   moved); next/previous write jumps there, with the statement that did it
   lit. Done when a test finds every write to `list->next` in the list
   sample, and the marks match the trace.
2. [x] **The end report** (M). Done 2026-10-01: `src/report.ts`
   (`endReport`: how it ended, each leak with its size, where it was malloc'd
   and when it was lost) and the card at the run's end (`src/report-ui.ts`),
   each row a jump. `test/report.test.ts` on the lost, crash and leak
   samples. When a run ends, a card: each leak with its
   size and where it was malloc'd (function, line), each lost block with the
   step it was lost at, the exit code or the signal and the line it died on.
   Click a row to jump there. Only what the trace knows; nothing guessed.
   Done when the lost and crash samples' reports match their traces in a
   test.
3. [x] **Test cases** (M). Done 2026-10-01: `src/cases.ts` (`judge`: pass,
   the first differing byte both ways, crashed, cut short), the panel under
   the run settings (`src/cases-ui.ts`: + this run, Run all, open a case,
   edit its expected output), stdout as a pipe so the bytes are exact; a
   project's cases in `.blueprint42/run.json` (Save dialog), a file's in the
   browser. The reader sample comes with three; `test/cases.test.ts` runs
   them: two pass, the third fails at byte 2 and says so. Per sample or project, a list of runs (stdin,
   arguments, -D, and optionally the output expected). "Run all" traces
   each (gdb), and shows pass, fail (the first differing byte of output) or
   crashed, with a click to open that run. Saved with the project
   (`.blueprint42/`, after the Save dialog) or per sample in the browser.
   Done when the reader sample has three cases, one failing on purpose, and
   the list says which and why.
4. [x] **Why is this value garbage, or NULL?** (M). Done 2026-10-01:
   `explainValue` (`src/history.ts`): never set since its call began
   (garbage), arrived with the call, set at a line (NULL too), or a pointer
   into a block that's no longer on the heap (which free, where, and what a
   freed block holds: glibc's bookkeeping); a card from the row's menu with
   a jump. `test/history.test.ts` on the list sample: unset in main, set by
   `list = push(list, 3);`, freed right after `free(list)` in clear. On a pointer or a value
   that reads as uninitialised or freed: where it came from. Never written
   since its frame began; written at line N (jump); or read from a block
   freed at step N (and what glibc keeps there, the tcache key, named as
   such). Done when the list sample's read after free says so.
5. [x] **Search the trace** (S). Done 2026-10-01: `searchTrace`
   (`src/history.ts`: a condition where it becomes true, a function's calls,
   a line, malloc, free, write, read) and a box after the timeline (Enter,
   Shift+Enter, Esc; matches as triangles). `test/history.test.ts` checks it
   against counting the trace by hand. A box over the timeline: `i == 3`, a
   function name (its calls), a line number, `malloc` / `free`, `write`. The
   matches are marked; Enter jumps to the next. Done when each kind finds
   what a hand count of the trace finds.
6. [x] **Breakpoints by picture** (M). Done 2026-10-01: `breakHits` and
   `condHolds` (`src/history.ts`: each visit of a marked statement, a
   condition in that call's variables), the station menu ("Pause here",
   "Pause here when…"), a ring round the stop in every skin
   (`drawInterior`; dashed when conditional), playback pauses on the
   recorded trace. Tested on the reader: 3 hits as counted by hand, 1 with
   `n == 2`; played in the app it paused at exactly those steps. Click a station's stop to pause there
   when playback reaches it (a dot on the station); a condition on it (`len
   > cap`) pauses only when it holds. Uses the trace already recorded (no
   re-run). Done when playing the reader stops at each breakpoint hit and
   nowhere else.
7. [x] **Two runs side by side** (L). Done 2026-10-01: `divergence`
   (`src/history.ts`): the first step where the path (event, line, function),
   a call's arguments, or a value the program set differ. Stack garbage
   before a variable's first store, a gdb frame's entry stops and malloc's
   leftovers don't count; heap bytes count once the program wrote them. A
   test case's `vs` button traces it like the page's run and puts a chip by
   the timeline (where they part, both values, a jump) and the other run as
   a strip along the timeline's top. `test/history.test.ts` pins it on two
   reader inputs: step 481, byte 11 of block #3, `' '` against `'\n'`; the
   same input never parts. Run the same program with two inputs
   (or two -D values): the timeline shows both, and the first step where
   they differ (a branch taken, a value) is marked, with both values shown.
   Done when two reader inputs diverge at the step a hand check says.
8. [x] **More of the Norm** (M). Done 2026-10-01: `normMarks`
   (`src/norm.ts`: LINE_TOO_LONG, FORBIDDEN_CS, GOTO / LABEL, TERNARY,
   VAR_DECL_START_FUNC, WRONG_SCOPE_VAR, INVALID_HEADER with norminette's
   own pattern; do … while as the Norm's rule, which norminette misreads). A
   dotted underline in the editor (the rule on hover) and under the
   statement in Minimal and Barebone (`normMarks` skin flag).
   `test/norm.test.ts` pins norminette 3.3.59's lines on fixtures, the
   80/81-column edge and a valid header; the samples only lack the header,
   as norminette says. Beyond the capacity bars: line width (80),
   forbidden statements (for, do while, switch, goto, ternary), declarations
   after statements, the 42 header, as marks on the machine and the line in
   the editor, counted as norminette counts (`src/norm.ts`). Done when the
   marks agree with norminette on the samples (tested on its rules, not by
   calling it).
9. [x] **Notes on the timeline** (S). Done 2026-10-01: `src/notes.ts`,
   `src/notes-ui.ts`. Right-click the timeline: a note at that step, a flag
   on the timeline, a row under the test cases (jump, ×). Each note keeps
   its step's function and line, so after an edit or another input a note
   whose step is elsewhere says so (a hollow flag, no jump) instead of
   pointing at the wrong moment. Kept in run.json (Save dialog) or per
   sample in this browser; `test/notes.test.ts`. Pin a note to a step ("the bug starts
   here"); shown as a mark, listed in a panel, kept with the project's
   `.blueprint42/` (after the Save dialog) or per sample in the browser.
10. [x] **Export a run** (M). Done 2026-10-01, as the HTML replay (not
    WebM: a video of the grid canvas would miss the GPU background layers).
    "⤓ replay" by the speed saves one HTML file: the app built as a single
    page (`vite.replay.config.mjs`, built on demand by the trace server,
    `server/replay.mjs`) with the run in it (`src/replay.ts`; `src/pack.ts`
    keeps the snapshots' sharing and the Maps). Opened from disk it plays
    the recorded run read-only, with nothing that runs code. Single files
    and samples for now; a project isn't exported yet.
    `node tools/replaycmp.mjs`: list, reader and swap, 3 skins × 2 zooms × 4
    positions, 72/72 frames the same as the app, no network but fonts.
    A range of steps as a video (WebM, from the
    canvas) or as one self-contained HTML replay (the trace and the app, no
    server, no gdb) a classmate can open. Done when the exported replay
    plays the same frames as the app (pixcmp on its frames).
11. [x] **A minimap** (S). Done 2026-10-01: `src/minimap.ts`, bottom right
    of the grid, in the chrome's CSS colours: every host a box, the running
    one lit, the view a frame; click or drag to look there (it counts as
    the author panning, so Follow waits). Hidden while the grid fits the
    view; drawn only when the camera, layout or running machine changes.
    Checked headless on the reader: shown zoomed in, a click moved the
    camera there, hidden after Fit. A small overview of the whole grid in a corner:
    every machine as a box, the running one lit, the view as a frame; drag
    it to move. Only for grids bigger than the view.
12. [x] **How heavy is a skin** (S). Done 2026-10-01: a light / medium /
    heavy badge on each skin in the picker (`src/skins/weight.ts`: a
    frame's whole cost against the lightest skin's, ≤1.3× light, ≤2×
    medium), the numbers and how they were measured on hover, and a note on
    skins that make 10+ gradients a frame (Firefox). Data in
    `src/skins/weight-data.ts`, written by `node tools/bench.mjs --skins all
    --sample reader --uncapped --save` (a headed window on the terminal's
    desktop, which must be the one on screen). The numbers in it now are
    provisional (one round, with a game on the same GPU): run that again on
    a quiet machine. `test/weight.test.ts`. In the skin picker, a light / medium /
    heavy mark from `tools/bench.mjs` numbers kept in the repo (and a note
    that Firefox pays more for gradients), so a slow laptop can pick well.
13. [x] **Guided tours** (L). Done 2026-10-01: `src/tour.ts` (a stop is a
    function, a piece of a statement's line and a sentence; it resolves to
    the step where that statement is about to run, and a stop the run never
    reaches is left out and said), `src/tour-ui.ts` ("▶ tour" by the speed;
    playing pauses at each stop, frames the running machine, shows the
    sentence with next / end). The swap sample has a tour of its pointers;
    `test/tour.test.ts` checks each sentence's claims against the trace (a
    and b hold x's and y's addresses, the values before and after each
    write, swap's frame gone at the end). A sample can carry narration: steps with a
    sentence each ("watch `buf` here"); playing it moves the camera there,
    pauses, and shows the sentence. Authored in the sample (no new file
    format beyond a list of { step, text, focus }). Done when one sample has
    a tour of its pointers.

Rules for these steps:
- The trace is the only source: a feature that needs data the trace
  doesn't hold says so, or isn't drawn (draw less, never false).
- Files are written only through `server/project.mjs` after the Save
  dialog; nothing is auto-saved.
- Reviewed skins keep their look: a new picture lands in Minimal and
  Barebone first, and other skins get it through their existing parts.

## Next (2026-10-01): easy to diagnose, hard to break

The main objective: when something looks wrong, slow or stuck, the tool
itself says where, and a change can't quietly break a picture. No new
features and no new looks: every step keeps the pixels and the behaviour
the same, and proves it (step 1 first, so the others can be checked).

Why now. Each of these cost real time this week, and each was found by hand
with throwaway scripts:
- One skin threw once (PS2's capacity bar, a 0/0) and the whole playback
  froze: nothing stood between a hook and the frame loop.
- A condition readout showed a pointer's own value where the value it
  reads should be (`→tab[0] > →tab[0]`); nothing checked what a frame shows
  against the trace.
- PS3's focus veil ignored the picked theme colour; text fits made before a
  font loaded were kept. State a picture depends on wasn't followed.
- Every performance question needed a new script, a git worktree for
  before/after pictures, and three browsers (headless Chromium misreports
  the GPU; Firefox draws canvases on another thread).

Where the risk sits (sizes today):
- `GridView.draw` (`src/render.ts`) is one 667-line function: layout,
  values, animation and painting mixed. `convertGdb` (`src/gdb.ts`, 416
  lines), `run` (`src/interp.ts`, 373) and `boot` (`src/main.ts`, 259)
  follow.
- `main.ts` writes the shared state `S` directly in 80 places; nothing
  records who changed what.
- The tests (103) cover the pipeline well but never call a skin's drawing
  code: `test/skins.test.ts` checks the picker's groups only.

Steps, in this order:
1. [x] **Pictures you can diff** (M). Done 2026-10-01 (decision 047): the
   working tree against itself, 0 of 90 frames differ at 1 and 1.25. Rendering takes its clock from the
   frame, never `performance.now()` (the leak fall and the crash jam read it
   now, so two runs of the same frame differ). Then `tools/pixcmp`: draws
   fixed frames (samples × positions × zooms × skins × 1, 1.25, 2 scaling)
   from two git refs and reports what differs, composited over the page
   colour. Done when the same ref against itself differs in 0 pixels, and a
   refactor step can say "identical" from one command.
2. [x] **A skin can't stop the frame** (S). Done 2026-10-01: `src/skins/guard.ts`,
   errors in `src/diag.ts`; nothing added when a hook succeeds (several skins
   leave style that later drawing relies on: a save/restore around each
   changed 11 skins' pictures), 0 of 495 frames differ; a forced throw in
   PS2's dock leaves the grid drawn and playback running. Every skin hook runs inside a
   guard: a throw is logged once (skin, hook, the info it got), the item is
   skipped or drawn as a plain marked box, and the frame goes on. Replaces
   the single try/catch around the whole frame (`main.ts` `frame`). Done
   when a hook forced to throw leaves the rest of the grid drawn and the
   error listed (step 5).
3. [x] **Skin contract tests** (M). Done 2026-10-01: `test/skin-contract.test.ts`,
   what the grid really passes recorded by `tools/capture-hooks.mjs`
   (`test/fixtures/hook-calls.json`, rerun it when an info grows), in a
   recording context (`test/helpers/rec2d.ts`); overhangs declared per hook.
   It found and these fixed: a capacity of 0 (printf's buffer before its
   first call) drew a bar of width NaN in every skin; a squeezed tag and a
   rounded box asked for negative radii (a real browser throws); the kit's
   storage titles and wall notes, and Minimal's and Aqua's wall notes,
   spilled long text out of their boxes; Aqua reset a fitted title to full
   size. Pictures change only there. Every skin × every hook, called with
   ordinary and edge-case infos (empty text, 0 and huge capacities, 0-size
   rects, no trace, fractional zooms, each tint): nothing throws, nothing
   non-finite reaches the canvas (a recording 2D context rejects NaN), and
   drawing stays inside the rect it was given (bar declared overhangs).
   Would have caught the 0/0. Done when it runs in `npm test` for all 34
   skins.
4. [x] **What a frame shows, as data** (L). Done 2026-10-01: `src/frame.ts`
   (`frameState`, and what the process box, printf's buffer, stdin, the
   modules, walls, the heap bar and the IN dock show) with no canvas;
   `GridView.draw` is 64 lines naming 15 paint passes (0 of 2,970 frames
   differ). `test/frame.test.ts`: a readout says the array's values at j and
   j + 1, a block is lost the moment nothing points at it, the dock shows the
   arguments the call carried, stdin never gives back what it took. Not yet:
   machines' hit rects (`hit.ts`) are worked out apart from the frame; the
   heap bar's are the ones its pass laid out. Split `GridView.draw` into a
   pure step, `frameScene(state, trace, pos, camera) → Scene` (every
   machine, row, readout, plate, card and line with its rect and the value
   it shows), and painting passes that only draw a Scene. The Scene is
   testable without a canvas: "at step 42, the readout says `5 > 2`",
   "the lost card is red", "this line ends at the address its pointer
   holds" (SPEC principle 4 as tests). Hit-testing reads the same Scene, so
   what you click is what's drawn. Done when `draw` is a short list of
   passes, and the readout, heap bar, dock and stdin have Scene tests.
5. [x] **Diagnostics built in** (M). Done 2026-10-01: `src/diag.ts` (the
   profiler, off until asked) and the dev panel `src/diag-ui.ts` (top bar,
   "diag"; `__ftb.diag(true|false)`): ms per paint pass and skin hook, canvas
   calls by kind, the text memos' hit rates, frames a second, hook errors and
   failed trace checks. `tools/bench.mjs`: a headed Chromium or Zen window on
   the terminal's desktop, one ref or two alternating, fps with that
   breakdown; it refuses to report from a hidden window. A dev panel (and `__ftb.diag()`)
   instead of scripts: per frame, the time in each pass and each skin hook,
   canvas calls by kind (fills, gradients, text, images), memo hit rates,
   the page's frame rate and the background's, recent hook errors (step 2)
   and failed checks (step 7). The bench scripts from this week become
   `tools/bench` (a headed Chromium or Zen window, placed on the terminal's
   desktop), so "is it faster" is one command.
6. [x] **State changes by name** (M). Done 2026-10-01: `S` is read-only to
   the compiler outside `state.ts`; ~100 writes became `update('seek' |
   'play' | 'advance' | 'select' | …, patch)` (and `updateRun` for a
   project's run settings). Dev builds keep the last 200, repeats counted,
   in `__ftb.diag().actions` and on every hook error and failed check. `S` changes only through named
   actions in `state.ts` (`seek`, `play`, `loadTrace`, `setSkin`, …); dev
   builds keep the last 200 with their arguments, attached to every error
   report. Done when nothing outside `state.ts` assigns to `S`.
7. [x] **A trace that checks itself** (M). Done 2026-10-01: `src/validate.ts`
   (shape, frame and cell ids, pointers, calls push and returns pop, malloc
   and free, heap slots, output and stdin only forward), on every trace in
   dev builds (failures in the diagnostics panel) and in
   `test/validate.test.ts` for every sample under both engines (all pass;
   broken traces fail with the check named). The engines report their own
   failures by stage (`EngineError`: gdb setup / stops, at which stop /
   finish; the interpreter's statics / execute / finish). Not split into
   separate functions: `convertGdb` is one state machine over shared tables,
   and its stages are marked in place. `validateTrace(trace)`: every
   event's cells, frames and heap blocks exist in the snapshots around it;
   snapshots only change where an event says; ids stay stable; output only
   grows. Run on every trace in dev and in the tests, for both engines
   (the interpreter and gdb), so a converter bug fails where it happens,
   not as a wrong picture later. Split `convertGdb` and `run` into stages
   with typed outputs so a failure names its stage.
8. [x] **State a skin depends on, followed** (S). Done 2026-10-01: PS3's
   veil is computed when read (the one tinted skin); its gradient and
   backdrop caches key on the colours; the three text memos (fits, widths,
   cuts) clear when a font finishes loading (cuts didn't). The contract
   tests switch every tint and check the veil and panel fills follow, one
   veil per tint. Colours and sizes that
   depend on a tint, a mode or a font are computed when read (as PS3's veil
   now is), never copied once; memos key on everything they depend on, or
   clear on the event that changes it (as text fitting now clears on font
   load). A contract test switches every tint and checks the veil, panels
   and plates follow.
9. [x] **A linter** (S). Done 2026-10-01 (decision 048): Oxlint with types
   (eqeqeq, no-shadow, no floating promises) and `tools/lint-canvas.mjs` (a
   save without its restore, a return with one open), in `npm run check`
   (under 2 s). ESLint can't: typescript-eslint needs TypeScript's JS API,
   which TypeScript 7 doesn't have. It found 27 shadowed names and a floating
   promise; fixed. ESLint with a few rules that catch this week's
   kinds of bugs: floating promises, unused values, `==`, shadowed names,
   a canvas state change without a matching restore. `npm run check`
   runs it.
10. [x] **A map for the next person** (S). Done 2026-10-01: `docs/HANDOFF.md`
   "Debugging map" (what to reach for, by what's wrong), the new modules in
   its architecture map, and this week's measuring gotchas. `docs/HANDOFF.md` gets one page:
   which module owns what (data in, data out), how to debug each kind of
   problem (wrong value, wrong place, slow, stuck, a skin), and which tool
   answers it.

Rules for these steps:
- Behaviour and pictures don't change; each step is checked with step 1's
  diff (0 differing pixels outside what the step names) and the tests.
- Reviewed skins keep their code's look; only the plumbing around hooks
  changes.
- One step per commit series; each leaves the app working.

## Today (2026-09-30): nothing hidden

The main objective: the picture never hides what the program did. Whatever
happens is drawn where it happens, and whatever doesn't fit is counted
(`docs/VISUALS.md`, clarity rule 6; decision 046). Prototyped in Minimal and
Barebone; truth fixes go to every skin.

Done:
- [x] printf's buffer above the process box: what waits, how full, when it
      flushes (Minimal, Barebone); a flush falls into the terminal, `write`
      goes straight in past it (every skin).
- [x] The statement that died is crossed out with its signal.
- [x] `*p` and `a[i]` read from the memory they really read, and show the value.
- [x] Nothing dropped silently: older past values, reads past 8, writes past
      10, the dock's arguments are counted.
- [x] Values in flight always land, with time for each one.
- [x] Belt crossings cut a real gap (the background shows through).

Next, in this order:
1. [x] **Stack and literal bytes** (S). A stack array (`char buf[32]`) or a
   string literal shows its bytes like a heap block does. A char array's
   strip sits in its own pool (LOCALS, KEPT), with no pointer line; a
   literal is "literal (read-only)" in REACHED; a pointer into a stack
   array shows those bytes and says "(stack)" (gdb engine; the `bytes`
   sample).
2. [x] **stdin and stderr** (S). Input being used up by `read(0, …)` (a
   stdin node under the process box, fd 0's real offset), and output to fd 2
   flying into the terminal, its text in the error colour (Minimal,
   Barebone).
3. [x] **The heap bar** (M). Built in Minimal and Barebone (docs/VISUALS.md,
   "The heap bar"); other skins keep the shelf until it settles. The heap belongs to no function and outlives
   every call, so it's drawn as a bar fixed to the screen (bottom left),
   with you wherever you go, replacing the heap shelf (one thing, one
   picture). One card per live block: its size, where it was malloc'd, its
   first bytes or fields, who points at it. `malloc` drops a card in, `free`
   takes it out, blocks still there at exit stay in red (leaks); `+n` when
   more exist than fit. Pointer lines run from rows to their card (full from
   the running frame, quieter otherwise, a stub when the row is off screen),
   and it folds down to a thin line when the space is wanted. A struct can
   be *watched* there too, never moved: "watching `main.r` (on main's
   stack)", and "gone: its frame returned" once it has, because a local
   lives in its frame. Items 4 and 5 are drawn on it. Prototyped in Minimal
   and Barebone.
4. [x] **Two names for the same memory** (M). Pointers holding the same
   address are marked as sharing it, not just given separate lines: `×N` on
   the tag (every skin that draws tags), the names on the heap card.
5. [x] **Ownership of heap blocks** (M). Who must free a block: a tag on it,
   and a warning when a function returns without freeing or handing it on.
   Built as what C really has: the pointers holding it (the card's `←`
   line, heap-internal ones included) and the moment the last one goes
   (`LOST`, an alert with the step; `src/ownership.ts`; the `lost` sample).
6. [x] **Computed indexes and chains** (M). `a[j + 1]`, `p->next->len`,
   `**pp` read from where the memory is, like `*p` and `a[i]`. An index is
   any integer expression of names and numbers (C's truncating `/`); a chain
   goes through `->` only (a nested `a->b.c` stays as written), reading a
   block's fields where gdb read them through a pointer of the same type.
7. [x] **Loop rounds as a whole** (M). Which way each round went, not only
   each row's past values: one mark per round on a loop's readout row (in /
   out), and on each `if` directly inside it, its result in the same columns
   (a dot: not reached that round); the last 12, older ones counted (every
   skin that draws stations with the shared interior). A switch's readout now
   reads `*p`, `a[i]` and chains from their memory too (it showed the
   pointer's own value before).
8. [x] **Long statements** (S). Station code is cut at 44 characters; show the
   whole line (wrap or on hover). Hover a cut or wrapped statement: a tip
   (styled like the other panels, per skin) shows all of it on one line.
9. [x] **The printf buffer in PS1–PS4** (S each), in each skin's own parts:
   one of its storage panels (`printf`, the head's capacity how full), the
   dock's own light lit while bytes wait (`kit.ts`, with `Theme.look.dock`).
10. [x] **`static` functions** marked the same way in every skin (S): as C
    writes it, in the machine's title every skin draws (`static
    lr_append(fd, buf, nl)`); skins with a dock showed nothing before.
11. [x] **Capacity for a single file** (S). Its 5 definitions, with no module
    wall to show them on: next to its name in the grid's head (`sort.c ·
    4/5 functions`, in the bad colour past 5; the line reader's combined
    buffer says 11/5, true of it as one file).
12. [x] **Types shelf** (L). Structs, typedefs, enums and macro constants
    from headers, on the grid: a column of cards left of the machines
    (Minimal, Barebone; `skins/typeshelf.ts`, `parse.ts` `typeDefsOf`), the
    `-D` value the run used, the struct in use outlined.
13. [x] **Legend overlay** (M). The real drawings and what each one means:
    the grid's Legend button (Esc closes); each tile drawn by the active
    skin's own hooks with example values (`src/legend.ts`), so it is 1:1
    with the canvas in every skin.
14. [x] **Real events as effects** (S each). A leak falls off the shelf at
    exit, `free` takes the block away, a segfault jams the machine: at the
    run's end a leaked card drops, bounces once and settles red (heap bar);
    `free` takes its card down and away; the machine that crashed shakes
    hard and stops (every skin).

Rough edges, fixed: the kill feed covered the stations of machines under it
(following now frames clear of it); the IN dock was mostly empty with one
argument or none (it now says where the call came from and which call it
is: `from main:10 · call 1 of 9`; the PS docks count arguments that don't
fit instead of dropping them).

The toolbelt (the legend strip at the bottom left) is hidden for now, the
author's call: its icons aren't 1:1 with what the canvas draws. Its right half
was the only way to drag author sprites onto the grid; strips still come from
the inspector. The Legend overlay (13) now does its first job, drawn with the real
pictures; placing strips stays in the inspector.

## 2026-09-29: the machine, redesigned

The main objective: a machine reads as the life of one call, top to bottom
(`docs/VISUALS.md`, "Machine anatomy"; decision 041). It's the first piece of
the visual grammar that later becomes the editor.

Done:
- [x] Storage in pools: PARAMETERS (the copies it was called with), LOCALS
      (the Norm's declaration block), KEPT (statics), REACHED (memory through
      a pointer, written `buf->len`).
- [x] RETURN at the bottom: the return type, and the value when it leaves.
- [x] Each row's past values, `cap  ? → 0 → 8 → 16`, in every skin (the
      five storage-table drawings: the kit's, Minimal, Aqua, Classic, Amp).
- [x] `->` in labels no longer drawn as one arrow glyph.

Next, in this order:
1. [x] **IN dock** (S). Its own look at the top left, in the engine's four
   states: *idle* (dim, not called), *running* (holding the arguments that
   arrived), *waiting* (it called another function and is paused until that
   returns) and *crashed* (it died; it says the line and the signal).
   Prototyped in Minimal and Barebone (`Skin.dock`, `skins/dock.ts`); other
   skins keep their motor until the design settles. The station that died
   is crossed out in the stations too (decision 046).
2. [x] **Pointer address tag** (S). A pointer row shows a tag, not a value:
   a socket dot and what its address points at (`bufs[0]`, `heap #1`),
   in PARAMETERS, LOCALS, REACHED and the IN dock. The tag says only what
   the pointer holds (the origin), never where it was handed down from.
   Every pointer always has its line (quieter outside the running frame,
   never hidden); one whose target isn't drawn gets a stub with its arrow;
   a `char *` gets a line to its byte strip, where its text now lives.
   Prototyped in Minimal and Barebone (`RowInfo.tag`, `drawTag`; the kit's
   `ptrTags`); other skins still print the value.
3. [x] **Byte strips inside REACHED** (S). The bytes behind each `char *`
   are drawn inside the REACHED panel, under its rows, in every skin (an
   engine change). Each strip's label says what the pointer reaches and
   where it came from: `data → heap #1 · malloc lr_grow:172` (or "malloc
   before step N" in a window that began later). A pointer with no bytes
   to show says where it points (`(stack)`, `(static)`) or `NULL`. Only heap
   bytes are drawn so far: a stack array or a string literal gets the line
   and the label, not its bytes.
4. [x] **Argument vs return plates** (S). Different in shape, not just
   colour: a call's argument on a belt is a hexagon (pointed ends), a
   return value the reverse (notched ends); everything else keeps its pill.
   Neither shape points a way, since a belt can run in any direction.
   `plate(…, role)`, `platePath`; prototyped in Minimal and Barebone (the
   kit's `plateShapes`).
5. [x] **Norm capacity** (M). Each limit shows where it applies, as
   `used/max` with a small bar: faint while there's room, amber when full,
   red past it. Parameters on the IN dock (`2/4`), variables on LOCALS
   (`3/5`, local statics included; on KEPT if there are only statics),
   lines on the stations (`22/25 lines`, the physical lines between the
   braces), definitions on a module (`5/5 fns`, prototypes don't count).
   Counted in `src/norm.ts`; `test/norm.test.ts` checks each limit against
   norminette itself (25/26 lines, 5/6 vars, 4/5 args, 5/6 functions).
   Prototyped in Minimal and Barebone (`Skin.capacity`). Not shown yet: a
   single file's definitions (it has no module wall).

Settled today: the dock shows all four of the engine's states. The anatomy
is an engine change, so every skin gets all of it at once, in its existing
parts; per-skin looks come later. New pictures are prototyped in Minimal
and Barebone only.

Still open: are expressions typed as text inside a station (recommended),
or built from blocks? See `docs/VISUALS.md`.

## What Upload Labs gets right

[Upload Labs](https://uploadlabs.enigmastudio.dev/) is a node-automation
game. Nodes are small windows (downloaders, processors, scanners, uploaders)
that you wire output to input, left to right, to move files and earn money.
The parts worth borrowing:

- **Typed ports.** An output only connects to an input that takes it, and
  the game shows which ones do while you drag.
- **Space opens the node menu.** Placing a node is one key, a pick and a
  click.
- **Flow you can count.** Every link shows throughput, and processing nodes
  show their multiplier (a scanner's ×4). You can see where the bottleneck is.
- **Merge and split nodes.** Folders merge streams, allocators split them by
  ratio. Layout is a spatial puzzle.
- **Schematics.** Save a group of nodes and stamp it again elsewhere.
- **Goals and unlocks.** Milestones open new nodes, so there is always a next
  thing to build.

For blueprint42 the "files" are values and the "money" is a program that
works. The same loop becomes: design the machines, wire the belts, write the
code that fills them, run it, and watch it deliver.

## 0. Decided: the grid will write code, within the Norm

The author's call (`decisions/040-visual-grammar.md`): blueprint42 grows
toward a visual code editor, and its scope for writing code is Norm C. The
Norm fixes the structure of the code, so it can be drawn and placed without
losing anything, and learning to write that structure is good practice in
itself. The first step is defining the pictures (`docs/VISUALS.md`), each
one both something to read and something to place later.

"Ghost machines" below are called **plans** (`Skin.ghost` is already the
reserved slot of a recursive copy).

## A. Build with belts (L)

1. **Plans (M).** Space opens a palette on the grid. Pick a blank machine,
   name it, and it sits there dimmed as a plan (principle 4: drawn but not in
   code). A "to build" list shows every plan that doesn't exist yet. It turns solid the moment a function with that name parses.
2. **Typed ports (M).** Ports carry their C types. Dragging a belt from an
   output highlights only compatible inputs. A mismatch shows red, with the
   reason the compiler would give (`char *` into `int`).
3. **Belts that propose code (M, needs 0).** Wire a ghost's inputs and it
   proposes the prototype (`static int ft_count(char *s)`) and an empty body.
   Drop a belt from machine A onto a station inside B and it proposes the
   call on that line. Undo takes it back.
4. **Norminette as the game's rules (S; its capacity pictures are item 5 of
   Today).** A machine's 25 lines are a
   capacity bar. Its 4 parameters are 4 input slots, and a fifth won't fit.
   A file's 5 functions are 5 module slots. Hitting a limit looks like a full
   machine, not an error message later.
5. **Merge and split, the C way (S).** An `if` is a splitter and a loop is a
   return belt. Name them in the palette too, so a design can have them
   before the code does.
6. **Schematics (M).** Select machines and belts, save them as a pattern
   ("read loop", "split into words", "list push") and stamp them as plans
   elsewhere. They're stored in the blueprint file, never as code.

## B. Goals and progress (L)

1. **Tests as deliveries (M).** A test set (stdin, args, expected output) runs
   each case as a packet. Packets travel the belts, and the ones that pass
   reach an output dock: "7 / 9 delivered". A failing one stops where the
   output first went wrong.
2. **Missions (L).** One per Common Core project (libft, get_next_line,
   ft_printf, push_swap…, from the current curriculum). A mission is ghost
   plans named by the subject plus behaviour tests. It says what must go
   in and come out, never how, so it can't turn into a solution sheet.
3. **Run stats as a score (S).** Steps, the deepest stack, bytes malloc'd,
   bytes leaked, the longest machine. Refactor and try to beat your own
   record; the best run is kept per sample or project.
4. **Achievements (S).** They use the trophy notification the PS3 and PS4
   skins already have, drawn by every skin. Examples: the first leak-free run,
   the first recursion, a whole project inside every Norminette limit.
5. **Sound (S, off by default).** Soft clicks for steps, a chime for a
   delivery, a thud for a crash.

## C. Define every visualization (M)

Aim: fun to look at, and every mark means exactly one thing.

1. **A visual dictionary (S).** ✅ `docs/VISUALS.md`, checked against
   norminette. The Legend overlay in the app that shows the real drawings:
   ✅ too (Today 2026-09-30, item 13, `src/legend.ts`). Each entry gives what it
   is, what it means in C, and what makes it light up. Entries:
   - machine (storage rows, stations, memory floor), recursion copies,
     modules and walls;
   - belts (calls) and their data plates, return values, crossings and their
     gaps, count badges;
   - heap blocks and the heap shelf, strips with `pos`/`len`/`cap` markers,
     chests (statics);
   - invariant violations, stale and unbound (dimmed) marks;
   - the kill feed, the duel, the focus card, the process box (stdout, exit
     code), lenses.
2. **Audit each against the dictionary (M).** One mark, one meaning. Where two
   things look alike (an argument plate and a return plate) or one thing
   looks two ways between skins, fix it in the engine and the skin hooks, not
   per skin.
3. **Missing pictures (M each).** Things C students get wrong that the grid
   doesn't show yet:
   - **Ownership.** Who malloc'd a block and who must free it: a tag on the
     block, and a warning belt when it leaves a function that forgot it.
     ✅ as C really has it: the pointers holding a block and the moment the
     last one goes (Today 2026-09-30, item 5, `src/ownership.ts`).
   - **Aliasing.** Two names for the same memory: pointer arrows from storage
     rows to the bytes they point at. ✅ (Today 2026-09-30, item 4).
   - **Loop history.** ✅ per row (each storage row shows its past values),
     and a loop's rounds as a whole (Today 2026-09-30, item 7).
   - **Output as it really happens.** A printf buffer node above the
     terminal: `printf` text waits there until a flush, `write` goes straight
     to the terminal, so mixed output shows why it came out in that order
     (`docs/VISUALS.md`, "Output"). Done: the tracer runs stdout as a
     terminal (a pseudo-terminal, the default) or a pipe (the "stdout" toggle
     in the run settings), reports every write(2) (the user's own, or libc
     flushing printf's buffer) and the buffer's real contents each step; the
     terminal box shows what has really arrived by then. The buffer node is
     drawn above the terminal in Minimal and Barebone, and the bytes fly
     out as they really leave (decision 046).
4. **Fun without lying (S each).** Every effect is driven by a real event:
   - a leak is an item falling off the shelf at exit;
   - a segfault jams the machine at the statement that died;
   - `free` is a recycler taking the block away;
   - a return is the plate riding home.
   ✅ the first three (Today 2026-09-30, item 14); returns ride their belt
   home as plates (M5.5, and the machine's return plates).

## Order

Today's list first (the machine is the grammar's core), then the rest of
C2's to-do list in `docs/VISUALS.md`. Then A1–A2, A3, B1 and B3. Missions
(B2) come last: they need the rest.

## Sources

- [Upload Labs](https://uploadlabs.enigmastudio.dev/)
- [Core nodes explained](https://www.upload-labs.com/en/guides/core-nodes)
- [Steam page](https://steamcommunity.com/app/3606890?l=english)
