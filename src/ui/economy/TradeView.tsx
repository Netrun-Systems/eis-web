import React, { useMemo } from 'react';
import { useSimulationStore } from '../../hooks/useSimulation';
import type { MarketState, TradeNegotiation } from '../../engine/types';

function MarketPriceChart({ market }: { market: MarketState }) {
  const prices = useMemo(() => {
    const entries: { name: string; price: number; supply: number; demand: number }[] = [];
    for (const [name, price] of market.prices) {
      entries.push({
        name,
        price,
        supply: market.supply.get(name) ?? 0,
        demand: market.demand.get(name) ?? 0,
      });
    }
    return entries.sort((a, b) => b.price - a.price).slice(0, 15);
  }, [market]);

  const maxPrice = Math.max(...prices.map(p => p.price), 1);

  return (
    <div className="space-y-1">
      {prices.map(item => (
        <div key={item.name} className="flex items-center gap-2 text-xs">
          <span className="text-eis-text-secondary w-32 truncate">{item.name}</span>
          <div className="flex-1 h-4 bg-eis-bg rounded overflow-hidden relative">
            <div
              className="h-full bg-eis-green/60 rounded"
              style={{ width: `${(item.price / maxPrice) * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-end pr-1 text-eis-text-muted">
              {item.price}g
            </span>
          </div>
          <span className="text-green-400 w-10 text-right">S:{Math.round(item.supply)}</span>
          <span className="text-orange-400 w-10 text-right">D:{Math.round(item.demand)}</span>
        </div>
      ))}
    </div>
  );
}

function NegotiationCard({ neg, world }: { neg: TradeNegotiation; world: { npcs: { id: string; name: string }[] } }) {
  const buyer = world.npcs.find(n => n.id === neg.buyerId);
  const seller = world.npcs.find(n => n.id === neg.sellerId);

  const gap = neg.askPrice - neg.bidPrice;
  const progress = neg.round / neg.maxRounds;

  return (
    <div className="eis-card py-2 px-3 mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-eis-text font-medium">
          {buyer?.name ?? '?'} ← {neg.item} ← {seller?.name ?? '?'}
        </span>
        <span className="text-xs text-eis-text-muted">Round {neg.round}/{neg.maxRounds}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-green-400">Bid: {neg.bidPrice}g</span>
        <div className="flex-1 h-2 bg-eis-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${gap <= 0 ? 'bg-green-500' : gap < 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="text-orange-400">Ask: {neg.askPrice}g</span>
      </div>
      {gap <= 0 && <span className="text-xs text-green-400 font-bold">DEAL!</span>}
    </div>
  );
}

export function TradeView() {
  const { world, tickCounter } = useSimulationStore();

  const markets = useMemo(() => world?.markets ?? [], [world, tickCounter]);
  const negotiations = useMemo(() => world?.activeNegotiations ?? [], [world, tickCounter]);

  const tradeEvents = useMemo(() => {
    if (!world) return [];
    return world.eventLog
      .filter(e =>
        e.type === 'trade_agreed' ||
        e.type === 'trade_failed' ||
        e.type === 'trade_negotiation',
      )
      .slice(-40);
  }, [world, tickCounter]);

  const recentTrades = useMemo(() => {
    if (!world) return [];
    const allRecords: { tick: number; buyerId: string; sellerId: string; item: string; price: number }[] = [];
    for (const market of markets) {
      allRecords.push(...market.tradeHistory.slice(-10));
    }
    return allRecords.sort((a, b) => b.tick - a.tick).slice(0, 20);
  }, [markets, tickCounter]);

  if (!world) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-eis-text">Advanced Economy</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Negotiations */}
        <div>
          <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
            Active Negotiations ({negotiations.filter(n => n.status === 'negotiating').length})
          </h3>
          <div className="max-h-80 overflow-y-auto">
            {negotiations.filter(n => n.status === 'negotiating').length === 0 ? (
              <div className="eis-card text-center text-eis-text-muted py-6 text-sm">
                No active trade negotiations.
              </div>
            ) : (
              negotiations
                .filter(n => n.status === 'negotiating')
                .map(neg => <NegotiationCard key={neg.id} neg={neg} world={world} />)
            )}
          </div>
        </div>

        {/* Market Prices */}
        <div>
          <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
            Market Prices ({markets.length} zones)
          </h3>
          {markets.length === 0 ? (
            <div className="eis-card text-center text-eis-text-muted py-6 text-sm">
              No market data yet. Wait for traders to interact.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-3">
              {markets.slice(0, 3).map(market => (
                <div key={market.locationId} className="eis-card">
                  <h4 className="text-xs font-mono text-eis-text-muted mb-2">{market.locationId}</h4>
                  <MarketPriceChart market={market} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent trade history */}
      <div>
        <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
          Recent Trades
        </h3>
        <div className="eis-card max-h-64 overflow-y-auto">
          {recentTrades.length === 0 ? (
            <p className="text-eis-text-muted text-sm">No trades completed yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-eis-text-muted border-b border-eis-border">
                  <th className="py-1 text-left">Tick</th>
                  <th className="py-1 text-left">Item</th>
                  <th className="py-1 text-left">Buyer</th>
                  <th className="py-1 text-left">Seller</th>
                  <th className="py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade, i) => {
                  const buyer = world.npcs.find(n => n.id === trade.buyerId);
                  const seller = world.npcs.find(n => n.id === trade.sellerId);
                  return (
                    <tr key={i} className="border-b border-eis-border/30">
                      <td className="py-1 text-eis-text-muted">{trade.tick}</td>
                      <td className="py-1 text-eis-text">{trade.item}</td>
                      <td className="py-1 text-green-400">{buyer?.name ?? trade.buyerId}</td>
                      <td className="py-1 text-orange-400">{seller?.name ?? trade.sellerId}</td>
                      <td className="py-1 text-right text-yellow-400">{trade.price}g</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Trade event log */}
      <div>
        <h3 className="text-sm font-semibold text-eis-text-secondary mb-2 uppercase tracking-wider">
          Trade Events
        </h3>
        <div className="eis-card max-h-64 overflow-y-auto space-y-1">
          {tradeEvents.map(event => (
            <div key={event.id} className="flex items-start gap-2 text-xs py-1 border-b border-eis-border/30">
              <span className="text-eis-text-muted w-14 shrink-0">T{event.tick}</span>
              <span className={`w-16 shrink-0 font-mono uppercase ${
                event.type === 'trade_agreed' ? 'text-green-400' :
                event.type === 'trade_failed' ? 'text-red-400' :
                'text-yellow-400'
              }`}>
                {event.type.replace('trade_', '')}
              </span>
              <span className="text-eis-text-secondary flex-1">{event.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-green-400">
            {tradeEvents.filter(e => e.type === 'trade_agreed').length}
          </div>
          <div className="text-xs text-eis-text-muted">Trades Completed</div>
        </div>
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-red-400">
            {tradeEvents.filter(e => e.type === 'trade_failed').length}
          </div>
          <div className="text-xs text-eis-text-muted">Trades Failed</div>
        </div>
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-yellow-400">
            {negotiations.filter(n => n.status === 'negotiating').length}
          </div>
          <div className="text-xs text-eis-text-muted">In Negotiation</div>
        </div>
        <div className="eis-card text-center">
          <div className="text-2xl font-bold text-eis-text">{markets.length}</div>
          <div className="text-xs text-eis-text-muted">Market Zones</div>
        </div>
      </div>
    </div>
  );
}
