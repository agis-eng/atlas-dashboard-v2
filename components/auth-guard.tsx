"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Client-side auth guard. Prefer the proxy.ts server-side protection for
 * actual security. Use this component for progressive rendering / skeleton
 * states while the session is being verified.
 */
export function AuthGuard({ children, fallback = null }: AuthGuardProps) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          setAuthenticated(true);
        } else {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"))
      .finally(() => setChecked(true));
  }, [router]);

  if (!checked) return <>{fallback}</>;
  if (!authenticated) return null;
  return <>{children}</>;
}
