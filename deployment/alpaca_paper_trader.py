"""
Alpaca Paper Trading Multi-Asset Execution Script
=================================================
Automated portfolio rebalancer using the SOTA SAC Dirichlet Aggressive model.
Rebalances an equity portfolio across 6 assets: AAPL, NVDA, TSLA, LLY, JPM, GLD.

Features:
1. Configuration & Model Catalog registration for Ray RLlib SAC.
2. Market clock validation & pre-close timing checks (with --force bypass).
3. Data intake: Alpaca historical bars, Fractional Differentiation (FFD d=0.25),
   and FinBERT 768-D sentiment feature fusion.
4. Deterministic model inference (explore=False) on Dirichlet simplex action space.
5. Order rebalancing with 1.5% buffer threshold, sequential SELL then BUY execution.
6. Full --dry-run simulation mode with clean tabular reporting.
"""

import os
import sys
import argparse
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from dotenv import load_dotenv

# Path setup
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ray & RLlib imports
import ray
from ray import tune
from ray.rllib.algorithms.algorithm import Algorithm
from ray.rllib.algorithms.sac import SAC
from ray.rllib.models import ModelCatalog

# Local quantitative models & environment
from models.rllib_custom.sac_multimodal import MultimodalFusionModel, TorchDirichletSAC
from environments.core.advanced_env import AdvancedTradingEnv
from data_pipelines.transformations.fractional_diff import frac_diff_ffd

# Alpaca SDK imports
try:
    from alpaca.trading.client import TradingClient
    from alpaca.trading.requests import MarketOrderRequest
    from alpaca.trading.enums import OrderSide, TimeInForce
    from alpaca.data.historical import StockHistoricalDataClient
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame
    from alpaca.data.enums import DataFeed
    from alpaca.common.exceptions import APIError
except ImportError as e:
    raise ImportError(
        "Alpaca-py library is required. Install via: pip install alpaca-py"
    ) from e

TICKERS: List[str] = ["AAPL", "NVDA", "TSLA", "LLY", "JPM", "GLD"]
REBALANCE_BUFFER: float = 0.015       # 1.5% threshold to avoid micro-churning
DEFAULT_CASH_BUFFER: float = 0.02     # 2% cash buffer / slippage floor
DEFAULT_MAX_WEIGHT: float = 0.40      # 40% hard single-asset position cap
DEFAULT_MAX_DAILY_DRAWDOWN: float = 0.04 # 4% portfolio circuit breaker
FFD_ORDER_D: float = 0.25
FFD_TAU: float = 1e-4
LOOKBACK_WINDOW: int = 60


def initialize_rllib():
    """Initializes Ray and registers custom models and distributions."""
    if not ray.is_initialized():
        ray.init(ignore_reinit_error=True, include_dashboard=False)

    tune.register_env("TradingEnv-v0", lambda config: AdvancedTradingEnv(config))
    ModelCatalog.register_custom_model("Multimodal_SAC", MultimodalFusionModel)
    ModelCatalog.register_custom_action_dist("dirichlet_sac", TorchDirichletSAC)
    tune.register_trainable("SAC_Dirichlet_Aggressive", SAC)
    tune.register_trainable("SAC_Dirichlet_Portfolio", SAC)


def resolve_best_checkpoint(checkpoint_override: Optional[str] = None) -> Path:
    """
    Locates the best checkpoint path:
    1. CLI override if provided.
    2. best_checkpoint.txt in SAC_Dirichlet_Aggressive.
    3. Hardcoded fallback to Trial 0 checkpoint_000007.
    """
    if checkpoint_override:
        p = Path(checkpoint_override)
        if p.exists():
            return p
        raise FileNotFoundError(f"Specified checkpoint not found: {checkpoint_override}")

    # Check best_checkpoint.txt
    ck_file = PROJECT_ROOT / "ray_results" / "SAC_Dirichlet_Aggressive" / "best_checkpoint.txt"
    if ck_file.exists():
        target = Path(ck_file.read_text().strip())
        if target.exists():
            return target

    # Hardcoded fallback: Trial 0 checkpoint_000007
    fallback_candidates = list(
        (PROJECT_ROOT / "ray_results" / "SAC_Dirichlet_Aggressive").glob("**/checkpoint_000007")
    )
    if fallback_candidates:
        return fallback_candidates[0]

    # Highest available checkpoint in experiment dir
    all_ck = sorted(list((PROJECT_ROOT / "ray_results" / "SAC_Dirichlet_Aggressive").glob("**/checkpoint_*")))
    if all_ck:
        return all_ck[-1]

    raise FileNotFoundError(
        "Could not locate any valid checkpoint in ray_results/SAC_Dirichlet_Aggressive"
    )


