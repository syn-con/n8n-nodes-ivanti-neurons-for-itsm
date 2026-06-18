/**
 * Validates that a value is a valid Ivanti transaction GUID:
 * exactly 32 hexadecimal characters (no hyphens).
 *
 * Ivanti transaction IDs are interpolated into OData key literals, so the
 * character set MUST be restricted to prevent breaking out of the quoted
 * key and injecting arbitrary OData.
 */
export function isValidIvantiGuid(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Fa-f0-9]{32}$/.test(value);
}