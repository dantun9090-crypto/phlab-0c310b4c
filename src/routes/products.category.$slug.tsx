import { createFileRoute } from "@tanstack/react-router";
import { LegacyMount, legacyHead } from "@/lib/legacy-mount";

export const Route = createFileRoute("/products/category/$slug")({
  head: ({ params }) => legacyHead(`/products/category/${params.slug}`),
  component: CategoryRoute,
});

function CategoryRoute() {
  const { slug } = Route.useParams();
  return <LegacyMount path={`/products/category/${slug}`} />;
}
