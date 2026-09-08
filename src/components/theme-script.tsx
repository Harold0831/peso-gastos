import { THEME_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Aplica el tema ANTES del primer paint, para que la app no aparezca en
 * claro y salte a oscuro un frame después.
 *
 * Tiene que ser un <script> en línea y síncrono: cualquier cosa que corra
 * en React (efecto, estado) llega ya pintado. Por eso el layout raíz lleva
 * `suppressHydrationWarning` — este script toca <html> antes de hidratar.
 *
 * Marca `.dark` o `.light` en <html> según la preferencia guardada. La
 * clase `.light` no es redundante: es lo que permite forzar el tema claro
 * cuando el SISTEMA está en oscuro (globals.css la usa para desactivar la
 * media query). Sin preferencia guardada no marca nada y manda el sistema.
 */
export function ThemeScript() {
  const code = `(function(){try{
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
if(p!=="light"&&p!=="dark")p="system";
var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);
var e=document.documentElement;
e.classList.toggle("dark",p==="dark");
e.classList.toggle("light",p==="light");
var m=document.querySelector('meta[name="theme-color"]:not([media])');
if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m);}
m.content=d?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)};
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
