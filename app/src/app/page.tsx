import Link from "next/link";
import { TIER_DESCRIPTION, TIER_LABEL, TIER_STYLE } from "@/lib/tiers";
import type { Tier } from "@/lib/types";

// Worked example: verbatim excerpts from a real run of the flagship query
// against this app (2026-09-06, curated-index retrieval, claude-opus-5 both
// panes). Do not edit the quoted text — recapture instead.
const EXAMPLE_QUERY = "What is the history of the Ohlone people?";
const BASELINE_EXCERPT =
  "The Ohlone (also historically called the Costanoan, from the Spanish costeño, “coast dweller”) are the Indigenous peoples of the central California coast, occupying the region from roughly the San Francisco Bay Area south to Big Sur… Rather than a single unified nation, “Ohlone” describes about fifty or more distinct tribal groups speaking eight or so related languages…";
const SOURCED_EXCERPT =
  "The word “Ohlone” itself has a complicated history. According to the Association of Ramaytush Ohlone, the term came from a misspelling of “Oljon,” the name of a tribe within Ramaytush territory along the Pacific Coast… Today it is broadly accepted as an identifier for all Costanoan-speaking peoples from the San Francisco Bay Area to Big Sur, though some persons and groups, such as the Amah Mutsun and Tamien Nation, prefer not to use it [5].";
const EXAMPLE_SOURCES = [
  {
    id: 5,
    tier: 1 as Tier,
    title: "Terminology — Association of Ramaytush Ohlone",
    url: "https://www.ramaytush.org/terminology.html",
  },
  {
    id: 1,
    tier: 1 as Tier,
    title: "The Rich History of Pre-Spanish California — Muwekma Ohlone Tribe",
    url: "https://www.muwekma.org/blog/2021/august/the-rich-history-of-pre-spanish-california.html",
  },
];
const EXAMPLE_TIER_MIX =
  "Drawing on 7 Tier-1 (community-authored) sources; no Tier-4 content was used.";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-16">
      {/* Hero */}
      <section className="pt-20 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">unfold4all</h1>
        <p className="mx-auto mt-4 max-w-xl text-xl font-medium text-zinc-800 dark:text-zinc-200">
          Better context, not a better model.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          AI answers inherit the biases of their training data: institutional,
          textbook-centric voices dominate. This demo corrects that by choosing
          different context — a community&rsquo;s own account of itself — and
          shows you exactly which sources it used and why.
        </p>
        <Link
          href="/chat"
          className="mt-8 inline-block rounded-xl bg-emerald-700 px-8 py-3 font-medium text-white hover:bg-emerald-800"
        >
          Try the chat
        </Link>
      </section>

      {/* How it works */}
      <section className="border-t border-zinc-200 py-10 dark:border-zinc-800">
        <h2 className="mb-4 text-lg font-semibold">How it works</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Every source is ranked by <strong>authorship proximity</strong> — who
          is speaking, not how polished or popular the page is:
        </p>
        <div className="space-y-2">
          {([1, 2, 3, 4] as Tier[]).map((tier) => (
            <div key={tier} className="flex flex-col gap-1 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:flex-row sm:items-baseline sm:gap-3">
              <span className={`inline-block shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLE[tier]}`}>
                {TIER_LABEL[tier]}
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {TIER_DESCRIPTION[tier]}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          Retrieval is hybrid: a curated, pre-indexed corpus of community
          sources is consulted first, with tier-aware live web search filling
          gaps. And when no community-authored sources exist for a question,
          the answer <em>says so</em> — it never quietly falls back to generic
          content and calls it coverage.
        </p>
      </section>

      {/* Worked example */}
      <section className="border-t border-zinc-200 py-10 dark:border-zinc-800">
        <h2 className="mb-1 text-lg font-semibold">See the difference</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Real excerpts from this app answering: &ldquo;{EXAMPLE_QUERY}&rdquo;
        </p>
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900 md:flex-1">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Default AI (no sources)
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{BASELINE_EXCERPT}</p>
            <p className="mt-3 text-xs text-zinc-500">
              Fluent and broadly accurate — but it speaks <em>about</em> the
              Ohlone from training-data priors, with no way to check where any
              claim comes from.
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20 md:flex-1">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
              Community-sourced
            </h3>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{SOURCED_EXCERPT}</p>
            <div className="mt-3 space-y-1">
              {EXAMPLE_SOURCES.map((s) => (
                <a
                  key={s.id}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-emerald-900 underline decoration-emerald-300 underline-offset-2 dark:text-emerald-200 dark:decoration-emerald-700"
                >
                  [{s.id}] {s.title}
                </a>
              ))}
            </div>
            <p className="mt-2 border-t border-emerald-200 pt-2 text-xs text-zinc-600 dark:border-emerald-900 dark:text-zinc-400">
              {EXAMPLE_TIER_MIX}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Same model, same question. The only difference is the context it was
          given — and the sourced answer knows things the default one
          can&rsquo;t: where the name &ldquo;Ohlone&rdquo; actually came from,
          and that some communities prefer not to use it.
        </p>
      </section>

      {/* Honesty & attribution */}
      <section className="border-t border-zinc-200 py-10 dark:border-zinc-800">
        <h2 className="mb-3 text-lg font-semibold">Honesty &amp; attribution</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            This site surfaces and cites communities&rsquo; own materials; it
            does not claim to speak for any community.
          </li>
          <li>
            When community-authored sources can&rsquo;t be found, the answer
            discloses that honestly instead of faking coverage.
          </li>
          <li>
            Ingestion respects robots.txt and licenses; every source links back
            to its origin; no community content is rehosted in full.
          </li>
        </ul>
      </section>

      <footer className="border-t border-zinc-200 pt-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
        <a
          href="https://github.com/Opby/Unfold4All"
          className="underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source on GitHub
        </a>
        {" · built with the "}
        <a
          href="https://academy.claude.com/courses/ai-native-sdlc-playbook"
          className="underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          AI-native SDLC playbook
        </a>
      </footer>
    </main>
  );
}
