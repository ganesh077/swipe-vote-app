import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "../server/env.js";

const projectRoot = path.resolve(import.meta.dirname, "..");

loadEnv(path.join(projectRoot, ".env"));
loadEnv(path.join(projectRoot, ".vercel/.env.production.local"));

const force = process.argv.includes("--force");
const creditsOnly = process.argv.includes("--credits");

const demoItems = [
  {
    id: "demo-korean-bbq-tacos",
    label: "Korean BBQ Tacos",
    description: "Sweet-spicy Korean taco plate with slaw, herbs, and a weekend market crunch.",
    category: "Tacos",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/1/14/Kogi_Korean_BBQ_tacos_%283124952261%29.jpg",
    imageCredit: "Kogi Korean BBQ tacos, Ricardo Diaz, CC BY 2.0, Wikimedia Commons",
    accent: "#d95550"
  },
  {
    id: "demo-miso-corn-dumplings",
    label: "Miso Corn Dumplings",
    description: "Steamed dumplings with sweet corn, miso butter, cabbage, and chili crisp.",
    category: "Dumplings",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/44/Bamboo_Steamer_with_Steamed_Pork_on_Rice.jpg",
    imageCredit: "Bamboo steamer with steamed pork on rice, Alpha, CC BY-SA 2.0, Wikimedia Commons",
    accent: "#e0a830"
  },
  {
    id: "demo-crispy-tofu-banh-mi",
    label: "Crispy Tofu Banh Mi",
    description: "Tofu banh mi with pickled vegetables, herbs, jalapeno, and bright aioli.",
    category: "Sandwich",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e3/B%C3%A1nh_m%C3%AC_%C4%91%E1%BA%ADu_h%C5%A9.jpg",
    imageCredit: "Banh mi dau hu, Nguyentrongphu, CC BY-SA 4.0, Wikimedia Commons",
    accent: "#2f9c95"
  },
  {
    id: "demo-plantain-black-bean-arepas",
    label: "Plantain Black Bean Arepas",
    description: "Griddled arepas with black beans, roasted plantain, and avocado sauce.",
    category: "Arepas",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/6/69/Arepa_%26_scrambled_eggs_-_close_up.jpg",
    imageCredit: "Arepa close up, Gabriel Garcia Marengo, CC BY 2.0, Wikimedia Commons",
    accent: "#f07f3c"
  },
  {
    id: "demo-herb-falafel-pitas",
    label: "Herb Falafel Pitas",
    description: "Falafel pita with tahini, tomato salad, pickles, and crunchy greens.",
    category: "Pitas",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/5/54/Falafel_in_a_pita.jpg",
    imageCredit: "Falafel in a pita, Israel photo gallery, CC BY-SA 2.0, Wikimedia Commons",
    accent: "#4e9d5d"
  },
  {
    id: "demo-soba-noodle-cups",
    label: "Soba Noodle Cups",
    description: "Chilled soba cups with edamame, ginger dressing, sesame, and toasted nori.",
    category: "Noodles",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/7/73/Two_bowls_of_soba_noodles_with_chopsticks.jpg",
    imageCredit: "Two bowls of soba noodles with chopsticks, Shisma, CC BY 4.0, Wikimedia Commons",
    accent: "#4b82c3"
  },
  {
    id: "demo-coconut-curry-rice-bowls",
    label: "Coconut Curry Rice Bowls",
    description: "Rice bowls with coconut curry, roasted vegetables, basil, and crisp toppings.",
    category: "Bowls",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Vegan_Madras_Curry_with_Eggplant_%284713705096%29.jpg",
    imageCredit: "Vegan Madras Curry with Eggplant, Vegan Feast Catering, CC BY 2.0, Wikimedia Commons",
    accent: "#c96f3d"
  },
  {
    id: "demo-mushroom-empanadas",
    label: "Mushroom Empanadas",
    description: "Flaky empanadas with savory mushroom filling, queso, and chimichurri.",
    category: "Pastry",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/97/Empanada_-_Stu_Spivack.jpg",
    imageCredit: "Empanada, Stu Spivack, CC BY-SA 2.0, Wikimedia Commons",
    accent: "#9b6d3d"
  },
  {
    id: "demo-spiced-potato-curry-puffs",
    label: "Spiced Potato Curry Puffs",
    description: "Crisp pastry pockets filled with curried potato, peas, and tamarind glaze.",
    category: "Pastry",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d9/HK_Arena_Sunday_AsiaWorld_Expo_Food_%E7%89%9B%E8%82%89%E5%92%96%E5%93%A9%E8%A7%92_Beef_Curry_Puff.JPG",
    imageCredit: "Beef Curry Puff, Hoitintungs, CC BY-SA 3.0, Wikimedia Commons",
    accent: "#c07c2d"
  },
  {
    id: "demo-char-siu-bao-buns",
    label: "Char Siu Bao Buns",
    description: "Steamed bao buns with sticky char siu filling, cucumber, and hoisin.",
    category: "Buns",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/9/99/07_Char_Siu_Bao_-_Steamed_Pork_Buns_-_East_Harbor_Seafood_Palace.jpg",
    imageCredit: "Char Siu Bao, jasonlam, CC BY-SA 2.0, Wikimedia Commons",
    accent: "#b94646"
  }
];

