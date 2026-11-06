/**
 * @fileoverview The card icon catalog, backed by Lucide, with search tags.
 *
 * Keys are the names stored in the sheet's Icon column, so existing keys must
 * never be renamed. Deep imports keep unused icons out of the bundle.
 */

import Anchor from "@lucide/svelte/icons/anchor";
import Apple from "@lucide/svelte/icons/apple";
import Award from "@lucide/svelte/icons/award";
import Baby from "@lucide/svelte/icons/baby";
import Bath from "@lucide/svelte/icons/bath";
import Bed from "@lucide/svelte/icons/bed";
import Beef from "@lucide/svelte/icons/beef";
import Beer from "@lucide/svelte/icons/beer";
import Bike from "@lucide/svelte/icons/bike";
import BookOpen from "@lucide/svelte/icons/book-open";
import Bus from "@lucide/svelte/icons/bus";
import Cake from "@lucide/svelte/icons/cake";
import Camera from "@lucide/svelte/icons/camera";
import Candy from "@lucide/svelte/icons/candy";
import Car from "@lucide/svelte/icons/car";
import Cat from "@lucide/svelte/icons/cat";
import Cherry from "@lucide/svelte/icons/cherry";
import Citrus from "@lucide/svelte/icons/citrus";
import Cloud from "@lucide/svelte/icons/cloud";
import Coffee from "@lucide/svelte/icons/coffee";
import Coins from "@lucide/svelte/icons/coins";
import Cookie from "@lucide/svelte/icons/cookie";
import Croissant from "@lucide/svelte/icons/croissant";
import Crown from "@lucide/svelte/icons/crown";
import CupSoda from "@lucide/svelte/icons/cup-soda";
import Dog from "@lucide/svelte/icons/dog";
import Donut from "@lucide/svelte/icons/donut";
import Drumstick from "@lucide/svelte/icons/drumstick";
import Dumbbell from "@lucide/svelte/icons/dumbbell";
import Egg from "@lucide/svelte/icons/egg";
import Film from "@lucide/svelte/icons/film";
import Fish from "@lucide/svelte/icons/fish";
import Flame from "@lucide/svelte/icons/flame";
import Flower from "@lucide/svelte/icons/flower-2";
import Fuel from "@lucide/svelte/icons/fuel";
import Gamepad from "@lucide/svelte/icons/gamepad-2";
import Gem from "@lucide/svelte/icons/gem";
import Gift from "@lucide/svelte/icons/gift";
import Glasses from "@lucide/svelte/icons/glasses";
import GraduationCap from "@lucide/svelte/icons/graduation-cap";
import Grape from "@lucide/svelte/icons/grape";
import Guitar from "@lucide/svelte/icons/guitar";
import Hamburger from "@lucide/svelte/icons/hamburger";
import Headphones from "@lucide/svelte/icons/headphones";
import Heart from "@lucide/svelte/icons/heart";
import House from "@lucide/svelte/icons/house";
import IceCream from "@lucide/svelte/icons/ice-cream-cone";
import Key from "@lucide/svelte/icons/key";
import Leaf from "@lucide/svelte/icons/leaf";
import Martini from "@lucide/svelte/icons/martini";
import Medal from "@lucide/svelte/icons/medal";
import Milk from "@lucide/svelte/icons/milk";
import Moon from "@lucide/svelte/icons/moon";
import Mountain from "@lucide/svelte/icons/mountain";
import Music from "@lucide/svelte/icons/music";
import Paintbrush from "@lucide/svelte/icons/paintbrush";
import Palette from "@lucide/svelte/icons/palette";
import PartyPopper from "@lucide/svelte/icons/party-popper";
import PawPrint from "@lucide/svelte/icons/paw-print";
import PiggyBank from "@lucide/svelte/icons/piggy-bank";
import Pill from "@lucide/svelte/icons/pill";
import Pizza from "@lucide/svelte/icons/pizza";
import Plane from "@lucide/svelte/icons/plane";
import Popcorn from "@lucide/svelte/icons/popcorn";
import Rocket from "@lucide/svelte/icons/rocket";
import Salad from "@lucide/svelte/icons/salad";
import Sandwich from "@lucide/svelte/icons/sandwich";
import Scissors from "@lucide/svelte/icons/scissors";
import Shirt from "@lucide/svelte/icons/shirt";
import ShoppingBag from "@lucide/svelte/icons/shopping-bag";
import ShoppingCart from "@lucide/svelte/icons/shopping-cart";
import Snowflake from "@lucide/svelte/icons/snowflake";
import Soup from "@lucide/svelte/icons/soup";
import Sparkles from "@lucide/svelte/icons/sparkles";
import Sprout from "@lucide/svelte/icons/sprout";
import Star from "@lucide/svelte/icons/star";
import Store from "@lucide/svelte/icons/store";
import Sun from "@lucide/svelte/icons/sun";
import Tag from "@lucide/svelte/icons/tag";
import Tent from "@lucide/svelte/icons/tent";
import Ticket from "@lucide/svelte/icons/ticket";
import TreePine from "@lucide/svelte/icons/tree-pine";
import Trophy from "@lucide/svelte/icons/trophy";
import Umbrella from "@lucide/svelte/icons/umbrella";
import Utensils from "@lucide/svelte/icons/utensils";
import Wallet from "@lucide/svelte/icons/wallet";
import Wine from "@lucide/svelte/icons/wine";
import Wrench from "@lucide/svelte/icons/wrench";
import Zap from "@lucide/svelte/icons/zap";

