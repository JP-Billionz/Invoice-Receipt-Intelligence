// CJS, NOT .mjs — AISB Render-deploy lesson #2.
// Next.js's PostCSS pipeline on Render misresolves the ESM variant.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
