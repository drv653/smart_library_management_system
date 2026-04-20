const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'library.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function seedUsers() {
  const countRow = await get('SELECT COUNT(*) AS count FROM users');
  if (countRow.count > 0) {
    return;
  }

  const passwordHashAdmin = await bcrypt.hash('admin123', 10);
  const passwordHashUser = await bcrypt.hash('user123', 10);

  await run(
    `INSERT INTO users (username, password_hash, role, full_name, email)
     VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
    [
      'admin',
      passwordHashAdmin,
      'admin',
      'Library Administrator',
      'admin@smartlibrary.local',
      'reader1',
      passwordHashUser,
      'user',
      'Ava Reader',
      'reader1@smartlibrary.local'
    ]
  );
}

async function seedBooks() {
  const countRow = await get('SELECT COUNT(*) AS count FROM books');
  if (countRow.count > 0) {
    return;
  }

  const books = [
    ['Clean Code', 'Robert C. Martin', '9780132350884', 'Software Engineering', 5, 5, 'Practical coding standards and craftsmanship.'],
    ['Atomic Habits', 'James Clear', '9780735211292', 'Self Improvement', 4, 4, 'Habit-building framework for lasting personal change.'],
    ['The Pragmatic Programmer', 'Andrew Hunt', '9780135957059', 'Software Engineering', 3, 3, 'Timeless advice for professional developers.'],
    ['Deep Work', 'Cal Newport', '9781455586691', 'Productivity', 4, 4, 'Strategies to focus deeply in a distracted world.'],
    ['Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', 'Computer Science', 2, 2, 'Foundational algorithms reference for students and engineers.']
  ];

  for (const book of books) {
    await run(
      `INSERT INTO books
      (title, author, isbn, category, total_copies, available_copies, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      book
    );
  }
}

async function initializeDatabase() {
  await run('PRAGMA foreign_keys = ON');

  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    isbn TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    total_copies INTEGER NOT NULL CHECK(total_copies >= 0),
    available_copies INTEGER NOT NULL CHECK(available_copies >= 0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    borrow_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    return_date TEXT,
    status TEXT NOT NULL CHECK(status IN ('borrowed', 'returned', 'overdue')) DEFAULT 'borrowed',
    fine_amount REAL NOT NULL DEFAULT 0,
    fine_paid INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
  )`);

  try {
    await run('ALTER TABLE transactions ADD COLUMN fine_paid INTEGER DEFAULT 0');
  } catch (e) {
    // Column might already exist
  }

  await run(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(transaction_id) REFERENCES transactions(id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(book_id) REFERENCES books(id)
  )`);

  await seedUsers();
  await seedBooks();
}

module.exports = {
  db,
  run,
  get,
  all,
  initializeDatabase
};
