// Local, code-native line icons. Paths are fixed application data.
const paths = {
  home: ["M3 11l9-8 9 8", "M5 10v11h14V10", "M9 21v-7h6v7"],
  film: [
    "M3 4h18v16H3z",
    "M7 4v16",
    "M17 4v16",
    "M3 9h4",
    "M3 15h4",
    "M17 9h4",
    "M17 15h4",
  ],
  series: ["M3 7h18v14H3z", "M8 3l4 4 4-4", "M9 11l6 3-6 3z"],
  sparkles: ["M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"],
  list: ["M9 6h12", "M9 12h12", "M9 18h12", "M3 6h1", "M3 12h1", "M3 18h1"],
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0", "M4 21v-2a8 8 0 0 1 16 0v2"],
  play: ["M7 4l14 8-14 8z"],
  pause: ["M8 5v14", "M16 5v14"],
  search: ["M21 21l-5-5", "M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plus: ["M12 4v16", "M4 12h16"],
  check: ["M5 12l4 4L19 6"],
  arrow: ["M4 12h16", "M14 6l6 6-6 6"],
  globe: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    "M3 12h18",
    "M12 3c5 6 5 12 0 18-5-6-5-12 0-18",
  ],
  info: ["M12 11v6", "M12 7h.01", "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  settings: ["M4 7h16", "M4 17h16", "M8 4v6", "M16 14v6"],
  monitor: ["M3 4h18v13H3z", "M8 21h8", "M12 17v4"],
  expand: ["M8 3H3v5", "M16 3h5v5", "M3 16v5h5", "M21 16v5h-5"],
  volume: ["M4 9h4l5-4v14l-5-4H4z", "M17 8c3 2 3 6 0 8"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M4 17v4h16v-4"],
};
export function icon(name, directional = false) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", `icon${directional ? " directional" : ""}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of paths[name] || paths.info) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}
