const supabase = require("../config/supabase");

const verifyStorage = async () => {
  console.log("--- Supabase Storage Verification ---\n");

  // Test operations on 'products' table
  try {
    const testProduct = {
      name: "TEST_PRODUCT",
      price: 99.99,
      description: "Test record",
    };

    // Create
    const { data: createData, error: createError } = await supabase
      .from("products")
      .insert([testProduct])
      .select();
    if (createError) throw new Error(`CREATE FAILED: ${createError.message}`);
    console.log("CREATE OK");
    const testId = createData[0].id;

    // Read
    const { data: readData, error: readError } = await supabase
      .from("products")
      .select("*")
      .eq("id", testId)
      .single();
    if (readError || !readData)
      throw new Error(`READ FAILED: ${readError?.message}`);
    console.log("READ OK");

    // Update
    const { error: updateError } = await supabase
      .from("products")
      .update({ price: 100.0 })
      .eq("id", testId);
    if (updateError) throw new Error(`UPDATE FAILED: ${updateError.message}`);
    console.log("UPDATE OK");

    // Delete
    const { error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", testId);
    if (deleteError) throw new Error(`DELETE FAILED: ${deleteError.message}`);
    console.log("DELETE OK");
  } catch (err) {
    console.error(err.message);
    if (err.message.includes('relation "public.products" does not exist')) {
      console.log(
        "\nMissing Tables! Please run the following SQL in Supabase SQL Editor:",
      );
      console.log(`
        create table public.products (
          id bigint generated always as identity primary key,
          name text not null,
          description text,
          price numeric not null,
          stock integer default 0,
          created_at timestamptz default now()
        );
      `);
    }
  }

  console.log("\n--- Main Tables Check ---");
  const mainTables = [
    "users",
    "products",
    "orders",
    "order_items",
    "inventory",
    "proposals",
    "quotations",
    "invoices",
    "payments",
  ];

  for (const table of mainTables) {
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: false })
      .limit(1);

    if (error) {
      if (error.code === "42P01") {
        console.log(`Table '${table}': MISSING`);
      } else {
        console.log(`Table '${table}': ERROR - ${error.message}`);
      }
    } else {
      console.log(`Table '${table}': EXISTS | Rows: ${count}`);
      if (data && data.length > 0) {
        console.log(`  Sample:`, data[0]);
      }
    }
  }
};

verifyStorage();
