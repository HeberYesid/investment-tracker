import { NextResponse } from "next/server";

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function validationError(errors: unknown) {
  return NextResponse.json({ error: "Error de validación", details: errors }, { status: 422 });
}

export function serverError(message: string = "Error interno del servidor") {
  return NextResponse.json({ error: message }, { status: 500 });
}
