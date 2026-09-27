# Chat performance recording analysis: 2026-09-27

Source: `rpgraph-ui-performance-2026-09-27T00-16-08-671Z.json`, supplied locally.
The recording precedes the reference-image ID stabilization described below.
It lasts 33.706 seconds with no overwritten samples. React Profiler callbacks
were unavailable. All event times below are relative to recording start.

## Results

| Observation | Previous recording, from handoff | Current recording |
| --- | --- | --- |
| Largest frame gap | About 215 ms | 180.5 ms at 21.583 s |
| Speaker/social completion gap | About 153 ms | 152.8 ms at 22.979 s, followed by 48.6 ms |
| RP timestamp update gaps | About 56 ms twice | 118.1 ms at 25.535 s, followed by 41.7 ms |
| Frame gaps of at least 34 ms | 8 | 8 |
| Completion row execution batches | 10 + 10 | 10 + 10 |

These runs differ in duration and workload; the previous summary describes four
social messages, while this report records one social append. They do not establish
an overall performance improvement. The current 24 ms threshold captures 18 frame
gaps; use the common 34 ms threshold for comparisons with older summaries.

There are 70 row execution batches and 141 executions. In 62 batches, only the
current row executes with its `message` prop changed. During completion and the
RP timestamp update, all nine older rows instead execute with exactly one changed
prop: `contextualReferenceImageIds`. Their timeline props remain stable. This
confirms that row-local timeline props no longer invalidate these older rows, but
a separate shared Set reference still defeats memoization.

`useNextTurnReferenceImages` previously constructed a fresh contextual ID Set
whenever messages changed, even if ID membership remained identical. The report
records references, not values, so identical membership cannot be established
from the recording alone. The code establishes that this needless invalidation
occurs whenever membership stays equal.

## Remaining work and measurement limits

- The largest stall contains a 148 ms browser task. A stream marker at 21.579 s
  is followed by timeline processing at 21.679 s, leaving about 100 ms without
  identifying instrumentation. Do not attribute this interval to a particular
  function, React rendering, or image processing without additional evidence.
- Large animation frames report rendering tails of roughly 37–45 ms. These
  fields overlap style/layout timing and do not isolate painting or GPU work.
- Timeline and row-local projection spans each peak at 0.2 ms. Character usage
  selection peaks at 0.9 ms. Completion message patches take 3.9 and 3.2 ms;
  the timestamp patch rounds to 0 ms. Nested spans must not be added together.
- Zero script-duration attribution does not imply that no JavaScript ran.
  The simultaneous browser long tasks are still present.
- Run completion changes `isRunning`, which can legitimately update disabled
  controls. A separate early batch also changes `appCharacters` and
  `socialImageById`; their necessity is not established by this recording.

## Follow-up change

Contextual and manually selected image ID Sets now reuse their previous references
when membership is equal. Changes to membership, disabling reference images,
lookback changes, removals and undo still propagate. A bounded selector is owned
by each hook instance; no custom row comparator hides real prop changes.
`images.contextualIds` measures collection and stable ID derivation in subsequent
recordings, without collecting image IDs or contents.

Tests cover metadata-only changes, changed image membership, turn lookback,
disabling, undo, repeated empty selections and equal-size replacements.

## Next recording

Start diagnostics before generation, close Options, and reproduce completion,
phone/social output and RP timestamps while scrolling with the same settings.
Export after completion. Check that older rows no longer execute solely because
of equal contextual image ID Sets. Compare the completion and timestamp windows
separately from the run start/end and Options interactions.

If substantial stalls remain after this change, use a browser CPU/performance
trace to identify the uninstrumented work and rendering costs before splitting
work or moving it to a Worker. The application and browser were not launched
for this analysis; interactive verification remains manual.

## Scheduling options

Long JavaScript computations can explicitly yield between bounded chunks with
`scheduler.yield()`. This is cooperative, not automatic preemption of an arbitrary
function every few milliseconds. Yielding gives the browser an opportunity to
render, not a guarantee of a particular frame deadline. It cannot interrupt a
synchronous browser layout operation.

Workers can run suitable pure computation independently of the UI thread, but
cannot directly modify its DOM. A dedicated CPU core for the existing chat scroll
loop is not exposed by the web platform. Keep DOM work small and identify costly
computation before adding communication and synchronization overhead.

