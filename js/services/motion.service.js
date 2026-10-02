let activeTransition;
export function motionReduced() {
  return (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("reduce-motion")
  );
}
export function changeView(update, { cinematic = false } = {}) {
  activeTransition?.skipTransition();
  if (
    !cinematic ||
    window.innerWidth > 1920 ||
    document.getElementById("app").offsetHeight > 1500 ||
    !document.startViewTransition ||
    motionReduced() ||
    document.querySelector(".cinema-intro") ||
    document.hidden
  ) {
    update();
    return;
  }
  document.documentElement.classList.add("route-transition");
  const transition = document.startViewTransition(update);
  activeTransition = transition;
  transition.finished
    .catch(() => {})
    .finally(() => {
      if (activeTransition === transition) {
        activeTransition = null;
        document.documentElement.classList.remove("route-transition");
      }
    });
}
export function revealContent(root) {
  if (motionReduced() || !("IntersectionObserver" in window)) return () => {};
  const nodes = [
    ...root.querySelectorAll(".catalog-section, .ops-panel, .download-card"),
  ];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
    },
    { rootMargin: "0px 0px 40px 0px", threshold: 0.03 },
  );
  for (const node of nodes) {
    node.classList.add("reveal-content");
    observer.observe(node);
  }
  return () => {
    observer.disconnect();
    for (const node of nodes) node.classList.remove("reveal-content");
  };
}
