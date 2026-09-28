/** Express isteğine eklenen alanlar. */
declare module 'express' {
  interface Request {
    /** İstek kimliği (x-request-id; RequestContextMiddleware). */
    id?: string;
  }
}

export {};
