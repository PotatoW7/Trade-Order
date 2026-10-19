# Trade Order — Crypto Trading Terminal & Simulator

A real-time cryptocurrency charting, technical analysis, and paper trading web application integrated with the **Kraken Public API** and **WebSockets**. Designed with a clean, high-tech terminal interface, multiple timeframes, and robust risk management tools.

![Trade Order Preview](https://img.shields.io/badge/Status-Active-success)
![Tech Stack](https://img.shields.io/badge/Tech-HTML5_%7C_CSS3_%7C_JavaScript-blue)

---

## Features

- **Live Market Data:** Direct integration with Kraken REST API (OHLC/Ticker) and real-time streaming via WebSockets.
- **Advanced Charting:** Powered by TradingView *Lightweight Charts* supporting multiple timeframes (1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w).
- **Technical Indicators & AI Sensor:** 
  - RSI (Relative Strength Index)
  - EMA (Exponential Moving Averages 20 / 50)
  - Bollinger Bands & MACD
  - Candlestick pattern recognition and multi-timeframe trend scoring engine.
- **Paper Trading Simulator:** Mirror your virtual portfolio (EUR balance + coin holdings), test trading strategies with fake money, and track performance, fees, and realized/unrealized PnL.
- **Advanced Orders & Position Protection:** Limit orders, stop-loss, take-profit triggers, and automatic risk/reward calculations.
- **Bilingual Support:** Fully localized in Bulgarian (BG) and English (EN).

---

## Tech Stack

- **Frontend:** HTML5, Modern CSS (Flexbox / Grid, Custom Properties)
- **Scripting:** Vanilla JavaScript (ES6+)
- **APIs & Libraries:** 
  - [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)
  - Kraken Public REST & WebSocket API v2
  - Three.js (for cosmos background aesthetics)

---

## Quick Start / Installation

Since this is a client-side web application, no complex backend setup is required:

1. Clone the repository:
   ```bash
   git clone [https://github.com/PotatoW7/Trade-Order.git](https://github.com/PotatoW7/Trade-Order.git)
