import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import LegacyApp from "@/legacy/LegacyApp";
import { canonicalUrl } from "@/lib/seo-meta";

export const Route = createFileRoute("/payment")({
  head: () => ({
    meta: [
      { title: "Payment · PH Labs" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("payment") }],
  }),
  component: PaymentMount,
});

function PaymentMount() {
  const { pathname } = useLocation();
  if (pathname.replace(/\/+$/, "") !== "/payment") return <Outlet />;
  return <LegacyApp initialPath="/payment" />;
}