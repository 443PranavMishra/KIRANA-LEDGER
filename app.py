"""
Flask backend — Khata (shop credit ledger) app, v3: multi-tenant.

NEW in this version:
  - Shopkeepers register and log in (scan-to-login, with phone+password and
    unique-ID as fallbacks). Every customer/transaction endpoint below now
    requires an active login and is scoped to that shopkeeper only.

Auth routes:
  POST /shopkeeper/register           -> create a new shop account
  POST /shopkeeper/login/scan         -> face-match login
  POST /shopkeeper/login/password     -> phone + password login
  POST /shopkeeper/login/unique-id    -> recovery-key login
  POST /shopkeeper/logout
  GET  /shopkeeper/session            -> current login state

Existing routes (all now require login, all now scoped to the current shop):
  GET  /
  POST /identify
  POST /customers
  POST /customers/<id>/purchase
  POST /customers/<id>/payment
  GET  /customers/<id>/transactions
  GET  /customers/due-list
  GET  /summary

.env required:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
    FLASK_SECRET_KEY   -> any long random string, used to sign session cookies
"""

import os
import io
import re
import json
import uuid
import string
import secrets
import urllib.parse
from functools import wraps
from datetime import datetime, timedelta, timezone

import torch
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1
from supabase import create_client, Client

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-this")
CORS(app, supports_credentials=True)


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    """Without this, any unhandled server-side error (a bad storage
    upload, a bad Supabase call, anything) falls through to Flask's
    default HTML error page. Every fetch() in the frontend calls
    res.json() on the response, and HTML isn't valid JSON — that's the
    literal cause of 'Unexpected token <' errors in the browser. This
    guarantees the frontend always gets JSON back, even when something
    genuinely breaks server-side."""
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return jsonify({"status": "error", "message": e.description}), e.code
    print(f"[unhandled error] {type(e).__name__}: {e}")
    return jsonify({"status": "error", "message": "Something went wrong on our end. Please try again."}), 500

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

CUSTOMER_BUCKET = "customer-photos"
SHOPKEEPER_BUCKET = "shopkeeper-photos"
PAYMENT_SCREENSHOT_BUCKET = "payment-screenshots"

MATCH_THRESHOLD = 0.55
SHOPKEEPER_MATCH_THRESHOLD = 0.5
OVERDUE_AFTER_DAYS = 30
MAX_PRODUCTS_PER_TRANSACTION = 10
UNIQUE_ID_LENGTH = 10

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
mtcnn = MTCNN(image_size=160, margin=0, device=device)
resnet = InceptionResnetV1(pretrained="vggface2").eval().to(device)

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "facenet_model.pt")
if os.path.exists(MODEL_PATH):
    resnet.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    print(f"Loaded {MODEL_PATH}")
else:
    print(f"{MODEL_PATH} not found — using base pretrained weights")


# ============================================================
# Helpers
# ============================================================

def get_embedding(image_bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    face = mtcnn(img)
    if face is None:
        return None
    face = face.unsqueeze(0).to(device)
    with torch.no_grad():
        embedding = resnet(face)
    return embedding.squeeze(0).cpu().tolist()


def validate_mobile(mobile):
    if not mobile:
        return None, None
    if not re.fullmatch(r"[0-9]*", mobile):
        return None, "Mobile number must contain digits only"
    if len(mobile) > 10:
        return None, "Mobile number cannot be more than 10 digits"
    return mobile, None


def validate_password(password):
    """8 characters, at least one letter and one number."""
    if not password or len(password) != 8:
        return "Password must be exactly 8 characters"
    if not re.search(r"[A-Za-z]", password):
        return "Password must include at least one letter"
    if not re.search(r"[0-9]", password):
        return "Password must include at least one number"
    return None


def generate_unique_id():
    """Random alphanumeric ID, uppercase letters + digits, avoiding
    visually ambiguous characters (0/O, 1/I/L)."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(UNIQUE_ID_LENGTH))


def parse_products(raw):
    if not raw:
        return []
    try:
        products = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(products, list):
        return []
    products = [str(p).strip() for p in products if str(p).strip()]
    return products[:MAX_PRODUCTS_PER_TRANSACTION]


def compute_status(due_amount, credit_limit, last_purchase_at, last_payment_at):
    if due_amount <= 0:
        return "Clear"
    if credit_limit and due_amount > float(credit_limit):
        return "Credit Limit Reached"

    dates = [d for d in [last_purchase_at, last_payment_at] if d]
    if dates:
        latest = max(dates)
        if isinstance(latest, str):
            latest = datetime.fromisoformat(latest.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - latest > timedelta(days=OVERDUE_AFTER_DAYS):
            return "Overdue"

    return "Due"


def get_pending_items(customer_id, limit=15):
    result = (
        supabase.table("transactions")
        .select("products")
        .eq("customer_id", customer_id)
        .eq("type", "purchase")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    seen = []
    for row in result.data:
        for p in (row.get("products") or []):
            if p not in seen:
                seen.append(p)
    return seen


def require_login(f):
    """All customer-facing routes need an active shopkeeper session."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("shopkeeper_id"):
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        return f(*args, **kwargs)
    return wrapper


# ============================================================
# Page routes
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")


# ============================================================
# Shopkeeper auth
# ============================================================

# ============================================================
# Payment-details validation
# UPI ID: only FORMAT is checked.
# ============================================================

UPI_ID_PATTERN = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$")


def validate_upi_id_format(upi_id):
    if not upi_id or not UPI_ID_PATTERN.match(upi_id):
        return "UPI ID doesn't look right. It should look like name@bankhandle (e.g. 9876543210@ybl)."
    return None


@app.route("/shopkeeper/register", methods=["POST"])
def shopkeeper_register():
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    form = request.form
    name = form.get("name", "").strip()
    phone = form.get("phone", "").strip()
    shop_name = form.get("shop_name", "").strip()
    shop_address = form.get("shop_address", "").strip()
    password = form.get("password", "")
    upi_id = form.get("upi_id", "").strip()

    if not name or not phone or not shop_name:
        return jsonify({"status": "error", "message": "Name, phone, and shop name are required"}), 400

    _, phone_error = validate_mobile(phone)
    if phone_error or len(phone) != 10:
        return jsonify({"status": "error", "message": "Phone number must be exactly 10 digits"}), 400

    password_error = validate_password(password)
    if password_error:
        return jsonify({"status": "error", "message": password_error}), 400

    # Payment details are compulsory — a shop can't be created without
    # somewhere for customers to send repayments. Customers are shown
    # both the shop's UPI ID and its registered phone number.
    if not upi_id:
        return jsonify({"status": "error", "message": "UPI ID is required."}), 400

    upi_error = validate_upi_id_format(upi_id)
    if upi_error:
        return jsonify({"status": "error", "message": upi_error}), 400

    existing_upi = supabase.table("shopkeepers").select("id").ilike("upi_id", upi_id).execute()
    if existing_upi.data:
        return jsonify({"status": "error", "message": "This UPI ID is already linked to another shop on Khata."}), 409

    default_credit_limit = float(form["default_credit_limit"]) if form.get("default_credit_limit") else 0

    existing_phone = supabase.table("shopkeepers").select("id").eq("phone", phone).execute()
    if existing_phone.data:
        return jsonify({"status": "error", "message": "This phone number is already registered to a shop account."}), 409

    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)
    if embedding is None:
        return jsonify({"status": "error", "message": "No face detected in photo. Please retake it."}), 400

    # Check if this face already belongs to a registered shop — catches the
    # case where someone tries to register a second time with a different
    # phone number.
    face_match = supabase.rpc("match_shopkeeper", {"query_embedding": embedding}).execute()
    if face_match.data:
        best = face_match.data[0]
        if best["similarity"] >= SHOPKEEPER_MATCH_THRESHOLD:
            return jsonify({
                "status": "already_registered",
                "message": f"You're already registered as the owner of '{best['shop_name']}'. Please log in instead.",
                "shop_name": best["shop_name"],
            }), 409

    file_path = f"{uuid.uuid4()}.jpg"
    try:
        supabase.storage.from_(SHOPKEEPER_BUCKET).upload(
            file_path, image_bytes, {"content-type": "image/jpeg"}
        )
    except Exception as e:
        print(f"[shopkeeper photo upload failed] {e}")
        return jsonify({
            "status": "error",
            "message": "Couldn't upload your photo. If you're the developer: make sure a Supabase Storage bucket named 'shopkeeper-photos' exists and is set to public.",
        }), 502
    photo_url = supabase.storage.from_(SHOPKEEPER_BUCKET).get_public_url(file_path)

    # Generate a unique_id, retrying on the rare collision
    unique_id = generate_unique_id()
    for _ in range(5):
        clash = supabase.table("shopkeepers").select("id").eq("unique_id", unique_id).execute()
        if not clash.data:
            break
        unique_id = generate_unique_id()

    row = {
        "name": name,
        "phone": phone,
        "shop_name": shop_name,
        "shop_address": shop_address or None,
        "password_hash": generate_password_hash(password),
        "unique_id": unique_id,
        "default_credit_limit": default_credit_limit,
        "upi_id": upi_id,
        "photo_url": photo_url,
        "embedding": embedding,
    }

    try:
        result = supabase.table("shopkeepers").insert(row).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            return jsonify({"status": "error", "message": "Phone number or generated ID already in use — please try again."}), 409
        raise

    shopkeeper = result.data[0]
    session["shopkeeper_id"] = shopkeeper["id"]

    return jsonify({
        "status": "registered",
        "shop_name": shopkeeper["shop_name"],
        "name": shopkeeper["name"],
        "unique_id": unique_id, 
    })