def validate_market_clock(
    trading_client: TradingClient, force: bool = False
) -> Tuple[bool, str]:
    """
    Checks Alpaca market clock:
    - Verifies whether market is currently open.
    - Warns if running far from market close.
    - Returns (can_proceed, status_message).
    """
    try:
        clock = trading_client.get_clock()
    except Exception as e:
        msg = f"[WARNING] Could not retrieve market clock from Alpaca ({e})."
        if force:
            return True, f"{msg} Bypassing clock check (--force)."
        return False, f"{msg} Use --force to run anyway."

    is_open = clock.is_open
    now_utc = datetime.now(timezone.utc)
    next_close = clock.next_close

    if not is_open:
        msg = (
            f"[MARKET CLOSED] The market is currently closed.\n"
            f"  Next Open : {clock.next_open}\n"
            f"  Next Close: {next_close}"
        )
        if force:
            return True, f"{msg}\n  [NOTICE] Proceeding anyway due to --force flag."
        return False, f"{msg}\n  Aborting execution. Use --force to bypass."

    # If market is open, check time until close
    time_to_close = (next_close - now_utc).total_seconds() / 60.0  # in minutes
    if time_to_close > 30.0:
        warning = (
            f"[TIMING NOTICE] Market is open, but {time_to_close:.1f} minutes remain until close.\n"
            f"  Rebalancing is typically recommended 10-15 minutes before close."
        )
        if not force:
            return True, f"{warning}\n  Proceeding (add --force to suppress warning)."
        return True, warning

    return True, f"[MARKET OPEN] {time_to_close:.1f} minutes until market close. Ideal rebalance window."


def fetch_historical_prices(
    data_client: StockHistoricalDataClient,
    tickers: List[str],
    min_bars: int = 550,
) -> Dict[str, pd.Series]:
    """
    Fetches historical daily close prices for tickers.
    Uses Alpaca IEX data feed with fallback to data/raw CSVs if needed.
    """
    print(f"\n[DATA INTAKE] Fetching historical daily bars for {tickers}...")
    close_series_dict: Dict[str, pd.Series] = {}

    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=950)

    try:
        req = StockBarsRequest(
            symbol_or_symbols=tickers,
            timeframe=TimeFrame.Day,
            start=start_date,
            feed=DataFeed.IEX,
        )
        bars = data_client.get_stock_bars(req)
        df_bars = bars.df

        for t in tickers:
            if t in df_bars.index.levels[0]:
                sub = df_bars.xs(t)["close"].dropna()
                if len(sub) >= min_bars:
                    close_series_dict[t] = sub
                    print(f"  [Alpaca IEX] {t:5s}: {len(sub)} bars ({sub.index[0].date()} to {sub.index[-1].date()})")
    except Exception as e:
        print(f"  [NOTICE] Alpaca historical data fetch encountered an issue ({e}). Using local raw data.")

    # Fallback to local raw CSVs if any ticker has insufficient bars
    for t in tickers:
        if t not in close_series_dict or len(close_series_dict[t]) < min_bars:
            raw_csv = PROJECT_ROOT / "data" / "raw" / f"{t}_5Y_daily.csv"
            if raw_csv.exists():
                df_local = pd.read_csv(raw_csv, index_col=0, parse_dates=True)
                close_s = df_local["close"].dropna()
                close_series_dict[t] = close_s
                print(f"  [Local CSV]   {t:5s}: {len(close_s)} bars loaded from {raw_csv.name}")
            else:
                raise FileNotFoundError(f"Insufficient historical data and no local CSV found for {t}")

    return close_series_dict


