// SAMPLE DATA fixtures. Realistic, Qloo-shaped, but NOT real Qloo output and NOT real venues.
// Used only when QLOO_API_KEY is missing (clearly labelled in the UI/CLI/MCP) or as a flagged fallback.
// Venue names are fictional; neighborhoods are real. Tags mimic Qloo genre/keyword tags.

import type { QlooEntity, QlooTag } from '../types.js';

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export const mediaTag = (name: string): QlooTag => ({ id: `urn:tag:genre:media:${slug(name)}`, name, type: 'urn:tag:genre:media' });
export const placeTag = (name: string): QlooTag => ({ id: `urn:tag:genre:place:${slug(name)}`, name, type: 'urn:tag:genre:place' });
export const keywordTag = (name: string): QlooTag => ({ id: `urn:tag:keyword:qloo:${slug(name)}`, name, type: 'urn:tag:keyword:qloo' });

const TYPE: Record<string, string> = {
  artist: 'urn:entity:artist',
  movie: 'urn:entity:movie',
  tv: 'urn:entity:tv_show',
  book: 'urn:entity:book',
  game: 'urn:entity:videogame',
  brand: 'urn:entity:brand',
};

type Row = [name: string, type: keyof typeof TYPE, tags: string, popularity: number, aliases?: string];

