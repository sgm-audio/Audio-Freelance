import type { Fact } from "@sgm-outreach/core";

export interface ScoreSignals {
  segmentMatch: boolean;
  shipping: boolean;
  hiring: boolean;
  teamSize?: number;
}

type FactText = Pick<Fact, "fact"> | string;

const SEGMENT_PATTERN =
  /\b(?:ios|iphone|ipad|auv3?|audio\s*unit|ai[-\s]?audio|audio\s+ai|vst3?|clap|plugin|plug-in|dsp|synth(?:esizer)?|audio\s+hardware|music\s+hardware|eurorack|pedal)\b/i;
const SHIPPING_PATTERN =
  /\b(?:shipp(?:ed|ing)|launch(?:ed|ing)?|release(?:d|s)?|published|app\s*store\s+(?:update|version)|updated?\s+(?:within|in|less than|under)\s+(?:the\s+last\s+)?(?:90|ninety)\s+days|active\s+(?:blog|repo(?:sitory)?|github)|recent\s+(?:commit|release|update)|github\s+(?:commit|release))\b/i;
const HIRING_PATTERN =
  /\b(?:hiring|we(?:'re| are)\s+hiring|job\s+opening|open\s+(?:role|position)|seeking\s+(?:a\s+)?(?:contractor|freelancer|developer|engineer)|contract\s+(?:role|work|opportunity)|freelance\s+(?:role|work|opportunity)|request\s+for\s+proposal|rfp)\b/i;

function factText(fact: FactText): string {
  return typeof fact === "string" ? fact : fact.fact;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
};

function parseTeamSize(text: string): number | undefined {
  const range = text.match(
    /\b(?:company\s+size\s*[:\-]?\s*)?(\d{1,4})\s*[-–—]\s*(\d{1,4})\s+(?:employees?|people|members?)\b/i,
  );
  if (range?.[2]) return Number(range[2]);
  const direct = text.match(
    /\b(?:team\s+(?:of|has|with)\s+(\d{1,4})|(\d{1,4})[-\s](?:person|people|employee|member|developer|engineer)s?\s+team|(\d{1,4})\s+(?:employees?|people|developers?|engineers?)|team\s+has\s+(\d{1,4})\s+(?:people|members|employees))\b/i,
  );
  const value = direct?.slice(1).find((part) => part !== undefined);
  if (value) return Number(value);
  const word = text.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)[-\s]person\s+team\b/i,
  );
  if (word?.[1]) {
    const n = WORD_NUMBERS[word[1].toLowerCase()];
    if (n !== undefined) return n;
  }
  const bounded = text.match(
    /\b(?:under|fewer than|less than)\s+(\d{1,4})\s+(?:employees?|people|members?)\b/i,
  );
  if (bounded?.[1]) return Math.max(0, Number(bounded[1]) - 1);
  return undefined;
}

/** Extract deterministic scoring signals from enrichment fact text. */
export function parseSignalsFromFacts(
  facts: readonly FactText[],
): ScoreSignals {
  const texts = facts.map(factText);
  const teamSizes = texts
    .map(parseTeamSize)
    .filter((size): size is number => size !== undefined);
  const teamSize =
    teamSizes.length > 0 ? Math.max(...teamSizes) : undefined;
  return {
    segmentMatch: texts.some((text) => SEGMENT_PATTERN.test(text)),
    shipping: texts.some((text) => SHIPPING_PATTERN.test(text)),
    hiring: texts.some((text) => HIRING_PATTERN.test(text)),
    ...(teamSize !== undefined ? { teamSize } : {}),
  };
}

export function isSegmentMatch(value: string): boolean {
  return SEGMENT_PATTERN.test(value);
}