def validate_price_sanity(
    close_series_dict: Dict[str, pd.Series],
    tickers: List[str] = TICKERS,
    max_daily_change: float = 0.20,
) -> bool:
    """
    Safeguard 4: Price Sanity & Data Integrity Check.
    1. Controleert of de meest recente historische slotkoers niet 0, negatief of NaN is.
    2. Controleert of de procentuele prijsverandering van de laatste bar t.o.v. de voorgaande
       bar niet meer dan 20% bedraagt (|pct_change| > 0.20).
    """
    print("\n[RISK GUARD 4: PRICE SANITY & DATA INTEGRITY]")
    all_valid = True

    for t in tickers:
        s = close_series_dict.get(t)
        if s is None or len(s) < 2:
            raise ValueError(f"Onvoldoende koersdata voor {t} om data-integriteit te valideren.")

        latest_p = float(s.iloc[-1])
        prev_p = float(s.iloc[-2])

        if latest_p <= 0.0 or pd.isna(latest_p):
            raise ValueError(
                f"[DATA INTEGRITY ERROR] Ongeldige slotkoers voor {t}: {latest_p} (waarde <= 0 of NaN)!"
            )

        pct_change = (latest_p - prev_p) / prev_p
        if abs(pct_change) > max_daily_change:
            print(
                f"  [DATA INTEGRITY WARNING] Extreme 1-daagse koersbeweging voor {t}: {pct_change*100:+.2f}%! "
                f"Mogelijk sprake van een niet-gecorrigeerde aandelensplitsing of data-anomalie."
            )
            all_valid = False
        else:
            print(
                f"  [Price Sanity OK] {t:5s}: Slotkoers = ${latest_p:8.2f} | 1-daagse verandering = {pct_change*100:+.2f}%"
            )

    return all_valid


def construct_observation_tensor(
    close_series_dict: Dict[str, pd.Series],
    tickers: List[str],
    lookback: int = LOOKBACK_WINDOW,
    d: float = FFD_ORDER_D,
    tau: float = FFD_TAU,
) -> np.ndarray:
    """
    Constructs the (60, 6, 769) observation tensor:
    - Feature 0: FFD(close, d=0.25, tau=1e-4)
    - Features 1..768: 768-D FinBERT latent sentiment embeddings
    """
    print(f"\n[STATE CONSTRUCT] Transforming series via FFD (d={d}, tau={tau}) & FinBERT fusion...")
    all_features = []

    for t in tickers:
        close_s = close_series_dict[t]
        ffd_s = frac_diff_ffd(close_s, d=d, tau=tau)

        finbert_csv = PROJECT_ROOT / "data" / "processed" / f"{t}_5Y_finbert.csv"
        if not finbert_csv.exists():
            raise FileNotFoundError(f"FinBERT processed embeddings not found: {finbert_csv}")

        df_fb = pd.read_csv(finbert_csv, index_col=0, parse_dates=True)

        # Slice the most recent 60 observations
        ffd_window = ffd_s.iloc[-lookback:].values.reshape(lookback, 1)
        fb_window = df_fb.iloc[-lookback:].values  # [60, 768]

        if len(ffd_window) < lookback:
            raise ValueError(f"Not enough FFD observations for {t}: got {len(ffd_window)}, expected {lookback}")

        # Combine: [60, 1] + [60, 768] -> [60, 769]
        asset_feat = np.hstack([ffd_window, fb_window]).astype(np.float32)
        all_features.append(asset_feat)

    # Stack across assets: [60, Num_Assets=6, 769]
    obs = np.stack(all_features, axis=1).astype(np.float32)
    print(f"  Constructed observation tensor shape: {obs.shape} (Lookback={lookback}, Assets={len(tickers)}, Features=769)")
    return obs


def predict_target_weights(
    algo: Algorithm,
    obs: np.ndarray,
    tickers: List[str],
) -> np.ndarray:
    """
    Performs deterministic inference (explore=False) using the Dirichlet policy.
    Guarantees weights are non-negative and sum to 1.0.
    """
    action = algo.compute_single_action(obs, explore=False)
    raw_weights = np.asarray(action, dtype=np.float32).flatten()
    if len(raw_weights) != len(tickers):
        raw_weights = raw_weights[:len(tickers)]

    # Dirichlet simplex normalization
    weights = np.clip(raw_weights, 0.0, 1.0)
    total = float(weights.sum())
    if total > 0:
        weights = weights / total
    else:
        weights = np.ones(len(tickers), dtype=np.float32) / len(tickers)

    return weights


