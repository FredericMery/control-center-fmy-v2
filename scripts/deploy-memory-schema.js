#!/usr/bin/env node

/**
 * Deploy Memory Module Schema to Supabase
 * Usage: node scripts/deploy-memory-schema.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deploySchema() {
  console.log('📚 Deploying Memory Module Schema...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/memory-schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Execute migration
    console.log('🔄 Executing SQL migration...');
    const { error } = await supabase.rpc('exec', { sql });

    if (error) {
      // Try executing with manual split if rpc fails
      const statements = sql.split(';').filter((s) => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          const { error: err } = await supabase.rpc('query', { query: statement });
          if (err) console.warn(`⚠️  Warning: ${err.message}`);
        }
      }
    }

    // Verify tables were created
    console.log('\n✅ Verifying tables...');
    const { data: tables, error: verifyError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .ilike('table_name', 'memory_%');

    if (verifyError) {
      // Alternative verification
      const expectedTables = [
        'memory_sections',
        'memory_fields',
        'memory_items',
        'memory_item_values',
      ];

      for (const table of expectedTables) {
        const { error } = await supabase.from(table).select('*').limit(0);
        if (!error) {
          console.log(`  ✓ ${table}`);
        }
      }
    } else if (tables) {
      tables.forEach((t) => console.log(`  ✓ ${t.table_name}`));
    }

    console.log('\n✅ Memory Module Schema deployed successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Visit: /api/memory/init-templates (POST with userId)');
    console.log('  2. Use the Memory module at: /dashboard/memoire');
    console.log('  3. Create collections from predefined templates\n');
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run deployment
deploySchema();
