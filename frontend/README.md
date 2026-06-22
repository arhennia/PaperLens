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

- `npm run dev`: Starts the development server with HMR.
- `npm run build`: Builds the app for production into the `dist` directory.
- `npm run lint`: Runs ESLint to check for code quality and formatting issues.
- `npm run preview`: Previews the production build locally.

## Project Structure

The current structure focuses on a streamlined single-page application setup:

- `src/App.jsx`: The core application file containing all the UI components, state management, and API integrations for the dashboard and upload flows.
- `src/index.css`: Global styles and Tailwind CSS imports.
- `public/`: Static assets that don't require processing.

## Configuration

If your backend is running on a different port or host, you will need to update the API endpoint references in `src/App.jsx` (which defaults to `http://localhost:8000`).

## Styling

This project utilizes **Tailwind CSS v4** for all styling. No external CSS files are used for components; everything is built using utility classes for rapid development and maintainability. UI icons are provided by **Lucide React**.
