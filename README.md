# ExamPaper-Checker-Lens-AI 📝✨

An intelligent exam paper checking and grading assistant powered by multimodal AI (Google Gemini & Groq). It extracts questions from question papers, detects student answers on handwritten answer sheets, isolates answer bounding boxes, and generates structured grading with actionable feedback.

## ✨ Features

- **Automated Question Extraction**: Parses questions, sub-parts, and maximum marks directly from question paper scans/PDFs.
- **Handwritten Answer Recognition**: Maps handwritten student answers to corresponding questions, even if answered out of order.
- **Visual Bounding Box Mapping**: Highlights student answers directly on the answer sheet preview.
- **Accurate Scoring & Feedback**: Evaluates answers with strict criteria, providing detailed explanations, percentage scores, and letter grades.
- **Multimodal AI Support**: Powered primarily by Google Gemini (`gemini-3.6-flash`) with Groq fallback.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- A Google Gemini API Key ([Get one free](https://aistudio.google.com/apikey)) or Groq API Key ([Get one free](https://console.groq.com/keys))

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Sahil1320/ExamPaper-Checker-Lens-AI.git
   cd ExamPaper-Checker-Lens-AI
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory:
   ```env
   GOOGLE_GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript
- **AI Models**: Google Gemini 3.6 Flash / Groq Qwen Vision
- **Styling**: Vanilla CSS Modules with custom design system tokens
