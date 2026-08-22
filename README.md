# 📒 Khata — Digital Ledger for India's Kirana Shops

**A face-recognition credit ledger that brings India's neighborhood
kirana shops — and the customers who depend on them — into the digital
economy, without asking anyone to read, type, or remember a password.**

> Built for: **Inclusive AI, Social Impact & Empowerment of Underserved
> Communities — AI for Public Good**

---

## The Problem

Walk into almost any neighborhood kirana (grocery) store in India, and you'll find a tattered notebook behind the counter — the khata. It's where the shop owner writes down who took what on credit, and crosses it off when they pay. It's how millions of small shop owners have extended informal credit to their regular customers for generations.

- **No backup** — if the notebook is lost or torn, that record is gone for good.
- **No record for the customer** — customers have no way to check or prove what they actually owe.
- **Daily budgeting is manual and time-consuming** — the shop owner has to do the math by hand, every single day.
- **Real risk of losing money** — tracking everyone by memory means some credit is often simply never collected.
- **Language difference problem** — not every shop owner or customer is comfortable reading or writing in English.
- **Inventory and credit get tangled together** — hard to remember which customer took which product, for how much, and when.

---

## Theme Chosen: AI for Micro-Entrepreneurs and Street Vendors

Our project targets small and micro-entrepreneurs, street vendors, and merchandisers who face the problem of maintaining cash flow between customers and their shop, solved by building an automatic AI system.

## Whats Unique

Solutions provided are:

1) **No manual detail entering** — an image scanner model is integrated with the project which detects the customer and shop owner for all registration and login details.
2) **Multi-language system** — 5 languages (English, Hindi, Marathi, Tamil, and Telugu) are integrated into the project, so any customer or shop owner can use the website in their native language.
3) **Two sections for intercommunication between customer and shop owner**, where:
   - a) The customer can see, ask for credit, and repay the credit to the shop owner directly from the website.
   - b) The shop owner can visualize their customers' credit, view a dashboard for shop details, and even manage their inventory.
4) **A highly secure shop owner account** to manage their shop's database.

---

## Every Feature, In Full

### For shop owners
- **Face-scan login and registration** — no password needed day to day, only as a Face Scan.
- **Multi-tenant by design** — every shop's data is completely isolated from every other shop.
- **Scan a customer's face** to instantly pull up their account, or register them as new.
- **Product catalog** — add items once, pick them quickly during every future purchase.
- **Credit and payment recording** — add credit for a purchase, record a payment made in person.
- **A real Dashboard, not a spreadsheet** — snapshot, 6-month growth graph, due-vs-clear breakdown, and a searchable dues table.
- **Credit Requests** — customers request more credit remotely; the shop owner approves or rejects.
- **Payment Claims** — customers submit a UPI screenshot as proof; the shop owner confirms only after seeing the money.
- **Permanent, searchable Payment History** of every online payment.
- **Customer Feedback** — see what customers say about the shop, a product, or staff.
- **Payment Settings** — view or update your UPI ID, protected behind re-authentication.

### For customers
- **Face-scan lookup** — see dues across every shop at once either with face scan or with a name-and-phone fallback.
- **Full transaction history** per shop, searchable by date or amount.
- **Pay dues online** — pay via your UPI app or upload a screenshot as proof.
- **Request more credit** remotely, picking products from the shop's own catalog.
- **Leave feedback** about the shop, a product, or staff.

### Features Across the Whole App
<mark>5 languages</mark> — English, Hindi, Marathi, Telugu, Tamil — switching is instant and affects every screen, including dynamically-loaded content.
<mark>Spoken confirmations</mark> in the selected language for key actions — toggle-able, genuinely useful for lower-literacy users.
WhatsApp help from our side for customers and shop owners, for any problem or conflict between them or with the website.

---

## Tech Stack

