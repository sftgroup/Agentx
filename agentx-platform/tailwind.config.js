/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#09090B', elevated: '#111114', card: 'rgba(17,17,20,0.6)' },
        border: { DEFAULT: 'rgba(255,255,255,0.06)', glow: 'rgba(255,255,255,0.10)' },
        text: { primary: '#FFFFFF', secondary: '#A1A1AA', muted: '#71717A' },
        accent: { purple: '#A855F7', blue: '#3B82F6', cyan: '#06B6D4', pink: '#EC4899' },
      },
      backdropBlur: { glass: '24px' },
      boxShadow: {
        glow: '0 0 40px -10px rgba(168,85,247,0.15)',
        'glow-sm': '0 0 20px -5px rgba(168,85,247,0.1)',
        'glow-blue': '0 0 40px -10px rgba(59,130,246,0.15)',
        card: '0 1px 2px rgba(0,0,0,0.2)',
      },
      borderRadius: { glass: '16px' },
    },
  },
  plugins: [],
}
