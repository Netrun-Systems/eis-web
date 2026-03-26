// ============================================================
// EIS Advanced Economy System
// Multi-tick trade negotiation, per-location markets with
// supply/demand pricing, personality-driven haggling.
// Replaces the original shallow random-swap trade.
// ============================================================

import type {
  NPC,
  WorldState,
  SimulationEvent,
  System,
  MarketState,
  TradeNegotiation,
  TradeRecord,
} from '../types';
import { evolveTrust } from './relationship-system';

// --- Helpers ---

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get a location-based market ID for an NPC based on their position.
 * Tiles are grouped into market zones of ~100px radius.
 */
function getMarketZone(pos: { x: number; y: number }): string {
  const zx = Math.floor(pos.x / 100);
  const zy = Math.floor(pos.y / 100);
  return `market-${zx}-${zy}`;
}

function getOrCreateMarket(world: WorldState, locationId: string): MarketState {
  if (!world.markets) world.markets = [];

  let market = world.markets.find(m => m.locationId === locationId);
  if (!market) {
    market = {
      locationId,
      prices: new Map(),
      supply: new Map(),
      demand: new Map(),
      tradeHistory: [],
    };

    // Initialize base prices for known items
    for (const item of world.items) {
      market.prices.set(item.name, item.value);
      market.supply.set(item.name, 10); // Base supply
      market.demand.set(item.name, 5);  // Base demand
    }

    world.markets.push(market);
  }

  return market;
}

/**
 * Scarcity modifier based on biome area.
 * Desert = less food, forest = more lumber, etc.
 */
function getBiomeScarcityModifier(marketId: string, itemName: string): number {
  const lower = itemName.toLowerCase();
  // Extract zone coords
  const parts = marketId.split('-');
  const zx = parseInt(parts[1] ?? '0');
  const zy = parseInt(parts[2] ?? '0');

  // Rough biome mapping based on WorldMap zones
  const isDesert = zx >= 4 && zy >= 3;
  const isForest = zx <= 2 && zy <= 2;
  const isRuins = zx >= 6;

  if (isDesert) {
    if (lower.includes('bread') || lower.includes('food') || lower.includes('berry') || lower.includes('apple')) {
      return 1.8; // Food scarce in desert
    }
  }
  if (isForest) {
    if (lower.includes('lumber') || lower.includes('herb') || lower.includes('berry')) {
      return 0.6; // Abundant in forest
    }
  }
  if (isRuins) {
    if (lower.includes('data') || lower.includes('device') || lower.includes('tool')) {
      return 0.7; // Tech more common in ruins
    }
  }

  return 1.0;
}

/**
 * Update market prices based on supply/demand dynamics.
 */
function updateMarketPrices(market: MarketState, world: WorldState): void {
  for (const item of world.items) {
    const supply = market.supply.get(item.name) ?? 10;
    const demand = market.demand.get(item.name) ?? 5;
    const biomeMod = getBiomeScarcityModifier(market.locationId, item.name);

    // Price = baseValue * (demand / supply) * biomeScarcity
    const ratio = Math.max(0.2, Math.min(5, demand / Math.max(1, supply)));
    const newPrice = Math.round(item.value * ratio * biomeMod);
    market.prices.set(item.name, Math.max(1, newPrice));

    // Slow supply regeneration and demand decay
    market.supply.set(item.name, Math.min(50, supply + 0.1));
    market.demand.set(item.name, Math.max(1, demand * 0.98));
  }
}

// --- Negotiation Logic ---

function startNegotiation(
  buyer: NPC,
  seller: NPC,
  item: string,
  market: MarketState,
  world: WorldState,
): TradeNegotiation | null {
  const marketPrice = market.prices.get(item) ?? 5;

  // Seller's ask: market price * (1 + greed/10) adjusted by rarity
  const sellerGreed = seller.personality.greed / 10;
  const askPrice = Math.round(marketPrice * (1 + sellerGreed * 0.5));

  // Buyer's bid: market price * (1 - greed/10 + generosity/10) adjusted by need urgency
  const buyerNeedUrgency = (buyer.needs.hunger + buyer.needs.thirst) / 200; // 0-1
  const bidPrice = Math.round(
    marketPrice * (0.7 + buyer.personality.generosity / 20 + buyerNeedUrgency * 0.3),
  );

  // Max negotiation rounds based on minimum patience
  const maxRounds = Math.max(2, Math.min(8, Math.floor((buyer.personality.patience + seller.personality.patience) / 4)));

  // Don't bother if gap is too large
  if (bidPrice * 2 < askPrice) return null;

  // Check if buyer can afford
  if (buyer.gold < bidPrice) return null;

  const neg: TradeNegotiation = {
    id: `neg-${world.tickCount}-${buyer.id}-${seller.id}`,
    buyerId: buyer.id,
    sellerId: seller.id,
    item,
    askPrice,
    bidPrice,
    round: 0,
    maxRounds,
    status: 'negotiating',
  };

  return neg;
}

