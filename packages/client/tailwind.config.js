/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#121212',
        surface: '#1e1e1e',
        'surface-light': '#2c2c2c',
        primary: '#4a90e2',
        'primary-hover': '#357abd',
        danger: '#e74c3c',
        'danger-hover': '#c0392b',
        success: '#2ecc71',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