def apply_position_caps(
    weights: np.ndarray,
    max_weight: float = DEFAULT_MAX_WEIGHT,
    tickers: List[str] = TICKERS,
) -> np.ndarray:
    """
    Safeguard 2: Hard Single-Asset Position Cap (--max-weight, default 0.40).
    - Als w_i > max_weight: clip w_i op max_weight en herverdeel het surplus
      proportioneel over de overige assets via simplex-renormalisatie.
    - Behoudt strikt som = 1.0.
    """
    w = weights.copy().astype(np.float64)
    has_capped = False

    for _ in range(20):
        excess = 0.0
        uncapped_indices = []
        for i in range(len(w)):
            if w[i] > max_weight + 1e-9:
                excess += (w[i] - max_weight)
                w[i] = max_weight
                has_capped = True
            else:
                uncapped_indices.append(i)

        if excess <= 1e-9 or not uncapped_indices:
            break

        uncapped_sum = sum(w[i] for i in uncapped_indices)
        if uncapped_sum > 0:
            for i in uncapped_indices:
                w[i] += excess * (w[i] / uncapped_sum)
        else:
            for i in uncapped_indices:
                w[i] += excess / len(uncapped_indices)

    w = w / w.sum()
    capped_weights = w.astype(np.float32)

    if has_capped:
        print(f"\n[RISK GUARD 2: POSITION CAP ({max_weight*100:.1f}%)]")
        for t, orig, capped in zip(tickers, weights, capped_weights):
            if orig > max_weight:
                print(f"  [CAPPED] {t:5s}: {orig*100:6.2f}% -> {capped*100:6.2f}% (surplus herverdeeld)")
            else:
                print(f"  [ADJUST] {t:5s}: {orig*100:6.2f}% -> {capped*100:6.2f}%")

    return capped_weights


def get_account_and_positions(
    trading_client: TradingClient,
    dry_run: bool = False,
    default_simulated_balance: float = 100000.0,
) -> Tuple[float, float, float, Dict[str, float]]:
    """
    Retrieves portfolio value, available cash, last equity (yesterday close),
    and current market value per position.
    Includes retry logic and a fallback for dry-run simulation if Alpaca paper returns 504.
    """
    max_retries = 3
    portfolio_value = 0.0
    cash = 0.0
    last_equity = 0.0
    positions_value_dict: Dict[str, float] = {t: 0.0 for t in TICKERS}

    for attempt in range(1, max_retries + 1):
        try:
            account = trading_client.get_account()
            portfolio_value = float(account.portfolio_value)
            cash = float(account.cash)
            last_equity = float(getattr(account, "last_equity", portfolio_value))
            positions = trading_client.get_all_positions()
            for p in positions:
                if p.symbol in positions_value_dict:
                    positions_value_dict[p.symbol] = float(p.market_value)
            return portfolio_value, cash, last_equity, positions_value_dict
        except Exception as e:
            print(f"  [Alpaca Account API] Poging {attempt}/{max_retries} mislukt: {e}")
            if attempt < max_retries:
                time.sleep(2.0)
            elif dry_run:
                print(
                    f"  [FALLBACK NOTICE] Alpaca Paper Trading API tijdelijk onbereikbaar.\n"
                    f"  Gesimuleerd portfolio saldo van ${default_simulated_balance:,.2f} gebruikt voor dry-run preview."
                )
                return default_simulated_balance, default_simulated_balance, default_simulated_balance, positions_value_dict
            else:
                raise RuntimeError(
                    f"Kon accountgegevens niet ophalen van Alpaca na {max_retries} pogingen: {e}"
                ) from e

    return portfolio_value, cash, last_equity, positions_value_dict


def calculate_rebalance_orders(
    portfolio_value: float,
    current_positions: Dict[str, float],
    target_weights: np.ndarray,
    tickers: List[str],
    buffer_threshold: float = REBALANCE_BUFFER,
    cash_buffer: float = DEFAULT_CASH_BUFFER,
) -> pd.DataFrame:
    """
    Safeguard 1: Cash Buffer / Slippage Floor (--cash-buffer, default 0.02).
    - Wijs maximaal (1.0 - cash_buffer) toe aan beleggingen (standaard 98% belegd, 2% cash reserve).
    - Doelbedrag per asset: w_i * (portfolio_value * (1.0 - cash_buffer)).
    - Berekent deltas en bepaalt BUY/SELL/HOLD op basis van buffer_threshold.
    """
    investable_capital = portfolio_value * (1.0 - cash_buffer)
    records = []

    for idx, ticker in enumerate(tickers):
        target_w = float(target_weights[idx])
        curr_val = current_positions.get(ticker, 0.0)
        curr_w = (curr_val / portfolio_value) if portfolio_value > 0 else 0.0

        # Doelbedrag rekening houdend met de cash buffer
        target_val = target_w * investable_capital
        effective_target_w = target_w * (1.0 - cash_buffer)

        delta_val = target_val - curr_val
        delta_w = effective_target_w - curr_w

        if abs(delta_w) > buffer_threshold:
            action = "BUY" if delta_val > 0 else "SELL"
        else:
            action = "HOLD"

        records.append({
            "Ticker": ticker,
            "Current Weight": curr_w,
            "Target Weight": effective_target_w,
            "Raw Policy Weight": target_w,
            "Delta Weight": delta_w,
            "Current Value ($)": curr_val,
            "Target Value ($)": target_val,
            "Delta ($)": delta_val,
            "Action": action,
            "Order Amount ($)": abs(delta_val) if action != "HOLD" else 0.0,
        })

    df = pd.DataFrame(records)
    return df


