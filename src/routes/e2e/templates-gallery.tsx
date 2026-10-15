import { createFileRoute, notFound } from "@tanstack/react-router";
import { ThemeProvider } from "@/contexts/ThemeContext";
import ThemesTab from "@/pages/Admin/tabs/ThemesTab";

export const Route = createFileRoute("/e2e/templates-gallery")({
  head: () => ({ meta: [{ title: "E2E Harness — Templates" }, { name: "robots", content: "noindex, nofollow" }] }),
  beforeLoad: () => {
    if (typeof window !== "undefined" && /phlabs\.co\.uk|prohealthpeptides/.test(window.location.host)) throw notFound();
  },
  component: () => (
    <ThemeProvider>
      <div className="min-h-screen bg-[#060f1e]"><ThemesTab /></div>
    </ThemeProvider>
  ),
});
