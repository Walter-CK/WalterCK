"""
scrape_roster.py

Logs into myRestaurant (McDonald's Australia employee portal) via Microsoft
SSO, pulls the roster page, parses shifts, and writes roster.json.

Run manually first with HEADLESS = False so you can watch it and fix
selectors if McDonald's/Microsoft change their login page layout.
"""

import json
import os
import re
import sys
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
from dotenv import load_dotenv

# ---------- config ----------

load_dotenv()  # reads .env in this folder

ARCHID_USERNAME = os.getenv("MYJOB_USERNAME")   # e.g. eu399737@crew.mcd.com
PASSWORD = os.getenv("MYJOB_PASSWORD")

if not ARCHID_USERNAME or not PASSWORD:
    print("ERROR: MYJOB_USERNAME / MYJOB_PASSWORD not set in .env")
    sys.exit(1)

HOME_URL = "https://myrestaurant.mcdonalds.com.au/EmployeeSS/Home"
# Confirmed working roster URL from your DevTools capture.
# NOTE: the trailing number (766857) looked like an internal record ID.
# If this ever 404s/errors, it likely needs to be re-derived by clicking
# "My Roster" fresh and checking the URL again — see FALLBACK note below.
ROSTER_URL = "https://myrestaurant.mcdonalds.com.au/EmployeeSS/MyRoster/Index/766857"

OUTPUT_PATH = Path(__file__).parent / "roster.json"
SCREENSHOT_ON_ERROR = Path(__file__).parent / "error_screenshot.png"
HTML_ON_ERROR = Path(__file__).parent / "error_page.html"

HEADLESS = True  # set False while debugging to watch the browser
NAV_TIMEOUT_MS = 30000

# Brisbane, no DST
TZ_BRISBANE = timezone(timedelta(hours=10))


def log(msg: str):
    ts = datetime.now(TZ_BRISBANE).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")


def dump_debug(page, label: str):
    """Save a screenshot + HTML snapshot when something goes wrong."""
    try:
        page.screenshot(path=str(SCREENSHOT_ON_ERROR))
        HTML_ON_ERROR.write_text(page.content(), encoding="utf-8")
        log(f"Saved debug screenshot/html after failure at: {label}")
    except Exception as e:
        log(f"Could not save debug info: {e}")


