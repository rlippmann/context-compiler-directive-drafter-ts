import { CanonicalDirective } from "@rlippmann/context-compiler/grammar";

export type GrammarMetadata = {
  kind: string;
  canonical_start: string;
  operand_names: readonly string[];
};

export function canonicalStartsFromMetadata(metadata: Iterable<GrammarMetadata>): string[] {
  const starts = new Set<string>();
  for (const item of metadata) starts.add(item.canonical_start);
  return [...starts].sort((left, right) => right.length - left.length);
}

export function isIncompleteCanonicalDirective(message: string, metadata: Iterable<GrammarMetadata>): boolean {
  return [...metadata].some((item) => item.operand_names.length > 0 && message === item.canonical_start);
}

export function canonicalFormFromMetadata(item: GrammarMetadata): string {
  const operands = item.operand_names.map((name) => `<${name.replaceAll("_", " ")}>`);
  return [item.canonical_start, ...operands].join(" ");
}

export function renderCanonicalFormsFromMetadata(
  metadata: Iterable<GrammarMetadata>,
  categoryByKind: Readonly<Record<string, string>>
): string {
  const lines = ["Canonical directive forms:"];
  for (const item of metadata) {
    const form = canonicalFormFromMetadata(item);
    lines.push(`- \`${form}\` (${categoryByKind[item.kind] ?? "Policy"})`);
  }
  return lines.join("\n");
}

export function renderCanonicalCandidate(
  kind: string,
  operandValues: readonly string[],
  metadata: Iterable<GrammarMetadata>
): string {
  const item = [...metadata].find((candidate) => candidate.kind === kind);
  if (item === undefined) throw new Error(`Unknown directive kind: ${JSON.stringify(kind)}`);
  const operands = Object.fromEntries(item.operand_names.map((name, index) => [name, operandValues[index]]));
  try {
    return new CanonicalDirective(kind, operands).text;
  } catch {
    return [item.canonical_start, ...operandValues].join(" ");
  }
}
