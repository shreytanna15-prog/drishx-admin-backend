import { THEME_STORAGE_KEY } from "../lib/theme";

/** Applies stored theme before paint; login always follows system. */
export function ThemeScript() {
  const script = `(function(){try{var r=document.documentElement;var p=location.pathname;if(p==="/login"||p.indexOf("/login/")===0){r.removeAttribute("data-theme");return;}var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k);if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);}else{r.removeAttribute("data-theme");}}catch(e){}})();`;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  );
}
