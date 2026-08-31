/**
 * Datos compartidos por las páginas legales. Client-safe a propósito: el
 * enlace de contacto también se muestra en el perfil.
 *
 * La fecha se escribe A MANO, no se calcula con new Date(): "última
 * actualización" debe decir cuándo cambió el TEXTO, no cuándo se abrió la
 * página. Actualízala al editar /privacy o /terms.
 */
export const LEGAL_UPDATED = "31 de agosto de 2026";

/**
 * Correo de contacto que exigen la política de privacidad y los términos.
 * Va por env var para que quien despliegue su propia instancia (el repo es
 * open source) ponga el suyo sin editar código.
 */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "tu-correo@ejemplo.com";
