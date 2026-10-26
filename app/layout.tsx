import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Cơm Áo Gạo Tiền',
  title: {
    default: 'Cơm Áo Gạo Tiền',
    template: '%s · Cơm Áo Gạo Tiền',
  },
  description: 'Quản lý chi tiêu cá nhân và gia đình.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Cơm Áo Gạo Tiền',
    // 'black-translucent' draws the clock and battery in white over the page,
    // which disappears against a white app. 'default' gives dark glyphs on the
    // theme colour instead.
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Lets the layout paint under the notch and home indicator.
  viewportFit: 'cover',
  // One value, not a per-scheme pair: the app is light only, so the iOS status
  // bar should stay on the logo's warm white whatever the phone is set to.
  themeColor: '#FEFCF5',
};

/**
 * Runs before first paint so a session that already saw the splash never gets
 * a flash of it. Doing this in React would be a frame too late.
 */
const HIDE_SEEN_SPLASH = `try{if(sessionStorage.getItem('cagt-splash-shown')==='1'){document.documentElement.dataset.splash='seen'}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <script dangerouslySetInnerHTML={{ __html: HIDE_SEEN_SPLASH }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