@app.route("/shopkeeper/login/scan", methods=["POST"])
def shopkeeper_login_scan():
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)
    if embedding is None:
        return jsonify({"status": "no_face_detected"})

    try:
        result = supabase.rpc("match_shopkeeper", {"query_embedding": embedding}).execute()
    except Exception as e:
        print(f"[/shopkeeper/login/scan] match_shopkeeper RPC failed: {e}")
        return jsonify({
            "status": "error",
            "message": "Face matching failed on the server. Check that database/schema.sql has been "
                        "run in Supabase.",
        }), 500

    if not result.data:
        return jsonify({"status": "not_matched"})

    best = result.data[0]
    if best["similarity"] >= SHOPKEEPER_MATCH_THRESHOLD:
        session["shopkeeper_id"] = best["id"]
        return jsonify({"status": "logged_in", "shop_name": best["shop_name"], "name": best["name"]})

    return jsonify({"status": "not_matched", "similarity": best["similarity"]})


@app.route("/shopkeeper/login/password", methods=["POST"])
def shopkeeper_login_password():
    body = request.get_json()
    phone = (body.get("phone") or "").strip()
    password = body.get("password") or ""

    result = supabase.table("shopkeepers").select("*").eq("phone", phone).execute()
    if not result.data or not check_password_hash(result.data[0]["password_hash"], password):
        return jsonify({"status": "error", "message": "Incorrect phone number or password"}), 401

    shopkeeper = result.data[0]
    session["shopkeeper_id"] = shopkeeper["id"]
    return jsonify({"status": "logged_in", "shop_name": shopkeeper["shop_name"], "name": shopkeeper["name"]})


@app.route("/shopkeeper/login/unique-id", methods=["POST"])
def shopkeeper_login_unique_id():
    body = request.get_json()
    unique_id = (body.get("unique_id") or "").strip().upper()

    result = supabase.table("shopkeepers").select("*").eq("unique_id", unique_id).execute()
    if not result.data:
        return jsonify({"status": "error", "message": "Unique ID not recognized"}), 401

    shopkeeper = result.data[0]
    session["shopkeeper_id"] = shopkeeper["id"]
    return jsonify({"status": "logged_in", "shop_name": shopkeeper["shop_name"], "name": shopkeeper["name"]})


@app.route("/shopkeeper/logout", methods=["POST"])
def shopkeeper_logout():
    session.pop("shopkeeper_id", None)
    return jsonify({"status": "logged_out"})


# ============================================================
# Bank-details edit re-authentication
# ============================================================

BANK_EDIT_AUTH_VALIDITY_MINUTES = 10


