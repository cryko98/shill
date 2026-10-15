/**
 * Tweet templates. Placeholders: {CASHTAG} {CA} {SITE}.
 * Client-safe: no secrets, no server imports.
 */
export type Template = { id: string; label: string; text: string };

export const TEMPLATES: Template[] = [
  {
    id: "paid-per-view",
    label: "Paid per view",
    text: "{CASHTAG} pays you SOL for every view your post gets. Tweet it, get paid.\n\nCA: {CA}\n{SITE}",
  },
  {
    id: "shill-to-earn",
    label: "Shill to earn",
    text: "First coin that pays you to shill it. 100 views = 0.1 SOL, and it goes up from there. {CASHTAG}\n\n{CA}",
  },
  {
    id: "no-games",
    label: "No games",
    text: "No casino, no tiers, no 'rewards later'. You post {CASHTAG}, your views turn into SOL. That's the whole coin.\n\nCA: {CA}",
  },
  {
    id: "infofi",
    label: "InfoFi for degens",
    text: "Yap-to-earn but for a memecoin. {CASHTAG} tracks your post reach and pays SOL to your wallet.\n\n{SITE}\nCA: {CA}",
  },
  {
    id: "short",
    label: "Short and loud",
    text: "{CASHTAG}. Post it. Get paid. {CA}",
  },
];

export function fillTemplate(text: string, vars: { cashtag: string; ca: string; site: string }): string {
  return text
    .replace(/\{CASHTAG\}/g, vars.cashtag)
    .replace(/\{CA\}/g, vars.ca || "(CA coming soon)")
    .replace(/\{SITE\}/g, vars.site);
}

export function intentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
