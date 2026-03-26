# EIS Web ↔ UE5 WebSocket Bridge Protocol

## Overview

The EIS WebSocket bridge allows the UE5 EIS simulation plugin (`EISRemoteControl`) to:

1. Subscribe to real-time simulation state updates from the web engine
2. Send commands to trigger simulation ticks
3. Push NPC state changes from UE5 back to the web engine (bidirectional)
4. Receive faction reputation and relationship change events

**Endpoint**: `ws://localhost:3001/api/ws`

---

## Connection

### Connect

```javascript
const ws = new WebSocket('ws://localhost:3001/api/ws');

ws.onopen = () => {
  // Server immediately sends a welcome frame:
  // { "type": "connected", "message": "EIS WebSocket bridge ready",
  //   "available_topics": ["npc_state", "events", "tick_complete", "faction_reputation"] }
};
```

### UE5 C++ connection (EISRemoteControl plugin)

```cpp
// In EISRemoteControl::BeginPlay()
FString URL = TEXT("ws://localhost:3001/api/ws");
WebSocket = FWebSocketsModule::Get().CreateWebSocket(URL, TEXT("ws"));
WebSocket->OnMessage().AddUObject(this, &UEISRemoteControl::OnMessage);
WebSocket->Connect();
```

---

## Client → Server Messages

### Subscribe to Topics

```json
{
  "type": "subscribe",
  "topics": ["npc_state", "events", "tick_complete"]
}
```

**Available topics:**

| Topic | Description | PostgreSQL Channel |
|-------|-------------|-------------------|
| `npc_state` | NPC attribute/need changes | `eis_npc_changed` |
| `events` | Simulation events (NeedCritical, BehaviorChange, etc.) | `eis_sim_event` |
| `tick_complete` | Emitted when each tick completes | `eis_tick_complete` |
| `faction_reputation` | Faction reputation deltas | `eis_sim_event` (filtered) |

**Response:**
```json
{ "type": "subscribed", "topics": ["npc_state", "events", "tick_complete"] }
```

---

### Unsubscribe from Topics

```json
{
  "type": "unsubscribe",
  "topics": ["faction_reputation"]
}
```

---

### Execute Simulation Ticks

**Single tick:**
```json
{
  "type": "command",
  "action": "tick",
  "simulation_id": "550e8400-e29b-41d4-a716-446655440000",
  "delta_time": 1.0
}
```

**Bulk ticks (fast-forward N ticks):**
```json
{
  "type": "command",
  "action": "tick-bulk",
  "count": 100,
  "simulation_id": "550e8400-e29b-41d4-a716-446655440000",
  "delta_time": 1.0
}
```

**Note:** `count` is capped at 1000 per call. `delta_time` is in game-seconds.

---

### Update NPC State (UE5 → Web)

Push NPC state changes from UE5 into the web engine's database:

```json
{
  "type": "update_npc",
  "npc_id": "NPC_Raven",
  "changes": {
    "aggression": 8.5,
    "hunger": 72.3,
    "emotional_state": "Angry"
  }
}
```

**Allowed fields:**

Attributes: `strength`, `dexterity`, `endurance`, `health`, `intelligence`, `wisdom`, `willpower`, `charisma`

Personality: `aggression`, `friendliness`, `curiosity`, `fearfulness`, `loyalty`, `independence`, `confidence`, `patience`, `honesty`, `empathy`, `resourcefulness`, `greed`, `generosity`, `survival_instinct`

Needs: `hunger`, `thirst`, `rest`, `social_interaction`, `energy`, `hygiene`, `comfort`

State: `emotional_state`, `awareness_level`

**Response:**
```json
{ "type": "npc_updated", "npc_id": "NPC_Raven", "changes": { "aggression": 8.5 } }
```

---

## Server → Client Messages

### Event (Simulation Event)

Emitted when a new `eis_simulation_events` row is inserted:

```json
{
  "type": "event",
  "tick": 1234,
  "data": {
    "simulation_id": "550e8400-e29b-41d4-a716-446655440000",
    "tick_number": 1234,
    "npc_id": "NPC_Raven",
    "event_type": "NeedCritical",
    "description": "NPC_Raven has critical hunger: 87.3",
    "id": 5678
  }
}
```

