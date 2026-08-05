"""Crate-economy simulation under the 0009/0010 rules.

Answers: time to first Legendary, how often the 200-crate pity fires,
Legendaries per year, distinct-Legendary collection pace, and six-piece
set completion (first-four-distinct, duplicate tail, salvage credit,
rotation buyout at 1.5x).

Crate pace comes from bankroll.py output (~52/~21 basic crates per week).
"""

import random
from statistics import mean, median, quantiles

# Fixed seed: the results-of-record table in README.md must be reproducible.
# Unseeded, re-running moved committed crates/week by +/-4%, which is larger
# than most real changes -- so 're-run before changing a number' could not
# tell a change from noise. Vary this only for deliberate sensitivity runs.
SEED = 20260805
random.seed(SEED)

# ---- candidate constants (proposal)
BASIC_RATES = [("common", 0.67), ("rare", 0.25), ("epic", 0.07), ("legendary", 0.01)]
BASIC_PITY = 200
PREMIUM_RATES = [("common", 0.35), ("rare", 0.40), ("epic", 0.20), ("legendary", 0.05)]
PREMIUM_PITY = 40
BASIC_PRICE, PREMIUM_PRICE = 80, 320  # Pearls (blended; gear/skin split in currency-model)

# Chained from bankroll.py's typical-bettor output — not chosen independently.
# Re-run bankroll.py first and copy its crates/wk if any faucet figure moves.
CRATES_PER_WEEK = {"committed": 52, "casual": 20}
LEGENDARY_CATALOGUE = 12  # distinct Legendary items at launch

# set chase: six pieces, keystone Legendary; set crate is single-tier
SET_PRICE = 100
SET_RATES = [("common", 0.40), ("rare", 0.34), ("epic", 0.24), ("legendary", 0.02)]
SET_PITY = 100          # keystone guarantee within a chase
SET_SHARE = 0.30        # share of pearl income a chaser routes to set crates
SALVAGE = {"common": 4, "rare": 12, "epic": 45, "legendary": 180}  # pearls per dupe
ROTATION_WEEKS = 8      # target set featured every N weeks
BUYOUT_MULT = 1.5       # direct price vs expected crate cost while featured

TRIALS = 4000


def pull(rates):
    r, acc = random.random(), 0.0
    for tier, p in rates:
        acc += p
        if r <= acc:
            return tier
    return rates[-1][0]


def first_legendary(rate_table, pity, per_week):
    n = 0
    while True:
        n += 1
        if n >= pity or pull(rate_table) == "legendary":
            return n / per_week, n >= pity


def legendaries_per_year(per_week):
    count = 0
    since = 0
    for _ in range(int(per_week * 52)):
        since += 1
        if since >= BASIC_PITY or pull(BASIC_RATES) == "legendary":
            count += 1
            since = 0
    return count


def set_completion(pearls_per_week):
    """Weeks to own all 6 pieces of one set via set crates + salvage credit
    + rotation buyout of the last missing piece."""
    owned, credit, opened = set(), 0.0, 0
    week = 0.0
    budget = 0.0
    while len(owned) < 6:
        week += 1
        budget += pearls_per_week * SET_SHARE
        while budget >= SET_PRICE:
            budget -= SET_PRICE
            opened += 1
            if opened >= SET_PITY and 5 not in owned:
                piece = 5  # keystone via pity
            else:
                tier = pull(SET_RATES)
                piece = 5 if tier == "legendary" else random.randrange(5)
                if opened <= 4:  # first-four-distinct guarantee
                    missing = [p for p in range(5) if p not in owned]
                    if piece != 5 and missing:
                        piece = random.choice(missing)
            if piece in owned:
                credit += SALVAGE["legendary" if piece == 5 else "common"]
            else:
                owned.add(piece)
        # rotation buyout: if featured this week, buy the last missing piece
        if len(owned) == 5 and int(week) % ROTATION_WEEKS == 0:
            missing_is_keystone = 5 not in owned
            exp_cost = SET_PRICE / SET_RATES[3][1] if missing_is_keystone else SET_PRICE * 5
            price = BUYOUT_MULT * exp_cost
            if credit + budget >= price:
                budget += credit - price
                credit = 0
                owned.add(5 if missing_is_keystone else 0)
        if week > 200:
            break
    return week


if __name__ == "__main__":
    for profile, cpw in CRATES_PER_WEEK.items():
        firsts = [first_legendary(BASIC_RATES, BASIC_PITY, cpw) for _ in range(TRIALS)]
        weeks = [f[0] for f in firsts]
        pity_rate = mean(f[1] for f in firsts)
        legs = mean(legendaries_per_year(cpw) for _ in range(200))
        q = quantiles(weeks, n=10)
        print(f"\n== {profile} ({cpw} basic crates/wk) ==")
        print(f"  first Legendary: median {sorted(weeks)[len(weeks)//2]:.1f} wk, "
              f"p90 {q[8]:.1f} wk | pity fires {pity_rate*100:.1f}% | ~{legs:.0f} Legendaries/yr")
    # Also chained from bankroll.py's typical-bettor Pearl income.
    for profile, pearls in {"committed": 4150, "casual": 1563}.items():
        comps = [set_completion(pearls) for _ in range(400)]
        print(f"\n  {profile} set chase ({SET_SHARE:.0%} of ~{pearls} pearls/wk): "
              f"median {median(comps):.0f} wk, p90 {quantiles(comps, n=10)[8]:.0f} wk")
