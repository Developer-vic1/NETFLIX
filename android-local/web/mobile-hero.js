import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
export function mobileHero(root, title, navigate) {
  if (!title) {
    root.append(el("section", {class:"container page"}, [
      el("h1", {class:"page-title",text:"Tu biblioteca, contigo"}),
      el("p", {class:"muted",text:"Pulsa Carpeta y selecciona Netflix-Biblioteca para abrir tus películas y capítulos guardados en este teléfono."}),
    ]));
    return;
  }
  root.append(el("section", {class:"hero", "aria-label":title.name}, [
    el("img", {class:"hero-image",src:title.poster,alt:"",width:1280,height:720,fetchpriority:"high"}),
    el("div", {class:"hero-shade","aria-hidden":"true"}),
    el("div", {class:"container"}, [el("div", {class:"hero-content"}, [
      el("span", {class:"eyebrow",text:t("library.offline")}),
      el("h1", {class:"page-title",text:title.name}),
      el("p", {class:"hero-description",text:title.description}),
      el("div", {class:"hero-actions"}, [
        button([icon("play"),t("title.play")],()=>navigate(`player?title=${title.episodes?.[0]?.id || title.id}`),"button button-light"),
        button([icon("info"),t("common.details")],()=>navigate(`title?title=${title.id}`),"button button-ghost"),
      ]),
    ])]),
  ]));
}
