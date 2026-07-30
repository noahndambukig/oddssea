"""How long does a six-piece set take? Coupon-collector with a distinct-pull guarantee."""
import random, statistics

COMMITTED_PER_DAY = 425.0
CASUAL_PER_DAY = 1400 / 7
SET_CRATE_PRICE = 900
DUST_ASSIST = 0.8  # dust salvage shortens the duplicate tail by ~20%


def crates_to_complete(distinct_guarantee=4, pieces=6, trials=40000):
    totals = []
    for _ in range(trials):
        have, n = set(), 0
        while len(have) < pieces:
            n += 1
            if len(have) < distinct_guarantee:
                have.add(random.choice([i for i in range(pieces) if i not in have]))
            else:
                have.add(random.randrange(pieces))
        totals.append(n)
    return statistics.mean(totals)


if __name__ == "__main__":
    for guarantee in (0, 4):
        raw = crates_to_complete(guarantee)
        adj = raw * DUST_ASSIST
        cost = adj * SET_CRATE_PRICE
        print(f"distinct guarantee={guarantee}: {raw:.1f} raw, {adj:.1f} with dust, {cost:.0f} coins")
        print(f"    committed {cost/COMMITTED_PER_DAY:.0f} days | casual {cost/CASUAL_PER_DAY:.0f} days")