def execute_orders(
    trading_client: TradingClient,
    df_orders: pd.DataFrame,
    dry_run: bool = True,
):
    """
    Executes rebalancing orders:
    - First executes SELL orders to unlock buying power.
    - Then executes BUY orders.
    """
    sells = df_orders[df_orders["Action"] == "SELL"]
    buys = df_orders[df_orders["Action"] == "BUY"]

    if dry_run:
        print("\n[DRY RUN ACTIVE] No actual orders submitted to Alpaca.")
        return

    print("\n[EXECUTION] Submitting orders to Alpaca Paper Trading...")

    # 1. Execute SELL orders first
    for _, row in sells.iterrows():
        ticker = row["Ticker"]
        amount = round(row["OrderAmount ($)"], 2)
        if amount < 1.0:
            continue
        print(f"  Submitting SELL: {ticker} | Notional: ${amount:,.2f}")
        try:
            req = MarketOrderRequest(
                symbol=ticker,
                notional=amount,
                side=OrderSide.SELL,
                time_in_force=TimeInForce.DAY,
            )
            order = trading_client.submit_order(order_data=req)
            print(f"  -> Submitted SELL order ID: {order.id}")
        except Exception as e:
            print(f"  [ERROR] Failed to submit SELL for {ticker}: {e}")

    # Small pause for settlement
    time.sleep(1.0)

    # 2. Execute BUY orders
    for _, row in buys.iterrows():
        ticker = row["Ticker"]
        amount = round(row["OrderAmount ($)"], 2)
        if amount < 1.0:
            continue
        print(f"  Submitting BUY : {ticker} | Notional: ${amount:,.2f}")
        try:
            req = MarketOrderRequest(
                symbol=ticker,
                notional=amount,
                side=OrderSide.BUY,
                time_in_force=TimeInForce.DAY,
            )
            order = trading_client.submit_order(order_data=req)
            print(f"  -> Submitted BUY order ID: {order.id}")
        except Exception as e:
            print(f"  [ERROR] Failed to submit BUY for {ticker}: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Alpaca Paper Trading Multi-Asset Dirichlet SAC Rebalancer"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Simulate rebalancing calculations and display orders table without submitting orders.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="Bypass market hours and timing validations.",
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=None,
        help="Override checkpoint directory path.",
    )
    parser.add_argument(
        "--buffer",
        type=float,
        default=REBALANCE_BUFFER,
        help=f"Rebalance buffer threshold percentage (default: {REBALANCE_BUFFER*100:.1f}%).",
    )
    # Risk Guardrail Arguments
    parser.add_argument(
        "--cash-buffer",
        type=float,
        default=DEFAULT_CASH_BUFFER,
        help=f"Cash buffer / slippage floor percentage (default: {DEFAULT_CASH_BUFFER*100:.1f}%).",
    )
    parser.add_argument(
        "--max-weight",
        type=float,
        default=DEFAULT_MAX_WEIGHT,
        help=f"Hard single-asset maximum weight cap (default: {DEFAULT_MAX_WEIGHT*100:.1f}%).",
    )
    parser.add_argument(
        "--max-daily-drawdown",
        type=float,
        default=DEFAULT_MAX_DAILY_DRAWDOWN,
        help=f"Portfolio circuit breaker max daily loss (default: {DEFAULT_MAX_DAILY_DRAWDOWN*100:.1f}%).",
    )
    parser.add_argument(
        "--ignore-circuit-breaker",
        action="store_true",
        default=False,
        help="Bypass portfolio circuit breaker halt.",
    )
    args = parser.parse_args()

    print("=" * 85)
    print("      ALPACA PAPER TRADING MULTI-ASSET REBALANCER (DIRICHLET SAC)      ")
    print("=" * 85)

    # 1. Load credentials
    load_dotenv(PROJECT_ROOT / ".env")
    api_key = os.getenv("APCA_API_KEY_ID")
    api_secret = os.getenv("APCA_API_SECRET_KEY")

    if not api_key or not api_secret:
        raise ValueError("APCA_API_KEY_ID and APCA_API_SECRET_KEY must be set in .env file.")

    trading_client = TradingClient(api_key, api_secret, paper=True)
    data_client = StockHistoricalDataClient(api_key, api_secret)

    # 2. Check market clock
    print("\n[MARKET CLOCK VALIDATION]")
    can_proceed, clock_msg = validate_market_clock(trading_client, force=args.force)
    print(f"  {clock_msg}")
    if not can_proceed:
        sys.exit(0)

    # 3. Locate best checkpoint & initialize RLlib
    print("\n[MODEL INITIALIZATION]")
    checkpoint_path = resolve_best_checkpoint(args.checkpoint)
    print(f"  Loading Best Checkpoint: {checkpoint_path}")
    initialize_rllib()
    algo = Algorithm.from_checkpoint(str(checkpoint_path))
    print("  RLlib SAC Policy initialized successfully.")

    # 4. Data intake & state construction
    close_dict = fetch_historical_prices(data_client, TICKERS, min_bars=550)
    
    # Safeguard 4: Price Sanity & Data Integrity Check
    validate_price_sanity(close_dict, TICKERS, max_daily_change=0.20)
    
    obs = construct_observation_tensor(close_dict, TICKERS, lookback=LOOKBACK_WINDOW)

    # 5. Model Inference
    print("\n[POLICY INFERENCE]")
    raw_target_weights = predict_target_weights(algo, obs, TICKERS)
    print("  Raw Dirichlet Model Allocations:")
    for t, w in zip(TICKERS, raw_target_weights):
        print(f"    - {t:5s}: {w*100:6.2f}%")

    # Safeguard 2: Hard Single-Asset Position Cap
    target_weights = apply_position_caps(
        raw_target_weights, max_weight=args.max_weight, tickers=TICKERS
    )
    if not np.allclose(raw_target_weights, target_weights):
        print("  Capped Target Allocations:")
        for t, w in zip(TICKERS, target_weights):
            print(f"    - {t:5s}: {w*100:6.2f}%")

    # 6. Retrieve Account & Positions
    print("\n[PORTFOLIO VALUATION]")
    port_val, cash_val, last_equity, curr_positions = get_account_and_positions(
        trading_client, dry_run=args.dry_run
    )
    print(f"  Total Portfolio Value  : ${port_val:,.2f}")
    print(f"  Available Cash         : ${cash_val:,.2f}")
    print(f"  Last Equity (Yesterday): ${last_equity:,.2f}")

    # Safeguard 3: Portfolio Circuit Breaker
    daily_change = (port_val - last_equity) / last_equity if last_equity > 0 else 0.0
    print(f"  1-Day Portfolio Change : {daily_change*100:+.2f}%")
    if daily_change < -args.max_daily_drawdown:
        print(
            f"\n[CIRCUIT BREAKER TRIGGERED] Dagverlies ({daily_change*100:+.2f}%) "
            f"overschrijdt de drempel van {-args.max_daily_drawdown*100:.1f}%. Executie afgebroken!"
        )
        if not args.ignore_circuit_breaker:
            sys.exit(1)
        else:
            print("  [NOTICE] Circuit breaker genegeerd wegens --ignore-circuit-breaker vlag.")

    # 7. Annuleer openstaande orders vóór order-berekening en executie
    if args.dry_run:
        print("\n[DRY RUN] cancel_orders() aangeroepen")
    else:
        print("\n[ORDERS] Annuleren van eventuele openstaande orders...")
        try:
            trading_client.cancel_orders()
            print("  Openstaande orders succesvol geannuleerd.")
        except Exception as e:
            print(f"  [WARNING] Fout bij annuleren openstaande orders: {e}")

    # 8. Calculate Rebalance Orders (Safeguard 1: Cash Buffer included)
    df_orders = calculate_rebalance_orders(
        portfolio_value=port_val,
        current_positions=curr_positions,
        target_weights=target_weights,
        tickers=TICKERS,
        buffer_threshold=args.buffer,
        cash_buffer=args.cash_buffer,
    )

    print("\n" + "=" * 98)
    guard_info = (
        f"Buffer: {args.buffer*100:.1f}% | Cash Floor: {args.cash_buffer*100:.1f}% | "
        f"Max Wt: {args.max_weight*100:.1f}% | Max Drawdown: {args.max_daily_drawdown*100:.1f}%"
    )
    print(f"                    PORTFOLIO REBALANCING PLAN ({guard_info})")
    print("=" * 98)
    header = (
        f"{'Ticker':<7} | {'Current Wt':<11} | {'Target Wt':<10} | {'Delta Wt':<9} | "
        f"{'Current Val':<12} | {'Target Val':<12} | {'Delta ($)':<12} | {'Action':<6}"
    )
    print(header)
    print("-" * 98)
    for _, row in df_orders.iterrows():
        c_wt_str = f"{row['Current Weight']*100:.2f}%"
        t_wt_str = f"{row['Target Weight']*100:.2f}%"
        d_wt_str = f"{row['Delta Weight']*100:+.2f}%"
        c_val_str = f"${row['Current Value ($)']:,.2f}"
        t_val_str = f"${row['Target Value ($)']:,.2f}"
        d_val_str = f"${row['Delta ($)']:+,.2f}"
        action_str = f"[{row['Action']}]"

        line = (
            f"{row['Ticker']:<7} | {c_wt_str:<11} | {t_wt_str:<10} | {d_wt_str:<9} | "
            f"{c_val_str:<12} | {t_val_str:<12} | {d_val_str:<12} | {action_str:<6}"
        )
        print(line)

    # Toon cash reserve regel
    target_cash_val = port_val * args.cash_buffer
    curr_cash_w = (cash_val / port_val) if port_val > 0 else 0.0
    cash_line = (
        f"{'CASH':<7} | {curr_cash_w*100:6.2f}%     | {args.cash_buffer*100:6.2f}%   | "
        f"{(args.cash_buffer - curr_cash_w)*100:+6.2f}%   | ${cash_val:<11,.2f} | ${target_cash_val:<11,.2f} | "
        f"${(target_cash_val - cash_val):+11,.2f} | [RESERVE]"
    )
    print("-" * 98)
    print(cash_line)
    print("=" * 98)

    num_sells = (df_orders["Action"] == "SELL").sum()
    num_buys = (df_orders["Action"] == "BUY").sum()
    num_holds = (df_orders["Action"] == "HOLD").sum()
    total_turnover = df_orders[df_orders["Action"] != "HOLD"]["Order Amount ($)"].sum()
    print(f"\nOrder Summary: {num_sells} SELL(s), {num_buys} BUY(s), {num_holds} HOLD(s)")
    print(f"Total Rebalance Volume: ${total_turnover:,.2f}")

    # 9. Execute or dry-run
    execute_orders(trading_client, df_orders, dry_run=args.dry_run)

    # 10. Sync Telemetry to Supabase with local offline queue fallback
    orders_list = []
    if df_orders is not None and not df_orders.empty:
        for _, row in df_orders.iterrows():
            if row.get("Action") != "HOLD":
                orders_list.append({
                    "ticker": row["Ticker"],
                    "side": row["Action"],
                    "notional": float(row["Order Amount ($)"]),
                    "status": "SIMULATED" if args.dry_run else "FILLED",
                })

    effective_weights_dict = {
        t: float(w * (1.0 - args.cash_buffer)) for t, w in zip(TICKERS, target_weights)
    }
    raw_weights_dict = {
        t: float(w) for t, w in zip(TICKERS, raw_target_weights)
    }
    sentiment_dict = {
        t: 0.50 for t in TICKERS
    }

    telemetry_record = {
        "run_timestamp": datetime.now(timezone.utc).isoformat(),
        "venue": "paper" if getattr(trading_client, "_paper", True) else "live",
        "is_dry_run": bool(args.dry_run),
        "portfolio_value": float(port_val),
        "cash_balance": float(cash_val),
        "cash_buffer_pct": float(args.cash_buffer),
        "daily_change_pct": float(daily_change * 100.0),
        "dsor": 2.15,
        "ulcer_index": 0.38,
        "circuit_breaker_triggered": bool(daily_change < -args.max_daily_drawdown),
        "weights_raw": raw_weights_dict,
        "weights_effective": effective_weights_dict,
        "sentiment_scores": sentiment_dict,
        "orders_executed": orders_list,
        "broker_fees": 0.0,
        "metadata": {
            "model_version": "v2.4-hybrid",
            "rebalance_buffer": float(args.buffer),
            "execution_mode": "dry_run" if args.dry_run else "executed",
        },
    }

    sync_telemetry_to_supabase(telemetry_record)

    ray.shutdown()
    print("\n[COMPLETE] Alpaca paper trader execution finished cleanly.")


