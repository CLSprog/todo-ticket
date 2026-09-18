// Microsoft-Anmeldung (MSAL).
//
// Baustein-Uebernahme aus P03 Packliste (src/auth.ts, Stand 2026-09-04) -
// dort produktiv im Einsatz, hier nur mit der eigenen Azure-Registrierung
// fuer P08 und ohne weitere inhaltliche Aenderung.
//
// Die Redirect-URI ergibt sich aus import.meta.env.BASE_URL, also aus
// "base" in vite.config.ts. Wird der Repo-Name geaendert, muss die neue
// URI zusaetzlich in der Azure-App-Registrierung hinterlegt werden, sonst
// scheitert der Login mit AADSTS50011.

import { PublicClientApplication, type AccountInfo, InteractionRequiredAuthError } from "@azure/msal-browser";

// Azure-App-Registrierung "P08 ToDo-Liste_Ticket" (eigene App, nicht die von P03).
const CLIENT_ID = "5dae8075-fc79-48e8-8f9b-0c66029e146f";
// "common" erlaubt private Microsoft-Konten und Organisationskonten. Der
// Datenbestand liegt bewusst im privaten Konto, nicht im Bauwert-Konto.
const TENANT_AUTHORITY = "https://login.microsoftonline.com/common";

const REDIRECT_URI = `${window.location.origin}${import.meta.env.BASE_URL}`;

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: TENANT_AUTHORITY,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: REDIRECT_URI,
  },
  cache: {
    cacheLocation: "localStorage", // uebersteht Browser-Neustarts; nur das Token, keine Ticketdaten
    storeAuthStateInCookie: false,
  },
});

let initialized = false;

export async function initMsal(): Promise<void> {
  if (initialized) return;
  await msalInstance.initialize();
  const response = await msalInstance.handleRedirectPromise();
  if (response?.account) {
    msalInstance.setActiveAccount(response.account);
  } else {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) msalInstance.setActiveAccount(accounts[0]);
  }
  initialized = true;
}

export function getAccount(): AccountInfo | null {
  return msalInstance.getActiveAccount();
}

const SCOPES = ["Files.ReadWrite", "User.Read"];

export async function login(): Promise<AccountInfo> {
  const result = await msalInstance.loginPopup({ scopes: SCOPES });
  msalInstance.setActiveAccount(result.account);
  return result.account;
}

export async function logout(): Promise<void> {
  const account = getAccount();
  await msalInstance.logoutPopup({ account: account ?? undefined });
}

export async function getAccessToken(): Promise<string> {
  const account = getAccount();
  if (!account) throw new Error("Nicht angemeldet.");
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: SCOPES, account });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await msalInstance.acquireTokenPopup({ scopes: SCOPES, account });
      return result.accessToken;
    }
    throw error;
  }
}
