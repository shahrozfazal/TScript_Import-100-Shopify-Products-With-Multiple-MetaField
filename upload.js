import fs from "fs";
import csv from "csv-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

// 🔑 Shopify credentials
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const API_VERSION = process.env.API_VERSION || "2025-01";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

if (!SHOPIFY_STORE || !ACCESS_TOKEN) {
  console.error("❌ Missing SHOPIFY_STORE or ACCESS_TOKEN in .env");
  process.exit(1);
}

// 🛠 Metafield type map
const metafieldsMap = {
  band: "list.single_line_text_field",
  web_water_resistance: "list.single_line_text_field",
  web_strap: "list.single_line_text_field",
  case_cross_reference: "list.single_line_text_field",
  web_case_material: "list.single_line_text_field",
  case_thickness_mm: "list.number_decimal",
  case_length_mm: "list.number_decimal",
  movement_value_1: "list.single_line_text_field",
  movement_value_2: "list.single_line_text_field",
  movement_value_3: "list.single_line_text_field",
  feature_1: "list.single_line_text_field",
  feature_2: "list.single_line_text_field",
  feature_3: "list.single_line_text_field",
  feature_4: "list.single_line_text_field",
  feature_5: "list.single_line_text_field",
};

// 🛠 Format metafield values
function formatMetafieldValue(value, type) {
  if (!value) return null;

  if (type.startsWith("list.")) {
    // Convert to array
    const arr = value
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    return arr.length > 0 ? JSON.stringify(arr) : null;
  }

  return value.trim();
}

// 🛠 Create product in Shopify
async function createProduct(row) {
  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products.json`;

  const productData = {
    title: row["Title"],
    body_html: row["Body (HTML)"],
    vendor: row["Vendor"],
    product_type: row["Type"],
    tags: row["Tags"],
    status: row["Status"] || "draft",
    variants: [
      {
        sku: row["Handle"],
        price: row["Variant Price"] || "0.00",
        grams: Number(row["Variant Grams"] || 0),
        weight_unit: row["Variant Weight Unit"] || "g",
        inventory_quantity: parseInt(row["Variant Inventory Qty"] || "0", 10),
      },
    ],
    images: row["Image Src"] ? [{ src: row["Image Src"] }] : [],
  };

  // 1️⃣ Create product
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ product: productData }),
  });

  if (!response.ok) {
    console.error("❌ Error creating product:", await response.text());
    return;
  }

  const data = await response.json();
  const productId = data.product.id;
  console.log(`✅ Created product: ${row["Handle"]} ID: ${productId}`);

  // 2️⃣ Add metafields
  for (const key in metafieldsMap) {
    const type = metafieldsMap[key];
    const value = row[`product.metafields.custom.${key}`] || row[key];

    if (!value) continue;

    const formattedValue = formatMetafieldValue(value, type);
    if (!formattedValue) continue;

    const metafieldUrl = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/products/${productId}/metafields.json`;

    const metafieldData = {
      metafield: {
        namespace: "custom",
        key,
        type,
        value: formattedValue,
      },
    };

    const metaResponse = await fetch(metafieldUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metafieldData),
    });

    if (!metaResponse.ok) {
      console.error(
        `❌ Error adding metafield ${key}:`,
        await metaResponse.text()
      );
    } else {
      console.log(`   ➕ Metafield added: ${key} = ${formattedValue}`);
    }
  }
}

// 📂 Read CSV
const rows = [];
fs.createReadStream("products.csv")
  .pipe(csv())
  .on("data", (row) => rows.push(row))
  .on("end", async () => {
    console.log(`📦 Found ${rows.length} products in CSV...`);
    for (const row of rows) {
      await createProduct(row);
    }
    console.log("🎉 All products uploaded!");
  });
