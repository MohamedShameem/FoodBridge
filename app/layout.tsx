import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import './globals.css';

const body = DM_Sans({ variable: '--font-body', subsets: ['latin'] });
const display = Manrope({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://foodbridge-rescue.creamy-sugar-2932.chatgpt.site'),
  title: 'FoodBridge — Surplus to support',
  description: 'An autonomous food-rescue coordinator that gets surplus food where it is needed, before time runs out.',
  openGraph: {
    title: 'FoodBridge — Surplus to support',
    description: 'Autonomous surplus-food rescue, coordinated before time runs out.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'FoodBridge moves surplus food from donors to community partners.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FoodBridge — Surplus to support',
    description: 'Autonomous surplus-food rescue, coordinated before time runs out.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${body.variable} ${display.variable}`}>{children}</body></html>;
}
