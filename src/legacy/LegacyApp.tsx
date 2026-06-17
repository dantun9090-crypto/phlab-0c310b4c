import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { createLegacyRouter } from "./AppRouter";
import { SSRDataProvider, type SSRBanner } from "./SSRDataContext";
import "@/legacy-styles.css";

const browserRouter = typeof document !== "undefined" ? createLegacyRouter("/") : null;

function getLegacyRouter(initialPath: string) {
  if (typeof document === "undefined") {
    return createLegacyRouter(initialPath);
  }
  return browserRouter as ReturnType<typeof createLegacyRouter>;
}

export default function LegacyApp({
  initialPath = "/",
  initialBanner = null,
}: {
  initialPath?: string;
  initialBanner?: SSRBanner | null;
}) {
  const router = getLegacyRouter(initialPath);

  return (
    <HelmetProvider>
      <ThemeProvider>
        <SSRDataProvider value={{ banner: initialBanner }}>
          <RouterProvider router={router} />
        </SSRDataProvider>
      </ThemeProvider>
    </HelmetProvider>
  );
}
