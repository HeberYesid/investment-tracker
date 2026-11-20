import { NextResponse } from "next/server";

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "BAD_REQUEST", message, details } },
    { status: 400 }
  );
}

export function notFound(message: string, details?: unknown) {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "NOT_FOUND", message, details } },
    { status: 404 }
  );
}

export function conflict(message: string) {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "CONFLICT", message } },
    { status: 409 },
  );
}

export function validationError(errors: unknown) {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "VALIDATION_ERROR", message: "Error de validación", details: errors } },
    { status: 422 }
  );
}

export function serverError(message: string = "Error interno del servidor") {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}

export function unauthorized(message: string = "No autenticado.") {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "UNAUTHORIZED", message } },
    { status: 401 }
  );
}

export function forbidden(message: string = "No tienes permiso para esta acción.") {
  return NextResponse.json<ErrorResponse>(
    { error: { code: "FORBIDDEN", message } },
    { status: 403 }
  );
}
