// Every error the API returns has the same shape: { error: { code, message } }.
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 500 | 502 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
