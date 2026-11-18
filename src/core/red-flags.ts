/**
 * Common warning signs of investment fraud, as regulators describe them, for scam_red_flags. Each flag has
 * plain words, a few phrases that often show it, and the official page that explains it. Matching a pitch
 * against these is a teaching aid: it can say which warning signs appear, never that something is or isn't
 * a scam. Links checked on 18 Nov 2026.
 */

export interface RedFlag {
  id: string;
  title: string;
  why: string;
  /** Lower-case patterns that often show this sign in a message or offer. */
  patterns: readonly RegExp[];
  source: { name: string; url: string };
}

const INVESTOR_GOV = { name: "SEC Investor.gov, how to avoid fraud", url: "https://www.investor.gov/protect-your-investments/fraud/how-avoid-fraud" };
const FINRA = { name: "FINRA, avoid fraud", url: "https://www.finra.org/investors/protect-your-money/avoid-fraud" };

export const RED_FLAGS: readonly RedFlag[] = [
  {
    id: "guaranteed_returns",
    title: "Guaranteed or unusually high returns with little or no risk",
    why: "Every investment carries risk, and higher returns come with more of it. A promise of big, steady or certain returns is the most common sign of fraud.",
    patterns: [/guarantee/, /risk[- ]free/, /no risk/, /\b\d{2,3}\s?% (a|per|each|every) (day|week|month)/, /double your (money|investment)/, /can'?t lose/, /passive income/],
    source: INVESTOR_GOV,
  },
  {
    id: "pressure",
    title: "Pressure to act right away",
    why: "Fraudsters rush people so they don't stop to check. A real opportunity will still be there after you've looked into it.",
    patterns: [/act now/, /today only/, /limited (time|spots|offer)/, /before it'?s too late/, /don'?t miss/, /last chance/, /urgent/, /only \d+ (spots|places)/],
    source: INVESTOR_GOV,
  },
  {
    id: "unsolicited",
    title: "An unexpected contact, or someone met online",
    why: "Many scams start with a message out of the blue, a wrong-number text, a dating app or a group chat, then build trust before any investing comes up.",
    patterns: [/whatsapp|telegram|signal group|discord/, /wrong number/, /dating|met online|new friend/, /dm me|message me/, /investment group|trading group|vip group/],
    source: { name: "SEC Investor.gov, relationship investment scams", url: "https://www.investor.gov/protect-your-investments/fraud/types-fraud/relationship-investment-scams" },
  },
  {
    id: "unusual_payment",
    title: "Paying in crypto, gift cards or a wire to a person",
    why: "Legitimate firms take payment into accounts in the firm's own name. Requests for crypto, gift cards or a wire to an individual are hard to reverse and common in fraud.",
    patterns: [/gift card/, /wire (it|the money|transfer) to/, /send (bitcoin|btc|usdt|crypto|eth)/, /crypto atm|bitcoin atm/, /pay (in|with) (crypto|bitcoin|usdt)/, /personal account/],
    source: FINRA,
  },
  {
    id: "secrecy",
    title: "Secrecy, inside information or an exclusive club",
    why: "Being told to keep it quiet, or that you're getting special access or inside information, stops you from asking others and can itself be illegal.",
    patterns: [/keep (it|this) (quiet|secret|between us)/, /inside (info|information|tip)/, /exclusive/, /secret (strategy|system|formula)/, /insider/],
    source: INVESTOR_GOV,
  },
  {
    id: "impersonation",
    title: "Someone posing as a firm, an official or a famous person",
    why: "Scammers copy real firms' names, claim to be regulators or show fake celebrity endorsements, often made with AI. Check the contact through the firm's or regulator's own website, not the link you were sent.",
    patterns: [/endorsed by|recommended by (elon|celebrity)/, /\b(sec|finra|cftc|irs|fbi) (agent|officer|official)/, /on behalf of (the )?(government|regulator)/, /deepfake|ai trading bot/],
    source: FINRA,
  },
  {
    id: "access",
    title: "Asking for passwords, a recovery phrase or remote access",
    why: "No real firm needs your password, your wallet's recovery phrase or control of your computer. Whoever has them can take everything.",
    patterns: [/seed phrase|recovery phrase|secret phrase|private key/, /password|login details|one-time code|2fa code/, /remote access|anydesk|teamviewer|screen share/],
    source: FINRA,
  },
  {
    id: "pump",
    title: "A hot tip that's about to take off",
    why: "Talk of a little-known stock or coin that's about to soar is the setup of a pump-and-dump: promoters push the price up, cash out at the top, and leave others with the loss.",
    patterns: [/(to the moon|moonshot|100x|1000x)/, /about to (explode|skyrocket|take off)/, /next (bitcoin|big thing)/, /penny stock/, /hot (tip|stock|coin)/],
    source: { name: "SEC Investor.gov, pump-and-dump schemes", url: "https://www.investor.gov/protect-your-investments/fraud/types-fraud/pump-and-dump-schemes" },
  },
  {
    id: "withdrawal_fees",
    title: "Fees or taxes to get your own money out",
    why: "Being told to pay a fee, a tax or a 'release charge' before you can withdraw is a classic sign the account or platform is fake. Paying more rarely brings the money back.",
    patterns: [/(fee|tax|charge) (to|before you can) withdraw/, /unlock (your )?(funds|account|withdrawal)/, /release (fee|charge)/, /account (frozen|locked).{0,40}pay/],
    source: FINRA,
  },
  {
    id: "recovery",
    title: "An offer to recover money you've already lost",
    why: "People who lost money to a scam are often contacted again by 'recovery' services, lawyers or agencies asking for a fee up front. These are usually the same scammers.",
    patterns: [/recover (your )?(lost )?(funds|money|crypto)/, /fund recovery|asset recovery/, /get your money back/],
    source: FINRA,
  },
  {
    id: "unclear",
    title: "No clear way it makes money, or it pays out from new members",
    why: "If nobody can explain plainly where the returns come from, or earlier members are paid from newer members' money, it fits the pattern of a Ponzi or pyramid scheme.",
    patterns: [/refer(ral)? (bonus|reward)|recruit/, /matrix|downline|levels? of commission/, /proprietary (algorithm|system)/, /arbitrage bot/],
    source: { name: "SEC Investor.gov, Ponzi schemes", url: "https://www.investor.gov/protect-your-investments/fraud/types-fraud/ponzi-scheme" },
  },
];

/** Where to check a seller's registration, and where to report. */
export const CHECKS = [
  { name: "FINRA BrokerCheck (US brokers)", url: "https://brokercheck.finra.org/" },
  { name: "SEC Investment Adviser Public Disclosure (US advisers)", url: "https://adviserinfo.sec.gov/" },
  { name: "NFA BASIC (US futures and forex firms)", url: "https://www.nfa.futures.org/basicnet/" },
  { name: "Canadian Securities Administrators: aretheyregistered.ca (Canada)", url: "https://www.aretheyregistered.ca/" },
] as const;
export const REPORT = [
  { name: "SEC tips and complaints (US)", url: "https://www.sec.gov/tcr" },
  { name: "FTC ReportFraud (US)", url: "https://reportfraud.ftc.gov/" },
  { name: "Canadian Anti-Fraud Centre (Canada)", url: "https://antifraudcentre-centreantifraude.ca/" },
] as const;

/** The warning signs a pitch shows, in the list's order. Text only; nothing is kept. */
export function matchRedFlags(pitch: string): RedFlag[] {
  const t = pitch.toLowerCase();
  return RED_FLAGS.filter((f) => f.patterns.some((p) => p.test(t)));
}
