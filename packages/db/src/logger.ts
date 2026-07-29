const redacted = "[REDACTED]";
const secretKeys = /authorization|apiKey|api_key|token|accessToken|refreshToken|cookie|set-cookie/i;

export function redactLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactLogValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        secretKeys.test(key) ? redacted : redactLogValue(item)
      ])
    );
  }
  return value;
}

export function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${redacted}`)
    .replace(/([?&](?:X-Amz-Signature|Signature|sig|token|access_token)=)[^&\s]+/gi, `$1${redacted}`)
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[^"',\s]+/gi, `$1${redacted}`);
}

export interface StructuredLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export class JsonLogger implements StructuredLogger {
  info(message: string, data: Record<string, unknown> = {}): void {
    this.write("info", message, data);
  }
  warn(message: string, data: Record<string, unknown> = {}): void {
    this.write("warn", message, data);
  }
  error(message: string, data: Record<string, unknown> = {}): void {
    this.write("error", message, data);
  }
  private write(level: string, message: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({ level, message, ...(redactLogValue(data) as Record<string, unknown>) }));
  }
}
