import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

// ── Viewport (theme color, mobile scale) ─────────────────────────────────────
export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",            // safe-area for iPhone notch/Dynamic Island
};

// ── App metadata ──────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "Verge",
  description: "Talk through your day. Get a plan.",
  manifest: "/manifest.json",
  applicationName: "Verge",
  appleWebApp: {
    capable: true,
    title: "Verge",
    statusBarStyle: "black-translucent",  // lets content go under the status bar
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png",   sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

// ── Inline SW registration (no extra client component file needed) ────────────
function ServiceWorkerRegistration() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          if ('serviceWorker' in navigator && !navigator.userAgent.includes('Electron')) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').catch(function() {});
            });
          }
        `,
      }}
    />
  );
}
