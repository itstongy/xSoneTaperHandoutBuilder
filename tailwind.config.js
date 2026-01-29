/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"] ,
  theme: {
    extend: {
      colors: {
        ink: "#1b1a17",
        sand: "#efe7db",
        clay: "#d9c7b1",
        moss: "#2a5d4e",
        sun: "#ffca7a",
        fog: "#f8f4ee",
      },
      boxShadow: {
        soft: "0 18px 30px rgba(0, 0, 0, 0.12)",
        lift: "0 10px 18px rgba(0, 0, 0, 0.1)",
      },
      fontFamily: {
        display: ["Fraunces", "Iowan Old Style", "Georgia", "serif"],
        body: ["Work Sans", "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
