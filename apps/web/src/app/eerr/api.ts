import { notifySessionExpired } from "../session-context";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export class EerrApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function eerrApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new EerrApiError(
      "No pudimos conectarnos con el servidor. Intentá nuevamente.",
      0,
    );
  }
  if (response.status === 401) notifySessionExpired();
  const body = await response.json();
  if (!response.ok)
    throw new EerrApiError(
      response.status === 401
        ? "Tu sesión venció. Volvé al inicio para ingresar."
        : Array.isArray(body.message)
          ? body.message.join(". ")
          : (body.message ?? "No se pudo completar la operación"),
      response.status,
    );
  return body as T;
}
