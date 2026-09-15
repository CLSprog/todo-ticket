// Microsoft-Anmeldung (MSAL) -- Platzhalter, analog zu auth.ts aus P03_Packliste.
//
// TODO sobald die Azure-App-Registrierung fuer P08 (privates Microsoft-Konto)
// angelegt ist: Client-ID und Tenant-ID unten eintragen, dann
// "@azure/msal-browser" installieren (npm install @azure/msal-browser)
// und die auskommentierte Umsetzung aktivieren. Bis dahin liefert
// isSignedIn() immer false und die App laeuft rein lokal (localStorage).

export const AZURE_CONFIG = {
  clientId: "5dae8075-fc79-48e8-8f9b-0c66029e146f",
  tenantId: "2a01ee8c-19d2-46c4-91e4-f6024e86a19a",
  redirectUri: "https://clsprog.github.io/todo-ticket",
  scopes: ["Files.ReadWrite", "offline_access", "User.Read"],
};

export interface AuthState {
  signedIn: boolean;
  displayName: string | null;
}

export async function isSignedIn(): Promise<boolean> {
  // TODO: echte MSAL-Session pruefen, sobald eingerichtet
  return false;
}

export async function signIn(): Promise<AuthState> {
  throw new Error(
    "Microsoft-Anmeldung ist noch nicht eingerichtet (Azure-App-Registrierung fehlt). " +
      "Die App funktioniert bis dahin lokal auf diesem Geraet."
  );
}

export async function signOut(): Promise<void> {
  // no-op, solange keine echte Session existiert
}

export async function getAccessToken(): Promise<string> {
  throw new Error("Kein aktiver Microsoft-Login.");
}