**Frontend**
- [HTML](https://developer.mozilla.org/en-US/docs/Web/HTML)
- [CSS](https://developer.mozilla.org/en-US/docs/Web/CSS)
- [JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [Chart.js](https://www.chartjs.org/)

**Backend**
- [Flask](https://flask.palletsprojects.com/)
- [Gunicorn](https://gunicorn.org/)

**AI / Model Training**
- Computer Vision
- [MTCNN](https://github.com/timesler/facenet-pytorch)
- [PyTorch](https://pytorch.org/)
- [VGGFace2](https://ieeexplore.ieee.org/document/8373813)
- [InceptionResnetV1](https://github.com/timesler/facenet-pytorch)
- [pgvector](https://github.com/pgvector/pgvector)

**Database**
- SQL
- [Supabase](https://supabase.com/)

**Extra**
- [Google Colab](https://colab.research.google.com/) — for model training
- [WhatsApp API](https://developers.facebook.com/docs/whatsapp) — for connection between user and us
- [ChatGPT](https://chatgpt.com/) — for translation from Hindi/English to other languages and basic help

---

## How It Works — The Face Recognition Pipeline

1. **Capture** — the browser takes a photo using the device's camera.
2. **Detect** — `MTCNN` finds and crops just the face out of that photo.
3. **Describe** — `InceptionResnetV1` turns the face into 512 numbers that mathematically describe it.
4. **Compare** — those numbers are matched against every stored face using cosine similarity.
5. **Match or register** — a close-enough match means a recognized person; otherwise, it's treated as new and offered for registration.

---

## Project Structure

```
khata_project/
├── app.py                          Flask backend — all routes & logic
├── requirements.txt                Python dependencies
├── .env                            Paste All 5 keys Inside This File
├── models/
│   └── facenet_model               Optional face-model weights go here
├── database/
│   ├── schema.sql                  Full database schema + migrations
│   └── verify_schema.sql           Diagnostic: confirms what's deployed
├── static/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── i18n.js                 5-language system + in-app Help
│   │   ├── auth.js                 Shop owner login / registration
│   │   ├── customer-portal.js      Customer-facing features
│   │   ├── contact.js              WhatsApp support integration
│   │   ├── voice.js                Spoken confirmations
│   │   └── app.js                  Core app: scanning, dashboard, etc.
│   └── images/
│       └── khata-bg.jpg
└── templates/
    └── index.html                  The app's single HTML entry point
```

## Steps To Run The Project In Your System

**Step 1:** Download all files and set up in the project structure inside any main folder (Khata Ledger).

**Step 2:** Download the model from the given model link: `<add your model link here>`

**Step 3:** Now open the main folder with VS Code.

**Step 4:** Create `.env` in the root folder of the main folder, as shown in the project structure, in VS Code only.

**Step 5:** Copy the given keys From "RUN ON YOUR SYSTEM" pdf above.

**Step 6:** After copying all 5 keys, paste them in the `.env` file and save the file in VS Code.

**Step 7:** Open a new terminal in VS Code.

**Step 8:** Run this code in the terminal: `pip install -r requirements.txt`

**Step 9:** Then run: `python app.py`

**Step 10:** After a few seconds, a link will be generated, like: `http://127.0.0.1:5000`

**Step 11:** Copy and paste it in the browser.

**Step 12:** Now the website is ready to use as a shop owner and customer.

---

## Some Flaws Of Current Project — IMPORTANT!

- Sometimes the scanner fails for a few seconds due to the high model size — if this occurs, kindly reload the website.
- Sometimes customer scanning and the dashboard show NaN due to a weak server/database-side network.
- These problems occur very rarely.

---

## Future Updates and Full Project Motto

1. Adding a **real-time payment system** for customers to pay shop owner credit directly using payment gateways.
2. Expanding to **up to 26 languages** to cover the maximum number of shops and business owners across India.
3. An **AI agent** that customers and shop owners can directly talk to — to add products to inventory, enter details, and more.
4. Making the relationship between customer and shop owner **more transparent and trustworthy**.
5. A **chat box** where shop owners can directly message customers, and customers can directly contact a particular shop owner regarding any query.
6. A **comparison listing of shops with a rating system**, so customers can visualize and choose the best products and most reliable credit shops.
