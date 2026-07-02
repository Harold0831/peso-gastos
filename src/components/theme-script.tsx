/**
 * Aplica la clase .dark antes del primer paint para evitar flash.
 * La preferencia se guarda en localStorage bajo "peso-theme".
 */
export function ThemeScript() {
  const code = `try{if(localStorage.getItem("peso-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
