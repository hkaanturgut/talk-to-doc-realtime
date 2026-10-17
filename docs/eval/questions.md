# Grounding eval (SC-005)

**Target**: at least 9 of 10 answers are correct and grounded in the document.

## Source

_The Declaration of Independence_, Project Gutenberg eBook #1
(<https://www.gutenberg.org/ebooks/1>), public domain. Load it with **Paste text** (copy the text
between the START and END markers), or with:

```bash
curl -sL https://www.gutenberg.org/cache/epub/1/pg1.txt | sed -n '28,255p' > decl.txt
jq -Rs '{title:"Declaration of Independence", text:.}' decl.txt \
  | curl -s -X POST "$URI/api/ingest/text" -H 'content-type: application/json' --data @-
```

## Questions and expected answers

| #   | Question                                                                                                   | Expected (from the text)                                                 |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | What date appears in the heading of the declaration?                                                       | July 4, 1776                                                             |
| 2   | Which unalienable rights are listed?                                                                       | Life, Liberty and the pursuit of Happiness                               |
| 3   | From what do governments derive their just powers?                                                         | The consent of the governed                                              |
| 4   | The history of the present King of Great Britain is a history of what?                                     | Repeated injuries and usurpations                                        |
| 5   | What grievance does the document raise about juries?                                                       | Depriving colonists, in many cases, of trial by jury                     |
| 6   | What is the King transporting large armies of?                                                             | Foreign mercenaries                                                      |
| 7   | What do the signers mutually pledge to each other?                                                         | Their Lives, their Fortunes and their sacred Honor                       |
| 8   | What is a Prince whose character is marked by every act which may define called, and what is he unfit for? | A Tyrant; unfit to be the ruler of a free people                         |
| 9   | In the Project Gutenberg preface, how many megabytes did the disk pack hold?                               | 5 megabytes                                                              |
| 10  | What does the document say about electricity?                                                              | Nothing. The model must say it isn't in the document (negative control). |

## Results

| Date       | Mode                                                        | Deployment                                      | Score       | Notes                                                                                                                 |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-10-17 | text (same Realtime session, `output_modalities: ["text"]`) | deployed app, `gpt-realtime-2.1`, canadacentral | **10 / 10** | #10 correctly said the text doesn't mention electricity, then gave clearly labeled general information, as instructed |
| _owner_    | voice, iPhone Safari                                        | deployed app                                    | _pending_   | Ask the same 10 questions aloud, and record latency with `?debug=1` (M17).                                            |

## YouTube check

Video: _Me at the zoo_ (`https://www.youtube.com/watch?v=jNQXAC9IVRw`, 19 s, the first YouTube
video). Ask locally, with direct captions:

- "What animals is he standing in front of?" Expected: elephants.
- "What does he say is cool about them?" Expected: their really long trunks.

In the hosted app, expect the paste fallback unless Supadata is enabled (see the README).
