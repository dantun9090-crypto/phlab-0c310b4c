import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useMemo } from "react";
import { createLegacyRouter } from "./AppRouter";
import "@/legacy-styles.css";

export default function LegacyApp({ initialPath = "/" }: { initialPath?: string }) {
  const router = useMemo(() => createLegacyRouter(initialPath), [initialPath]);

  return (
    <HelmetProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </HelmetProvider>
  );
}
