import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { useEffect } from "react";

// If the session expires or is revoked while a page is open, API calls start
// returning 401 — send the user back to the login page instead of failing silently.
function useRedirectOnUnauthorized() {
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      const path = new URL(url, window.location.origin);
      if (
        res.status === 401 &&
        path.origin === window.location.origin &&
        path.pathname.startsWith("/api/") &&
        !path.pathname.startsWith("/api/auth/") &&
        window.location.pathname !== "/login"
      ) {
        localStorage.removeItem("user");
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      return res;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);
}

export default function App({ Component, pageProps }: AppProps) {
  useRedirectOnUnauthorized();
  return <Component {...pageProps} />;
}