def _grant_bank_edit_auth(shop_id):
    supabase.table("bank_edit_authorizations").upsert({
        "shopkeeper_id": shop_id,
        "authorized_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


@app.route("/shopkeeper/reauth/password", methods=["POST"])
@require_login
def reauth_password():
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    password = body.get("password") or ""

    result = supabase.table("shopkeepers").select("password_hash").eq("id", shop_id).execute()
    if not result.data or not check_password_hash(result.data[0]["password_hash"], password):
        return jsonify({"status": "error", "message": "Incorrect password"}), 401

    _grant_bank_edit_auth(shop_id)
    return jsonify({"status": "authorized"})


@app.route("/shopkeeper/reauth/unique-id", methods=["POST"])
@require_login
def reauth_unique_id():
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    unique_id = (body.get("unique_id") or "").strip().upper()

    result = supabase.table("shopkeepers").select("unique_id").eq("id", shop_id).execute()
    if not result.data or result.data[0]["unique_id"] != unique_id:
        return jsonify({"status": "error", "message": "Unique ID not recognized"}), 401

    _grant_bank_edit_auth(shop_id)
    return jsonify({"status": "authorized"})


@app.route("/shopkeeper/reauth/scan", methods=["POST"])
@require_login
def reauth_scan():
    shop_id = session["shopkeeper_id"]
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)
    if embedding is None:
        return jsonify({"status": "no_face_detected"})

    result = supabase.rpc("match_shopkeeper", {"query_embedding": embedding}).execute()
    if not result.data:
        return jsonify({"status": "error", "message": "Face not recognized"}), 401

    best = result.data[0]
    # Must match THIS specific account, not just any registered shop.
    if best["id"] != shop_id or best["similarity"] < SHOPKEEPER_MATCH_THRESHOLD:
        return jsonify({"status": "error", "message": "Face didn't match this shop's owner"}), 401

    _grant_bank_edit_auth(shop_id)
    return jsonify({"status": "authorized"})


def _check_bank_edit_auth(shop_id):
    result = supabase.table("bank_edit_authorizations").select("authorized_at").eq("shopkeeper_id", shop_id).execute()
    if not result.data:
        return False
    authorized_at = datetime.fromisoformat(result.data[0]["authorized_at"].replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - authorized_at <= timedelta(minutes=BANK_EDIT_AUTH_VALIDITY_MINUTES)


@app.route("/shopkeeper/bank-details", methods=["GET"])
@require_login
def get_bank_details():
    shop_id = session["shopkeeper_id"]
    result = supabase.table("shopkeepers").select("upi_id, phone").eq("id", shop_id).execute()
    if not result.data:
        return jsonify({"status": "error", "message": "Shop not found"}), 404
    row = result.data[0]
    return jsonify({
        "status": "ok",
        "configured": bool(row.get("upi_id")),
        "upi_id": row.get("upi_id"),
        "phone": row.get("phone"),
    })


@app.route("/shopkeeper/bank-details", methods=["PUT"])
@require_login
def update_bank_details():
    shop_id = session["shopkeeper_id"]

    if not _check_bank_edit_auth(shop_id):
        return jsonify({"status": "error", "message": "Please re-verify your identity before editing payment details."}), 403

    upi_id = (request.form.get("upi_id") or "").strip()

    if not upi_id:
        return jsonify({"status": "error", "message": "UPI ID is required."}), 400

    upi_error = validate_upi_id_format(upi_id)
    if upi_error:
        return jsonify({"status": "error", "message": upi_error}), 400

    existing_upi = (
        supabase.table("shopkeepers").select("id").ilike("upi_id", upi_id)
        .neq("id", shop_id).execute()
    )
    if existing_upi.data:
        return jsonify({"status": "error", "message": "This UPI ID is already linked to another shop on Khata."}), 409

    updates = {
        "upi_id": upi_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        supabase.table("shopkeepers").update(updates).eq("id", shop_id).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            return jsonify({"status": "error", "message": "That UPI ID is already linked to another shop."}), 409
        raise

    # One-time authorization, consumed now that the edit succeeded.
    supabase.table("bank_edit_authorizations").delete().eq("shopkeeper_id", shop_id).execute()

    return jsonify({"status": "updated"})


@app.route("/shopkeeper/session", methods=["GET"])
def shopkeeper_session():
    shopkeeper_id = session.get("shopkeeper_id")
    if not shopkeeper_id:
        return jsonify({"logged_in": False})

    result = supabase.table("shopkeepers").select("name, shop_name, default_credit_limit").eq("id", shopkeeper_id).execute()
    if not result.data:
        session.pop("shopkeeper_id", None)
        return jsonify({"logged_in": False})

    row = result.data[0]
    return jsonify({
        "logged_in": True,
        "name": row["name"],
        "shop_name": row["shop_name"],
        "default_credit_limit": float(row.get("default_credit_limit") or 0),
    })


@app.route("/shop/credit-limit", methods=["POST"])
@require_login
def update_credit_limit():
    """One credit limit for the whole shop, not per-customer. Changing it
    here updates the shopkeeper's stored default AND every existing
    customer's credit_limit — 'permanent until changed' means changing it
    is a real, shop-wide edit, not just a setting for future customers."""
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    try:
        new_limit = float(body.get("credit_limit", 0))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Credit limit must be a number"}), 400
    if new_limit < 0:
        return jsonify({"status": "error", "message": "Credit limit cannot be negative"}), 400

    supabase.table("shopkeepers").update({"default_credit_limit": new_limit}).eq("id", shop_id).execute()
    supabase.table("customers").update({"credit_limit": new_limit}).eq("shopkeeper_id", shop_id).execute()

    return jsonify({"status": "updated", "credit_limit": new_limit})


# ============================================================
# Customer routes — all scoped to the logged-in shopkeeper
# ============================================================

@app.route("/identify", methods=["POST"])
@require_login
def identify():
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    shop_id = session["shopkeeper_id"]
    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)

    if embedding is None:
        return jsonify({"status": "no_face_detected"})

    try:
        result = supabase.rpc("match_customer", {"query_embedding": embedding, "shop_id": shop_id}).execute()
    except Exception as e:
        print(f"[/identify] match_customer RPC failed: {e}")
        return jsonify({
            "status": "error",
            "message": "Face matching failed on the server. This usually means database/schema.sql "
                        "needs to be re-run in Supabase — the match_customer function signature may be "
                        "out of date.",
        }), 500

    if not result.data:
        return jsonify({"status": "new_customer", "similarity": 0})

    best = result.data[0]
    if best["similarity"] >= MATCH_THRESHOLD:
        best["pending_items"] = get_pending_items(best["id"])
        return jsonify({"status": "known_customer", "data": best, "similarity": best["similarity"]})

    return jsonify({"status": "new_customer", "similarity": best["similarity"]})


@app.route("/customers", methods=["POST"])
@require_login
def create_customer():
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    shop_id = session["shopkeeper_id"]
    form = request.form
    raw_mobile = form.get("mobile", "").strip()
    mobile, mobile_error = validate_mobile(raw_mobile)
    if mobile_error:
        return jsonify({"status": "error", "message": mobile_error}), 400
    mobile = mobile if mobile else None

    if mobile:
        existing_phone = (
            supabase.table("customers")
            .select("id, name")
            .eq("shopkeeper_id", shop_id)
            .eq("mobile", mobile)
            .execute()
        )
        if existing_phone.data:
            existing_name = existing_phone.data[0]["name"]
            return jsonify({
                "status": "duplicate_phone",
                "message": f"This phone number is already registered to {existing_name}.",
            }), 409

    # Credit limit is shop-wide — we'll check the computed starting amount
    # against it below, before doing any photo/embedding work.
    shop_row = supabase.table("shopkeepers").select("default_credit_limit").eq("id", shop_id).execute()
    shop_credit_limit = float(shop_row.data[0]["default_credit_limit"]) if shop_row.data else 0

    try:
        items = json.loads(form.get("items", "[]"))
        custom_items = json.loads(form.get("custom_items", "[]"))
    except json.JSONDecodeError:
        items, custom_items = [], []

    priced = _price_items(shop_id, items, custom_items)
    if "error" in priced:
        return jsonify({"status": "error", "message": priced["error"]}), 400
    initial_amount = priced["amount"]
    products = priced["products"]

    if shop_credit_limit > 0 and initial_amount > shop_credit_limit:
        return jsonify({
            "status": "limit_exceeded",
            "message": f"Starting due amount exceeds the shop's credit limit of ₹{shop_credit_limit:.0f}.",
            "credit_limit": shop_credit_limit,
        }), 400

    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)
    if embedding is None:
        return jsonify({"status": "error", "message": "No face detected in photo"}), 400

    file_path = f"{uuid.uuid4()}.jpg"
    try:
        supabase.storage.from_(CUSTOMER_BUCKET).upload(
            file_path, image_bytes, {"content-type": "image/jpeg"}
        )
    except Exception as e:
        print(f"[customer photo upload failed] {e}")
        return jsonify({
            "status": "error",
            "message": "Couldn't upload the photo. If you're the developer: make sure a Supabase Storage bucket named 'customer-photos' exists and is set to public.",
        }), 502
    photo_url = supabase.storage.from_(CUSTOMER_BUCKET).get_public_url(file_path)

    now = datetime.now(timezone.utc).isoformat()

    row = {
        "shopkeeper_id": shop_id,
        "name": form.get("name"),
        "mobile": mobile,
        "address": form.get("address") or None,
        "photo_url": photo_url,
        "embedding": embedding,
        "due_amount": initial_amount,
        "credit_limit": shop_credit_limit,
        "total_purchases": initial_amount,
        "last_purchase_amount": initial_amount if initial_amount > 0 else None,
        "last_purchase_at": now if initial_amount > 0 else None,
        "status": compute_status(initial_amount, shop_credit_limit, now if initial_amount > 0 else None, None),
    }

    try:
        result = supabase.table("customers").insert(row).execute()
    except Exception as e:
        if "customers_shop_mobile_unique" in str(e) or "duplicate key" in str(e).lower():
            return jsonify({"status": "duplicate_phone", "message": "This phone number is already registered."}), 409
        raise

    customer = result.data[0]

    if initial_amount > 0:
        supabase.table("transactions").insert({
            "customer_id": customer["id"],
            "type": "purchase",
            "amount": initial_amount,
            "products": products,
        }).execute()

    customer["pending_items"] = products if initial_amount > 0 else []
    return jsonify({"status": "created", "data": customer})


def _price_items(shop_id, items, custom_items):
    """Shared pricing logic: looks up each item's price from the shop's
    live catalog (never trusts a client-sent price), blocks out-of-stock
    items, and returns (amount, product_summary_list) or raises a tuple
    (error_message, http_status) via the returned 'error' key."""
    product_ids = [i["product_id"] for i in items if i.get("product_id")]
    products_by_id = {}
    if product_ids:
        prod_result = supabase.table("products").select("*").eq("shopkeeper_id", shop_id).in_("id", product_ids).execute()
        products_by_id = {p["id"]: p for p in prod_result.data}

    amount = 0.0
    product_summary = []

    for item in items:
        pid = item.get("product_id")
        try:
            qty = int(item.get("quantity", 1))
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0:
            continue

        product = products_by_id.get(pid)
        if not product:
            return {"error": "One of the selected products no longer exists"}
        if not product["in_stock"]:
            return {"error": f'"{product["name"]}" is marked out of stock.'}

        price = float(product["price"])
        amount += price * qty
        label = f'{product["name"]} x{qty}' if qty > 1 else product["name"]
        product_summary.append(f'{label} (₹{price:.0f})')

    for item in custom_items:
        name = (item.get("name") or "").strip()
        try:
            price = float(item.get("price", 0))
            qty = int(item.get("quantity", 1))
        except (TypeError, ValueError):
            continue
        if not name or price <= 0 or qty <= 0:
            continue
        amount += price * qty
        label = f'{name} x{qty}' if qty > 1 else name
        product_summary.append(f'{label} (₹{price:.0f})')

    return {"amount": round(amount, 2), "products": product_summary[:MAX_PRODUCTS_PER_TRANSACTION]}


def _get_own_customer(customer_id, shop_id):
    """Fetch a customer row only if it belongs to the current shop."""
    result = (
        supabase.table("customers")
        .select("*")
        .eq("id", customer_id)
        .eq("shopkeeper_id", shop_id)
        .execute()
    )
    return result.data[0] if result.data else None


@app.route("/customers/<customer_id>/purchase", methods=["POST"])
@require_login
def add_purchase(customer_id):
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    items = body.get("items", [])            # [{product_id, quantity}]
    custom_items = body.get("custom_items", [])  # [{name, price, quantity}] — fallback for one-off items not in the catalog

    if not items and not custom_items:
        return jsonify({"status": "error", "message": "Add at least one product"}), 400

    customer = _get_own_customer(customer_id, shop_id)
    if not customer:
        return jsonify({"status": "error", "message": "Customer not found"}), 404

    # Price is computed here, from the shop's own catalog — never trusted
    # from the client — so every customer pays the same price for the
    priced = _price_items(shop_id, items, custom_items)
    if "error" in priced:
        return jsonify({"status": "error", "message": priced["error"]}), 400

    amount = priced["amount"]
    if amount <= 0:
        return jsonify({"status": "error", "message": "Amount must be greater than 0"}), 400

    products = priced["products"]

    now = datetime.now(timezone.utc).isoformat()
    current_due = float(customer["due_amount"])
    credit_limit = float(customer.get("credit_limit") or 0)
    new_due = current_due + amount

    # Hard enforcement: 0 means no limit set, so only block when a real
    # limit exists and this purchase would push the customer over it.
    if credit_limit > 0 and new_due > credit_limit:
        remaining_room = round(max(credit_limit - current_due, 0), 2)
        return jsonify({
            "status": "limit_exceeded",
            "message": f"This would exceed the shop's credit limit of ₹{credit_limit:.0f}. "
                       f"This customer can take at most ₹{remaining_room:.0f} more credit.",
            "credit_limit": credit_limit,
            "current_due": current_due,
            "remaining_room": remaining_room,
        }), 400

    new_total = float(customer["total_purchases"]) + amount
    new_status = compute_status(new_due, credit_limit, now, customer.get("last_payment_at"))

    supabase.table("customers").update({
        "due_amount": new_due,
        "total_purchases": new_total,
        "last_purchase_amount": amount,
        "last_purchase_at": now,
        "status": new_status,
        "updated_at": now,
    }).eq("id", customer_id).execute()

    supabase.table("transactions").insert({
        "customer_id": customer_id,
        "type": "purchase",
        "amount": amount,
        "products": products,
    }).execute()

    return jsonify({
        "status": "updated",
        "due_amount": new_due,
        "amount_charged": amount,
        "customer_status": new_status,
        "pending_items": get_pending_items(customer_id),
    })


@app.route("/customers/<customer_id>/payment", methods=["POST"])
@require_login
def record_payment(customer_id):
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    amount = float(body.get("amount", 0))

    if amount <= 0:
        return jsonify({"status": "error", "message": "Amount must be greater than 0"}), 400

    customer = _get_own_customer(customer_id, shop_id)
    if not customer:
        return jsonify({"status": "error", "message": "Customer not found"}), 404

    new_due = round(float(customer["due_amount"]) - amount, 2)

    supabase.table("transactions").insert({
        "customer_id": customer_id,
        "type": "payment",
        "amount": amount,
    }).execute()

    now = datetime.now(timezone.utc).isoformat()

    if new_due <= 0:
        supabase.table("customers").update({
            "due_amount": 0,
            "last_payment_amount": amount,
            "last_payment_at": now,
            "status": "Clear",
            "updated_at": now,
        }).eq("id", customer_id).execute()
        return jsonify({
            "status": "cleared",
            "message": f"{customer['name']}'s account is fully paid",
        })

    new_status = compute_status(new_due, customer.get("credit_limit"), customer.get("last_purchase_at"), now)

    supabase.table("customers").update({
        "due_amount": new_due,
        "last_payment_amount": amount,
        "last_payment_at": now,
        "status": new_status,
        "updated_at": now,
    }).eq("id", customer_id).execute()

    return jsonify({
        "status": "updated",
        "due_amount": new_due,
        "customer_status": new_status,
        "pending_items": get_pending_items(customer_id),
    })


@app.route("/customers/<customer_id>/transactions", methods=["GET"])
@require_login
def get_transactions(customer_id):
    shop_id = session["shopkeeper_id"]
    customer = _get_own_customer(customer_id, shop_id)
    if not customer:
        return jsonify({"status": "error", "message": "Customer not found"}), 404

    result = (
        supabase.table("transactions")
        .select("*")
        .eq("customer_id", customer_id)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return jsonify(result.data)


@app.route("/products", methods=["GET"])
@require_login
def list_products():
    shop_id = session["shopkeeper_id"]
    result = supabase.table("products").select("*").eq("shopkeeper_id", shop_id).order("name").execute()
    return jsonify(result.data)


@app.route("/products", methods=["POST"])
@require_login
def create_product():
    shop_id = session["shopkeeper_id"]
    body = request.get_json()
    name = (body.get("name") or "").strip()

    if not name:
        return jsonify({"status": "error", "message": "Product name is required"}), 400
    try:
        price = float(body.get("price", 0))
    except (TypeError, ValueError):
        return jsonify({"status": "error", "message": "Price must be a number"}), 400
    if price <= 0:
        return jsonify({"status": "error", "message": "Price must be greater than 0"}), 400

    existing = supabase.table("products").select("id").eq("shopkeeper_id", shop_id).ilike("name", name).execute()
    if existing.data:
        return jsonify({"status": "error", "message": f'"{name}" is already in your product list.'}), 409

    row = {"shopkeeper_id": shop_id, "name": name, "price": price, "in_stock": True}
    result = supabase.table("products").insert(row).execute()
    return jsonify({"status": "created", "data": result.data[0]})


def _get_own_product(product_id, shop_id):
    result = supabase.table("products").select("*").eq("id", product_id).eq("shopkeeper_id", shop_id).execute()
    return result.data[0] if result.data else None


@app.route("/products/<product_id>", methods=["PUT"])
@require_login
def update_product(product_id):
    shop_id = session["shopkeeper_id"]
    if not _get_own_product(product_id, shop_id):
        return jsonify({"status": "error", "message": "Product not found"}), 404

    body = request.get_json()
    updates = {}

    if "name" in body:
        name = (body["name"] or "").strip()
        if not name:
            return jsonify({"status": "error", "message": "Product name cannot be empty"}), 400
        updates["name"] = name
    if "price" in body:
        try:
            price = float(body["price"])
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "Price must be a number"}), 400
        if price <= 0:
            return jsonify({"status": "error", "message": "Price must be greater than 0"}), 400
        updates["price"] = price
    if "in_stock" in body:
        updates["in_stock"] = bool(body["in_stock"])

    if not updates:
        return jsonify({"status": "error", "message": "Nothing to update"}), 400
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = supabase.table("products").update(updates).eq("id", product_id).execute()
    except Exception as e:
        if "unique" in str(e).lower():
            return jsonify({"status": "error", "message": "A product with that name already exists."}), 409
        raise

    return jsonify({"status": "updated", "data": result.data[0]})


