/**
 * Tailwind CSS v4 is a PostCSS plugin. There is no `tailwind.config.ts`: v4
 * configures itself from CSS, so the theme lives in `app/globals.css` under
 * `@theme`. One place to look for design tokens rather than two.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
