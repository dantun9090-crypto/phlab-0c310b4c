import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("checkout") }],
  }),
  component: CheckoutMount,
});

function CheckoutMount() {
  const { pathname } = useLocation();
  if (pathname.replace(/\/+$/, "") !== "/checkout") return <Outlet />;
  return <LegacyApp initialPath="/checkout" />;
}