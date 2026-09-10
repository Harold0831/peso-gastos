/**
 * Los dibujos de los íconos de categoría. Las claves y su resolución viven en
 * `lib/category-icons.ts` (ver ahí el porqué de la separación).
 *
 * `categories.icon` guarda una CLAVE (`"cart"`), no un emoji ni markup. Tres
 * razones: en la base no debe vivir markup; el trazo se repinta con
 * `currentColor`, así que se adapta al tema oscuro en vez de quedar como una
 * calcomanía brillante sobre fondo negro; y el mismo símbolo se ve igual en
 * iPhone, Android y escritorio — un emoji lo dibuja CADA sistema a su manera.
 */

import { categoryIconKey, type CategoryIconKey } from "@/lib/category-icons";

interface IconProps {
  className?: string;
  size?: number;
}

/** Mismo viewBox y trazo que `icons.tsx`, para que un ícono de categoría no se
 *  vea más gordo ni más fino que los del nav. */
function Glyph({ className, size = 20, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

const GLYPHS: Record<CategoryIconKey, React.ReactNode> = {
  cart: (
    <>
      <path d="M3 4h2.2l2.3 10.4a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 7H6" />
      <circle cx="9.5" cy="19.3" r="1.2" />
      <circle cx="16.5" cy="19.3" r="1.2" />
    </>
  ),
  food: (
    <>
      <path d="M6 3.5v7a2 2 0 0 0 4 0v-7M8 10.5v10" />
      <path d="M17.5 3.5c-1.7 1-2.5 2.7-2.5 5s.8 3.5 2.5 3.5V3.5zM17.5 12v8.5" />
    </>
  ),
  car: (
    <>
      <path d="M3.5 16.5v-4l2-5a1.5 1.5 0 0 1 1.4-1h10.2a1.5 1.5 0 0 1 1.4 1l2 5v4a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
      <path d="M4 12.5h16M6.5 17.5v1.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1.5M20 17.5V19a1 1 0 0 1-1 1h-.5a1 1 0 0 1-1-1v-1.5" />
    </>
  ),
  health: <path d="M3 12.5h4l2-4.5 3 9 2.2-4.5H21" />,
  // Triángulo en círculo y no "pantalla con play dentro": a 16px, que es como
  // se ve en la lista de presupuestos, el rectángulo exterior y el triángulo
  // se tocan y el conjunto se lee como una mancha.
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.2 8.6l5.4 3.4-5.4 3.4V8.6z" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17.2l-3-1.7-3 1.7-3-1.7-3 1.7V3.5z" />
      <path d="M9.5 8.5h5M9.5 12.5h5" />
    </>
  ),
  bag: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  transfer: <path d="M4 8.5h13l-3.2-3.2M20 15.5H7l3.2 3.2" />,
  book: (
    <>
      <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7a2.5 2.5 0 0 1 2.5-2.5H20v13h-5.5A2.5 2.5 0 0 0 12 20a2.5 2.5 0 0 0-2.5-2.5H4v-13z" />
      <path d="M12 7v13" />
    </>
  ),
  home: <path d="M3.5 11L12 4l8.5 7v8.2a1 1 0 0 1-1 1h-4.7v-5.5H9.2v5.5H4.5a1 1 0 0 1-1-1V11z" />,
  coffee: (
    <>
      <path d="M4.5 8h12v5.5a4.5 4.5 0 0 1-9 0V8" />
      <path d="M16.5 9.5h1.8a2.3 2.3 0 0 1 0 4.6h-1.8" />
      <path d="M4.5 20h12" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8.8" width="17" height="4" rx="1" />
      <path d="M5 12.8v6.4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.4M12 8.8v11.4" />
      <path d="M12 8.8S10.6 4.5 8.6 4.5a2.2 2.2 0 0 0 0 4.3H12zM12 8.8s1.4-4.3 3.4-4.3a2.2 2.2 0 0 1 0 4.3H12z" />
    </>
  ),
  flight: (
    <path d="M10.5 3.4a1.5 1.5 0 0 1 3 0V9l7 4v2.1l-7-2v3.5l2.2 1.7v1.6L12 19.2l-3.7.7v-1.6l2.2-1.7v-3.5l-7 2V13l7-4V3.4z" />
  ),
  fitness: <path d="M3 9.5v5M6.2 7v10M17.8 7v10M21 9.5v5M6.2 12h11.6" />,
  game: (
    <>
      <rect x="2.5" y="7.5" width="19" height="10" rx="4" />
      <path d="M7 11v3M5.5 12.5h3M15.6 11.6h.01M18 13.4h.01" />
    </>
  ),
  pet: (
    <>
      <ellipse cx="12" cy="16.8" rx="3.8" ry="3.2" />
      <ellipse cx="5.9" cy="11" rx="1.7" ry="2.2" />
      <ellipse cx="18.1" cy="11" rx="1.7" ry="2.2" />
      <ellipse cx="9.8" cy="6.6" rx="1.7" ry="2.2" />
      <ellipse cx="14.2" cy="6.6" rx="1.7" ry="2.2" />
    </>
  ),
  money: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.7" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  tag: (
    <>
      <path d="M3 12.5V4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 .7.3l7.5 7.5a1 1 0 0 1 0 1.4l-8.5 8.5a1 1 0 0 1-1.4 0L3.3 13.2a1 1 0 0 1-.3-.7z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
};

export function CategoryIcon({
  icon,
  className,
  size = 20,
}: IconProps & { icon: string | null | undefined }) {
  return (
    <Glyph className={className} size={size}>
      {GLYPHS[categoryIconKey(icon)]}
    </Glyph>
  );
}
