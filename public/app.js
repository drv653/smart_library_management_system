const state = {
  token: sessionStorage.getItem('library_token') || '',
  user: JSON.parse(sessionStorage.getItem('library_user') || 'null'),
  books: [],
  users: [],
  transactions: [],
  report: null,
  adminView: 'dashboard',
  authView: 'landing'
};

const elements = {
  guestLandingView: document.getElementById('guestLandingView'),
  navLoginBtn: document.getElementById('navLoginBtn'),
  heroGetStartedBtn: document.getElementById('heroGetStartedBtn'),
  pageShell: document.getElementById('pageShell'),
  heroPanel: document.getElementById('heroPanel'),
  loginView: document.getElementById('loginView'),
  dashboardView: document.getElementById('dashboardView'),
  userDashboard: document.getElementById('userDashboard'),
  adminDashboard: document.getElementById('adminDashboard'),
  adminUsersPage: document.getElementById('adminUsersPage'),
  adminTransactionsPage: document.getElementById('adminTransactionsPage'),
  roleLabel: document.getElementById('roleLabel'),
  welcomeText: document.getElementById('welcomeText'),
  statusText: document.getElementById('statusText'),
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  logoutBtn: document.getElementById('logoutBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  showUsersBtn: document.getElementById('showUsersBtn'),
  showTransactionsBtn: document.getElementById('showTransactionsBtn'),
  backToDashboardBtn: document.getElementById('backToDashboardBtn'),
  booksList: document.getElementById('booksList'),
  myTransactions: document.getElementById('myTransactions'),
  searchInput: document.getElementById('searchInput'),
  statsGrid: document.getElementById('statsGrid'),
  bookForm: document.getElementById('bookForm'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  adminBooksList: document.getElementById('adminBooksList'),
  adminSearchInput: document.getElementById('adminSearchInput'),
  userSearchInput: document.getElementById('userSearchInput'),
  paymentModalOverlay: document.getElementById('paymentModalOverlay'),
  closePaymentModalBtn: document.getElementById('closePaymentModalBtn'),
  paymentAmountDisplay: document.getElementById('paymentAmountDisplay'),
  paymentBookDisplay: document.getElementById('paymentBookDisplay'),
  confirmPaymentBtn: document.getElementById('confirmPaymentBtn'),
  payAllFinesBtn: document.getElementById('payAllFinesBtn'),
  usersList: document.getElementById('usersList'),
  reportTable: document.getElementById('reportTable'),
  toast: document.getElementById('toast')
};

let currentPaymentPendingId = null;

function showToast(message, isError = false) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.style.background = isError ? '#7c2d12' : '#143b38';
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 3200);
}

async function api(path, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
    },
    ...options
  };

  const response = await fetch(path, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }

  return data;
}

function persistAuth() {
  sessionStorage.setItem('library_token', state.token);
  sessionStorage.setItem('library_user', JSON.stringify(state.user));
}

function clearAuth() {
  state.token = '';
  state.user = null;
  state.adminView = 'dashboard';
  sessionStorage.removeItem('library_token');
  sessionStorage.removeItem('library_user');
}

function updateAdminView() {
  const isAdmin = state.user?.role === 'admin';
  if (!isAdmin) {
    return;
  }

  const showingUsers = state.adminView === 'users';
  const showingTransactions = state.adminView === 'transactions';
  const showingDashboard = state.adminView === 'dashboard';

  elements.adminDashboard.classList.toggle('hidden', !showingDashboard);
  elements.adminUsersPage.classList.toggle('hidden', !showingUsers);
  elements.adminTransactionsPage.classList.toggle('hidden', !showingTransactions);
  elements.showUsersBtn.classList.toggle('hidden', !showingDashboard);
  elements.showTransactionsBtn.classList.toggle('hidden', !showingDashboard);
  elements.backToDashboardBtn.classList.toggle('hidden', showingDashboard);
  elements.refreshBtn.classList.remove('hidden');
}

