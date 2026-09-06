import Link from "next/link";

// Placeholder — the real introductory page is Build Slice 3.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold tracking-tight">unfold4all</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Better context, not a better model: AI answers grounded in a
        community&rsquo;s own voice — with the sources, and the reasoning for
        choosing them, shown explicitly.
      </p>
      <Link
        href="/chat"
        className="rounded-xl bg-emerald-700 px-6 py-3 font-medium text-white hover:bg-emerald-800"
      >
        Try the chat
      </Link>
    </main>
  );
}
