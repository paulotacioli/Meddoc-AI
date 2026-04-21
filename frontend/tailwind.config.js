/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          blue:  '#1A56A0',
          teal:  '#0F6E56',
        }
      }
    },
  },
  plugins: [],
}
