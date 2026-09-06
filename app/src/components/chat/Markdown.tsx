"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders answer markdown; bare citation markers [n] become links to the
 * matching source card (specs/slice-1.md §5).
 */
export function AnswerMarkdown({
  text,
  citePrefix,
}: {
  text: string;
  citePrefix: string;
}) {
  // [3] → [[3]](#<citePrefix>-3), but leave real markdown links alone.
  const withCitations = text.replace(/\[(\d+)\](?!\()/g, "[[$1]](#$1)");

  return (
    <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert [&_p]:my-2">
      <ReactMarkdown
        components={{
          a: ({ href, children }) => {
            const cite = href?.match(/^#(\d+)$/);
            if (cite) {
              const target = `${citePrefix}-${cite[1]}`;
              return (
                <a
                  href={`#${target}`}
                  className="mx-0.5 rounded bg-zinc-100 px-1 font-mono text-xs no-underline text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  onClick={(e) => {
                    e.preventDefault();
                    flashCard(target);
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {withCitations}
      </ReactMarkdown>
    </div>
  );
}

function flashCard(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-emerald-400");
  setTimeout(() => el.classList.remove("ring-2", "ring-emerald-400"), 1600);
}
