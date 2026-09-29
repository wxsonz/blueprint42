# Fast and Focus playback

*2026-09-27* · **Status:** Accepted

- **Decision (author):** Two ways to play, switched in the playbar (or
  `M` on the canvas) and remembered:
  - **Fast** is the existing animation: every event plays once and the
    follow camera only pans, never zooms.
  - **Focus** stages each call, return and write through a pointer as a
    short scene:
    1. The camera frames the sender and the receiver.
    2. Everything else is veiled.
    3. The sender flashes while the data waits at its port.
    4. The data travels 3 times for a call and 2 for a return or pointer
       write.
    5. Then the receiver flashes as the new state appears.
  - Each skin draws the veil colour and its own "look here" mark: Amp a
    green viewfinder, Classic yellow marching ants, Aqua a blue halo,
    Minimal accent corners.
- **Decision (author feedback, revised):** Focus scenes send the data
  **once**, with longer pauses instead of repeats:
  - **A call** (or a write through a pointer) waits at the sender to be
    read (1.5–5 s, more for more data), travels once, then stays parked at
    the receiver while its frame fills in (1.2–4 s).
  - **A return** first shows a **card** over the fully veiled grid (2.5–7 s,
    sized to its content):
    - *in*: what the function was called with, including struct fields;
    - *out*: what it hands back, meaning its return value and anything it
      changed through its pointers (`buf->pos 0 → 6`, `*n 3 → 4`), with
      changes marked and unchanged values dimmed.
    - Changes to by-value copies aren't shown as outputs.
  - **Then** the end product travels back once. When a function also
    changed data through pointers, that rides along as a crate
    (`void · changed`, `buf->pos 6`).
  - The camera frames the sender while you read (and during the card),
    both while the data travels, and the receiver during the hold.
  - Data is drawn at least full size in focus. Arguments travel as a train
    that fits the belt. Fast mode is unchanged.
- **Decision:** Focus scenes never play faster than 1.5×. Plain steps still
  follow the speed setting, so long traces (GNL: about 1,000 events) stay
  watchable. Positions are in events, so switching modes mid-run keeps the
  same moment on screen.
