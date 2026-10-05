# CoffAI Lead Engine

**CoffAI Lead Engine** is a lightweight café lead-generation system that discovers cafés from OpenStreetMap, enriches their public listing signals, uses an LLM to generate **evidence-based hypotheses** about potential operational pain points, and stores the results in PostgreSQL for prioritization.

The goal is simple:

> **Find potentially relevant cafés → enrich their public signals → prioritize them → manually reach out.**

No automated messaging. No paid places API. No native dependencies.

---

## ✨ What It Does

The engine follows a simple pipeline:

```text
                    ┌──────────────────┐
                    │   Target City    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   OpenStreetMap  │
                    │ Nominatim/Overpass│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Cafe Listings   │
                    │ Name / Location  │
                    │ Website / Phone  │
                    │ Social Signals   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Regional Pain KB │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │      Groq        │
                    │  LLM Analysis    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    PostgreSQL    │
                    │ Leads + Scores   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │   Prioritize &   │
                    │  Draft Outreach  │
                    └──────────────────┘
```

For each café, the system can store:

- Café name and location
- Address and contact information when available
- Website and social signals
- Category/listing information
- Regional pain-pattern signals
- **Openness-to-software score**
- **Pain/opportunity score**
- Hypothesized operational problems
- AI-generated reasoning
- Optional outreach draft

---

## 🧠 How the AI Analysis Works

The system does **not** claim to know a café's actual internal problems.

Instead, it combines:

1. Public listing signals from OpenStreetMap
2. Available website/social presence signals
3. A curated regional knowledge base
4. The café's category and context

Groq then generates a **labeled hypothesis** about potential operational pain points and the café's potential openness to software.

For example:

```text
Signals:
- Cafe
- Website available
- Limited digital ordering signals
- Region: Tunisia

Hypothesis:
Potential opportunity around digital menu/order management.

Openness: 4/5
Pain: 4/5
```

These scores are **lead-prioritization signals, not verified facts**.

The purpose is to help decide which cafés are worth researching further — not to automatically determine whether a café needs CoffAI.

---

# 🌍 Data Sources

## OpenStreetMap

Café discovery uses:

- **Nominatim** — city/region geocoding
- **Overpass API** — querying café-related OpenStreetMap data

No API key or paid account is required.

OpenStreetMap is community-maintained, so data completeness varies by location. Name and geographic information are generally more reliable than optional fields such as:

- Phone numbers
- Websites
- Instagram/social accounts
- Opening hours

The system is therefore designed to treat missing information as a **data gap**, not as evidence that something does not exist.

### User-Agent

Both Nominatim and Overpass expect responsible API usage.

Update the `USER_AGENT` value in:

```text
backend/src/services/osmPlaces.js
```

with an identifiable contact address before using the service extensively.

Please respect the usage policies and rate limits of the public services.

---

# 🤖 Groq

The engine uses Groq for LLM-based lead analysis and optional outreach drafting.

Create an API key from the Groq console and configure:

```env
GROQ_API_KEY=your_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

The default model may change as Groq updates its available models. Check the current Groq model documentation if the configured model is no longer available.

---

# 🗄️ PostgreSQL

Lead data is stored in PostgreSQL.

Create the database:

```bash
createdb coffai_leads
```

Then configure your environment:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/coffai_leads
```

Run the schema migration:

```bash
cd backend
npm run migrate
```

---

# 🚀 Getting Started

## Requirements

- Node.js
- npm
- PostgreSQL
- Python 3 (only required for serving the static frontend)
- Groq API key

No C/C++ compiler or native build toolchain is required.

---

## 1. Clone the repository

```bash
git clone <repository-url>
cd coffai-lead-engine
```

---

## 2. Configure the backend

```bash
cd backend
copy .env.example .env
```

On macOS/Linux:

```bash
cp .env.example .env
```

Configure:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/coffai_leads
GROQ_API_KEY=your_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

---

## 3. Install dependencies

```bash
npm install
```

The project intentionally avoids native dependencies so installation remains simple across operating systems.

---

## 4. Initialize the database

```bash
npm run migrate
```

---

## 5. Start the backend

```bash
npm start
```

The API runs on:

```text
http://localhost:8080
```

---

## 6. Start the frontend

The frontend is static and requires no build process.

From the project root:

```bash
cd frontend
python3 -m http.server 5500
```

On Windows, depending on your Python installation:

```bash
python -m http.server 5500
```

Then open:

```text
http://localhost:5500
```

---

# 🔎 Using the Engine

### 1. Select a region

Enter a city and select the country.

### 2. Scan

