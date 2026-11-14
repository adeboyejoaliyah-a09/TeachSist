import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./http-error.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  void next;
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    response.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues,
      },
    });
    return;
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_request_error",
      request_id: response.locals.requestId,
      method: request.method,
      error_name: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
