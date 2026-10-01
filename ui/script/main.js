import { createStage } from './scene.js';
import { newPlayer, draw, groupBySlot, npcPickEquipment, SINGLE_SLOTS } from './game.js';

const $ = (s) => document.querySelector(s);
const state = {
  products: [], deckCache: new Map(), you: null, npc: null, stage: null,
  pickerIndex: { you: 0, npc: 0 }, pickerRender: { you: 0, npc: 0 }, pickerDirection: { you: '', npc: '' },
};
const APP_ROOT = new URL('../', import.meta.url);
const PRODUCT_GROUPS_URL = 'https://api.cardvault.fabtcg.com/carddb/api/v1/product-groups-products/?page_size=150';
const PRODUCT_CARDS_URL = 'https://api.cardvault.fabtcg.com/carddb/api/v1/product-cards/';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchProductGroups() {
  const groups = [];
  let next = PRODUCT_GROUPS_URL;
  while (next) {
    const page = await fetchJson(next);
    groups.push(...page.results);
    next = page.next;
  }
  return groups;
}

function productsFromGroups(groups) {
  return groups.flatMap((group) => {
    const chapter = group.group_name?.match(/^Silver Age Chapter ([1-3]) - /);
    const product = group.products?.find((entry) => entry.printed_language === 'en');
    if (!chapter || !product) return [];
    const chapterNumber = Number(chapter[1]);
    return [{
      chapter: chapterNumber,
      name: group.group_name,
      slug: product.slug,
      filename: product.slug.replace(/^silver-age-chapter-[1-3]-/, '') + '.json',
    }];
  }).sort((a, b) => a.chapter - b.chapter || a.name.localeCompare(b.name));
}

async function fetchProducts() {
  try {
    const products = productsFromGroups(await fetchProductGroups());
    if (!products.length) throw new Error('No Silver Age products were found in the catalog.');
    return products;
  } catch (error) {
    console.warn('Card Vault catalog unavailable; using saved catalog:', error);
    const backup = await fetchJson(new URL('data/decks/catalog.json', APP_ROOT));
    return backup.products;
  }
}

function toDeck(product, details) {
  const cards = details.cards || [];
  const imageUrl = (card) => card.print_id
    ? new URL(`assets/cards/${encodeURIComponent(card.print_id)}.webp`, APP_ROOT).href
    : undefined;
  const heroCard = cards.find((card) => /\bHero\b/i.test(card.printed_typebox || ''));
  if (!heroCard) throw new Error(`No hero card in ${product.slug}`);

  const typebox = (card) => card.printed_typebox || '';
  const equipmentCards = cards.filter((card) => /\b(Equipment|Weapon)\b/i.test(typebox(card)));
  const equipment = equipmentCards.map((card) => {
    const slot = typebox(card).match(/-\s*(Head|Chest|Arms|Legs)\s*$/i)?.[1]?.toLowerCase();
    return {
      name: card.printed_name,
      image: imageUrl(card),
      grip: typebox(card).match(/\b(1H|2H)\b/i)?.[1].toUpperCase() || null,
      slot: /\bWeapon\b/i.test(typebox(card)) ? 'weapon' : (slot || 'other'),
    };
  });
  const allCards = cards.map((card) => ({
    cardId: card.card_id,
    printId: card.print_id,
    name: card.printed_name,
    type: typebox(card),
    image: imageUrl(card),
    pitch: Number(card.printed_pitch) || 0,
  }));

  const playableCards = cards
    .filter((card) => card !== heroCard && !equipmentCards.includes(card) && !/\bToken\b/i.test(typebox(card)))
    .map((card) => {
      const pitch = Number(card.printed_pitch) || 0;
      return {
        cardId: card.card_id,
        name: card.printed_name,
        image: imageUrl(card),
        qty: 1,
        pitch,
        color: ({ 1: 'red', 2: 'yellow', 3: 'blue' })[pitch] || null,
      };
    });

  const stat = (value, fallback) => Number.parseInt(value, 10) || fallback;
  return {
    id: product.slug,
    name: product.name,
    chapter: product.chapter,
    source: `${PRODUCT_CARDS_URL}${product.slug}/`,
    hero: {
      name: heroCard.printed_name,
      image: imageUrl(heroCard),
      intellect: stat(heroCard.printed_intellect, 4),
      life: stat(heroCard.printed_life, 20),
    },
    equipment,
    cards: playableCards,
    allCards,
    images: Object.fromEntries(cards.map((card) => [card.card_id, imageUrl(card)]).filter(([, image]) => image)),
  };
}

