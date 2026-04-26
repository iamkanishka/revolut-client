/**
 * @module cryptoexchange
 * Revolut X Crypto Exchange REST API — balances, orders, trades, market data.
 */

import {
  type ClientConfig,
  HttpClient,
  BASE_URLS,
  buildPath,
  assertRequired,
} from "../client/index.js";
import { ValidationError } from "../errors/index.js";
import type { ExchangeOrderSide, ExchangeOrderType, ExchangeOrderState } from "../types/index.js";

export class CryptoExchangeClient {
  readonly #http: HttpClient;

  constructor(config: ClientConfig) {
    const env = config.environment ?? "prod";
    this.#http = new HttpClient(config.baseURL ?? BASE_URLS.cryptoexchange[env], config);
  }

  // Balances
  async getBalances(): Promise<Balance[]> {
    return this.#http.get<Balance[]>("/crypto-exchange/balances");
  }

  // Orders
  async createOrder(req: CreateOrderRequest): Promise<Order> {
    if (!req.symbol) throw new ValidationError("symbol", "is required (e.g. BTC/USD)");
    if (!req.side) throw new ValidationError("side", "must be buy or sell");
    if (!req.type) throw new ValidationError("type", "must be market, limit, or tpsl");
    const configCount = [req.limit, req.market, req.tpsl].filter(Boolean).length;
    if (configCount !== 1)
      throw new ValidationError(
        "order_configuration",
        "exactly one of limit, market, or tpsl must be provided"
      );
    return this.#http.post<Order>("/crypto-exchange/orders", req);
  }

  async getActiveOrders(): Promise<Order[]> {
    return this.#http.get<Order[]>("/orders/active");
  }

  async getOrderHistory(req?: ListOrderHistoryRequest): Promise<Order[]> {
    return this.#http.get<Order[]>("/crypto-exchange/orders", {
      symbol: req?.symbol,
      state: req?.state,
      from: req?.from,
      to: req?.to,
      limit: req?.limit,
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    assertRequired(orderId, "orderId");
    return this.#http.delete<void>(buildPath("crypto-exchange/orders", orderId));
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    const req = symbol
      ? { method: "DELETE" as const, path: "/crypto-exchange/orders", query: { symbol } }
      : { method: "DELETE" as const, path: "/crypto-exchange/orders" };
    return this.#http.request<void>(req);
  }

  // Trades
  async getPublicTrades(symbol: string, limit?: number): Promise<Trade[]> {
    assertRequired(symbol, "symbol");
    return this.#http.get<Trade[]>("/crypto-exchange/trades", { symbol, limit });
  }

  async getMyTrades(symbol?: string, limit?: number): Promise<Trade[]> {
    return this.#http.get<Trade[]>("/crypto-exchange/trades/mine", { symbol, limit });
  }

  // Market data
  async getOrderBook(symbol: string, depth?: number): Promise<OrderBook> {
    assertRequired(symbol, "symbol");
    return this.#http.get<OrderBook>("/crypto-exchange/orderbook", { symbol, depth });
  }

  async getTicker(symbol: string): Promise<Ticker> {
    assertRequired(symbol, "symbol");
    return this.#http.get<Ticker>("/crypto-exchange/ticker", { symbol });
  }

  async getAllTickers(): Promise<Ticker[]> {
    return this.#http.get<Ticker[]>("/crypto-exchange/ticker");
  }

  async listSymbols(): Promise<Symbol[]> {
    return this.#http.get<Symbol[]>("/crypto-exchange/symbols");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Balance {
  readonly currency: string;
  readonly available: string;
  readonly staked: string;
  readonly reserved: string;
}

export interface LimitOrderConfig {
  readonly base_size: string;
  readonly price: string;
}

export interface MarketOrderConfig {
  readonly base_size?: string;
  readonly quote_size?: string;
}

export interface TPSLOrderConfig {
  readonly base_size: string;
  readonly take_profit_price?: string;
  readonly stop_loss_price?: string;
}

export interface CreateOrderRequest {
  readonly client_order_id?: string;
  readonly symbol: string;
  readonly side: ExchangeOrderSide;
  readonly type: ExchangeOrderType;
  readonly limit?: LimitOrderConfig;
  readonly market?: MarketOrderConfig;
  readonly tpsl?: TPSLOrderConfig;
}

export interface Order {
  readonly id: string;
  readonly client_order_id?: string;
  readonly symbol: string;
  readonly side: ExchangeOrderSide;
  readonly type: ExchangeOrderType;
  readonly state: ExchangeOrderState;
  readonly qty: string;
  readonly filled_qty?: string;
  readonly remaining_qty?: string;
  readonly price?: string;
  readonly avg_fill_price?: string;
  readonly fee?: string;
  readonly fee_currency?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ListOrderHistoryRequest {
  readonly symbol?: string;
  readonly state?: ExchangeOrderState;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface Trade {
  readonly id: string;
  readonly order_id?: string;
  readonly symbol: string;
  readonly side: ExchangeOrderSide;
  readonly price: string;
  readonly size: string;
  readonly fee?: string;
  readonly fee_currency?: string;
  readonly created_at: string;
}

export interface OrderBookEntry {
  readonly price: string;
  readonly size: string;
}

export interface OrderBook {
  readonly symbol: string;
  readonly bids: readonly OrderBookEntry[];
  readonly asks: readonly OrderBookEntry[];
  readonly timestamp?: string;
}

export interface Ticker {
  readonly symbol: string;
  readonly price: string;
  readonly change_24h: string;
  readonly volume_24h: string;
  readonly high_24h: string;
  readonly low_24h: string;
  readonly bid?: string;
  readonly ask?: string;
  readonly updated_at: string;
}

export interface Symbol {
  readonly name: string;
  readonly base_currency: string;
  readonly quote_currency: string;
  readonly min_base_size: string;
  readonly min_quote_size: string;
  readonly tick_size: string;
  readonly step_size: string;
  readonly status?: string;
}