@app.route("/products/<product_id>", methods=["DELETE"])
@require_login
def delete_product(product_id):
    shop_id = session["shopkeeper_id"]
    if not _get_own_product(product_id, shop_id):
        return jsonify({"status": "error", "message": "Product not found"}), 404
    supabase.table("products").delete().eq("id", product_id).execute()
    return jsonify({"status": "deleted"})


@app.route("/customers/due-list", methods=["GET"])
@require_login
def due_list():
    shop_id = session["shopkeeper_id"]
    result = (
        supabase.table("customers")
        .select("id, name, mobile, total_purchases, due_amount, last_purchase_at")
        .eq("shopkeeper_id", shop_id)
        .gt("due_amount", 0)
        .order("due_amount", desc=True)
        .execute()
    )
    rows = []
    for c in result.data:
        rows.append({
            "id": c["id"],
            "name": c["name"],
            "mobile": c.get("mobile") or "",
            "amount_took": float(c["total_purchases"]),
            "amount_paid": round(float(c["total_purchases"]) - float(c["due_amount"]), 2),
            "amount_left": float(c["due_amount"]),
            "last_purchase_at": c.get("last_purchase_at"),
        })
    return jsonify(rows)


# ============================================================
# Customer portal — no shopkeeper login required. A customer proves who
# they are via face match (primary) or name + phone (fallback), and sees
# their credit summary across every shop registered in this system.
# ============================================================

