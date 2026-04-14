/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
        extend: {
                borderRadius: {
                        lg: 'var(--radius)',
                        md: 'calc(var(--radius) - 2px)',
                        sm: 'calc(var(--radius) - 4px)',
                        'btn': '6px',
                        'card': '12px',
                },
                colors: {
                        background: 'hsl(var(--background))',
                        foreground: 'hsl(var(--foreground))',
                        card: {
                                DEFAULT: 'hsl(var(--card))',
                                foreground: 'hsl(var(--card-foreground))'
                        },
                        popover: {
                                DEFAULT: 'hsl(var(--popover))',
                                foreground: 'hsl(var(--popover-foreground))'
                        },
                        primary: {
                                DEFAULT: '#2563EB',
                                hover: '#1D4ED8',
                                light: '#DBEAFE',
                                foreground: 'hsl(var(--primary-foreground))'
                        },
                        secondary: {
                                DEFAULT: '#6275AF',
                                light: '#EEF2FF',
                                foreground: 'hsl(var(--secondary-foreground))'
                        },
                        muted: {
                                DEFAULT: 'hsl(var(--muted))',
                                foreground: 'hsl(var(--muted-foreground))'
                        },
                        accent: {
                                DEFAULT: 'hsl(var(--accent))',
                                foreground: 'hsl(var(--accent-foreground))'
                        },
                        destructive: {
                                DEFAULT: '#EF4444',
                                hover: '#DC2626',
                                foreground: 'hsl(var(--destructive-foreground))'
                        },
                        border: 'hsl(var(--border))',
                        input: 'hsl(var(--input))',
                        ring: 'hsl(var(--ring))',
                        neutral: {
                                50: '#F8FAFC',
                                100: '#F1F5F9',
                                200: '#E2E8F0',
                                300: '#CBD5E1',
                                400: '#94A3B8',
                                500: '#64748B',
                                600: '#475569',
                                700: '#334155',
                                800: '#1E293B',
                                900: '#0F172A',
                        },
                        chart: {
                                '1': 'hsl(var(--chart-1))',
                                '2': 'hsl(var(--chart-2))',
                                '3': 'hsl(var(--chart-3))',
                                '4': 'hsl(var(--chart-4))',
                                '5': 'hsl(var(--chart-5))'
                        }
                },
                fontFamily: {
                        sans: ['DM Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
                        heading: ['Sora', 'sans-serif'],
                        body: ['DM Sans', 'Inter', 'sans-serif'],
                        mono: ['Roboto Mono', 'Courier New', 'monospace']
                },
                boxShadow: {
                        'card': '0 1px 3px rgba(0, 0, 0, 0.08)',
                        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.1)',
                        'button': '0 2px 4px rgba(37, 99, 235, 0.2)',
                        'button-hover': '0 4px 8px rgba(37, 99, 235, 0.25)',
                        'input-focus': '0 0 0 3px rgba(37, 99, 235, 0.15)',
                },
                keyframes: {
                        'accordion-down': {
                                from: {
                                        height: '0'
                                },
                                to: {
                                        height: 'var(--radix-accordion-content-height)'
                                }
                        },
                        'accordion-up': {
                                from: {
                                        height: 'var(--radix-accordion-content-height)'
                                },
                                to: {
                                        height: '0'
                                }
                        },
                        'fade-in': {
                                from: {
                                        opacity: '0',
                                        transform: 'translateY(10px)'
                                },
                                to: {
                                        opacity: '1',
                                        transform: 'translateY(0)'
                                }
                        }
                },
                animation: {
                        'accordion-down': 'accordion-down 0.2s ease-out',
                        'accordion-up': 'accordion-up 0.2s ease-out',
                        'fade-in': 'fade-in 0.3s ease-out'
                }
        }
  },
  plugins: [
    require("tailwindcss-animate"),
    function({ addVariant }) {
      addVariant('discuss', '.discuss &');
      addVariant('discuss-black', '.discuss-black &');
    }
  ],
};