function fetchProductDetails(product) {
  if (!state.deckCache.has(product.slug)) {
    const request = (async () => {
      try {
        const details = await fetchJson(`${PRODUCT_CARDS_URL}${encodeURIComponent(product.slug)}/`);
        return toDeck(product, details);
      } catch (error) {
        console.warn(`Card Vault details unavailable for ${product.name}; using saved deck:`, error);
        const backupUrl = new URL(`data/decks/chapter-${product.chapter}/${product.filename}`, APP_ROOT);
        return toDeck(product, await fetchJson(backupUrl));
      }
    })();
    state.deckCache.set(product.slug, request);
  }
  return state.deckCache.get(product.slug);
}

function setMenuLocked(locked) {
  $('#menu').inert = locked;
  document.body.classList.toggle('modal-open', locked);
}

async function loadDecks() {
  const status = $('#status');
  status.textContent = 'Loading Silver Age products...';
  try {
    state.products = await fetchProducts();
    status.textContent = `${state.products.length} Silver Age decks available. Choose both heroes.`;
  } catch (e) {
    status.textContent = `${e.message} Check the browser console.`;
    status.classList.add('err');
  }
  renderList('you');
}

function movePicker(who, index, direction) {
  const previous = state.pickerIndex[who];
  const next = (index + state.products.length) % state.products.length;
  if (next === previous) return;
  state.pickerIndex[who] = next;
  state.pickerDirection[who] = direction || (next === (previous + 1) % state.products.length ? 'next' : 'previous');
  $('#start').disabled = true;
  $('#status').textContent = `Loading ${state.products[next].name}...`;
  renderList(who);
}

function renderDeckPreview(who, deck, product) {
  const preview = $(`#preview-${who}`);
  preview.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = 'Deck preview';
  const cards = document.createElement('ul');
  cards.className = 'deck-preview-cards';
  for (const card of deck.cards.slice(0, 8)) {
    const item = document.createElement('li');
    item.textContent = card.name;
    cards.append(item);
  }
  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'deck-view';
  view.textContent = 'View full deck';
  view.onclick = () => openDeckList(product);
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.className = 'choose-hero';
  choose.textContent = `Choose ${who === 'you' ? 'your' : 'opponent'} hero`;
  choose.onclick = () => confirmHero(who, product);
  preview.append(heading, cards, choose, view);
}

function renderList(who) {
  if (!state.products.length) return;
  const index = state.pickerIndex[who];
  const token = ++state.pickerRender[who];
  const track = $(`#list-${who}`);
  const direction = state.pickerDirection[who];
  track.classList.remove('moving-next', 'moving-previous');
  if (direction) track.classList.add(`moving-${direction}`);
  state.pickerDirection[who] = '';
  track.onanimationend = (event) => {
    if (event.target.classList.contains('active')) track.classList.remove('moving-next', 'moving-previous');
  };
  const products = [-1, 0, 1].map((offset) => ({
    product: state.products[(index + offset + state.products.length) % state.products.length],
    offset,
  }));
  track.replaceChildren();

  for (const { product, offset } of products) {
    const slide = document.createElement('button');
    slide.type = 'button';
    slide.className = `hero-slide${offset === 0 ? ' active' : ''}`;
    slide.dataset.index = String(state.products.indexOf(product));
    slide.setAttribute('aria-label', `${product.name.replace(/^Silver Age Chapter [1-3] - /, '')}, Chapter ${product.chapter}`);
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    const placeholder = document.createElement('span');
    placeholder.className = 'hero-card-placeholder';
    placeholder.textContent = product.name.replace(/^Silver Age Chapter [1-3] - /, '');
    slide.append(image, placeholder);
    slide.onclick = () => {
      if (offset !== 0) {
        movePicker(who, Number(slide.dataset.index), offset < 0 ? 'previous' : 'next');
        return;
      }
      fetchProductDetails(product).then((deck) => {
        const heroCard = deck.allCards.find((card) => /\bHero\b/i.test(card.type)) || {
          name: deck.hero.name, type: 'Hero', image: deck.hero.image,
        };
        showCardPreview(heroCard);
      }).catch((error) => {
        console.error(`Could not preview ${product.name}:`, error);
        $('#status').textContent = `Could not preview ${product.name}.`;
      });
    };
    track.append(slide);

    fetchProductDetails(product).then((deck) => {
      if (token !== state.pickerRender[who]) return;
      image.src = deck.hero.image || '';
      image.alt = deck.hero.name;
      placeholder.hidden = true;
      if (offset === 0) {
        $(`#name-${who}`).textContent = deck.hero.name;
        $(`#chapter-${who}`).textContent = `Chapter ${product.chapter}`;
        renderDeckPreview(who, deck, product);
        $('#status').textContent = `${deck.hero.name} is ready to choose.`;
      }
    }).catch((error) => {
      if (token !== state.pickerRender[who]) return;
      console.error(`Could not load ${product.name}:`, error);
      if (offset === 0) {
        $(`#name-${who}`).textContent = product.name.replace(/^Silver Age Chapter [1-3] - /, '');
        $(`#chapter-${who}`).textContent = `Chapter ${product.chapter}`;
        $('#status').textContent = `Could not load ${product.name} from Card Vault or the saved backup.`;
      }
    });
  }

  const preloadIndex = (index + (direction === 'previous' ? -2 : 2) + state.products.length) % state.products.length;
  const preloadProduct = state.products[preloadIndex];
  fetchProductDetails(preloadProduct).then((deck) => {
    if (!deck.hero.image) return;
    const preload = new Image();
    preload.src = deck.hero.image;
  }).catch(() => {});
}

