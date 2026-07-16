import { NextRequest, NextResponse } from "next/server";

/**
 * Protection de l'application par mot de passe (Basic Auth), en attendant la
 * vraie authentification Google Workspace. Nécessaire depuis que les candidats
 * reçoivent un lien sur le domaine RETINA (/c/...) : sans ça, retirer la fin
 * de l'URL donnait accès à toute la plateforme (dossiers, documents...).
 *
 * Restent PUBLICS :
 *  - /c/[id]           : le lien court de candidature (redirige vers Tally),
 *  - /api/webhooks/*   : le webhook Tally (protégé par signature HMAC),
 *  - /icon.svg         : le favicon.
 *
 * Identifiants dans les variables d'environnement RETINA_USER /
 * RETINA_PASSWORD. Si elles ne sont pas posées (dev local), pas d'auth.
 */
export function middleware(req: NextRequest) {
  const user = process.env.RETINA_USER;
  const pass = process.env.RETINA_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (u === user && rest.join(":") === pass) return NextResponse.next();
    } catch {
      /* en-tête illisible : on refuse */
    }
  }
  return new NextResponse("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RETINA", charset="UTF-8"' },
  });
}

export const config = {
  // Tout sauf les routes publiques ci-dessus et les assets Next.
  matcher: ["/((?!c/|api/webhooks/|icon.svg|_next/static|_next/image).*)"],
};
