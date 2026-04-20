# Smart Library Management System

A full-stack library management website built with HTML, CSS, JavaScript, Node.js, Express, and SQL using SQLite.

## Features
- Admin and user login with username and password
- User book search and borrowing flow
- User return flow with overdue fine calculation
- Admin book add, update, and remove actions
- Admin transaction reporting dashboard
- Admin reminder center for borrowed books
- SQL database with seeded demo accounts and starter books

## Tech Stack
- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express
- Database: SQLite (SQL)

## Demo Credentials
- Admin: `admin` / `admin123`
- User: `reader1` / `user123`

## Run Locally
1. Install dependencies
   `npm install`
2. Start the server
   `npm start`
3. Open in browser
   `http://localhost:3000`

## Project Structure
- `server.js` - Express server and API routes
- `server/db.js` - Database connection, schema, and seed data
- `public/index.html` - Main UI
- `public/styles.css` - Styling and responsive layout
- `public/app.js` - Frontend application logic
- `data/library.db` - SQLite database generated on first run