**Event types:**

| event_type | Meaning |
|-----------|---------|
| `NeedCritical` | NPC need >= 80 (requires behavior response) |
| `BehaviorChange` | NPC selected a new behavior |
| `Trade` | Trade transaction between NPCs |
| `Combat` | Combat event between NPCs |
| `ManualUpdate` | NPC state changed via API or UE5 push |

---

### State Update (NPC Changed)

Emitted when `eis_npcs.updated_at` is updated (via PostgreSQL trigger):

```json
{
  "type": "state_update",
  "channel": "eis_npc_changed",
  "data": {
    "npc_id": "NPC_Raven",
    "operation": "UPDATE",
    "updated_at": "2026-03-25T12:34:56.789Z"
  }
}
```

Use this to know which NPCs to re-fetch. The `npcs_changed` array is the set of dirty NPC IDs:

```json
{
  "type": "state_update",
  "npcs_changed": ["NPC_Raven", "NPC_Grim"],
  "tick": 1234
}
```

---

### Tick Complete

Emitted after each tick's database row is written:

```json
{
  "type": "tick_complete",
  "tick": 1234,
  "world_time": 1234.0,
  "simulation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

For bulk ticks: emitted once after the batch completes, with `ticks_executed`:

```json
{
  "type": "tick_complete",
  "tick": 1334,
  "world_time": 1334.0,
  "ticks_executed": 100,
  "events_count": 0,
  "duration_ms": 87
}
```

---

### Error

```json
{ "type": "error", "message": "simulation_id required for command" }
```

---

## Full UE5 Integration Example

```cpp
// EISRemoteControl.h
UCLASS()
class UEISRemoteControl : public UObject
{
public:
    void BeginPlay();
    void OnMessage(const FString& Message);
    void OnConnected();
    void SendTick(const FString& SimulationId, int32 Count = 1);
    void PushNPCState(const FString& NPCId, const TMap<FString, FString>& Changes);

private:
    TSharedPtr<IWebSocket> WebSocket;
    FString ActiveSimulationId;
};
```

```cpp
// EISRemoteControl.cpp

void UEISRemoteControl::BeginPlay()
{
    WebSocket = FWebSocketsModule::Get().CreateWebSocket(
        TEXT("ws://localhost:3001/api/ws"), TEXT("ws"));
    WebSocket->OnConnected().AddUObject(this, &UEISRemoteControl::OnConnected);
    WebSocket->OnMessage().AddUObject(this, &UEISRemoteControl::OnMessage);
    WebSocket->Connect();
}

void UEISRemoteControl::OnConnected()
{
    // Subscribe to all relevant topics
    TSharedPtr<FJsonObject> Msg = MakeShareable(new FJsonObject);
    Msg->SetStringField(TEXT("type"), TEXT("subscribe"));
    TArray<TSharedPtr<FJsonValue>> Topics;
    Topics.Add(MakeShareable(new FJsonValueString(TEXT("npc_state"))));
    Topics.Add(MakeShareable(new FJsonValueString(TEXT("events"))));
    Topics.Add(MakeShareable(new FJsonValueString(TEXT("tick_complete"))));
    Msg->SetArrayField(TEXT("topics"), Topics);

    FString Output;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
    WebSocket->Send(Output);
}

void UEISRemoteControl::OnMessage(const FString& Message)
{
    TSharedPtr<FJsonObject> Parsed;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Message);
    if (!FJsonSerializer::Deserialize(Reader, Parsed)) return;

    FString Type = Parsed->GetStringField(TEXT("type"));

    if (Type == TEXT("tick_complete"))
    {
        int32 Tick = Parsed->GetIntegerField(TEXT("tick"));
        UE_LOG(LogEIS, Log, TEXT("Tick %d complete"), Tick);
        // Update UE5 world state from PostgreSQL
    }
    else if (Type == TEXT("event"))
    {
        TSharedPtr<FJsonObject> Data = Parsed->GetObjectField(TEXT("data"));
        FString EventType = Data->GetStringField(TEXT("event_type"));
        FString NPCId     = Data->GetStringField(TEXT("npc_id"));
        // Dispatch to UE5 NPC behavior system
    }
}

