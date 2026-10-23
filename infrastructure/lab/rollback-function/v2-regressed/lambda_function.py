"""
aicoe-lab-rollback-function - version 2, the deliberate regression.

This is the "bad deployment" the lab exists to demonstrate. The regression is a
realistic one rather than a crash for its own sake: a refactor of the totals calculation
that forgets quantity, then asserts its own invariant and raises when the invariant
fails. Every invocation therefore fails, deterministically.

Failing by raising is deliberate - it produces an Unhandled FunctionError, which is what
increments the CloudWatch Errors metric that the detector reads. A handler that returned
a 500 body would look fine to CloudWatch and the rule would never fire.

No side effects: nothing is written, fetched or read from the environment.
"""

import json

RELEASE = "v2-regressed"

BASKET = [{"sku": "A-100", "qty": 2, "unit_pence": 1250},
          {"sku": "B-220", "qty": 1, "unit_pence": 899}]


class TotalsRegressionError(RuntimeError):
    """Raised when the computed total fails its own sanity check."""


def _total_pence(basket):
    # The regression: unit price summed without quantity.
    return sum(line["unit_pence"] for line in basket)


def lambda_handler(event, context):
    total = _total_pence(BASKET)
    expected_minimum = sum(line["qty"] * line["unit_pence"] for line in BASKET)

    if total < expected_minimum:
        raise TotalsRegressionError(
            f"basket total {total}p is below the line-item minimum {expected_minimum}p - "
            "quantity was dropped from the totals calculation"
        )

    return {
        "statusCode": 200,
        "body": json.dumps({"ok": True, "release": RELEASE, "total_pence": total}),
    }
