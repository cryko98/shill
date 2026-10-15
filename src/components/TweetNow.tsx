"use client";

import { useState } from "react";
import { TEMPLATES, fillTemplate, intentUrl } from "@/lib/templates";
import type { PublicRules } from "@/lib/config";

const LIMIT = 280;

export default function TweetNow({ rules, loggedIn }: { rules: PublicRules; loggedIn: boolean }) {
  const vars = { cashtag: rules.cashtag, ca: rules.ca, site: rules.site };
  const [picked, setPicked] = useState<string>(TEMPLATES[0].id);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");

  const template = TEMPLATES.find((x) => x.id === picked) ?? TEMPLATES[0];
  const text = custom ? draft : fillTemplate(template.text, vars).trim();

  const hasTag = new RegExp(`\\$${rules.ticker}\\b`, "i").test(text);
  // X counts URLs as 23 chars; this is an estimate for the counter only.
  const length = text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
  const over = length > LIMIT;

  function openX() {
    window.open(intentUrl(text), "_blank", "noopener,noreferrer");
  }

  return (
    <section id="tweet" className="card card-glow p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Tweet now</h2>
        <span className="mono text-xs text-dim">pick a template or write your own</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setCustom(false);
              setPicked(t.id);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              !custom && picked === t.id ? "border-acid bg-acid/15 text-acid" : "border-line text-dim hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (!custom) setDraft(text);
            setCustom(true);
          }}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            custom ? "border-acid bg-acid/15 text-acid" : "border-line text-dim hover:text-ink"
          }`}
        >
          Write my own
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setCustom(true);
          setDraft(e.target.value);
        }}
        rows={6}
        className="mono mt-4 w-full resize-y rounded-xl border border-line bg-bg p-4 text-sm leading-relaxed outline-none focus:border-acid"
        spellCheck={false}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={`mono ${over ? "text-bad" : "text-dim"}`}>
            {length}/{LIMIT}
          </span>
          <span className={hasTag ? "text-teal" : "text-warn"}>
            {hasTag ? `✓ contains ${rules.cashtag}` : `⚠ add ${rules.cashtag} or it will not count`}
          </span>
          {rules.ca ? (
            <span className={text.includes(rules.ca) ? "text-teal" : "text-dim"}>
              {text.includes(rules.ca) ? "✓ CA included" : "CA optional"}
            </span>
          ) : null}
        </div>
        <button type="button" onClick={openX} disabled={over || !text.trim()} className="btn-acid">
          <XLogo /> Post on X
        </button>
      </div>

      <p className="mt-3 text-xs text-dim">
        {loggedIn
          ? `After posting, hit "Find my new posts" below, then "Check views" on the post. Views are read straight from X.`
          : `Log in with X first so we can match the post to you and track its views.`}
      </p>
    </section>
  );
}

export function XLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
