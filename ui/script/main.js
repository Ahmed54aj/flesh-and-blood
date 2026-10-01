import { createStage } from './scene.js';
import { newPlayer, draw, groupBySlot, npcPickEquipment, SINGLE_SLOTS } from './game.js';

const $ = (s) => document.querySelector(s);
const state = { products: [], deckCache: new Map(), you: null, npc: null, stage: null };
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
  renderList('npc');
}

function renderList(who) {
  const el = $(`#list-${who}`);
  el.innerHTML = '';
  for (const product of state.products) {
    const row = document.createElement('div');
    row.className = 'deck-row';
    const select = document.createElement('button');
    select.type = 'button';
    const heroName = product.name.replace(/^Silver Age Chapter [1-3] - /, '');
    select.className = 'deck deck-select' + (state[who]?.id === product.slug ? ' sel' : '');
    select.append(document.createTextNode(heroName));
    const chapter = document.createElement('small');
    chapter.textContent = `Chapter ${product.chapter}`;
    select.append(chapter);
    select.onclick = async () => {
      select.disabled = true;
      $('#status').textContent = `Loading ${product.name}...`;
      try {
        state[who] = await fetchProductDetails(product);
        renderList(who);
        $('#start').disabled = !(state.you && state.npc);
        $('#status').textContent = `${who === 'you' ? 'Your' : 'Opponent'} hero: ${state[who].hero.name}`;
      } catch (error) {
        console.error(`Could not load ${product.name}:`, error);
        $('#status').textContent = `Could not load ${product.name} from Card Vault or the saved backup.`;
        select.disabled = false;
      }
    };
    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'deck-view';
    view.textContent = 'View deck list';
    view.onclick = () => openDeckList(product);
    row.append(select, view);
    el.append(row);
  }
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
  preview.hidden = false;
}

function closeCardPreview() {
  $('#card-preview').hidden = true;
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
$('#quit').onclick = () => {
  for (const id of ['#stage', '#hud', '#quit']) $(id).hidden = true;
  $('#menu').hidden = false;
};
$('#deck-list-back').onclick = () => $('#deck-list').close();
$('#card-preview-back').onclick = closeCardPreview;
$('#card-preview').addEventListener('click', (event) => {
  if (event.target === event.currentTarget || event.target === $('#card-preview-image')) closeCardPreview();
});
$('#card-preview-image').addEventListener('pointermove', (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  event.currentTarget.style.transform = `perspective(1000px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg) translateY(-3px)`;
});
$('#card-preview-image').addEventListener('pointerleave', (event) => { event.currentTarget.style.transform = ''; });
loadDecks();
