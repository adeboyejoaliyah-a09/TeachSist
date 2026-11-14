import { createRemoteJWKSet, jwtVerify } from "jose";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppConfig } from "../config/env.js";
import { supabaseIssuer, supabaseJwksUrl } from "../config/env.js";

const subjectSchema = z.string().uuid();

export function createAuthenticate(config: AppConfig): RequestHandler {
  const jwks = createRemoteJWKSet(supabaseJwksUrl(config));
  const issuer = supabaseIssuer(config);

  return async (request, response, next) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match?.[1]) {
      response.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "A bearer token is required",
        },
      });
      return;
    }

    try {
      const { payload } = await jwtVerify(match[1], jwks, {
        issuer,
        audience: "authenticated",
      });
      const subject = subjectSchema.safeParse(payload.sub);
      if (!subject.success) {
        response.status(401).json({
          error: {
            code: "UNAUTHENTICATED",
            message: "The bearer token is invalid",
          },
        });
        return;
      }

      response.locals.teacherId = subject.data;
      next();
    } catch {
      response.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "The bearer token is invalid or expired",
        },
      });
    }
  };
}
