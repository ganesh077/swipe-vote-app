const concepts = [
  {
    dish: "Korean BBQ Tacos",
    category: "Tacos",
    detail: "gochujang jackfruit, sesame slaw, toasted scallion crema",
    accent: "#d95550"
  },
  {
    dish: "Miso Corn Dumplings",
    category: "Dumplings",
    detail: "sweet corn, miso butter, chili crisp, shaved cabbage",
    accent: "#e0a830"
  },
  {
    dish: "Crispy Tofu Banh Mi",
    category: "Sandwich",
    detail: "lemongrass tofu, pickled carrot, cucumber, jalapeno aioli",
    accent: "#2f9c95"
  },
  {
    dish: "Plantain Black Bean Arepas",
    category: "Arepas",
    detail: "griddled arepa, black beans, roasted plantain, avocado sauce",
    accent: "#f07f3c"
  },
  {
    dish: "Herb Falafel Pitas",
    category: "Pitas",
    detail: "parsley falafel, tomato salad, tahini, crunchy turnips",
    accent: "#4e9d5d"
  },
  {
    dish: "Soba Noodle Cups",
    category: "Noodles",
    detail: "chilled soba, edamame, ginger dressing, toasted nori",
    accent: "#4b82c3"
  },
  {
    dish: "Coconut Curry Rice Bowls",
    category: "Bowls",
    detail: "jasmine rice, coconut curry, roasted vegetables, basil",
    accent: "#c96f3d"
  },
  {
    dish: "Mushroom Empanadas",
    category: "Pastry",
    detail: "savory mushrooms, queso fresco, chimichurri, flaky crust",
    accent: "#9b6d3d"
  },
  {
    dish: "Spiced Potato Curry Puffs",
    category: "Pastry",
    detail: "curried potato, peas, tamarind glaze, crisp pastry",
    accent: "#c07c2d"
  },
  {
    dish: "Char Siu Bao Buns",
    category: "Buns",
    detail: "sticky roasted seitan, cucumber, hoisin, steamed bao",
    accent: "#b94646"
  },
  {
    dish: "Roasted Pepper Pizza Slices",
    category: "Pizza",
    detail: "sourdough crust, roasted peppers, mozzarella, basil oil",
    accent: "#cf5d2e"
  },
  {
    dish: "Paneer Kati Rolls",
    category: "Wraps",
    detail: "spiced paneer, onion relish, mint chutney, flaky paratha",
    accent: "#b86cbd"
  },
  {
    dish: "Green Chile Tamales",
    category: "Tamales",
    detail: "masa, roasted green chile, corn, tomatillo salsa",
    accent: "#5f9a3f"
  },
  {
    dish: "Brown Butter Pierogi Skillet",
    category: "Skillet",
    detail: "potato pierogi, brown butter, onions, dill sour cream",
    accent: "#7e6a44"
  },
  {
    dish: "Loroco Cheese Pupusas",
    category: "Pupusas",
    detail: "masa cakes, loroco, melty cheese, curtido, tomato salsa",
    accent: "#d88a34"
  },
  {
    dish: "Cabbage Okonomiyaki",
    category: "Griddle",
    detail: "savory pancake, cabbage, mushroom, kewpie-style drizzle",
    accent: "#586f9d"
  },
  {
    dish: "Tomato Basil Gnocchi Cups",
    category: "Pasta",
    detail: "pillowy gnocchi, tomato sugo, basil, shaved parmesan",
    accent: "#d14f68"
  },
  {
    dish: "Smoky Jollof Bowls",
    category: "Bowls",
    detail: "jollof rice, charred peppers, fried plantain, herb salad",
    accent: "#d7672a"
  },
  {
    dish: "Citrus Ceviche Tostadas",
    category: "Tostadas",
    detail: "citrus-marinated hearts of palm, avocado, radish, tostada",
    accent: "#2f8fbe"
  },
  {
    dish: "Cardamom Churro Sundaes",
    category: "Dessert",
    detail: "warm churros, cardamom sugar, vanilla cream, cocoa nibs",
    accent: "#a8583c"
  }
];

const editions = [
  {
    prefix: "Market",
    finish: "a clean finish for crowded lunch hours"
  },
  {
    prefix: "Midnight",
    finish: "a bold salty edge for late-night lines"
  },
  {
    prefix: "Picnic",
    finish: "a fresh packable build for park meetups"
  },
  {
    prefix: "Harbor",
    finish: "coastal brightness and a sharp squeeze of citrus"
  },
  {
    prefix: "Campus",
    finish: "a fast filling style for between-class stops"
  },
  {
    prefix: "Firehouse",
    finish: "a warm spice profile for cold evenings"
  }
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sentenceCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function imageDataUrl(item) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(item.accent) ? item.accent : "#2f9c95";
  const shadow = "#17202a";
  const label = escapeXml(item.label);
  const category = escapeXml(item.category.toUpperCase());
  const patternOffset = (item.sortOrder % 7) * 18;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1120" viewBox="0 0 900 1120"><rect width="900" height="1120" fill="#f7f1e6"/><rect x="42" y="42" width="816" height="1036" rx="34" fill="${accent}"/><path d="M${patternOffset} 0h28v1120h-28zM${patternOffset + 180} 0h28v1120h-28zM${patternOffset + 360} 0h28v1120h-28zM${patternOffset + 540} 0h28v1120h-28zM${patternOffset + 720} 0h28v1120h-28z" fill="#fff" opacity=".13"/><circle cx="450" cy="362" r="198" fill="#fff" opacity=".92"/><circle cx="450" cy="362" r="126" fill="${accent}"/><path d="M260 672c110-86 270-86 380 0l52 126c-128 76-356 76-484 0z" fill="#fff" opacity=".94"/><path d="M278 674c112 58 232 58 344 0" fill="none" stroke="${shadow}" stroke-width="24" stroke-linecap="round" opacity=".72"/><text x="450" y="385" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="800" fill="#fff">${category}</text><text x="450" y="888" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="800" fill="#fff">${label}</text><text x="450" y="1008" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#fff" opacity=".72">STREET PICK</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function getSeedItems() {
  const items = [];

  for (const [editionIndex, edition] of editions.entries()) {
    for (const [conceptIndex, concept] of concepts.entries()) {
      const sortOrder = editionIndex * concepts.length + conceptIndex + 1;
      const label = `${edition.prefix} ${concept.dish}`;
      const id = slugify(label);

      const item = {
        id,
        label,
        description: `${sentenceCase(concept.detail)}, finished with ${edition.finish}.`,
        category: concept.category,
        accent: concept.accent,
        sortOrder
      };

      items.push({
        ...item,
        imageUrl: imageDataUrl(item)
      });
    }
  }

  return items;
}

export { imageDataUrl };