const ROWS: Row[] = [
  // artists
  ['Metallica', 'artist', 'Heavy Metal, Thrash Metal, Hard Rock, Loud, Arena Rock', 0.96, 'metalica'],
  ['Run the Jewels', 'artist', 'Hip Hop, Rap, Alternative Hip Hop, Loud, Political', 0.8, 'rtj'],
  ['Bon Iver', 'artist', 'Indie Folk, Folk, Acoustic, Singer-Songwriter, Quiet', 0.85],
  ['Nick Drake', 'artist', 'Folk, Acoustic, Singer-Songwriter, Quiet, Cozy', 0.6],
  ['Taylor Swift', 'artist', 'Pop, Mainstream, Singer-Songwriter, Chart-topping', 0.99],
  ['Radiohead', 'artist', 'Alternative Rock, Art Rock, Experimental, Electronic, Indie', 0.93],
  ['Beyoncé', 'artist', 'Pop, R&B, Dance, Mainstream, Nightlife', 0.98, 'beyonce'],
  ['Daft Punk', 'artist', 'Electronic, House Music, Dance, Nightlife, Rave', 0.92],
  ['Miles Davis', 'artist', 'Jazz, Cool Jazz, Lounge, Mellow', 0.82],
  ['Mitski', 'artist', 'Indie Rock, Singer-Songwriter, Alternative, Indie', 0.78],
  ['Fleetwood Mac', 'artist', 'Classic Rock, Soft Rock, Mainstream, Classic', 0.9],
  ['Brian Eno', 'artist', 'Ambient, Experimental, Electronic, Quiet', 0.7],
  ['Kendrick Lamar', 'artist', 'Hip Hop, Rap, Conscious Hip Hop, Mainstream', 0.95],
  ['Billie Eilish', 'artist', 'Pop, Alternative Pop, Mainstream, Chart-topping', 0.94],
  ['Arcade Fire', 'artist', 'Indie Rock, Alternative, Indie', 0.8],
  ['black midi', 'artist', 'Experimental, Avant-garde, Math Rock, Noise, Loud', 0.45, 'blackmidi'],
  ['Dua Lipa', 'artist', 'Pop, Dance Pop, Nightlife, Mainstream, Dance', 0.95],
  ['Yo-Yo Ma', 'artist', 'Classical, Cello, Quiet, Chamber Music', 0.7],
  ['Disclosure', 'artist', 'House Music, Electronic, Dance, Nightlife', 0.8],
  ['Bad Bunny', 'artist', 'Reggaeton, Latin, Dance, Party, Mainstream', 0.97],
  ['Wiggles', 'artist', "Kids Music, Family, Children, Mainstream", 0.6, 'the wiggles'],
  // movies
  ['Parasite', 'movie', 'Thriller, Dark Comedy, Korean Cinema, Social Satire, Critically Acclaimed', 0.9],
  ['Spirited Away', 'movie', 'Animation, Fantasy, Family, Studio Ghibli, Anime', 0.88],
  ['Mad Max: Fury Road', 'movie', 'Action, Post-Apocalyptic, Blockbuster, High-energy, Loud', 0.9, 'mad max'],
  ['The Grand Budapest Hotel', 'movie', 'Comedy, Quirky, Wes Anderson, Indie, Art Direction', 0.85],
  ['Lost in Translation', 'movie', 'Drama, Contemplative, Quiet, Indie, Romance', 0.78],
  ['Dune', 'movie', 'Science Fiction, Epic, Blockbuster, Mainstream', 0.92],
  ['Barbie', 'movie', 'Comedy, Fantasy, Blockbuster, Mainstream, Family', 0.93],
  ['Everything Everywhere All at Once', 'movie', 'Science Fiction, Experimental, Absurdist, A24, Indie', 0.85, 'eeaao'],
  ['Pulp Fiction', 'movie', 'Crime, Cult, Dark Comedy, Nonlinear', 0.9],
  ['Amélie', 'movie', 'Romance, Quirky, French Cinema, Indie, Cozy', 0.78, 'amelie'],
  ['Inception', 'movie', 'Science Fiction, Thriller, Blockbuster, Mainstream', 0.93],
  ['Toy Story', 'movie', 'Animation, Family, Kids, Pixar, Mainstream', 0.95],
  ['John Wick', 'movie', 'Action, Blockbuster, Violent, High-energy, Mainstream', 0.88],
  ['Paddington 2', 'movie', 'Family, Comedy, Cozy, Kids', 0.75],
  // tv
  ['Succession', 'tv', 'Drama, Dark Comedy, Luxury, Wealth, Prestige TV', 0.9],
  ['Bluey', 'tv', 'Kids, Family, Animation, Children, Wholesome', 0.85],
  ['The Bear', 'tv', 'Drama, Restaurant, Food, High-energy, Intense', 0.88],
  ['Stranger Things', 'tv', 'Science Fiction, Horror, Nostalgia, Mainstream', 0.96],
  ['The Great British Bake Off', 'tv', 'Reality, Baking, Cozy, Wholesome, Family', 0.8, 'bake off'],
  ['Breaking Bad', 'tv', 'Crime, Drama, Cult, Prestige TV', 0.95],
  ['Fleabag', 'tv', 'Dark Comedy, Indie, Comedy', 0.78],
  ['Severance', 'tv', 'Science Fiction, Surreal, Experimental, Thriller', 0.82],
  ['The Office', 'tv', 'Sitcom, Comedy, Mainstream, Family', 0.93],
  // books
  ['Dune (novel)', 'book', 'Science Fiction, Epic, Classic', 0.85, 'dune book'],
  ['Pride and Prejudice', 'book', 'Classic, Romance, Cozy, Literary', 0.85],
  ['Project Hail Mary', 'book', 'Science Fiction, Mainstream, Page-turner', 0.8],
  ['Normal People', 'book', 'Contemporary, Literary, Romance, Quiet', 0.7],
  ['Harry Potter', 'book', 'Fantasy, Family, Mainstream, Kids', 0.97, 'harry potter and the philosophers stone'],
  ['Kafka on the Shore', 'book', 'Surreal, Experimental, Literary, Magical Realism', 0.6],
  ['The Very Hungry Caterpillar', 'book', 'Picture Book, Kids, Children, Family', 0.7],
  // games
  ['Stardew Valley', 'game', 'Farming Sim, Cozy, Indie, Relaxing, Quiet', 0.85],
  ['Elden Ring', 'game', 'Action RPG, Dark Fantasy, Intense, Loud', 0.9],
  ['Mario Kart', 'game', 'Racing, Family, Party, Nintendo, Mainstream', 0.95, 'mario kart 8'],
  ['Animal Crossing', 'game', 'Cozy, Family, Nintendo, Relaxing', 0.9, 'animal crossing new horizons'],
  ['Hades', 'game', 'Roguelike, Indie, Action', 0.8],
  ['Call of Duty', 'game', 'Shooter, Loud, Mainstream, Competitive', 0.95],
  ['Minecraft', 'game', 'Sandbox, Family, Mainstream, Kids', 0.97],
  ['Disco Elysium', 'game', 'RPG, Experimental, Indie, Literary', 0.65],
  // brands
  ['Patagonia', 'brand', 'Outdoor, Sustainable, Outdoors', 0.8],
  ['Supreme', 'brand', 'Streetwear, Skate, Nightlife, Hype', 0.8],
  ['Aesop', 'brand', 'Luxury, Skincare, Minimalist, Upscale', 0.6],
  ['Nike', 'brand', 'Sportswear, Mainstream, Active', 0.99],
  ['LEGO', 'brand', 'Toys, Family, Kids, Mainstream', 0.95, 'lego'],
  ['Gucci', 'brand', 'Luxury, Fashion, Designer, High-end', 0.9],
  ['Goodwill', 'brand', 'Thrift, Budget, Secondhand, Vintage', 0.7, 'thrift store'],
  ['IKEA', 'brand', 'Budget, Mainstream, Home Furnishing, Family', 0.95],
  ['Comme des Garçons', 'brand', 'Avant-garde, Fashion, Designer, Experimental', 0.4, 'comme des garcons'],
  ['Muji', 'brand', 'Minimalist, Quiet, Home, Mainstream', 0.7],
];

