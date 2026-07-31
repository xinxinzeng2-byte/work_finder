/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖白底
        canvas: '#faf9f6',
        // 纯白卡片
        paper: '#ffffff',
        // 主文字
        ink: {
          DEFAULT: '#2c2c2c',
          secondary: '#6b6b6b',
          weak: '#999999',
        },
        // 赤陶强调色
        terra: {
          DEFAULT: '#c45a3c',
          hover: '#a8482e',
          light: '#f9ede8',
          border: '#f0dcd4',
        },
        // 边框/分割线
        line: '#e8e4df',
        // 成功
        moss: '#5a8f6c',
        mossLight: '#eef5f0',
        // 错误
        rust: '#c45a3c',
      },
      fontFamily: {
        serif: ['Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'Georgia', 'serif'],
        sans: ['Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Cascadia Code', 'monospace'],
      },
      maxWidth: {
        content: '720px',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(0,0,0,0.04)',
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
      },
    },
  },
  plugins: [],
};
