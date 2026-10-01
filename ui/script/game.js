// Pure game state - no rendering in here.
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const expandCards = (deck) =>
  deck.cards.flatMap((card) => Array.from({ length: card.qty }, () => ({
    cardId: card.cardId,
    image: card.image,
    name: card.name,
    pitch: card.pitch,
    color: card.color,
  })));

export function newPlayer(deck, equipment) {
  return { deck, hero: deck.hero, equipment, life: deck.hero.life, library: shuffle(expandCards(deck)), hand: [] };
}

// Draw up to n cards (a hero's intellect) from the library into the hand.
export function draw(player, n = player.hero.intellect) {
  const drawn = player.library.splice(0, n);
  player.hand.push(...drawn);
  return drawn;
}

// Equipment slots where you can only wear one piece; weapons and "other" can take several.
export const SINGLE_SLOTS = ['head', 'chest', 'arms', 'legs'];
export const SLOT_ORDER = [...SINGLE_SLOTS, 'weapon', 'other'];

export function groupBySlot(equipment) {
  const groups = {};
  for (const e of equipment) (groups[e.slot] ||= []).push(e);
  return SLOT_ORDER.filter((s) => groups[s]).map((slot) => ({ slot, items: groups[slot] }));
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function npcPickWeapons(weapons) {
  const oneHanded = weapons.filter((weapon) => weapon.grip === '1H');
  const twoHanded = weapons.filter((weapon) => weapon.grip !== '1H');

  if (oneHanded.length >= 2 && twoHanded.length && Math.random() < 0.5) {
    return [pickRandom(twoHanded)];
  }
  if (oneHanded.length >= 2) {
    const available = [...oneHanded];
    const picked = [];
    while (picked.length < 2) picked.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
    return picked;
  }
  return twoHanded.length ? [pickRandom(twoHanded)] : [];
}

// NPC: one random piece per armour slot, a legal weapon loadout, and other pieces on a coin flip.
export function npcPickEquipment(equipment) {
  const picked = [];
  for (const { slot, items } of groupBySlot(equipment)) {
    if (SINGLE_SLOTS.includes(slot)) picked.push(items[Math.floor(Math.random() * items.length)]);
    else if (slot === 'weapon') picked.push(...npcPickWeapons(items));
    else picked.push(...items.filter(() => Math.random() < 0.5));
  }
  return picked;
}
