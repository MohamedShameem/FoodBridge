import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import './globals.css';

const body = DM_Sans({ variable: '--font-body', subsets: ['latin'] });
const display = Manrope({ variable: '--font-display', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://foodbridge.byshameem.space'),
  title: 'FoodBridge — Surplus to support',
  description: 'An autonomous food-rescue coordinator that gets surplus food where it is needed, before time runs out.',
  openGraph: {
    title: 'FoodBridge — Surplus to support',
    description: 'Autonomous surplus-food rescue, coordinated before time runs out.',
    images: [{ url: '/brand/foodbridge-devpost-thumbnail.png', width: 1672, height: 941, alt: 'A restaurant, volunteer and community pantry coordinate a safe FoodBridge meal rescue.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FoodBridge — Surplus to support',
    description: 'Autonomous surplus-food rescue, coordinated before time runs out.',
    images: ['/brand/foodbridge-devpost-thumbnail.png'],
  },
  icons: { icon: '/brand/foodbridge-logo.png', apple: '/brand/foodbridge-logo.png' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${body.variable} ${display.variable}`}>{children}</body></html>;
}
