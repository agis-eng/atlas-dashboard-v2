import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Toaster } from "@/components/ui/sonner";
import { VoiceProvider } from "@/components/voice-provider";
import { VoiceDrawer } from "@/components/voice-drawer";
import { MobileNav } from "@/components/mobile-nav";
import { getSession } from "@/lib/session";

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
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <VoiceProvider>
            <AppSidebar currentUser={currentUser} />
            <div className="flex flex-1 flex-col min-h-screen">
              <header className="flex h-16 items-center justify-end border-b border-border px-6">
                <ThemeToggle />
              </header>
              <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
            </div>
            <VoiceDrawer />
            <MobileNav />
            <Toaster />
          </VoiceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
