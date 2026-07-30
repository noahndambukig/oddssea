"""Effective drop rates once pity timers are applied."""

def effective_rate(base_rate, pity):
    """Expected opens until a hit, given a guaranteed hit on the pity-th open."""
    expected, survival = 0.0, 1.0
    for k in range(1, pity):
        expected += k * survival * base_rate
        survival *= (1 - base_rate)
    expected += pity * survival
    return expected, 1 / expected


CASES = [
    ("Gear Crate, Legendary", 0.04, 50),
    ("Skin Crate, Legendary", 0.03, 50),
    ("Set Crate, Legendary", 0.06, 50),
    ("Gear Crate, Epic+", 0.15, 10),
]

if __name__ == "__main__":
    for label, rate, pity in CASES:
        opens, eff = effective_rate(rate, pity)
        print(f"{label}: base {rate:.0%}, pity {pity} -> {opens:.1f} opens, effective {eff:.2%}")