function setView() {
  const isLoggedIn = Boolean(state.token && state.user);
  
  if (isLoggedIn) {
    if (elements.guestLandingView) elements.guestLandingView.classList.add('hidden');
    elements.loginView.classList.add('hidden');
    elements.dashboardView.classList.remove('hidden');
    elements.pageShell.classList.remove('auth-layout', 'hidden');
    elements.pageShell.classList.add('app-layout');
    elements.heroPanel.classList.add('hidden');
  } else {
    elements.dashboardView.classList.add('hidden');
    elements.pageShell.classList.remove('app-layout');
    
    if (state.authView === 'landing' && elements.guestLandingView) {
      elements.guestLandingView.classList.remove('hidden');
      elements.pageShell.classList.add('hidden');
    } else {
      if (elements.guestLandingView) elements.guestLandingView.classList.add('hidden');
      elements.pageShell.classList.remove('hidden');
      elements.pageShell.classList.add('auth-layout');
      elements.loginView.classList.remove('hidden');
      elements.heroPanel.classList.remove('hidden');
    }
  }

  if (!isLoggedIn) {
    return;
  }

  const isAdmin = state.user.role === 'admin';
  elements.userDashboard.classList.toggle('hidden', isAdmin);
  elements.adminDashboard.classList.toggle('hidden', !isAdmin);
  elements.adminUsersPage.classList.add('hidden');
  elements.adminTransactionsPage.classList.add('hidden');
  elements.showUsersBtn.classList.toggle('hidden', !isAdmin);
  elements.showTransactionsBtn.classList.toggle('hidden', !isAdmin);
  elements.backToDashboardBtn.classList.add('hidden');
  if (state.user && state.user.role === 'admin') {
    elements.roleLabel.textContent = 'Administrator Workspace';
    elements.welcomeText.textContent = `Hello, ${state.user.fullName}`;
    if (state.adminView === 'dashboard') {
      elements.showTransactionsBtn.classList.remove('hidden');
      elements.showUsersBtn.classList.remove('hidden');
      elements.backToDashboardBtn.classList.add('hidden');
    } else {
      elements.showTransactionsBtn.classList.add('hidden');
      elements.showUsersBtn.classList.add('hidden');
      elements.backToDashboardBtn.classList.remove('hidden');
    }
    if (elements.payAllFinesBtn) elements.payAllFinesBtn.classList.add('hidden');
  } else if (state.user) {
    elements.roleLabel.textContent = 'Reader Workspace';
    elements.welcomeText.textContent = `Hello, ${state.user.fullName}`;
    elements.showTransactionsBtn.classList.add('hidden');
    elements.showUsersBtn.classList.add('hidden');
    elements.backToDashboardBtn.classList.add('hidden');
    if (elements.payAllFinesBtn) elements.payAllFinesBtn.classList.remove('hidden');
  }
  elements.statusText.textContent = isAdmin
    ? 'Manage the catalog from the dashboard and open the separate users or transactions page when you need more detail.'
    : 'Search books, borrow available titles, and keep an eye on due dates and return fines.';

  if (isAdmin) {
    updateAdminView();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusBadge(status) {
  const normalized = String(status || '').toLowerCase();
  const className = normalized === 'overdue'
    ? 'status-pill status-overdue'
    : normalized === 'returned'
      ? 'status-pill status-returned'
      : 'status-pill';
  return `<span class="${className}">${normalized}</span>`;
}

function renderBooks(books) {
  if (!books.length) {
    elements.booksList.innerHTML = '<p class="empty-state">No books matched your search.</p>';
    return;
  }

  elements.booksList.innerHTML = books.map((book) => `
    <article class="book-card">
      <span class="status-pill">${book.available_copies} of ${book.total_copies} available</span>
      <h4>${escapeHtml(book.title)}</h4>
      <div class="book-meta">${escapeHtml(book.author)} · ${escapeHtml(book.category)}</div>
      <div class="muted">ISBN: ${escapeHtml(book.isbn)}</div>
      <p>${escapeHtml(book.description || 'No description added yet.')}</p>
      <button class="btn btn-primary" data-borrow-id="${book.id}" ${book.available_copies < 1 ? 'disabled' : ''}>Borrow Book</button>
    </article>
  `).join('');
}

function renderUserTransactions(transactions) {
  let unpaidFineSum = 0;
  
  if (!transactions.length) {
    elements.myTransactions.innerHTML = '<p class="empty-state">No borrowings yet.</p>';
  } else {
    unpaidFineSum = transactions
      .filter(t => t.status === 'returned' && t.fine_amount > 0 && !t.fine_paid)
      .reduce((sum, t) => sum + t.fine_amount, 0);

    elements.myTransactions.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Book</th>
            <th>Borrowed</th>
            <th>Due</th>
            <th>Status</th>
            <th>Fine</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((item) => `
            <tr>
              <td><strong>${escapeHtml(item.title)}</strong><br /><span class="muted">${escapeHtml(item.author)}</span></td>
              <td>${escapeHtml(item.borrow_date)}</td>
              <td>${escapeHtml(item.due_date)}</td>
              <td>${statusBadge(item.status)}</td>
              <td>Rs. ${Number(item.fine_amount).toFixed(2)}${item.fine_paid ? ` <span class="status-pill">(Paid)</span>` : ''}</td>
              <td>
              <div class="button-row">
                ${item.status === 'returned' ? 'Completed' : '<span class="status-pill status-overdue" style="font-size: 0.75rem;">Return at Desk</span>'}
                ${(item.status === 'returned' && item.fine_amount > 0 && !item.fine_paid) ? `<button class="btn btn-primary" data-pay-fine-id="${item.id}" data-pay-amount="${item.fine_amount}" data-pay-title="${escapeHtml(item.title)}">Pay Fine</button>` : ''}
              </div>
            </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  if (elements.payAllFinesBtn) {
    elements.payAllFinesBtn.textContent = `Pay Fines (Rs. ${unpaidFineSum.toFixed(2)})`;
    elements.payAllFinesBtn.dataset.total = unpaidFineSum.toFixed(2);
  }
}

function renderStats(summary, finePerDay) {
  elements.statsGrid.innerHTML = [
    ['Total Books', summary.totalBooks],
    ['Library Users', summary.totalUsers],
    ['Active Borrowings', summary.activeBorrowings],
    ['Overdue Books', summary.overdueBooks],
    ['Fine / Day', `Rs. ${finePerDay}`],
    ['Fine Collected', `Rs. ${Number(summary.totalFineCollected).toFixed(2)}`]
  ].map(([label, value]) => `
    <article class="stat-card">
      <p>${label}</p>
      <h3>${value}</h3>
    </article>
  `).join('');
}

function renderAdminBooks(books) {
  if (!books.length) {
    elements.adminBooksList.innerHTML = '<p class="empty-state">No books found.</p>';
    return;
  }

  elements.adminBooksList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Copies</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${books.map((book) => `
          <tr>
            <td><strong>${escapeHtml(book.title)}</strong><br /><span class="muted">${escapeHtml(book.author)} · ${escapeHtml(book.isbn)}</span></td>
            <td>${escapeHtml(book.category)}</td>
            <td>${book.available_copies}/${book.total_copies}</td>
            <td>
              <div class="button-row">
                <button class="btn btn-secondary" data-edit-book="${book.id}">Edit</button>
                <button class="btn btn-danger" data-delete-book="${book.id}">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderUsers(users) {
  if (!elements.usersList) {
    return;
  }

  const searchTerm = (elements.userSearchInput?.value || '').trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!searchTerm) {
      return true;
    }

    return [user.full_name, user.username, user.email]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm);
  });

  if (!filteredUsers.length) {
    elements.usersList.innerHTML = '<p class="empty-state">No registered users matched your search.</p>';
    return;
  }

  elements.usersList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Username</th>
          <th>Email</th>
          <th>Borrowings</th>
          <th>Fines</th>
          <th>Joined</th>
        </tr>
      </thead>
      <tbody>
        ${filteredUsers.map((user) => `
          <tr>
            <td><strong>${escapeHtml(user.full_name)}</strong></td>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${Number(user.active_borrowings || 0)} active / ${Number(user.total_transactions || 0)} total</td>
            <td>Rs. ${Number(user.total_fines || 0).toFixed(2)}</td>
            <td>${escapeHtml(String(user.created_at || '').split(' ')[0])}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderReport(report) {
  if (!elements.reportTable) {
    return;
  }

  if (!report.transactions.length) {
    elements.reportTable.innerHTML = '<p class="empty-state">No transactions available yet.</p>';
    return;
  }

  elements.reportTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Book</th>
          <th>Borrowed</th>
          <th>Due</th>
          <th>Status</th>
          <th>Fine</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${report.transactions.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.user_name)}</strong><br /><span class="muted">${escapeHtml(item.email)}</span></td>
            <td><strong>${escapeHtml(item.title)}</strong><br /><span class="muted">${escapeHtml(item.author)}</span></td>
            <td>${escapeHtml(item.borrow_date)}</td>
            <td>${escapeHtml(item.due_date)}</td>
            <td>${statusBadge(item.status)}</td>
            <td>Rs. ${Number(item.fine_amount).toFixed(2)}${item.fine_paid ? ` <span class="status-pill">(Paid)</span>` : ''}</td>
            <td>
              <div class="button-row">
                ${item.status === 'returned' ? 'Closed' : `<button class="btn btn-secondary" data-admin-return="${item.id}">Mark Return</button>`}
                ${item.status !== 'returned' ? `<button class="btn btn-ghost" data-remind-id="${item.id}">Send Reminder</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function populateBookForm(book) {
  document.getElementById('bookId').value = book?.id || '';
  document.getElementById('bookTitle').value = book?.title || '';
  document.getElementById('bookAuthor').value = book?.author || '';
  document.getElementById('bookIsbn').value = book?.isbn || '';
  document.getElementById('bookCategory').value = book?.category || '';
  document.getElementById('bookCopies').value = book?.total_copies || 1;
  document.getElementById('bookDescription').value = book?.description || '';
}

async function loadBooks(search = '') {
  state.books = await api(`/api/books${search ? `?search=${encodeURIComponent(search)}` : ''}`);
  renderBooks(state.books);
  renderAdminBooks(state.books);
}

async function loadUserData() {
  const transactions = await api('/api/my-transactions');
  state.transactions = transactions;
  renderUserTransactions(transactions);
}

async function loadAdminData() {
  const [report, users] = await Promise.all([
    api('/api/admin/report'),
    api('/api/admin/users')
  ]);
  state.report = report;
  state.users = users;
  renderStats(report.summary, report.finePerDay);
  renderUsers(users);
  renderReport(report);
}

async function refreshDashboard() {
  if (!state.user) {
    return;
  }

  const searchTerm = state.user.role === 'admin'
    ? elements.adminSearchInput.value.trim()
    : elements.searchInput.value.trim();

  await loadBooks(searchTerm);
  if (state.user.role === 'admin') {
    await loadAdminData();
  } else {
    await loadUserData();
  }
}

async function login(username, password) {
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  state.token = data.token;
  state.user = data.user;
  state.adminView = 'dashboard';
  persistAuth();
  setView();
  await refreshDashboard();
}

async function registerUser(payload) {
  const data = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  state.token = data.token;
  state.user = data.user;
  state.adminView = 'dashboard';
  persistAuth();
  setView();
  await refreshDashboard();
  return data;
}

async function handleBorrow(bookId) {
  await api('/api/borrow', {
    method: 'POST',
    body: JSON.stringify({ bookId })
  });
  showToast('Book borrowed successfully.');
  await refreshDashboard();
}

async function handleReturn(transactionId) {
  const response = await api(`/api/returns/${transactionId}`, { method: 'POST' });
  showToast(response.message);
  await refreshDashboard();
}

function handlePayFine(transactionId, amount, title) {
  currentPaymentPendingId = transactionId;
  elements.paymentAmountDisplay.textContent = `Rs. ${Number(amount).toFixed(2)}`;
  elements.paymentBookDisplay.textContent = title;
  elements.paymentModalOverlay.classList.remove('hidden');
}

async function confirmPayment() {
  if (!currentPaymentPendingId) return;
  const originalHtml = elements.confirmPaymentBtn.innerHTML;
  elements.confirmPaymentBtn.innerHTML = 'Processing...';
  elements.confirmPaymentBtn.disabled = true;

  try {
    let endpoint = `/api/pay-fine/${currentPaymentPendingId}`;
    if (currentPaymentPendingId === 'ALL') {
      endpoint = '/api/pay-all-fines';
    }
    
    const response = await api(endpoint, { method: 'POST' });
    showToast(response.message);
    elements.paymentModalOverlay.classList.add('hidden');
    currentPaymentPendingId = null;
    await refreshDashboard();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    elements.confirmPaymentBtn.innerHTML = originalHtml;
    elements.confirmPaymentBtn.disabled = false;
  }
}

async function handleSendReminder(transactionId) {
  const response = await api('/api/admin/reminders', {
    method: 'POST',
    body: JSON.stringify({ transactionId })
  });
  showToast('Warning Email successfully sent to user.');
}

async function handleBookSave(event) {
  event.preventDefault();
  const payload = {
    title: document.getElementById('bookTitle').value,
    author: document.getElementById('bookAuthor').value,
    isbn: document.getElementById('bookIsbn').value,
    category: document.getElementById('bookCategory').value,
    totalCopies: Number(document.getElementById('bookCopies').value),
    description: document.getElementById('bookDescription').value
  };

  const bookId = document.getElementById('bookId').value;
  const method = bookId ? 'PUT' : 'POST';
  const path = bookId ? `/api/books/${bookId}` : '/api/books';

  await api(path, {
    method,
    body: JSON.stringify(payload)
  });

  populateBookForm(null);
  showToast(bookId ? 'Book updated successfully.' : 'Book added successfully.');
  await refreshDashboard();
}

async function handleDeleteBook(bookId) {
  await api(`/api/books/${bookId}`, { method: 'DELETE' });
  showToast('Book removed successfully.');
  await refreshDashboard();
}

function bindEvents() {
  if (elements.navLoginBtn) {
    elements.navLoginBtn.addEventListener('click', () => {
      state.authView = 'login';
      setView();
    });
  }

  if (elements.heroGetStartedBtn) {
    elements.heroGetStartedBtn.addEventListener('click', () => {
      state.authView = 'login';
      setView();
    });
  }

  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      const email = prompt('Enter your email to receive a password reset link:');
      if (!email) return;
      try {
        const response = await api('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        showToast(response.message);
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await login(document.getElementById('username').value, document.getElementById('password').value);
      showToast('Login successful.');
      elements.loginForm.reset();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  if (elements.registerForm) {
    elements.registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await registerUser({
          fullName: document.getElementById('registerFullName').value,
          username: document.getElementById('registerUsername').value,
          email: document.getElementById('registerEmail').value,
          password: document.getElementById('registerPassword').value
        });
        showToast('Account created successfully.');
        elements.registerForm.reset();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  elements.logoutBtn.addEventListener('click', () => {
    clearAuth();
    setView();
    showToast('You have been logged out.');
  });

  elements.refreshBtn.addEventListener('click', async () => {
    try {
      await refreshDashboard();
      showToast('Dashboard refreshed.');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  if (elements.showUsersBtn) {
    elements.showUsersBtn.addEventListener('click', () => {
      state.adminView = 'users';
      updateAdminView();
      renderUsers(state.users);
    });
  }

  if (elements.showTransactionsBtn) {
    elements.showTransactionsBtn.addEventListener('click', () => {
      state.adminView = 'transactions';
      updateAdminView();
      renderReport(state.report || { transactions: [] });
    });
  }

  if (elements.backToDashboardBtn) {
    elements.backToDashboardBtn.addEventListener('click', () => {
      state.adminView = 'dashboard';
      updateAdminView();
    });
  }

  elements.searchInput.addEventListener('input', async (event) => {
    try {
      await loadBooks(event.target.value.trim());
    } catch (error) {
      showToast(error.message, true);
    }
  });

  elements.adminSearchInput.addEventListener('input', async (event) => {
    try {
      await loadBooks(event.target.value.trim());
    } catch (error) {
      showToast(error.message, true);
    }
  });

  if (elements.userSearchInput) {
    elements.userSearchInput.addEventListener('input', () => {
      renderUsers(state.users);
    });
  }

  elements.booksList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-borrow-id]');
    if (!button) return;
    try {
      await handleBorrow(Number(button.dataset.borrowId));
    } catch (error) {
      showToast(error.message, true);
    }
  });

  elements.myTransactions.addEventListener('click', async (event) => {
    const returnBtn = event.target.closest('[data-return-id]');
    const payFineBtn = event.target.closest('[data-pay-fine-id]');
    
    try {
      if (returnBtn) {
        await handleReturn(Number(returnBtn.dataset.returnId));
      }
      if (payFineBtn) {
        handlePayFine(
          Number(payFineBtn.dataset.payFineId), 
          payFineBtn.dataset.payAmount,
          payFineBtn.dataset.payTitle
        );
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });

  if (elements.paymentModalOverlay) {
    if (elements.payAllFinesBtn) {
      elements.payAllFinesBtn.addEventListener('click', () => {
        const total = elements.payAllFinesBtn.dataset.total || '0.00';
        handlePayFine('ALL', total, 'All Outstanding Books');
      });
    }

    elements.closePaymentModalBtn.addEventListener('click', () => {
      elements.paymentModalOverlay.classList.add('hidden');
      currentPaymentPendingId = null;
    });

    elements.confirmPaymentBtn.addEventListener('click', async () => {
      await confirmPayment();
    });
  }

  if (elements.reportTable) {
    elements.reportTable.addEventListener('click', async (event) => {
      const returnBtn = event.target.closest('[data-admin-return]');
      const remindBtn = event.target.closest('[data-remind-id]');
      
      try {
        if (returnBtn) {
          await handleReturn(Number(returnBtn.dataset.adminReturn));
        }
        if (remindBtn) {
          await handleSendReminder(Number(remindBtn.dataset.remindId));
        }
      } catch (error) {
        showToast(error.message, true);
      }
    });
  }

  elements.bookForm.addEventListener('submit', async (event) => {
    try {
      await handleBookSave(event);
    } catch (error) {
      showToast(error.message, true);
    }
  });

  elements.cancelEditBtn.addEventListener('click', () => {
    populateBookForm(null);
  });

  elements.adminBooksList.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit-book]');
    const deleteButton = event.target.closest('[data-delete-book]');

    try {
      if (editButton) {
        const book = state.books.find((item) => item.id === Number(editButton.dataset.editBook));
        populateBookForm(book);
      }

      if (deleteButton) {
        await handleDeleteBook(Number(deleteButton.dataset.deleteBook));
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function bootstrap() {
  bindEvents();
  setView();
  populateBookForm(null);

  if (state.token && state.user) {
    try {
      await refreshDashboard();
    } catch (error) {
      clearAuth();
      setView();
      showToast('Your session expired. Please login again.', true);
    }
  }
}

bootstrap();

