export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
export const unauthorized = () =>
  new AuthError(
    401,
    "UNAUTHENTICATED",
    "Votre session a expir� ou n'est plus valide.",
  );
