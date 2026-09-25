# stockX

stockX is a Next.js stock exchange interface for trading digital assets. It includes TradingView widgets for market charts and Reown AppKit for wallet connectivity on Arc and Arc Testnet.

## Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/RedRedRyan/stockX.git
cd stockX
```

### 2. Install dependencies

```bash
npm install --legacy-peer-deps
```

### 3. Configure your project ID

Create a project at [dashboard.reown.com](https://dashboard.reown.com) and copy its project ID. Then create a file named `.env.local` in the project root:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

The project ID must be a valid 32-character value. Do not commit `.env.local` or expose private credentials in the repository.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` starts the local development server.
- `npm run build` creates a production build.
- `npm run start` starts the production server.
- `npm run lint` runs ESLint.

## Technology

- Next.js and React
- TradingView widgets for market data and charts
- Reown AppKit and Wagmi for wallet connectivity
- Arc and Arc Testnet network support
