/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 레거시 별칭. 신규 UI에서는 brand/moon 토큰을 사용한다.
        volt: {
          DEFAULT: "#F2C66D",
          50: "#FFF9EA",
        },
        obsidian: {
          DEFAULT: "#17102D",
        },
        crystal: {
          DEFAULT: "#F7F4FF",
        },
        brand: {
          50: "#f7f4ff",
          100: "#eee9ff",
          200: "#ddd3ff",
          300: "#c6b7ff",
          400: "#a88dfb",
          500: "#896af1",
          600: "#6849d8",
          700: "#5639b5",
          800: "#472f93",
          900: "#3b2977",
          950: "#241445",
        },
        moon: { DEFAULT: "#F2C66D", 50: "#FFF9EA", 100: "#FBECC5", 500: "#F2C66D", 700: "#B78A36" },
      },
      fontFamily: {
        // 본문: 둥근 영문(Nunito) + 한글(Pretendard/Noto Sans KR)
        sans: [
          "Nunito",
          "Pretendard",
          "Noto Sans KR",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        // 제목/로고 느낌: 통통하고 둥근 Baloo 2 + 귀여운 한글 Jua
        display: [
          "Baloo 2",
          "Jua",
          "Fredoka",
          "Nunito",
          "Noto Sans KR",
          "sans-serif",
        ],
      },
      borderRadius: {
        // 전반적으로 살짝 더 둥글게(친근한 톤)
        "4xl": "2rem",
      },
      keyframes: {
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "count-down": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.1)" },
          "100%": { transform: "scale(1)" },
        },
        // 히어로 별빛 반짝임
        twinkle: {
          "0%, 100%": { opacity: "0.15", transform: "scale(0.8)" },
          "50%": { opacity: "0.9", transform: "scale(1.15)" },
        },
        // 달·수정구슬 등 큰 장식의 느린 부유
        "float-slow": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        // 신비로운 오라(빛무리) 호흡
        aura: {
          "0%, 100%": { opacity: "0.35", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.08)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.5s ease-out",
        "fade-in": "fade-in 0.6s ease-out",
        "count-down": "count-down 1s ease-in-out infinite",
        twinkle: "twinkle 3s ease-in-out infinite",
        "float-slow": "float-slow 6s ease-in-out infinite",
        aura: "aura 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
