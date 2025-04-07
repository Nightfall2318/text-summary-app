Text-Summary-App
This project is a full-stack application that extracts text from various document types (PDF, DOCX, images, text files) and generates concise summaries using AI. The app uses a Python Flask backend and React frontend.
Live Application
You can access the live application here: [Text-Summary-App](https://text-summary-app-production.up.railway.app/)
Project Structure
CopyText-Summary-App/
├── text-summary-app/  # React frontend
├── backend/          # Flask backend
├── .gitignore        # Git ignore file
└── Dockerfile        # Docker configuration for deployment
Prerequisites

Node.js (v16+ recommended)
Python 3.9+
npm (comes with Node.js)
Flask
React.js
Transformers
Tesseract OCR (for image text extraction)

Setup

Clone the repository:

Copygit clone [https://github.com/yourusername/text-summary-app.git](https://github.com/Nightfall2318/text-summary-app.git)
cd text-summary-app

Install dependencies for both frontend and backend:

Copy# Frontend dependencies
cd text-summary-app && npm install

# Backend dependencies
cd ../backend
pip install flask flask-cors pypdf python-docx pillow pytesseract transformers torch python-magic python-dateutil chardet pymupdf
Running the Application Locally

Start the backend server:

Copycd backend
python server.py

In a new terminal, start the frontend development server:

Copycd text-summary-app
npm start

Open your browser and navigate to http://localhost:3000 to use the application.

Deployment
This application is configured for deployment on Railway using Docker. The Dockerfile in the root directory handles building both the frontend and backend.
Simply push your changes to GitHub and connect the repository to Railway for automatic deployment.
Features

Upload various document types (PDF, DOCX, TXT, images)
Extract text from documents using specialized libraries
Generate AI-powered summaries using Hugging Face Transformers
Track summarization progress in real-time
Customize summarization parameters
Regenerate summaries with different settings
