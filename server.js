const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initializeDatabase, run, get, all } = require('./server/db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smart-library-secret-key';
const BORROW_DAYS = 14;
const FINE_PER_DAY = 10;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function calculateFine(dueDate, returnDate = new Date()) {
  const due = new Date(`${dueDate}T00:00:00`);
  const returned = new Date(returnDate);
  const normalizedReturned = new Date(returned.getFullYear(), returned.getMonth(), returned.getDate());
  const diffInMs = normalizedReturned - due;
  const overdueDays = Math.max(0, Math.ceil(diffInMs / (1000 * 60 * 60 * 24)));
  return overdueDays * FINE_PER_DAY;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function authorize(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    return next();
  };
}

async function refreshOverdueStatuses() {
  const activeTransactions = await all(
    `SELECT id, due_date, status
     FROM transactions
     WHERE status IN ('borrowed', 'overdue')`
  );

  for (const transaction of activeTransactions) {
    const fine = calculateFine(transaction.due_date);
    const nextStatus = fine > 0 ? 'overdue' : 'borrowed';
    if (transaction.status !== nextStatus) {
      await run('UPDATE transactions SET status = ?, fine_amount = ? WHERE id = ?', [nextStatus, fine, transaction.id]);
    } else if (fine > 0) {
      await run('UPDATE transactions SET fine_amount = ? WHERE id = ?', [fine, transaction.id]);
    }
  }
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = buildToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to login at the moment.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, fullName, email } = req.body;

    if (!/^[A-Za-z]+$/.test(username)) {
      return res.status(400).json({ message: 'Username must contain only alphabetical characters.' });
    }

    if (!username || !password || !fullName || !email) {
      return res.status(400).json({ message: 'Username, password, full name, and email are required.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const created = await run(
      `INSERT INTO users (username, password_hash, role, full_name, email)
       VALUES (?, ?, 'user', ?, ?)`,
      [String(username).trim(), passwordHash, String(fullName).trim(), String(email).trim().toLowerCase()]
    );

    const user = await get('SELECT * FROM users WHERE id = ?', [created.id]);
    const token = buildToken(user);

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(400).json({ message: 'Username already exists.' });
    }
    return res.status(500).json({ message: 'Unable to create account.' });
  }
});

app.get('/api/books', authenticate, async (req, res) => {
  try {
    const search = (req.query.search || '').trim().toLowerCase();
    let sql = 'SELECT * FROM books';
    let params = [];

    if (search) {
      sql += ' WHERE lower(title) LIKE ? OR lower(author) LIKE ? OR lower(category) LIKE ? OR lower(isbn) LIKE ?';
      const wildcard = `%${search}%`;
      params = [wildcard, wildcard, wildcard, wildcard];
    }

    sql += ' ORDER BY title ASC';
    const books = await all(sql, params);
    return res.json(books);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load books.' });
  }
});

app.post('/api/books', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { title, author, isbn, category, description, totalCopies } = req.body;
    if (!title || !author || !isbn || !category || !totalCopies) {
      return res.status(400).json({ message: 'Please fill all required book fields.' });
    }

    const copyCount = Number(totalCopies);
    if (!Number.isInteger(copyCount) || copyCount < 1) {
      return res.status(400).json({ message: 'Total copies must be a positive integer.' });
    }

    const created = await run(
      `INSERT INTO books (title, author, isbn, category, description, total_copies, available_copies, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [title.trim(), author.trim(), isbn.trim(), category.trim(), description?.trim() || '', copyCount, copyCount]
    );

    const book = await get('SELECT * FROM books WHERE id = ?', [created.id]);
    return res.status(201).json(book);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(400).json({ message: 'ISBN must be unique.' });
    }
    return res.status(500).json({ message: 'Unable to add book.' });
  }
});

app.put('/api/books/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { title, author, isbn, category, description, totalCopies } = req.body;
    const bookId = Number(req.params.id);
    const existing = await get('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!existing) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const copyCount = Number(totalCopies);
    if (!Number.isInteger(copyCount) || copyCount < 1) {
      return res.status(400).json({ message: 'Total copies must be a positive integer.' });
    }

    const borrowedCopies = existing.total_copies - existing.available_copies;
    if (copyCount < borrowedCopies) {
      return res.status(400).json({ message: `Total copies cannot be less than ${borrowedCopies} borrowed copies.` });
    }

    const availableCopies = copyCount - borrowedCopies;

    await run(
      `UPDATE books
       SET title = ?, author = ?, isbn = ?, category = ?, description = ?, total_copies = ?, available_copies = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title.trim(), author.trim(), isbn.trim(), category.trim(), description?.trim() || '', copyCount, availableCopies, bookId]
    );

    const updatedBook = await get('SELECT * FROM books WHERE id = ?', [bookId]);
    return res.json(updatedBook);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(400).json({ message: 'ISBN must be unique.' });
    }
    return res.status(500).json({ message: 'Unable to update book.' });
  }
});

