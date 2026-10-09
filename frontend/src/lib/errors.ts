/** The message of whatever was thrown (an Error, a Supabase error object, or a string), or `fallback` if there isn't one. */
export function messageOf(e: unknown, fallback: string): string {
    if (typeof e === 'string' && e) return e;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string' && (e as { message: string }).message) {
        return (e as { message: string }).message;
    }
    return fallback;
}

/** A Supabase auth error's machine-readable code, if it has one. */
export function codeOf(e: unknown): string | undefined {
    return e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : undefined;
}
