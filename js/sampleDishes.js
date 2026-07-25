/**
 * Fake dish data for local testing of the dish card component
 * (see js/dishCard.js and pages/dish-card-test.html).
 *
 * `image` is a real file path once photography exists (e.g.
 * "/images/shuwa.jpg"). Until then, placeholderPhoto() generates a flat
 * pastel rectangle so some cards can still show the "photo loaded" layout;
 * dishes with `image: null` exercise the soft-placeholder fallback instead.
 */
function placeholderPhoto(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const sampleDishes = [
  {
    id: 1,
    name: 'Shuwa',
    cook: 'Umm Khalid',
    price: 4.5,
    image: placeholderPhoto('#B5E4D0'),
    category: 'Mains',
    isAvailable: true,
  },
  {
    id: 2,
    name: 'Omani Halwa',
    cook: 'Bait Al Halwa',
    price: 2,
    image: placeholderPhoto('#F4DDDD'),
    category: 'Sweets',
    isAvailable: true,
  },
  {
    id: 3,
    name: 'Khubz Raqaq',
    cook: 'Umm Said',
    price: 1.2,
    image: null,
    category: 'Bread',
    isAvailable: true,
  },
  {
    id: 4,
    name: 'Mishkak',
    cook: 'Abu Yaqoub',
    price: 3.25,
    image: placeholderPhoto('#C7CBF0'),
    category: 'Grills',
    isAvailable: false,
  },
  {
    id: 5,
    name: 'Harees',
    cook: 'Umm Aflah',
    price: 2.75,
    image: null,
    category: 'Mains',
    isAvailable: true,
  },
  {
    id: 6,
    name: 'Luqaimat',
    cook: 'Umm Zainab',
    price: 1.8,
    image: placeholderPhoto('#B5E4D0'),
    category: 'Sweets',
    isAvailable: true,
  },
];