export const SAMPLE_ENTITIES: QlooEntity[] = ROWS.map(([name, type, tags, pop, aliases]) => ({
  id: `SAMPLE-${slug(name).toUpperCase()}`,
  name,
  type: TYPE[type],
  tags: tags.split(',').map((t) => mediaTag(t.trim())),
  popularity: pop,
  description: aliases ? `aliases: ${aliases}` : undefined,
  source: 'sample' as const,
}));

export const SAMPLE_ALIASES: Record<string, string[]> = Object.fromEntries(
  ROWS.map(([name, , , , aliases]) => [`SAMPLE-${slug(name).toUpperCase()}`, aliases ? aliases.split(',').map((a) => a.trim()) : []]),
);

// ---------------------------------------------------------------- tags dictionary (cuisines, vibes, venue types)

const TAG_ROWS: [string, 'place' | 'keyword'][] = [
  ['Korean BBQ', 'place'], ['Hot Pot', 'place'], ['Szechuan', 'place'], ['Ramen', 'place'], ['Sushi', 'place'],
  ['Tacos', 'place'], ['Pizza', 'place'], ['Thai', 'place'], ['Indian', 'place'], ['Vegan', 'place'],
  ['Vegetarian', 'place'], ['Dim Sum', 'place'], ['Italian', 'place'], ['French', 'place'], ['Japanese', 'place'],
  ['Mexican', 'place'], ['Korean', 'place'], ['American', 'place'], ['Diner', 'place'], ['Burger', 'place'],
  ['Mediterranean', 'place'], ['Ethiopian', 'place'], ['BBQ', 'place'], ['Seafood', 'place'], ['Restaurant', 'place'],
  ['Dessert', 'place'], ['Ice Cream', 'place'], ['Tea House', 'place'], ['Coffee', 'place'], ['Cocktail Bar', 'place'],
  ['Craft Beer', 'place'], ['Wine Bar', 'place'], ['Speakeasy', 'place'], ['Dive Bar', 'place'], ['Live Music', 'place'],
  ['Museum', 'place'], ['Art Gallery', 'place'], ['Arcade', 'place'], ['Park', 'place'], ['Bowling', 'place'],
  ['Comedy Club', 'place'], ['Karaoke', 'place'], ['Cinema', 'place'], ['Rooftop', 'place'], ['Jazz', 'place'],
  ['Bookstore', 'place'], ['Bar', 'place'], ['Escape Room', 'place'], ['Climbing', 'place'], ['Brunch', 'place'],
  ['Bakery', 'place'], ['Street Food', 'place'], ['Food Truck', 'place'], ['Lounge', 'place'], ['Garden', 'place'],
  ['Waterfront', 'place'], ['Fine Dining', 'place'], ['Nightlife', 'keyword'], ['Family Friendly', 'keyword'],
  ['Quiet', 'keyword'], ['Cozy', 'keyword'], ['Spicy', 'keyword'], ['Mild', 'keyword'], ['Budget', 'keyword'],
  ['Late Night', 'keyword'], ['Outdoors', 'keyword'], ['Experimental', 'keyword'], ['Mainstream', 'keyword'],
  ['Vegan Options', 'keyword'], ['Wheelchair Accessible', 'keyword'], ['Halal', 'keyword'], ['Gluten-Free Options', 'keyword'],
];