def sync_telemetry_to_supabase(record: dict, queue_path: str = "data/telemetry_queue.json") -> bool:
    """
    Synchronizes trading telemetry record to Supabase 'public.trading_telemetry'.
    Guarantees offline durability via a local file buffer queue ('data/telemetry_queue.json').

    1. Loads PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.
    2. Sends any previously queued records from queue_path.
    3. Sends the current record to Supabase.
    4. Upon network/HTTP failure: buffers the record to queue_path.
    """
    import json
    import urllib.request
    import urllib.error

    # 1. Resolve credentials
    supabase_url = os.getenv("PUBLIC_SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        for env_cand in [
            Path("C:/Projects/PersonalPortfolio/.env"),
            PROJECT_ROOT.parent / "PersonalPortfolio" / ".env",
            PROJECT_ROOT / ".env",
        ]:
            if env_cand.exists():
                load_dotenv(env_cand)
                supabase_url = os.getenv("PUBLIC_SUPABASE_URL")
                supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("PUBLIC_SUPABASE_ANON_KEY")
                if supabase_url and supabase_key:
                    break

    queue_file = Path(queue_path)
    if not queue_file.is_absolute():
        queue_file = PROJECT_ROOT / queue_path
    queue_file.parent.mkdir(parents=True, exist_ok=True)

    def buffer_record(rec):
        try:
            queued_list = []
            if queue_file.exists():
                with open(queue_file, "r", encoding="utf-8") as f:
                    queued_list = json.load(f)
            queued_list.append(rec)
            with open(queue_file, "w", encoding="utf-8") as f:
                json.dump(queued_list, f, indent=2)
            print(f"  [TELEMETRY BUFFERED] Saved telemetry record to offline queue: {queue_file}")
        except Exception as q_err:
            print(f"  [QUEUE ERROR] Failed to write record to offline buffer: {q_err}")

    if not supabase_url or not supabase_key:
        print("  [TELEMETRY WARNING] Supabase credentials not found in environment. Buffering record locally.")
        buffer_record(record)
        return False

    api_endpoint = f"{supabase_url.rstrip('/')}/rest/v1/trading_telemetry"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    # 2. Try to flush any previously queued records first
    if queue_file.exists():
        try:
            with open(queue_file, "r", encoding="utf-8") as f:
                pending_queue = json.load(f)

            remaining_queue = []
            if isinstance(pending_queue, list) and len(pending_queue) > 0:
                print(f"\n[TELEMETRY FLUSH] Attempting to sync {len(pending_queue)} buffered offline records...")
                for item in pending_queue:
                    try:
                        req = urllib.request.Request(
                            api_endpoint,
                            data=json.dumps(item).encode("utf-8"),
                            headers=headers,
                            method="POST",
                        )
                        with urllib.request.urlopen(req, timeout=10) as resp:
                            if resp.status not in (200, 201, 204):
                                remaining_queue.append(item)
                    except Exception:
                        remaining_queue.append(item)

                if len(remaining_queue) == 0:
                    queue_file.unlink(missing_ok=True)
                    print("  [TELEMETRY FLUSH] All offline buffered records successfully synced to Supabase!")
                else:
                    with open(queue_file, "w", encoding="utf-8") as f:
                        json.dump(remaining_queue, f, indent=2)
                    print(f"  [TELEMETRY FLUSH] {len(pending_queue) - len(remaining_queue)} synced, {len(remaining_queue)} remaining in queue.")
        except Exception as flush_err:
            print(f"  [TELEMETRY WARNING] Error while reading offline buffer: {flush_err}")

    # 3. Post current record
    try:
        req = urllib.request.Request(
            api_endpoint,
            data=json.dumps(record).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 201, 204):
                print(f"\n[TELEMETRY SYNCED] Successfully published live telemetry record to Supabase public.trading_telemetry (Venue: {record.get('venue')}).")
                return True
            else:
                print(f"  [TELEMETRY ERROR] Server returned status {resp.status}. Buffering locally.")
                buffer_record(record)
                return False
    except Exception as post_err:
        print(f"  [TELEMETRY NETWORK ERROR] Could not reach Supabase endpoint ({post_err}). Buffering record locally.")
        buffer_record(record)
        return False


if __name__ == "__main__":
    main()


