export type FormatRepairMode = 'text' | 'json';

export type FormatRepairResult = {
  text: string;
  validJson: boolean;
  repairs: string[];
};

function uniqueRepairs(repairs: string[]) {
  return [...new Set(repairs)];
}

function normalizeQuotes(text: string, repairs: string[]) {
  const normalized = text
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  if (normalized !== text) {
    repairs.push('normalized_quotes');
  }
  return normalized;
}

function stripSingleCodeFence(text: string, repairs: string[]) {
  const match = text.trim().match(/^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/);
  if (!match) {
    return text.trim();
  }
  repairs.push('stripped_code_fence');
  return match[1].trim();
}

function jsonCandidate(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    return { text: fenced[1].trim(), repair: 'stripped_code_fence' };
  }
  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) {
    return { text: trimmed };
  }
  const start = Math.min(...starts);
  const opener = trimmed[start];
  const closer = opener === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(closer);
  const candidateText = end > start ? trimmed.slice(start, end + 1).trim() : trimmed.slice(start).trim();
  return { text: candidateText, repair: candidateText !== trimmed ? 'extracted_json' : undefined };
}

function parseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function removeTrailingCommas(text: string, repairs: string[]) {
  const repaired = text.replace(/,\s*([}\]])/g, '$1');
  if (repaired !== text) {
    repairs.push('removed_trailing_commas');
  }
  return repaired;
}

function quoteUnquotedKeys(text: string, repairs: string[]) {
  const repaired = text.replace(/([{\s,])([A-Za-z_][A-Za-z0-9_-]*)\s*:/g, '$1"$2":');
  if (repaired !== text) {
    repairs.push('quoted_unquoted_keys');
  }
  return repaired;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(value);
}

export function repairFormattedText(input: string, mode: FormatRepairMode): FormatRepairResult {
  const repairs: string[] = [];
  const normalized = normalizeQuotes(input, repairs);
  const stripped = stripSingleCodeFence(normalized, repairs);

  if (mode !== 'json') {
    return {
      text: stripped,
      validJson: false,
      repairs: uniqueRepairs(repairs),
    };
  }

  const candidate = jsonCandidate(normalized);
  if (candidate.repair) {
    repairs.push(candidate.repair);
  }

  const attempts = [
    candidate.text,
    removeTrailingCommas(candidate.text, repairs),
    quoteUnquotedKeys(removeTrailingCommas(candidate.text, repairs), repairs),
  ];
  for (const attempt of attempts) {
    const parsed = parseJson(attempt);
    if (parsed !== undefined) {
      return {
        text: canonicalJson(parsed),
        validJson: true,
        repairs: uniqueRepairs(repairs),
      };
    }
  }

  return {
    text: attempts[attempts.length - 1],
    validJson: false,
    repairs: uniqueRepairs(repairs),
  };
}
