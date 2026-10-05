# Study Desk · Flashcard Study App

A free, offline flashcard study app built with plain HTML, CSS and JavaScript. You can run your own deck from a CSV file, quiz yourself four different ways, and track what you know. It has no install, no account and no dependencies.

**[Try it live →](https://fellobello.github.io/flashcard-study-app/)**

![Study Desk start screen](docs/screenshot.png)

## Features

- **Four study modes:** Flashcards, Multiple choice, Match, and Speed round (true/false against the clock).
- **Three difficulty levels** that change time limits, answer choices, lives and scoring.
- **CSV decks:** edit cards in any spreadsheet app. Each card has a section, tags, a term, a definition and an optional example.
- **Card picker:** select, add or subtract sections and tags, skip cards you already know, and preview the cards before you start.
- **Progress tracking:** got-it and study-again marks, starred cards and best scores. Progress saves to a local `progress.json` file or to the browser.
- **Pomodoro focus timer** that keeps running while you play.
- **Quizlet / Anki export:** copy the whole deck as tab-separated text.

It comes with a sample deck of 242 cards on distributed systems, multithreading, synchronization and web services (SOAP, REST, WCF).

## Getting started

| How | Progress is saved to |
|---|---|
| **macOS:** double-click `Open Flashcards.command` | `progress.json` in the folder |
| **Windows / Linux / macOS:** run `python3 server.py`, then open the printed address | `progress.json` in the folder |
| Open `index.html` directly | your browser |
| Host the folder on GitHub Pages or any static host | each visitor's browser |

`server.py` needs Python 3.7+ and only listens on `127.0.0.1`.

## Making your own deck

The app ships with a 242-card sample deck in `cards.csv`, so it works the moment you open it. To use your own cards:

1. **Start from the template.** Copy `cards-template.csv` (3 example cards) or open `cards.csv`, and edit it in Google Sheets, Excel, Numbers or any text editor.
2. **Fill in one row per card:**

   | Column | Required | Notes |
   |---|---|---|
   | `section` | yes | One per card, written as a short code, a dash, then a name: `U1 - Basics`, `CH3 - Cell biology`. The code shows in compact spots like the progress bars. |
   | `tags` | no | Any number, separated by `;`: `vocab; formula`. Each tag becomes a deck you can study. |
   | `title` | yes | The term or question. Titles must be unique; they also identify the card in saved progress. |
   | `info` | yes | The definition or answer. Wrap code in backticks: `` `x * 2` ``. |
   | `example` | no | Shown on the back of the card. |

3. **Save it as `cards.csv`** in this folder, replacing the sample deck. Export as CSV in UTF-8: Google Sheets **File → Download → CSV**, Excel **CSV UTF-8**, Numbers **File → Export To → CSV**.
4. **Restart the app.** With `server.py`, just reload the page; the server also refreshes `cards-builtin.js`, the copy used when `index.html` is opened directly. On GitHub Pages, commit the new `cards.csv`.
5. **Start fresh (optional).** Delete `progress.json`, or use **Clear progress** in the app, to drop marks and scores from the old deck.

You can also add or remove tags inside the app (Browse all cards → **+ tag**) and save them back with **Write tags into cards.csv**.

## Choosing cards

Every section, tag and pile on the start screen has three actions:

- **Click the name to select it.** Selecting is a filter: only cards in *every* selected item stay.
- **`+` adds** that item's cards.
- **`−` subtracts** that item's cards.

The result is **(selected items, overlapped) + added − subtracted**. The line under the picker shows the current formula and card count.

## Customizing

- **Look:** `styles.css` starts with design tokens (colors, fonts, spacing). New UI is built from shared primitives: `.panel` `.sheet` `.stack` `.cluster` `.btn` `.chip` `.badge` `.choice` `.field` `.fold`. Accent colors are passed in through `--c`.
- **Countdown:** set `COUNTDOWN` at the top of `app.js`, e.g. `{ label: "Exam", date: "2025-12-15" }`.
- **New game mode:**
  1. Add an entry to `MODES` in `app.js`.
  2. Add an `IMPL` object whose `start()` renders into `stage`.
  3. Have it call `finish()` when the game ends.

## Project structure

```
index.html               page structure
styles.css               tokens → base → primitives → components
app.js                   card loading, saving, picker, game modes
cards.csv                the deck (242-card sample)
cards-template.csv       3-card starting point for your own deck
cards-builtin.js         generated copy of cards.csv
server.py                optional local server that writes progress.json
Open Flashcards.command  macOS launcher for server.py
```