/** Lucide icons all share one component type. */
export type CardIcon = typeof Star;

/** One catalog entry: stored key, component, and search words. */
export interface IconEntry {
  key: string;
  component: CardIcon;
  /** Lowercase words matched by the picker's search. */
  tags: string;
}

function entry(key: string, component: CardIcon, tags: string): IconEntry {
  return { key, component, tags: `${key.replaceAll("-", " ")} ${tags}` };
}

/** Every icon in picker order: food and drink first, then everything else. */
export const ICON_ENTRIES: readonly IconEntry[] = [
  entry("coffee", Coffee, "cafe drink latte espresso"),
  entry("cup-soda", CupSoda, "drink boba tea juice"),
  entry("milk", Milk, "drink dairy"),
  entry("beer", Beer, "drink bar pub"),
  entry("wine", Wine, "drink bar"),
  entry("martini", Martini, "drink cocktail bar"),
  entry("croissant", Croissant, "bakery pastry food"),
  entry("cake", Cake, "bakery dessert birthday food"),
  entry("cookie", Cookie, "bakery dessert food"),
  entry("donut", Donut, "bakery dessert food"),
  entry("ice-cream", IceCream, "dessert gelato food"),
  entry("candy", Candy, "dessert sweets food"),
  entry("pizza", Pizza, "food restaurant"),
  entry("hamburger", Hamburger, "burger food restaurant"),
  entry("sandwich", Sandwich, "food deli lunch"),
  entry("salad", Salad, "food healthy lunch"),
  entry("soup", Soup, "food ramen noodles bowl"),
  entry("drumstick", Drumstick, "food chicken"),
  entry("beef", Beef, "food steak meat"),
  entry("fish", Fish, "food sushi seafood"),
  entry("egg", Egg, "food breakfast"),
  entry("popcorn", Popcorn, "food movies snack"),
  entry("apple", Apple, "fruit food"),
  entry("cherry", Cherry, "fruit food"),
  entry("grape", Grape, "fruit food"),
  entry("citrus", Citrus, "fruit lemon food"),
  entry("utensils", Utensils, "food restaurant dining"),
  entry("gift", Gift, "present reward"),
  entry("star", Star, "favorite reward"),
  entry("heart", Heart, "love favorite"),
  entry("sparkles", Sparkles, "magic special"),
  entry("party-popper", PartyPopper, "celebrate party"),
  entry("trophy", Trophy, "win reward"),
  entry("medal", Medal, "win reward"),
  entry("award", Award, "win reward"),
  entry("crown", Crown, "vip king queen"),
  entry("gem", Gem, "diamond vip jewelry"),
  entry("ticket", Ticket, "event movie show"),
  entry("tag", Tag, "sale discount price"),
  entry("coins", Coins, "money cash"),
  entry("wallet", Wallet, "money"),
  entry("piggy-bank", PiggyBank, "money savings"),
  entry("shopping-bag", ShoppingBag, "shop store retail"),
  entry("shopping-cart", ShoppingCart, "shop grocery"),
  entry("store", Store, "shop retail"),
  entry("shirt", Shirt, "clothes laundry fashion"),
  entry("scissors", Scissors, "haircut salon barber"),
  entry("paintbrush", Paintbrush, "art nails salon"),
  entry("palette", Palette, "art paint"),
  entry("glasses", Glasses, "optician reading"),
  entry("flower", Flower, "florist garden"),
  entry("sprout", Sprout, "plant garden"),
  entry("leaf", Leaf, "plant nature"),
  entry("tree-pine", TreePine, "nature outdoors"),
  entry("paw-print", PawPrint, "pet groomer vet"),
  entry("dog", Dog, "pet"),
  entry("cat", Cat, "pet"),
  entry("baby", Baby, "kids"),
  entry("dumbbell", Dumbbell, "gym fitness workout"),
  entry("bike", Bike, "cycling sport"),
  entry("car", Car, "car wash auto"),
  entry("fuel", Fuel, "gas petrol"),
  entry("bus", Bus, "transit"),
  entry("plane", Plane, "travel flight"),
  entry("anchor", Anchor, "boat sea"),
  entry("tent", Tent, "camping outdoors"),
  entry("mountain", Mountain, "hiking outdoors"),
  entry("sun", Sun, "summer weather"),
  entry("moon", Moon, "night"),
  entry("cloud", Cloud, "weather"),
  entry("snowflake", Snowflake, "winter ski"),
  entry("umbrella", Umbrella, "rain beach"),
  entry("music", Music, "song concert"),
  entry("headphones", Headphones, "music audio"),
  entry("guitar", Guitar, "music lessons"),
  entry("film", Film, "movie cinema"),
  entry("camera", Camera, "photo"),
  entry("gamepad", Gamepad, "games arcade"),
  entry("book", BookOpen, "reading library"),
  entry("graduation-cap", GraduationCap, "school class lessons"),
  entry("house", House, "home"),
  entry("bed", Bed, "hotel sleep"),
  entry("bath", Bath, "spa"),
  entry("pill", Pill, "pharmacy health"),
  entry("key", Key, "lock"),
  entry("wrench", Wrench, "repair tools"),
  entry("rocket", Rocket, "launch"),
  entry("zap", Zap, "energy fast"),
  entry("flame", Flame, "hot fire"),
];

/** Icon components keyed by stored name. */
export const CARD_ICONS: ReadonlyMap<string, CardIcon> = new Map(
  ICON_ENTRIES.map((e) => [e.key, e.component]),
);
