import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by authenticate() from a verified token, never from the body. */
    userId?: string;
  }
}