def login(page):
    log("Navigating to myRestaurant home (first hit reliably errors)...")
    page.goto(HOME_URL, timeout=NAV_TIMEOUT_MS)

    # First hit always lands on the generic ASP.NET error page. The site's
    # own "Home" button on that page navigates to root and actually works
    # (this is normal, expected behaviour -- confirmed manually).
    try:
        page.wait_for_selector('button:has-text("Home")', timeout=8000)
        log("Hit expected error page, clicking Home button...")
        page.click('button:has-text("Home")')
    except PWTimeout:
        log("No error page shown this time, continuing directly.")

    # Step 1: archID username-only screen.
    log("Waiting for archID sign-in page...")
    try:
        page.wait_for_selector('input[type="email"], input[name="loginfmt"]', timeout=NAV_TIMEOUT_MS)
    except PWTimeout:
        log(f"Did not find archID login field. Current URL: {page.url}")
        log(f"Page title: {page.title()}")
        raise

    log("Entering archID username...")
    page.fill('input[type="email"], input[name="loginfmt"]', ARCHID_USERNAME)
    page.click('input[type="submit"], #idSIButton9, button:has-text("Next")')
    page.wait_for_timeout(1500)

    # Catch "We couldn't find an account with that username" before wasting
    # time waiting for a page that will never appear correctly.
    error_locator = page.locator("text=We couldn't find an account")
    if error_locator.count() > 0:
        raise RuntimeError(
            f"archID rejected username '{ARCHID_USERNAME}' -- "
            "check MYJOB_USERNAME in .env is correct."
        )

    # A "Country and Language" modal can appear over the role picker and
    # blocks all clicks until dismissed. It defaults to "Other" / blank,
    # which filters the Crew role option out of the picker entirely --
    # must be set explicitly.
    try:
        page.wait_for_selector('text=Country and Language', timeout=5000)
        log("Setting Country/Language to Australia/English...")
        selects = page.locator('select')
        selects.nth(0).select_option(label="Australia")
        page.wait_for_timeout(300)
        selects.nth(1).select_option(label="English")
        page.wait_for_timeout(300)
        page.click('button:has-text("Save")')
        page.wait_for_timeout(1000)
    except PWTimeout:
        log("No Country/Language modal shown.")
    except Exception as e:
        log(f"Could not set Country/Language dropdowns ({e}), trying Save anyway...")
        try:
            page.click('button:has-text("Save")')
            page.wait_for_timeout(1000)
        except Exception:
            pass

    # Step 2: role picker page ("Please choose your role below").
    log("Waiting for role picker page...")
    try:
        page.wait_for_selector('text=choose your role', timeout=NAV_TIMEOUT_MS)
        page.wait_for_selector('text=Crew', timeout=8000)
        log("Selecting 'Crew' role...")
        page.click('text=Crew', timeout=8000)
    except PWTimeout:
        log("No role picker / Crew option shown, continuing (may go straight to password form).")
        dump_debug(page, "role picker / Crew not found")

    # Step 3: second login form -- username (may be pre-filled) + password,
    # separate "Login" button, distinct from the archID page's "Next".
    # The page contains multiple hidden password fields (one per role
    # section) -- target the Crew-specific one explicitly.
    log("Waiting for username/password form...")
    page.wait_for_selector('#PasswordInputCrewNative', state="visible", timeout=NAV_TIMEOUT_MS)

    # Username field on this form may already be filled in -- only fill if empty.
    # NOTE: actual DOM id is "UsernameInputTxtCrewNative" (lowercase 's',
    # "...Txt..." in the middle) -- the old "UserNameInputCrewNative" guess
    # matched nothing, so this field was silently skipped and the form
    # submitted with a blank username every run.
    username_field = page.locator('#UsernameInputTxtCrewNative, input[name="Username"]').first
    try:
        if username_field.count() > 0:
            current_val = username_field.input_value()
            if current_val == "":
                username_field.fill(ARCHID_USERNAME.split("@")[0])
                log(f"Filled Crew username field with '{ARCHID_USERNAME.split('@')[0]}'")
            else:
                log(f"Crew username field already pre-filled with '{current_val}', leaving it.")
        else:
            log("WARNING: Crew username field (#UsernameInputTxtCrewNative) not found at all.")
    except Exception as e:
        log(f"Could not fill Crew username field: {e}")

    log("Entering password...")
    pw_field = page.locator('#PasswordInputCrewNative')
    pw_field.fill(PASSWORD)

    # Verify the fill actually landed in the field we think it did. Multiple
    # hidden password inputs exist on this page (one per role section) --
    # if the wrong one got the value, or a rerender wiped it, we want to
    # know NOW rather than burn 30s timing out later.
    actual_value = pw_field.input_value()
    if actual_value != PASSWORD:
        log(f"WARNING: password field value mismatch after fill "
            f"(expected len {len(PASSWORD)}, got len {len(actual_value)}). "
            "Field may be hidden/wrong/rerendered.")
        dump_debug(page, "password fill verification failed")

    log("Clicking Login...")
    page.click('button:has-text("Login")')

    # Give the click a moment to trigger navigation/rerender before we
    # start checking where we ended up.
    page.wait_for_timeout(2000)

    # Step 4: archID "Stay signed in?" prompt.
    try:
        page.wait_for_selector('text=Stay signed in', timeout=8000)
        page.click('text=Yes')
        log("Dismissed 'Stay signed in?' prompt.")
    except PWTimeout:
        log("No 'stay signed in' prompt shown, continuing.")

    # Race two outcomes: (a) real success -> URL moves to myrestaurant, or
    # (b) silent auth failure -> bounced back to the "choose your role"
    # picker with no visible error message. Enterprise SSO front-ends love
    # doing (b) instead of showing a real error, which is why the old code
    # just hung for 30s and died with a useless timeout.
    try:
        page.wait_for_url(re.compile(r"myrestaurant\.mcdonalds\.com\.au"), timeout=15000)
        log("Login complete, back on myRestaurant.")
    except PWTimeout:
        if page.locator('text=choose your role').count() > 0:
            dump_debug(page, "bounced back to role picker after Login click")
            raise RuntimeError(
                "Login submitted but got silently bounced back to the role "
                "picker page instead of navigating to myRestaurant. This "
                "means the password/username was rejected without a visible "
                "error, OR the Login button submitted a different form than "
                "the one filled. Check error_screenshot.png / error_page.html. "
                "Likely fix: re-verify MYJOB_USERNAME/PASSWORD in .env, or the "
                "Crew card's Login button isn't wired to #PasswordInputCrewNative "
                "-- inspect the actual <form> the button submits."
            )
        else:
            dump_debug(page, "unknown state after Login click")
            raise RuntimeError(
                f"Login submitted, didn't reach myRestaurant, and didn't land "
                f"back on role picker either. Current URL: {page.url}. "
                "Check error_screenshot.png / error_page.html for what page this is."
            )


