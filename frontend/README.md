# PaperLens Frontend

This is the frontend application for **PaperLens**, an AI-powered question paper analyzer. It provides a sleek, interactive dashboard to upload exam papers, view analysis results, and explore trends.

## Technologies Used

* **[React 19](https://react.dev/)**: For building the user interface.
* **[Vite 8](https://vitejs.dev/)**: Fast, modern build tool and development server.
* **[Tailwind CSS 4](https://tailwindcss.com/)**: For rapid, utility-first styling.
* **[Lucide React](https://lucide.dev/)**: For beautiful and consistent icons.

## Features

* **Multi-PDF Upload Interface**: Seamlessly select and upload multiple previous year question papers at once.
* **Analytics Dashboard**: Interactive views for subject-wise breakdown, top repeated questions, and exam trends.
* **Audit Views**: Interfaces to review rejected extractions and OCR logs.

## Getting Started

First, ensure the PaperLens backend server is running. Then, set up the frontend:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

The application will be available at [http://localhost:5173](http://localhost:5173).

## Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the app for production.
- `npm run lint`: Runs ESLint to check for code issues.
- `npm run preview`: Previews the production build locally.