void UEISRemoteControl::SendTick(const FString& SimulationId, int32 Count)
{
    TSharedPtr<FJsonObject> Msg = MakeShareable(new FJsonObject);
    Msg->SetStringField(TEXT("type"),          TEXT("command"));
    Msg->SetStringField(TEXT("action"),        TEXT("tick-bulk"));
    Msg->SetStringField(TEXT("simulation_id"), SimulationId);
    Msg->SetNumberField(TEXT("count"),         Count);
    Msg->SetNumberField(TEXT("delta_time"),    1.0);

    FString Output;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
    WebSocket->Send(Output);
}

void UEISRemoteControl::PushNPCState(const FString& NPCId,
                                      const TMap<FString, FString>& Changes)
{
    TSharedPtr<FJsonObject> Msg = MakeShareable(new FJsonObject);
    Msg->SetStringField(TEXT("type"),   TEXT("update_npc"));
    Msg->SetStringField(TEXT("npc_id"), NPCId);

    TSharedPtr<FJsonObject> ChangesObj = MakeShareable(new FJsonObject);
    for (const auto& Pair : Changes)
    {
        ChangesObj->SetStringField(Pair.Key, Pair.Value);
    }
    Msg->SetObjectField(TEXT("changes"), ChangesObj);

    FString Output;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
    FJsonSerializer::Serialize(Msg.ToSharedRef(), Writer);
    WebSocket->Send(Output);
}
```

---

## REST API Reference

All REST routes are available on `http://localhost:3001`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Database connectivity check |
| GET | `/api/npcs` | List NPCs (`?species=Human&page=1&limit=50`) |
| GET | `/api/npcs/:id` | NPC detail with joined talents, inventory, roles, factions |
| PUT | `/api/npcs/:id` | Update NPC attributes/personality/needs |
| POST | `/api/npcs/:id/tick` | Single-NPC tick (need decay + behavior) |
| GET | `/api/factions` | List factions with member counts |
| GET | `/api/factions/:id/reputation` | Faction reputation matrix |
| GET | `/api/relationships` | All relationships (`?npc_id=NPC_Raven`) |
| PUT | `/api/relationships/:id` | Update trust level |
| POST | `/api/simulation/start` | Start new simulation run |
| POST | `/api/simulation/tick` | Execute one global tick |
| POST | `/api/simulation/tick-bulk` | Fast-forward N ticks |
| GET | `/api/simulation/events` | Query simulation events |
| GET | `/api/simulation/state` | Current world state summary |
| POST | `/api/csv/import` | Upload CSV to import into table |
| GET | `/api/csv/export/:table` | Download table as CSV |

---

## Database LISTEN Channels

The API server uses PostgreSQL `pg_notify` for real-time events. All channels are prefixed `eis_`:

| Channel | Trigger | Payload |
|---------|---------|---------|
| `eis_npc_changed` | `UPDATE` on `eis_npcs` | `{ npc_id, operation, updated_at }` |
| `eis_sim_event` | `INSERT` on `eis_simulation_events` | `{ simulation_id, tick_number, event_type, npc_id, id }` |
| `eis_tick_complete` | `INSERT` on `eis_simulation_ticks` | `{ simulation_id, tick_number, world_time }` |

---

## Cloud SQL Connection

The web engine connects to the shared Cloud SQL instance:

```
Host:     127.0.0.1:5499  (via cloud-sql-proxy)
Instance: gen-lang-client-0047375361:us-central1:charlotte-pg-instance
Database: eis_simulation
User:     postgres
```

Start the proxy before running the API server:

```bash
cloud-sql-proxy --port=5499 gen-lang-client-0047375361:us-central1:charlotte-pg-instance &
npx tsx src/api/index.ts
```

Or set `DATABASE_URL` in environment:

```bash
export DATABASE_URL="postgresql://postgres:PASSWORD@127.0.0.1:5499/eis_simulation"
```
