# GrocerySplit

A React and Flask application for splitting grocery expenses among friends, with advanced receipt scanning functionality using Google's Gemini Vision AI.

## Features

-   Upload and automatically scan receipts using AI-powered image recognition
-   AI-powered receipt analysis with Google's Gemini Vision API
-   Fallback to OCR when needed (both server-side and browser-based)
-   Manually add grocery items and prices
-   Add multiple users to split expenses with
-   Assign items to specific users
-   Calculate how much each person owes

## Prerequisites

-   Python 3.7+
-   Node.js and npm
-   Tesseract OCR (for OCR fallback)
-   Google Gemini API key (for advanced receipt scanning)

## Configuration

Port settings can be configured in `config.json`:

-   Frontend runs on port 3000 by default
-   Backend runs on port 6000 by default

To change ports, edit the `config.json` file in the root directory.

## Setup Instructions

### Get a Google Gemini API Key

1. Visit the Google AI Studio at https://makersuite.google.com/
2. Sign in with your Google account and create a new project
3. Navigate to the API Keys section and create a new API key
4. Copy your API key
5. Open the file `backend/.env` and set `GEMINI-API-KEY` to your API key

### Install Tesseract OCR (For OCR fallback)

1. Download and install Tesseract OCR from [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
2. Make sure to add Tesseract to your PATH environment variable
3. Verify installation by running `tesseract --version` in your terminal

### Quick Start

1. Clone this repository
2. Run the startup script:
    ```
    .\start.ps1
    ```

This script will:

-   Create a Python virtual environment
-   Install Python dependencies
-   Install Node.js dependencies
-   Start the Flask backend server
-   Start the React development server

### Manual Setup (If startup script doesn't work)

#### Backend Setup

1. Create a virtual environment:

    ```
    python -m venv venv
    ```

2. Activate the virtual environment:

    ```
    .\venv\Scripts\Activate.ps1
    ```

3. Install Python dependencies:

    ```
    pip install -r requirements.txt
    ```

4. Run the Flask backend:
    ```
    python backend\app.py
    ```

#### Frontend Setup

1. Navigate to the frontend directory:

    ```
    cd frontend
    ```

2. Install Node.js dependencies:

    ```
    npm install
    ```

3. Start the React development server:
    ```
    npm start
    ```

## Usage

1. Open your browser and navigate to the configured frontend port (default: http://localhost:3000)
2. Upload a receipt image using the upload section
3. The app will use Google's Gemini Vision AI to analyze the receipt and extract items with prices
4. Add users to split expenses with
5. Assign items to specific users by checking the appropriate boxes
6. Click "Calculate" to see how much each person owes

## Technical Details

-   **Frontend**: React.js
-   **Backend**: Flask (Python)
-   **Receipt Scanning**:
    -   Primary: Google Gemini Vision AI for advanced image understanding
    -   Fallback 1: Tesseract OCR with OpenCV for image preprocessing (server-side)
    -   Fallback 2: Tesseract.js (browser-based OCR)

## Troubleshooting

### Receipt scanning not working with Gemini AI?

1. Check that you've added your Gemini API key correctly in `backend/.env`
2. Make sure you have an active internet connection as Gemini requires API calls
3. Verify that the uploaded receipt image is clear and well-lit
4. The app will automatically fall back to traditional OCR methods if Gemini fails

### Receipt scanning not working at all?

1. Make sure Tesseract OCR is properly installed
2. Ensure the receipt image is clear and well-lit
3. Try adding items manually if automatic scanning fails

### API connection issues?

1. Make sure both frontend and backend servers are running
2. Check that the ports in `config.json` match your running services
3. The frontend expects the backend to be available at the port specified in `config.json` (default: http://localhost:6000)
