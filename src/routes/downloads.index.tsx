import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/downloads/")({
  head: () => ({
    meta: [
      { title: "Downloads — PH Labs Research Resources" },
      {
        name: "description",
        content:
          "Download PH Labs research resources: the peptide research catalogue and the protocol library reference PDF.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Downloads — PH Labs Research Resources" },
      {
        property: "og:description",
        content:
          "Download PH Labs research resources: the peptide research catalogue and the protocol library reference PDF.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://phlabs.co.uk/downloads" }],
  }),
  component: DownloadsIndex,
});

const FILES = [
  {
    href: "/downloads/PH-Labs-Research-Catalogue.pdf",
    title: "PH Labs Research Catalogue",
    desc: "Full product catalogue with COAs and technical specifications (PDF).",
  },
  {
    href: "/downloads/protocol-library.pdf",
    title: "Protocol Library",
    desc: "Laboratory reference document — for research use only.",
  },
];

function DownloadsIndex() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold mb-2">Downloads</h1>
        <p className="text-slate-300 mb-8">
          Reference PDFs for PH Labs researchers. For Research Use Only. Not for Human Consumption.
        </p>
        <ul className="space-y-4">
          {FILES.map((f) => (
            <li
              key={f.href}
              className="rounded-lg border border-slate-800 bg-slate-900 p-5"
            >
              <a
                href={f.href}
                className="text-emerald-400 hover:text-emerald-300 text-lg font-medium"
                download
              >
                {f.title}
              </a>
              <p className="text-slate-400 mt-1 text-sm">{f.desc}</p>
            </li>
          ))}
        </ul>
        <p className="text-slate-500 text-sm mt-10">
          Looking for more?{" "}
          <Link to="/resources" className="text-emerald-400 hover:text-emerald-300">
            Browse the resources hub
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
