// CSS artwork and placeholders only. TODO(student): manually supply approved catalog data.
export const titles = Object.freeze(Array.from({ length: 6 }, (_, index) => Object.freeze({
  id: `demo-${index + 1}`, number: String(index + 1).padStart(2, '0'),
  type: ['series', 'movies', 'documentaries'][index % 3],
  year: 'DEMO', progress: index < 3 ? [34, 62, 18][index] : 0,
  isNew: index >= 3, demo: true,
})));