def fetch_roster_html(page) -> str:
    # The old approach clicked a hamburger icon then "My Roster" in the
    # slide-out nav. That nav's actual markup uses <i class="fa fa-navicon">
    # (not "fa-bars" as previously guessed) and is present in the DOM at
    # all times -- it's just hidden/off-canvas via CSS, not rendered on
    # click. Since the roster page has a stable, known URL anyway
    # (confirmed in the nav markup: href="/EmployeeSS/MyRoster/Index/766857"),
    # skip the UI click entirely and navigate straight there. Simpler and
    # doesn't break every time McDonald's tweaks the menu icon's CSS class.
    log(f"Navigating directly to roster page: {ROSTER_URL}")
    page.goto(ROSTER_URL, timeout=NAV_TIMEOUT_MS)

    # Sanity check: did we get bounced to a session-expired / logout / error page?
    if "GlobalAuthentication/Logout" in page.url or "/User/Error" in page.url:
        raise RuntimeError(f"Redirected to logout/error page: {page.url}")

    try:
        page.wait_for_selector("text=Roster period from", timeout=15000)
    except PWTimeout:
        # ROSTER_URL's trailing ID (766857) is an internal record ID tied to
        # your account -- if it ever changes, fall back to reading the real
        # link straight out of the nav markup instead of hardcoding a new
        # number. The link is always present in the DOM, just CSS-hidden.
        log("Hardcoded ROSTER_URL didn't land on the roster page. "
            "Trying to find the real link in the nav menu instead...")
        try:
            page.goto(HOME_URL, timeout=NAV_TIMEOUT_MS)
            roster_link = page.locator('a.menu-item[href*="MyRoster"]').first
            href = roster_link.get_attribute("href")
            if not href:
                raise RuntimeError("Could not find MyRoster link in nav.")
            full_url = f"https://myrestaurant.mcdonalds.com.au{href}"
            log(f"Found roster link in nav: {full_url} -- update ROSTER_URL to this.")
            page.goto(full_url, timeout=NAV_TIMEOUT_MS)
            page.wait_for_selector("text=Roster period from", timeout=NAV_TIMEOUT_MS)
        except Exception:
            log(f"Fallback also failed. Current URL: {page.url}")
            dump_debug(page, "roster page content not found (hardcoded + fallback both failed)")
            raise

    return page.content()


# ---------- parsing ----------

DATE_RE = r"\d{1,2}/[A-Za-z]{3}/\d{4}"

# "Roster period from Monday 21/Sep/2026 to Sunday 27/Sep/2026"
WEEK_HEADER_RE = re.compile(
    r"Roster period from\s+[A-Za-z]+\s+(?P<start>" + DATE_RE + r")"
    r"\s+to\s+[A-Za-z]+\s+(?P<end>" + DATE_RE + r")"
)

SHIFT_BLOCK_RE = re.compile(
    r"(?P<dow>[A-Za-z]+)\s+(?P<date>" + DATE_RE + r")\s*"
    r"(?P<location>[A-Z][A-Za-z ]+(?:QLD|NSW|VIC|WA|SA|TAS|NT|ACT))\s*"
    r"Start\s+(?P<start>\d{1,2}:\d{2}\s*[AP]M).*?"
    r"Finish\s+(?P<finish>\d{1,2}:\d{2}\s*[AP]M).*?"
    r"(?P<hours>\d{1,2}:\d{2})hrs",
    re.DOTALL,
)


def _fmt_date(d) -> str:
    """date -> dd/mm/yy"""
    return d.strftime("%d/%m/%y")


def _fmt_time_12h(hhmm: str) -> str:
    """'HH:MM' 24h -> '3:00 PM' 12h, no leading zero."""
    t = datetime.strptime(hhmm, "%H:%M")
    out = t.strftime("%I:%M %p")
    return out.lstrip("0")


def _fmt_hours(decimal_hours: float) -> str:
    """3.25 -> '3:15' (h:mm duration, not clock time)."""
    total_minutes = round(decimal_hours * 60)
    h, m = divmod(total_minutes, 60)
    return f"{h}:{m:02d}"


