/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#FBF7F0',
          100: '#F5EBDA',
          200: '#E8D5B0',
          400: '#C4A265',
          500: '#A8893E',
          600: '#8B7030',
        },
        charcoal: {
          100: '#F5F5F5',
          700: '#3D3D3D',
          800: '#2D2D2D',
          900: '#1A1A1A',
        },
        cream: '#FFFDF8',
        danger: '#C0392B',
        success: '#5A8F5A',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        tc: ['"PingFang TC"', '"Microsoft JhengHei"', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        elevated: '0 4px 12px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
}