CUSTOMER_LOOKUP_THRESHOLD = 0.6  # stricter than shop-scoped matching, since
                                   # this searches across every shop at once


def _group_global_matches(rows):
    """Dedupe to the best match per shop, format for the frontend."""
    best_per_shop = {}
    for r in rows:
        if r["similarity"] < CUSTOMER_LOOKUP_THRESHOLD:
            continue
        shop_id = r["shopkeeper_id"]
        if shop_id not in best_per_shop or r["similarity"] > best_per_shop[shop_id]["similarity"]:
            best_per_shop[shop_id] = r
    matches = list(best_per_shop.values())
    matches.sort(key=lambda r: float(r["due_amount"]), reverse=True)
    return matches


@app.route("/customer-portal/identify", methods=["POST"])
def customer_portal_identify():
    if "photo" not in request.files:
        return jsonify({"status": "error", "message": "No photo uploaded"}), 400

    image_bytes = request.files["photo"].read()
    embedding = get_embedding(image_bytes)
    if embedding is None:
        return jsonify({"status": "no_face_detected"})

    try:
        result = supabase.rpc("match_customer_global", {"query_embedding": embedding}).execute()
    except Exception as e:
        print(f"[/customer-portal/identify] match_customer_global RPC failed: {e}")
        return jsonify({
            "status": "error",
            "message": "Lookup failed on the server. database/schema.sql may need to be re-run in Supabase.",
        }), 500

    matches = _group_global_matches(result.data or [])
    if not matches:
        return jsonify({"status": "not_found"})

    customer_name = matches[0]["customer_name"]
    return jsonify({"status": "found", "customer_name": customer_name, "shops": matches})


@app.route("/customer-portal/lookup", methods=["POST"])
def customer_portal_lookup():
    body = request.get_json()
    name = (body.get("name") or "").strip()
    phone = (body.get("phone") or "").strip()

    if not name or not phone:
        return jsonify({"status": "error", "message": "Name and phone number are required"}), 400

    result = (
        supabase.table("customers")
        .select("id, shopkeeper_id, name, mobile, due_amount, total_purchases, "
                "last_purchase_amount, last_purchase_at, last_payment_amount, last_payment_at")
        .ilike("name", name)
        .eq("mobile", phone)
        .execute()
    )

    if not result.data:
        return jsonify({"status": "not_found"})

    # Attach shop names (one query, since result set is small)
    shop_ids = list({row["shopkeeper_id"] for row in result.data})
    shops_result = supabase.table("shopkeepers").select("id, shop_name").in_("id", shop_ids).execute()
    shop_name_by_id = {s["id"]: s["shop_name"] for s in shops_result.data}

    matches = []
    for row in result.data:
        matches.append({
            "customer_id": row["id"],
            "shopkeeper_id": row["shopkeeper_id"],
            "shop_name": shop_name_by_id.get(row["shopkeeper_id"], "Unknown shop"),
            "customer_name": row["name"],
            "mobile": row["mobile"],
            "due_amount": row["due_amount"],
            "total_purchases": row["total_purchases"],
            "last_purchase_amount": row.get("last_purchase_amount"),
            "last_purchase_at": row.get("last_purchase_at"),
            "last_payment_amount": row.get("last_payment_amount"),
            "last_payment_at": row.get("last_payment_at"),
        })
    matches.sort(key=lambda r: float(r["due_amount"]), reverse=True)

    return jsonify({"status": "found", "customer_name": matches[0]["customer_name"], "shops": matches})


@app.route("/customer-portal/transactions/<customer_id>", methods=["GET"])
def customer_portal_transactions(customer_id):
    # No shopkeeper session needed here either — customer_id is an
    # unguessable UUID the customer only receives after a successful
    # identity match above, which is this endpoint's practical gate.
    result = (
        supabase.table("transactions")
        .select("*")
        .eq("customer_id", customer_id)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
    )
    return jsonify(result.data)


@app.route("/customer-portal/shop-products/<shopkeeper_id>", methods=["GET"])
def customer_portal_shop_products(shopkeeper_id):
    """Read-only, public catalog browse for one shop — powers the product
    picker a customer uses to build a credit request. Out-of-stock items
    are excluded entirely rather than shown disabled, since a customer
    self-service request has no shopkeeper standing right there to explain."""
    result = (
        supabase.table("products")
        .select("id, name, price")
        .eq("shopkeeper_id", shopkeeper_id)
        .eq("in_stock", True)
        .order("name")
        .execute()
    )
    return jsonify(result.data)


