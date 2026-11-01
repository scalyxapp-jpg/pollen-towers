# Pollen Towers

Twelve floors. Every office is one company, run by one person and one agent.

[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)

**[Ride the lift →](https://scalyxapp-jpg.github.io/pollen-towers/)**

Drag the tower to turn it, click a floor to ride up, and step into the office.
The agent there does the daily work — you get the finished job and make the
decision that needs a person.

## What is in the building

- **Six seed tenants** — a tea buyer, an editor, a bike workshop, a one-person
  software company, a bookkeeper and a field botanist. Each ships with its own
  prompt, its own three jobs and its own voice.
- **Rent a floor** — describe a business in one sentence. The agent drafts the
  name, the tagline, the charter, its own role and the three jobs it will bring
  you each morning. The lease is signed in your browser; the tower redraws with
  a new lit window.
- **Office** — the floor, the company, the agent, the open jobs as chips, and a
  working conversation. Pick a job and the agent answers it in character and
  ends with a decision for you.
- **Directory** — every company in the building, searchable by name, industry
  or floor.

## Agents

Every tenant is a **prompt agent** in the Pollinations sense: a name, a base
model and a system prompt. `Copy agent definition` produces the JSON body for
`POST https://gen.pollinations.ai/account/agents`, so a floor owner with
publisher access can publish the same agent and call it from anywhere:

```bash
curl -X POST https://gen.pollinations.ai/account/agents \
  -H 'Authorization: Bearer $POLLINATIONS_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"type":"prompt_agent","name":"Iris","title":"Frame Recall","systemPrompt":"…","baseModel":"z-ai/glm-5.3-flash"}'
```

In the app itself the agents run through `/v1/chat/completions` with the
visitor's own key, which is the same model and the same system prompt, so the
building works before anyone publishes anything.

## Paying for it

There is no key in the app. The **Connect** button uses
[Bring Your Own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md):
the visitor authorises a scoped key with a 5-Pollen budget and a 7-day expiry,
and every agent turn is paid from their own balance.

## Floors you rent

Rented floors are stored in `localStorage` under `pollen-towers:v1` — the
building is yours, not a shared database. The seed tenants ship in
`src/tower.js`; add one there and it appears for every visitor.

## Run it locally

```bash
python3 -m http.server 8139
```

Open `http://localhost:8139/?key=sk_yourkey` — the query parameter is a
localhost-only development hook so the agents work without the OAuth round trip.

## Stack

Vanilla ES modules, no build step, no dependencies. The tower is CSS 3D: a
stack of transformed floor slabs inside a `perspective` container, with a lift
car that animates to the selected floor.

## License

MIT
