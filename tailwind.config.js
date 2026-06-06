/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      spacing: {
        cell: '96px',
        cellh: '28px',
        rowheader: '48px',
        colheader: '28px',
      },
      width: {
        cell: '96px',
        rowheader: '48px',
      },
      height: {
        cellh: '28px',
        colheader: '28px',
      },
      lineHeight: {
        cellh: '28px',
      },
    },
  },
  plugins: [],
};
