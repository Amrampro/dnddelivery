export class AuthError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "AuthError";
    }
}
export const unauthorized = () => new AuthError(401, "UNAUTHENTICATED", "Votre session a expiré ou n’est plus valide.");
