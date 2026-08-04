"""Bankroll-ruin and Pearl-income simulation (decisions 0005, 0009, 0010).

Models a player's Shell bankroll day by day: task income in, wagering
through the seven-game mix, house edge out. Tracks busts, handle, and
Pearl income under the theo formula, per player profile x betting
archetype.

Targets (decision 0010): ~50/~20 basic crates per week (dedicated/casual),
comeback floor ~35 min bets, classic edge split.
"""

import random
from statistics import mean, median

# ---- candidate constants (proposal — become currency-model.md on approval)
MIN_BET = 10

# task faucet, Shells/day on an active day (login+streak avg, first bet,
# 3 dailies, weekly share). Committed plays 7 days, casual 4.
INCOME = {"committed": 500, "casual": 350}
ACTIVE_DAYS = {"committed": 7, "casual": 4}
BETS_PER_DAY = {"committed": 80, "casual": 45}

# lottery house-match subsidy (decision 0014), EV-smoothed net income:
# committed maxes tickets (3/day, 10/wk), casual buys ~1/day + 5/wk.
# net = spend * 0.5 (pot pays 1.5x sales back, caps in currency-model.md)
LOTTERY_DAILY_NET = {"committed": 75, "casual": 25}
LOTTERY_WEEKLY_NET = {"committed": 250, "casual": 125}

# visitor tips received (decision 0016): 10 Shells/tip, cap 50/day.
# Deliberately a garnish — tips correlate with popularity, so a large
# tip faucet widens the committed/casual gap rather than lifting both.
TIPS_DAILY = {"committed": 25, "casual": 8}

# game mix (share of bets), edge, representative decimal odds
GAMES = [  # (name, weight, edge, odds)
    ("races",     0.40, 0.100, 5.0),
    ("instant",   0.30, 0.030, 2.0),
    ("roulette",  0.20, 0.027, 2.0),
    ("blackjack", 0.10, 0.015, 2.0),
]

# Pearl formula: per bet  A*stake*edge, plus on win  B*stake*edge*odds
PEARL_A = 0.75
PEARL_B = 0.30

BASIC_CRATE_PRICE = 80  # Pearls, blended: gear 70 / skin 90 at an even mix

# betting archetypes: stake as fraction of current bankroll
ARCHETYPES = {"cautious": 0.02, "typical": 0.05, "aggressive": 0.10, "all-in": 1.00}

WEEKS = 26
TRIALS = 12000  # //100 runs per archetype; raised for run-to-run stability


def simulate(profile, frac):
    income, days, bpd = INCOME[profile], ACTIVE_DAYS[profile], BETS_PER_DAY[profile]
    bank = 0.0
    busts = handle = theo = pearls = 0.0
    for day in range(WEEKS * 7):
        if day % 7 == 0:
            bank += LOTTERY_WEEKLY_NET[profile]
        if day % 7 >= days:
            continue
        bank += income + LOTTERY_DAILY_NET[profile] + TIPS_DAILY[profile]
        for _ in range(bpd):
            if bank < MIN_BET:
                busts += 1
                break
            stake = min(bank, max(MIN_BET, frac * bank))
            r, acc = random.random(), 0.0
            for _, w, edge, odds in GAMES:
                acc += w
                if r <= acc:
                    break
            bank -= stake
            handle += stake
            theo += stake * edge
            pearls += PEARL_A * stake * edge
            if random.random() < (1 - edge) / odds:
                bank += stake * odds
                pearls += PEARL_B * stake * edge * odds
    return busts / WEEKS, handle / WEEKS, theo / WEEKS, pearls / WEEKS


if __name__ == "__main__":
    for profile in INCOME:
        print(f"\n== {profile} (income {INCOME[profile]}/day x {ACTIVE_DAYS[profile]} days) ==")
        weekly_faucet = (INCOME[profile] + LOTTERY_DAILY_NET[profile]
                         + TIPS_DAILY[profile]) * ACTIVE_DAYS[profile] \
            + LOTTERY_WEEKLY_NET[profile]
        for name, frac in ARCHETYPES.items():
            runs = [simulate(profile, frac) for _ in range(TRIALS // 100)]
            busts = mean(r[0] for r in runs)
            handle = mean(r[1] for r in runs)
            theo = mean(r[2] for r in runs)
            pearls = mean(r[3] for r in runs)
            crates = pearls / BASIC_CRATE_PRICE
            print(f"  {name:10s} busts/wk {busts:5.2f}  handle/wk {handle:9.0f}  "
                  f"pearls/wk {pearls:7.0f}  basic crates/wk {crates:5.1f}  "
                  f"destruction {theo / weekly_faucet:4.2f}")
