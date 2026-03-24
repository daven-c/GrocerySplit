# Grocery Split

**App Description:** An advanced, premium application for extracting, splitting, and tracking shared grocery expenses smoothly.

**Features:**
- Add and manage user accounts with secure password hashing and JWT authentication.
- Create and persist grocery splitting sessions with a robust SQLite database.
- Utilize Google Gemini AI / Tesseract OCR to automatically parse physical receipt images and itemize prices.
- Dynamically assign items to specific users and automatically calculate splitting totals.
- Modern, dynamic, glassmorphism-inspired UI designed using Stitch and Tailwind CSS.

## Technologies

- **Frontend:** React, TypeScript, Tailwind CSS, Vite
- **Backend:** Python, Flask, Werkzeug, itsdangerous
- **Database:** SQLite
- **AI/OCR:** Google Generative AI (Gemini Vision), OpenCV, PyTesseract

## Installation

### Backend
Make sure you have `python3` and `pip` installed.

```bash
cd backend

# Create and activate a virtual environment (optional but recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file with GEMINI_API_KEY if using AI parsing
# Example: GEMINI_API_KEY=your_key_here

# Run the Flask backend (Runs on port 6000 strictly based on config.json)
python app.py
```

### Frontend
Make sure you have Node.js installed.

```bash
cd frontend

# Install dependencies
npm install

# Start the React Vite development server
npm run dev
```

## Running the Complete App
The backend runs on `http://localhost:6000` and the frontend proxy routes `/api` requests to it via Vite configuration on `http://localhost:3000`. To start using the app, simply fire up both the Python and Node development servers.