async function confirmHero(who, product) {
  try {
    const deck = await fetchProductDetails(product);
    state[who] = deck;
    if (who === 'you') {
      $('#picker-you').hidden = true;
      $('#picker-npc').hidden = false;
      renderList('npc');
      $('#status').textContent = 'Your hero is set. Choose the opponent hero.';
      return;
    }
    $('#picker-npc').hidden = true;
    $('#selection-summary').hidden = false;
    $('#selected-you').textContent = state.you.hero.name;
    $('#selected-npc').textContent = deck.hero.name;
    $('#start').disabled = false;
    $('#status').textContent = 'Both heroes are ready.';
  } catch (error) {
    console.error(`Could not select ${product.name}:`, error);
    $('#status').textContent = `Could not load ${product.name} from Card Vault or the saved backup.`;
  }
}

for (const who of ['you', 'npc']) {
  $(`#previous-${who}`).onclick = () => movePicker(who, state.pickerIndex[who] - 1, 'previous');
  $(`#next-${who}`).onclick = () => movePicker(who, state.pickerIndex[who] + 1, 'next');

  const viewport = $(`#viewport-${who}`);
  let dragStartX = null;
  let suppressClick = false;
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragStartX = event.clientX;
  });
  viewport.addEventListener('pointerup', (event) => {
    if (dragStartX === null) return;
    const distance = event.clientX - dragStartX;
    dragStartX = null;
    if (Math.abs(distance) < 42) return;
    suppressClick = true;
    movePicker(who, state.pickerIndex[who] + (distance < 0 ? 1 : -1));
    setTimeout(() => { suppressClick = false; }, 0);
  });
  viewport.addEventListener('pointercancel', () => { dragStartX = null; });
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }, true);
}

async function openDeckList(product) {
  try {
    const deck = await fetchProductDetails(product);
    const dialog = $('#deck-list');
    const grid = $('#deck-list-cards');
    $('#deck-list-title').textContent = deck.name;
    grid.replaceChildren();

    for (const card of deck.allCards) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'deck-card';
      const image = document.createElement('img');
      image.src = card.image;
      image.alt = card.name;
      image.loading = 'lazy';
      const caption = document.createElement('span');
      caption.textContent = card.name;
      button.append(image, caption);
      button.onclick = () => showCardPreview(card);
      grid.append(button);
    }

    dialog.addEventListener('close', () => setMenuLocked(false), { once: true });
    setMenuLocked(true);
    dialog.showModal();
  } catch (error) {
    console.error(`Could not open ${product.name}:`, error);
    $('#status').textContent = `Could not load ${product.name} from Card Vault or the saved backup.`;
  }
}

function showCardPreview(card) {
  const preview = $('#card-preview');
  const image = $('#card-preview-image');
  image.src = card.image;
  image.alt = card.name;
  $('#card-preview-name').textContent = card.name;
  $('#card-preview-type').textContent = card.type;
  if (!preview.open) {
    if (!$('#deck-list').open) setMenuLocked(true);
    preview.showModal();
  }
}

function closeCardPreview() {
  const preview = $('#card-preview');
  if (preview.open) preview.close();
  $('#card-preview-image').style.transform = '';
}