@app.route("/customer-portal/request-credit", methods=["POST"])
def customer_portal_request_credit():
    body = request.get_json()
    customer_id = body.get("customer_id")
    shopkeeper_id = body.get("shopkeeper_id")
    items = body.get("items", [])

    if not customer_id or not shopkeeper_id or not items:
        return jsonify({"status": "error", "message": "Missing customer, shop, or products"}), 400

    # Confirm this customer actually belongs to this shop before anything else
    customer_check = (
        supabase.table("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("shopkeeper_id", shopkeeper_id)
        .execute()
    )
    if not customer_check.data:
        return jsonify({"status": "error", "message": "Customer not found at this shop"}), 404

    # Price is computed here from the shop's live catalog — never trusted
    # from the client — exactly like the in-person purchase flow.
    product_ids = [i["product_id"] for i in items if i.get("product_id")]
    prod_result = (
        supabase.table("products")
        .select("*")
        .eq("shopkeeper_id", shopkeeper_id)
        .in_("id", product_ids)
        .execute()
    )
    products_by_id = {p["id"]: p for p in prod_result.data}

    amount = 0.0
    request_items = []
    for item in items:
        pid = item.get("product_id")
        try:
            qty = int(item.get("quantity", 1))
        except (TypeError, ValueError):
            qty = 1
        if qty <= 0:
            continue
        product = products_by_id.get(pid)
        if not product:
            return jsonify({"status": "error", "message": "One of the selected products is no longer available"}), 400
        if not product["in_stock"]:
            return jsonify({"status": "error", "message": f'"{product["name"]}" is out of stock.'}), 400

        price = float(product["price"])
        amount += price * qty
        request_items.append({"product_id": pid, "name": product["name"], "price": price, "quantity": qty})

    amount = round(amount, 2)
    if amount <= 0:
        return jsonify({"status": "error", "message": "Select at least one product"}), 400

    row = {
        "customer_id": customer_id,
        "shopkeeper_id": shopkeeper_id,
        "items": request_items,
        "amount": amount,
        "status": "pending",
    }
    result = supabase.table("credit_requests").insert(row).execute()

    return jsonify({"status": "requested", "amount": amount, "request_id": result.data[0]["id"]})


@app.route("/customer-portal/request-status/<request_id>", methods=["GET"])
def customer_portal_request_status(request_id):
    """Polled by the customer portal after submitting a request. Returns
    'pending' while waiting, 'confirmed' the moment the shop owner has
    approved it — and deletes the row right then, since this poll is the
    customer's only chance to see the result before it's gone."""
    result = supabase.table("credit_requests").select("*").eq("id", request_id).execute()
    if not result.data:
        return jsonify({"status": "not_found"})

    req = result.data[0]
    if req["status"] == "confirmed":
        supabase.table("credit_requests").delete().eq("id", request_id).execute()
        return jsonify({"status": "confirmed", "amount": req["amount"]})

    return jsonify({"status": "pending"})


# ============================================================
# Customer repayment — bank transfer / UPI
# ============================================================

@app.route("/customer-portal/shop-payment-details/<shopkeeper_id>", methods=["GET"])
def customer_portal_shop_payment_details(shopkeeper_id):
    result = supabase.table("shopkeepers").select("shop_name, upi_id, phone").eq("id", shopkeeper_id).execute()
    if not result.data:
        return jsonify({"status": "error", "message": "Shop not found"}), 404

    row = result.data[0]
    if not row.get("upi_id"):
        return jsonify({"status": "not_configured", "message": "This shop hasn't set up payment details yet."}), 400

    return jsonify({
        "status": "ok",
        "shop_name": row["shop_name"],
        "upi_id": row["upi_id"],
        "phone": row.get("phone"),
    })


@app.route("/customer-portal/pay", methods=["POST"])
def customer_portal_pay():
    customer_id = request.form.get("customer_id")
    shopkeeper_id = request.form.get("shopkeeper_id")
    method = request.form.get("method")
    try:
        amount = float(request.form.get("amount", 0))
    except (TypeError, ValueError):
        amount = 0

    if not customer_id or not shopkeeper_id:
        return jsonify({"status": "error", "message": "Missing customer or shop"}), 400
    if method not in ("upi",):
        return jsonify({"status": "error", "message": "Choose a payment method"}), 400
    if amount <= 0:
        return jsonify({"status": "error", "message": "Enter an amount greater than zero"}), 400
    if "screenshot" not in request.files or not request.files["screenshot"].filename:
        return jsonify({"status": "error", "message": "Please attach a screenshot of your payment as proof."}), 400

    customer_check = (
        supabase.table("customers").select("id, due_amount")
        .eq("id", customer_id).eq("shopkeeper_id", shopkeeper_id).execute()
    )
    if not customer_check.data:
        return jsonify({"status": "error", "message": "Customer not found at this shop"}), 404

    due_amount = float(customer_check.data[0]["due_amount"])
    if amount > due_amount:
        return jsonify({"status": "error", "message": f"That's more than the ₹{due_amount:.0f} currently due."}), 400

    screenshot_file = request.files["screenshot"]
    screenshot_bytes = screenshot_file.read()
    content_type = screenshot_file.content_type or "image/jpeg"
    ext = "png" if "png" in content_type else "jpg"
    screenshot_path = f"{uuid.uuid4()}.{ext}"
    try:
        supabase.storage.from_(PAYMENT_SCREENSHOT_BUCKET).upload(screenshot_path, screenshot_bytes, {"content-type": content_type})
    except Exception as e:
        print(f"[screenshot upload failed] {e}")
        return jsonify({
            "status": "error",
            "message": "Couldn't upload your screenshot. If you're the developer: make sure a Supabase Storage bucket named 'payment-screenshots' exists and is set to public.",
        }), 502
    screenshot_url = supabase.storage.from_(PAYMENT_SCREENSHOT_BUCKET).get_public_url(screenshot_path)

    row = {
        "customer_id": customer_id,
        "shopkeeper_id": shopkeeper_id,
        "amount": round(amount, 2),
        "method": method,
        "status": "pending",
        "screenshot_url": screenshot_url,
    }
    result = supabase.table("payment_requests").insert(row).execute()

    return jsonify({"status": "requested", "amount": row["amount"], "payment_id": result.data[0]["id"]})


@app.route("/customer-portal/payment-status/<payment_id>", methods=["GET"])
def customer_portal_payment_status(payment_id):
    """Same claim-and-poll pattern as credit requests — deletes the row
    the moment this poll observes a confirmation."""
    result = supabase.table("payment_requests").select("*").eq("id", payment_id).execute()
    if not result.data:
        return jsonify({"status": "not_found"})

    pay = result.data[0]
    if pay["status"] == "confirmed":
        supabase.table("payment_requests").delete().eq("id", payment_id).execute()
        return jsonify({"status": "confirmed", "amount": pay["amount"]})
    if pay["status"] == "rejected":
        supabase.table("payment_requests").delete().eq("id", payment_id).execute()
        return jsonify({"status": "rejected"})

    return jsonify({"status": "pending"})


@app.route("/shop/payment-requests", methods=["GET"])
@require_login
def list_payment_requests():
    shop_id = session["shopkeeper_id"]
    result = (
        supabase.table("payment_requests")
        .select("*")
        .eq("shopkeeper_id", shop_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    requests_list = result.data
    if not requests_list:
        return jsonify([])

    customer_ids = list({r["customer_id"] for r in requests_list})
    customers_result = supabase.table("customers").select("id, name, mobile, photo_url, due_amount").in_("id", customer_ids).execute()
    customers_by_id = {c["id"]: c for c in customers_result.data}

    enriched = []
    for r in requests_list:
        customer = customers_by_id.get(r["customer_id"], {})
        enriched.append({
            "id": r["id"],
            "customer_id": r["customer_id"],
            "customer_name": customer.get("name", "Unknown"),
            "customer_mobile": customer.get("mobile"),
            "customer_photo_url": customer.get("photo_url"),
            "customer_due": customer.get("due_amount"),
            "amount": r["amount"],
            "method": r["method"],
            "screenshot_url": r.get("screenshot_url"),
            "created_at": r["created_at"],
        })
    return jsonify(enriched)


@app.route("/shop/payment-requests/<payment_id>/confirm", methods=["POST"])
@require_login
def confirm_payment_request(payment_id):
    shop_id = session["shopkeeper_id"]
    req_result = supabase.table("payment_requests").select("*").eq("id", payment_id).eq("shopkeeper_id", shop_id).execute()
    if not req_result.data:
        return jsonify({"status": "error", "message": "Payment claim not found"}), 404
    pay = req_result.data[0]

    customer = _get_own_customer(pay["customer_id"], shop_id)
    if not customer:
        supabase.table("payment_requests").delete().eq("id", payment_id).execute()
        return jsonify({"status": "error", "message": "Customer no longer exists"}), 404

    amount = float(pay["amount"])
    now = datetime.now(timezone.utc).isoformat()
    new_due = max(float(customer["due_amount"]) - amount, 0)
    new_status = "Clear" if new_due <= 0 else compute_status(new_due, customer.get("credit_limit"), customer.get("last_purchase_at"), now)

    # This is the permanent record — kept forever in transactions, visible
    # in both the customer's and shop owner's payment history, unlike the
    # ephemeral payment_requests row which only exists while pending.
    transaction_row = {
        "customer_id": pay["customer_id"],
        "type": "payment",
        "amount": amount,
        "products": [],
        "screenshot_url": pay.get("screenshot_url"),
        "is_online_payment": True,
    }

    # Cleared to zero — the customer record is KEPT (not deleted), same
    # reasoning as the in-person payment flow: deleting it used to
    # cascade-delete every past transaction, breaking payment history.
    supabase.table("customers").update({
        "due_amount": new_due,
        "last_payment_at": now,
        "status": new_status,
        "updated_at": now,
    }).eq("id", pay["customer_id"]).execute()
    supabase.table("transactions").insert(transaction_row).execute()
    supabase.table("payment_requests").update({"status": "confirmed"}).eq("id", payment_id).execute()

    if new_due <= 0:
        return jsonify({"status": "confirmed", "cleared": True, "amount": amount})

    return jsonify({"status": "confirmed", "cleared": False, "due_amount": new_due, "amount": amount})


@app.route("/shop/payment-requests/<payment_id>/cancel", methods=["POST"])
@require_login
def cancel_payment_request(payment_id):
    shop_id = session["shopkeeper_id"]
    existing = supabase.table("payment_requests").select("id").eq("id", payment_id).eq("shopkeeper_id", shop_id).execute()
    if not existing.data:
        return jsonify({"status": "error", "message": "Payment claim not found"}), 404

    # Marked rejected (not deleted outright) so the customer's poll can
    # tell the difference between "shop owner said this didn't arrive"
    # and "already cleaned up after a confirm" — both end in deletion,
    # but the customer sees a different message for each.
    supabase.table("payment_requests").update({"status": "rejected"}).eq("id", payment_id).execute()
    return jsonify({"status": "cancelled"})


@app.route("/shop/online-payments", methods=["GET"])
@require_login
def list_online_payments():
    """Permanent history of online (customer-initiated, screenshot-backed,
    shop-owner-confirmed) payments across the whole shop — deliberately
    excludes in-person payments recorded at the counter, per the 'online
    transactions only' requirement."""
    shop_id = session["shopkeeper_id"]

    customers_result = supabase.table("customers").select("id, name, mobile").eq("shopkeeper_id", shop_id).execute()
    customers_by_id = {c["id"]: c for c in customers_result.data}
    if not customers_by_id:
        return jsonify([])

    result = (
        supabase.table("transactions")
        .select("*")
        .in_("customer_id", list(customers_by_id.keys()))
        .eq("type", "payment")
        .eq("is_online_payment", True)
        .order("created_at", desc=True)
        .limit(1000)
        .execute()
    )

    enriched = []
    for t in result.data:
        customer = customers_by_id.get(t["customer_id"], {})
        enriched.append({
            "id": t["id"],
            "customer_id": t["customer_id"],
            "customer_name": customer.get("name", "Unknown"),
            "customer_mobile": customer.get("mobile"),
            "amount": t["amount"],
            "screenshot_url": t.get("screenshot_url"),
            "created_at": t["created_at"],
        })
    return jsonify(enriched)


@app.route("/shop/credit-requests", methods=["GET"])
@require_login
def list_credit_requests():
    shop_id = session["shopkeeper_id"]
    result = (
        supabase.table("credit_requests")
        .select("*")
        .eq("shopkeeper_id", shop_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    requests_list = result.data
    if not requests_list:
        return jsonify([])

    customer_ids = list({r["customer_id"] for r in requests_list})
    customers_result = supabase.table("customers").select("id, name, mobile, photo_url").in_("id", customer_ids).execute()
    customers_by_id = {c["id"]: c for c in customers_result.data}

    enriched = []
    for r in requests_list:
        customer = customers_by_id.get(r["customer_id"], {})
        enriched.append({
            "id": r["id"],
            "customer_id": r["customer_id"],
            "customer_name": customer.get("name", "Unknown"),
            "customer_mobile": customer.get("mobile"),
            "customer_photo_url": customer.get("photo_url"),
            "items": r["items"],
            "amount": r["amount"],
            "created_at": r["created_at"],
        })
    return jsonify(enriched)


@app.route("/shop/credit-requests/<request_id>/confirm", methods=["POST"])
@require_login
def confirm_credit_request(request_id):
    shop_id = session["shopkeeper_id"]
    req_result = supabase.table("credit_requests").select("*").eq("id", request_id).eq("shopkeeper_id", shop_id).execute()
    if not req_result.data:
        return jsonify({"status": "error", "message": "Request not found"}), 404
    req = req_result.data[0]

    customer = _get_own_customer(req["customer_id"], shop_id)
    if not customer:
        supabase.table("credit_requests").delete().eq("id", request_id).execute()
        return jsonify({"status": "error", "message": "Customer no longer exists"}), 404

    amount = float(req["amount"])
    now = datetime.now(timezone.utc).isoformat()
    current_due = float(customer["due_amount"])
    credit_limit = float(customer.get("credit_limit") or 0)
    new_due = current_due + amount

    # Re-check the credit limit at confirmation time — due amount may have
    # shifted since the request was submitted.
    if credit_limit > 0 and new_due > credit_limit:
        remaining_room = round(max(credit_limit - current_due, 0), 2)
        return jsonify({
            "status": "limit_exceeded",
            "message": f"Confirming this would exceed the shop's credit limit of ₹{credit_limit:.0f}. "
                       f"This customer can take at most ₹{remaining_room:.0f} more credit right now.",
            "remaining_room": remaining_room,
        }), 400

    new_total = float(customer["total_purchases"]) + amount
    new_status = compute_status(new_due, credit_limit, now, customer.get("last_payment_at"))

    supabase.table("customers").update({
        "due_amount": new_due,
        "total_purchases": new_total,
        "last_purchase_amount": amount,
        "last_purchase_at": now,
        "status": new_status,
        "updated_at": now,
    }).eq("id", req["customer_id"]).execute()

    products_summary = []
    for item in req["items"]:
        label = f'{item["name"]} x{item["quantity"]}' if item["quantity"] > 1 else item["name"]
        products_summary.append(f'{label} (₹{item["price"]:.0f})')

    supabase.table("transactions").insert({
        "customer_id": req["customer_id"],
        "type": "purchase",
        "amount": amount,
        "products": products_summary[:MAX_PRODUCTS_PER_TRANSACTION],
    }).execute()

    # Mark confirmed rather than delete — the customer portal's polling
    # is what actually removes this row once it observes the confirmation.
    supabase.table("credit_requests").update({"status": "confirmed"}).eq("id", request_id).execute()

    return jsonify({"status": "confirmed", "due_amount": new_due, "customer_status": new_status})


@app.route("/shop/credit-requests/<request_id>/cancel", methods=["POST"])
@require_login
def cancel_credit_request(request_id):
    shop_id = session["shopkeeper_id"]
    existing = supabase.table("credit_requests").select("id").eq("id", request_id).eq("shopkeeper_id", shop_id).execute()
    if not existing.data:
        return jsonify({"status": "error", "message": "Request not found"}), 404
    supabase.table("credit_requests").delete().eq("id", request_id).execute()
    return jsonify({"status": "cancelled"})


@app.route("/summary", methods=["GET"])
@require_login
def summary():
    shop_id = session["shopkeeper_id"]
    customers = supabase.table("customers").select("id, due_amount").eq("shopkeeper_id", shop_id).execute().data
    total_due = sum(float(c["due_amount"]) for c in customers)
    customers_with_due = sum(1 for c in customers if float(c["due_amount"]) > 0)
    customer_ids = [c["id"] for c in customers]

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    collected_today = 0
    if customer_ids:
        today_payments = (
            supabase.table("transactions")
            .select("amount")
            .eq("type", "payment")
            .in_("customer_id", customer_ids)
            .gte("created_at", today_start)
            .execute()
            .data
        )
        collected_today = sum(float(t["amount"]) for t in today_payments)

    return jsonify({
        "total_due": total_due,
        "customers_with_due": customers_with_due,
        "collected_today": collected_today,
    })


@app.route("/shop/growth-stats", methods=["GET"])
@require_login
def shop_growth_stats():
    """Monthly totals for the last 6 months — total credit extended
    (purchases) and total collected (payments), the two halves of
    'business growth' for a credit-ledger shop."""
    shop_id = session["shopkeeper_id"]
    customers = supabase.table("customers").select("id").eq("shopkeeper_id", shop_id).execute().data
    customer_ids = [c["id"] for c in customers]

    months = []
    now = datetime.now(timezone.utc)
    for i in range(5, -1, -1):
        # Step back i months from the current month, safely across year boundaries
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append((year, month))

    results = []
    if customer_ids:
        all_txns = (
            supabase.table("transactions")
            .select("type, amount, created_at")
            .in_("customer_id", customer_ids)
            .execute()
            .data
        )
    else:
        all_txns = []

    for year, month in months:
        month_label = datetime(year, month, 1).strftime("%b")
        purchases_total = 0.0
        payments_total = 0.0
        for t in all_txns:
            t_date = datetime.fromisoformat(t["created_at"].replace("Z", "+00:00"))
            if t_date.year == year and t_date.month == month:
                if t["type"] == "purchase":
                    purchases_total += float(t["amount"])
                else:
                    payments_total += float(t["amount"])
        results.append({
            "month": month_label,
            "credit_extended": round(purchases_total, 2),
            "collected": round(payments_total, 2),
        })

    return jsonify(results)


@app.route("/shop/due-vs-clear", methods=["GET"])
@require_login
def shop_due_vs_clear():
    shop_id = session["shopkeeper_id"]
    customers = supabase.table("customers").select("due_amount").eq("shopkeeper_id", shop_id).execute().data
    with_due = sum(1 for c in customers if float(c["due_amount"]) > 0)
    clear = sum(1 for c in customers if float(c["due_amount"]) <= 0)
    return jsonify({"with_due": with_due, "clear": clear})


# ============================================================
# Complaints — customer feedback about the shop, a product, staff, or
# anything else.
# ============================================================

VALID_COMPLAINT_CATEGORIES = {"shop", "product", "staff", "other"}


@app.route("/customer-portal/complaints", methods=["POST"])
def submit_complaint():
    body = request.get_json()
    customer_id = body.get("customer_id")
    shopkeeper_id = body.get("shopkeeper_id")
    category = (body.get("category") or "other").strip().lower()
    message = (body.get("message") or "").strip()

    if not shopkeeper_id:
        return jsonify({"status": "error", "message": "Missing shop"}), 400
    if category not in VALID_COMPLAINT_CATEGORIES:
        category = "other"
    if not message or len(message) < 3:
        return jsonify({"status": "error", "message": "Please write a message before submitting."}), 400
    if len(message) > 1000:
        return jsonify({"status": "error", "message": "That's too long — please keep it under 1000 characters."}), 400

    customer_name = "Anonymous"
    if customer_id:
        customer_result = supabase.table("customers").select("name").eq("id", customer_id).eq("shopkeeper_id", shopkeeper_id).execute()
        if customer_result.data:
            customer_name = customer_result.data[0]["name"]

    supabase.table("complaints").insert({
        "customer_id": customer_id,
        "shopkeeper_id": shopkeeper_id,
        "customer_name": customer_name,
        "category": category,
        "message": message,
    }).execute()

    return jsonify({"status": "submitted"})


@app.route("/shop/complaints", methods=["GET"])
@require_login
def list_complaints():
    shop_id = session["shopkeeper_id"]
    result = (
        supabase.table("complaints")
        .select("*")
        .eq("shopkeeper_id", shop_id)
        .order("created_at", desc=True)
        .limit(200)
        .execute()
    )
    return jsonify(result.data)


@app.route("/shop/complaints/<complaint_id>", methods=["DELETE"])
@require_login
def delete_complaint(complaint_id):
    shop_id = session["shopkeeper_id"]
    existing = supabase.table("complaints").select("id").eq("id", complaint_id).eq("shopkeeper_id", shop_id).execute()
    if not existing.data:
        return jsonify({"status": "error", "message": "Complaint not found"}), 404
    supabase.table("complaints").delete().eq("id", complaint_id).execute()
    return jsonify({"status": "deleted"})


# ============================================================
# Contact Us — reaches the app operator directly, no login needed.
# ============================================================

VALID_CONTACT_ROLES = {"shop_owner", "customer"}

CONTACT_CATEGORIES = {
    "shop_owner": {"payment_setup", "login", "register", "forgot_both", "other"},
    "customer": {"login", "payment", "account_security", "other"},
}


def build_whatsapp_link(name, phone, role, category, description):
    """Returns a wa.me link pre-filled with the submission, or None if
    the operator's WhatsApp number isn't configured."""
    whatsapp_number = os.environ.get("CONTACT_WHATSAPP_NUMBER")
    if not whatsapp_number:
        return None

    role_label = "Shop Owner" if role == "shop_owner" else "Customer"
    message = (
        f"New Khata contact — {role_label}\n"
        f"Name: {name}\n"
        f"Phone: {phone}\n"
        f"Category: {category}\n\n"
        f"Message: {description}"
    )
    return f"https://wa.me/{whatsapp_number}?text={urllib.parse.quote(message)}"


@app.route("/contact-us", methods=["POST"])
def contact_us():
    body = request.get_json()
    name = (body.get("name") or "").strip()
    phone = (body.get("phone") or "").strip()
    role = (body.get("role") or "").strip()
    category = (body.get("category") or "").strip()
    description = (body.get("description") or "").strip()

    if not name or not phone:
        return jsonify({"status": "error", "message": "Name and phone number are required."}), 400
    if role not in VALID_CONTACT_ROLES:
        return jsonify({"status": "error", "message": "Please choose Shop Owner or Customer."}), 400
    if category not in CONTACT_CATEGORIES[role]:
        return jsonify({"status": "error", "message": "Please choose what this is about."}), 400
    if not description or len(description) < 3:
        return jsonify({"status": "error", "message": "Please describe the problem."}), 400
    if len(description) > 2000:
        return jsonify({"status": "error", "message": "That's too long — please keep it under 2000 characters."}), 400

    whatsapp_link = build_whatsapp_link(name, phone, role, category, description)

    supabase.table("contact_submissions").insert({
        "name": name,
        "phone": phone,
        "role": role,
        "category": category,
        "description": description,
        "email_sent": False,
    }).execute()

    return jsonify({"status": "submitted", "whatsapp_link": whatsapp_link})


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=debug_mode, host="0.0.0.0", port=port)