export const SAMPLE_TAGS: QlooTag[] = TAG_ROWS.map(([n, k]) => (k === 'place' ? placeTag(n) : keywordTag(n)));

// ---------------------------------------------------------------- venues (FICTIONAL)

export interface SamplePlaceRow {
  city: string;
  name: string;
  hood: string;
  price: number;
  rating: number;
  tags: string;
  desc: string;
}

const P = (city: string, name: string, hood: string, price: number, rating: number, tags: string, desc: string): SamplePlaceRow => ({
  city, name, hood, price, rating, tags, desc,
});

const NYC = 'New York';
const ATX = 'Austin';
const LDN = 'London';

export const PLACE_ROWS: SamplePlaceRow[] = [
  // ---------------- New York
  P(NYC, 'Basement Static', 'Lower East Side', 1, 4.4, 'Live Music, Music Venue, Punk, Heavy Metal, Nightlife, Dive Bar, Loud', 'Sweaty basement club with local metal, punk and noise bills.'),
  P(NYC, 'The Quiet Room Gallery', 'Chelsea', 1, 4.6, 'Art Gallery, Museum, Contemporary Art, Quiet, Experimental, Wheelchair Accessible', 'Hushed contemporary-art gallery with rotating experimental installations.'),
  P(NYC, 'Pixel Pier Arcade', 'Williamsburg', 2, 4.5, 'Arcade, Retro Games, Bar, Craft Beer, Video Games, Party', 'Barcade with 80 cabinets, pinball and a rotating craft-beer list.'),
  P(NYC, 'Little Explorers Science Hall', 'Park Slope', 2, 4.7, 'Science Museum, Museum, Family Friendly, Kids, Daytime, Wheelchair Accessible', 'Hands-on science museum built for families and curious adults.'),
  P(NYC, 'Riverside Meadow Park', 'Harlem', 1, 4.8, 'Park, Garden, Outdoors, Quiet, Free, Waterfront, Wheelchair Accessible', 'Long riverside park with gardens, lawns and sunset benches.'),
  P(NYC, 'Cinema Obscura', 'East Village', 2, 4.6, 'Cinema, Art House Cinema, Independent Film, Experimental, Cult', 'Repertory cinema screening cult, foreign and avant-garde films.'),
  P(NYC, 'The Late Show Cellar', 'Greenwich Village', 2, 4.3, 'Comedy Club, Nightlife, Stand-up, Late Night, Bar', 'Intimate stand-up cellar with two-drink minimum sets.'),
  P(NYC, 'Skyline Climbing Co.', 'Long Island City', 2, 4.5, 'Climbing, Active, Family Friendly, Daytime, Wheelchair Accessible', 'Bouldering gym with beginner walls and a kids zone.'),
  P(NYC, 'Hanbit Grill', 'Koreatown', 2, 4.5, 'Restaurant, Korean BBQ, Korean, Spicy, Lively, Loud, Group Dining', 'Tabletop Korean BBQ with banchan, spicy stews and a roaring crowd.'),
  P(NYC, 'Sunday Table Bistro', 'West Village', 3, 4.4, 'Restaurant, American, Comfort Food, Brunch, Quiet, Mild, Vegan Options', 'Calm neighborhood bistro known for comfort classics.'),
  P(NYC, "Mama Rosa's Pizzeria", 'Park Slope', 2, 4.5, 'Restaurant, Pizza, Italian, Family Friendly, Kids, Casual, Mainstream, Vegetarian, Wheelchair Accessible', 'Family-run pizza place with big booths and a kids menu.'),
  P(NYC, 'Sichuan Fire Pot', 'Flushing', 2, 4.6, 'Restaurant, Hot Pot, Szechuan, Spicy, Lively, Group Dining, Halal', 'Numbing-spicy hot pot with split broths for mild eaters.'),
  P(NYC, 'Maison Étoile', 'SoHo', 4, 4.8, 'Restaurant, Fine Dining, French, Tasting Menu, Upscale, Quiet, Luxury', 'Tasting-menu French dining room with white tablecloths.'),
  P(NYC, 'Taco Truck No. 7', 'Sunset Park', 1, 4.5, 'Restaurant, Food Truck, Tacos, Mexican, Street Food, Budget, Spicy, Late Night', 'Legendary taco truck with a salsa bar from mild to ouch.'),
  P(NYC, 'Green Fork Kitchen', 'East Village', 2, 4.4, 'Restaurant, Vegan, Vegetarian, Healthy, Cafe, Mild, Vegan Options, Gluten-Free Options, Wheelchair Accessible', 'Plant-based kitchen with easy-going portions and big salads.'),
  P(NYC, 'Omakase Nine', 'Midtown', 4, 4.7, 'Restaurant, Japanese, Sushi, Omakase, Upscale, Quiet, Luxury', 'Nine-seat omakase counter, reservations months out.'),
  P(NYC, 'Ramen Dojo Midnight', 'East Village', 1, 4.5, 'Restaurant, Ramen, Japanese, Late Night, Casual, Budget, Noodle', 'Cheap, rich bowls until 2am with a punk-rock soundtrack.'),
  P(NYC, 'Velvet Cipher', 'Lower East Side', 3, 4.6, 'Cocktail Bar, Speakeasy, Nightlife, Experimental, Bar, Lounge', 'Hidden speakeasy with an experimental, ever-changing cocktail menu.'),
  P(NYC, 'Scoop Dreams Creamery', 'Greenpoint', 1, 4.7, 'Ice Cream, Dessert, Family Friendly, Daytime, Mild, Kids, Wheelchair Accessible', 'Small-batch ice cream with classic and kid-friendly flavors.'),
  P(NYC, 'Brewlab Taproom', 'Bushwick', 2, 4.4, 'Craft Beer, Taproom, Brewery, Bar, Casual, Lively', 'Warehouse taproom pouring twenty rotating craft beers.'),
  P(NYC, 'Oolong & Ink Tea House', 'Chinatown', 2, 4.6, 'Tea House, Quiet, Cozy, Dessert, Bookstore, Calm', 'Candlelit tea house with books, dumplings and silence.'),
  P(NYC, 'Midnight Dive', 'East Village', 1, 4.1, 'Dive Bar, Bar, Nightlife, Budget, Loud, Karaoke', 'Beloved dive bar with cheap pints and karaoke after 10.'),
  P(NYC, 'Café Lumen', 'Brooklyn Heights', 2, 4.5, 'Cafe, Coffee, Bakery, Dessert, Quiet, Cozy, Mild, Wheelchair Accessible', 'Sunlit cafe with a pastry case and a serene vibe.'),
  P(NYC, 'Hudson Terrace Rooftop Lounge', 'Chelsea', 3, 4.5, 'Rooftop, Lounge, Cocktail Bar, Skyline Views, Upscale, Chill, Bar', 'Rooftop lounge with skyline views and a relaxed pace.'),
  P(NYC, 'Blue Door Jazz Cellar', 'Greenwich Village', 3, 4.7, 'Jazz, Live Music, Lounge, Intimate, Mellow, Bar', 'Low-lit jazz cellar with late sets.'),
  P(NYC, 'Stargazer Pier', 'Brooklyn Heights', 1, 4.8, 'Waterfront, Park, Quiet, Free, Skyline Views, Outdoors, Wheelchair Accessible', 'Quiet pier for evening skyline views and a stroll.'),
  P(NYC, 'Pages & Pour', 'West Village', 2, 4.6, 'Bookstore, Wine Bar, Quiet, Cozy, Bar, Wheelchair Accessible', 'Bookstore with a tiny wine bar in the back.'),
  // ---------------- Austin
  P(ATX, 'Armadillo Static', 'Rainey Street', 1, 4.3, 'Live Music, Music Venue, Punk, Rock, Nightlife, Dive Bar, Loud', 'Garage-rock and metal venue with a backyard stage.'),
  P(ATX, 'Zilker Meadow Walk', 'Zilker', 1, 4.8, 'Park, Garden, Outdoors, Quiet, Free, Waterfront, Wheelchair Accessible', 'Wide lakeside trails and picnic lawns.'),
  P(ATX, 'Lone Star Pinball Parlor', 'South Congress', 2, 4.5, 'Arcade, Retro Games, Bar, Craft Beer, Video Games', 'Pinball hall with local beers and a patio.'),
  P(ATX, 'Hill Country Children’s Museum', 'Hyde Park', 2, 4.6, 'Museum, Family Friendly, Kids, Daytime, Wheelchair Accessible', 'Interactive museum for kids and their grown-ups.'),
  P(ATX, 'Blanton Quiet Gallery', 'Hyde Park', 1, 4.6, 'Art Gallery, Museum, Contemporary Art, Quiet, Experimental', 'Calm gallery of contemporary Texan art.'),
  P(ATX, 'Smokehouse 512', 'East Austin', 2, 4.7, 'Restaurant, BBQ, American, Casual, Lively, Mainstream, Wheelchair Accessible', 'Brisket-and-ribs smokehouse with picnic tables.'),
  P(ATX, 'Fuego Taqueria', 'East Austin', 1, 4.6, 'Restaurant, Tacos, Mexican, Spicy, Street Food, Budget, Late Night', 'Late-night tacos with fiery salsas.'),
  P(ATX, 'Spice Route Indian Kitchen', 'North Loop', 2, 4.5, 'Restaurant, Indian, Spicy, Vegetarian, Halal, Vegan Options, Lively', 'Vindaloo to korma, every heat level honored.'),
  P(ATX, 'Garden Plate Vegan', 'Zilker', 2, 4.4, 'Restaurant, Vegan, Vegetarian, Mild, Healthy, Cafe, Vegan Options, Gluten-Free Options, Wheelchair Accessible', 'Plant-based comfort food on a leafy patio.'),
  P(ATX, 'Congress Tasting Room', 'South Congress', 4, 4.8, 'Restaurant, Fine Dining, Tasting Menu, Upscale, Quiet, Luxury', 'Chef’s-counter tasting menu, quiet and elegant.'),
  P(ATX, 'Honky Tonk Rooftop', 'Rainey Street', 2, 4.3, 'Bar, Rooftop, Live Music, Nightlife, Lively, Party', 'Rooftop honky-tonk with live country sets.'),
  P(ATX, 'Cold Cream Parlour', 'South Congress', 1, 4.7, 'Ice Cream, Dessert, Family Friendly, Daytime, Mild, Kids', 'Retro ice-cream parlour with a long line and a longer menu.'),
  P(ATX, 'Quiet Leaf Tea Room', 'Hyde Park', 2, 4.5, 'Tea House, Quiet, Cozy, Dessert, Calm, Wheelchair Accessible', 'Peaceful tea room with scones and a no-phones rule.'),
  P(ATX, 'Third Coast Taproom', 'East Austin', 2, 4.4, 'Craft Beer, Taproom, Brewery, Bar, Casual, Lively', 'Craft brewery taproom with dog-friendly patio.'),
  P(ATX, 'Night Owl Speakeasy', 'Rainey Street', 3, 4.5, 'Cocktail Bar, Speakeasy, Nightlife, Experimental, Bar', 'Hidden cocktail den behind a laundromat façade.'),
  P(ATX, 'Lakeside Stargaze Dock', 'Zilker', 1, 4.8, 'Waterfront, Park, Quiet, Free, Outdoors, Stargazing', 'Quiet lakeside dock for stargazing.'),
  P(ATX, 'Velvet Note Jazz Lounge', 'North Loop', 3, 4.6, 'Jazz, Live Music, Lounge, Intimate, Mellow, Bar', 'Low-lit jazz lounge with Tuesday jam sessions.'),
  // ---------------- London
  P(LDN, 'The Pit Shoreditch', 'Shoreditch', 1, 4.4, 'Live Music, Music Venue, Punk, Heavy Metal, Nightlife, Loud, Dive Bar', 'Sticky-floor venue for metal, punk and noise.'),
  P(LDN, 'Hush Gallery', 'Soho', 2, 4.6, 'Art Gallery, Contemporary Art, Quiet, Experimental, Wheelchair Accessible', 'Small, silent gallery for experimental sound and sculpture.'),
  P(LDN, 'Camden Arcade Club', 'Camden', 2, 4.4, 'Arcade, Retro Games, Bar, Craft Beer, Video Games', 'Retro arcade bar with cheap tokens and craft ales.'),
  P(LDN, 'Little Ones Discovery Museum', 'Borough', 2, 4.7, 'Museum, Family Friendly, Kids, Daytime, Wheelchair Accessible', 'Hands-on family museum near the market.'),
  P(LDN, 'Hackney Marshes Walk', 'Hackney', 1, 4.7, 'Park, Outdoors, Quiet, Free, Waterfront', 'Canal-side walk across the marshes.'),
  P(LDN, 'Brick Lane Biryani House', 'Shoreditch', 1, 4.6, 'Restaurant, Indian, Spicy, Budget, Halal, Lively, Street Food', 'Fiery biryanis and curries on a budget.'),
  P(LDN, 'Soho Sunday Roast', 'Soho', 3, 4.4, 'Restaurant, American, Comfort Food, Quiet, Mild, Brunch, Vegan Options', 'Calm roast-dinner pub-restaurant.'),
  P(LDN, 'Pizza Famiglia', 'Notting Hill', 2, 4.5, 'Restaurant, Pizza, Italian, Family Friendly, Kids, Mainstream, Vegetarian, Wheelchair Accessible', 'Family pizzeria with a kids menu.'),
  P(LDN, 'Peckham Hot Pot Co.', 'Peckham', 2, 4.5, 'Restaurant, Hot Pot, Szechuan, Spicy, Lively, Group Dining', 'Szechuan hot pot with split pots for mild eaters.'),
  P(LDN, 'Mayfair Tasting Salon', 'Mayfair', 4, 4.8, 'Restaurant, Fine Dining, French, Tasting Menu, Upscale, Quiet, Luxury', 'Hushed Michelin-style tasting salon.'),
  P(LDN, 'Brixton Green Kitchen', 'Brixton', 2, 4.4, 'Restaurant, Vegan, Vegetarian, Mild, Healthy, Vegan Options, Gluten-Free Options, Wheelchair Accessible', 'Plant-based kitchen with Caribbean notes.'),
  P(LDN, 'Dalston Cocktail Lab', 'Hackney', 3, 4.6, 'Cocktail Bar, Speakeasy, Nightlife, Experimental, Bar, Lounge', 'Experimental cocktail laboratory behind an unmarked door.'),
  P(LDN, 'Gelato Gioia', 'Soho', 1, 4.7, 'Ice Cream, Dessert, Family Friendly, Daytime, Mild, Kids', 'Beloved gelateria with family-size sundaes.'),
  P(LDN, 'Quiet Leaf Tea Room London', 'Notting Hill', 2, 4.6, 'Tea House, Quiet, Cozy, Dessert, Calm, Wheelchair Accessible', 'Candlelit tea room, books and silence.'),
  P(LDN, 'Thames Rooftop Lounge', 'Borough', 3, 4.5, 'Rooftop, Lounge, Cocktail Bar, Skyline Views, Upscale, Chill, Bar', 'Rooftop lounge looking over the river.'),
  P(LDN, 'Candlelight Jazz Room', 'Soho', 3, 4.7, 'Jazz, Live Music, Lounge, Intimate, Mellow, Bar', 'Intimate jazz room, late sets.'),
  P(LDN, 'Southbank Evening Walk', 'Borough', 1, 4.8, 'Waterfront, Park, Quiet, Free, Skyline Views, Outdoors, Wheelchair Accessible', 'Riverside evening promenade.'),
];

export const SAMPLE_CITIES = [NYC, ATX, LDN];

export const SAMPLE_PLACES: (QlooEntity & { city: string })[] = PLACE_ROWS.map((r) => ({
  id: `SAMPLE-PLACE-${slug(r.city)}-${slug(r.name).toUpperCase()}`,
  name: r.name,
  type: 'urn:entity:place',
  city: r.city,
  tags: r.tags.split(',').map((t) => t.trim()).map((t) => (/^(Nightlife|Family Friendly|Quiet|Cozy|Spicy|Mild|Budget|Late Night|Outdoors|Experimental|Mainstream|Vegan Options|Wheelchair Accessible|Halal|Gluten-Free Options)$/.test(t) ? keywordTag(t) : placeTag(t))),
  popularity: Math.round((0.4 + (r.rating - 4) * 0.5) * 100) / 100,
  description: r.desc,
  priceLevel: r.price,
  rating: r.rating,
  neighborhood: r.hood,
  address: `${r.hood}, ${r.city}`,
  source: 'sample' as const,
}));