function advanceNegotiation(neg: TradeNegotiation, world: WorldState): boolean {
  const buyer = world.npcs.find(n => n.id === neg.buyerId);
  const seller = world.npcs.find(n => n.id === neg.sellerId);
  if (!buyer || !seller) {
    neg.status = 'failed';
    return false;
  }

  neg.round++;

  // Seller drops ask based on patience
  const sellerDrop = seller.personality.patience / 20 + (seller.attributes.charisma / 20);
  neg.askPrice = Math.round(neg.askPrice * (1 - sellerDrop * 0.05));

  // Buyer raises bid based on patience and need
  const buyerRaise = buyer.personality.patience / 20 + (buyer.needs.hunger / 200);
  neg.bidPrice = Math.round(neg.bidPrice * (1 + buyerRaise * 0.05));

  // Charisma bonus: shifts midpoint in favor
  const charismaAdvantage = (buyer.attributes.charisma - seller.attributes.charisma) / 10;
  if (charismaAdvantage > 0) {
    neg.askPrice = Math.round(neg.askPrice * (1 - charismaAdvantage * 0.03));
  } else {
    neg.bidPrice = Math.round(neg.bidPrice * (1 + charismaAdvantage * 0.03));
  }

  // Bartering skill bonus
  const buyerBarter = buyer.skills.get('Bartering') ?? buyer.skills.get('Skill_Bartering') ?? 0;
  const sellerBarter = seller.skills.get('Bartering') ?? seller.skills.get('Skill_Bartering') ?? 0;
  neg.bidPrice += Math.round(buyerBarter * 0.3);
  neg.askPrice -= Math.round(sellerBarter * 0.3);

  // Ensure ask doesn't go below 1
  neg.askPrice = Math.max(1, neg.askPrice);
  neg.bidPrice = Math.max(1, neg.bidPrice);

  // Check if deal is reached
  if (neg.bidPrice >= neg.askPrice) {
    neg.status = 'agreed';
    return true;
  }

  // Check if out of rounds
  if (neg.round >= neg.maxRounds) {
    neg.status = 'walked_away';
    return false;
  }

  return false; // Still negotiating
}

function executeTrade(
  neg: TradeNegotiation,
  world: WorldState,
): SimulationEvent | null {
  const buyer = world.npcs.find(n => n.id === neg.buyerId);
  const seller = world.npcs.find(n => n.id === neg.sellerId);
  if (!buyer || !seller) return null;

  const finalPrice = Math.round((neg.askPrice + neg.bidPrice) / 2);

  // Check buyer can still afford
  if (buyer.gold < finalPrice) {
    neg.status = 'failed';
    return null;
  }

  // Check seller still has item
  const itemIdx = seller.inventory.findIndex(i => i === neg.item);
  if (itemIdx === -1) {
    neg.status = 'failed';
    return null;
  }

  // Execute exchange
  seller.inventory.splice(itemIdx, 1);
  buyer.inventory.push(neg.item);
  buyer.gold -= finalPrice;
  seller.gold += finalPrice;

  // Update market supply/demand
  const marketId = getMarketZone(buyer.position);
  const market = getOrCreateMarket(world, marketId);
  const currentSupply = market.supply.get(neg.item) ?? 10;
  const currentDemand = market.demand.get(neg.item) ?? 5;
  market.supply.set(neg.item, Math.max(0, currentSupply - 1));
  market.demand.set(neg.item, currentDemand + 1);

  // Record trade
  const record: TradeRecord = {
    tick: world.tickCount,
    buyerId: buyer.id,
    sellerId: seller.id,
    item: neg.item,
    price: finalPrice,
    locationId: marketId,
  };
  market.tradeHistory.push(record);
  if (market.tradeHistory.length > 100) {
    market.tradeHistory = market.tradeHistory.slice(-100);
  }

  // Relationship impact: fair trade improves trust
  const itemData = world.items.find(i => i.name === neg.item);
  const fairValue = itemData?.value ?? 5;
  const priceFairness = Math.abs(finalPrice - fairValue) / fairValue;

  if (priceFairness < 0.3) {
    // Fair trade
    evolveTrust(buyer, seller, 'PositiveInteraction', world);
  } else if (priceFairness > 0.7) {
    // Ripoff
    evolveTrust(buyer, seller, 'NegativeInteraction', world);
  }

  return {
    id: `trade-agreed-${world.tickCount}-${buyer.id}-${seller.id}`,
    tick: world.tickCount,
    gameTime: world.time,
    type: 'trade_agreed',
    actorId: buyer.id,
    targetId: seller.id,
    description: `${buyer.name} bought ${neg.item} from ${seller.name} for ${finalPrice}g (after ${neg.round} rounds)`,
    data: {
      item: neg.item,
      price: finalPrice,
      rounds: neg.round,
      askPrice: neg.askPrice,
      bidPrice: neg.bidPrice,
      buyerGold: buyer.gold,
      sellerGold: seller.gold,
    },
  };
}