References: [Chrome scheduling guidance](https://developer.chrome.com/blog/use-scheduler-yield),
[Worker capabilities](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

## Follow-up recording: 00:23:54 export

Source: `rpgraph-ui-performance-2026-09-27T00-23-54-307Z.json`.
Duration: 35.106 seconds; no overwritten samples; React Profiler still unavailable.
The recording includes the image-ID stabilization, but precedes the opening
synchronization guard and additional probes below.

| Observation | 00:16 export | 00:23 export |
| --- | --- | --- |
| Largest frame gap | 180.5 ms | 215.3 ms |
| Speaker/social completion | 152.8 + 48.6 ms | 159.7 + 55.6 ms |
| Timestamp update | 118.1 + 41.7 ms | 118.2 + 48.6 ms |
| Gaps of at least 34 ms | 8 | 8 |
| Timestamp row executions | 10 | 1 |
| Completion row executions | 10 + 10 | 1 + 10 |

The new run appends three social messages rather than one and patches four
timestamps rather than two. The results show reduced row work, not an improvement
in frame pauses. At the timestamp update (25.706 s), only row 17 executes;
`contextualReferenceImageIds` no longer causes broad rerenders. Its calculation
peaks at 0.1 ms. At social publication (22.709 s), the older rows execute because
`appCharacters` and `socialImageById` changed. Those can represent real character
changes and are not suppressed without further evidence.

The largest browser task lasts 176 ms. Between the stream marker at 21.359 s and
row timeline processing at 21.484 s, approximately 125 ms remain unattributed.
The timestamp animation frame reports a 43.6 ms rendering tail. It is therefore
incorrect to attribute the whole pause to time formatting or old message rows.

### Additional correction and next diagnostic step

Code inspection found that App's opening-message effect depends on a setter
whose reference changes on every render. Even after a conversation starts, the
effect called that setter with the unchanged message array. The setter still
reconciles NPC contacts and publishes the current live messages to App state.
The recording contains 37 reconciliation spans totaling about 65 ms spread over
the entire run, including repeated spans around timestamp and completion work.
Not every reconciliation comes from this effect; do not treat the total as a
predicted saving or as one stall.

An opening-message guard now skips the setter when the opening needs no change,
including all established conversations. Creation, edits, removal and restoration
after undo remain supported and have focused tests. This also avoids accidentally
committing streamed snapshots merely because an unrelated App update occurred.

Further probes cover speaker selection, character runtime rebuilds and contact
projections. An opt-in `npm run build -- --mode profiling` enables the existing
React Profiler boundaries in production. Use that build for the next recording
to distinguish App/Chat/Graph render work from other synchronous work. It adds
measurement overhead and is not a controlled comparison with the previous builds.
A normal build restores the standard renderer. No application or UI test was
launched for this work.

## Follow-up recording: 00:30:49 export

Source: `rpgraph-ui-performance-2026-09-27T00-30-49-659Z.json`.
Duration: 38.399 seconds; no overwritten samples. React Profiler callbacks remain
absent, so the report cannot confirm that the prepared profiling renderer was
actually loaded. It does contain the new synchronous probes and opening guard.

| Observation | 00:23 export | 00:30 export |
| --- | --- | --- |
| Largest frame gap | 215.3 ms | 166.6 ms |
| Speaker/social completion main gap | 159.7 ms | 124.9 ms |
| Timestamp update main gap | 118.2 ms | 62.5 ms |
| Gaps of at least 34 ms | 8 | 6 |
| NPC reconciliation calls | 37 | 3 |
| Total NPC reconciliation time | About 65 ms | About 6.8 ms |

Both runs append three social messages and patch four timestamps, but are still
uncontrolled recordings. The results support the perceived improvement without
establishing exact causal savings. The timestamp rendering tail falls from
43.6 ms to 28.8 ms; the timestamp update is still well above a 7 ms frame budget.

The previously unidentified pre-completion work is now directly measured:
`highlighting.selectSpeakers` takes 100.3 ms inside the largest stall. Character
runtime rebuilds peak at 1 ms, account-link grants at 0.7 ms, and authored contact
and phone-character projections at 0.1 ms each. Those are not current candidates
for major optimization. One `messages.stream` span reaches 27.9 ms; that span can
include synchronous subscriber work and is not proof of slow message patching.

### Speaker selection correction

The matcher created a distinct Unicode regular expression for every name and
account alias. Replace this with literal substring search plus shared Unicode
letter/number boundary checks. Preserve normalization, literal punctuation,
first/last-name rules, reasons, priority, structured participants and deduplication.
Boundary checks include astral code points; a rejected substring occurrence does
not prevent a later valid match.

A differential test exercises 5,082 alias/text combinations against the previous
regular-expression rule, in addition to the existing selection tests. A synthetic
Node first-call comparison using 100 characters, four accounts each and roughly
4.5 KB of narrative measured 419.14 ms before and 3.02 ms after, with identical
complete results. This is a single synthetic measurement, not a prediction of
browser frame timing or an end-to-end benchmark. Temporary benchmark artifacts
were kept outside the repository.

Next, record the same generation again and compare `highlighting.selectSpeakers`
and the largest pre-completion gap. Continue examining the remaining timestamp
rendering cost separately; the speaker-selection change does not directly fix
that rendering phase. No UI was launched automatically.

## Follow-up recording: 00:35:51 export

Source: `rpgraph-ui-performance-2026-09-27T00-35-51-307Z.json`.
Duration: 32.375 seconds; no overwritten samples; no React Profiler callbacks.

Speaker selection falls from 100.3 ms to 1.9 ms in the real application recording.
The prior 166.6 ms frame gap around selection is replaced by two gaps of 34.8 and
41.6 ms. The largest gap in the entire recording is now 125.1 ms, at the later
speaker/social publication; that phase was 124.9 ms previously and has not improved.
The timestamp gap is 76.4 ms versus 62.5 ms previously. Its rendering tail is
22.8 ms versus 28.8 ms. Different workload and scheduling prevent attributing
these variations to the matcher change: this run adds two social messages and
patches three timestamps, compared with three and four previously.

There are 10 gaps of at least 34 ms, compared with 6 in the previous recording.
Thus the targeted 100 ms computation is substantially faster, but not every
smoothness metric improved. NPC reconciliation remains at three calls, totaling
6.7 ms. Other instrumented projections remain short; the timestamp patch itself
is 0.1 ms. Remaining publication and rendering costs are not sufficiently
attributed to justify another speculative optimization.

No further runtime changes, tests or instrumentation were added for this
recording. The existing test suite was not expanded or rerun for this analysis.
The user considers the current behavior nearly sufficient; retain the measured
speaker-selection improvement and stop broadening the investigation for now.
