import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'ui', 'data', 'decks');
const IMAGE_OUTPUT = path.join(ROOT, 'ui', 'assets', 'cards');
const CATALOG_URL = 'https://api.cardvault.fabtcg.com/carddb/api/v1/product-groups-products/?page_size=150';
const PRODUCT_CARDS_URL = 'https://api.cardvault.fabtcg.com/carddb/api/v1/product-cards/';

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function getAllProducts() {
  const groups = [];
  let next = CATALOG_URL;
  while (next) {
    const page = await getJson(next);
    groups.push(...page.results);
    next = page.next;
  }

  return groups.flatMap((group) => {
    const chapterMatch = group.group_name?.match(/^Silver Age Chapter ([1-3]) - /);
    const product = group.products?.find((entry) => entry.printed_language === 'en');
    if (!chapterMatch || !product) return [];

    const chapter = Number(chapterMatch[1]);
    const filename = `${product.slug.replace(/^silver-age-chapter-[1-3]-/, '')}.json`;
    return [{ chapter, name: group.group_name, slug: product.slug, filename }];
  }).sort((a, b) => a.chapter - b.chapter || a.name.localeCompare(b.name));
}

async function main() {
  const products = await getAllProducts();
  const failures = [];
  const imageSources = new Map();

  for (let i = 0; i < products.length; i += 4) {
    await Promise.all(products.slice(i, i + 4).map(async (product) => {
      try {
        const details = await getJson(`${PRODUCT_CARDS_URL}${encodeURIComponent(product.slug)}/`);
        const directory = path.join(OUTPUT, `chapter-${product.chapter}`);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, product.filename), `${JSON.stringify(details, null, 2)}\n`);
        for (const card of details.cards || []) {
          const image = card.faces?.[0]?.image?.normal || card.faces?.[0]?.image?.large;
          if (card.print_id && image) imageSources.set(card.print_id, image.replace(/^http:/, 'https:'));
        }
        console.log(`Saved Chapter ${product.chapter}: ${product.name}`);
      } catch (error) {
        failures.push(`${product.name}: ${error.message}`);
      }
    }));
  }

  await fs.mkdir(IMAGE_OUTPUT, { recursive: true });
  const images = [...imageSources];
  for (let i = 0; i < images.length; i += 12) {
    await Promise.all(images.slice(i, i + 12).map(async ([printId, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        await fs.writeFile(path.join(IMAGE_OUTPUT, `${printId}.webp`), Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        failures.push(`Image ${printId}: ${error.message}`);
      }
    }));
  }

  await fs.mkdir(OUTPUT, { recursive: true });
  await fs.writeFile(path.join(OUTPUT, 'catalog.json'), `${JSON.stringify({ products }, null, 2)}\n`);
  console.log(`Saved ${products.length - failures.length}/${products.length} deck details.`);
  console.log(`Saved ${images.length - failures.filter((failure) => failure.startsWith('Image ')).length}/${images.length} card images.`);
  if (failures.length) {
    failures.forEach((failure) => console.error(failure));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});