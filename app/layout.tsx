import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { getSession } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas Dashboard",
  description: "Personal command center",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read current session server-side to pass user to sidebar
  let currentUser: { id: string; name: string; email: string; profile: "erik" | "anton" } | null = null;
  try {
    const session = await getSession();
    if (session) {
      currentUser = {
        id: session.userId,
        name: session.name,
        email: session.email,
        profile: session.profile,
      };
    }
  } catch {
    // Not authenticated — proxy.ts handles the redirect
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppSidebar currentUser={currentUser} />
          <div className="flex flex-1 flex-col min-h-screen">
            <header className="flex h-16 items-center justify-end border-b border-border px-6">
              <ThemeToggle />
            </header>
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
