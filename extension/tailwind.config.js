/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './popup/**/*.{ts,tsx,html}',
    './side-panel/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0a1628',
        mint: '#34d399',
        amber: '#f59e0b',
        'navy-light': '#1a2d4a',
        'navy-dark': '#060e1a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