Click **Scan Region**.

The backend:

- Geocodes the selected city
- Queries OpenStreetMap
- Collects café listings
- Extracts available listing signals
- Applies regional knowledge
- Sends the relevant data to Groq
- Stores the resulting lead in PostgreSQL

### 3. Review leads

The interface displays information such as:

- Café name
- Location
- Contact information
- Website/social signals
- Openness score
- Pain score
- Problem categories
- AI hypothesis

### 4. Prioritize

Filter leads by:

- Problem category
- Minimum openness score
- Pain score
- Other available signals

The objective is to focus manual research and outreach on the most promising leads.

### 5. Draft outreach

Click **Draft Message** to generate a short outreach message.

The message is only a **draft**.

> **The system never automatically contacts cafés.**

You review, edit, copy, and send the message yourself.

---

# 📁 Project Structure

```text
coffai-lead-engine/
│
├── backend/
│   ├── src/
│   │   ├── data/
│   │   │   └── regionalPainPatterns.js
│   │   │
│   │   └── services/
│   │       ├── osmPlaces.js
│   │       └── websiteScraper.js
│   │
│   ├── schema.sql
│   ├── .env.example
│   └── package.json
│
├── frontend/
│   └── ...
│
├── .gitignore
└── README.md
```

---

# 🧩 Key Components

## `osmPlaces.js`

Responsible for discovering cafés through OpenStreetMap.

Current sources:

- Nominatim
- Overpass

---

## `regionalPainPatterns.js`

The regional knowledge base.

This file contains documented regional patterns that provide context for the LLM analysis.

This is intentionally separated from the application logic so regional knowledge can evolve independently from the scraper.

---

## `websiteScraper.js`

Optional website enrichment.

When a café has a public website, the service can retrieve publicly accessible website content and use it as an additional signal.

This allows the analysis to move beyond basic directory information and incorporate information from the café's own website.

---

# 📊 Lead Scoring

The engine uses two primary scores:

### Openness Score

An estimate of how receptive a café may be to adopting software based on observable digital signals.

```text
1 — Very low
2 — Low
3 — Moderate
4 — High
5 — Very high
```

### Pain Score

An estimate of how strongly the available signals suggest a potential operational opportunity.

```text
1 — Very low
2 — Low
3 — Moderate
4 — High
5 — Very high
```

These scores should be treated as **heuristics**.

They are designed for prioritization and should be validated through manual research and real conversations.

---

# 🔐 Privacy & Security

The project is designed around publicly available business information.

It does not require access to private customer accounts or private café systems.

### Never commit secrets

Do not commit:

```text
.env
API keys
database passwords
production credentials
private database dumps
```

Use:

```text
.env.example
```

for documenting required configuration.

### Lead data

If the database contains real-world café contact information, avoid committing the populated database or exported lead lists to a public repository.

The repository should contain the **engine and schema**, not your private lead database.

---

# ⚙️ Why Version 3?

Earlier versions experimented with DuckDB and external datasets.

That introduced native binaries and platform/toolchain issues, particularly on Windows.

Version 3 simplifies the architecture:

```text
Previous:

Node.js
   │
   └── DuckDB
         │
         └── Native binary
               │
               └── Platform/toolchain problems


v3:

Node.js
   │
   ├── Axios → OpenStreetMap
   │
   ├── Axios → Groq
   │
   └── PostgreSQL
```

The result is a smaller dependency surface and a simpler installation process.

---

# 🛣️ Roadmap

### Current

- [x] OpenStreetMap café discovery
- [x] Nominatim geocoding
- [x] Overpass queries
- [x] PostgreSQL storage
- [x] Regional pain-pattern knowledge base
- [x] LLM lead analysis
- [x] Openness scoring
- [x] Pain scoring
- [x] Lead filtering
- [x] Manual outreach drafting
- [x] Optional website enrichment

### Next

- [ ] Improve regional knowledge bases
- [ ] Better website signal extraction
- [ ] Region/country presets
- [ ] CSV export
- [ ] Lead deduplication improvements
- [ ] More transparent scoring explanations
- [ ] Better enrichment for high-priority leads

---

# 🎯 Philosophy

CoffAI Lead Engine is intentionally **not** an automated spam system.

The idea is to automate the repetitive **research and prioritization** work while keeping the human responsible for:

- Verifying the lead
- Understanding the business
- Deciding whether there is a genuine opportunity
- Personalizing the message
- Choosing whether to contact the business

The engine answers:

> **"Which cafés should I investigate first?"**

It does not pretend to answer:

> **"Which cafés definitely need my software?"**
