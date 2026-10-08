const messages = {
  es: {
    unavailable: "Este navegador no pudo abrir la ventana flotante. Puedes seguir viendo el video aquí o usar pantalla completa.",
    permission: "El navegador bloqueó la ventana flotante. Vuelve a pulsar el botón desde el reproductor.",
  },
  en: {
    unavailable: "This browser could not open the floating window. You can keep watching here or use full screen.",
    permission: "The browser blocked the floating window. Click the button again in the player.",
  },
  it: {
    unavailable: "Questo browser non è riuscito ad aprire la finestra flottante. Puoi continuare a guardare il video qui o a schermo intero.",
    permission: "Il browser ha bloccato la finestra flottante. Premi di nuovo il pulsante nel lettore.",
  },
  ar: {
    unavailable: "تعذر على هذا المتصفح فتح النافذة العائمة. يمكنك متابعة المشاهدة هنا أو استخدام وضع ملء الشاشة.",
    permission: "حظر المتصفح النافذة العائمة. اضغط على الزر مرة أخرى في المشغل.",
  },
};
export function playerWindowMessage(language, error) {
  return (messages[language] || messages.en)[error?.name === "NotAllowedError" ? "permission" : "unavailable"];
}