// --- Economy System ---

export const economySystem: System = {
  name: 'EconomySystem',
  tick(world: WorldState, deltaTime: number): SimulationEvent[] {
    const events: SimulationEvent[] = [];

    if (!world.markets) world.markets = [];
    if (!world.activeNegotiations) world.activeNegotiations = [];

    // 1. Update market prices (every 20 ticks)
    if (world.tickCount % 20 === 0) {
      for (const market of world.markets) {
        updateMarketPrices(market, world);
      }
    }

    // 2. Advance active negotiations
    const completedNegs: string[] = [];
    for (const neg of world.activeNegotiations) {
      if (neg.status !== 'negotiating') {
        completedNegs.push(neg.id);
        continue;
      }

      const agreed = advanceNegotiation(neg, world);
      if (agreed) {
        const tradeEvent = executeTrade(neg, world);
        if (tradeEvent) events.push(tradeEvent);
        completedNegs.push(neg.id);
      } else if ((neg.status as string) === 'walked_away' || (neg.status as string) === 'failed') {
        const buyer = world.npcs.find(n => n.id === neg.buyerId);
        const seller = world.npcs.find(n => n.id === neg.sellerId);
        events.push({
          id: `trade-failed-${world.tickCount}-${neg.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'trade_failed',
          actorId: neg.buyerId,
          targetId: neg.sellerId,
          description: `Trade negotiation failed: ${buyer?.name ?? neg.buyerId} and ${seller?.name ?? neg.sellerId} couldn't agree on ${neg.item} (ask: ${neg.askPrice}g, bid: ${neg.bidPrice}g)`,
          data: {
            item: neg.item,
            askPrice: neg.askPrice,
            bidPrice: neg.bidPrice,
            rounds: neg.round,
          },
        });
        completedNegs.push(neg.id);
      } else {
        // Still negotiating — emit event
        const buyer = world.npcs.find(n => n.id === neg.buyerId);
        const seller = world.npcs.find(n => n.id === neg.sellerId);
        events.push({
          id: `trade-neg-${world.tickCount}-${neg.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'trade_negotiation',
          actorId: neg.buyerId,
          targetId: neg.sellerId,
          description: `${buyer?.name ?? neg.buyerId} negotiates with ${seller?.name ?? neg.sellerId} for ${neg.item} (ask: ${neg.askPrice}g, bid: ${neg.bidPrice}g, round ${neg.round}/${neg.maxRounds})`,
          data: {
            item: neg.item,
            askPrice: neg.askPrice,
            bidPrice: neg.bidPrice,
            round: neg.round,
            maxRounds: neg.maxRounds,
          },
        });
      }
    }

    // Clean up completed negotiations
    world.activeNegotiations = world.activeNegotiations.filter(
      n => !completedNegs.includes(n.id),
    );

    // 3. Start new trade negotiations (every 5 ticks)
    if (world.tickCount % 5 !== 0) return events;

    // Find traders
    const traders = world.npcs.filter(npc => {
      if (npc.isDowned || npc.isInCombat) return false;
      // Active traders or NPCs near market areas
      return npc.currentBehavior === 'Trade' ||
        (npc.inventory.length > 2 && world.rng.next() < 0.08);
    });

    for (const trader of traders) {
      // Already negotiating?
      if (world.activeNegotiations.some(n => n.buyerId === trader.id || n.sellerId === trader.id)) {
        continue;
      }

      // Find nearby potential partners
      const nearby = world.npcs.filter(other => {
        if (other.id === trader.id) return false;
        if (other.isDowned || other.isInCombat) return false;
        if (other.inventory.length === 0) return false;
        return dist(trader.position, other.position) < 8;
      });

      if (nearby.length === 0) continue;
      const partner = nearby[world.rng.nextInt(0, nearby.length - 1)];

      // Already negotiating?
      if (world.activeNegotiations.some(
        n => n.buyerId === partner.id || n.sellerId === partner.id,
      )) {
        continue;
      }

      // Pick an item to trade
      if (partner.inventory.length === 0) continue;
      const itemIdx = world.rng.nextInt(0, partner.inventory.length - 1);
      const itemName = partner.inventory[itemIdx];

      const marketId = getMarketZone(trader.position);
      const market = getOrCreateMarket(world, marketId);

      const neg = startNegotiation(trader, partner, itemName, market, world);
      if (neg) {
        world.activeNegotiations.push(neg);
        events.push({
          id: `trade-start-${world.tickCount}-${trader.id}`,
          tick: world.tickCount,
          gameTime: world.time,
          type: 'trade_negotiation',
          actorId: trader.id,
          targetId: partner.id,
          description: `${trader.name} opens negotiation with ${partner.name} for ${itemName} (ask: ${neg.askPrice}g, bid: ${neg.bidPrice}g)`,
          data: { negotiationId: neg.id, item: itemName },
        });
      }
    }

    return events;
  },
};
