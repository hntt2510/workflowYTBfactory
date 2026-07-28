const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/-]+/gi,
  /(authorization["']?\s*[:=]\s*["']?)[^"',\s]+/gi
];

export function redactSecrets(value: unknown): string {
  let text = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of secretPatterns) {
    text = text.replace(pattern, (match, prefix: string | undefined) => (prefix ? `${prefix}[REDACTED]` : "[REDACTED]"));
  }
  return text;
}

