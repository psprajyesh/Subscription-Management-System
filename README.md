# Brightloop Subscription Management System — frontend starter

## What is included
- React + Vite admin dashboard
- Responsive sidebar and header
- React Router navigation for all listed admin modules
- Dashboard KPI cards, revenue chart, subscription breakdown, and recent transactions
- Reusable components and a fetch helper for a future Express API

## Run locally
Open a terminal in the `frontend` folder:

```bash
npm install
npm run dev
```

Vite normally uses `http://localhost:5173`. If that port is occupied, it will select another port (for example `5174`). Open the exact Local URL printed in the terminal.

## Validate
```bash
npm run lint
npm run build
```

## Important
The dashboard currently uses clearly labelled sample preview data. The uploaded project ZIP did not contain backend routes, database models, authentication, or payment integration. Those features need to be implemented before this can be used with real customer or payment data.