function printCredits() {
  console.log("Demo seed image credits:");
  for (const item of demoItems) {
    console.log(`- ${item.label}: ${item.imageCredit}`);
  }
}

if (creditsOnly) {
  printCredits();
  process.exit(0);
}

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length).trim();
  }

  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1) {
    return process.argv[index + 1]?.trim();
  }

  return "";
}

function cleanValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function projectRefFromUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.endsWith(".supabase.co")
      ? url.hostname.split(".")[0]
      : "";
  } catch {
    return "";
  }
}

function readLinkedProjectRef() {
  const filePath = path.join(projectRoot, "supabase/.temp/project-ref");
  if (!existsSync(filePath)) {
    return "";
  }

  return readFileSync(filePath, "utf8").trim();
}

function getSupabaseAccessToken() {
  if (cleanValue(process.env.SUPABASE_ACCESS_TOKEN)) {
    return cleanValue(process.env.SUPABASE_ACCESS_TOKEN);
  }

  if (process.platform !== "darwin") {
    return "";
  }

  try {
    const rawToken = execFileSync("security", ["find-generic-password", "-a", "supabase", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    if (rawToken.startsWith("go-keyring-base64:")) {
      return Buffer.from(rawToken.slice("go-keyring-base64:".length), "base64").toString("utf8").trim();
    }

    return rawToken;
  } catch {
    return "";
  }
}

async function fetchServiceRoleKey(projectRef) {
  const accessToken = getSupabaseAccessToken();
  if (!accessToken) {
    return "";
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Management API returned ${response.status}: ${detail}`);
  }

  const keys = await response.json();
  return cleanValue(keys.find((key) => key.name === "service_role")?.api_key);
}

async function resolveSupabaseCredentials() {
  const envUrl = cleanValue(process.env.SUPABASE_URL);
  const envKey = cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (envUrl && envKey) {
    return { supabaseUrl: envUrl, serviceRoleKey: envKey, source: ".env or shell env" };
  }

  const projectRef = cleanValue(argValue("project-ref"))
    || cleanValue(process.env.SUPABASE_PROJECT_REF)
    || projectRefFromUrl(envUrl)
    || readLinkedProjectRef();

  if (projectRef) {
    const serviceRoleKey = await fetchServiceRoleKey(projectRef);
    if (serviceRoleKey) {
      return {
        supabaseUrl: `https://${projectRef}.supabase.co`,
        serviceRoleKey,
        source: "Supabase CLI login and linked project"
      };
    }
  }

  throw new Error([
    "Missing Supabase credentials.",
    "Option 1: create .env from .env.example with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    "Option 2: run `supabase login` and `supabase link --project-ref <ref>`, then rerun this script.",
    "Option 3: set SUPABASE_ACCESS_TOKEN and pass `--project-ref <ref>`."
  ].join("\n"));
}

const { supabaseUrl, serviceRoleKey, source } = await resolveSupabaseCredentials();
console.log(`Using Supabase credentials from ${source}.`);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function assertOk(query, label) {
  const { error } = await query;
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

if (force) {
  await assertOk(supabase.from("vote_events").delete().gte("id", 0), "Clearing vote_events");
  await assertOk(supabase.from("votes").delete().neq("session_id", ""), "Clearing votes");
  await assertOk(supabase.from("items").delete().neq("id", ""), "Clearing items");
}

const rows = demoItems.map((item, index) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  category: item.category,
  image_url: item.imageUrl,
  accent: item.accent,
  sort_order: index + 1
}));

const { error } = await supabase.from("items").upsert(rows, { onConflict: "id" });
if (error) {
  throw error;
}

console.log(`Seeded ${rows.length} demo items${force ? " after reset" : ""}.`);
if (!force) {
  console.log("Run with --force to replace the current deck with only these 10 demo items.");
}
printCredits();
