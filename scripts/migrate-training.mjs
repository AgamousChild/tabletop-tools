import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';

// Load .env
const envFile = readFileSync('.env', 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  if (line.startsWith('#') || !line.includes('=')) continue;
  const [key, ...rest] = line.split('=');
  env[key.trim()] = rest.join('=').trim();
}

const client = createClient({
  url: env.TURSO_DB_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

const statements = [
  `CREATE TABLE training_examples (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    dice_set_id text NOT NULL,
    label integer NOT NULL,
    guess integer,
    confidence real,
    features text NOT NULL,
    image_url text,
    is_correct integer,
    created_at integer NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (dice_set_id) REFERENCES dice_sets(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX idx_training_examples_user_id ON training_examples (user_id)`,
  `CREATE INDEX idx_training_examples_dice_set_id ON training_examples (dice_set_id)`,
  `CREATE INDEX idx_training_examples_label ON training_examples (label)`,
  `CREATE TABLE training_frames (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    dice_set_id text NOT NULL,
    image_url text NOT NULL,
    frame_width integer NOT NULL,
    frame_height integer NOT NULL,
    boxes_json text NOT NULL,
    created_at integer NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (dice_set_id) REFERENCES dice_sets(id) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE INDEX idx_training_frames_user_id ON training_frames (user_id)`,
  `CREATE INDEX idx_training_frames_dice_set_id ON training_frames (dice_set_id)`,
];

for (const sql of statements) {
  try {
    await client.execute(sql);
    console.log('OK:', sql.slice(0, 60).replace(/\n/g, ' ') + '...');
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log('SKIP (exists):', sql.slice(0, 60).replace(/\n/g, ' ') + '...');
    } else {
      console.error('FAIL:', sql.slice(0, 60).replace(/\n/g, ' ') + '...');
      console.error('  ', e.message);
    }
  }
}

console.log('Done!');