// Ask the player which equipment to bring. One piece per armour slot; weapons/other can be multiple.
function chooseEquipment(deck) {
  const dialog = $('#equip');
  const box = $('#equip-groups');
  box.innerHTML = '';
  for (const { slot, items } of groupBySlot(deck.equipment)) {
    const single = SINGLE_SLOTS.includes(slot);
    const oneHanded = items.map((item, index) => item.grip === '1H' ? index : -1).filter((index) => index >= 0);
    const twoHanded = items.map((item, index) => item.grip !== '1H' ? index : -1).filter((index) => index >= 0);
    const defaults = slot !== 'weapon'
      ? []
      : oneHanded.length >= 2
        ? oneHanded.slice(0, 2)
        : twoHanded.slice(0, 1);
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h3>${slot}</h3>`;
    items.forEach((item, i) => {
      const id = `eq-${slot}-${i}`;
      g.insertAdjacentHTML('beforeend',
        `<label for="${id}"><input id="${id}" name="${slot}" type="${single ? 'radio' : 'checkbox'}" value="${i}" ${slot === 'weapon' ? `data-grip="${item.grip === '1H' ? '1H' : '2H'}"` : ''} ${single && i === 0 ? 'checked' : ''} ${defaults.includes(i) ? 'checked' : ''}>${item.name}</label>`);
    });
    if (slot === 'weapon') {
      const inputs = [...g.querySelectorAll('input[name="weapon"]')];
      const updateWeaponOptions = () => {
        const selected = inputs.filter((input) => input.checked);
        const hasTwoHanded = selected.some((input) => input.dataset.grip === '2H');
        const selectedOneHanded = selected.filter((input) => input.dataset.grip === '1H').length;
        for (const input of inputs) {
          if (input.checked) {
            input.disabled = false;
          } else if (input.dataset.grip === '1H') {
            input.disabled = oneHanded.length < 2 || hasTwoHanded || selectedOneHanded >= 2;
          } else {
            input.disabled = hasTwoHanded || selectedOneHanded > 0;
          }
        }
      };
      inputs.forEach((input) => input.addEventListener('change', () => {
        if (input.checked && input.dataset.grip === '2H') {
          inputs.filter((other) => other !== input).forEach((other) => { other.checked = false; });
        } else if (input.checked) {
          inputs.filter((other) => other.dataset.grip === '2H').forEach((other) => { other.checked = false; });
          const selectedOneHanded = inputs.filter((other) => other.checked && other.dataset.grip === '1H');
          if (selectedOneHanded.length > 2) input.checked = false;
        }
        updateWeaponOptions();
      }));
      updateWeaponOptions();
    }
    g.dataset.slot = slot;
    box.append(g);
  }
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      setMenuLocked(false);
      const picked = [];
      for (const { slot, items } of groupBySlot(deck.equipment)) {
        box.querySelectorAll(`input[name="${slot}"]:checked`).forEach((inp) => picked.push(items[+inp.value]));
      }
      resolve(picked);
    }, { once: true });
    setMenuLocked(true);
    dialog.showModal();
  });
}

async function startGame() {
  const youEquip = await chooseEquipment(state.you);
  const npcEquip = npcPickEquipment(state.npc.equipment);
  $('#menu').hidden = true;
  for (const id of ['#stage', '#initiative-status']) $(id).hidden = false;
  state.stage ||= createStage($('#stage'), new URL('../card-back.jpg', import.meta.url).href);
  state.stage.resize();
  state.stage.reset();

  const rolls = await state.stage.rollInitiative((status) => { $('#initiative-status').textContent = status; });
  $('#initiative-status').textContent = `You rolled ${rolls.you}; NPC rolled ${rolls.npc}. ${rolls.first} goes first.`;
  await new Promise((resolve) => setTimeout(resolve, 1600));
  $('#initiative-status').hidden = true;
  state.stage.clearInitiativeDice();
  for (const id of ['#hud', '#quit']) $(id).hidden = false;

  const you = newPlayer(state.you, youEquip);
  const npc = newPlayer(state.npc, npcEquip);
  draw(you);
  draw(npc);
  state.stage.deal(-1, npc, { showHand: false });
  state.stage.deal(1, you, { showHand: true });

  const line = (p, label) =>
    `<div><strong>${label}: ${p.hero.name}</strong><small>Life ${p.life} - Hand ${p.hand.length} - Deck ${p.library.length}</small></div>`;
  $('#hud').innerHTML = line(npc, 'Opponent') + line(you, 'You');
}

$('#start').onclick = startGame;
$(`#change-you`).onclick = () => {
  state.you = null;
  state.npc = null;
  $('#selection-summary').hidden = true;
  $('#picker-npc').hidden = true;
  $('#picker-you').hidden = false;
  $('#start').disabled = true;
  $('#status').textContent = 'Choose your hero.';
};
$(`#change-npc`).onclick = () => {
  state.npc = null;
  $('#selection-summary').hidden = true;
  $('#picker-npc').hidden = false;
  $('#start').disabled = true;
  $('#status').textContent = 'Choose the opponent hero.';
};
$('#quit').onclick = () => {
  for (const id of ['#stage', '#hud', '#quit']) $(id).hidden = true;
  $('#menu').hidden = false;
};
$('#deck-list-back').onclick = () => $('#deck-list').close();
$('#card-preview-back').onclick = closeCardPreview;
$('#card-preview').addEventListener('click', (event) => {
  if (event.target === event.currentTarget || event.target === $('#card-preview-image')) closeCardPreview();
});
$('#card-preview').addEventListener('close', () => {
  if (!$('#deck-list').open) setMenuLocked(false);
});
$('#card-preview-image').addEventListener('pointermove', (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  event.currentTarget.style.transform = `perspective(1000px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translateY(-3px)`;
});
$('#card-preview-image').addEventListener('pointerleave', (event) => { event.currentTarget.style.transform = ''; });
loadDecks();
