// Qloo tag IDs for our venue vocabulary, resolved against the live /v2/tags endpoint on 2026-10-27 with the same
// picker the agent uses (core/slots.ts → pickPlaceTag). Tag IDs are global constants, so shipping them saves ~19
// lookups (several seconds) on every cold live run. Unknown terms still fall back to a live /v2/tags lookup, and the
// sample provider never uses these (its fixtures have their own tag vocabulary).

export const KNOWN_PLACE_TAGS: Record<string, string> = {
  'live music': 'urn:tag:category:place:live_music_venue',
  museum: 'urn:tag:genre:place:museum',
  'art gallery': 'urn:tag:genre:place:art_gallery',
  arcade: 'urn:tag:amenity:qloo:arcade',
  park: 'urn:tag:genre:place:park',
  cinema: 'urn:tag:keyword:qloo:cinema',
  'movie theater': 'urn:tag:category:place:movie_theater',
  'comedy club': 'urn:tag:genre:place:comedy_club',
  restaurant: 'urn:tag:genre:place:restaurant',
  'cocktail bar': 'urn:tag:category:place:cocktail_bar',
  'craft beer': 'urn:tag:offerings:place:craft_beer',
  // Qloo's own "dessert" category tag is spelled "desert"; the restaurant sub-genre is unambiguous.
  dessert: 'urn:tag:genre:place:restaurant:dessert',
  'tea house': 'urn:tag:category:place:tea_house',
  coffee: 'urn:tag:category:place:coffee',
  rooftop: 'urn:tag:setting:qloo:rooftop',
  jazz: 'urn:tag:ambience:qloo:jazzy',
  waterfront: 'urn:tag:setting:qloo:waterfront',
  garden: 'urn:tag:genre:place:garden',
  bookstore: 'urn:tag:genre:place:book_store',
};
