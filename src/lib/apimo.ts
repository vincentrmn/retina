/**
 * Client Apimo (référentiel des biens BBI), lecture seule.
 *
 * Auth basique provider:token (clé « Brouwers AI », scope properties
 * read-only). Attention : Apimo n'expose que les biens où le partenaire
 * « Brouwers AI » a été activé manuellement sur la fiche — un bien absent de
 * la synchro n'est pas forcément absent d'Apimo.
 */

export type ApimoBienLocation = {
  apimoId: number;
  adresse: string;
  loyer: number;
  charges: number;
};

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable ${name} absente côté serveur : synchronisation Apimo désactivée.`);
  return v;
}

export function hasApimoConfig(): boolean {
  return !!(process.env.APIMO_PROVIDER && process.env.APIMO_TOKEN && process.env.APIMO_AGENCY);
}

/**
 * Biens à la location (category 2, actifs) exposés par l'API Apimo.
 * Mapping : loyer = price.value (period 4 = mensuel), charges = price.fees.
 * L'adresse postale n'est pas exposée par l'API (publish_address false) : on
 * compose un libellé à partir du titre FR de l'annonce et de la ville.
 */
export async function fetchBiensLocation(): Promise<ApimoBienLocation[]> {
  const provider = env("APIMO_PROVIDER");
  const token = env("APIMO_TOKEN");
  const agency = env("APIMO_AGENCY");
  const res = await fetch(`https://api.apimo.pro/agencies/${agency}/properties`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${provider}:${token}`).toString("base64")}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API Apimo en erreur (HTTP ${res.status})`);
  const data = await res.json();
  const properties: any[] = Array.isArray(data?.properties) ? data.properties : [];

  return properties
    .filter((p) => p?.category === 2 && p?.status === 1 && Number(p?.price?.value) > 0)
    .map((p) => {
      const ville = String(p?.city?.name ?? "").trim();
      const commentFr = (p?.comments ?? []).find((c: any) => String(c?.language).startsWith("fr"));
      const titre = String(commentFr?.title ?? p?.name ?? "").trim();
      let adresse = titre || (ville ? `Location a ${ville}` : `Bien Apimo ${p.id}`);
      if (ville && !adresse.toLowerCase().includes(ville.toLowerCase())) adresse += ` (${ville})`;
      return {
        apimoId: Number(p.id),
        adresse,
        loyer: Number(p.price.value),
        charges: Number(p?.price?.fees ?? 0) || 0,
      };
    });
}
