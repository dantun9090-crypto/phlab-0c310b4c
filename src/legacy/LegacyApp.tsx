import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { createLegacyRouter } from "./AppRouter";
import "@/legacy-styles.css";

const browserRouter = typeof document !== "undefined" ? createLegacyRouter("/") : null;

function getLegacyRouter(initialPath: string) {
  if (typeof document === "undefined") {
    return createLegacyRouter(initialPath);
  }
  return browserRouter;
}

export default function LegacyApp({ initialPath = "/" }: { initialPath?: string }) {
  const router = getLegacyRouter(initialPath);

  return (
    <HelmetProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </HelmetProvider>
  );
}
