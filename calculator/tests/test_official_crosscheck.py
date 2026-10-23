"""Official CBAM statutory cross-check tests.

Validates the exact mathematical identities and markup schedules defined in:
1. Implementing Regulation (EU) 2025/2620, Articles 4 & 5:
   - Specific Embedded Free Allocation: SEFA = free_allocation_factor * CSCF * benchmark
   - Net Payable Specific Embedded Emissions: payable = max(0, SEE - SEFA)
2. Implementing Regulation (EU) 2025/2621, Article 5 & Annex III:
   - Default value markup schedule: 2026 = 10%, 2027 = 20%, 2028 = 30%
   - Marked-up Default SEE: default_SEE_with_markup = default_value_base * (1 + markup)
3. Regulation (EU) 2023/956, Articles 21 & 22:
   - Surrender of CBAM certificates: cost = payable_tonnes * certificate_price
"""

from __future__ import annotations

import pytest

from calculator.cbam_calculator import (
    calculate_cbam_Comparison,
    calculate_cost_eur,
    calculate_default_see_with_markup,
    calculate_payable_per_tonne,
    calculate_savings_eur,
    calculate_sefa,
    load_cbam_config,
)


def test_statutory_sefa_identity_eu_2025_2620() -> None:
    """Validate SEFA = free_allocation_factor * CSCF * benchmark per Implementing Regulation (EU) 2025/2620, Art. 4."""
    # Statutory parameters for 2026 crude steel production
    # Free allocation factor for 2026 = 0.975 (Regulation (EU) 2023/956 Annex III)
    # Cross-Sectoral Correction Factor benchmark reference = 1.000000
    # EU ETS benchmark for hot metal = 1.328000 tCO2e/t
    free_alloc = 0.975
    cscf = 1.0
    benchmark = 1.328

    expected_sefa = round(free_alloc * cscf * benchmark, 6)  # 1.294800
    computed_sefa = calculate_sefa(
        free_allocation_factor=free_alloc,
        cscf=cscf,
        benchmark=benchmark,
    )
    assert computed_sefa == 1.2948
    assert computed_sefa == expected_sefa

    # Additional boundary test: 50% free allocation phase-out
    assert calculate_sefa(0.50, 0.95, 1.20) == 0.57


def test_statutory_payable_emissions_identity_eu_2025_2620() -> None:
    """Validate payable = max(0, SEE - SEFA) per Implementing Regulation (EU) 2025/2620, Art. 5."""
    sefa = 1.2948

    # Case 1: Standard emitting facility (SEE > SEFA)
    see_higher = 1.8500
    expected_payable = round(see_higher - sefa, 6)  # 0.555200
    assert calculate_payable_per_tonne(see_higher, sefa) == expected_payable
    assert calculate_payable_per_tonne(see_higher, sefa) == 0.5552

    # Case 2: Deep-decarbonized / clean facility (SEE <= SEFA) floored strictly at zero
    see_clean = 1.1000
    assert calculate_payable_per_tonne(see_clean, sefa) == 0.0

    # Case 3: Exact match (SEE == SEFA)
    assert calculate_payable_per_tonne(sefa, sefa) == 0.0


def test_statutory_default_markup_schedule_eu_2025_2621() -> None:
    """Validate 2026/2027/2028 markup schedule (10% / 20% / 30%) per Implementing Regulation (EU) 2025/2621, Art. 5."""
    cfg = load_cbam_config()
    markups = cfg["default_markup_by_year"]

    assert markups["2026"]["value"] == 0.10
    assert markups["2027"]["value"] == 0.20
    assert markups["2028"]["value"] == 0.30

    base_default_see = 2.10

    # 2026: +10% markup -> 2.10 * 1.10 = 2.310000
    val_2026 = calculate_default_see_with_markup(base_default_see, 0.10)
    assert val_2026 == 2.31

    # 2027: +20% markup -> 2.10 * 1.20 = 2.520000
    val_2027 = calculate_default_see_with_markup(base_default_see, 0.20)
    assert val_2027 == 2.52

    # 2028: +30% markup -> 2.10 * 1.30 = 2.730000
    val_2028 = calculate_default_see_with_markup(base_default_see, 0.30)
    assert val_2028 == 2.73


def test_official_cbam_worked_example_crosscheck() -> None:
    """Full consignment cross-check combining EU 2025/2620, EU 2025/2621, and EU 2023/956 rules."""
    tonnes_shipped = 10_000.0
    verified_see = 1.85
    default_base = 2.10
    benchmark = 1.328
    free_alloc = 0.975
    cscf = 1.0
    markup_2026 = 0.10
    cert_price = 82.32  # EUR / tCO2e (2026-Q3 reference)

    res = calculate_cbam_Comparison(
        year=2026,
        tonnes_shipped=tonnes_shipped,
        verified_see=verified_see,
        default_value_base=default_base,
        benchmark=benchmark,
        free_allocation_factor=free_alloc,
        cscf=cscf,
        default_markup=markup_2026,
        certificate_price=cert_price,
    )

    # 1. SEFA: 0.975 * 1.0 * 1.328 = 1.2948
    assert res.sefa_verified == 1.2948
    assert res.sefa_default == 1.2948

    # 2. Marked up default: 2.10 * 1.10 = 2.31
    assert res.default_see_with_markup == 2.31

    # 3. Payable per tonne
    # Verified: 1.85 - 1.2948 = 0.5552
    assert res.payable_per_tonne_verified == 0.5552
    # Default: 2.31 - 1.2948 = 1.0152
    assert res.payable_per_tonne_default == 1.0152

    # 4. Total payable tonnes for 10,000 tonnes product
    assert res.total_payable_tonnes_verified == 5552.0
    assert res.total_payable_tonnes_default == 10152.0

    # 5. Financial liabilities
    # Verified cost = 5,552 * 82.32 = 457,040.64 EUR
    assert res.cost_with_verified_eur == 457040.64
    # Default cost = 10,152 * 82.32 = 835,712.64 EUR
    assert res.cost_with_default_eur == 835712.64

    # 6. VeriCEMS verified data savings
    # Avoided emissions: 1.0152 - 0.5552 = 0.46 tCO2e/t product (4,600 tCO2e avoided across 10,000 tonnes)
    assert res.savings_per_tonne_tco2e == 0.46
    assert res.total_payable_tonnes_default - res.total_payable_tonnes_verified == 4600.0
    # Financial savings: 835,712.64 - 457,040.64 = 378,672.00 EUR
    assert res.savings_eur == 378672.00
