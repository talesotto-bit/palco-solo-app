/**
 * Importa o catalog.json (gerado pelo upload-to-r2) para o Supabase.
 * Rode após o upload ou sempre que quiser sincronizar.
 *
 * Usage: node scripts/import-catalog-to-supabase.mjs
 *
 * Requer no .env:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY=eyJ...  (service role key, NÃO anon)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import fs from "fs";
import path from "path";

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CATALOG_FILE = path.join(process.cwd(), "scripts", "catalog.json");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env");
  process.exit(1);
}

if (!fs.existsSync(CATALOG_FILE)) {
  console.error("❌ catalog.json não encontrado. Rode upload-to-r2.mjs primeiro.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, "utf-8"));

// Detect instrument type from stem name
function detectInstrument(name) {
  const n = name.toLowerCase();
  if (/drum|bater|percus|click/.test(n)) return "drums";
  if (/bass|baixo/.test(n)) return "bass";
  if (/guitar|gtr|guitarra/.test(n)) return "guitar";
  if (/acoust|acust|violao|violo/.test(n)) return "acoustic";
  if (/sanfon|acordeon/.test(n)) return "accordion";
  if (/key|piano|teclad|ep|rhodes|organ/.test(n)) return "keys";
  if (/voice|vocal|voz|canto|guia/.test(n)) return "voice";
  if (/choir|coro|back/.test(n)) return "choir";
  if (/brass|metal|horn|trompet/.test(n)) return "brass";
  if (/string|cord|violin/.test(n)) return "strings";
  if (/synth|pad|fx/.test(n)) return "synth";
  if (/main|mix|master/.test(n)) return "main";
  return null;
}

// Instrument sort priority
const SORT_ORDER = {
  main: 0, voice: 1, choir: 2, drums: 3, bass: 4,
  guitar: 5, acoustic: 6, keys: 7, accordion: 8,
  brass: 9, strings: 10, synth: 11,
};

async function main() {
  console.log(`🎵 Importando ${catalog.length} músicas para Supabase\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < catalog.length; i++) {
    const song = catalog[i];

    // Upsert track
    const { data: track, error: trackErr } = await supabase
      .from("tracks")
      .upsert(
        {
          name: song.name,
          slug: song.slug,
          genre_id: song.genreSlug,
          genre_label: song.genre,
          stem_count: song.stemCount,
          has_stems: song.stemCount > 1,
        },
        { onConflict: "slug,genre_id" }
      )
      .select("id")
      .single();

    if (trackErr) {
      console.error(`  ❌ ${song.name}: ${trackErr.message}`);
      errors++;
      continue;
    }

    // Upsert stems
    const stemRows = song.stems.map((stem, idx) => {
      const instrument = detectInstrument(stem.name);
      return {
        track_id: track.id,
        name: stem.name,
        slug: stem.slug,
        r2_key: stem.key,
        url: stem.url,
        format: stem.format,
        size_bytes: stem.size || 0,
        instrument_type: instrument,
        sort_order: instrument ? (SORT_ORDER[instrument] ?? 50) : idx,
      };
    });

    const { error: stemsErr } = await supabase
      .from("stems")
      .upsert(stemRows, { onConflict: "r2_key" });

    if (stemsErr) {
      console.error(`  ⚠️ Stems de ${song.name}: ${stemsErr.message}`);
      errors++;
    } else {
      inserted++;
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  📋 ${i + 1}/${catalog.length} processadas...`);
    }
  }

  // Update genre track counts
  const { data: genres } = await supabase.from("genres").select("id");
  if (genres) {
    for (const genre of genres) {
      const { count } = await supabase
        .from("tracks")
        .select("*", { count: "exact", head: true })
        .eq("genre_id", genre.id)
        .eq("is_active", true);

      await supabase
        .from("genres")
        .update({ track_count: count || 0 })
        .eq("id", genre.id);
    }
  }

  console.log("\n=====================================");
  console.log(`✅ Importação concluída!`);
  console.log(`   📤 Inseridas/atualizadas: ${inserted}`);
  console.log(`   ❌ Erros: ${errors}`);
}

main().catch(console.error);