app.delete('/api/books/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const bookId = Number(req.params.id);
    const activeTransaction = await get(
      `SELECT id FROM transactions
       WHERE book_id = ? AND status IN ('borrowed', 'overdue')`,
      [bookId]
    );

    if (activeTransaction) {
      return res.status(400).json({ message: 'Cannot remove a book that is currently borrowed.' });
    }

    const result = await run('DELETE FROM books WHERE id = ?', [bookId]);
    if (!result.changes) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    return res.json({ message: 'Book removed successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to remove book.' });
  }
});

app.post('/api/borrow', authenticate, authorize('user'), async (req, res) => {
  try {
    const { bookId } = req.body;
    const userId = req.user.id;
    const book = await get('SELECT * FROM books WHERE id = ?', [bookId]);

    if (!book) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    if (book.available_copies < 1) {
      return res.status(400).json({ message: 'This book is currently unavailable.' });
    }

    const duplicateBorrow = await get(
      `SELECT id FROM transactions
       WHERE user_id = ? AND book_id = ? AND status IN ('borrowed', 'overdue')`,
      [userId, bookId]
    );

    if (duplicateBorrow) {
      return res.status(400).json({ message: 'You already borrowed this book and have not returned it yet.' });
    }

    const today = new Date();
    const dueDate = addDays(today, BORROW_DAYS);

    await run(
      `INSERT INTO transactions (user_id, book_id, borrow_date, due_date, status, fine_amount)
       VALUES (?, ?, ?, ?, 'borrowed', 0)`,
      [userId, bookId, formatDate(today), formatDate(dueDate)]
    );

    await run(
      'UPDATE books SET available_copies = available_copies - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [bookId]
    );

    return res.status(201).json({ message: 'Book borrowed successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to borrow book.' });
  }
});

app.get('/api/my-transactions', authenticate, authorize('user'), async (req, res) => {
  try {
    await refreshOverdueStatuses();
    const transactions = await all(
      `SELECT t.id, t.borrow_date, t.due_date, t.return_date, t.status, t.fine_amount, t.fine_paid,
              b.title, b.author, b.category
       FROM transactions t
       JOIN books b ON b.id = t.book_id
       WHERE t.user_id = ?
       ORDER BY t.id DESC`,
      [req.user.id]
    );

    return res.json(transactions);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load your transactions.' });
  }
});

app.post('/api/returns/:transactionId', authenticate, async (req, res) => {
  try {
    const transactionId = Number(req.params.transactionId);
    const transaction = await get('SELECT * FROM transactions WHERE id = ?', [transactionId]);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const canReturn = req.user.role === 'admin';
    if (!canReturn) {
      return res.status(403).json({ message: 'Only administrators can mark a book as returned.' });
    }

    if (transaction.status === 'returned') {
      return res.status(400).json({ message: 'This book has already been returned.' });
    }

    const returnDate = new Date();
    const fine = calculateFine(transaction.due_date, returnDate);

    await run(
      `UPDATE transactions
       SET status = 'returned', return_date = ?, fine_amount = ?
       WHERE id = ?`,
      [formatDate(returnDate), fine, transactionId]
    );

    await run(
      'UPDATE books SET available_copies = available_copies + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [transaction.book_id]
    );

    return res.json({ message: fine > 0 ? `Book returned. Fine due: Rs. ${fine}.` : 'Book returned successfully.', fine });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to return book.' });
  }
});

app.post('/api/pay-fine/:transactionId', authenticate, async (req, res) => {
  try {
    const transactionId = Number(req.params.transactionId);
    const transaction = await get('SELECT * FROM transactions WHERE id = ?', [transactionId]);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const canPay = req.user.role === 'admin' || transaction.user_id === req.user.id;
    if (!canPay) {
      return res.status(403).json({ message: 'You cannot pay this fine.' });
    }

    if (transaction.status !== 'returned') {
      return res.status(400).json({ message: 'Please return the book before paying the fine.' });
    }

    await run('UPDATE transactions SET fine_paid = 1 WHERE id = ?', [transactionId]);
    return res.json({ message: 'Fine paid successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to process fine payment.' });
  }
});

