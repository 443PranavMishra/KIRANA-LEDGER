# 📒 Khata — Digital Ledger for India's Kirana Shops

**A face-recognition credit ledger that brings India's neighborhood
kirana shops — and the customers who depend on them — into the digital
economy, without asking anyone to read, type, or remember a password.**

> Built for: **Inclusive AI, Social Impact & Empowerment of Underserved
> Communities — AI for Public Good**

---

## Table of Contents

1. [The Problem](#the-problem)
2. [How This Fits "AI for Public Good"](#how-this-fits-ai-for-public-good)
3. [What Khata Actually Does](#what-khata-actually-does)
4. [Who This Is For](#who-this-is-for)
5. [Every Feature, In Full](#every-feature-in-full)
6. [Tech Stack](#tech-stack)
7. [How It Works — The Face Recognition Pipeline](#how-it-works--the-face-recognition-pipeline)
8. [How This Was Built — Development Workflow](#how-this-was-built--development-workflow)
9. [Project Structure](#project-structure)
10. [Running This On Your Own Computer](#running-this-on-your-own-computer)
11. [Environment Variables](#environment-variables)
12. [Known Limitations & What's Next](#known-limitations--whats-next)
13. [License](#license)

---

## The Problem

Walk into almost any neighborhood kirana (grocery) store in India, and
you'll find a tattered notebook behind the counter — the **khata**. It's
where the shop owner writes down who took what on credit, and crosses
it off when they pay. It's how millions of small shop owners have
extended informal credit to their regular customers for generations.

It also has real problems:

- **No backup.** If the notebook is lost, damaged, or a page gets torn
  out, that record of who owes what is simply gone.
- **No record for the customer.** Disputes over "how much do I owe you
  again?" are common and have no independent record to settle them.
- **No data for the shop owner.** A shop owner extending real credit
  every day has zero visibility into their own business — how much
  credit is outstanding right now, which customers are reliable, how
  the shop is actually growing.
- **Excluded from formal finance.** This is real lending activity —
  informal microcredit happening at massive scale across India — but
  because it's never digitized, it never becomes a credit history that
  could help a shop owner access a business loan or a formal line of
  credit.
- **A digital solution has to actually fit these users.** Any app that
  assumes comfortable typing, English fluency, or patience for
  usernames and passwords will simply not get used by a large share of
  both shop owners and their customers — many of whom are older, less
  formally educated, or simply used to a system that has always just
  worked by memory and trust.

## How This Fits "AI for Public Good"

This project is our interpretation of **"AI for Micro-Entrepreneurs and
Street Vendors"** from the challenge brief — kirana shop owners are
exactly this: small, often solo-run businesses making constant
financial decisions (who to extend credit to, how much, for how long)
with no tools, no data, and no formal safety net.

We tried to take the brief's "accessibility, local languages, digital
literacy, affordability, limited connectivity" guidance literally
rather than as an afterthought:

| Challenge guidance | What we actually built |
|---|---|
| **Digital literacy** | The core interaction for *every* customer is a face scan — nothing to type, nothing to remember. A customer who has never used a smartphone app can still be recognized and served in seconds. |
| **Local languages** | The entire interface — every button, label, and message — works in **English, Hindi, Marathi, Telugu, and Tamil**, switchable instantly, no page reload. |
| **Accessibility** | Every major action is confirmed **out loud**, in the selected language — genuinely useful for anyone less comfortable reading small on-screen text, not just a nice-to-have. |
| **Affordability** | Runs entirely on free-tier infrastructure (Supabase's free database/storage tier; can be hosted for free or run on a shop owner's own computer). No subscription, no per-transaction fee. |
| **Financial inclusion** | For the first time, a shop owner gets a real **dashboard**: total credit outstanding, collection trends, growth over time — the exact kind of data a formal lender would want to see, generated automatically from data the shop owner is already producing just by running their business. |
| **Meeting people where they are** | Payments go through **UPI**, India's dominant digital payment rail, and support requests go through **WhatsApp** — not a new app or channel we're asking anyone to adopt, but the ones already in every pocket. |

## What Khata Actually Does

In one sentence: **a shop owner scans a customer's face to open their
account, tracks what they buy on credit and what they pay back, and
both sides can see the full picture at any time — the same trust-based
system as a paper khata, digitized.**

For the shop owner, it replaces the notebook with something that can't
be lost, gives them real business insight they never had, and lets
customers manage part of the relationship themselves (checking dues,
requesting credit, paying online) without a phone call.

For the customer, it means being able to check exactly what they owe
— across *every* shop that uses the system, not just one — from
anywhere, without needing to trust their own memory or the shop
owner's handwriting.

## Who This Is For

**Primary users — Shop owners.** Small kirana (grocery/general store)
owners, typically running the business solo or with family, who
currently extend informal credit using pen and paper and have no
digital tools built for how they actually operate.

**Primary users — Customers.** The shop's regular customers, who take
goods on credit and pay back over time — a group that skews toward
lower digital literacy and may not own a smartphone capable of running
a full banking or accounting app, but very likely has *some* phone
capable of a camera-based face scan and, increasingly, a UPI-linked
account.

**Secondary beneficiaries.** Anyone in the value chain around informal
retail credit in India — this pattern (trusted local credit,
undocumented) exists far beyond kirana shops, in barbershops, small
repair services, and local vendors of all kinds. The core idea
generalizes.

## Every Feature, In Full

### For shop owners
- **Face-scan login and registration** — no password required day to
  day; a password and a one-time "Unique ID" exist only as a fallback
  if face scanning ever fails
- **Multi-tenant by design** — every shop's data is completely
  isolated from every other shop on the same system
- **Scan a customer's face** to instantly pull up their account, or
  register them as new in seconds
- **Product catalog** — add your regular items with prices once, then
  pick them quickly during every future purchase instead of typing
  everything by hand
- **Credit and payment recording** — add credit for a new purchase,
  record a payment made in person
- **A real Dashboard**, not a spreadsheet:
  - Today's snapshot (total outstanding, customers with dues,
    collected today)
  - A 6-month shop growth graph (credit extended vs. collected)
  - A due-vs-clear customer breakdown
  - A searchable table of every customer currently owing money
- **Credit Requests** — customers can request more credit remotely;
  the shop owner approves or rejects from their side
- **Payment Claims** — customers who pay via UPI submit a screenshot
  as proof; the shop owner reviews and confirms only once they've
  actually seen the money land (this app never touches real money
  directly — it's a claim-and-confirm system, deliberately, since
  neither side should have to trust an automated payment gateway they
  didn't choose)
- **Permanent, searchable Payment History**
- **Customer Feedback** — see what customers say about the shop, a
  specific product, or staff
- **Payment Settings** — view or update the UPI ID customers pay to,
  protected behind a re-authentication step
- **Contact support directly on WhatsApp** — no email setup, no
  ticketing system, just the channel shop owners already use daily

### For customers
- **Face-scan lookup** — see dues across *every* participating shop at
  once, with a name-and-phone fallback if the scan doesn't recognize
  them
- **Full transaction history per shop**, searchable by date or amount
- **Pay dues online** — open your own UPI app with the amount already
  filled in, or pay however you like and upload a screenshot as proof
- **Request more credit** remotely, picking products from the shop's
  own catalog
- **Leave feedback** about the shop, a product, or staff
- **Contact support on WhatsApp**

### Across the whole app
- **5 languages** — English, Hindi, Marathi, Telugu, Tamil — switching
  is instant and affects every screen, including dynamically-loaded
  content
- **Spoken confirmations** in the selected language for key actions
  (account created, credit added, payment recorded, fully paid) —
  toggle-able, genuinely useful for lower-literacy users
- **Built to run on nothing** — free-tier database/storage, no card
  required to self-host on at least one platform we tested end-to-end

## Tech Stack

**Backend**
- [Flask](https://flask.palletsprojects.com/) (Python) — the web
  server and all business logic
- [Gunicorn](https://gunicorn.org/) — production WSGI server
- [Supabase](https://supabase.com/) — Postgres database (with the
  `pgvector` extension for face-embedding similarity search) + file
  storage for photos and payment screenshots, all on their free tier

**AI / Computer Vision**
- [PyTorch](https://pytorch.org/) (CPU-only build — no GPU required)
- [facenet-pytorch](https://github.com/timesler/facenet-pytorch) —
  provides two models:
  - **MTCNN** — detects and crops the face from a photo
  - **InceptionResnetV1** (pretrained on VGGFace2) — turns a detected
    face into a 512-dimensional numerical "fingerprint" (embedding)
- **pgvector** (inside Postgres) — stores every face embedding and
  finds the closest match via cosine-similarity search, directly in
  the database

**Frontend**
- Vanilla HTML, CSS, and JavaScript — no framework, no build step,
  kept deliberately simple and fast-loading for lower-bandwidth
  conditions
- [Chart.js](https://www.chartjs.org/) — the two dashboard graphs
- Web Speech API (`speechSynthesis`) — the spoken confirmations, built
  into every modern browser at no extra cost

**Infrastructure**
- `python-dotenv` for configuration
- WhatsApp's "click to chat" links (`wa.me`) for the support channel —
  free, no API key, no approval process required

## How It Works — The Face Recognition Pipeline

In plain terms, here's what actually happens the moment someone's face
is scanned:

1. **Capture** — the browser takes a photo using the device's camera.
2. **Detect** — `MTCNN` looks at that photo and finds the face inside
   it (ignoring background, other people, etc.), cropping it down to
   just the face.
3. **Describe** — `InceptionResnetV1` looks at that cropped face and
   outputs 512 numbers — not an image, just a list of numbers that
   mathematically describe the distinguishing features of that face.
   Two photos of the *same* person produce two lists of numbers that
   are close together; two *different* people produce numbers that are
   far apart.
4. **Compare** — that list of 512 numbers gets compared against every
   face already stored for that shop (or, for a customer checking dues,
   against every face in the whole system), using **cosine similarity**
   — a standard mathematical way of measuring how "close" two lists of
   numbers are.
5. **Match or register** — if the closest match is close enough (above
   a tuned confidence threshold), that's treated as a recognized
   returning customer or shop owner. If nothing is close enough, it's
   treated as a new face, and the app offers to register them.

None of this needs an internet connection to a third-party AI
service — the actual face model runs locally, inside this app's own
server process. Supabase is only used to store and search the
resulting numbers, not to do the face recognition itself.

## How This Was Built — Development Workflow

This started as a minimal proof of concept and grew iteratively,
feature by feature, rather than being designed fully upfront. Roughly,
in the order it actually happened:

1. **Core face-recognition ledger** — get a single shop owner scanning
   a single customer's face, recording a purchase, recording a
   payment. Prove the fundamental face-matching concept works
   reliably before building anything else on top of it.
2. **Multi-tenancy** — shop owner accounts, login/registration via face
   scan with password/Unique-ID fallbacks, and strict data isolation
   between shops.
3. **Product catalog and purchase flow** — move from typing a raw
   amount to picking real products with real prices.
4. **UPI payments** — let customers pay online and submit proof,
   rather than requiring every payment to happen in person.
5. **Dashboard and analytics** — turn the raw transaction data every
   shop was already generating into something a shop owner could
   actually use to understand their own business.
6. **Credit requests and feedback** — give customers a way to
   participate in the relationship remotely, not just receive service.
7. **Full localization** — English and Hindi first, then expanded to
   Marathi, Telugu, and Tamil, plus voice announcements — treating
   language support as core functionality, not a translation pass
   bolted on at the end.
8. **WhatsApp-based support** — replaced an initial email-based contact
   form with WhatsApp once it became clear that was the channel this
   audience actually already lives in.
9. **Codebase cleanup** — the app started as a single large file and
   was later reorganized into a proper structure (separate CSS/JS
   files, a real project layout) once the feature set stabilized.

Throughout, priority was given to **graceful degradation over hard
failure** — if a translation is missing, the app falls back to
English rather than breaking; if the payment-notification channel
isn't configured, submissions still save reliably rather than being
lost; if the face-recognition model file isn't present, the app falls
back to standard pretrained weights rather than refusing to start.

For the full, round-by-round history of how every feature was actually
built — including bugs found and fixed along the way — see
[CHANGELOG.md](CHANGELOG.md).

## Project Structure

```
khata_project/
├── app.py                          Flask backend — all routes & logic
├── requirements.txt                Python dependencies
├── .env.example                    Template for your own .env
├── models/
│   └── README.md                   Optional face-model weights go here
├── database/
│   ├── schema.sql                  Full database schema + migrations
│   └── verify_schema.sql           Diagnostic: confirms what's deployed
├── static/
│   ├── css/style.css
│   ├── js/
│   │   ├── i18n.js                 5-language system + in-app Help
│   │   ├── auth.js                 Shop owner login / registration
│   │   ├── customer-portal.js      Customer-facing features
│   │   ├── contact.js              WhatsApp support integration
│   │   ├── voice.js                Spoken confirmations
│   │   └── app.js                  Core app: scanning, dashboard, etc.
│   └── images/
└── templates/
    └── index.html                  The app's single HTML entry point
```

## Running This On Your Own Computer

### 1. Get the code
```bash
git clone <this-repo-url>
cd khata_project
```

### 2. Set up your database (Supabase — free, no card required)

You have two options here:

**Option A — Use your own Supabase project (recommended for most people).**
1. Create a free account at [supabase.com](https://supabase.com) and a
   new project.
2. In that project's **SQL Editor**, paste and run the entire contents
   of `database/schema.sql`.
3. In **Storage**, create three buckets, all with public access ON:
   `customer-photos`, `shopkeeper-photos`, `payment-screenshots`.
4. In **Project Settings → API**, copy your **Project URL** and your
   **`secret` key** (not the `publishable`/`anon` one — the app needs
   elevated, server-side access).

**Option B — Ask the maintainer for shared access.** If you've been
given a `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` directly by someone
already running this project, you can use those instead of creating
your own project — you'll be working against their live data rather
than a fresh empty database. **Never commit these values to a public
repo or share them anywhere public** — treat them exactly like a
password, since the secret key grants full read/write access to the
entire database. If you were given credentials this way, ask the
person who shared them to rotate the key once you're done, which
instantly revokes access without needing anything from you.

### 3. Configure your environment
```bash
cp .env.example .env
```
Then fill in `.env`:
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_...
FLASK_SECRET_KEY=<run the command below>
CONTACT_WHATSAPP_NUMBER=<your number, e.g. 919876543210>
FLASK_DEBUG=false
```
Generate a real `FLASK_SECRET_KEY` (don't make one up — it needs to be
genuinely random):
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4. Install dependencies (in this specific order)
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install facenet-pytorch --no-deps
pip install -r requirements.txt
```
(This order matters — see the comments inside `requirements.txt` for
exactly why. Short version: `facenet-pytorch`'s own packaging points at
an old `torch` version that no longer exists anywhere; installing
`torch` first and then skipping `facenet-pytorch`'s outdated dependency
check avoids the problem entirely.)

### 5. Run it
```bash
python app.py
```
Open **http://localhost:5000**.

## Environment Variables

| Variable | Required? | What it's for |
|---|---|---|
| `SUPABASE_URL` | **Yes** | Your Supabase project's API URL |
| `SUPABASE_SERVICE_KEY` | **Yes** | Full server-side access to your database — keep this secret |
| `FLASK_SECRET_KEY` | Recommended | Signs login session cookies; falls back to an insecure default if unset |
| `CONTACT_WHATSAPP_NUMBER` | Optional | Powers the in-app "Contact Us" WhatsApp button; without it, support requests still save to the database, just without the WhatsApp handoff |
| `FLASK_DEBUG` | Optional | Set to `false` for anything other than local development on your own machine |

## Known Limitations & What's Next

Being upfront about where this stands today:

- **Not every dynamic message is translated into all 5 languages yet**
  — the vast majority of the interface is, but some less-common error
  messages and confirmations currently fall back to English for
  Marathi/Telugu/Tamil users.
- **Payments are claim-and-confirm, not gateway-integrated** — this
  was a deliberate choice (no real payment processor was wired in, so
  no transaction fees, no approval process, no dependency on a
  third-party service that might not serve this audience well), but it
  does mean a shop owner has to manually confirm they've actually
  received a payment rather than it being verified automatically.
- **Optional fine-tuned face model isn't included** — the app runs on
  standard pretrained face-recognition weights, which work well, but a
  shop-specific or region-specific fine-tuned model (if one were
  trained on a more representative dataset) could improve accuracy
  further.
- **Natural next steps**: SMS-based fallback for customers without a
  camera-capable phone; an offline mode for genuinely low-connectivity
  areas; integrating with real government MSME/credit-history schemes
  so this data could eventually help a shop owner access formal
  credit, not just track informal credit better.

## License

*(Add your preferred license here — e.g. MIT — before publishing this
repository publicly.)*
