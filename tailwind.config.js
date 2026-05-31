module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#0D9488', // Medical/Healthcare Teal
          600: '#0F766E',
          700: '#115E59',
          800: '#134E4A',
          900: '#115E59',
        },
        danger: {
          500: '#EF4444', // Alert Red
          600: '#DC2626',
          700: '#B91C1C',
        },
        dark: {
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617'
        }
      }
    },
  },
  plugins: [],
}