app.post('/api/pay-all-fines', authenticate, authorize('user'), async (req, res) => {
  try {
    const result = await run(
      "UPDATE transactions SET fine_paid = 1 WHERE user_id = ? AND status = 'returned' AND fine_amount > 0 AND fine_paid = 0",
      [req.user.id]
    );
    if (result.changes === 0) {
      return res.status(400).json({ message: 'No eligible fines to pay. Please ensure relevant books have been returned first.' });
    }
    return res.json({ message: 'All outstanding collection fines paid successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to process bulk fine payment.' });
  }
});

app.get('/api/admin/report', authenticate, authorize('admin'), async (req, res) => {
  try {
    await refreshOverdueStatuses();
    const summary = await get(
      `SELECT
         (SELECT COUNT(*) FROM books) AS totalBooks,
         (SELECT COUNT(*) FROM users WHERE role = 'user') AS totalUsers,
         (SELECT COUNT(*) FROM transactions WHERE status IN ('borrowed', 'overdue')) AS activeBorrowings,
         (SELECT COUNT(*) FROM transactions WHERE status = 'overdue') AS overdueBooks,
         (SELECT COALESCE(SUM(fine_amount), 0) FROM transactions WHERE fine_paid = 1) AS totalFineCollected`
    );

    const transactions = await all(
      `SELECT t.id, t.borrow_date, t.due_date, t.return_date, t.status, t.fine_amount, t.fine_paid,
              u.full_name AS user_name, u.username, u.email,
              b.title, b.author,
              (SELECT COUNT(*) FROM reminders r WHERE r.transaction_id = t.id) AS reminder_count
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       JOIN books b ON b.id = t.book_id
       ORDER BY t.id DESC`
    );

    return res.json({ summary, transactions, finePerDay: FINE_PER_DAY });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load report.' });
  }
});

app.get('/api/admin/users', authenticate, authorize('admin'), async (req, res) => {
  try {
    const users = await all(
      `SELECT u.id, u.username, u.full_name, u.email, u.created_at,
              COUNT(t.id) AS total_transactions,
              SUM(CASE WHEN t.status IN ('borrowed', 'overdue') THEN 1 ELSE 0 END) AS active_borrowings,
              COALESCE(SUM(t.fine_amount), 0) AS total_fines
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       WHERE u.role = 'user'
       GROUP BY u.id, u.username, u.full_name, u.email, u.created_at
       ORDER BY u.full_name ASC`
    );

    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load users.' });
  }
});

app.post('/api/admin/reminders', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { transactionId, message } = req.body;
    const transaction = await get(
      `SELECT t.*, u.full_name, u.email, b.title
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       JOIN books b ON b.id = t.book_id
       WHERE t.id = ?`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const reminderText = (message || `Reminder: Please return "${transaction.title}" by ${transaction.due_date}.`).trim();
    await run(
      `INSERT INTO reminders (transaction_id, user_id, book_id, message)
       VALUES (?, ?, ?, ?)`,
      [transaction.id, transaction.user_id, transaction.book_id, reminderText]
    );

    // Simulate sending email
    console.log(`[EMAIL SENT] To: ${transaction.email} | Subject: Library Reminder | Message: ${reminderText}`);

    return res.status(201).json({
      message: `Reminder recorded for ${transaction.full_name} (${transaction.email}).`,
      reminder: {
        transactionId: transaction.id,
        user: transaction.full_name,
        email: transaction.email,
        book: transaction.title,
        message: reminderText
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to send reminder.' });
  }
});

app.get('/api/admin/reminders', authenticate, authorize('admin'), async (req, res) => {
  try {
    const reminders = await all(
      `SELECT r.id, r.message, r.sent_at, u.full_name AS user_name, u.email, b.title
       FROM reminders r
       JOIN users u ON u.id = r.user_id
       JOIN books b ON b.id = r.book_id
       ORDER BY r.id DESC`
    );

    return res.json(reminders);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load reminders.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ message: 'A valid email address is required.' });
  }

  // Simulate sending reset link
  console.log(`[EMAIL SENT] To: ${email} | Subject: Password Reset Request | Message: Please click the link to reset your password.`);
  return res.json({ message: 'Password reset link has been sent to your email.' });
});

app.get('/api/health', async (_req, res) => {
  return res.json({ status: 'ok' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Endpoint not found.' });
  }
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initializeDatabase()
  .then(async () => {
    await refreshOverdueStatuses();
    app.listen(PORT, () => {
      console.log(`Smart Library server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  });
