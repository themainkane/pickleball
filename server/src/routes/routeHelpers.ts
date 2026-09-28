export function isDuplicateKey(err: unknown) {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
