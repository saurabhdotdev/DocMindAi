/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Default dark layout
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0A0A0C',      // Deep Obsidian background
          card: '#13131A',      // Slightly lighter card background
          border: 'rgba(255, 255, 255, 0.08)', // Faint glass border
          primary: '#536DFE',   // Electric Indigo accent
          secondary: '#7C4DFF', // Vibrant Purple accent
          success: '#00E676',   // Bright Green
          error: '#FF1744',     // Bright Red
          warning: '#FFD600',   // Bright Yellow
          text: '#E2E8F0',      // Off-white readable text
          textMuted: '#94A3B8', // Muted slate text
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
