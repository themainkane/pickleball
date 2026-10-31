/** A non-2xx response. `details` carries the server's per-field validation messages. */
export class ApiError extends Error {
    constructor(
        public status: number,
        public message: string,
        public details?: Record<string, string[]>,
    ) {
        super(message);
    }
}
