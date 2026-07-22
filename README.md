# GrocerySplit

Snap a photo of your grocery receipt, tap once per item to assign it to a friend, and get an exact split — no more mental math over Venmo. GrocerySplit uses Gemini Vision (with a Tesseract OCR fallback) to itemize receipts automatically, then persists every shared session so you can settle up later.

## Why it exists

Splitwise-style apps ask you to type every item. Receipt-scanning apps read *totals* but not *per-item* prices. GrocerySplit closes that gap for the specific case people care about most — shared groceries between roommates or partners — where the friction of manual entry is the reason splits don't happen.

## Features

- **Receipt → itemized list, automatically.** Gemini Vision parses physical receipt images and pulls out per-line names + prices. Tesseract OCR + OpenCV pre-processing serve as a fallback for tricky scans.
- **Persistent sessions.** SQLite stores users, receipts, and splits, so a running grocery tab across a household is a first-class concept, not a one-shot calculation.
- **User accounts.** Passwords hashed with Werkzeug, tokens signed with itsdangerous — no plaintext, no third-party auth vendor.
- **Per-item assignment UI.** Tap an item, tap a friend, done. Totals and per-person balances update live.
- **Glassmorphic UI.** Tailwind + custom design using Stitch — the app should feel premium enough that people actually reach for it at checkout.

## Tech stack

| Layer         | Technology                                                 |
| ------------- | ---------------------------------------------------------- |
| Frontend      | React + TypeScript, Vite, Tailwind CSS                     |
| Backend       | Python, Flask, Werkzeug, itsdangerous                      |
| Database      | SQLite                                                     |
| AI / Vision   | Google Generative AI (Gemini Vision), Tesseract, OpenCV    |

## Local development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Add your Gemini key (optional but recommended for AI parsing)
echo "GEMINI_API_KEY=your_key_here" > .env

# Runs on port 6000 (set in config.json)
python app.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite serves the app on `http://localhost:3000` and proxies `/api` requests to the Flask backend on `http://localhost:6000`.

## Repository layout

```
backend/            # Flask app, auth, receipt parsing, SQLite models
frontend/           # React + Vite + Tailwind UI
config.json         # Ports and runtime configuration
```

## Status

Personal side project. Working end-to-end; not deployed publicly.