def parse_shifts(html: str) -> list[dict]:
    """
    Parse shift blocks out of the roster page's visible text, grouped by
    the roster's own "Roster period from X to Y" week banners.

    The page repeats a consistent block format per shift:

        Wednesday 23/Sep/2026
        BERRINBA QLD
        Start 1:00 PM Wednesday 23/Sep/2026
        Finish 4:00 PM Wednesday 23/Sep/2026
        3:00hrs
        PI:Production Intermediate
        Intially viewed at ...

    with a week header like "Roster period from Monday 21/Sep/2026 to
    Sunday 27/Sep/2026" appearing before each block of shifts. We walk
    the text once, tracking which week header we're currently under, and
    attach shifts to that week.
    """
    # crude tag strip -> plain text, collapse whitespace
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s*\n\s*", "\n", text)

    # Merge week headers and shift blocks into one ordered stream of
    # (position, kind, match) so we know which week each shift falls under,
    # regardless of the order they appear in the raw text.
    events = []
    for m in WEEK_HEADER_RE.finditer(text):
        events.append((m.start(), "week", m))
    for m in SHIFT_BLOCK_RE.finditer(text):
        events.append((m.start(), "shift", m))
    events.sort(key=lambda e: e[0])

    weeks: dict[tuple, dict] = {}  # (start_date, end_date) -> week dict
    week_order: list[tuple] = []
    current_week_key = None

    for _, kind, m in events:
        if kind == "week":
            w_start = datetime.strptime(m.group("start"), "%d/%b/%Y").date()
            w_end = datetime.strptime(m.group("end"), "%d/%b/%Y").date()
            key = (w_start, w_end)
            if key not in weeks:
                weeks[key] = {
                    "week_start": _fmt_date(w_start),
                    "week_end": _fmt_date(w_end),
                    "shifts": [],
                }
                week_order.append(key)
            current_week_key = key
        else:  # shift
            date_str = m.group("date")
            date_obj = datetime.strptime(date_str, "%d/%b/%Y").date()

            start_str = m.group("start").replace(" ", "")
            finish_str = m.group("finish").replace(" ", "")
            start_24 = datetime.strptime(start_str, "%I:%M%p").strftime("%H:%M")
            finish_24 = datetime.strptime(finish_str, "%I:%M%p").strftime("%H:%M")

            h, mnt = m.group("hours").split(":")
            hours_decimal = int(h) + int(mnt) / 60

            shift = {
                "date": _fmt_date(date_obj),
                "start": _fmt_time_12h(start_24),
                "end": _fmt_time_12h(finish_24),
                "location": m.group("location").strip(),
                "hours": _fmt_hours(hours_decimal),
                "_sort_key": (date_obj, start_24),  # dropped before output
            }

            if current_week_key is None:
                # Shift appeared before any week header was seen (shouldn't
                # normally happen, but don't silently drop data) -- bucket
                # it under a fallback week keyed by its own date.
                fallback_key = ("unknown", date_obj)
                if fallback_key not in weeks:
                    weeks[fallback_key] = {
                        "week_start": None,
                        "week_end": None,
                        "shifts": [],
                    }
                    week_order.append(fallback_key)
                weeks[fallback_key]["shifts"].append(shift)
            else:
                weeks[current_week_key]["shifts"].append(shift)

    # de-dupe within each week (the "Today"/"Tomorrow" summary blocks can
    # overlap with the full roster listing) and sort shifts by date/time
    result = []
    for key in week_order:
        wk = weeks[key]
        seen = set()
        unique = []
        for s in wk["shifts"]:
            dedupe_key = (s["date"], s["start"], s["end"])
            if dedupe_key not in seen:
                seen.add(dedupe_key)
                unique.append(s)
        unique.sort(key=lambda s: s["_sort_key"])
        for s in unique:
            del s["_sort_key"]
        wk["shifts"] = unique
        result.append(wk)

    return result


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(NAV_TIMEOUT_MS)

        try:
            login(page)
            html = fetch_roster_html(page)
        except Exception:
            log("FAILED during login/fetch:")
            traceback.print_exc()
            dump_debug(page, "login/fetch")
            browser.close()
            sys.exit(1)

        weeks = parse_shifts(html)
        total_shifts = sum(len(w["shifts"]) for w in weeks)

        if total_shifts == 0:
            log("WARNING: parsed zero shifts. Saving debug HTML for inspection.")
            dump_debug(page, "zero shifts parsed")

        browser.close()

    output = {
        "last_updated": datetime.now(TZ_BRISBANE).isoformat(),
        "weeks": weeks,
    }

    OUTPUT_PATH.write_text(json.dumps(output, indent=2), encoding="utf-8")
    log(f"Wrote {total_shifts} shifts across {len(weeks)} week(s) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
